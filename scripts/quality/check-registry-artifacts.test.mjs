import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkDependencyArtifact,
  fetchWithRetry,
  isExactVersion,
  isRetryableStatus,
  normalizeRegistry,
  parseRegistryFromNpmrc,
  resolveArtifactPlan,
  resolveTarballUrl,
} from './check-registry-artifacts.mjs';

test('仅接受精确语义化版本', () => {
  assert.equal(isExactVersion('4.19.10'), true);
  assert.equal(isExactVersion('4.19.10-beta.1'), true);
  assert.equal(isExactVersion('^4.19.10'), false);
  assert.equal(isExactVersion('~4.19.10'), false);
});

test('标准化并读取项目 Registry', () => {
  assert.equal(normalizeRegistry('http://nexus.example/npm-group///'), 'http://nexus.example/npm-group/');
  assert.equal(
    parseRegistryFromNpmrc('# comment\nregistry=http://nexus.example/npm-group/\n'),
    'http://nexus.example/npm-group/'
  );
});

test('将上游/历史源 tarball 重写为当前 Registry 地址', () => {
  assert.equal(
    resolveTarballUrl(
      'http://legacy-registry.example.org:5001/vxe-table/-/vxe-table-4.19.10.tgz',
      'http://nexus.example/repository/npm-group/'
    ),
    'http://nexus.example/repository/npm-group/vxe-table/-/vxe-table-4.19.10.tgz'
  );
  assert.equal(
    resolveTarballUrl(
      'http://nexus.example/repository/npm-group/vxe-table/-/vxe-table-4.19.10.tgz',
      'http://nexus.example/repository/npm-group/'
    ),
    'http://nexus.example/repository/npm-group/vxe-table/-/vxe-table-4.19.10.tgz'
  );
});

test('仅重试短暂性网络状态', async () => {
  assert.equal(isRetryableStatus(404), false);
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);

  let attempts = 0;
  const response = await fetchWithRetry(
    'http://nexus.example/transient',
    {},
    async () => {
      attempts += 1;
      return new Response('', { status: attempts < 3 ? 503 : 200 });
    },
    { maxAttempts: 3, retryDelayMs: 0 }
  );
  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
});

test('组件运行时依赖必须同时存在且使用精确版本', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-registry-check-'));
  const manifestPath = path.join(fixtureDir, 'package.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ name: 'fixture', dependencies: { 'vxe-table': '4.19.10', 'vxe-pc-ui': '4.14.32' } })
  );
  assert.deepEqual(resolveArtifactPlan(manifestPath), [
    { name: 'vxe-table', version: '4.19.10' },
    { name: 'vxe-pc-ui', version: '4.14.32' },
  ]);

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ name: 'fixture', dependencies: { 'vxe-table': '^4.19.10', 'vxe-pc-ui': '4.14.32' } })
  );
  assert.throws(() => resolveArtifactPlan(manifestPath), /vxe-table 必须使用精确版本/);
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test('同时校验 Registry 元数据和 tgz 响应', async () => {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(String(url));
    if (String(url).endsWith('/vxe-table/4.19.10')) {
      return new Response(
        JSON.stringify({
          dist: { tarball: 'http://upstream.example/vxe-table-4.19.10.tgz' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('x', { status: 206 });
  };

  const result = await checkDependencyArtifact({
    name: 'vxe-table',
    version: '4.19.10',
    registry: 'http://nexus.example/npm-group/',
    fetchImpl,
  });
  assert.equal(result.tarball, 'http://nexus.example/npm-group/vxe-table-4.19.10.tgz');
  assert.deepEqual(requests, [
    'http://nexus.example/npm-group/vxe-table/4.19.10',
    'http://nexus.example/npm-group/vxe-table-4.19.10.tgz',
  ]);
});

test('tgz 不可用时阻断检查', async () => {
  let requests = 0;
  const fetchImpl = async url => {
    requests += 1;
    if (String(url).endsWith('/vxe-table/4.19.10')) {
      return new Response(
        JSON.stringify({
          dist: { tarball: 'http://nexus.example/missing.tgz' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('not found', { status: 404 });
  };

  await assert.rejects(
    checkDependencyArtifact({
      name: 'vxe-table',
      version: '4.19.10',
      registry: 'http://nexus.example/npm-group/',
      fetchImpl,
    }),
    /tgz 请求失败 404/
  );
  assert.equal(requests, 2);
});

test('checkDependencyArtifact 透传重试与超时配置', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 2) {
      return new Response('', { status: 503 });
    }
    return new Response(
      JSON.stringify({
        dist: { tarball: 'http://nexus.example/vxe-table-4.19.10.tgz' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const result = await checkDependencyArtifact({
    name: 'vxe-table',
    version: '4.19.10',
    registry: 'http://nexus.example/npm-group/',
    fetchImpl,
    maxAttempts: 3,
    retryDelayMs: 0,
  });
  assert.equal(result.tarball, 'http://nexus.example/npm-group/vxe-table-4.19.10.tgz');
  assert.equal(attempts, 3); // 2 attempts for metadata (1 retry) + 1 for tarball
});
