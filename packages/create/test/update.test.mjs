import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import * as p from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offerLatestVersion } from '../src/cli.mjs';
import { confirmUseLatest, showIntro } from '../src/prompts.mjs';
import {
  acknowledgeRelaunch,
  canRelaunch,
  checkForUpdate,
  formatUpdateNotice,
  getCliVersion,
  isNewerVersion,
  NO_UPDATE_CHECK_ENV,
  RELAUNCH_HANDSHAKE_ENV,
  relaunchWithVersion,
  resolveRegistry,
  shouldCheckForUpdate,
  startUpdateCheck,
} from '../src/update.mjs';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
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

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * 执行新版本检查。
 *
 * @param {Partial<Parameters<typeof checkForUpdate>[0]>} options 查询参数
 */
const check = options => checkForUpdate({ currentVersion: '1.2.0', registry: REGISTRY, ...options });

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

describe('新版本检查（无缓存实时查询）', () => {
  it('有新版本：返回版本信息，并请求当前 registry 上 @yss-ui/create 的 latest', async () => {
    const fetchImpl = mockFetchJson({ version: '1.3.0' });
    const info = await check({ fetchImpl });

    expect(info).toEqual({ currentVersion: '1.2.0', latestVersion: '1.3.0' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${REGISTRY}/@yss-ui/create/latest`);
  });

  it('没有新版本：远端相同、更低或为预发布版时不提示', async () => {
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.2.0' }) })).toBeNull();
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.1.0' }) })).toBeNull();
    expect(await check({ fetchImpl: mockFetchJson({ version: '1.3.0-beta.1' }) })).toBeNull();
  });

  it('每次调用都实时请求 registry，不缓存旧结果（发版后立即检出新版本）', async () => {
    const firstFetch = mockFetchJson({ version: '1.2.0' });
    expect(await check({ fetchImpl: firstFetch })).toBeNull();
    expect(firstFetch).toHaveBeenCalledTimes(1);

    const secondFetch = mockFetchJson({ version: '1.3.0' });
    const info = await check({ fetchImpl: secondFetch });
    expect(secondFetch).toHaveBeenCalledTimes(1);
    expect(info).toEqual({ currentVersion: '1.2.0', latestVersion: '1.3.0' });
  });

  it('非 2xx 或响应体缺少 version 时静默跳过', async () => {
    expect(await check({ fetchImpl: mockFetchJson({ version: '9.0.0' }, { ok: false }) })).toBeNull();
    expect(await check({ fetchImpl: mockFetchJson({}) })).toBeNull();
  });

  it('网络出错时静默跳过，不抛错', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(check({ fetchImpl })).resolves.toBeNull();
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
      fetchImpl: vi.fn(hangingRequest),
    });
    expect(pending.peek()).toBeNull();
    pending.cancel();
    expect(await pending.result).toBeNull();

    const done = startUpdateCheck({
      currentVersion: '1.2.0',
      registry: REGISTRY,
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
    vi.fn((_cmd, _args, options) => {
      const child = new EventEmitter();
      queueMicrotask(() => emit(child, options));
      return child;
    });

  it('询问是否切换时默认选「是」，回车即切换到新版本', async () => {
    p.confirm.mockImplementationOnce(async opts => opts.initialValue);
    const accepted = await confirmUseLatest({ currentVersion: '1.2.0', latestVersion: '1.3.0' });

    expect(accepted).toBe(true);
    expect(p.confirm).toHaveBeenCalledWith(expect.objectContaining({ initialValue: true }));
    expect(p.note).toHaveBeenCalledWith(expect.stringContaining('当前 1.2.0 → 最新 1.3.0'), '发现新版本');
  });

  it('用户选择「否」时返回 false，继续使用当前版本', async () => {
    p.confirm.mockResolvedValueOnce(false);
    expect(await confirmUseLatest({ currentVersion: '1.2.0', latestVersion: '1.3.0' })).toBe(false);
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
    expect(options.env).toEqual({
      PATH: '/usr/bin',
      [NO_UPDATE_CHECK_ENV]: '1',
      [RELAUNCH_HANDSHAKE_ENV]: expect.any(String),
    });
  });

  it('npx 下载失败（子进程未进入 CLI 入口即非零退出）时返回 null，回退到当前版本', async () => {
    const spawnImpl = createSpawnMock(child => child.emit('exit', 1, null));
    expect(await relaunchWithVersion('1.3.0', [], { spawnImpl })).toBeNull();
  });

  it('新版本已启动但运行期报错时透传子进程退出码；被信号中断视为 130', async () => {
    const spawnStartedFail = createSpawnMock(async (child, options) => {
      await acknowledgeRelaunch(options.env);
      child.emit('exit', 5, null);
    });
    expect(await relaunchWithVersion('1.3.0', [], { spawnImpl: spawnStartedFail })).toBe(5);
    expect(
      await relaunchWithVersion('1.3.0', [], { spawnImpl: createSpawnMock(c => c.emit('exit', null, 'SIGINT')) })
    ).toBe(130);
  });

  it('npx 无法启动时返回 null，交给调用方回退到当前版本', async () => {
    const spawnImpl = createSpawnMock(child => child.emit('error', new Error('spawn npx ENOENT')));
    expect(await relaunchWithVersion('1.3.0', [], { spawnImpl })).toBeNull();
  });

  it('offerLatestVersion：下载失败时提示继续用当前版本并返回 exitCode: null；新版本运行失败时提示 --no-update-check', async () => {
    p.confirm.mockResolvedValueOnce(true);
    const fallbackRes = await offerLatestVersion(
      Promise.resolve({ currentVersion: '1.2.0', latestVersion: '1.3.0' }),
      [],
      { relaunchImpl: vi.fn(async () => null) }
    );
    expect(fallbackRes).toEqual({ offered: true, exitCode: null });
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('切换新版本失败，继续使用当前版本 v1.2.0'));
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('--no-update-check'));

    p.log.warn.mockClear();
    p.confirm.mockResolvedValueOnce(true);
    const runtimeErrRes = await offerLatestVersion(
      Promise.resolve({ currentVersion: '1.2.0', latestVersion: '1.3.0' }),
      [],
      { relaunchImpl: vi.fn(async () => 5) }
    );
    expect(runtimeErrRes).toEqual({ offered: true, exitCode: 5 });
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('--no-update-check'));
  });

  it('需要经 shell 启动时，参数含空格或特殊字符就不切换', () => {
    expect(canRelaunch(['my-app', '--name-zh', '订单中心'], true)).toBe(true);
    expect(canRelaunch(['--name-zh', '订单 中心'], true)).toBe(false);
    expect(canRelaunch(['--description', 'a&b'], true)).toBe(false);
    expect(canRelaunch(['--name-zh', '订单 中心'], false)).toBe(true);
  });
});
