/**
 * @fileoverview 离线可审阅计划 (Plan) 生成与验签模块。
 * 纯 Node 原生 crypto 实现。hash 只用于防误改，执行前仍会重新校验全部参数。
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { PlanMismatchError, YssCreateError } from './errors.mjs';
import { resolveOptions } from './options.mjs';
import { pathExists } from './validate.mjs';

/** 当前计划文件格式版本。 */
export const PLAN_VERSION = 1;

/** 只影响单次运行方式、不应固化到计划中的开关字段。 */
const TRANSIENT_OPTION_KEYS = ['dryRun', 'dry-run'];

/**
 * 序列化计划对象（去除 hash 字段，按键名稳定排序）。
 *
 * @param {Record<string, any>} planData 计划对象
 * @returns {string} 规范化 JSON 字符串
 */
export const canonicalizePlan = planData => {
  const clone = { ...planData };
  delete clone.hash;

  const sortKeys = value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  };

  return JSON.stringify(sortKeys(clone));
};

/**
 * 计算计划规范哈希（sha256）。
 *
 * @param {Record<string, any>} planData 计划对象
 * @returns {string} sha256 十六进制字符串
 */
export const computePlanHash = planData => {
  return crypto.createHash('sha256').update(canonicalizePlan(planData)).digest('hex');
};

/**
 * 根据已解析的配置生成带防误改签名的计划对象。
 *
 * @param {Record<string, any>} resolved 已解析并校验的配置
 * @param {string} [templateCommit=''] 模板 commit 标识
 * @returns {Record<string, any>} 包含 hash 的计划对象
 */
export const createPlan = (resolved, templateCommit = '') => {
  const options = { ...resolved };
  for (const key of TRANSIENT_OPTION_KEYS) {
    delete options[key];
  }

  const targetPath = path.resolve(resolved.targetDir, resolved.name || resolved.appName);
  const planData = {
    version: PLAN_VERSION,
    createdAt: new Date().toISOString(),
    options,
    targetPath,
    templateCommit: String(templateCommit || ''),
  };

  const hash = computePlanHash(planData);
  return {
    ...planData,
    hash,
  };
};

/**
 * 解析计划文件文本，格式错误统一归为计划校验失败（退出码 4）。
 *
 * @param {string} content 计划文件原始内容
 * @param {string} [sourceLabel='plan'] 来源描述，用于错误提示
 * @returns {Record<string, any>} 计划对象
 */
export const parsePlanContent = (content, sourceLabel = 'plan') => {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('计划内容必须是 JSON 对象');
    }
    return parsed;
  } catch (error) {
    throw new PlanMismatchError(
      `计划文件损坏或不是合法 JSON (${sourceLabel}): ${error.message}`,
      '请重新执行 --plan-out 生成计划文件，不要手工编辑',
      'PLAN_INVALID'
    );
  }
};

/**
 * 比较重新解析后的参数与计划中记录的参数是否一致。
 *
 * @param {Record<string, any>} planOptions 计划中记录的参数
 * @param {Record<string, any>} resolved 重新解析得到的参数
 * @returns {string[]} 不一致的字段名
 */
const diffPlanOptions = (planOptions, resolved) => {
  const mismatched = [];
  for (const key of Object.keys(resolved)) {
    if (TRANSIENT_OPTION_KEYS.includes(key)) {
      continue;
    }
    if (canonicalizePlan({ v: planOptions[key] }) !== canonicalizePlan({ v: resolved[key] })) {
      mismatched.push(key);
    }
  }
  return mismatched;
};

/**
 * 校验计划：结构与签名 → 重新按当前规则校验全部参数 → 目标路径未被占用。
 * 任一环节失败均抛出 PlanMismatchError（退出码 4）。
 *
 * @param {Record<string, any>} plan 待校验的计划对象
 * @returns {Promise<{ resolved: Record<string, any>, targetPath: string }>} 重新解析后的参数与目标路径
 */
export const verifyPlan = async plan => {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new PlanMismatchError('计划数据无效：不是 JSON 对象', undefined, 'PLAN_INVALID');
  }
  if (plan.version !== PLAN_VERSION) {
    throw new PlanMismatchError(
      `计划版本不受支持 (version: ${String(plan.version)})，当前仅支持 ${PLAN_VERSION}`,
      '请使用当前版本的 CLI 重新执行 --plan-out 生成计划文件',
      'PLAN_INVALID'
    );
  }
  if (typeof plan.hash !== 'string' || !plan.hash) {
    throw new PlanMismatchError('计划数据无效或缺少 hash 签名', undefined, 'PLAN_INVALID');
  }
  if (!plan.options || typeof plan.options !== 'object' || Array.isArray(plan.options)) {
    throw new PlanMismatchError('计划数据无效：缺少 options 字段', undefined, 'PLAN_INVALID');
  }

  const expectedHash = computePlanHash(plan);
  if (expectedHash !== plan.hash) {
    throw new PlanMismatchError(
      `计划签名不匹配 (当前: ${expectedHash.slice(0, 8)}, 记录: ${plan.hash.slice(0, 8)})，计划内容已被修改`
    );
  }

  // hash 只能防误改：重算 hash 即可绕过，因此执行前必须按当前规则重新校验全部参数。
  let resolved;
  try {
    ({ resolved } = await resolveOptions(plan.options, { probePort: false }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PlanMismatchError(
      `计划中的参数未通过校验: ${reason}`,
      error instanceof YssCreateError && error.hint ? error.hint : undefined,
      'PLAN_INVALID_OPTIONS'
    );
  }

  if (!resolved.name || !resolved.nameZh) {
    throw new PlanMismatchError('计划缺少必填参数 name 或 nameZh', undefined, 'PLAN_INVALID_OPTIONS');
  }

  const mismatched = diffPlanOptions(plan.options, resolved);
  if (mismatched.length > 0) {
    throw new PlanMismatchError(
      `计划参数与当前规则解析结果不一致: ${mismatched.join(', ')}`,
      '请使用当前版本的 CLI 重新执行 --plan-out 生成计划文件'
    );
  }

  const targetPath = path.resolve(resolved.targetDir, resolved.name);
  if (typeof plan.targetPath !== 'string' || path.resolve(plan.targetPath) !== targetPath) {
    throw new PlanMismatchError(`计划 targetPath 与参数推导结果不一致: ${String(plan.targetPath)} ≠ ${targetPath}`);
  }

  if (await pathExists(targetPath)) {
    throw new PlanMismatchError(
      `目标项目目录已存在，已停止以避免覆盖: ${targetPath}`,
      '请更换目标父目录或应用英文名后重新执行 --plan-out',
      'PLAN_TARGET_EXISTS'
    );
  }

  return { resolved, targetPath };
};
