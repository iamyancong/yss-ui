#!/usr/bin/env node

/**
 * 校验测试运行器隔离（Test Runner Separation Guard）。
 *
 * 核心目的：
 * 保证所有使用 Node.js 原生 test runner (node:test) 的测试文件，
 * 不会被 Vitest 的通配规则误扫执行（否则报 No test suite found in file）。
 *
 * 规则：
 * 凡包含 import/require 'node:test' 的测试文件，必须满足下列条件之一：
 * 1. 文件名包含 .node.test.（推荐命名约定，Vitest 自动通配排除）
 * 2. 位于 scripts/ 目录下（Vitest 已配置 scripts/** 整体排除）
 * 3. 位于已知且受控的历史豁免白名单中
 *
 * 用法：
 *   node scripts/check-test-runner-separation.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-docs',
  'coverage',
  '.codegraph',
  'tmp',
  '.agents',
  '.agent',
]);

const TEST_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'];

/** 历史 node:test 豁免文件（已在 vitest.config.ts 显式排除） */
const LEGACY_ALLOWLIST = new Set([
  'packages/skills-cli/lib/sync.test.js',
  'packages/mcp/lib/tools.test.js',
]);

function collectFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TEST_EXTENSIONS.includes(ext) && (entry.name.includes('.test.') || entry.name.includes('.spec.'))) {
        files.push(full);
      }
    }
  }
  return files;
}

function checkSeparation() {
  const testFiles = collectFiles(ROOT_DIR);
  const violations = [];

  for (const filePath of testFiles) {
    const relPath = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    const usesNodeTest =
      /from\s+['"]node:test['"]/.test(content) ||
      /require\s*\(\s*['"]node:test['"]\s*\)/.test(content);

    if (!usesNodeTest) continue;

    // 检查是否在安全排除范围内
    const isNamedNodeTest = filePath.includes('.node.test.');
    const isInScripts = relPath.startsWith(`scripts${path.sep}`) || relPath.startsWith('scripts/');
    const isLegacyAllowed = LEGACY_ALLOWLIST.has(relPath);

    if (!isNamedNodeTest && !isInScripts && !isLegacyAllowed) {
      violations.push(relPath);
    }
  }

  if (violations.length > 0) {
    console.error('❌ 检测到以下测试文件使用了 Node 原生 `node:test`，但未被 Vitest 隔离规则安全排除：');
    for (const file of violations) {
      console.error(`   - ${file}`);
    }
    console.error('\n💡 修复方法：');
    console.error('   请将文件重命名为 `*.node.test.*`，或者移动到 `scripts/` 目录下，');
    console.error('   避免 Vitest 误将其作为 Vitest 测试套件运行导致 CI 报错。');
    process.exit(1);
  }

  console.log(`✅ 测试运行器隔离检查通过（共扫描 ${testFiles.length} 个测试文件，未发现混用冲突）。`);
}

checkSeparation();
