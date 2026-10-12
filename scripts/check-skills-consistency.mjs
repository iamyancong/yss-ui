#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { getComponentPackageExports, ROOT_DIR } from './lib/component-contracts.mjs';

const SKILLS_DIR = path.join(ROOT_DIR, 'packages/skills');
const HOOKS_ENTRY = path.join(ROOT_DIR, 'packages/hooks/src/index.ts');
const UTILS_ENTRY = path.join(ROOT_DIR, 'packages/utils/src/index.ts');
const SKILLS_CONFIG_PATH = path.join(SKILLS_DIR, 'skills.config.json');

/**
 * 递归收集目录中符合后缀的文件。
 *
 * @param {string} dirPath 目录路径
 * @param {(filePath: string) => boolean} predicate 过滤函数
 * @returns {string[]} 文件绝对路径
 */
function collectFiles(dirPath, predicate) {
  const result = [];
  if (!fs.existsSync(dirPath)) return result;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

/**
 * 从 TypeScript 入口文件中递归提取所有导出的符号名称。
 *
 * @param {string} entryFile 入口文件
 * @returns {Set<string>} 导出符号集合
 */
function extractExportedNames(entryFile) {
  const exports = new Set();
  const visited = new Set();

  function visit(filePath) {
    if (visited.has(filePath) || !fs.existsSync(filePath)) return;
    visited.add(filePath);

    const dir = path.dirname(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    for (const statement of sf.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const el of statement.exportClause.elements) {
            exports.add(el.name.text);
          }
        } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          let subPath = path.resolve(dir, statement.moduleSpecifier.text);
          if (fs.existsSync(subPath + '.ts')) subPath += '.ts';
          else if (fs.existsSync(path.join(subPath, 'index.ts'))) subPath = path.join(subPath, 'index.ts');
          visit(subPath);
        }
      } else if (statement.modifiers && statement.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          exports.add(statement.name.text);
        } else if (ts.isVariableStatement(statement)) {
          for (const d of statement.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) exports.add(d.name.text);
          }
        } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
          exports.add(statement.name.text);
        } else if (ts.isInterfaceDeclaration(statement) && statement.name) {
          exports.add(statement.name.text);
        } else if (ts.isClassDeclaration(statement) && statement.name) {
          exports.add(statement.name.text);
        } else if (ts.isEnumDeclaration(statement) && statement.name) {
          exports.add(statement.name.text);
        }
      }
    }
  }

  visit(entryFile);
  return exports;
}

/**
 * 从 Markdown 中提取可执行的代码块。
 *
 * @param {string} content Markdown 内容
 * @returns {string[]} 代码块列表
 */
function extractCodeBlocks(content) {
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
 * 校验代码中的 import 导入来源及符号有效性。
 *
 * @param {string} filePath 所在文件路径
 * @param {string} code 代码块
 * @param {{ components: Set<string>, hooks: Set<string>, utils: Set<string> }} packageExports
 * @param {string[]} errors
 */
function validateCodeImports(filePath, code, packageExports, errors) {
  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  } catch (_) {
    return;
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const pkgName = statement.moduleSpecifier.text;

    if (['@formily/antdv', '@formily/antd', '@formily/antd-v3'].includes(pkgName)) {
      errors.push(`${path.relative(ROOT_DIR, filePath)} 禁止直接从 '${pkgName}' 导入`);
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const el of bindings.elements) {
      const importedName = el.propertyName?.text ?? el.name.text;
      if (pkgName === '@yss-ui/components' && !packageExports.components.has(importedName)) {
        errors.push(`${path.relative(ROOT_DIR, filePath)} 导入了 @yss-ui/components 不存在的符号: ${importedName}`);
      } else if (pkgName === '@yss-ui/hooks' && !packageExports.hooks.has(importedName)) {
        errors.push(`${path.relative(ROOT_DIR, filePath)} 导入了 @yss-ui/hooks 不存在的符号: ${importedName}`);
      } else if (pkgName === '@yss-ui/utils' && !packageExports.utils.has(importedName)) {
        errors.push(`${path.relative(ROOT_DIR, filePath)} 导入了 @yss-ui/utils 不存在的符号: ${importedName}`);
      }
    }
  }
}

/**
 * 检查代码块或 Markdown 中是否存在被禁止的 YTable 虚构属性或配置。
 *
 * @param {string} filePath 文件路径
 * @param {string} content 内容
 * @param {string[]} errors
 */
function validateYTableUsage(filePath, content, errors) {
  if (/<YTable\b[^>]*(?:\brequest\s*=|\b:request\s*=|\bsearch-params\s*=|\b:search-params\s*=)/.test(content)) {
    errors.push(`${path.relative(ROOT_DIR, filePath)} 包含 YTable 不存在的 request/search-params Props`);
  }
  if (/\bactionConfig\s*[:=][\s\S]{0,300}?\bactions\s*:/.test(content)) {
    errors.push(`${path.relative(ROOT_DIR, filePath)} 包含 YTable actionConfig 不存在的 actions 配置，应使用 buttons`);
  }
  if (/<YTable\b[\s\S]{0,500}?(?:\b:scroll-[xy]\s*=|\bscroll-[xy]\s*=)/.test(content)) {
    errors.push(`${path.relative(ROOT_DIR, filePath)} 包含 YTable 已废弃的 scroll-x/scroll-y`);
  }
}

/**
 * 检查 Markdown 中的相对文件链接是否有效。
 *
 * @param {string} filePath Markdown 路径
 * @param {string} content Markdown 内容
 * @param {string[]} errors
 */
function validateRelativeLinks(filePath, content, errors) {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let match = linkPattern.exec(content);
  while (match) {
    const rawTarget = match[1].trim();
    const target = rawTarget.split('#')[0].split('?')[0].trim();
    if (target && !/^(?:https?:)?\/\//.test(target) && !target.startsWith('mailto:') && !target.startsWith('#')) {
      const resolvedTarget = path.resolve(path.dirname(filePath), target);
      if (!fs.existsSync(resolvedTarget)) {
        errors.push(`${path.relative(ROOT_DIR, filePath)} 包含失效相对链接: ${rawTarget}`);
      }
    }
    match = linkPattern.exec(content);
  }
}

/**
 * 校验 deprecatedSkills 配置合规性。
 *
 * @param {string[]} errors
 */
function validateDeprecatedSkillsConfig(errors) {
  if (!fs.existsSync(SKILLS_CONFIG_PATH)) {
    errors.push('缺少 skills.config.json 配置文件');
    return;
  }
  const config = JSON.parse(fs.readFileSync(SKILLS_CONFIG_PATH, 'utf8'));
  const deprecated = config.deprecatedSkills || [];
  if (!deprecated.includes('page-module-development')) {
    errors.push('skills.config.json 的 deprecatedSkills 必须包含 page-module-development');
  }
  const appSkills = config.categories?.app || [];
  if (appSkills.includes('page-module-development')) {
    errors.push('skills.config.json 的 categories.app 不得再推荐已废弃的 page-module-development');
  }
}

/**
 * 加载所有组件快照中声明的合法 Props 集合。
 *
 * @returns {Map<string, { propsSet: Set<string>, rawComp: string }>}
 */
function loadComponentPropsMap() {
  const snapshotDir = path.join(ROOT_DIR, 'api-snapshot');
  if (!fs.existsSync(snapshotDir)) return new Map();

  function toPascal(str) {
    return str.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }

  const compMap = new Map();
  const compFiles = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json') && f !== 'hooks.json');
  for (const file of compFiles) {
    const compKey = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(snapshotDir, file), 'utf8'));
    const propsSet = new Set();
    for (const p of Object.keys(data.props || {})) {
      propsSet.add(p.toLowerCase());
      propsSet.add(p.replace(/-/g, '').toLowerCase());
    }
    const pascalName = 'Y' + toPascal(compKey);
    const kebabName = 'y-' + compKey;
    const entry = { propsSet, rawComp: pascalName };
    compMap.set(pascalName.toLowerCase(), entry);
    compMap.set(kebabName.toLowerCase(), entry);
    if (compKey === 'formily') {
      compMap.set('yssformily', entry);
      compMap.set('yss-formily', entry);
    }
  }
  return compMap;
}

const IGNORED_ATTRS = new Set([
  'ref',
  'key',
  'class',
  'style',
  'id',
  'v-if',
  'v-else',
  'v-else-if',
  'v-show',
  'v-for',
  'v-model',
  'v-slot',
  'v-html',
  'v-text',
  'v-loading',
  'v-memo',
  'v-once',
  'v-pre',
  'v-cloak',
]);

/**
 * 校验示例中使用的组件属性是否存在于组件 schema 快照中。
 *
 * @param {string} filePath 文件路径
 * @param {string} content 内容
 * @param {Map<string, { propsSet: Set<string>, rawComp: string }>} compMap
 * @param {string[]} errors
 */
function validateComponentProps(filePath, content, compMap, errors) {
  const tagRegex = /<([yY][a-zA-Z0-9_-]+)\b([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1];
    const attrsStr = match[2];
    const compInfo = compMap.get(tagName.toLowerCase());
    if (!compInfo) continue;

    const attrRegex = /(?:\s|^)([@:#]?[a-zA-Z0-9_.:-]+)(?:=(?:"[^"]*"|'[^']*'|[^{}\s>]+))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      const rawAttr = attrMatch[1];
      if (rawAttr.startsWith('@') || rawAttr.startsWith('v-on:') || rawAttr.startsWith('#')) continue;
      let propName = rawAttr.replace(/^:/, '');
      if (propName.startsWith('v-model:')) {
        propName = propName.replace('v-model:', '');
      }
      if (IGNORED_ATTRS.has(propName.toLowerCase()) || propName.startsWith('data-') || propName.startsWith('aria-')) {
        continue;
      }

      const norm = propName.replace(/-/g, '').toLowerCase();
      if (!compInfo.propsSet.has(norm)) {
        errors.push(
          `${path.relative(ROOT_DIR, filePath)}: 组件 <${compInfo.rawComp}> 示例使用了不存在的 Prop 属性 "${rawAttr}"`
        );
      }
    }
  }
}

function main() {
  const errors = [];
  const packageExports = {
    components: getComponentPackageExports(),
    hooks: extractExportedNames(HOOKS_ENTRY),
    utils: extractExportedNames(UTILS_ENTRY),
  };
  const compPropsMap = loadComponentPropsMap();

  validateDeprecatedSkillsConfig(errors);

  const markdownFiles = collectFiles(SKILLS_DIR, f => f.endsWith('.md'));
  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    validateRelativeLinks(filePath, content, errors);
    validateYTableUsage(filePath, content, errors);
    validateComponentProps(filePath, content, compPropsMap, errors);

    const codeBlocks = extractCodeBlocks(content);
    for (const code of codeBlocks) {
      validateCodeImports(filePath, code, packageExports, errors);
      validateYTableUsage(filePath, code, errors);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Skills 与源码一致性校验失败:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`✅ Skills 与源码一致性校验通过（检查了 ${markdownFiles.length} 个 Markdown 文件及包导出符号）。`);
}

main();
