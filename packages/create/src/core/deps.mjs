/**
 * @fileoverview 脚手架生成后 @yss-ui/* 依赖版本自动对齐与 lockfile 维护模块。
 * 纯 Node 原生 fetch、child_process 与 fs 实现，零第三方依赖。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists } from './validate.mjs';

/** 官方 npm registry 地址。 */
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org';

/** 单包查询超时时间（毫秒）。 */
export const SINGLE_PKG_TIMEOUT_MS = 5000;

/** 全部依赖并发查询总超时时间（毫秒）。 */
export const TOTAL_QUERY_TIMEOUT_MS = 15000;

/** lockfile-only 执行超时时间（毫秒）。 */
export const LOCKFILE_REFRESH_TIMEOUT_MS = 45000;

/**
 * 标准语义化版本声明匹配正则：仅支持 ^、~ 与精确版本（如 ^1.7.3、~1.0.6、1.8.0、v1.8.0）。
 * 复杂范围（>=1.0.0 <2）、工作区别名（workspace:*）、动态 tag（latest）及 npm 别名等均不视为待升级的标准版本。
 */
export const STANDARD_VERSION_SPEC_PATTERN = /^(\^|~)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/**
 * 规范化 registry 地址：去除首尾空格与末尾斜杠。
 *
 * @param {string | undefined} url registry 地址
 * @returns {string} 规范化后的地址
 */
export const normalizeRegistry = url => {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
};

/**
 * 从 .npmrc 文本中解析 registry 配置。
 *
 * @param {string} content .npmrc 文件内容
 * @returns {{ scopedRegistry?: string, defaultRegistry?: string }}
 */
export const parseNpmrcRegistry = content => {
  let scopedRegistry;
  let defaultRegistry;

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const matchScoped = /^@yss-ui:registry\s*=\s*(.+)$/.exec(line);
    if (matchScoped) {
      scopedRegistry = normalizeRegistry(matchScoped[1]);
      continue;
    }
    const matchDefault = /^registry\s*=\s*(.+)$/.exec(line);
    if (matchDefault) {
      defaultRegistry = normalizeRegistry(matchDefault[1]);
    }
  }

  return { scopedRegistry, defaultRegistry };
};

/**
 * 按优先级解析用于查询 @yss-ui/* 的 registry 地址：
 * npm_config_registry > 项目 .npmrc 的 @yss-ui:registry / registry > https://registry.npmjs.org/
 *
 * @param {string} projectRoot 生成项目根目录
 * @param {Record<string, string | undefined>} [env=process.env] 环境变量
 * @returns {Promise<string>} 规范化后的 registry 地址
 */
export const resolveProjectRegistry = async (projectRoot, env = process.env) => {
  if (env.npm_config_registry && env.npm_config_registry.trim()) {
    return normalizeRegistry(env.npm_config_registry);
  }

  const npmrcPath = path.join(projectRoot, '.npmrc');
  if (await pathExists(npmrcPath)) {
    try {
      const content = await fs.readFile(npmrcPath, 'utf8');
      const { scopedRegistry, defaultRegistry } = parseNpmrcRegistry(content);
      if (scopedRegistry) return scopedRegistry;
      if (defaultRegistry) return defaultRegistry;
    } catch {}
  }

  return OFFICIAL_REGISTRY;
};

/**
 * 拆解版本声明中的前缀与纯版本号。
 * 仅对 ^、~ 与精确版本解析出 isStandard: true；复杂范围或非 SemVer 别名标记 isStandard: false。
 *
 * @param {string} spec 原始版本声明（如 ^1.7.3、~1.0.6、1.8.0）
 * @returns {{ prefix: string, version: string, isStandard: boolean }}
 */
export const parseVersionSpec = spec => {
  const trimmed = String(spec || '').trim();
  const match = STANDARD_VERSION_SPEC_PATTERN.exec(trimmed);
  if (!match) {
    return { prefix: '', version: trimmed, isStandard: false };
  }
  return { prefix: match[1] || '', version: match[2], isStandard: true };
};

/**
 * 解析基础 SemVer 主次修订号为三元数字组；预发布版或非法格式返回 null。
 *
 * @param {string} version 版本号
 * @returns {number[] | null}
 */
export const parseSemverTuple = version => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(String(version).trim());
  if (!match) return null;
  return match.slice(1, 4).map(Number);
};

/**
 * 比较两个版本号：a > b 返回 1，a < b 返回 -1，相等返回 0。
 *
 * @param {string} aVersion 版本 A
 * @param {string} bVersion 版本 B
 * @returns {number}
 */
export const compareSemver = (aVersion, bVersion) => {
  const aTuple = parseSemverTuple(aVersion);
  const bTuple = parseSemverTuple(bVersion);
  if (!aTuple || !bTuple) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (aTuple[i] > bTuple[i]) return 1;
    if (aTuple[i] < bTuple[i]) return -1;
  }
  return 0;
};

/**
 * 向指定 registry 请求包元数据（packument）。
 *
 * @param {string} pkgName 包名
 * @param {string} registry registry 地址
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<{ latest?: string, versions?: Record<string, any>, peerDependencies?: Record<string, string> } | null>}
 */
export const fetchPackageMetadata = async (pkgName, registry, options = {}) => {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? SINGLE_PKG_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function' || options.signal?.aborted) return null;

  const runFetch = async () => {
    if (options.signal?.aborted) return null;

    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });

    const encodedPkg = encodeURIComponent(pkgName).replace(/^%40/, '@');
    const targetUrl = `${normalizeRegistry(registry)}/${encodedPkg}`;

    let timer;
    const timeoutPromise = new Promise(resolve => {
      timer = setTimeout(() => {
        abort();
        resolve(null);
      }, timeoutMs);
    });

    const requestPromise = (async () => {
      try {
        const response = await fetchImpl(targetUrl, {
          headers: {
            accept: 'application/json, application/vnd.npm.install-v1+json; q=0.8',
          },
          signal: controller.signal,
        });
        if (response?.status === 404) {
          return { notFound: true };
        }
        if (!response?.ok) return null;
        const data = await response.json();
        const latest = data?.['dist-tags']?.latest;
        const versions = data?.versions || {};
        const latestVersionInfo = latest && versions[latest] ? versions[latest] : null;
        const peerDependencies = latestVersionInfo?.peerDependencies || {};
        return {
          latest: typeof latest === 'string' ? latest : undefined,
          versions,
          peerDependencies,
        };
      } catch {
        return null;
      }
    })();

    try {
      return await Promise.race([requestPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  };

  const initial = await runFetch();
  if (initial?.notFound) {
    return null;
  }
  if (initial !== null || options.signal?.aborted) {
    return initial;
  }
  const retryResult = await runFetch();
  if (retryResult?.notFound) {
    return null;
  }
  return retryResult;
};

/**
 * 检查特定版本在指定 registry 中是否存在（返回 200 状态）。
 * 用于公共镜像（如 npmmirror）在包级元数据不可用时，验证具体版本是否可以从该镜像下载。
 *
 * @param {string} pkgName 包名
 * @param {string} version 版本号
 * @param {string} registry registry 地址
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<boolean>}
 */
export const checkPackageVersionExists = async (pkgName, version, registry, options = {}) => {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? SINGLE_PKG_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function' || options.signal?.aborted) return false;

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });

  const encodedPkg = encodeURIComponent(pkgName).replace(/^%40/, '@');
  const targetUrl = `${normalizeRegistry(registry)}/${encodedPkg}/${encodeURIComponent(version)}`;

  let timer;
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => {
      abort();
      resolve(false);
    }, timeoutMs);
  });

  const requestPromise = (async () => {
    try {
      const response = await fetchImpl(targetUrl, {
        headers: {
          accept: 'application/json, application/vnd.npm.install-v1+json; q=0.8',
        },
        signal: controller.signal,
      });
      return response?.status === 200 || (response?.ok && response?.status === undefined);
    } catch {
      return false;
    }
  })();

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
};

/**
 * 处理 registry 镜像延迟回退：
 * 同时对比项目源与官方 npmjs 源。若 npmjs 上的最新版本在项目镜像中尚不可用，
 * 则回退到项目镜像实际支持的最高可用版本，并产生镜像滞后警告（展示实际生效的项目源地址）。
 *
 * @param {string} pkgName 包名
 * @param {string} projectRegistry 项目生效 registry
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<{ resolvedVersion: string | null, warning?: string, peerDependencies?: Record<string, string> }>}
 */
export const resolveLatestPackageVersion = async (pkgName, projectRegistry, options = {}) => {
  const normProjectReg = normalizeRegistry(projectRegistry);
  const isOfficial = normProjectReg.toLowerCase() === OFFICIAL_REGISTRY.toLowerCase();

  if (isOfficial) {
    const meta = await fetchPackageMetadata(pkgName, OFFICIAL_REGISTRY, options);
    return {
      resolvedVersion: meta?.latest || null,
      peerDependencies: meta?.peerDependencies,
    };
  }

  // 非官方源（如 npmmirror/私有源）：并发查询项目 registry 与官方 npmjs
  const [projectResult, officialResult] = await Promise.all([
    fetchPackageMetadata(pkgName, normProjectReg, options),
    fetchPackageMetadata(pkgName, OFFICIAL_REGISTRY, options),
  ]);

  const projectLatest = projectResult?.latest;
  const officialLatest = officialResult?.latest;

  if (!projectLatest && !officialLatest) {
    return { resolvedVersion: null };
  }

  // 若项目源查不到：对公共镜像源（如 npmmirror）允许从 npm 官方源兜底；私有源保持谨慎避免无法下载
  if (!projectLatest) {
    const isPublicMirror = /npmmirror\.com|taobao\.org|cnpmjs\.org/i.test(normProjectReg);
    if (isPublicMirror && officialLatest) {
      const existsInMirror = await checkPackageVersionExists(
        pkgName,
        officialLatest,
        normProjectReg,
        options
      );
      if (existsInMirror) {
        return {
          resolvedVersion: officialLatest,
          warning: `当前源 (${normProjectReg}) 无法获取 ${pkgName} 最新元数据，已从 npm 官方源兜底至最新版本 ${officialLatest}`,
          peerDependencies: officialResult?.peerDependencies,
        };
      }
    }
    return {
      resolvedVersion: null,
      warning: `当前源 (${normProjectReg}) 无法获取 ${pkgName} 最新元数据，已保留模板版本`,
    };
  }

  // 若官方源有更高版本，且项目源尚未同步
  if (officialLatest && compareSemver(officialLatest, projectLatest) > 0) {
    return {
      resolvedVersion: projectLatest,
      warning: `当前源 (${normProjectReg}) 尚未同步 ${pkgName}@${officialLatest}，已退回使用当前可用版本 ${projectLatest}`,
      peerDependencies: projectResult?.peerDependencies,
    };
  }

  return {
    resolvedVersion: projectLatest,
    peerDependencies: projectResult?.peerDependencies,
  };
};

/**
 * 校验新版组件 peer 依赖是否与项目现有依赖冲突，产生友好警告。
 *
 * @param {string} pkgName 包名
 * @param {string} newVersion 新版版本号
 * @param {Record<string, string>} [peerDeps={}] 新版 peerDependencies
 * @param {Record<string, string>} [manifestDeps={}] 项目中已声明的依赖（含 devDeps）
 * @returns {string[]} 警告信息列表
 */
export const checkPeerDependencyConflicts = (pkgName, newVersion, peerDeps = {}, manifestDeps = {}) => {
  const warnings = [];
  const sensitivePeers = ['vue', 'vite', 'ant-design-vue', 'dayjs'];

  for (const peerName of sensitivePeers) {
    const expectedRange = peerDeps[peerName];
    const actualSpec = manifestDeps[peerName];
    if (expectedRange && actualSpec) {
      const { version: actualVersion } = parseVersionSpec(actualSpec);
      // 简单判断主版本号差异，若主版本不匹配则输出 warn
      const expTuple = parseSemverTuple(expectedRange);
      const actTuple = parseSemverTuple(actualVersion);
      if (expTuple && actTuple && expTuple[0] !== actTuple[0]) {
        warnings.push(
          `新版 ${pkgName}@${newVersion} 的 peer 依赖 ${peerName} (${expectedRange}) 与模板声明版本 (${actualSpec}) 可能存在主版本冲突`
        );
      }
    }
  }

  return warnings;
};

/**
 * 尝试运行 pnpm install --lockfile-only --ignore-scripts 重新生成根目录 pnpm-lock.yaml。
 * 超时后主动杀死子进程并等待其彻底退出后再返回，杜绝后台进程异步写回锁文件的竞争态。
 *
 * @param {string} projectRoot 项目根目录
 * @param {{ spawnImpl?: typeof spawn, timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} 是否成功更新 lockfile
 */
export const tryRegenerateLockfile = (projectRoot, options = {}) => {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = options.timeoutMs ?? LOCKFILE_REFRESH_TIMEOUT_MS;
  const isWin = process.platform === 'win32';

  return new Promise(resolve => {
    let child;
    try {
      child = spawnImpl('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
        cwd: projectRoot,
        stdio: 'ignore',
        shell: isWin,
      });
    } catch {
      resolve(false);
      return;
    }

    let timedOut = false;
    let settled = false;
    let timer = null;
    let forceKillTimer = null;
    let fallbackTimer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };

    const finish = success => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(success);
    };

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}

      // 若 SIGTERM 后 2 秒仍未退出，发送 SIGKILL 强杀
      forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}

        // 强杀后兜底定时器，防止某些特殊环境未派发 exit 导致 Promise 永久挂起
        fallbackTimer = setTimeout(() => finish(false), 1000);
      }, 2000);
    }, timeoutMs);

    child.once('error', () => {
      finish(false);
    });

    child.once('exit', code => {
      finish(!timedOut && code === 0);
    });
  });
};

/**
 * 完成并结算 Lockfile 锁定状态（支持独立或延迟调用，避免在用户确认 install 前白跑 lockfile-only）。
 *
 * @param {string} targetProjectRoot 项目根目录
 * @param {object} [options] 控制选项
 * @param {boolean} [options.hasVersionChange=false] 依赖版本是否有实际更新
 * @param {boolean} [options.install=false] 用户是否选择了立即安装依赖
 * @param {typeof spawn} [options.spawnImpl=spawn] spawn 注入实现
 * @param {(msg: string) => void} [options.onProgress] 进度回调
 * @returns {Promise<{ lockfile: 'regenerated' | 'removed' | 'unchanged', warnings: string[] }>}
 */
export const finalizeLockfile = async (targetProjectRoot, options = {}) => {
  const { hasVersionChange = false, install = false, spawnImpl = spawn, onProgress = () => undefined } = options;

  const lockfilePath = path.join(targetProjectRoot, 'pnpm-lock.yaml');
  const lockfileExists = await pathExists(lockfilePath);

  if (!hasVersionChange || !lockfileExists) {
    return { lockfile: 'unchanged', warnings: [] };
  }

  if (install) {
    // 随后的 postActions 将直接执行完整 install，由 pnpm 自然重新生成 lockfile
    return { lockfile: 'regenerated', warnings: [] };
  }

  // 没选 install 时：尝试本地 pnpm install --lockfile-only 刷新锁文件
  onProgress('正在刷新 pnpm-lock.yaml 依赖锁定文件...');
  const success = await tryRegenerateLockfile(targetProjectRoot, { spawnImpl });
  if (success) {
    return { lockfile: 'regenerated', warnings: [] };
  }

  // 无 pnpm 或刷新失败：严禁残留不一致锁文件，直接删除并提示
  try {
    await fs.unlink(lockfilePath);
  } catch {}
  return {
    lockfile: 'removed',
    warnings: ['依赖版本已升级，但自动刷新 pnpm-lock.yaml 失败；已删除旧锁文件，请首次启动前运行 pnpm install'],
  };
};

/**
 * 对齐生成项目根目录与 packages 目录下的所有 @yss-ui/* 依赖版本。
 *
 * @param {string} targetProjectRoot 生成项目根目录
 * @param {object} [options] 控制选项
 * @param {boolean} [options.offline=false] 是否离线模式
 * @param {boolean} [options.preferOffline=false] 是否优先离线
 * @param {boolean} [options.syncDeps=true] 是否开启依赖版本同步
 * @param {boolean} [options.install=false] 用户是否选择了随后自动执行 install
 * @param {boolean} [options.deferLockfile=false] 是否推迟处理 lockfile（仅在交互确认后结算）
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch] fetch 注入实现
 * @param {typeof spawn} [options.spawnImpl=spawn] spawn 注入实现
 * @param {(msg: string) => void} [options.onProgress] 进度回调
 * @returns {Promise<{
 *   updates: Array<{ name: string, file: string, from: string, to: string, status: 'updated' | 'unchanged' | 'failed' | 'skipped', registry?: string }>,
 *   lockfile: 'regenerated' | 'removed' | 'unchanged' | 'pending',
 *   hasVersionChange: boolean,
 *   warnings: string[],
 * }>}
 */
export const syncDependencies = async (targetProjectRoot, options = {}) => {
  const {
    offline = false,
    preferOffline = false,
    syncDeps = true,
    install = false,
    deferLockfile = false,
    fetchImpl = globalThis.fetch,
    spawnImpl = spawn,
    env = process.env,
    onProgress = () => undefined,
  } = options;

  const targetFiles = [
    { relPath: 'package.json', absPath: path.join(targetProjectRoot, 'package.json') },
    { relPath: 'packages/package.json', absPath: path.join(targetProjectRoot, 'packages/package.json') },
  ];

  const updates = [];
  const warnings = [];

  // 1. 若显式关闭 --no-sync-deps，直接返回
  if (syncDeps === false) {
    return { updates, lockfile: 'unchanged', hasVersionChange: false, warnings };
  }

  // 2. 收集两个 package.json 内的标准 @yss-ui/* 依赖项（复杂写法跳过）
  const fileContents = new Map();
  const pkgMap = new Map(); // pkgName -> Array<{ relPath, section, originalSpec, parsed }>

  for (const { relPath, absPath } of targetFiles) {
    if (await pathExists(absPath)) {
      try {
        const raw = await fs.readFile(absPath, 'utf8');
        const json = JSON.parse(raw);
        fileContents.set(relPath, json);

        for (const section of ['dependencies', 'devDependencies']) {
          if (json[section] && typeof json[section] === 'object') {
            for (const [depName, spec] of Object.entries(json[section])) {
              if (depName.startsWith('@yss-ui/')) {
                const parsed = parseVersionSpec(spec);
                // 仅处理 ^、~ 和精确 SemVer 版本；复杂写法（如 workspace:*、latest、>=1.0 等）跳过不改动
                if (!parsed.isStandard) {
                  continue;
                }
                if (!pkgMap.has(depName)) {
                  pkgMap.set(depName, []);
                }
                pkgMap.get(depName).push({ relPath, section, originalSpec: String(spec), parsed });
              }
            }
          }
        }
      } catch {}
    }
  }

  if (pkgMap.size === 0) {
    return { updates, lockfile: 'unchanged', hasVersionChange: false, warnings };
  }

  // 3. 解析 registry
  const projectRegistry = await resolveProjectRegistry(targetProjectRoot, env);

  // 4. 若为 offline 模式，完全跳过网络请求
  if (offline) {
    for (const [depName, occurrences] of pkgMap.entries()) {
      for (const occ of occurrences) {
        updates.push({
          name: depName,
          file: occ.relPath,
          from: occ.originalSpec,
          to: occ.originalSpec,
          status: 'skipped',
          registry: projectRegistry,
        });
      }
    }
    return { updates, lockfile: 'unchanged', hasVersionChange: false, warnings };
  }

  // 5. 并发向 registry 查询最新版本（总体超时保护）
  onProgress(`正在查询 @yss-ui/* 最新版本 (registry: ${projectRegistry})...`);
  const totalController = new AbortController();
  const totalTimer = setTimeout(() => totalController.abort(), TOTAL_QUERY_TIMEOUT_MS);

  const queryPromises = Array.from(pkgMap.keys()).map(async pkgName => {
    try {
      const res = await resolveLatestPackageVersion(pkgName, projectRegistry, {
        timeoutMs: SINGLE_PKG_TIMEOUT_MS,
        fetchImpl,
        signal: totalController.signal,
      });
      return { pkgName, ...res };
    } catch {
      return { pkgName, resolvedVersion: null };
    }
  });

  const queryResults = await Promise.all(queryPromises);
  clearTimeout(totalTimer);

  const resultMap = new Map();
  for (const item of queryResults) {
    resultMap.set(item.pkgName, item);
  }

  // 6. 应用版本更新并写回 package.json
  let hasVersionChange = false;

  for (const [pkgName, occurrences] of pkgMap.entries()) {
    const queryInfo = resultMap.get(pkgName);
    const resolvedVersion = queryInfo?.resolvedVersion;

    for (const occ of occurrences) {
      const { prefix, version: currentVer } = occ.parsed;

      if (!resolvedVersion) {
        if (!preferOffline) {
          if (queryInfo?.warning) {
            if (!warnings.includes(queryInfo.warning)) {
              warnings.push(queryInfo.warning);
            }
          } else {
            const defaultFailWarning = `查询 ${pkgName} 最新版本失败或超时，已保留原版本 ${occ.originalSpec}`;
            if (!warnings.includes(defaultFailWarning)) {
              warnings.push(defaultFailWarning);
            }
          }
        }
        updates.push({
          name: pkgName,
          file: occ.relPath,
          from: occ.originalSpec,
          to: occ.originalSpec,
          status: 'failed',
          registry: projectRegistry,
        });
        continue;
      }

      // 只有查到的版本严格高于模板当前声明版本时才更新；等于或低于时不改动（防止镜像滞后导致降级）
      const targetSpec = `${prefix}${resolvedVersion}`;
      if (compareSemver(resolvedVersion, currentVer) <= 0 || targetSpec === occ.originalSpec) {
        updates.push({
          name: pkgName,
          file: occ.relPath,
          from: occ.originalSpec,
          to: occ.originalSpec,
          status: 'unchanged',
          registry: projectRegistry,
        });
        continue;
      }

      // 存在版本升级变更
      hasVersionChange = true;
      if (queryInfo?.warning && !preferOffline && !warnings.includes(queryInfo.warning)) {
        warnings.push(queryInfo.warning);
      }

      const fileJson = fileContents.get(occ.relPath);
      if (fileJson && fileJson[occ.section]) {
        fileJson[occ.section][pkgName] = targetSpec;
      }

      updates.push({
        name: pkgName,
        file: occ.relPath,
        from: occ.originalSpec,
        to: targetSpec,
        status: 'updated',
        registry: projectRegistry,
      });

      // 校验 peer 依赖冲突
      if (queryInfo.peerDependencies) {
        const fileDeps = { ...(fileJson?.dependencies || {}), ...(fileJson?.devDependencies || {}) };
        const peerConflicts = checkPeerDependencyConflicts(
          pkgName,
          resolvedVersion,
          queryInfo.peerDependencies,
          fileDeps
        );
        warnings.push(...peerConflicts);
      }
    }
  }

  // 7. 写回已修改的 package.json
  if (hasVersionChange) {
    for (const { relPath, absPath } of targetFiles) {
      const updatedJson = fileContents.get(relPath);
      if (updatedJson) {
        await fs.writeFile(absPath, `${JSON.stringify(updatedJson, null, 2)}\n`, 'utf8');
      }
    }
  }

  // 8. 处理 lockfile
  if (deferLockfile) {
    return {
      updates,
      lockfile: 'pending',
      hasVersionChange,
      warnings,
    };
  }

  const lockResult = await finalizeLockfile(targetProjectRoot, {
    hasVersionChange,
    install,
    spawnImpl,
    onProgress,
  });

  return {
    updates,
    lockfile: lockResult.lockfile,
    hasVersionChange,
    warnings: [...warnings, ...lockResult.warnings],
  };
};
