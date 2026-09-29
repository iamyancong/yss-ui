#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SUMMARY_PATH = path.join(ROOT_DIR, 'scripts/.release-summary.json');
const DEFAULT_REGISTRY_DIRECT = 'https://registry-direct.npmmirror.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

/**
 * 读取发版摘要中的待同步包列表。
 *
 * @param {string} summaryPath - 发版摘要文件绝对或相对路径
 * @returns {Array<{name: string, newVersion?: string, oldVersion?: string}>} 待同步包列表
 */
export const readReleaseSummaryPackages = summaryPath => {
  if (!fs.existsSync(summaryPath)) {
    return [];
  }

  let summary;
  try {
    const raw = fs.readFileSync(summaryPath, 'utf8');
    summary = JSON.parse(raw);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[npmmirror-sync] WARN 读取或解析发版摘要失败 (${summaryPath}): ${error?.message || error}`);
    return [];
  }

  if (!summary || !Array.isArray(summary.packages)) {
    return [];
  }

  return summary.packages.filter(item => Boolean(item) && typeof item.name === 'string' && item.name.trim().length > 0);
};

/**
 * 发起单包 npmmirror 同步任务。
 *
 * @param {object} params - 参数对象
 * @param {string} params.name - 包名
 * @param {string} [params.version] - 发布的新版本号（用于日志）
 * @param {string} [params.registryDirect] - npmmirror direct 根地址
 * @param {number} [params.timeoutMs] - 超时时间（毫秒）
 * @param {typeof fetch} [params.fetcher] - 请求方法，支持测试注入
 * @returns {Promise<{name: string, ok: boolean, status?: number, id?: string, state?: string, error?: string}>} 同步结果
 */
export const syncSinglePackage = async ({
  name,
  version,
  registryDirect = DEFAULT_REGISTRY_DIRECT,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetcher = globalThis.fetch,
}) => {
  const endpoint = `${registryDirect.replace(/\/+$/, '')}/-/package/${name}/syncs`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetcher(endpoint, {
      method: 'PUT',
      headers: {
        'User-Agent': 'yss-ui-release-sync',
      },
      signal: controller?.signal,
    });

    const status = response.status;
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      // 容忍非 JSON 响应体
    }

    if (response.ok) {
      const id = data?.id;
      const state = data?.state;
      const desc = [id ? `id: ${id}` : '', state ? `state: ${state}` : ''].filter(Boolean).join(', ');
      // eslint-disable-next-line no-console
      console.log(
        `[npmmirror-sync] OK ${name}${version ? `@${version}` : ''} (HTTP ${status}${desc ? `, ${desc}` : ''})`
      );
      return { name, ok: true, status, id, state };
    }

    const errorMsg = data?.message || `HTTP ${status}`;
    // eslint-disable-next-line no-console
    console.warn(`[npmmirror-sync] WARN ${name}${version ? `@${version}` : ''} 请求返回非 2xx: ${errorMsg}`);
    return { name, ok: false, status, error: errorMsg };
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    const message = isAbort ? `请求超时 (${Math.round(timeoutMs / 1000)}s)` : error?.message || String(error);
    // eslint-disable-next-line no-console
    console.warn(`[npmmirror-sync] WARN ${name}${version ? `@${version}` : ''} 同步请求失败: ${message}`);
    return { name, ok: false, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 根据发版摘要向 npmmirror 触发全量同步。
 *
 * @param {object} [options] - 配置选项
 * @param {string} [options.summaryPath] - 发版摘要路径
 * @param {string} [options.registryDirect] - npmmirror API 地址
 * @param {number} [options.timeoutMs] - 超时毫秒数
 * @param {typeof fetch} [options.fetcher] - fetch 函数注入
 * @returns {Promise<{skipped?: boolean, reason?: string, total: number, succeeded: number, failed: number, results: Array<object>}>}
 */
export const syncNpmmirror = async ({
  summaryPath = DEFAULT_SUMMARY_PATH,
  registryDirect = DEFAULT_REGISTRY_DIRECT,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetcher = globalThis.fetch,
} = {}) => {
  if (!fs.existsSync(summaryPath)) {
    const reason = `未找到发版摘要文件：${summaryPath}`;
    // eslint-disable-next-line no-console
    console.log(`[npmmirror-sync] SKIP ${reason}`);
    return { skipped: true, reason, total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const packages = readReleaseSummaryPackages(summaryPath);
  if (packages.length === 0) {
    const reason = `发版摘要中未包含待同步的有效包：${summaryPath}`;
    // eslint-disable-next-line no-console
    console.log(`[npmmirror-sync] SKIP ${reason}`);
    return { skipped: true, reason, total: 0, succeeded: 0, failed: 0, results: [] };
  }

  // eslint-disable-next-line no-console
  console.log(`[npmmirror-sync] 开始同步本批次发布的 ${packages.length} 个包到 npmmirror...`);

  const results = [];
  for (const item of packages) {
    const result = await syncSinglePackage({
      name: item.name,
      version: item.newVersion,
      registryDirect,
      timeoutMs,
      fetcher,
    });
    results.push(result);
  }

  const succeeded = results.filter(item => item.ok).length;
  const failed = results.length - succeeded;

  // eslint-disable-next-line no-console
  console.log(`[npmmirror-sync] 同步触发完成: 成功 ${succeeded} 个, 失败 ${failed} 个 (共 ${results.length} 个包)`);

  return {
    total: results.length,
    succeeded,
    failed,
    results,
  };
};

/**
 * 解析 CLI 命令行参数。
 *
 * @param {string[]} argv - process.argv
 * @returns {Record<string, any>} 解析后的参数
 */
export const parseArgs = argv => {
  const options = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--summary=')) options.summaryPath = arg.slice('--summary='.length);
    if (arg.startsWith('--registry-direct=')) options.registryDirect = arg.slice('--registry-direct='.length);
    if (arg.startsWith('--timeout-ms=')) options.timeoutMs = parseInt(arg.slice('--timeout-ms='.length), 10);
  }
  return options;
};

// 直接执行入口
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncNpmmirror(parseArgs(process.argv))
    .then(() => {
      // 保持 exit 0，不因镜像同步网络抖动影响整个发布 CI 流程
      process.exitCode = 0;
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.warn(`[npmmirror-sync] 发生意外未捕获异常: ${error?.message || error}`);
      // 依然软退出
      process.exitCode = 0;
    });
}
