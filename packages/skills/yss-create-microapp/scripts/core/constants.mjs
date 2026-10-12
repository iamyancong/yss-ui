/**
 * @fileoverview 脚手架核心常量配置。
 * 纯 ESM，零第三方依赖，供 CLI 与 Skill 共享。
 */

import os from 'node:os';
import path from 'node:path';

/**
 * 允许的应用英文名格式：必须以小写字母开头，由小写字母、数字和中划线组成，不能以中划线结尾。
 * 对齐雨燕 SCAFFOLD_TIPS「必须以字母开头」。
 */
export const APP_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * 允许的激活路由格式：单段路径，支持驼峰（推荐）或短横线（兼容）。
 * 对齐雨燕规则：/^\/(?:[a-z]+(?:[A-Z][a-z0-9]+)*|[a-z]+(?:-[a-z0-9]+)*)$/
 */
export const ACTIVE_RULE_PATTERN = /^\/(?:[a-z]+(?:[A-Z][a-z0-9]+)*|[a-z]+(?:-[a-z0-9]+)*)$/;

/**
 * 允许的 Git 分支名子集，禁止 .. 等路径遍历风险。
 */
export const BRANCH_PATTERN = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;

/**
 * 默认测试网关代理目标（TODO: 由 Ryan 后续提供生产级测试网关地址）。
 */
export const DEFAULT_PROXY_TARGET = 'http://127.0.0.1:3000';

/**
 * 默认微应用模板仓库地址（GitHub 公开仓库）。
 * 环境变量 YSS_FRONTEND_TEMPLATE_URL 由 resolveOptions 在运行时读取。
 */
export const DEFAULT_TEMPLATE_URL = 'https://github.com/iamyancong/microapp-template-vue3.git';

/**
 * 默认微应用模板分支。
 */
export const DEFAULT_TEMPLATE_BRANCH = 'main';

/**
 * 默认模板缓存目录名称（必须以 yss-frontend-template 开头）。
 */
export const DEFAULT_CACHE_DIR_NAME = 'yss-frontend-template-cache';

/**
 * 默认模板缓存绝对路径。
 */
export const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), DEFAULT_CACHE_DIR_NAME);

/**
 * 默认本地服务端口。
 */
export const DEFAULT_PORT = 8081;

/**
 * 核心默认配置集合（纯常量，不含环境变量；环境变量优先级由 resolveOptions 在运行时处理）。
 */
export const DEFAULTS = {
  port: DEFAULT_PORT,
  templateUrl: DEFAULT_TEMPLATE_URL,
  templateBranch: DEFAULT_TEMPLATE_BRANCH,
  cacheDirName: DEFAULT_CACHE_DIR_NAME,
  proxyTarget: DEFAULT_PROXY_TARGET,
};

/**
 * 进程标准退出码。
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  UNKNOWN_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  TARGET_EXISTS: 3,
  PLAN_MISMATCH: 4,
  TEMPLATE_SYNC_FAILED: 5,
  SCAFFOLD_FAILED: 6,
  CANCELLED: 130,
};

/**
 * 脚手架表单与字段中文说明提示。
 */
export const SCAFFOLD_TIPS = {
  appName: '应用英文名，必须以小写字母开头，如 order-center、crm',
  appNameZh: '应用中文名称，如 订单中心、用户管理',
  activeRule: '激活路由，必须以 / 开头且仅有一段，推荐驼峰如 /orderCenter，兼容短横线如 /order-center',
  port: '本地开发启动端口，默认从 8081 开始探测可用端口',
  apiBase: '请求后端接口统一前缀，默认为 /api${activeRule}',
  proxyTarget: '开发环境代理后端目标地址，支持环境变量 YSS_PROXY_TARGET',
};
