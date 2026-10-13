/**
 * @fileoverview 包管理器识别与后续引导提示。
 */

import path from 'node:path';
import { EXIT_CODES, YssCreateError } from './core/index.mjs';

/** 支持的包管理器白名单。 */
export const SUPPORTED_PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn'];

/**
 * 校验用户显式指定的包管理器是否在白名单内。
 *
 * @param {string | undefined} specifiedPm 用户显式指定的包管理器
 * @returns {'pnpm' | 'npm' | 'yarn' | undefined} 规范化后的值；未指定时返回 undefined
 */
export const assertSupportedPackageManager = specifiedPm => {
  if (specifiedPm === undefined || specifiedPm === null || specifiedPm === '') {
    return undefined;
  }
  const normalized = String(specifiedPm).trim().toLowerCase();
  if (!SUPPORTED_PACKAGE_MANAGERS.includes(normalized)) {
    throw new YssCreateError(`--pm 只支持 ${SUPPORTED_PACKAGE_MANAGERS.join('、')}，收到: ${specifiedPm}`, {
      code: 'INVALID_PACKAGE_MANAGER',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '例如 --pm pnpm',
    });
  }
  return normalized;
};

/**
 * 检测当前环境或指定的包管理器。
 *
 * @param {string} [specifiedPm] 用户显式指定的包管理器
 * @returns {'pnpm' | 'npm' | 'yarn'} 识别出的包管理器
 */
export const detectPackageManager = specifiedPm => {
  const explicit = assertSupportedPackageManager(specifiedPm);
  if (explicit) {
    return explicit;
  }

  // 模板项目为固定 pnpm workspace，未显式指定时统一使用 pnpm
  return 'pnpm';
};

/**
 * 生成进入项目目录的 cd 命令参数：位于当前目录下时使用相对路径，否则使用绝对路径。
 *
 * @param {string} targetPath 项目根目录绝对路径
 * @param {string} [cwd=process.cwd()] 当前工作目录
 * @returns {string} 可直接拼接到 cd 后的路径（含空格时加引号）；已在目标目录时返回空串
 */
export const formatCdPath = (targetPath, cwd = process.cwd()) => {
  const absolute = path.resolve(targetPath);
  if (absolute === path.resolve(cwd)) {
    return '';
  }
  const relative = path.relative(cwd, absolute);
  const isInsideCwd = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  const display = isInsideCwd ? relative : absolute;
  return /\s/.test(display) ? `"${display}"` : display;
};

/**
 * 生成创建成功后的控制台操作引导命令。
 *
 * @param {object} params 项目信息
 * @param {string} params.targetPath 项目根目录绝对路径
 * @param {number} params.port 本地端口
 * @param {string} params.activeRule 激活路由
 * @param {'pnpm' | 'npm' | 'yarn'} params.pm 使用的包管理器
 * @returns {string[]} 引导指令数组
 */
export const getNextSteps = ({ targetPath, port, activeRule, pm = 'pnpm' }) => {
  const cdPath = formatCdPath(targetPath);
  const runDevCmd = pm === 'npm' ? 'npm run dev' : `${pm} dev`;

  const steps = [];
  if (cdPath) {
    steps.push(`cd ${cdPath}`);
  }
  steps.push(`${pm} install`);
  steps.push(runDevCmd);
  steps.push(`浏览器访问: http://localhost:${port}`);
  steps.push(`微前端主应用注册: activeRule 为 "${activeRule}"`);

  return steps;
};
