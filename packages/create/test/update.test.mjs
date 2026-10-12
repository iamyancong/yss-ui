import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmUseLatest, showIntro } from '../src/prompts.mjs';
import {
  canRelaunch,
  checkForUpdate,
  formatUpdateNotice,
  getCliVersion,
  isNewerVersion,
  NO_UPDATE_CHECK_ENV,
  relaunchWithVersion,
  resolveRegistry,
  shouldCheckForUpdate,
  startUpdateCheck,
  UPDATE_CACHE_TTL_MS,
} from '../src/update.mjs';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
}));

const pkg = createRequire(import.meta.url)('../package.json');
const REGISTRY = 'https://registry.example.com';

/**
 * 构造一个返回指定 JSON 的 fetch mock。
 *
 * @param {unknown} body 响应体
 * @param {{ ok?: boolean }} [init] 响应状态
 */
const mockFetchJson = (body, { ok = true } = {}) => vi.fn(async () => ({ ok, json: async () => body }));

/** 永远不返回的请求，模拟网络挂起。 */
const hangingRequest = () => new Promise(() => undefined);

/** 去掉 ANSI 颜色码。 */
const stripAnsi = text => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

let cacheDir;
let cacheFile;

beforeEach(async () => {
  vi.clearAllMocks();
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-update-cache-'));
  cacheFile = path.join(cacheDir, 'update-check.json');
});

afterEach(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true });
});

/**
 * 以隔离的缓存文件执行检查。
 *
 * @param {Partial<Parameters<typeof checkForUpdate>[0]>} options 查询参数
 */
const check = options => checkForUpdate({ currentVersion: '1.2.0', registry: REGISTRY, cacheFile, ...options });

describe('版本号', () => {
  it('getCliVersion 等于 package.json 的 version', () => {
    expect(getCliVersion()).toBe(pkg.version);
  });

  it('交互模式标题带当前版本号', () => {
    showIntro(getCliVersion());
    expect(p.intro).toHaveBeenCalledWith(expect.stringContaining(`YSS 微应用创建 v${pkg.version}`));
  });

  it('isNewerVersion 只在远端为严格更高的正式版时为 true', () => {
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.2.10', '1.2.9')).toBe(true);
    expect(isNewerVersion('v1.3.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
    expect(isNewerVersion('not-a-version', '1.2.0')).toBe(false);
  });

  it('远端是预发布版（带 -）时不算新版本', () => {
    expect(isNewerVersion('1.3.0-beta.1', '1.2.0')).toBe(false);
    expect(isNewerVersion('2.0.0-rc.0', '1.2.0')).toBe(false);
  });
});

describe('新版本检查', () => {
  it('有新版本：返回版本信息，并请求当前 registry 上 @yss-ui/create 的 latest', async () => {
    const fetchImpl = mockFetchJson({ version: '1.3.0' });
    const info = await check({ fetchImpl });

    expect(info).toEqual({ currentVersion: '1.2.0', latestVersion: '1.3.0' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${REGISTRY}/@yss-ui/create/latest`);
  });

  it('没有新版本：远端相同、更低或为预发布版时不提示', async () => {
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.2.0' }) })).toBeNull();
    await fs.rm(cacheFile, { force: true });
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.1.0' }) })).toBeNull();
    await fs.rm(cacheFile, { force: true });
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.3.0-beta.1' }) })).toBeNull();
  });

  it('非 2xx 或响应体缺少 version 时静默跳过', async () => {
    expect(await check({ fetchImpl: mockFetchJson({ version: '9.0.0' }, { ok: false }) })).toBeNull();
    expect(await check({ fetchImpl: mockFetchJson({}) })).toBeNull();
  });

  it('网络出错时静默跳过，不抛错，也不写缓存', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(check({ fetchImpl })).resolves.toBeNull();
    await expect(fs.access(cacheFile)).rejects.toThrow();
  });

  it('超时：按时返回 null 并中止请求，即使 fetch 不响应 abort 也不会卡住', async () => {
    let receivedSignal;
    const fetchImpl = vi.fn((_url, { signal }) => {
      receivedSignal = signal;
      return hangingRequest();
    });
    const startedAt = Date.now();

    expect(await check({ timeoutMs: 50, fetchImpl })).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(receivedSignal.aborted).toBe(true);
  });

  it('startUpdateCheck 不阻塞：返回前 peek 为 null，cancel 后结果为 null', async () => {
    const pending = startUpdateCheck({
      currentVersion: '1.2.0',
      registry: REGISTRY,
      cacheFile,
      fetchImpl: vi.fn(hangingRequest),
    });
    expect(pending.peek()).toBeNull();
    pending.cancel();
    expect(await pending.result).toBeNull();

    const done = startUpdateCheck({
      currentVersion: '1.2.0',
      registry: REGISTRY,
      cacheFile,
      fetchImpl: mockFetchJson({ version: '1.3.0' }),
    });
    await done.result;
    expect(done.peek()).toEqual({ currentVersion: '1.2.0', latestVersion: '1.3.0' });
  });

  it('registry 取 npm_config_registry，默认 npmjs，去掉末尾斜杠', () => {
    expect(resolveRegistry({})).toBe('https://registry.npmjs.org');
    expect(resolveRegistry({ npm_config_registry: 'https://registry.npmmirror.com/' })).toBe(
      'https://registry.npmmirror.com'
    );
  });
});

describe('24 小时缓存', () => {
  it('缓存有效期内不再联网', async () => {
    const now = 1_000_000;
    await check({ fetchImpl: mockFetchJson({ version: '1.3.0' }), now: () => now });

    const fetchImpl = mockFetchJson({ version: '9.9.9' });
    const info = await check({ fetchImpl, now: () => now + UPDATE_CACHE_TTL_MS - 1 });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).toEqual({ currentVersion: '1.2.0', latestVersion: '1.3.0' });
  });

  it('缓存过期后重新查询并刷新缓存', async () => {
    const now = 1_000_000;
    await check({ fetchImpl: mockFetchJson({ version: '1.3.0' }), now: () => now });

    const fetchImpl = mockFetchJson({ version: '1.4.0' });
    const info = await check({ fetchImpl, now: () => now + UPDATE_CACHE_TTL_MS });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(info.latestVersion).toBe('1.4.0');
    expect(JSON.parse(await fs.readFile(cacheFile, 'utf8')).latestVersion).toBe('1.4.0');
  });

  it('没有新版本的结果也会缓存，同一天不重复联网', async () => {
    await check({ fetchImpl: mockFetchJson({ version: '1.2.0' }) });
    const fetchImpl = mockFetchJson({ version: '1.3.0' });
    expect(await check({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('换了 registry 时不使用旧缓存', async () => {
    await check({ fetchImpl: mockFetchJson({ version: '1.3.0' }) });
    const fetchImpl = mockFetchJson({ version: '1.2.0' });
    expect(await check({ fetchImpl, registry: 'https://registry.npmmirror.com' })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('缓存文件损坏时当作没有缓存', async () => {
    await fs.writeFile(cacheFile, '{ broken', 'utf8');
    const fetchImpl = mockFetchJson({ version: '1.3.0' });
    expect((await check({ fetchImpl })).latestVersion).toBe('1.3.0');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('关闭新版本检查', () => {
  it('有交互终端时默认开启', () => {
    expect(shouldCheckForUpdate({ isTTY: true, env: {} })).toBe(true);
    expect(shouldCheckForUpdate({ isTTY: true, env: { CI: 'false', [NO_UPDATE_CHECK_ENV]: '0' } })).toBe(true);
  });

  it.each([
    ['--json', { json: true }],
    ['没有交互终端', { isTTY: false }],
    ['--offline', { offline: true }],
    ['--dry-run', { dryRun: true }],
    ['--no-update-check', { noUpdateCheck: true }],
    ['CI=true', { env: { CI: 'true' } }],
    [`${NO_UPDATE_CHECK_ENV}=1`, { env: { [NO_UPDATE_CHECK_ENV]: '1' } }],
  ])('%s 时不检查', (_label, flags) => {
    expect(shouldCheckForUpdate({ isTTY: true, env: {}, ...flags })).toBe(false);
  });
});

describe('结尾提示框', () => {
  it('写明当前版本、最新版本和升级命令，右边框对齐', () => {
    const lines = stripAnsi(formatUpdateNotice({ currentVersion: '1.2.0', latestVersion: '1.3.0' })).split('\n');

    expect(lines[1]).toContain('当前 1.2.0 → 最新 1.3.0');
    expect(lines[2]).toContain('下次请用 npm create yss-app@latest');
    const width = line => [...line].reduce((sum, char) => sum + (/[\u4e00-\u9fff\uff00-\uff60]/.test(char) ? 2 : 1), 0);
    expect(new Set(lines.map(width)).size).toBe(1);
  });
});

describe('切换到新版本', () => {
  /** 构造一个可控的子进程 mock。 */
  const createSpawnMock = emit =>
    vi.fn(() => {
      const child = new EventEmitter();
      queueMicrotask(() => emit(child));
      return child;
    });

  it('询问是否切换时默认选「否」，一路回车不会切换', async () => {
    p.confirm.mockImplementationOnce(async opts => opts.initialValue);
    const accepted = await confirmUseLatest({ currentVersion: '1.2.0', latestVersion: '1.3.0' });

    expect(accepted).toBe(false);
    expect(p.confirm).toHaveBeenCalledWith(expect.objectContaining({ initialValue: false }));
    expect(p.note).toHaveBeenCalledWith(expect.stringContaining('当前 1.2.0 → 最新 1.3.0'), '发现新版本');
  });

  it('用户明确选择后才返回 true', async () => {
    p.confirm.mockResolvedValueOnce(true);
    expect(await confirmUseLatest({ currentVersion: '1.2.0', latestVersion: '1.3.0' })).toBe(true);
  });

  it('用 npx 运行指定版本的 @yss-ui/create 并透传参数，子进程不再检查', async () => {
    const spawnImpl = createSpawnMock(child => child.emit('exit', 0, null));
    const code = await relaunchWithVersion('1.3.0', ['my-app', '--name-zh', '订单中心'], {
      spawnImpl,
      env: { PATH: '/usr/bin' },
    });

    expect(code).toBe(0);
    const [command, args, options] = spawnImpl.mock.calls[0];
    expect(command).toBe('npx');
    expect(args).toEqual([
      '--yes',
      '--package=@yss-ui/create@1.3.0',
      '--',
      'create-yss-app',
      'my-app',
      '--name-zh',
      '订单中心',
    ]);
    expect(options.stdio).toBe('inherit');
    expect(options.env).toEqual({ PATH: '/usr/bin', [NO_UPDATE_CHECK_ENV]: '1' });
  });

  it('透传子进程退出码；被信号中断视为 130', async () => {
    expect(await relaunchWithVersion('1.3.0', [], { spawnImpl: createSpawnMock(c => c.emit('exit', 5, null)) })).toBe(
      5
    );
    expect(
      await relaunchWithVersion('1.3.0', [], { spawnImpl: createSpawnMock(c => c.emit('exit', null, 'SIGINT')) })
    ).toBe(130);
  });

  it('npx 无法启动时返回 null，交给调用方回退到当前版本', async () => {
    const spawnImpl = createSpawnMock(child => child.emit('error', new Error('spawn npx ENOENT')));
    expect(await relaunchWithVersion('1.3.0', [], { spawnImpl })).toBeNull();
  });

  it('需要经 shell 启动时，参数含空格或特殊字符就不切换', () => {
    expect(canRelaunch(['my-app', '--name-zh', '订单中心'], true)).toBe(true);
    expect(canRelaunch(['--name-zh', '订单 中心'], true)).toBe(false);
    expect(canRelaunch(['--description', 'a&b'], true)).toBe(false);
    expect(canRelaunch(['--name-zh', '订单 中心'], false)).toBe(true);
  });
});
