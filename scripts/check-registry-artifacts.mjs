#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 发布前必须验证的组件包运行时依赖。 */
const TARGET_DEPENDENCIES = ['vxe-table', 'vxe-pc-ui'];
/** 默认组件包清单路径。 */
const DEFAULT_PACKAGE_JSON = path.resolve('packages/components/package.json');
/** 默认项目级 npmrc 路径。 */
const DEFAULT_NPMRC = path.resolve('.npmrc');
/** 单次 Registry 请求超时时间。 */
const DEFAULT_TIMEOUT_MS = Number(process.env.REGISTRY_CHECK_TIMEOUT_MS) || 30_000;
/** Registry 短暂故障的最大尝试次数。 */
const DEFAULT_MAX_ATTEMPTS = Number(process.env.REGISTRY_CHECK_MAX_ATTEMPTS) || 5;
/** Registry 重试的基础退避时间。 */
const DEFAULT_RETRY_DELAY_MS = Number(process.env.REGISTRY_CHECK_RETRY_DELAY_MS) || 1_000;

/**
 * 判断依赖声明是否为精确语义化版本。
 *
 * @param {string} version - 依赖版本声明
 * @returns {boolean} 是否为精确版本
 */
export const isExactVersion = version => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);

/**
 * 标准化 Registry 地址，保证末尾包含斜杠。
 *
 * @param {string} registry - Registry 地址
 * @returns {string} 标准化后的地址
 */
export const normalizeRegistry = registry => `${registry.trim().replace(/\/+$/, '')}/`;

/**
 * 将元数据中的 tarball 转换为通过当前 Registry 访问的地址。
 * 当元数据中的 tarball 仍指向历史/上游源 host 时，重写为当前 Registry 路径以保证内网与镜像可达。
 *
 * @param {string} rawTarball - 元数据中的原始 tarball 地址
 * @param {string} registry - 当前 Registry 地址
 * @returns {string} 可用的 tarball 地址
 */
export const resolveTarballUrl = (rawTarball, registry) => {
  const normalizedRegistry = normalizeRegistry(registry);
  try {
    const rawUrl = new URL(rawTarball, normalizedRegistry);
    const registryUrl = new URL(normalizedRegistry);
    if (rawUrl.host === registryUrl.host && rawUrl.pathname.startsWith(registryUrl.pathname)) {
      return rawUrl.toString();
    }
    const tarballPath = rawUrl.pathname.replace(/^\/+/, '');
    return new URL(tarballPath, normalizedRegistry).toString();
  } catch (_) {
    return rawTarball;
  }
};

/**
 * 从 npmrc 文本读取默认 Registry。
 *
 * @param {string} content - npmrc 文件内容
 * @returns {string | undefined} Registry 地址
 */
export const parseRegistryFromNpmrc = content => {
  const line = content
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => item && !item.startsWith('#') && item.startsWith('registry='));
  return line?.slice('registry='.length).trim() || undefined;
};

/**
 * 解析当前项目用于拉取依赖的 Registry。
 *
 * @param {{ registry?: string, npmrcPath?: string }} [options] - Registry 与 npmrc 配置
 * @returns {string} 当前 Registry 地址
 */
export const resolveRegistry = (options = {}) => {
  const npmrcPath = options.npmrcPath ?? DEFAULT_NPMRC;
  const npmrcRegistry = fs.existsSync(npmrcPath)
    ? parseRegistryFromNpmrc(fs.readFileSync(npmrcPath, 'utf8'))
    : undefined;
  const registry = options.registry ?? process.env.NPM_REGISTRY_URL ?? process.env.NPM_CONFIG_REGISTRY ?? npmrcRegistry;
  if (!registry) {
    throw new Error('未找到依赖 Registry，请配置 NPM_REGISTRY_URL、NPM_CONFIG_REGISTRY 或项目 .npmrc');
  }
  return normalizeRegistry(registry);
};

/**
 * 读取并校验组件包中需要预检的精确依赖组合。
 *
 * @param {string} [packageJsonPath] - 组件包 package.json 路径
 * @returns {Array<{name: string, version: string}>} 待检查依赖列表
 */
export const resolveArtifactPlan = (packageJsonPath = DEFAULT_PACKAGE_JSON) => {
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return TARGET_DEPENDENCIES.map(name => {
    const version = manifest.dependencies?.[name];
    if (!version) {
      throw new Error(`${manifest.name ?? packageJsonPath} 缺少运行时依赖 ${name}`);
    }
    if (!isExactVersion(version)) {
      throw new Error(`${name} 必须使用精确版本，当前声明为 ${version}`);
    }
    return { name, version };
  });
};

/**
 * 判断 HTTP 状态是否属于可重试的短暂故障。
 *
 * @param {number} status - HTTP 状态码
 * @returns {boolean} 是否可重试
 */
export const isRetryableStatus = status => status === 408 || status === 425 || status === 429 || status >= 500;

/**
 * 延迟指定时间后继续执行。
 *
 * @param {number} duration - 延迟毫秒数
 * @returns {Promise<void>} 延迟完成
 */
const wait = duration => new Promise(resolve => setTimeout(resolve, duration));

/**
 * 请求 Registry，仅对网络异常、超时、429 与 5xx 进行有限重试。
 *
 * @param {string} url - 请求地址
 * @param {RequestInit} options - fetch 参数
 * @param {typeof fetch} fetchImpl - fetch 实现
 * @param {{ timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} [retryOptions] - 重试参数
 * @returns {Promise<Response>} HTTP 响应
 */
export const fetchWithRetry = async (url, options, fetchImpl, retryOptions = {}) => {
  const timeoutMs = retryOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = retryOptions.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = retryOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!isRetryableStatus(response.status) || attempt === maxAttempts) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === maxAttempts) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`请求连续 ${maxAttempts} 次失败: ${url} (${reason})`, { cause: error });
      }
    }
    await wait(retryDelayMs * attempt);
  }

  throw new Error(`请求未返回结果: ${url}`);
};

/**
 * 请求 JSON，并在失败时给出明确的制品上下文。
 *
 * @param {string} url - 请求地址
 * @param {typeof fetch} fetchImpl - fetch 实现
 * @param {{ timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} [retryOptions] - 重试参数
 * @returns {Promise<Record<string, any>>} JSON 响应
 */
const fetchJson = async (url, fetchImpl, retryOptions) => {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
      },
    },
    fetchImpl,
    retryOptions
  );
  if (!response.ok) {
    throw new Error(`元数据请求失败 ${response.status}: ${url}`);
  }
  return response.json();
};

/**
 * 校验单个依赖的 Registry 元数据与 tgz 是否均可访问。
 *
 * @param {{ name: string, version: string, registry: string, fetchImpl?: typeof fetch, timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} input - 检查参数
 * @returns {Promise<{name: string, version: string, tarball: string}>} 已验证制品信息
 */
export const checkDependencyArtifact = async input => {
  const { name, version, registry, fetchImpl = fetch, timeoutMs, maxAttempts, retryDelayMs } = input;
  const retryOptions = { timeoutMs, maxAttempts, retryDelayMs };
  const metadataPath = `${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const metadataUrl = new URL(metadataPath, normalizeRegistry(registry)).toString();
  const metadata = await fetchJson(metadataUrl, fetchImpl, retryOptions);
  const rawTarball = metadata.dist?.tarball;
  if (!rawTarball) {
    throw new Error(`${name}@${version} 的 Registry 元数据中缺少 dist.tarball`);
  }
  const tarball = resolveTarballUrl(rawTarball, registry);

  const response = await fetchWithRetry(
    tarball,
    {
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
    },
    fetchImpl,
    retryOptions
  );
  if (!response.ok) {
    throw new Error(`${name}@${version} tgz 请求失败 ${response.status}: ${tarball}`);
  }
  await response.body?.cancel();
  return { name, version, tarball };
};

/**
 * 执行组件包第三方运行时制品预检。
 *
 * @param {{ packageJsonPath?: string, registry?: string, npmrcPath?: string, fetchImpl?: typeof fetch, timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} [options] - 检查配置
 * @returns {Promise<Array<{name: string, version: string, tarball: string}>>} 检查结果
 */
export const checkRegistryArtifacts = async (options = {}) => {
  const registry = resolveRegistry(options);
  const plan = resolveArtifactPlan(options.packageJsonPath);
  const results = [];
  for (const dependency of plan) {
    const result = await checkDependencyArtifact({
      ...dependency,
      registry,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      maxAttempts: options.maxAttempts,
      retryDelayMs: options.retryDelayMs,
    });
    results.push(result);
  }
  return results;
};

/**
 * 解析命令行参数。
 *
 * @param {string[]} argv - 命令行参数
 * @returns {{ packageJsonPath?: string, registry?: string, timeoutMs?: number, maxAttempts?: number }} 检查配置
 */
const parseArgs = argv => {
  const options = {};
  for (const argument of argv.slice(2)) {
    if (argument.startsWith('--package-json=')) options.packageJsonPath = path.resolve(argument.slice(15));
    if (argument.startsWith('--registry=')) options.registry = argument.slice(11);
    if (argument.startsWith('--timeout-ms=')) options.timeoutMs = Number(argument.slice(13));
    if (argument.startsWith('--max-attempts=')) options.maxAttempts = Number(argument.slice(15));
  }
  return options;
};

/** 执行 CLI 并输出可审计结果。 */
const main = async () => {
  const options = parseArgs(process.argv);
  const registry = resolveRegistry(options);
  console.log(`[registry-check] Registry: ${registry}`);
  const results = await checkRegistryArtifacts({ ...options, registry });
  results.forEach(item => {
    console.log(`[registry-check] OK ${item.name}@${item.version}`);
  });
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`[registry-check] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
