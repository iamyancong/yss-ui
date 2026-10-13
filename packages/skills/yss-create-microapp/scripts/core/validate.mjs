/**
 * @fileoverview 核心校验规则与路径/命名推导工具函数。
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE_RULE_PATTERN, APP_NAME_PATTERN, EXIT_CODES } from './constants.mjs';
import { YssCreateError } from './errors.mjs';

/** 默认允许的 URL 协议（代理目标、OpenAPI 地址等只接受 HTTP(S)）。 */
export const HTTP_PROTOCOLS = ['http:', 'https:'];

/** 模板仓库地址允许的协议（额外允许 file:// 以支持本地模板与测试）。 */
export const TEMPLATE_URL_PROTOCOLS = ['http:', 'https:', 'file:'];

/**
 * 校验应用英文名格式。
 *
 * @param {string} value 待校验英文名
 * @returns {string | null} 校验错误提示，校验通过返回 null
 */
export const validateAppName = value => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return '应用英文名 (name) 不能为空';
  }
  const trimmed = value.trim();
  if (!APP_NAME_PATTERN.test(trimmed)) {
    return '应用英文名必须以小写字母开头，仅包含小写字母、数字和中划线，且不能以中划线结尾，例如 order-center、crm';
  }
  return null;
};

/**
 * 校验激活路由格式。
 *
 * @param {string} value 待校验激活路由
 * @returns {string | null} 校验错误提示，校验通过返回 null
 */
export const validateActiveRule = value => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return '激活路由 (activeRule) 不能为空';
  }
  const trimmed = value.trim();
  if (!ACTIVE_RULE_PATTERN.test(trimmed)) {
    return '激活路由必须以 / 开头且仅有一段路径，推荐小驼峰或短横线命名，例如 /orderCenter、/data-service';
  }
  return null;
};

/**
 * 规范化微应用激活路由：确保带 /subApp 前缀，与模板各 .env.* 与 micro-config.json 约定一致。
 *
 * @param {string} rule 原始激活路由
 * @param {string} [appName=''] 兜底应用名
 * @returns {string} 带 /subApp 前缀的规范化激活路由
 */
export const normalizeSubAppActiveRule = (rule, appName = '') => {
  const targetRule = rule ? String(rule).trim() : `/subApp/${appName}`;
  const withLeading = targetRule.startsWith('/') ? targetRule : `/${targetRule}`;
  return withLeading.startsWith('/subApp/') ? withLeading : `/subApp${withLeading}`;
};

/**
 * 将应用英文名转换为单段激活路由，优先小驼峰，推导结果不合法时退回短横线形式。
 *
 * 雨燕规则要求驼峰形式的每一段都以字母开头、短横线形式的首段只能是字母，
 * 因此含数字的名称按以下顺序回退，保证合法 appName 总能得到合法 activeRule：
 * - order-center -> /orderCenter，crm -> /crm
 * - app-1 -> /app1 不合法 -> /app-1
 * - crm2 -> /crm2 不合法 -> 首段字母与数字之间补短横线 -> /crm-2
 *
 * @param {string} appName 应用英文名
 * @returns {string} 推导得到的激活路由
 */
export const toActiveRule = appName => {
  if (!appName || typeof appName !== 'string' || !appName.trim()) {
    return '/micro';
  }
  const trimmed = appName.trim();

  const camelCased = `/${trimmed.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase())}`;
  if (ACTIVE_RULE_PATTERN.test(camelCased)) {
    return camelCased;
  }

  const hyphenated = `/${trimmed}`;
  if (ACTIVE_RULE_PATTERN.test(hyphenated)) {
    return hyphenated;
  }

  return `/${trimmed.replace(/^([a-z]+)(\d)/, '$1-$2')}`;
};

/**
 * 检查路径在文件系统是否存在。
 *
 * @param {string} targetPath 目标路径
 * @returns {Promise<boolean>} 路径是否存在
 */
export const pathExists = async targetPath => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * 校验 URL 格式与协议白名单（默认仅 HTTP(S)）。
 *
 * @param {string} value 待校验 URL
 * @param {string} label 参数名称
 * @param {string[]} [protocols=HTTP_PROTOCOLS] 允许的协议列表（含冒号，如 'http:'）
 * @returns {string} 校验通过的原始字符串
 */
export const validateHttpUrl = (value, label = 'URL', protocols = HTTP_PROTOCOLS) => {
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      throw new Error('协议不在允许范围内');
    }
    return value;
  } catch {
    const allowed = protocols.map(protocol => protocol.replace(/:$/, '')).join('/');
    throw new YssCreateError(`${label} 必须是合法的 ${allowed} URL，例如 http://127.0.0.1:3000`, {
      code: 'INVALID_URL',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: `请检查 --${label} 参数，确保格式符合 URL 规范`,
    });
  }
};

/**
 * 规范化并限制缓存目录仅位于系统临时目录的专属前缀子目录下，防御路径穿越。
 *
 * @param {string} cacheDir 缓存目录路径
 * @returns {string} 安全的绝对路径
 */
export const resolveSafeCacheDir = cacheDir => {
  const resolvedCacheDir = path.resolve(cacheDir);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolvedCacheDir);
  const isInsideTemp = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  const hasDedicatedName = path.basename(resolvedCacheDir).startsWith('yss-frontend-template');

  if (!isInsideTemp || !hasDedicatedName) {
    throw new YssCreateError(`cache-dir 必须位于临时目录 ${tempRoot} 下且子目录名以 yss-frontend-template 开头`, {
      code: 'INVALID_CACHE_DIR',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '建议使用默认缓存目录，或传 --cache-dir /tmp/yss-frontend-template-custom',
    });
  }

  return resolvedCacheDir;
};
