#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const cliPath = path.join(__dirname, '../../packages/skills-cli/bin/yss-skills.js');
// 本仓库是 Skills 的唯一源码，维护时必须优先使用工作树内容，不能下载已发布旧包覆盖。
const args = ['sync', '--local', ...process.argv.slice(2)];

const result = spawnSync(process.execPath, [cliPath, ...args], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error) {
  // eslint-disable-next-line no-console
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === null || typeof result.status === 'undefined' ? 1 : result.status);
