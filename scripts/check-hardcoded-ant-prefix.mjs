#!/usr/bin/env node

/**
 * 校验组件样式 (.less/.vue) 与 Hook DOM 查询不得硬编码 .ant- 类名前缀。
 *
 * 背景（Issue #59）：
 * 宿主应用通过 <a-config-provider prefix-cls="custom"> 自定义 Ant Design Vue 类名前缀时，
 * 组件内部写死的 .ant-xxx 样式选择器与 querySelector('.ant-xxx') / classList.contains('ant-xxx')
 * 会全部失效。组件内部应挂载组件自有语义类名（.y-xxx / .yss-xxx）或动态解析 prefixCls。
 *
 * 用法：
 *   node scripts/check-hardcoded-ant-prefix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/** 默认扫描目录（相对仓库根目录） */
export const DEFAULT_SCAN_DIRS = ['packages/components/src', 'packages/hooks/src'];

/** 扫描的目标文件后缀 */
const TARGET_EXTENSIONS = new Set(['.less', '.css', '.vue', '.ts', '.tsx', '.js', '.mjs']);

/** 忽略的目录名 */
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__', '.git']);

/**
 * 受控豁免白名单（key 为相对仓库根目录的 POSIX 路径）
 * 如确有合理原因需保留 .ant- 选择器，必须在此登记文件路径与原因说明。
 *
 * @type {Map<string, { reason: string }>}
 */
export const ALLOWLIST = new Map([]);

/**
 * 将注释内容替换为空格（保留换行符以维持精确行号）
 *
 * @param {string} content
 * @param {string} ext
 * @returns {string}
 */
export function stripCommentsPreservingLines(content, ext) {
  let result = content;
  if (ext === '.vue') {
    result = result.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
  }
  // 块注释 /* ... */
  result = result.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
  // 行注释 // ...（排除协议头如 http:// 或 https://）
  result = result.replace(/(^|[^:\\])\/\/.*$/gm, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length));
  return result;
}

/**
 * 扫描单个文件内容中的硬编码 .ant- 选择器或 classList('ant-*') 调用
 *
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<{ line: number; column: number; match: string; lineText: string }>}
 */
export function scanContentForHardcodedAntPrefix(content, filePath) {
  const ext = path.extname(filePath);
  const stripped = stripCommentsPreservingLines(content, ext);
  const rawLines = content.split('\n');
  const strippedLines = stripped.split('\n');

  const violations = [];
  // 1. 匹配 .ant-xxx 选择器或 DOM 查询字符串（排除 ..ant- 等非选择器情况）
  const dotAntSelectorRegex = /(?<![a-zA-Z0-9_.-])\.ant-[a-zA-Z0-9_-]+/g;
  // 2. 匹配 classList.contains('ant-xxx') 等直接写死 ant- 类名的 DOM 判断
  const classListAntRegex = /\bclassList\.(?:contains|add|remove|toggle)\(\s*['"]ant-[a-zA-Z0-9_-]+['"]/g;
  // 3. 匹配 getElementsByClassName('ant-xxx')
  const getElementsByClassNameAntRegex =
    /\bgetElementsByClassName\(\s*['"][^'"]*(?<![a-zA-Z0-9_-])ant-[a-zA-Z0-9_-]+[^'"]*['"]/g;
  // 4. 匹配模板或 JSX 中硬编码 class="ant-xxx"
  const templateClassAttrAntRegex =
    /\bclass\s*=\s*["'][^"']*(?<![a-zA-Z0-9_-])ant-[a-zA-Z0-9_-]+[^"']*["']/g;
  // 5. 匹配属性选择器 [class^="ant-"]、[class*="ant-"] 等
  const attrSelectorAntRegex =
    /\[\s*class\s*[~|^$*]?=\s*['"]?[^\]'"]*(?<![a-zA-Z0-9_-])ant-[a-zA-Z0-9_-]*['"]?\s*\]/g;

  const rules = [
    dotAntSelectorRegex,
    classListAntRegex,
    getElementsByClassNameAntRegex,
    templateClassAttrAntRegex,
    attrSelectorAntRegex,
  ];

  for (let i = 0; i < strippedLines.length; i++) {
    const line = strippedLines[i];
    for (const regex of rules) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(line)) !== null) {
        violations.push({
          line: i + 1,
          column: m.index + 1,
          match: m[0],
          lineText: (rawLines[i] ?? '').trim(),
        });
      }
    }
  }

  return violations;
}

/**
 * 递归收集待检查的源码文件
 *
 * @param {string} dir
 * @returns {string[]}
 */
function collectSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!TARGET_EXTENSIONS.has(ext)) continue;
      if (
        entry.name.endsWith('.d.ts') ||
        entry.name.includes('.test.') ||
        entry.name.includes('.spec.')
      ) {
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 执行仓库级硬编码 .ant- 检查
 *
 * @param {{ rootDir?: string; scanDirs?: string[]; allowlist?: Map<string, { reason: string }> }} [options]
 * @returns {{ scannedCount: number; findings: Array<{ file: string; line: number; column: number; match: string; lineText: string }> }}
 */
export function checkHardcodedAntPrefix(options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const scanDirs = options.scanDirs ?? DEFAULT_SCAN_DIRS;
  const allowlist = options.allowlist ?? ALLOWLIST;

  const allFiles = [];
  for (const relDir of scanDirs) {
    allFiles.push(...collectSourceFiles(path.join(rootDir, relDir)));
  }

  const findings = [];
  for (const filePath of allFiles) {
    const relPath = path.relative(rootDir, filePath).split(path.sep).join('/');
    if (allowlist.has(relPath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const fileViolations = scanContentForHardcodedAntPrefix(content, filePath);
    for (const v of fileViolations) {
      findings.push({
        file: relPath,
        ...v,
      });
    }
  }

  return {
    scannedCount: allFiles.length,
    findings,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const { scannedCount, findings } = checkHardcodedAntPrefix();
  if (findings.length > 0) {
    console.error('❌ 检测到组件样式或 Hook 中存在写死的 `.ant-` 前缀选择器/DOM 查询：');
    for (const item of findings) {
      console.error(`   - ${item.file}:${item.line}:${item.column} -> ${item.match}`);
      console.error(`     ${item.lineText}`);
    }
    console.error('\n💡 修复建议：');
    console.error('   1. 请为内部节点挂载组件自有语义类名（如 .y-xxx__yyy / .yss-xxx__yyy），避免直接依赖 .ant-* 类名；');
    console.error('   2. Hook 中的 DOM 查询请通过 ConfigProvider 上下文动态获取 prefixCls；');
    console.error('   3. 如确属无法避免的特殊场景，请在 scripts/check-hardcoded-ant-prefix.mjs 的 ALLOWLIST 中登记并说明原因。');
    process.exit(1);
  }

  console.log(
    `✅ 自定义 prefixCls 门禁检查通过（共扫描 ${scannedCount} 个组件与 Hook 源码文件，0 处硬编码 .ant- 选择器，白名单 ${ALLOWLIST.size} 项）。`
  );
}
