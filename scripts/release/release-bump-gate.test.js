'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkReleaseBumpGate, matchPattern } = require('./release-bump-gate');

test('matchPattern 支持精确匹配与单星号通配', () => {
  assert.equal(matchPattern('packages/components/src/table/ActionButton.vue', 'packages/components/src/table/ActionButton.vue'), true);
  assert.equal(matchPattern('packages/hooks/src/useLoading/index.ts', 'packages/hooks/src/*/index.ts'), true);
  assert.equal(matchPattern('packages/hooks/src/useLoading/constant.ts', 'packages/hooks/src/*/index.ts'), false);
});

test('规则校验：普通 fix/docs 且契约快照无变化 → patch 通过', () => {
  const result = checkReleaseBumpGate({
    commits: [
      { message: 'fix(table): 修复边框样式对齐' },
      { message: 'docs(guide): 完善使用说明' },
    ],
    files: ['packages/components/src/table/style.less'],
    targetBump: 'patch',
    snapshotChanged: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.requiredBump, 'patch');
  assert.equal(result.overridden, false);
});

test('规则校验：包含 feat 提交 → patch 拒绝，minor 通过', () => {
  const failResult = checkReleaseBumpGate({
    commits: [
      { message: 'feat(table): 新增列分组折叠功能' },
      { message: 'fix(table): 修复排序错位' },
    ],
    targetBump: 'patch',
  });
  assert.equal(failResult.ok, false);
  assert.equal(failResult.requiredBump, 'minor');

  const passResult = checkReleaseBumpGate({
    commits: [
      { message: 'feat(table): 新增列分组折叠功能' },
    ],
    targetBump: 'minor',
  });
  assert.equal(passResult.ok, true);
  assert.equal(passResult.requiredBump, 'minor');
});

test('规则校验：包含 fix! 或 BREAKING CHANGE → minor 拒绝，major 通过', () => {
  const failResult = checkReleaseBumpGate({
    commits: [
      { message: 'fix(table)!: 重构表格事件参数结构' },
    ],
    targetBump: 'minor',
    isZeroMajor: false,
  });
  assert.equal(failResult.ok, false);
  assert.equal(failResult.requiredBump, 'major');

  const passResult = checkReleaseBumpGate({
    commits: [
      { message: 'fix(table)!: 重构表格事件参数结构' },
    ],
    targetBump: 'major',
    isZeroMajor: false,
  });
  assert.equal(passResult.ok, true);
  assert.equal(passResult.requiredBump, 'major');

  // 0.x 宽松模式下降为 minor
  const zeroMajorResult = checkReleaseBumpGate({
    commits: [
      { message: 'fix(table)!: 重构表格事件参数结构' },
    ],
    targetBump: 'minor',
    isZeroMajor: true,
  });
  assert.equal(zeroMajorResult.ok, true);
  assert.equal(zeroMajorResult.requiredBump, 'minor');
});

test('规则校验：命中敏感行为文件（即使快照无变化） → 要求至少 minor', () => {
  const failResult = checkReleaseBumpGate({
    commits: [{ message: 'fix(table): 调整 ActionButton 行为' }],
    files: ['packages/components/src/table/ActionButton.vue'],
    targetBump: 'patch',
    snapshotChanged: false,
  });
  assert.equal(failResult.ok, false);
  assert.equal(failResult.requiredBump, 'minor');

  const passResult = checkReleaseBumpGate({
    commits: [{ message: 'fix(table): 调整 ActionButton 行为' }],
    files: ['packages/components/src/table/ActionButton.vue'],
    targetBump: 'minor',
    snapshotChanged: false,
  });
  assert.equal(passResult.ok, true);
});

test('规则校验：改动行为契约测试文件 → 视为行为变化，要求至少 minor', () => {
  const result = checkReleaseBumpGate({
    commits: [{ message: 'test(table): 更新 ActionButton 契约测试用例' }],
    files: ['packages/components/src/table/__tests__/action-button-contract.test.ts'],
    targetBump: 'patch',
    snapshotChanged: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.requiredBump, 'minor');
});

test('规则校验：提供 override_reason 时允许绕过门禁并记录原因', () => {
  const result = checkReleaseBumpGate({
    commits: [{ message: 'feat(table): 新增特性但需要紧急随 patch 发布' }],
    targetBump: 'patch',
    overrideReason: '经评审向后完全兼容，业务端有强交付依赖',
  });

  assert.equal(result.ok, true);
  assert.equal(result.requiredBump, 'minor');
  assert.equal(result.overridden, true);
  assert.equal(result.overrideReason, '经评审向后完全兼容，业务端有强交付依赖');
});

test('实战回放：9865788 提交与敏感文件变化检测（1.7.5快照未变场景） → 判定需要 ≥ minor 或填写原因', () => {
  // 9865788: fix(components): 稳定操作列行身份并在 needLoading 模式下支持异步重试 (#35)
  // 修改了 ActionButton.vue, ActionColumn.vue, actionRetry.ts 等，属于行为级改动
  // 1.7.5 当时 props 契约快照完全无变化 (snapshotChanged: false)
  const replayCommits = [
    {
      hash: '9865788a1b2c3d4e5f6',
      message: 'fix(components): 稳定操作列行身份并在 needLoading 模式下支持异步重试 (#35)',
      body: '支持在 needLoading 二次确认失败后保留弹层以供重试',
    },
  ];
  const replayFiles = [
    'packages/components/src/table/ActionButton.vue',
    'packages/components/src/table/ActionColumn.vue',
    'packages/components/src/table/utils/actionRetry.ts',
  ];

  // 1.7.5 当年以 patch 发版且快照无变化，门禁仍必须精准拦截！
  const blocked = checkReleaseBumpGate({
    commits: replayCommits,
    files: replayFiles,
    targetBump: 'patch',
    snapshotChanged: false,
  });

  assert.equal(blocked.ok, false, '当年 1.7.5 发 patch 时门禁应成功拦截！');
  assert.equal(blocked.requiredBump, 'minor');
  assert.ok(blocked.reasons.some(r => r.includes('敏感行为文件')));

  // 当带上 overrideReason 时被记录放行
  const overridden = checkReleaseBumpGate({
    commits: replayCommits,
    files: replayFiles,
    targetBump: 'patch',
    snapshotChanged: false,
    overrideReason: '热修复需发 patch',
  });
  assert.equal(overridden.ok, true);
  assert.equal(overridden.overridden, true);
});

test('规则校验：0.x 包破坏性变更仅要求升级 minor，1.x 包破坏性变更要求升级 major', () => {
  const breakingCommits = [
    {
      hash: 'a1b2c3d',
      message: 'feat(create)!: 重构脚手架核心配置参数',
      body: 'BREAKING CHANGE: 不再向下兼容 v0.1 参数',
    },
  ];

  // 0.x 包 (isZeroMajor: true) 发 minor -> 通过
  const zeroMajorResult = checkReleaseBumpGate({
    commits: breakingCommits,
    targetBump: 'minor',
    isZeroMajor: true,
  });
  assert.equal(zeroMajorResult.ok, true);
  assert.equal(zeroMajorResult.requiredBump, 'minor');

  // 1.x 包 (isZeroMajor: false) 发 minor -> 拦截，要求 major
  const oneMajorResult = checkReleaseBumpGate({
    commits: breakingCommits,
    targetBump: 'minor',
    isZeroMajor: false,
  });
  assert.equal(oneMajorResult.ok, false);
  assert.equal(oneMajorResult.requiredBump, 'major');
});

