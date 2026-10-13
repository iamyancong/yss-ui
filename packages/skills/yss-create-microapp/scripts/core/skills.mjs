/**
 * @fileoverview 生成项目的 AI Skills 同步。
 * 模板脚本经 create 调用时以 --skip-skills 跳过自身同步，统一由这里在生成后拉取最新官方 Skills。
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathExists } from './validate.mjs';

/** Skills 同步 CLI 包名；固定 @latest，避免 npx 复用本机缓存的旧版本。 */
export const SKILLS_CLI_SPEC = '@yss-ui/skills-cli@latest';

/** 模板内的 Skills 校验脚本（相对项目根目录），存在时在同步后执行。 */
export const SKILLS_CHECK_SCRIPT = 'scripts/check-skills.mjs';

/** 单个子进程的超时时间（含 npx 首次下载 skills-cli 与拉取 @yss-ui/skills）。 */
export const SKILLS_SYNC_TIMEOUT_MS = 120000;

/** 手动补同步的命令，用于失败或跳过时的提示。 */
export const SKILLS_SYNC_MANUAL_COMMAND = 'npx -y @yss-ui/skills-cli@latest sync';

/** 失败时回显的子进程输出尾部字符数上限。 */
const OUTPUT_TAIL_LIMIT = 4000;

/**
 * 运行子进程并等待退出，不抛错。输出先缓冲，仅失败时把尾部写到 stderr，
 * 既避免 skills-cli 的上百行同步明细刷屏，也保证 --json 模式 stdout 干净。
 *
 * @param {string} command 可执行文件（白名单常量）
 * @param {string[]} args 参数数组
 * @param {{ cwd: string, spawnImpl: typeof spawn, timeoutMs: number, shell: boolean }} options
 * @returns {Promise<{ ok: boolean, reason: string }>} 是否成功及失败原因
 */
const runStep = (command, args, options) =>
  new Promise(resolve => {
    let output = '';
    const collect = chunk => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL_LIMIT);
    };
    const finish = result => {
      if (!result.ok && output.trim()) process.stderr.write(`${output.trimEnd()}\n`);
      resolve(result);
    };

    let child;
    try {
      child = options.spawnImpl(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: options.shell,
      });
    } catch (error) {
      finish({ ok: false, reason: error.message });
      return;
    }
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, reason: `超过 ${Math.round(options.timeoutMs / 1000)}s 未完成` });
    }, options.timeoutMs);

    child.once('error', error => {
      clearTimeout(timer);
      finish({ ok: false, reason: error.message });
    });
    child.once('exit', code => {
      clearTimeout(timer);
      finish(code === 0 ? { ok: true, reason: '' } : { ok: false, reason: `退出码 ${code ?? '未知'}` });
    });
  });

/**
 * 在生成项目内同步最新官方 AI Skills，并在模板提供校验脚本时执行校验。
 * 任何失败都只产生警告，不影响项目创建结果。
 *
 * @param {string} targetProjectRoot 生成项目根目录
 * @param {object} [options] 控制选项
 * @param {boolean} [options.offline=false] 离线模式：不联网，直接跳过
 * @param {typeof spawn} [options.spawnImpl=spawn] spawn 注入实现
 * @param {number} [options.timeoutMs=SKILLS_SYNC_TIMEOUT_MS] 单个子进程超时
 * @returns {Promise<{ status: 'synced' | 'failed' | 'skipped', warnings: string[] }>}
 */
export const syncSkills = async (targetProjectRoot, options = {}) => {
  if (options.offline) {
    return {
      status: 'skipped',
      warnings: [`offline 模式已跳过 AI Skills 同步，联网后可在项目根目录执行 ${SKILLS_SYNC_MANUAL_COMMAND}`],
    };
  }

  const stepOptions = {
    cwd: targetProjectRoot,
    spawnImpl: options.spawnImpl || spawn,
    timeoutMs: options.timeoutMs ?? SKILLS_SYNC_TIMEOUT_MS,
    // Windows 下 npx 是 .cmd 包装脚本，Node 18.20+/20.12+ 禁止无 shell 直接 spawn；参数均为常量
    shell: process.platform === 'win32',
  };

  const synced = await runStep('npx', ['-y', SKILLS_CLI_SPEC, 'sync'], stepOptions);
  if (!synced.ok) {
    return {
      status: 'failed',
      warnings: [`AI Skills 同步失败（${synced.reason}），可稍后在项目根目录执行 ${SKILLS_SYNC_MANUAL_COMMAND}`],
    };
  }

  if (!(await pathExists(path.join(targetProjectRoot, SKILLS_CHECK_SCRIPT)))) {
    return { status: 'synced', warnings: [] };
  }

  const checked = await runStep(process.execPath, [SKILLS_CHECK_SCRIPT], { ...stepOptions, shell: false });
  if (!checked.ok) {
    return {
      status: 'synced',
      warnings: [`AI Skills 已同步，但 ${SKILLS_CHECK_SCRIPT} 校验未通过（${checked.reason}），请查看上方输出`],
    };
  }
  return { status: 'synced', warnings: [] };
};
