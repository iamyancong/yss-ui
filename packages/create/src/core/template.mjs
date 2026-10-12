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

/** git clone 自身的进度行（如 "Cloning into ..."），不属于失败原因。 */
const GIT_PROGRESS_LINE = /^(Cloning into |正克隆到)/;

/**
 * 从 git 子进程异常中提取真实失败原因，去掉 Node 拼接的 "Command failed: ..." 与 clone 进度行。
 *
 * @param {unknown} error execFile 抛出的异常
 * @returns {string} 失败原因；无 stderr 时退回异常信息首行
 */
export const getGitErrorDetail = error => {
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
  const lines = stderr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !GIT_PROGRESS_LINE.test(line));
  if (lines.length > 0) return lines.join('\n');
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0];
};

/**
 * 根据 git 失败原因给出一句话诊断。
 *
 * @param {string} detail getGitErrorDetail 的结果
 * @returns {string} 诊断文案；无法归类时返回空串
 */
export const diagnoseGitFailure = detail => {
  if (/could not read Username|Authentication failed|Access denied|HTTP Basic|\b40[13]\b/i.test(detail)) {
    return '认证失败：当前环境没有该仓库的访问凭据或权限';
  }
  if (/Remote branch .* not found|couldn't find remote ref/i.test(detail)) {
    return '模板仓库中不存在指定分支';
  }
  if (/Repository not found|not found|\b404\b|未找到/i.test(detail)) {
    return '模板仓库不存在，或当前账号无权访问';
  }
  if (
    /Could not resolve host|Failed to connect|Couldn't connect|Connection (timed out|refused)|Empty reply|timed out/i.test(
      detail
    )
  ) {
    return '无法连接模板仓库所在服务器';
  }
  return '';
};

/**
 * 模板仓库拉取失败时的统一处置建议。
 * TODO (#52): 仅默认模板地址提示 GitHub，自定义地址改为提示检查该地址的可访问性与权限。
 */
const TEMPLATE_ACCESS_HINT =
  '请检查能否访问 GitHub，或通过 --template-url / 环境变量 YSS_FRONTEND_TEMPLATE_URL 指定其他模板';

/**
 * 安全执行 Git 命令。
 *
 * @param {string[]} args Git 命令行参数数组
 * @param {string | undefined} cwd 工作目录
 * @param {{ allowPrompt?: boolean, failure?: { message: string, code: string, hint: string } }} [options]
 *   allowPrompt 为 false 时禁用 git 终端凭据提示（无人值守场景快速失败而不是挂起）；
 *   failure 用于替换默认的报错文案
 * @returns {Promise<string>} 标准输出内容
 */
export const runGit = async (args, cwd, { allowPrompt = false, failure } = {}) => {
  // TODO (#52): clone/fetch 增加超时（退出码 5），非交互模式补充 GCM_INTERACTIVE=never。
  const env = allowPrompt ? process.env : { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  try {
    const { stdout = '' } = await execFile('git', args, { cwd, env, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const detail = getGitErrorDetail(error);
    const diagnosis = diagnoseGitFailure(detail);
    const reason = diagnosis ? `${diagnosis}\n${detail}` : detail;
    throw new YssCreateError(failure ? `${failure.message}\n${reason}` : `Git 操作失败 (git ${args[0]}): ${reason}`, {
      code: failure?.code || 'GIT_ERROR',
      exitCode: EXIT_CODES.TEMPLATE_SYNC_FAILED,
      hint: failure?.hint || '请检查 Git 安装状态与模板缓存目录',
    });
  }
};

/**
 * 同步微应用模板并返回最新 commit 哈希。
 *
 * @param {{ url: string, branch: string, cacheDir: string, offline?: boolean, preferOffline?: boolean, allowGitPrompt?: boolean }} params
 *   同步参数；allowGitPrompt 为 true 时允许 git 在终端询问账号密码（仅交互模式）
 * @param {((message: string) => void)} [onProgress] 进度回调函数
 * @returns {Promise<{ commit: string, cached: boolean }>}
 */
export const syncTemplate = async (
  { url, branch, cacheDir, offline = false, preferOffline = false, allowGitPrompt = false },
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
    await runGit(['clone', '--branch', branch, '--single-branch', '--', url, safeCacheDir], undefined, {
      allowPrompt: allowGitPrompt,
      failure: {
        message: `模板仓库拉取失败: ${url} (分支: ${branch})`,
        code: 'TEMPLATE_CLONE_FAILED',
        hint: TEMPLATE_ACCESS_HINT,
      },
    });
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
  await runGit(['fetch', 'origin', branch], safeCacheDir, {
    allowPrompt: allowGitPrompt,
    failure: {
      message: `模板仓库更新失败: ${url} (分支: ${branch})`,
      code: 'TEMPLATE_FETCH_FAILED',
      hint: `${TEMPLATE_ACCESS_HINT}；如需直接使用已有本地缓存，可加 --prefer-offline`,
    },
  });
  await runGit(['reset', '--hard', `origin/${branch}`], safeCacheDir);
  await runGit(['clean', '-fd'], safeCacheDir);
  const commit = await runGit(['rev-parse', 'HEAD'], safeCacheDir);

  return { commit, cached: true };
};
