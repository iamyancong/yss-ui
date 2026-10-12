/**
 * @fileoverview 模板缓存拉取与同步模块。
 * 纯 Node 原生 child_process 与 fs 实现，零第三方依赖。
 */

import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { EXIT_CODES } from './constants.mjs';
import { YssCreateError } from './errors.mjs';
import { pathExists, resolveSafeCacheDir } from './validate.mjs';

const execFile = promisify(execFileCallback);

/**
 * 安全执行 Git 命令。
 *
 * @param {string[]} args Git 命令行参数数组
 * @param {string | undefined} cwd 工作目录
 * @returns {Promise<string>} 标准输出内容
 */
export const runGit = async (args, cwd) => {
  try {
    const { stdout = '' } = await execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new YssCreateError(`Git 操作失败 (${args.join(' ')}): ${message}`, {
      code: 'GIT_ERROR',
      exitCode: EXIT_CODES.TEMPLATE_SYNC_FAILED,
      hint: '请检查网络连接、Git 安装状态或仓库访问权限',
    });
  }
};

/**
 * 同步微应用模板并返回最新 commit 哈希。
 *
 * @param {{ url: string, branch: string, cacheDir: string, offline?: boolean, preferOffline?: boolean }} params 同步参数
 * @param {((message: string) => void)} [onProgress] 进度回调函数
 * @returns {Promise<{ commit: string, cached: boolean }>}
 */
export const syncTemplate = async (
  { url, branch, cacheDir, offline = false, preferOffline = false },
  onProgress = () => undefined
) => {
  const safeCacheDir = resolveSafeCacheDir(cacheDir);
  const cacheExists = await pathExists(safeCacheDir);

  if (!cacheExists) {
    if (offline) {
      throw new YssCreateError(`离线模式 (--offline) 下未找到本地模板缓存: ${safeCacheDir}`, {
        code: 'OFFLINE_NO_CACHE',
        exitCode: EXIT_CODES.TEMPLATE_SYNC_FAILED,
        hint: '请先在联网环境下执行一次以建立本地模板缓存，或移除 --offline 参数',
      });
    }

    onProgress(`正在克隆模板仓库到本地缓存: ${url} (分支: ${branch})`);
    await runGit(['clone', '--branch', branch, '--single-branch', '--', url, safeCacheDir]);
    const commit = await runGit(['rev-parse', 'HEAD'], safeCacheDir);
    return { commit, cached: false };
  }

  const gitDir = path.join(safeCacheDir, '.git');
  if (!(await pathExists(gitDir))) {
    throw new YssCreateError(`模板缓存目录已存在但不是合法的 Git 仓库: ${safeCacheDir}`, {
      code: 'INVALID_CACHE_REPO',
      exitCode: EXIT_CODES.TEMPLATE_SYNC_FAILED,
      hint: `请手动删除已损坏的缓存目录: rm -rf "${safeCacheDir}"`,
    });
  }

  const currentRemote = await runGit(['config', '--get', 'remote.origin.url'], safeCacheDir);
  if (currentRemote !== url) {
    throw new YssCreateError(`模板缓存仓库 remote 不匹配，期望 ${url}，实际为 ${currentRemote}`, {
      code: 'REMOTE_MISMATCH',
      exitCode: EXIT_CODES.TEMPLATE_SYNC_FAILED,
      hint: `请删除旧缓存或使用独立的 --cache-dir: rm -rf "${safeCacheDir}"`,
    });
  }

  if (offline || preferOffline) {
    onProgress('命中本地模板缓存，离线/优先离线模式跳过网络拉取');
    const commit = await runGit(['rev-parse', 'HEAD'], safeCacheDir);
    return { commit, cached: true };
  }

  onProgress(`正在更新本地模板缓存 (${branch})...`);
  await runGit(['fetch', 'origin', branch], safeCacheDir);
  await runGit(['reset', '--hard', `origin/${branch}`], safeCacheDir);
  await runGit(['clean', '-fd'], safeCacheDir);
  const commit = await runGit(['rev-parse', 'HEAD'], safeCacheDir);

  return { commit, cached: true };
};
