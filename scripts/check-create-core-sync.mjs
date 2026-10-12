#!/usr/bin/env node

/**
 * @fileoverview 校验 packages/create/src/core 与 yss-create-microapp/scripts/core 的字节一致性。
 * 作为 CI 门禁任务，若发现文件缺失或不一致则报错退出。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'packages/create/src/core');
const targetDir = path.join(rootDir, 'packages/skills/yss-create-microapp/scripts/core');

async function checkSync() {
  let sourceEntries = [];
  try {
    sourceEntries = (await fs.readdir(sourceDir)).filter(name => !name.startsWith('.'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[check-create-core-sync] ❌ 无法读取源目录: ${sourceDir} (${error.message})`);
    process.exit(1);
  }

  let targetEntries = [];
  try {
    targetEntries = (await fs.readdir(targetDir)).filter(name => !name.startsWith('.'));
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[check-create-core-sync] ❌ 目标目录不存在: ${targetDir}。请运行 pnpm sync:create-core`);
    process.exit(1);
  }

  const allNames = Array.from(new Set([...sourceEntries, ...targetEntries])).sort();
  let hasDiff = false;

  for (const name of allNames) {
    const srcPath = path.join(sourceDir, name);
    const destPath = path.join(targetDir, name);

    let srcExists = false;
    let destExists = false;
    try {
      await fs.access(srcPath);
      srcExists = true;
    } catch {}
    try {
      await fs.access(destPath);
      destExists = true;
    } catch {}

    if (!srcExists) {
      // eslint-disable-next-line no-console
      console.error(`[check-create-core-sync] ❌ 目标存在多余文件: ${name}`);
      hasDiff = true;
      continue;
    }
    if (!destExists) {
      // eslint-disable-next-line no-console
      console.error(`[check-create-core-sync] ❌ 目标缺失文件: ${name}`);
      hasDiff = true;
      continue;
    }

    const srcBuf = await fs.readFile(srcPath);
    const destBuf = await fs.readFile(destPath);
    if (!srcBuf.equals(destBuf)) {
      // eslint-disable-next-line no-console
      console.error(`[check-create-core-sync] ❌ 内容不一致: ${name}`);
      hasDiff = true;
    }
  }

  if (hasDiff) {
    // eslint-disable-next-line no-console
    console.error('[check-create-core-sync] ❌ core 模块未同步！请运行 "pnpm sync:create-core" 进行同步。');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[check-create-core-sync] ✅ core 模块与 skill 副本完全一致。');
}

checkSync().catch(error => {
  // eslint-disable-next-line no-console
  console.error(`[check-create-core-sync] ❌ 检查异常: ${error.message}`);
  process.exit(1);
});
