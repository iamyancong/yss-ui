/**
 * @fileoverview CLI 版本信息与新版本提示。
 * 只向 registry 发 GET 读取公开元数据，不上报任何信息；任何失败都静默跳过，只提示、不自动升级。
 */

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';

const require = createRequire(import.meta.url);

/** 用户入口包名与命令名（npm create yss-app 实际执行的包）。 */
export const CLI_PACKAGE_NAME = 'create-yss-app';

/**
 * 实际实现所在的包：版本号读自它的 package.json，新版本也按它查询，
 * 这样即使别名包 create-yss-app 没有同步发版也能正确提示。
 */
export const CORE_PACKAGE_NAME = '@yss-ui/create';

/** 未配置 npm_config_registry 时使用的官方源。 */
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

/** 单次查询的超时时间（毫秒）。 */
export const UPDATE_CHECK_TIMEOUT_MS = 1500;

/** 最新版本号的本地缓存有效期（毫秒）。 */
export const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 默认缓存文件，与模板缓存一样放在系统临时目录。 */
export const DEFAULT_UPDATE_CACHE_FILE = path.join(os.tmpdir(), 'yss-create-update-check.json');

/** 关闭新版本检查的环境变量。 */
export const NO_UPDATE_CHECK_ENV = 'YSS_CREATE_NO_UPDATE_CHECK';

/**
 * @typedef {{ currentVersion: string, latestVersion: string }} UpdateInfo
 */

/**
 * 读取当前 CLI 的版本号（来自自身 package.json）。
 *
 * @returns {string} 版本号，例如 1.2.0
 */
export const getCliVersion = () => require('../package.json').version;

/**
 * 把正式版 `major.minor.patch` 解析为数字数组；预发布版（含 `-`）或无法解析时返回 null。
 *
 * @param {string} version 版本号
 * @returns {number[] | null}
 */
const parseStableVersion = version => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  return match ? match.slice(1, 4).map(Number) : null;
};

/**
 * 判断 candidate 是否为严格高于 current 的正式版；预发布版或无法解析时视为不更高。
 *
 * @param {string} candidate 远端版本
 * @param {string} current 当前版本
 * @returns {boolean}
 */
export const isNewerVersion = (candidate, current) => {
  const next = parseStableVersion(candidate);
  const base = parseStableVersion(String(current).split('-')[0]);
  if (!next || !base) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] !== base[i]) return next[i] > base[i];
  }
  return false;
};

/**
 * 环境变量开关是否为开启状态（空、0、false 视为关闭）。
 *
 * @param {string | undefined} value 环境变量值
 * @returns {boolean}
 */
const isEnvEnabled = value => Boolean(value) && !['0', 'false'].includes(String(value).toLowerCase());

/**
 * 判断本次运行是否需要检查新版本：提示只给终端前的人看，看不到提示的场景一律不联网。
 *
 * @param {{ json?: boolean, isTTY?: boolean, offline?: boolean, dryRun?: boolean, noUpdateCheck?: boolean, env?: Record<string, string | undefined> }} flags 运行开关
 * @returns {boolean}
 */
export const shouldCheckForUpdate = ({
  json,
  isTTY = Boolean(process.stdout.isTTY),
  offline,
  dryRun,
  noUpdateCheck,
  env = process.env,
} = {}) => {
  if (json || !isTTY || offline || dryRun || noUpdateCheck) return false;
  if (isEnvEnabled(env.CI) || isEnvEnabled(env[NO_UPDATE_CHECK_ENV])) return false;
  return true;
};

/**
 * 解析当前使用的 registry（npm/npx 启动时会注入 npm_config_registry）。
 *
 * @param {Record<string, string | undefined>} [env=process.env] 环境变量
 * @returns {string} 不含末尾斜杠的 registry 地址
 */
export const resolveRegistry = (env = process.env) => (env.npm_config_registry || DEFAULT_REGISTRY).replace(/\/+$/, '');

/**
 * 读取未过期且属于同一 registry 的缓存版本号。
 *
 * @param {string} cacheFile 缓存文件
 * @param {string} registry registry 地址
 * @param {number} now 当前时间戳
 * @returns {Promise<string | null>}
 */
const readCachedVersion = async (cacheFile, registry, now) => {
  try {
    const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    const fresh = now - cache.checkedAt >= 0 && now - cache.checkedAt < UPDATE_CACHE_TTL_MS;
    if (cache.registry !== registry || !fresh || typeof cache.latestVersion !== 'string') return null;
    return cache.latestVersion;
  } catch {
    return null;
  }
};

/**
 * 写入缓存；写失败不影响主流程。
 *
 * @param {string} cacheFile 缓存文件
 * @param {{ registry: string, latestVersion: string, checkedAt: number }} cache 缓存内容
 * @returns {Promise<void>}
 */
const writeCachedVersion = async (cacheFile, cache) => {
  try {
    await fs.writeFile(cacheFile, `${JSON.stringify(cache)}\n`, 'utf8');
  } catch {}
};

/**
 * 向 registry 查询最新版本号；超时、离线、非 2xx、解析失败一律返回 null。
 *
 * @param {{ registry: string, timeoutMs: number, fetchImpl: typeof fetch, signal?: AbortSignal }} options 查询参数
 * @returns {Promise<string | null>}
 */
const fetchLatestVersion = async ({ registry, timeoutMs, fetchImpl, signal }) => {
  if (typeof fetchImpl !== 'function' || signal?.aborted) return null;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  const request = (async () => {
    try {
      const response = await fetchImpl(`${registry}/${CORE_PACKAGE_NAME}/latest`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const { version } = await response.json();
      return typeof version === 'string' ? version : null;
    } catch {
      return null;
    }
  })();

  // fetch 实现不一定响应 abort，用计时器兜底保证最长等待时间
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      abort();
      resolve(null);
    }, timeoutMs);
  });
  const cancelled = new Promise(resolve => signal?.addEventListener('abort', () => resolve(null), { once: true }));

  try {
    return await Promise.race([request, timeout, cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};

/**
 * 获取最新版本（24 小时内优先用本地缓存），只有高于当前版本的正式版才返回结果。
 *
 * @param {{ currentVersion: string, registry?: string, timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal, cacheFile?: string, now?: () => number }} options 查询参数
 * @returns {Promise<UpdateInfo | null>}
 */
export const checkForUpdate = async ({
  currentVersion,
  registry = resolveRegistry(),
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  signal,
  cacheFile = DEFAULT_UPDATE_CACHE_FILE,
  now = Date.now,
}) => {
  let latestVersion = await readCachedVersion(cacheFile, registry, now());
  if (!latestVersion) {
    latestVersion = await fetchLatestVersion({ registry, timeoutMs, fetchImpl, signal });
    if (!latestVersion) return null;
    await writeCachedVersion(cacheFile, { registry, latestVersion, checkedAt: now() });
  }
  return isNewerVersion(latestVersion, currentVersion) ? { currentVersion, latestVersion } : null;
};

/**
 * 在后台启动新版本检查，不阻塞主流程；结束时用 peek 读取已返回的结果，用 cancel 中止未完成的请求。
 *
 * @param {Parameters<typeof checkForUpdate>[0]} options 查询参数
 * @returns {{ peek: () => UpdateInfo | null, cancel: () => void, result: Promise<UpdateInfo | null> }}
 */
export const startUpdateCheck = options => {
  const controller = new AbortController();
  let settled = null;
  const result = checkForUpdate({ ...options, signal: controller.signal }).then(info => {
    settled = info;
    return info;
  });
  return {
    result,
    peek: () => settled,
    cancel: () => controller.abort(),
  };
};

/**
 * 终端显示宽度：中日韩全角字符按 2 列计算，保证提示框右边框对齐。
 *
 * @param {string} text 文本
 * @returns {number}
 */
const displayWidth = text =>
  [...text].reduce(
    (width, char) =>
      width +
      (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(char)
        ? 2
        : 1),
    0
  );

/**
 * 生成结尾的新版本提示框。
 *
 * @param {UpdateInfo} info 版本信息
 * @returns {string}
 */
export const formatUpdateNotice = ({ currentVersion, latestVersion }) => {
  const lines = [`发现新版本：当前 ${currentVersion} → 最新 ${latestVersion}`, '下次请用 npm create yss-app@latest'];
  const width = Math.max(...lines.map(displayWidth));
  const border = '─'.repeat(width + 4);
  const body = lines.map(line => `│  ${line}${' '.repeat(width - displayWidth(line))}  │`);
  return pc.yellow([`╭${border}╮`, ...body, `╰${border}╯`].join('\n'));
};
