#!/usr/bin/env node

/**
 * @fileoverview 将 packages/create/src/core 核心同步到 yss-create-microapp skill 脚本目录。
 * 确保两处完全一致，保证 skill 零外部依赖可独立运行。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'packages/create/src/core');
const targetDir = path.join(rootDir, 'packages/skills/yss-create-microapp/scripts/core');

async function sync() {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir);

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    const stat = await fs.stat(srcPath);

    if (stat.isFile()) {
      const content = await fs.readFile(srcPath);
      await fs.writeFile(destPath, content);
      // eslint-disable-next-line no-console
      console.log(`[sync-create-core] 同步: ${entry} -> packages/skills/yss-create-microapp/scripts/core/`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('[sync-create-core] ✅ core 模块同步完成。');
}

sync().catch(error => {
  // eslint-disable-next-line no-console
  console.error(`[sync-create-core] ❌ 同步失败: ${error.message}`);
  process.exit(1);
});
