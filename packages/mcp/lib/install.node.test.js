const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_DEFINITIONS } = require('./tools');
const { TARGETS, run } = require('./install');

test('install.js 正确导出 run 与 TARGETS（require 时不触发安装）', () => {
  assert.equal(typeof run, 'function', 'install.js 应导出 run 函数');
  assert.ok(Array.isArray(TARGETS), 'install.js 应导出 TARGETS 数组');
});

test('Cursor 的 verify 提示包含动态工具数量', () => {
  const cursor = TARGETS.find(target => target.id === 'cursor');
  assert.ok(cursor, 'TARGETS 中必须存在 cursor 目标');
  assert.ok(
    cursor.verify.includes(`${TOOL_DEFINITIONS.length} 个工具`),
    `Cursor 的 verify 应包含 "${TOOL_DEFINITIONS.length} 个工具"，实际: "${cursor.verify}"`
  );
});

test('所有 TARGETS 的 label 和 verify 中提及的工具数量与 TOOL_DEFINITIONS.length 一致', () => {
  const toolCountRegex = /(\d+)\s*个工具/g;
  for (const target of TARGETS) {
    const textToCheck = `${target.label || ''} ${target.verify || ''}`;
    let match;
    while ((match = toolCountRegex.exec(textToCheck)) !== null) {
      const count = Number(match[1]);
      assert.equal(
        count,
        TOOL_DEFINITIONS.length,
        `目标 "${target.id}" 文案中的工具数量 (${count}) 与 TOOL_DEFINITIONS.length (${TOOL_DEFINITIONS.length}) 不一致`
      );
    }
  }
});

test('Trae 的 label 移除实验特性描述并指引项目级 .trae/mcp.json', () => {
  const trae = TARGETS.find(target => target.id === 'trae');
  assert.ok(trae, 'TARGETS 中必须存在 trae 目标');
  assert.ok(!trae.label.includes('实验特性'), 'Trae label 不应包含「实验特性」');
  assert.ok(trae.label.includes('.trae/mcp.json'), 'Trae label 应提到 .trae/mcp.json');
});

test('TARGETS 列表中 id 唯一且数量为 12 个目标', () => {
  assert.equal(TARGETS.length, 12, 'TARGETS 数量必须为 12');
  const ids = TARGETS.map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, 12, 'TARGETS 的 id 必须唯一');
});

for (const doc of [
  { name: 'packages/mcp/README.md', path: path.resolve(__dirname, '../README.md') },
  { name: 'docs/guide/mcp.md', path: path.resolve(__dirname, '../../../docs/guide/mcp.md') },
]) {
  test(`${doc.name} 中的工具数量与 TOOL_DEFINITIONS.length 一致`, t => {
    if (!fs.existsSync(doc.path)) {
      t.skip(`跳过不存在的文档文件: ${doc.name}`);
      return;
    }
    const content = fs.readFileSync(doc.path, 'utf8');
    const toolCountRegex = /(\d+)\s*个工具/g;
    let match;
    let matched = false;
    while ((match = toolCountRegex.exec(content)) !== null) {
      matched = true;
      const count = Number(match[1]);
      assert.equal(
        count,
        TOOL_DEFINITIONS.length,
        `文件 ${doc.name} 中的工具数量 (${count}) 与 TOOL_DEFINITIONS.length (${TOOL_DEFINITIONS.length}) 不一致`
      );
    }
    assert.ok(matched, `文件 ${doc.name} 应包含「N 个工具」匹配`);
  });
}
