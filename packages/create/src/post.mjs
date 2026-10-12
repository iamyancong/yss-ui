/**
 * @fileoverview 脚手架后续可选操作模块（依赖安装、Skills 同步、Git 初始提交）。
 * 所有子进程均以参数数组方式启动，不经过 shell 解析。
 */

import { execFile as execFileCallback, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { assertSupportedPackageManager } from './pm.mjs';

const execFile = promisify(execFileCallback);

/**
 * Windows 下 pnpm/npm/yarn/npx 均为 .cmd 包装脚本，Node 18.20+/20.12+ 禁止在无 shell 时直接 spawn .cmd，
 * 因此仅在 Windows 上启用 shell；命令与参数全部为白名单常量，不含用户输入。
 */
const needsShell = process.platform === 'win32';

/**
 * 以参数数组方式运行命令并等待退出。
 *
 * @param {string} command 可执行文件名（白名单常量）
 * @param {string[]} args 参数数组
 * @param {string} cwd 工作目录
 * @param {string} failureLabel 失败时的中文描述
 * @returns {Promise<void>}
 */
const runCommand = (command, args, cwd, failureLabel) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: needsShell,
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${failureLabel}失败，退出码: ${code ?? '未知'}`));
    });
  });
};

/**
 * 在项目目录执行依赖安装。
 *
 * @param {string} targetPath 目标项目目录
 * @param {'pnpm' | 'npm' | 'yarn'} pm 包管理器（仅允许 pnpm、npm、yarn）
 * @returns {Promise<void>}
 */
export const runInstall = (targetPath, pm = 'pnpm') => {
  const safePm = assertSupportedPackageManager(pm) || 'pnpm';
  return runCommand(safePm, ['install'], targetPath, '依赖安装');
};

/**
 * 在项目目录同步官方 AI Skills 规范。
 *
 * @param {string} targetPath 目标项目目录
 * @returns {Promise<void>}
 */
export const runSkillsSync = targetPath => {
  return runCommand('npx', ['-y', '@yss-ui/skills-cli', 'sync'], targetPath, 'AI Skills 同步');
};

/**
 * 初始化 Git 仓库并执行首次初始提交。
 *
 * @param {string} targetPath 目标项目目录
 * @returns {Promise<void>}
 */
export const runGitInit = async targetPath => {
  await execFile('git', ['init'], { cwd: targetPath });
  await execFile('git', ['add', '-A'], { cwd: targetPath });
  await execFile('git', ['commit', '-m', 'chore: initial commit from @yss-ui/create'], { cwd: targetPath });
};
