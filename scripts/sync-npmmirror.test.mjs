import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReleaseSummaryPackages, syncSinglePackage, syncNpmmirror, parseArgs } from './sync-npmmirror.mjs';

test('parseArgs 正确解析命令行选项', () => {
  const argv = [
    'node',
    'sync-npmmirror.mjs',
    '--summary=my-summary.json',
    '--registry-direct=https://example.com',
    '--timeout-ms=5000',
  ];
  const options = parseArgs(argv);
  assert.equal(options.summaryPath, 'my-summary.json');
  assert.equal(options.registryDirect, 'https://example.com');
  assert.equal(options.timeoutMs, 5000);
});

test('readReleaseSummaryPackages 在文件不存在时返回空数组', () => {
  const list = readReleaseSummaryPackages('/path/to/non-existent-summary.json');
  assert.deepEqual(list, []);
});

test('readReleaseSummaryPackages 在 JSON 破损或结构不符合时优雅返回空数组', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-npmmirror-test-'));
  const brokenPath = path.join(tempDir, 'broken.json');
  fs.writeFileSync(brokenPath, '{ broken json');
  assert.deepEqual(readReleaseSummaryPackages(brokenPath), []);

  const invalidStructurePath = path.join(tempDir, 'invalid.json');
  fs.writeFileSync(invalidStructurePath, JSON.stringify({ packages: 'not an array' }));
  assert.deepEqual(readReleaseSummaryPackages(invalidStructurePath), []);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('readReleaseSummaryPackages 正确读取并过滤有效包列表', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-npmmirror-test-'));
  const validPath = path.join(tempDir, 'summary.json');
  fs.writeFileSync(
    validPath,
    JSON.stringify({
      packages: [
        { name: '@yss-ui/components', oldVersion: '1.7.0', newVersion: '1.7.1' },
        { name: '   ', newVersion: '1.0.0' },
        null,
        { name: '@yss-ui/mcp', newVersion: '0.3.3' },
      ],
    })
  );

  const list = readReleaseSummaryPackages(validPath);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, '@yss-ui/components');
  assert.equal(list[1].name, '@yss-ui/mcp');

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('syncSinglePackage 成功时返回 ok: true 及任务 id、state', async () => {
  const mockFetcher = async (url, options) => {
    assert.equal(url, 'https://registry-direct.npmmirror.com/-/package/@yss-ui/components/syncs');
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers['User-Agent'], 'yss-ui-release-sync');
    return {
      status: 201,
      ok: true,
      json: async () => ({
        ok: true,
        id: 'mock-sync-id-123',
        type: 'sync_package',
        state: 'waiting',
      }),
    };
  };

  const res = await syncSinglePackage({
    name: '@yss-ui/components',
    version: '1.7.1',
    fetcher: mockFetcher,
  });

  assert.equal(res.ok, true);
  assert.equal(res.status, 201);
  assert.equal(res.id, 'mock-sync-id-123');
  assert.equal(res.state, 'waiting');
});

test('syncSinglePackage 遇到 HTTP 非 2xx 时软失败，不抛出异常', async () => {
  const mockFetcher = async () => ({
    status: 502,
    ok: false,
    json: async () => ({ message: 'Bad Gateway' }),
  });

  const res = await syncSinglePackage({
    name: '@yss-ui/mcp',
    version: '0.3.3',
    fetcher: mockFetcher,
  });

  assert.equal(res.ok, false);
  assert.equal(res.status, 502);
  assert.equal(res.error, 'Bad Gateway');
});

test('syncSinglePackage 遇到网络异常或超时时软失败，不抛出异常', async () => {
  const mockFetcher = async () => {
    throw new Error('Network Connection Refused');
  };

  const res = await syncSinglePackage({
    name: '@yss-ui/skills',
    version: '1.5.0',
    fetcher: mockFetcher,
  });

  assert.equal(res.ok, false);
  assert.match(res.error, /Network Connection Refused/);
});

test('syncNpmmirror 在无摘要或空批次时正常 SKIP', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-npmmirror-test-'));

  // 1. 文件不存在
  const missingRes = await syncNpmmirror({
    summaryPath: path.join(tempDir, 'does-not-exist.json'),
  });
  assert.equal(missingRes.skipped, true);
  assert.match(missingRes.reason, /未找到发版摘要文件/);

  // 2. 空包列表
  const emptyPath = path.join(tempDir, 'empty.json');
  fs.writeFileSync(emptyPath, JSON.stringify({ packages: [] }));
  const emptyRes = await syncNpmmirror({ summaryPath: emptyPath });
  assert.equal(emptyRes.skipped, true);
  assert.match(emptyRes.reason, /未包含待同步的有效包/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('syncNpmmirror 多包执行并正确汇总成功与失败数量', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-npmmirror-test-'));
  const summaryPath = path.join(tempDir, 'summary.json');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({
      packages: [
        { name: '@yss-ui/components', newVersion: '1.7.1' },
        { name: '@yss-ui/mcp', newVersion: '0.3.3' },
        { name: '@yss-ui/skills', newVersion: '1.5.0' },
      ],
    })
  );

  const calledUrls = [];
  const mockFetcher = async url => {
    calledUrls.push(url);
    if (url.includes('@yss-ui/mcp')) {
      return {
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server Internal Error' }),
      };
    }
    return {
      status: 201,
      ok: true,
      json: async () => ({ ok: true, id: `id-${calledUrls.length}`, state: 'waiting' }),
    };
  };

  const result = await syncNpmmirror({
    summaryPath,
    fetcher: mockFetcher,
  });

  assert.equal(result.total, 3);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.equal(calledUrls.length, 3);
  assert.equal(calledUrls[0], 'https://registry-direct.npmmirror.com/-/package/@yss-ui/components/syncs');
  assert.equal(calledUrls[1], 'https://registry-direct.npmmirror.com/-/package/@yss-ui/mcp/syncs');
  assert.equal(calledUrls[2], 'https://registry-direct.npmmirror.com/-/package/@yss-ui/skills/syncs');

  fs.rmSync(tempDir, { recursive: true, force: true });
});
