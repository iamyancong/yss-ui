'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildHomeReleases } = require('./generate-home-releases');
const { HOME_PRODUCT_HIGHLIGHTS } = require('./home-release-positioning');

/**
 * 受保护的首页长期产品定位快照。
 *
 * 这里故意与实现分开保存：常规发版若误改定位文案，pre-commit 与 CI 会立即失败。
 * 只有用户明确要求调整首页产品总体介绍时，才能同步更新本快照。
 */
const PROTECTED_HIGHLIGHTS = Object.freeze({
  components: '16 个公开组件补齐全量 API 契约，公开类型导出与文档对齐',
  skills: '30 个 skill 的触发路由评测与安全扫描并入发布门禁',
  mcp: '首发：7 个文档查询工具 + 12 个 AI 工具一键安装器',
});

test('首页产品定位文案保持受保护快照', () => {
  assert.deepEqual(HOME_PRODUCT_HIGHLIGHTS, PROTECTED_HIGHLIGHTS);
});

test('首页版本生成只更新发布元数据并保留产品定位', () => {
  const releases = buildHomeReleases();
  const actualHighlights = Object.fromEntries(releases.map(item => [item.key, item.highlight]));

  assert.deepEqual(actualHighlights, PROTECTED_HIGHLIGHTS);
  releases.forEach(item => {
    assert.match(item.version, /^v\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});
