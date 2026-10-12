#!/usr/bin/env node

/**
 * API 快照提取与一致性比对门禁。
 *
 * 覆盖：
 * 1. packages/components 下所有导出组件的 props、emits、slots、exposed（基于 vue-component-meta）
 * 2. packages/hooks 下 index.ts 导出的所有 Hooks 及类型签名（基于 TypeScript TypeChecker）
 *
 * 用法：
 * - node scripts/check-api-snapshot.mjs            校验当前快照，有差异输出 diff 并以状态码 1 退出
 * - node scripts/check-api-snapshot.mjs --update   重新生成并更新 api-snapshot 目录下的基准文件
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT_DIR, 'api-snapshot');

/**
 * 规范化类型字符串中的本地绝对路径，确保跨平台/CI 环境稳定。
 *
 * @param {string} str 输入字符串
 * @returns {string} 归一化后的字符串
 */
export function sanitizeTypeString(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/import\(".*?[\\/]packages[\\/]([^"]+)"\)/g, 'import("@yss-ui/$1")')
    .replace(/import\(".*?[\\/]node_modules[\\/](?:[^"]*?[\\/])?node_modules[\\/]([^"]+)"\)/g, 'import("$1")')
    .replace(/import\(".*?[\\/]node_modules[\\/]([^"]+)"\)/g, 'import("$1")')
    .replace(/\\/g, '/');
}

/**
 * 递归清洗对象中的类型路径，保证快照跨机器稳定。
 *
 * @param {any} val 任意值
 * @returns {any} 清洗后的值
 */
function deepSanitize(val) {
  if (typeof val === 'string') {
    return sanitizeTypeString(val);
  }
  if (Array.isArray(val)) {
    return val.map(deepSanitize);
  }
  if (val && typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = deepSanitize(v);
    }
    return res;
  }
  return val;
}

/**
 * 提取所有组件的 API 快照对象。
 *
 * @returns {Record<string, object>} 组件名到 API 元数据的映射
 */
export function extractComponentsApi() {
  const { generateSchemas } = require(path.join(ROOT_DIR, 'packages/mcp/scripts/generate-schemas.js'));
  const schemas = generateSchemas();
  const componentsApi = {};

  for (const [name, schema] of Object.entries(schemas)) {
    const cleanProps = {};
    for (const [propName, propMeta] of Object.entries(schema.props || {})) {
      cleanProps[propName] = {
        name: propMeta.name,
        type: propMeta.type,
        tsType: sanitizeTypeString(propMeta.tsType),
        required: propMeta.required,
        default: propMeta.default,
        isCore: propMeta.isCore,
      };
    }

    const cleanEmits = (schema.emits || []).map(ev => ({
      name: ev.name,
      type: sanitizeTypeString(ev.type),
    }));

    const cleanSlots = (schema.slots || []).map(sl => ({
      name: sl.name,
      type: sanitizeTypeString(sl.type),
    }));

    const cleanExposed = (schema.exposed || []).map(ex => ({
      name: ex.name,
      type: sanitizeTypeString(ex.type),
    }));

    componentsApi[name] = deepSanitize({
      name,
      propsCount: Object.keys(cleanProps).length,
      props: cleanProps,
      emits: cleanEmits,
      slots: cleanSlots,
      exposed: cleanExposed,
    });
  }

  return componentsApi;
}

/**
 * 提取 packages/hooks/src/index.ts 中导出的全部 Hooks 及函数签名。
 *
 * @returns {Record<string, {name: string, type: string}>}
 */
export function extractHooksApi() {
  const hooksEntry = path.join(ROOT_DIR, 'packages/hooks/src/index.ts');
  const program = ts.createProgram([hooksEntry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    baseUrl: ROOT_DIR,
  });
  const tc = program.getTypeChecker();
  const sf = program.getSourceFile(hooksEntry);
  if (!sf) {
    throw new Error(`无法找到 Hooks 入口文件：${hooksEntry}`);
  }

  const moduleSymbol = tc.getSymbolAtLocation(sf);
  const exports = tc.getExportsOfModule(moduleSymbol);
  const hooksApi = {};

  for (const exp of exports) {
    const type = tc.getTypeOfSymbolAtLocation(exp, sf);
    const typeStr = sanitizeTypeString(tc.typeToString(type, sf, ts.TypeFormatFlags.NoTruncation));
    hooksApi[exp.name] = {
      name: exp.name,
      type: typeStr,
    };
  }

  return deepSanitize(hooksApi);
}

/**
 * 提取全量当前 API 快照。
 *
 * @returns {{ components: Record<string, object>, hooks: Record<string, object> }}
 */
export function extractCurrentSnapshot() {
  return {
    components: extractComponentsApi(),
    hooks: extractHooksApi(),
  };
}

/**
 * 读取磁盘上已提交的基准快照。
 *
 * @returns {{ components: Record<string, object>, hooks: Record<string, object> }}
 */
export function readSavedSnapshot() {
  const components = {};
  let hooks = {};

  if (!fs.existsSync(SNAPSHOT_DIR)) {
    return { components, hooks };
  }

  const files = fs.readdirSync(SNAPSHOT_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(SNAPSHOT_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (file === 'hooks.json') {
      hooks = data;
    } else {
      const compName = file.replace(/\.json$/, '');
      components[compName] = data;
    }
  }

  return { components, hooks };
}

/**
 * 写入/更新 API 快照到磁盘。
 *
 * @param {{ components: Record<string, object>, hooks: Record<string, object> }} snapshot
 */
export function writeSnapshot(snapshot) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  for (const [name, compData] of Object.entries(snapshot.components)) {
    const filePath = path.join(SNAPSHOT_DIR, `${name}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(compData, null, 2)}\n`, 'utf8');
  }

  const hooksPath = path.join(SNAPSHOT_DIR, 'hooks.json');
  fs.writeFileSync(hooksPath, `${JSON.stringify(snapshot.hooks, null, 2)}\n`, 'utf8');
}

/**
 * 比较两个对象的结构差异，生成人类可读的差异说明。
 *
 * @param {object} saved 已存快照
 * @param {object} current 当前提取快照
 * @returns {string[]} 差异描述列表
 */
export function diffSnapshots(saved, current) {
  const diffs = [];

  // 1. 组件比较
  const allCompNames = Array.from(
    new Set([...Object.keys(saved.components || {}), ...Object.keys(current.components || {})])
  ).sort();

  for (const name of allCompNames) {
    const oldC = saved.components?.[name];
    const newC = current.components?.[name];

    if (!oldC) {
      diffs.push(`新增组件: ${name}`);
      continue;
    }
    if (!newC) {
      diffs.push(`删除组件: ${name}`);
      continue;
    }

    // props diff
    const allProps = Array.from(
      new Set([...Object.keys(oldC.props || {}), ...Object.keys(newC.props || {})])
    ).sort();
    for (const prop of allProps) {
      const oldP = oldC.props?.[prop];
      const newP = newC.props?.[prop];
      if (!oldP) {
        diffs.push(`组件 ${name} 新增 prop: ${prop}`);
      } else if (!newP) {
        diffs.push(`组件 ${name} 移除 prop: ${prop}`);
      } else {
        if (oldP.type !== newP.type || oldP.tsType !== newP.tsType) {
          diffs.push(`组件 ${name} prop "${prop}" 类型变更: ${oldP.tsType} -> ${newP.tsType}`);
        }
        if (oldP.required !== newP.required) {
          diffs.push(`组件 ${name} prop "${prop}" 必填性变更: ${oldP.required} -> ${newP.required}`);
        }
        if (oldP.default !== newP.default) {
          diffs.push(`组件 ${name} prop "${prop}" 默认值变更: ${oldP.default} -> ${newP.default}`);
        }
      }
    }

    // emits diff
    const oldEmits = new Set((oldC.emits || []).map(e => e.name));
    const newEmits = new Set((newC.emits || []).map(e => e.name));
    for (const e of newEmits) {
      if (!oldEmits.has(e)) diffs.push(`组件 ${name} 新增 emit: ${e}`);
    }
    for (const e of oldEmits) {
      if (!newEmits.has(e)) diffs.push(`组件 ${name} 移除 emit: ${e}`);
    }

    // slots diff
    const oldSlots = new Set((oldC.slots || []).map(s => s.name));
    const newSlots = new Set((newC.slots || []).map(s => s.name));
    for (const s of newSlots) {
      if (!oldSlots.has(s)) diffs.push(`组件 ${name} 新增 slot: ${s}`);
    }
    for (const s of oldSlots) {
      if (!newSlots.has(s)) diffs.push(`组件 ${name} 移除 slot: ${s}`);
    }

    // exposed diff
    const oldExposed = new Set((oldC.exposed || []).map(ex => ex.name));
    const newExposed = new Set((newC.exposed || []).map(ex => ex.name));
    for (const ex of newExposed) {
      if (!oldExposed.has(ex)) diffs.push(`组件 ${name} 新增 exposed 成员: ${ex}`);
    }
    for (const ex of oldExposed) {
      if (!newExposed.has(ex)) diffs.push(`组件 ${name} 移除 exposed 成员: ${ex}`);
    }
  }

  // 2. Hooks 比较
  const allHookNames = Array.from(
    new Set([...Object.keys(saved.hooks || {}), ...Object.keys(current.hooks || {})])
  ).sort();

  for (const name of allHookNames) {
    const oldH = saved.hooks?.[name];
    const newH = current.hooks?.[name];
    if (!oldH) {
      diffs.push(`新增 Hook/导出: ${name}`);
    } else if (!newH) {
      diffs.push(`移除 Hook/导出: ${name}`);
    } else if (oldH.type !== newH.type) {
      diffs.push(`Hook/导出 "${name}" 类型签名变更: ${oldH.type} -> ${newH.type}`);
    }
  }

  return diffs;
}

/**
 * 校验快照主逻辑。
 *
 * @param {{ update?: boolean }} [options]
 * @returns {{ ok: boolean, diffs: string[] }}
 */
export function checkApiSnapshot(options = {}) {
  const isUpdate = options.update || process.argv.includes('--update');
  const current = extractCurrentSnapshot();

  if (isUpdate) {
    writeSnapshot(current);
    console.log(`✅ 已成功更新 ${Object.keys(current.components).length} 个组件及 Hooks 的 API 快照。`);
    return { ok: true, diffs: [] };
  }

  const saved = readSavedSnapshot();
  const diffs = diffSnapshots(saved, current);

  if (diffs.length > 0) {
    console.error('❌ API 快照校验失败！检测到公开行为/类型契约变化：');
    for (const diff of diffs) {
      console.error(`  - ${diff}`);
    }
    console.error('\n如本次变更属预期，请运行: pnpm check:api-snapshot --update');
    return { ok: false, diffs };
  }

  console.log('✅ API 快照契约一致性校验通过。');
  return { ok: true, diffs: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = checkApiSnapshot();
  if (!res.ok) {
    process.exit(1);
  }
}
