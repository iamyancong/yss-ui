'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PACKAGES,
  detectChangedPackages,
  isMcpRuntimeChange,
  hashIndexContent,
  orderReleaseKeys,
  refineMcpPublish,
  ensureDerivedMcpPublish,
  ensureDerivedCreatePublish,
  syncCreateAliasPackage,
  syncCreateAliasReleasePlan,
  validateMcpIndex,
  hasChangelogVersion,
  getLatestChangelogVersion,
  resolveFirstReleaseAction,
  ensureMcpIndexChangelog,
} = require('./release-packages');

/**
 * @param {string[]} files
 * @returns {string[]}
 */
const keys = files => detectChangedPackages(files).sort();

assert.ok(PACKAGES.mcp.extraInputs.includes('docs/components/'));
assert.equal(PACKAGES.mcp.indexHashFile, 'packages/mcp/index.hash');
assert.deepEqual(orderReleaseKeys(['mcp', 'components', 'skills', 'components']), ['components', 'skills', 'mcp']);
assert.deepEqual(orderReleaseKeys(['mcp', 'create', 'components']), ['components', 'create', 'mcp']);
assert.deepEqual(orderReleaseKeys(['mcp', 'unknown']), ['mcp', 'unknown']);

assert.deepEqual(keys(['packages/create/src/cli.mjs']), ['create', 'create-yss-app']);
assert.deepEqual(keys(['packages/create-yss-app/index.mjs']), ['create-yss-app']);

assert.deepEqual(keys(['docs/components/table.md']), ['mcp']);
assert.deepEqual(keys(['docs/components/demos/table/x.vue']), ['mcp']);
assert.deepEqual(keys(['docs/hooks/use-table-height.md']), ['mcp']);
assert.deepEqual(keys(['docs/utils/download.md']), ['mcp']);
assert.deepEqual(keys(['.dumirc.ts']), ['mcp']);
assert.deepEqual(keys(['.cursorrules']), ['mcp']);

assert.deepEqual(keys(['docs/guide/mcp.md']), []);
assert.deepEqual(keys(['docs/changelog/components.md']), []);
assert.deepEqual(keys(['docs/skills/commit-linting.md']), []);
assert.deepEqual(keys(['docs/audits/component-demo-skill-api-audit.md']), []);
assert.deepEqual(keys(['.dumi/theme/slots/Features/components/FallbackWorkbench.tsx']), []);

const skillHits = keys(['packages/skills/foo/SKILL.md']);
assert.deepEqual(skillHits, ['mcp', 'skills']);

const componentHits = keys(['packages/components/src/table/index.vue']);
assert.ok(componentHits.includes('components'));
assert.ok(!componentHits.includes('mcp'));

assert.equal(isMcpRuntimeChange(['packages/mcp/lib/store.js']), true);
assert.equal(isMcpRuntimeChange(['packages/mcp/bin/yss-mcp.js']), true);
assert.equal(isMcpRuntimeChange(['packages/mcp/index.hash']), false);
assert.equal(isMcpRuntimeChange(['docs/components/table.md']), false);

const indexA = { generatedAt: '2026-01-01T00:00:00.000Z', componentsVersion: '1.5.15', entries: [{ id: 'table' }] };
const indexB = { generatedAt: '2026-08-17T00:00:00.000Z', componentsVersion: '1.5.15', entries: [{ id: 'table' }] };
assert.equal(hashIndexContent(indexA), hashIndexContent(indexB));
assert.notEqual(hashIndexContent(indexA), hashIndexContent({ ...indexA, entries: [{ id: 'button' }] }));

assert.deepEqual(
  refineMcpPublish(['mcp'], ['docs/components/table.md'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  []
);

assert.deepEqual(
  refineMcpPublish(['mcp', 'skills'], ['docs/components/table.md'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  ['skills']
);

assert.deepEqual(
  refineMcpPublish(['mcp', 'components'], ['docs/components/table.md'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  ['mcp', 'components']
);

assert.deepEqual(
  refineMcpPublish(['mcp'], ['docs/components/table.md'], {
    computeIndexHash: () => 'new-hash',
    storedHash: null,
  }),
  ['mcp']
);

assert.deepEqual(
  refineMcpPublish(['mcp'], ['docs/components/table.md'], {
    computeIndexHash: () => 'new-hash',
    storedHash: 'old-hash',
  }),
  ['mcp']
);

assert.deepEqual(
  refineMcpPublish(['mcp'], ['packages/mcp/lib/store.js'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  ['mcp']
);

assert.deepEqual(
  refineMcpPublish(['components', 'mcp'], ['packages/components/src/table/index.vue'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  ['components', 'mcp']
);

assert.deepEqual(ensureDerivedMcpPublish(['components']), ['components', 'mcp']);
assert.deepEqual(ensureDerivedMcpPublish(['components', 'mcp']), ['components', 'mcp']);
assert.deepEqual(ensureDerivedMcpPublish(['skills']), ['skills']);

// 模拟 #28：仅修改 packages/components/**，经 refine + ensureDerived + order 链后必须包含 components 和 mcp
const simulatedFiles = ['packages/components/src/table/index.vue', 'docs/changelog/components.md'];
const initialChanged = detectChangedPackages(simulatedFiles);
assert.deepEqual(initialChanged, ['components']);
const refined = refineMcpPublish(initialChanged, simulatedFiles);
const derived = ensureDerivedMcpPublish(refined);
const finalOrder = orderReleaseKeys(derived);
assert.deepEqual(finalOrder, ['components', 'mcp']);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-mcp-changelog-'));
const changelogPath = path.join(tmpDir, 'mcp.md');
fs.writeFileSync(
  changelogPath,
  ['# MCP 文档服务更新日志', '', '---', '', '## v0.1.1', '', '`2026-08-13`', ''].join('\n'),
  'utf8'
);

assert.equal(hasChangelogVersion(changelogPath, '0.1.2'), false);
assert.equal(ensureMcpIndexChangelog(changelogPath, '0.1.2', { dryRun: true, date: '2026-08-17' }), true);
assert.equal(hasChangelogVersion(changelogPath, '0.1.2'), false);
assert.equal(ensureMcpIndexChangelog(changelogPath, '0.1.2', { date: '2026-08-17' }), true);
assert.equal(hasChangelogVersion(changelogPath, '0.1.2'), true);
assert.equal(ensureMcpIndexChangelog(changelogPath, '0.1.2', { date: '2026-08-17' }), false);
const written = fs.readFileSync(changelogPath, 'utf8');
assert.match(written, /## v0\.1\.2[\s\S]*索引同步[\s\S]*## v0\.1\.1/);

const validIndexPath = path.join(tmpDir, 'index.json');
const componentsPackagePath = path.join(tmpDir, 'components-package.json');
fs.writeFileSync(
  componentsPackagePath,
  JSON.stringify({ version: '1.7.0', peerDependencies: { vite: '^5.4.10 || ^6.0.0' } })
);
fs.writeFileSync(
  validIndexPath,
  JSON.stringify({
    componentsVersion: '1.7.0',
    consumptionContract: {
      componentsVersion: '1.7.0',
      plugin: { vitePeer: '^5.4.10 || ^6.0.0' },
      peerDependencies: { vite: '^5.4.10 || ^6.0.0' },
    },
  })
);
assert.equal(validateMcpIndex({ indexPath: validIndexPath, componentsPackagePath }).componentsVersion, '1.7.0');
fs.writeFileSync(
  validIndexPath,
  JSON.stringify({
    componentsVersion: '1.6.7',
    consumptionContract: { componentsVersion: '1.6.7', plugin: { vitePeer: '^5.4.10 || ^6.0.0' } },
  })
);
assert.throws(() => validateMcpIndex({ indexPath: validIndexPath, componentsPackagePath }), /MCP 索引版本未对齐组件包/);

// 新包首发：registry 不存在 → 按当前版本首发；仅当前版本已发布且无新日志 → 跳过；老包始终 bump
assert.equal(getLatestChangelogVersion(changelogPath), '0.1.2');
assert.equal(getLatestChangelogVersion(path.join(tmpDir, 'missing.md')), null);
assert.equal(getLatestChangelogVersion(undefined), null);

assert.equal(
  resolveFirstReleaseAction({ publishedVersions: null, currentVersion: '1.0.0', latestChangelogVersion: '1.0.0' }),
  'first-release'
);
assert.equal(
  resolveFirstReleaseAction({ publishedVersions: ['1.0.0'], currentVersion: '1.0.0', latestChangelogVersion: '1.0.0' }),
  'skip'
);
assert.equal(
  resolveFirstReleaseAction({ publishedVersions: ['1.0.0'], currentVersion: '1.0.0', latestChangelogVersion: '1.0.1' }),
  'bump'
);
assert.equal(
  resolveFirstReleaseAction({
    publishedVersions: ['1.1.2', '1.1.3'],
    currentVersion: '1.1.3',
    latestChangelogVersion: '1.1.3',
  }),
  'bump'
);
assert.equal(
  resolveFirstReleaseAction({ publishedVersions: ['1.0.0'], currentVersion: '1.0.0', latestChangelogVersion: null }),
  'bump'
);
assert.equal(PACKAGES['create-yss-app'].changelog, PACKAGES.create.changelog);
assert.equal(PACKAGES['create-yss-app'].alignVersionWith, 'create');

// #52 第 4 项：仅修改 packages/create/** 时，create-yss-app 必须一起跟发并对齐版本号与依赖范围
assert.deepEqual(ensureDerivedCreatePublish(['create']), ['create', 'create-yss-app']);
assert.deepEqual(ensureDerivedCreatePublish(['create', 'create-yss-app']), ['create', 'create-yss-app']);
assert.deepEqual(ensureDerivedCreatePublish(['skills']), ['skills']);

const createOnlyFiles = ['packages/create/src/update.mjs', 'docs/changelog/create.md'];
const createChanged = orderReleaseKeys(ensureDerivedCreatePublish(detectChangedPackages(createOnlyFiles)));
assert.deepEqual(createChanged, ['create', 'create-yss-app']);

const alignedPlan = syncCreateAliasReleasePlan([
  {
    key: 'create',
    meta: PACKAGES.create,
    oldVersion: '1.3.0',
    newVersion: '1.3.1',
    pkg: { name: '@yss-ui/create', version: '1.3.0' },
  },
  {
    key: 'create-yss-app',
    meta: PACKAGES['create-yss-app'],
    oldVersion: '1.2.0',
    newVersion: '1.2.1',
    pkg: {
      name: 'create-yss-app',
      version: '1.2.0',
      dependencies: { '@yss-ui/create': '^1.2.0' },
    },
  },
]);
assert.equal(alignedPlan[1].newVersion, '1.3.1');
assert.equal(alignedPlan[1].pkg.version, '1.3.1');
assert.equal(alignedPlan[1].pkg.dependencies['@yss-ui/create'], '^1.3.1');

const workspaceAliasPkg = syncCreateAliasPackage(
  {
    name: 'create-yss-app',
    version: '1.2.0',
    dependencies: { '@yss-ui/create': 'workspace:^' },
  },
  '1.3.1'
);
assert.equal(workspaceAliasPkg.version, '1.3.1');
assert.equal(workspaceAliasPkg.dependencies['@yss-ui/create'], 'workspace:^');

fs.rmSync(tmpDir, { recursive: true, force: true });

// eslint-disable-next-line no-console
console.log('release-packages tests passed');
