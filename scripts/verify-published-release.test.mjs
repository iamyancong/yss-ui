import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublishedMcpContract,
  readReleaseSummary,
  resolveExpectedComponentsVersion,
  verifyPublishedRelease,
  verifyPublishedMcpTarball,
} from './verify-published-release.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const createIndex = (componentsVersion = '1.7.1') => ({
  componentsVersion,
  consumptionContract: {
    componentsVersion,
    plugin: { vitePeer: '^5.4.10 || ^6.0.0' },
    peerDependencies: { vite: '^5.4.10 || ^6.0.0' },
  },
});

test('以本批 components 目标版本优先于 fallback', () => {
  assert.equal(
    resolveExpectedComponentsVersion(
      [
        { name: '@yss-ui/mcp', newVersion: '0.3.2' },
        { name: '@yss-ui/components', newVersion: '1.7.2' },
      ],
      '1.7.1'
    ),
    '1.7.2'
  );
  assert.equal(resolveExpectedComponentsVersion([{ name: '@yss-ui/mcp', newVersion: '0.3.2' }], '1.7.1'), '1.7.1');
});

test('发布 MCP tarball 的索引版本与 peer 契约一致时通过', () => {
  assert.doesNotThrow(() =>
    assertPublishedMcpContract({
      manifest: { name: '@yss-ui/mcp', version: '0.3.2' },
      index: createIndex(),
      mcpVersion: '0.3.2',
      expectedComponentsVersion: '1.7.1',
    })
  );
});

test('发布 MCP tarball 的索引版本漂移时失败', () => {
  assert.throws(
    () =>
      assertPublishedMcpContract({
        manifest: { name: '@yss-ui/mcp', version: '0.3.2' },
        index: createIndex('1.7.0'),
        mcpVersion: '0.3.2',
        expectedComponentsVersion: '1.7.1',
      }),
    /componentsVersion 未对齐发布目标/
  );
});

test('registry tarball 验证会在短暂不可见时重试并校验解包内容', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-published-release-test-'));
  const sourceRoot = path.join(tempRoot, 'source/package');
  const packRoot = path.join(tempRoot, 'pack');
  fs.mkdirSync(path.join(sourceRoot, 'data'), { recursive: true });
  fs.mkdirSync(packRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'package.json'), JSON.stringify({ name: '@yss-ui/mcp', version: '0.3.2' }));
  fs.writeFileSync(path.join(sourceRoot, 'data/index.json'), JSON.stringify(createIndex()));
  execFileSync('tar', ['-czf', path.join(packRoot, 'mcp.tgz'), '-C', path.dirname(sourceRoot), 'package']);

  let attempts = 0;
  const result = await verifyPublishedMcpTarball({
    mcpVersion: '0.3.2',
    expectedComponentsVersion: '1.7.1',
    retries: 2,
    delayMs: 0,
    tempParent: tempRoot,
    pack: ({ destination }) => {
      attempts += 1;
      if (attempts === 1) throw new Error('registry propagation');
      fs.copyFileSync(path.join(packRoot, 'mcp.tgz'), path.join(destination, 'mcp.tgz'));
      return path.join(destination, 'mcp.tgz');
    },
  });
  assert.equal(result.expectedComponentsVersion, '1.7.1');
  assert.equal(attempts, 2);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('发版摘要必须包含有效的 packages 列表', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-release-summary-test-'));
  const summaryPath = path.join(tempRoot, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ packages: [{ name: '@yss-ui/mcp', newVersion: '0.3.2' }] }));
  assert.deepEqual(readReleaseSummary(summaryPath), [{ name: '@yss-ui/mcp', newVersion: '0.3.2' }]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('发布 components 但未发布 MCP 时拒绝放行并抛错', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-release-summary-reject-test-'));
  const summaryPath = path.join(tempRoot, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ packages: [{ name: '@yss-ui/components', newVersion: '1.7.2' }] }));
  await assert.rejects(async () => {
    await verifyPublishedRelease({ summaryPath });
  }, /本批次发布了 @yss-ui\/components@1\.7\.2 但未发布 @yss-ui\/mcp；MCP 索引会落后，拒绝放行/);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('发布其他包（如 hooks）且未发布 MCP 时正常跳过', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-release-summary-skip-test-'));
  const summaryPath = path.join(tempRoot, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ packages: [{ name: '@yss-ui/hooks', newVersion: '1.2.0' }] }));
  const result = await verifyPublishedRelease({ summaryPath });
  assert.deepEqual(result, { skipped: true, reason: '本批次未发布 @yss-ui/mcp' });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('发版摘要缺失时跳过 MCP registry 校验', async () => {
  const result = await verifyPublishedRelease({ summaryPath: path.join(os.tmpdir(), 'missing-yss-summary.json') });
  assert.equal(result.skipped, true);
});
