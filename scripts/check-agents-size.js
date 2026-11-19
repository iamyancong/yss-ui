#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/** AGENTS.md 最大允许大小：32 KiB (Codex 读取上限，超过会被截断) */
const MAX_BYTES = 32 * 1024; // 32768 字节

const DEFAULT_AGENTS_PATH = path.resolve(__dirname, '..', 'AGENTS.md');

function parseArgs(args) {
  let filePath = DEFAULT_AGENTS_PATH;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && i + 1 < args.length) {
      filePath = path.resolve(args[++i]);
    }
  }
  return { filePath };
}

function checkAgentsSize(filePath = DEFAULT_AGENTS_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`AGENTS.md 文件不存在: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  const sizeKb = (size / 1024).toFixed(2);
  const maxKb = (MAX_BYTES / 1024).toFixed(0);

  if (size > MAX_BYTES) {
    const errorMsg = `AGENTS.md 超出大小限制：${sizeKb} KB (${size} 字节)，上限 ${maxKb} KB (${MAX_BYTES} 字节)。超出限制会导致 Codex 等 AI 工具截断读取，请将超出内容迁移到对应 Skill 或 docs/ 中，禁止在 AGENTS.md 中堆砌百科。`;
    return { ok: false, size, maxBytes: MAX_BYTES, error: errorMsg };
  }

  return {
    ok: true,
    size,
    maxBytes: MAX_BYTES,
    message: `AGENTS.md 大小检查通过：${sizeKb} KB / ${maxKb} KB (${size}/${MAX_BYTES} 字节)`,
  };
}

function main() {
  const { filePath } = parseArgs(process.argv.slice(2));
  try {
    const result = checkAgentsSize(filePath);
    if (!result.ok) {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }
    console.log(`✅ ${result.message}`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkAgentsSize,
  MAX_BYTES,
};
