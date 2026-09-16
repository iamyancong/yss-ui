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
  refineMcpPublish,
  validateMcpIndex,
  hasChangelogVersion,
  ensureMcpIndexChangelog,
} = require('./release-packages');

/**
 * @param {string[]} files
 * @returns {string[]}
 */
const keys = files => detectChangedPackages(files).sort();

assert.ok(PACKAGES.mcp.extraInputs.includes('docs/components/'));
assert.equal(PACKAGES.mcp.indexHashFile, 'packages/mcp/index.hash');

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
  refineMcpPublish(['mcp', 'components'], ['docs/components/table.md'], {
    computeIndexHash: () => 'abc',
    storedHash: 'abc',
  }),
  ['components']
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

fs.rmSync(tmpDir, { recursive: true, force: true });

// eslint-disable-next-line no-console
console.log('release-packages tests passed');
