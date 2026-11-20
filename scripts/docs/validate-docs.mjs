#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { compileTemplate, parse as parseVueSfc } from 'vue/compiler-sfc';
import llmsGenerator from './generate-llms.js';
import {
  COMPONENT_DOCS,
  COMPONENTS_DOCS_DIR,
  ROOT_DIR,
  collectFiles,
  extractComponentContracts,
  extractVueScripts,
  getComponentPackageExports,
  getInstalledComponentNames,
} from '../shared/component-contracts.mjs';

/** 需要扫描真实组件导入的目录。 */
const IMPORT_SCAN_ROOTS = [path.join(ROOT_DIR, 'docs/components'), path.join(ROOT_DIR, 'packages/skills')];

/** LLM 文档纯函数。 */
const { generateLlmsFullTxt, generateLlmsTxt } = llmsGenerator;

/** 推荐示例中禁止出现的旧用法。 */
const FORBIDDEN_CODE_PATTERNS = [
  {
    pattern: /\bYssFormily\b/,
    message: '推荐示例应使用标准名称 YFormily，YssFormily 仅用于历史兼容',
  },
  {
    pattern: /<YTable\b[^>]*(?:\brequest\s*=|\b:request\s*=|\bsearch-params\s*=|\b:search-params\s*=)/,
    message: 'YTable 不支持 request/search-params Props',
  },
  {
    pattern: /\bactionConfig\s*[:=][\s\S]{0,300}?\bactions\s*:/,
    message: 'YTable actionConfig 使用了不存在的 actions，应使用 buttons',
  },
  {
    pattern: /import\s*\{[^}]*\bFormStep\b[^}]*\}\s*from\s*['"]@formily\/antdv['"]/,
    message: '推荐示例仍直接使用 @formily/antdv FormStep',
  },
  {
    pattern: /<YTable\b[\s\S]{0,500}?(?:\b:scroll-[xy]\s*=|\bscroll-[xy]\s*=)/,
    message: '推荐示例仍使用 YTable 已废弃的 scroll-x/scroll-y',
  },
];

/** 已确认不属于公开契约的文档 API，防止无效说明回归。 */
const FORBIDDEN_DOCUMENTATION_PATTERNS = [
  {
    file: 'docs/components/table.md',
    pattern: /`toolbarTools`/,
    message: 'YTable 文档仍包含未声明的 toolbarTools Prop',
  },
];

/** 会将未知 Props 和事件透传给底层第三方组件的包装组件。 */
const PASSTHROUGH_COMPONENTS = new Set(['YButton', 'YCard', 'YEditTable', 'YTable', 'YTree']);

/** 支持按字段名、Schema 名等运行时生成插槽的组件。 */
const DYNAMIC_SLOT_COMPONENTS = new Set(['YEditTable', 'YFormily', 'YssFormily', 'YTable']);

/** Vue 指令与通用 DOM 属性，不属于组件自有 Props。 */
const COMMON_TEMPLATE_ATTRIBUTES = new Set([
  'class',
  'id',
  'is',
  'key',
  'name',
  'ref',
  'role',
  'slot',
  'style',
  'v-else',
  'v-else-if',
  'v-for',
  'v-html',
  'v-if',
  'v-on',
  'v-once',
  'v-pre',
  'v-show',
  'v-text',
]);

/** 每个公开组件文档必须具备的契约章节。 */
const REQUIRED_API_SECTIONS = [
  { label: 'Props', pattern: /^#{3,4}\s+.*Props/im },
  { label: 'Events', pattern: /^#{3,4}\s+.*(?:Events|事件)/im },
  { label: 'Slots', pattern: /^#{3,4}\s+.*(?:Slots|插槽)/im },
  { label: 'Expose', pattern: /^#{3,4}\s+.*(?:Expose|暴露方法|实例方法|Methods)/im },
  { label: 'Types', pattern: /^#{3,4}\s+.*(?:Types|类型)/im },
];

/**
 * 转义正则表达式文本。
 *
 * @param {string} value 原始文本
 * @returns {string} 转义结果
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将驼峰名称转换为模板中常用的 kebab-case。
 *
 * @param {string} value API 名称
 * @returns {string} kebab-case 名称
 */
function toKebabCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * 将 kebab-case 名称转换为 camelCase。
 *
 * @param {string} value 模板 API 名称
 * @returns {string} camelCase 名称
 */
function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

/**
 * 判断 API 名称是否已在文档中以代码或表格单元格出现。
 *
 * @param {string} content Markdown 内容
 * @param {string} apiName API 名称
 * @returns {boolean} 是否已覆盖
 */
function hasDocumentedApi(content, apiName) {
  const candidates = new Set([apiName, toKebabCase(apiName)]);
  return [...candidates].some(candidate => {
    const escaped = escapeRegExp(candidate);
    const decorated = '#?' + escaped + '(?:\\(\\))?';
    return new RegExp('(?:`' + decorated + '`|\\|\\s*`?' + decorated + '`?(?:\\s*\\/[^|]*)?\\s*\\|)').test(content);
  });
}

/**
 * 提取 Markdown 中可执行代码块。
 *
 * @param {string} content Markdown 内容
 * @returns {string[]} 代码块
 */
function extractMarkdownCodeBlocks(content) {
  const blocks = [];
  const pattern = /```(?:vue|ts|typescript|tsx|js|javascript)(?:\s*\|\s*pure)?[^\n]*\n([\s\S]*?)```/g;
  let match = pattern.exec(content);
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(content);
  }
  return blocks;
}

/**
 * 创建用于读取 import 声明的 TypeScript AST。
 *
 * @param {string} filePath 文件路径
 * @param {string} content 源码
 * @returns {ts.SourceFile} TypeScript AST
 */
function createImportSourceFile(filePath, content) {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * 校验一个源码片段中的 @yss-ui/components 具名导入。
 *
 * @param {string} filePath 来源文件
 * @param {string} content 源码片段
 * @param {Set<string>} packageExports 真实导出集合
 * @param {string[]} errors 错误容器
 */
function validateNamedImports(filePath, content, packageExports, errors) {
  const sourceFile = createImportSourceFile(filePath, content);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== '@yss-ui/components') continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (!packageExports.has(importedName)) {
        errors.push(`${path.relative(ROOT_DIR, filePath)} 导入了不存在的组件包符号: ${importedName}`);
      }
    }
  }
}

/**
 * 返回文件中的可执行源码片段。
 *
 * @param {string} filePath 文件路径
 * @returns {string[]} 源码片段
 */
function getExecutableSources(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.md')) return extractMarkdownCodeBlocks(content);
  if (filePath.endsWith('.vue')) return [extractVueScripts(content), content];
  return [content];
}

/**
 * 校验公开导出、映射和组件 API 文档覆盖。
 *
 * @param {string[]} errors 错误容器
 * @param {string[]} warnings 警告容器
 * @returns {Array<object>} 组件契约
 */
function validateComponentDocs(errors, warnings) {
  const packageExports = getComponentPackageExports();
  const mappedExports = new Set(COMPONENT_DOCS.flatMap(item => item.exports));
  const installed = getInstalledComponentNames();
  const { contracts, extractionErrors } = extractComponentContracts();

  for (const componentName of installed) {
    if (!mappedExports.has(componentName)) {
      errors.push(`公开安装组件缺少文档映射: ${componentName}`);
    }
  }
  for (const config of COMPONENT_DOCS) {
    for (const exportName of config.exports) {
      if (!packageExports.has(exportName)) errors.push(`文档映射引用了不存在的公开导出: ${exportName}`);
    }
  }

  for (const contract of contracts) {
    const document = fs.readFileSync(contract.docPath, 'utf8');
    const componentLabel = contract.exports.join('/');
    if (!document.includes('## API')) errors.push(`${contract.doc} 缺少 API 总章节`);
    for (const section of REQUIRED_API_SECTIONS) {
      if (!section.pattern.test(document)) errors.push(`${contract.doc} 缺少 ${section.label} 契约章节`);
    }
    for (const exportName of contract.exports) {
      if (!document.includes(exportName)) errors.push(`${contract.doc} 未说明公开名称 ${exportName}`);
    }
    for (const [kind, names] of Object.entries({
      Props: contract.props,
      Events: contract.events,
      Slots: contract.slots,
      Expose: contract.exposed,
    })) {
      for (const name of names) {
        if (!hasDocumentedApi(document, name)) {
          errors.push(`${contract.doc} 未记录 ${componentLabel} ${kind}: ${name}`);
        }
      }
    }
  }

  for (const extractionError of extractionErrors) {
    warnings.push(`${extractionError.component} 元数据抽取回退到 AST: ${extractionError.message}`);
  }
  return contracts;
}

/**
 * 校验 Demo 与 Skill 中的导入和禁用 API。
 *
 * @param {Set<string>} packageExports 组件包真实导出
 * @param {string[]} errors 错误容器
 */
function validateExamplesAndSkills(packageExports, errors, scanRoots = IMPORT_SCAN_ROOTS) {
  const files = scanRoots.flatMap(directory =>
    collectFiles(directory, filePath => /\.(?:vue|ts|tsx|js|jsx|md)$/.test(filePath))
  );

  for (const filePath of files) {
    const sources = getExecutableSources(filePath);
    for (const source of sources) {
      validateNamedImports(filePath, source, packageExports, errors);
      for (const rule of FORBIDDEN_CODE_PATTERNS) {
        if (rule.pattern.test(source)) errors.push(`${path.relative(ROOT_DIR, filePath)}: ${rule.message}`);
      }
    }
  }
}

/**
 * 读取静态指令参数。
 *
 * @param {object} property Vue 模板属性节点
 * @returns {string | undefined} 静态参数名称
 */
function getStaticDirectiveArgument(property) {
  return property.type === 7 && property.arg?.type === 4 && property.arg.isStatic ? property.arg.content : undefined;
}

/**
 * 从 Vue 编译器节点读取组件 Props、Events 与模板引用。
 *
 * @param {object} node Vue 模板元素节点
 * @returns {{props: Set<string>, events: Set<string>, refName?: string}} API 使用集合
 */
function extractElementApis(node) {
  const props = new Set();
  const events = new Set();
  let refName;
  for (const property of node.props ?? []) {
    if (property.type === 6) {
      if (property.name === 'ref') refName = property.value?.content;
      if (!COMMON_TEMPLATE_ATTRIBUTES.has(property.name)) props.add(toCamelCase(property.name));
      continue;
    }
    if (property.type !== 7) continue;
    const argument = getStaticDirectiveArgument(property);
    if (property.name === 'bind' && argument && !COMMON_TEMPLATE_ATTRIBUTES.has(argument)) {
      props.add(toCamelCase(argument));
    }
    if (property.name === 'on' && argument) events.add(argument);
    if (property.name === 'model') props.add(toCamelCase(argument ?? 'modelValue'));
  }
  return { props, events, refName };
}

/**
 * 返回组件节点的显式静态插槽名称。
 *
 * @param {object} node Vue 模板元素节点
 * @returns {Set<string>} 插槽名称
 */
function extractElementSlots(node) {
  const slots = new Set();
  for (const child of node.children ?? []) {
    if (child.type !== 1 || child.tag !== 'template') continue;
    for (const property of child.props ?? []) {
      if (property.type !== 7 || property.name !== 'slot') continue;
      const argument = getStaticDirectiveArgument(property);
      if (argument) slots.add(argument);
    }
  }
  return slots;
}

/**
 * 递归遍历 Vue 模板 AST 的元素节点。
 *
 * @param {object} node 当前节点
 * @param {(node: object) => void} visitor 元素访问器
 */
function walkTemplateElements(node, visitor) {
  if (node?.type === 1) visitor(node);
  for (const child of node?.children ?? []) walkTemplateElements(child, visitor);
  if (node?.branches) {
    for (const branch of node.branches) walkTemplateElements(branch, visitor);
  }
}

/**
 * 从 Vue 文件或 Markdown 示例中提取可编译模板。
 *
 * @param {string} filePath 来源文件
 * @returns {Array<{source: string, template: string}>} 模板与完整示例
 */
function getTemplateExamples(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const examples = filePath.endsWith('.md') ? extractMarkdownCodeBlocks(content) : [content];
  return examples.flatMap(source => {
    if (!source.includes('<')) return [];
    if (!source.includes('<template')) return [{ source, template: source }];
    const { descriptor } = parseVueSfc(source, { filename: filePath });
    return descriptor.template ? [{ source, template: descriptor.template.content }] : [];
  });
}

/**
 * 校验 Demo/Skill 模板使用的自有 Props、Events、Slots 与 Expose。
 *
 * @param {string} filePath 来源文件
 * @param {{source: string, template: string}} example 可执行源码与模板
 * @param {Map<string, object>} contractMap 组件契约映射
 * @param {string[]} errors 错误容器
 */
function validateSelfApiUsage(filePath, example, contractMap, errors) {
  const relativeFile = path.relative(ROOT_DIR, filePath);
  const compiled = compileTemplate({
    filename: filePath,
    id: `docs-api-${path.basename(filePath)}`,
    source: example.template,
  });
  if (!compiled.ast) return;
  walkTemplateElements(compiled.ast, node => {
    const componentName = node.tag;
    const contract = contractMap.get(componentName);
    if (!contract) return;
    const { props, events, refName } = extractElementApis(node);
    if (!PASSTHROUGH_COMPONENTS.has(componentName)) {
      for (const propName of props) {
        if (!contract.props.includes(propName)) {
          errors.push(`${relativeFile} 使用了不存在的 ${componentName} Prop: ${propName}`);
        }
      }
      for (const eventName of events) {
        const candidates = [eventName, toCamelCase(eventName), toKebabCase(eventName)];
        if (!candidates.some(name => contract.events.includes(name))) {
          errors.push(`${relativeFile} 使用了不存在的 ${componentName} Event: ${eventName}`);
        }
      }
    }
    if (!DYNAMIC_SLOT_COMPONENTS.has(componentName)) {
      for (const slotName of extractElementSlots(node)) {
        if (!contract.slots.includes(slotName)) {
          errors.push(`${relativeFile} 使用了不存在的 ${componentName} Slot: ${slotName}`);
        }
      }
    }
    if (refName) {
      const escapedRefName = escapeRegExp(refName);
      const methodPattern = new RegExp(
        '\\b' + escapedRefName + '\\s*\\.\\s*value\\s*\\?*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(',
        'g'
      );
      let methodMatch = methodPattern.exec(example.source);
      while (methodMatch) {
        if (!contract.exposed.includes(methodMatch[1])) {
          errors.push(`${relativeFile} 调用了不存在的 ${componentName} Expose: ${methodMatch[1]}()`);
        }
        methodMatch = methodPattern.exec(example.source);
      }
    }
  });
}

/**
 * 校验文档中已确认无效的 API 不会重新出现。
 *
 * @param {string[]} errors 错误容器
 */
function validateForbiddenDocumentation(errors) {
  for (const rule of FORBIDDEN_DOCUMENTATION_PATTERNS) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rule.file), 'utf8');
    if (rule.pattern.test(content)) errors.push(`${rule.file}: ${rule.message}`);
  }
}

/**
 * 解析 Demo 内的相对模块依赖。
 *
 * @param {string} importer 导入方文件
 * @param {string} request 相对模块请求
 * @returns {string | undefined} 已存在的依赖文件
 */
function resolveDemoDependency(importer, request) {
  if (!request.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(importer), request);
  const candidates = [
    base,
    ...['.vue', '.ts', '.tsx', '.js', '.jsx', '.less', '.scss', '.css'].map(extension => `${base}${extension}`),
    ...['.vue', '.ts', '.tsx', '.js', '.jsx', '.less', '.scss', '.css'].map(extension =>
      path.join(base, `index${extension}`)
    ),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/**
 * 从入口 Demo 递归收集可达的本地依赖。
 *
 * @param {Set<string>} entries Markdown 直接引用的 Demo
 * @param {string} demosDirectory Demo 根目录
 * @returns {Set<string>} 可达文件
 */
function collectReachableDemos(entries, demosDirectory) {
  const reachable = new Set();
  const pending = [...entries];
  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || reachable.has(filePath) || !filePath.startsWith(demosDirectory)) continue;
    reachable.add(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const importPatterns = [
      /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
      /@import\s+(?:url\()?\s*["']([^"']+)["']/g,
      /<style\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g,
    ];
    for (const importPattern of importPatterns) {
      let match = importPattern.exec(content);
      while (match) {
        const dependency = resolveDemoDependency(filePath, match[1]);
        if (dependency && !reachable.has(dependency)) pending.push(dependency);
        match = importPattern.exec(content);
      }
    }
  }
  return reachable;
}

/**
 * 校验已提交 LLM 产物与当前源码生成结果一致。
 *
 * @param {string[]} errors 错误容器
 */
function validateLlmsFreshness(errors) {
  const expectedFiles = [
    { file: 'public/llms.txt', content: generateLlmsTxt() },
    { file: 'public/llms-full.txt', content: generateLlmsFullTxt() },
  ];
  for (const item of expectedFiles) {
    const filePath = path.join(ROOT_DIR, item.file);
    const actual = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (actual !== item.content) errors.push(`${item.file} 不是当前文档与 Skills 的最新确定性产物`);
  }
}

/**
 * 校验组件文档引用的 Demo 文件存在，并统计未被文档直接引用的 Vue Demo。
 *
 * @param {string[]} errors 错误容器
 * @param {string[]} warnings 警告容器
 */
function validateDemoReferences(errors, warnings) {
  const markdownFiles = collectFiles(COMPONENTS_DOCS_DIR, filePath => filePath.endsWith('.md'));
  const referenced = new Set();
  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, 'utf8');
    const pattern = /<code\s+[^>]*src=["']([^"']+)["'][^>]*>/g;
    let match = pattern.exec(content);
    while (match) {
      const resolved = path.resolve(path.dirname(markdownFile), match[1]);
      if (!fs.existsSync(resolved)) {
        errors.push(`${path.relative(ROOT_DIR, markdownFile)} 引用了不存在的 Demo: ${match[1]}`);
      } else {
        referenced.add(resolved);
      }
      match = pattern.exec(content);
    }
  }

  const demosDirectory = path.join(COMPONENTS_DOCS_DIR, 'demos');
  const demoSourceFiles = collectFiles(demosDirectory, filePath =>
    /\.(?:vue|ts|tsx|js|jsx|less|scss|css)$/.test(filePath)
  );
  const reachable = collectReachableDemos(referenced, demosDirectory);
  const orphans = demoSourceFiles.filter(filePath => !reachable.has(filePath));
  if (orphans.length > 0) {
    const files = orphans.map(filePath => path.relative(ROOT_DIR, filePath)).join('、');
    warnings.push(`发现 ${orphans.length} 个不可达 Demo 源文件: ${files}`);
  }
}

/**
 * 执行文档契约校验。
 */
function main() {
  const errors = [];
  const warnings = [];
  const packageExports = getComponentPackageExports();
  const skillsOnly = process.argv.includes('--skills-only');

  if (skillsOnly) {
    const skillsDirectory = path.join(ROOT_DIR, 'packages/skills');
    validateExamplesAndSkills(packageExports, errors, [skillsDirectory]);
    const { contracts } = extractComponentContracts();
    const contractMap = new Map(contracts.flatMap(contract => contract.exports.map(name => [name, contract])));
    const skillApiFiles = collectFiles(skillsDirectory, filePath => /\.(?:vue|md)$/.test(filePath));
    for (const filePath of skillApiFiles) {
      for (const example of getTemplateExamples(filePath)) {
        validateSelfApiUsage(filePath, example, contractMap, errors);
      }
    }
    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length > 0) {
      console.error(`❌ Skills 组件 API 引用校验失败，共 ${uniqueErrors.length} 项:`);
      for (const error of uniqueErrors) console.error(`- ${error}`);
      process.exit(1);
    }
    console.log('✅ Skills 组件 API 引用校验通过。');
    return;
  }

  const contracts = validateComponentDocs(errors, warnings);
  const contractMap = new Map(contracts.flatMap(contract => contract.exports.map(name => [name, contract])));
  validateExamplesAndSkills(packageExports, errors);
  const apiFiles = IMPORT_SCAN_ROOTS.flatMap(directory =>
    collectFiles(directory, filePath => /\.(?:vue|md)$/.test(filePath))
  );
  for (const filePath of apiFiles) {
    for (const example of getTemplateExamples(filePath)) {
      validateSelfApiUsage(filePath, example, contractMap, errors);
    }
  }
  validateForbiddenDocumentation(errors);
  validateDemoReferences(errors, warnings);
  validateLlmsFreshness(errors);

  for (const warning of warnings) console.warn(`⚠️ ${warning}`);
  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length > 0) {
    console.error(`❌ 文档契约校验失败，共 ${uniqueErrors.length} 项:`);
    for (const error of uniqueErrors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`✅ 文档契约校验通过，共检查 ${contracts.length} 个公开组件实现。`);
}

main();
