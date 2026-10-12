/**
 * @fileoverview 脚手架统一错误定义与退出码映射。
 */

import { EXIT_CODES } from './constants.mjs';

/**
 * 脚手架业务异常基类。
 */
export class YssCreateError extends Error {
  /**
   * @param {string} message 错误描述文案
   * @param {{ code?: string, exitCode?: number, hint?: string }} [options] 错误元信息
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'YssCreateError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.exitCode = options.exitCode ?? EXIT_CODES.UNKNOWN_ERROR;
    this.hint = options.hint || '';
  }
}

/**
 * 计划校验异常（文件损坏、签名无效、参数非法或目标已存在），统一退出码 4。
 */
export class PlanMismatchError extends YssCreateError {
  /**
   * @param {string} [message] 错误信息
   * @param {string} [hint] 解决方案提示
   * @param {string} [code='PLAN_MISMATCH'] 细分错误码，如 PLAN_INVALID、PLAN_TARGET_EXISTS
   */
  constructor(
    message = '创建计划 (plan) 校验失败，计划内容已被篡改或与目标状态不一致',
    hint = '请重新执行 --plan-out 生成有效计划文件，或检查文件是否被修改',
    code = 'PLAN_MISMATCH'
  ) {
    super(message, {
      code,
      exitCode: EXIT_CODES.PLAN_MISMATCH,
      hint,
    });
    this.name = 'PlanMismatchError';
  }
}
