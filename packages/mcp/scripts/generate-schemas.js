#!/usr/bin/env node

/**
 * 组件 JSON Schema 生成脚本。
 *
 * 使用 @vue/component-meta 对 packages/components/src 下所有组件进行 AST 解析，
 * 提取 Props（类型、默认值、必填项、JSDoc）、Emits 和 Slots，
 * 并结合组件自身 types.ts 识别核心自有属性（coreProps）与底层透传属性（inheritedProps）。
 *
 * 输出文件：packages/mcp/data/schemas.json
 */

const fs = require('fs');
const path = require('path');
const { createChecker } = require('vue-component-meta');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '../../..');

/** 组件源码目录。 */
const COMPONENTS_SRC = path.join(ROOT_DIR, 'packages/components/src');

/** TSConfig 路径。 */
const TSCONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.json');

/** 输出路径。 */
const OUTPUT_SCHEMAS_PATH = path.join(__dirname, '../data/schemas.json');

/**
 * 将 TypeScript 类型字符串转为 JSON Schema 类型标称。
 *
 * @param {string} tsType TS 类型字符串
 * @returns {string} JSON schema 基础类型
 */
function inferJsonType(tsType) {
  const cleanType = String(tsType || '')
    .replace(/\|\s*undefined/g, '')
    .trim();
  if (/^boolean$/i.test(cleanType)) return 'boolean';
  if (/^number$/i.test(cleanType)) return 'number';
  if (/^string$/i.test(cleanType) || /^"/.test(cleanType) || /^'/.test(cleanType)) return 'string';
  if (/\[\]$/.test(cleanType) || /^Array</i.test(cleanType)) return 'array';
  if (/^Function$/i.test(cleanType) || /=>/.test(cleanType)) return 'function';
  if (/^{/.test(cleanType) || /^Record</i.test(cleanType) || /Config$/i.test(cleanType) || /Props$/i.test(cleanType)) {
    return 'object';
  }
  return 'any';
}

/**
 * 提取并规范化单个组件的元数据。
 *
 * @param {object} checker component-meta checker 实例
 * @param {string} compName 组件目录名
 * @returns {object|null} 组件 schema
 */
function extractComponentSchema(checker, compName) {
  const compDir = path.join(COMPONENTS_SRC, compName);
  if (!fs.existsSync(compDir) || !fs.statSync(compDir).isDirectory()) return null;

  // 寻找入口 Vue 文件
  let vueFile = path.join(compDir, 'index.vue');
  if (!fs.existsSync(vueFile)) {
    const vueFiles = fs.readdirSync(compDir).filter(f => f.endsWith('.vue'));
    if (vueFiles.length === 0) return null;
    vueFile = path.join(compDir, vueFiles[0]);
  }

  // 读取组件自身 types.ts 中显式声明的属性名集合（作为 coreProps 判定基准）
  const typesFile = path.join(compDir, 'types.ts');
  const ownPropNames = new Set();
  if (fs.existsSync(typesFile)) {
    const content = fs.readFileSync(typesFile, 'utf8');
    // 匹配类似 "fieldName?:", "fieldName: {" 等声明
    const matches = content.matchAll(/^\s*([a-zA-Z0-9_$]+)\s*\??\s*[:{]/gm);
    for (const match of matches) {
      ownPropNames.add(match[1]);
    }
  }

  try {
    const meta = checker.getComponentMeta(vueFile);

    const propsMap = {};
    for (const prop of meta.props) {
      const cleanTsType = String(prop.type || '')
        .replace(/\s*\|\s*undefined/g, '')
        .trim();

      // 判断是否属于该组件自有的核心属性
      const isCore =
        ownPropNames.has(prop.name) ||
        ['columns', 'data', 'loading', 'size', 'border', 'pagination', 'actionConfig', 'optionsMap'].includes(
          prop.name
        );

      propsMap[prop.name] = {
        name: prop.name,
        type: inferJsonType(cleanTsType),
        tsType: cleanTsType,
        required: !prop.type.includes('undefined') && !prop.name.endsWith('?'),
        default: prop.default ? String(prop.default).trim() : undefined,
        description: prop.description || '',
        isCore,
      };
    }

    const emitsList = (meta.events || []).map(ev => ({
      name: ev.name,
      type: ev.type,
      description: ev.description || '',
    }));

    const slotsList = (meta.slots || []).map(sl => ({
      name: sl.name,
      type: sl.type,
      description: sl.description || '',
    }));

    return {
      name: compName,
      file: path.relative(ROOT_DIR, vueFile),
      propsCount: Object.keys(propsMap).length,
      props: propsMap,
      emits: emitsList,
      slots: slotsList,
    };
  } catch (err) {
    console.warn(`⚠️ 解析组件 ${compName} 失败:`, err.message);
    return null;
  }
}

/** 生成全量组件 Schema。 */
function generateSchemas() {
  console.log('🔍 开始使用 @vue/component-meta 提取组件 JSON Schema...');
  const checker = createChecker(TSCONFIG_PATH);

  const schemas = {};
  const entries = fs.readdirSync(COMPONENTS_SRC, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '__tests__' || entry.name === 'locale') {
      continue;
    }
    const schema = extractComponentSchema(checker, entry.name);
    if (schema) {
      schemas[entry.name] = schema;
      const coreCount = Object.values(schema.props).filter(p => p.isCore).length;
      console.log(
        `  -> [${entry.name}] Props: ${schema.propsCount} (核心: ${coreCount}), Emits: ${schema.emits.length}, Slots: ${schema.slots.length}`
      );
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_SCHEMAS_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_SCHEMAS_PATH, JSON.stringify(schemas, null, 2), 'utf8');

  const size = (fs.statSync(OUTPUT_SCHEMAS_PATH).size / 1024).toFixed(1);
  console.log(`✅ 已生成 ${Object.keys(schemas).length} 个组件 Schema，共 ${size} KB`);
  console.log(`   -> ${path.relative(ROOT_DIR, OUTPUT_SCHEMAS_PATH)}`);
  return schemas;
}

if (require.main === module) {
  generateSchemas();
}

module.exports = { generateSchemas };
