#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/** AGENTS.md 最大允许行数 */
const MAX_LINES = 100;

const agentsPath = path.resolve(__dirname, '..', 'AGENTS.md');

if (!fs.existsSync(agentsPath)) {
  console.error('❌ AGENTS.md 不存在');
  process.exit(1);
}

const content = fs.readFileSync(agentsPath, 'utf-8');
const lineCount = content.split('\n').length;

if (lineCount > MAX_LINES) {
  console.error(
    `❌ AGENTS.md 超出行数限制：${lineCount} 行（上限 ${MAX_LINES} 行）`
  );
  console.error(
    '请将超出内容迁移到对应 Skill 或 docs/ 中，禁止在 AGENTS.md 中养百科。'
  );
  process.exit(1);
}

console.log(`✅ AGENTS.md 行数检查通过：${lineCount}/${MAX_LINES} 行`);
