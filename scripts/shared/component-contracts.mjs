import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '@dumijs/vue-meta';
import ts from 'typescript';

/** 当前脚本目录。 */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录。 */
export const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');

/** 组件源码根目录。 */
export const COMPONENTS_SRC_DIR = path.join(ROOT_DIR, 'packages/components/src');

/** 组件文档根目录。 */
export const COMPONENTS_DOCS_DIR = path.join(ROOT_DIR, 'docs/components');

/**
 * 公开组件与文档页的稳定映射。
 *
 * 映射只描述“组件归属哪个文档页”，API 名称仍从源码动态抽取。
 */
export const COMPONENT_DOCS = [
  { exports: ['AuthorityDropdown'], source: 'authority/AuthorityDropdown.vue', doc: 'button.md' },
  { exports: ['YButton'], source: 'button/index.vue', doc: 'button.md' },
  { exports: ['YCard'], source: 'card/index.vue', doc: 'card.md' },
  { exports: ['YConfigProvider'], source: 'locale/config-provider/index.vue', doc: 'configProvider.md' },
  {
    exports: ['YConditionBuilder'],
    source: 'condition-builder/index.vue',
    doc: 'conditionBuilder.md',
    skipMeta: '递归条件节点类型会触发 TypeScript 栈溢出',
  },
  { exports: ['YCron'], source: 'cron/index.vue', doc: 'cron.md' },
  { exports: ['YEcharts'], source: 'echarts/index.vue', doc: 'echarts.md' },
  {
    exports: ['YEditTable'],
    source: 'edit-table/index.vue',
    doc: 'editTable.md',
    skipMeta: 'VXE 编辑表格递归类型会触发 TypeScript 栈溢出',
  },
  { exports: ['YFileImport'], source: 'file-import/index.vue', doc: 'fileImport.md' },
  { exports: ['YFormily', 'YssFormily'], source: 'formily/index.vue', doc: 'formily.md' },
  { exports: ['YMonaco'], source: 'monaco/index.vue', doc: 'monaco.md' },
  { exports: ['YMonacoDiff'], source: 'monaco/DiffEditor.vue', doc: 'monaco.md' },
  { exports: ['YMonthCalendar'], source: 'month-calendar/index.vue', doc: 'monthCalendar.md' },
  { exports: ['YSheet'], source: 'sheet/index.vue', doc: 'sheet.md' },
  { exports: ['YSplitPane'], source: 'split-pane/index.vue', doc: 'split-pane.md' },
  {
    exports: ['YTable'],
    source: 'table/index.vue',
    doc: 'table.md',
    skipMeta: 'VXE 表格递归类型会触发 TypeScript 栈溢出',
  },
  { exports: ['YTree'], source: 'tree/index.vue', doc: 'tree.md' },
];

/**
 * 递归收集目录内文件。
 *
 * @param {string} directory 起始目录
 * @param {(filePath: string) => boolean} predicate 文件过滤器
 * @returns {string[]} 文件绝对路径
 */
export function collectFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(filePath, predicate));
    } else if (entry.isFile() && predicate(filePath)) {
      result.push(filePath);
    }
  }
  return result;
}

/**
 * 提取 Vue SFC 中全部脚本内容。
 *
 * @param {string} content SFC 源码
 * @returns {string} 可交给 TypeScript 解析的脚本
 */
export function extractVueScripts(content) {
  const scripts = [];
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let match = pattern.exec(content);
  while (match) {
    scripts.push(match[1]);
    match = pattern.exec(content);
  }
  return scripts.join('\n');
}

/**
 * 读取 TS 或 Vue 文件并创建 TypeScript AST。
 *
 * @param {string} filePath 文件路径
 * @returns {{filePath: string, content: string, script: string, sourceFile: ts.SourceFile}}
 */
function createSourceUnit(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const script = filePath.endsWith('.vue') ? extractVueScripts(content) : content;
  return {
    filePath,
    content,
    script,
    sourceFile: ts.createSourceFile(filePath, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
  };
}

/**
 * 返回 AST 属性名。
 *
 * @param {ts.PropertyName | ts.BindingName | undefined} name 属性节点
 * @returns {string | undefined} 属性名
 */
function getNodeName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
  return undefined;
}

/**
 * 从对象字面量读取公开键名。
 *
 * @param {ts.ObjectLiteralExpression | undefined} objectLiteral 对象字面量
 * @returns {string[]} 键名
 */
function getObjectKeys(objectLiteral, sourceFile) {
  if (!objectLiteral) return [];
  const names = [];
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadObject = resolveObjectLiteral(property.expression, sourceFile);
      names.push(...getObjectKeys(spreadObject, sourceFile));
      continue;
    }
    const name = getNodeName(property.name);
    if (name) names.push(name);
  }
  return names;
}

/**
 * 去除 `as const`、`satisfies` 与括号包装，并解析同文件对象常量。
 *
 * @param {ts.Expression | undefined} expression 表达式
 * @param {ts.SourceFile} sourceFile TypeScript AST
 * @returns {ts.ObjectLiteralExpression | undefined} 对象字面量
 */
function resolveObjectLiteral(expression, sourceFile) {
  if (!expression) return undefined;
  if (ts.isObjectLiteralExpression(expression)) return expression;
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return resolveObjectLiteral(expression.expression, sourceFile);
  }
  if (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(expression)) {
    return resolveObjectLiteral(expression.expression, sourceFile);
  }
  if (!ts.isIdentifier(expression)) return undefined;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === expression.text) {
        return resolveObjectLiteral(declaration.initializer, sourceFile);
      }
    }
  }
  return undefined;
}

/**
 * 从 emits 调用签名中读取第一个字符串字面量参数。
 *
 * @param {ts.CallSignatureDeclaration} signature 调用签名
 * @returns {string | undefined} 事件名
 */
function getEventNameFromSignature(signature) {
  const eventParameter = signature.parameters[0];
  if (!eventParameter?.type || !ts.isLiteralTypeNode(eventParameter.type)) return undefined;
  return ts.isStringLiteral(eventParameter.type.literal) ? eventParameter.type.literal.text : undefined;
}

/**
 * 从类型成员读取属性、事件或方法名称。
 *
 * @param {ts.NodeArray<ts.TypeElement>} members 类型成员
 * @param {'props' | 'events' | 'slots' | 'exposed'} kind 契约类型
 * @returns {string[]} 名称列表
 */
function getNamesFromMembers(members, kind) {
  const names = [];
  for (const member of members) {
    if (kind === 'events' && ts.isCallSignatureDeclaration(member)) {
      const eventName = getEventNameFromSignature(member);
      if (eventName) names.push(eventName);
      continue;
    }
    if (
      ts.isPropertySignature(member) ||
      ts.isMethodSignature(member) ||
      ts.isPropertyDeclaration(member) ||
      ts.isMethodDeclaration(member)
    ) {
      const name = getNodeName(member.name);
      if (name) names.push(name);
    }
  }
  return names;
}

/**
 * 建立源码单元和类型声明索引。
 *
 * @returns {{units: Map<string, ReturnType<typeof createSourceUnit>>, declarations: Map<string, Array<{filePath: string, node: ts.Declaration}>>}}
 */
function createDeclarationIndex() {
  const files = collectFiles(COMPONENTS_SRC_DIR, filePath => /\.(?:ts|tsx|vue)$/.test(filePath));
  const units = new Map();
  const declarations = new Map();

  for (const filePath of files) {
    const unit = createSourceUnit(filePath);
    units.set(filePath, unit);
    for (const statement of unit.sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
      const name = statement.name.text;
      const values = declarations.get(name) ?? [];
      values.push({ filePath, node: statement });
      declarations.set(name, values);
    }
  }

  return { units, declarations };
}

/**
 * 将相对导入解析到组件源码文件。
 *
 * @param {string} importer 导入方文件
 * @param {string} moduleName 模块名
 * @returns {string | undefined} 解析后的文件
 */
function resolveRelativeImport(importer, moduleName) {
  if (!moduleName.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(importer), moduleName);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.vue`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.vue'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

/**
 * 找到类型引用在仓库中的声明。
 *
 * @param {string} typeName 类型名
 * @param {ReturnType<typeof createSourceUnit>} unit 当前源码单元
 * @param {Map<string, Array<{filePath: string, node: ts.Declaration}>>} declarations 声明索引
 * @returns {ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined} 类型声明
 */
function resolveTypeDeclaration(typeName, unit, declarations) {
  const candidates = declarations.get(typeName) ?? [];
  if (candidates.length === 0) return undefined;

  const local = candidates.find(candidate => candidate.filePath === unit.filePath);
  if (local) return local.node;

  for (const statement of unit.sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const imported = clause.namedBindings.elements.find(element => element.name.text === typeName);
    if (!imported) continue;
    const resolvedFile = resolveRelativeImport(unit.filePath, statement.moduleSpecifier.text);
    const importedName = imported.propertyName?.text ?? imported.name.text;
    const importedCandidates = declarations.get(importedName) ?? [];
    const matched = importedCandidates.find(candidate => candidate.filePath === resolvedFile);
    if (matched) return matched.node;
  }

  return candidates[0].node;
}

/**
 * 从字符串字面量或联合类型读取键名。
 *
 * @param {ts.TypeNode | undefined} typeNode 类型节点
 * @returns {string[]} 键名
 */
function getLiteralTypeNames(typeNode) {
  if (!typeNode) return [];
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) return [typeNode.literal.text];
  if (ts.isUnionTypeNode(typeNode)) return typeNode.types.flatMap(getLiteralTypeNames);
  return [];
}

/**
 * 读取接口继承的仓库内类型成员，并支持 Omit/Pick 工具类型。
 *
 * @param {ts.ExpressionWithTypeArguments} heritageType 接口继承类型
 * @param {'props' | 'events' | 'slots' | 'exposed'} kind 契约类型
 * @param {ReturnType<typeof createSourceUnit>} unit 当前源码单元
 * @param {Map<string, Array<{filePath: string, node: ts.Declaration}>>} declarations 声明索引
 * @param {Set<string>} visited 已访问类型
 * @returns {string[]} 契约名称
 */
function getNamesFromHeritageType(heritageType, kind, unit, declarations, visited) {
  if (!ts.isIdentifier(heritageType.expression)) return [];
  const typeName = heritageType.expression.text;
  if (typeName === 'Omit' || typeName === 'Pick') {
    const baseNames = heritageType.typeArguments?.[0]
      ? getNamesFromTypeNode(heritageType.typeArguments[0], kind, unit, declarations, visited)
      : [];
    const selectedNames = new Set(getLiteralTypeNames(heritageType.typeArguments?.[1]));
    return typeName === 'Omit'
      ? baseNames.filter(name => !selectedNames.has(name))
      : baseNames.filter(name => selectedNames.has(name));
  }
  const declaration = resolveTypeDeclaration(typeName, unit, declarations);
  if (!declaration || visited.has(typeName)) return [];
  visited.add(typeName);
  if (ts.isInterfaceDeclaration(declaration)) {
    return [
      ...getNamesFromMembers(declaration.members, kind),
      ...(declaration.heritageClauses ?? []).flatMap(clause =>
        clause.types.flatMap(type => getNamesFromHeritageType(type, kind, unit, declarations, visited))
      ),
    ];
  }
  return getNamesFromTypeNode(declaration.type, kind, unit, declarations, visited);
}

/**
 * 从类型节点读取直接声明的契约名称；不会展开第三方继承类型。
 *
 * @param {ts.TypeNode} typeNode 类型节点
 * @param {'props' | 'events' | 'slots' | 'exposed'} kind 契约类型
 * @param {ReturnType<typeof createSourceUnit>} unit 当前源码单元
 * @param {Map<string, Array<{filePath: string, node: ts.Declaration}>>} declarations 声明索引
 * @returns {string[]} 契约名称
 */
function getNamesFromTypeNode(typeNode, kind, unit, declarations, visited = new Set()) {
  if (ts.isTypeLiteralNode(typeNode)) return getNamesFromMembers(typeNode.members, kind);
  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.flatMap(node => getNamesFromTypeNode(node, kind, unit, declarations, visited));
  }
  if (!ts.isTypeReferenceNode(typeNode) || !ts.isIdentifier(typeNode.typeName)) return [];

  const typeName = typeNode.typeName.text;
  if (typeName === 'Omit' || typeName === 'Pick') {
    const baseNames = typeNode.typeArguments?.[0]
      ? getNamesFromTypeNode(typeNode.typeArguments[0], kind, unit, declarations, visited)
      : [];
    const selectedNames = new Set(getLiteralTypeNames(typeNode.typeArguments?.[1]));
    return typeName === 'Omit'
      ? baseNames.filter(name => !selectedNames.has(name))
      : baseNames.filter(name => selectedNames.has(name));
  }

  const declaration = resolveTypeDeclaration(typeName, unit, declarations);
  if (!declaration || visited.has(typeName)) return [];
  visited.add(typeName);
  if (ts.isInterfaceDeclaration(declaration)) {
    return [
      ...getNamesFromMembers(declaration.members, kind),
      ...(declaration.heritageClauses ?? []).flatMap(clause =>
        clause.types.flatMap(type => getNamesFromHeritageType(type, kind, unit, declarations, visited))
      ),
    ];
  }
  return getNamesFromTypeNode(declaration.type, kind, unit, declarations, visited);
}

/**
 * 在源码中查找指定 Vue 宏调用。
 *
 * @param {ts.SourceFile} sourceFile TypeScript AST
 * @param {string} macroName 宏名称
 * @returns {ts.CallExpression | undefined} 宏调用
 */
function findMacroCall(sourceFile, macroName) {
  let result;
  /** @param {ts.Node} node AST 节点 */
  function visit(node) {
    if (result) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === macroName) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

/**
 * 从 Vue 宏读取契约名称。
 *
 * @param {ReturnType<typeof createSourceUnit>} unit SFC 源码单元
 * @param {string} macroName 宏名称
 * @param {'props' | 'events' | 'slots' | 'exposed'} kind 契约类型
 * @param {Map<string, Array<{filePath: string, node: ts.Declaration}>>} declarations 声明索引
 * @returns {string[]} 契约名称
 */
function extractMacroNames(unit, macroName, kind, declarations) {
  const call = findMacroCall(unit.sourceFile, macroName);
  if (!call) return [];
  if (call.typeArguments?.[0]) return getNamesFromTypeNode(call.typeArguments[0], kind, unit, declarations);
  return getObjectKeys(resolveObjectLiteral(call.arguments[0], unit.sourceFile), unit.sourceFile);
}

/**
 * 从模板读取静态插槽出口。
 *
 * @param {string} content Vue SFC 源码
 * @returns {string[]} 插槽名
 */
function extractTemplateSlots(content) {
  const names = [];
  const template = content.match(/<template\b[^>]*>([\s\S]*?)<\/template>/)?.[1] ?? '';
  const slotPattern = /<slot\b([^>]*)>/g;
  let match = slotPattern.exec(template);
  while (match) {
    const name = match[1].match(/(?:^|\s)name=["']([^"']+)["']/)?.[1] ?? 'default';
    names.push(name);
    match = slotPattern.exec(template);
  }
  return names;
}

/**
 * 去重并稳定排序契约名称。
 *
 * @param {string[]} values 原始名称
 * @returns {string[]} 规范化结果
 */
function normalizeNames(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

/**
 * 创建 Vue 元数据项目。
 *
 * @returns {ReturnType<typeof createProject>} 元数据项目
 */
function createMetaProject() {
  return createProject({
    rootPath: ROOT_DIR,
    tsconfigPath: path.join(ROOT_DIR, 'tsconfig.vue.json'),
    checkerOptions: {
      disableSources: true,
      filterGlobalProps: true,
      filterExposed: false,
    },
  });
}

/**
 * 抽取全部公开组件契约。
 *
 * 元数据工具用于补充组合式 Props；发生递归类型错误时自动回退到源码 AST。
 *
 * @returns {{contracts: Array<object>, extractionErrors: Array<{component: string, message: string}>}}
 */
export function extractComponentContracts() {
  const { units, declarations } = createDeclarationIndex();
  const contracts = [];
  const extractionErrors = [];
  const project = createMetaProject();

  try {
    for (const config of COMPONENT_DOCS) {
      const sourcePath = path.join(COMPONENTS_SRC_DIR, config.source);
      const unit = units.get(sourcePath) ?? createSourceUnit(sourcePath);
      const astProps = extractMacroNames(unit, 'defineProps', 'props', declarations);
      const astEvents = extractMacroNames(unit, 'defineEmits', 'events', declarations);
      const astSlots = extractMacroNames(unit, 'defineSlots', 'slots', declarations);
      const astExposed = extractMacroNames(unit, 'defineExpose', 'exposed', declarations);
      let meta;
      let extractor = config.skipMeta ? 'ast-fallback' : 'vue-meta';

      if (config.skipMeta) {
        extractionErrors.push({ component: config.exports.join('/'), message: config.skipMeta });
      } else {
        try {
          meta = project.service.getComponentMeta(sourcePath).component;
        } catch (error) {
          extractor = 'ast-fallback';
          extractionErrors.push({ component: config.exports.join('/'), message: error.message });
        }
      }

      const metaProps = (meta?.props ?? []).map(item => item.name).filter(name => !/^on[A-Z]/.test(name));
      const props = config.includeMetaProps ? [...astProps, ...metaProps] : astProps;
      const events = astEvents.length > 0 ? astEvents : (meta?.events ?? []).map(item => item.name);
      const slots = [...astSlots, ...extractTemplateSlots(unit.content), ...(meta?.slots ?? []).map(item => item.name)];
      const propSet = new Set([...props, ...metaProps]);
      const exposed = [
        ...astExposed,
        ...(meta?.exposed ?? [])
          .map(item => item.name)
          .filter(name => name !== '$slots' && !propSet.has(name) && !/^on[A-Z]/.test(name)),
      ];

      contracts.push({
        ...config,
        sourcePath,
        docPath: path.join(COMPONENTS_DOCS_DIR, config.doc),
        extractor,
        props: normalizeNames(props),
        events: normalizeNames(events),
        slots: normalizeNames(slots),
        exposed: normalizeNames(exposed),
      });
    }
  } finally {
    project.service.close();
  }

  return { contracts, extractionErrors };
}

/**
 * 从组件总入口读取真实导出符号。
 *
 * @returns {Set<string>} 导出名称集合
 */
export function getComponentPackageExports() {
  const files = collectFiles(COMPONENTS_SRC_DIR, filePath => /\.(?:ts|tsx)$/.test(filePath));
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true,
    allowArbitraryExtensions: true,
  });
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(path.join(COMPONENTS_SRC_DIR, 'index.ts'));
  const symbol = entry ? checker.getSymbolAtLocation(entry) : undefined;
  return new Set(symbol ? checker.getExportsOfModule(symbol).map(item => item.name) : []);
}

/**
 * 从独立全量安装模块的安装数组读取公开组件标识符。
 *
 * @returns {Set<string>} 安装组件名称
 */
export function getInstalledComponentNames() {
  const entryPath = path.join(COMPONENTS_SRC_DIR, 'install.ts');
  const source = createSourceUnit(entryPath).sourceFile;
  const result = new Set();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'components') continue;
      if (!declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) continue;
      for (const element of declaration.initializer.elements) {
        if (ts.isIdentifier(element)) result.add(element.text);
      }
    }
  }
  return result;
}
