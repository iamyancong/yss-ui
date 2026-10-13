/**
 * @fileoverview 配置规范化与优先级解析模块。
 * 负责收集参数来源（user | derived | default | env）、生成警告提示并校验字段合法性。
 */

import path from 'node:path';
import {
  BRANCH_PATTERN,
  DEFAULT_CACHE_DIR,
  DEFAULT_PORT,
  DEFAULT_PROXY_TARGET,
  DEFAULT_TEMPLATE_BRANCH,
  DEFAULT_TEMPLATE_URL,
  EXIT_CODES,
} from './constants.mjs';
import { YssCreateError } from './errors.mjs';
import { probeFreePort } from './port.mjs';
import {
  normalizeSubAppActiveRule,
  resolveSafeCacheDir,
  TEMPLATE_URL_PROTOCOLS,
  toActiveRule,
  validateActiveRule,
  validateAppName,
  validateHttpUrl,
} from './validate.mjs';

/**
 * 规范化参数输入并解析字段来源。
 *
 * @param {Record<string, any>} input 原始参数输入（支持驼峰或短横线属性）
 * @param {{ probePort?: boolean }} [options] 控制选项
 * @returns {Promise<{ resolved: Record<string, any>, sources: Record<string, 'user' | 'derived' | 'default' | 'env'>, warnings: string[], targetPath: string }>}
 */
export const resolveOptions = async (input = {}, options = {}) => {
  const probePortEnabled = options.probePort !== false;
  const sources = {};
  const warnings = [];

  // 1. appName (name)
  const rawName = input.name ?? input.appName ?? input['app-name'];
  const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';
  if (rawName !== undefined && rawName !== null && String(rawName).trim() !== '') {
    sources.name = 'user';
  } else {
    sources.name = 'default';
  }

  // 2. appNameZh (nameZh)
  const rawNameZh = input.nameZh ?? input['name-zh'] ?? input.appNameZh;
  const nameZh = rawNameZh !== undefined && rawNameZh !== null ? String(rawNameZh).trim() : '';
  if (rawNameZh !== undefined && rawNameZh !== null && String(rawNameZh).trim() !== '') {
    sources.nameZh = 'user';
  } else {
    sources.nameZh = 'default';
  }

  // 3. description
  const rawDescription = input.description;
  const description = rawDescription !== undefined && rawDescription !== null ? String(rawDescription).trim() : '';
  if (rawDescription !== undefined && rawDescription !== null && String(rawDescription).trim() !== '') {
    sources.description = 'user';
  } else {
    sources.description = 'default';
  }

  // 校验基础必填项格式（若已提供）
  if (name) {
    const nameError = validateAppName(name);
    if (nameError) {
      throw new YssCreateError(nameError, {
        code: 'INVALID_APP_NAME',
        exitCode: EXIT_CODES.INVALID_ARGUMENTS,
        hint: '请使用类似 order-center、demo-app 的格式',
      });
    }
  }

  // 4. activeRule
  const rawActiveRule = input.activeRule ?? input['active-rule'];
  let activeRule = '';
  if (rawActiveRule !== undefined && rawActiveRule !== null && String(rawActiveRule).trim() !== '') {
    activeRule = String(rawActiveRule).trim();
    sources.activeRule = 'user';
  } else if (name) {
    activeRule = toActiveRule(name);
    sources.activeRule = 'derived';
  } else {
    activeRule = '/micro';
    sources.activeRule = 'default';
  }

  const activeRuleError = validateActiveRule(activeRule);
  if (activeRuleError) {
    throw new YssCreateError(activeRuleError, {
      code: 'INVALID_ACTIVE_RULE',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '请提供形如 /orderCenter 的单段激活路径',
    });
  }

  // 5. port
  const rawPort = input.port;
  let port = DEFAULT_PORT;
  if (rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== '') {
    port = Number(rawPort);
    sources.port = 'user';
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new YssCreateError('port 必须是 1 到 65535 之间的整数', {
        code: 'INVALID_PORT',
        exitCode: EXIT_CODES.INVALID_ARGUMENTS,
        hint: '请传入合法的端口数字，例如 --port 8081',
      });
    }
  } else if (probePortEnabled) {
    const probed = await probeFreePort(DEFAULT_PORT);
    port = probed;
    if (probed === DEFAULT_PORT) {
      sources.port = 'default';
    } else {
      sources.port = 'derived';
      warnings.push(`默认端口 ${DEFAULT_PORT} 已被占用，已自动选择下一个空闲端口 ${probed}`);
    }
  } else {
    port = DEFAULT_PORT;
    sources.port = 'default';
  }

  // 6. apiBase
  const rawApiBase = input.apiBase ?? input['api-base'];
  let apiBase = '';
  if (rawApiBase !== undefined && rawApiBase !== null && String(rawApiBase).trim() !== '') {
    apiBase = String(rawApiBase).trim();
    sources.apiBase = 'user';
  } else {
    apiBase = `/api${activeRule}`;
    sources.apiBase = 'derived';
  }
  if (!apiBase.startsWith('/')) {
    throw new YssCreateError('apiBase 必须以 / 开头，例如 /api/orderCenter', {
      code: 'INVALID_API_BASE',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '请修改 --api-base 参数确保以正斜杠 / 开头',
    });
  }

  // 7. proxyTarget
  const rawProxyTarget = input.proxyTarget ?? input['proxy-target'];
  let proxyTarget = '';
  if (rawProxyTarget !== undefined && rawProxyTarget !== null && String(rawProxyTarget).trim() !== '') {
    proxyTarget = String(rawProxyTarget).trim();
    sources.proxyTarget = 'user';
  } else if (process.env.YSS_PROXY_TARGET && process.env.YSS_PROXY_TARGET.trim() !== '') {
    proxyTarget = process.env.YSS_PROXY_TARGET.trim();
    sources.proxyTarget = 'env';
  } else {
    proxyTarget = DEFAULT_PROXY_TARGET;
    sources.proxyTarget = 'default';
  }
  validateHttpUrl(proxyTarget, 'proxy-target');

  // 8. targetDir
  const rawTargetDir = input.targetDir ?? input['target-dir'];
  let targetDir = process.cwd();
  if (rawTargetDir !== undefined && rawTargetDir !== null && String(rawTargetDir).trim() !== '') {
    targetDir = path.resolve(String(rawTargetDir).trim());
    sources.targetDir = 'user';
  } else {
    targetDir = path.resolve(process.cwd());
    sources.targetDir = 'default';
  }

  // 9. templateUrl
  const rawTemplateUrl = input.templateUrl ?? input['template-url'];
  let templateUrl = DEFAULT_TEMPLATE_URL;
  if (rawTemplateUrl !== undefined && rawTemplateUrl !== null && String(rawTemplateUrl).trim() !== '') {
    templateUrl = String(rawTemplateUrl).trim();
    sources.templateUrl = 'user';
  } else if (process.env.YSS_FRONTEND_TEMPLATE_URL && process.env.YSS_FRONTEND_TEMPLATE_URL.trim() !== '') {
    templateUrl = process.env.YSS_FRONTEND_TEMPLATE_URL.trim();
    sources.templateUrl = 'env';
  } else {
    templateUrl = DEFAULT_TEMPLATE_URL;
    sources.templateUrl = 'default';
  }
  // TODO (#52): 带账号的地址（https://user:token@host）需拒绝或在日志、报错、--json、计划文件中打码。
  validateHttpUrl(templateUrl, 'template-url', TEMPLATE_URL_PROTOCOLS);

  // 10. templateBranch
  const rawTemplateBranch = input.templateBranch ?? input['template-branch'];
  let templateBranch = DEFAULT_TEMPLATE_BRANCH;
  if (rawTemplateBranch !== undefined && rawTemplateBranch !== null && String(rawTemplateBranch).trim() !== '') {
    templateBranch = String(rawTemplateBranch).trim();
    sources.templateBranch = 'user';
  } else {
    templateBranch = DEFAULT_TEMPLATE_BRANCH;
    sources.templateBranch = 'default';
  }
  if (!BRANCH_PATTERN.test(templateBranch)) {
    throw new YssCreateError('template-branch 包含非法字符或不安全的 .. 路径段', {
      code: 'INVALID_BRANCH',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '分支名称只支持字母、数字、点、下划线及中划线',
    });
  }

  // 11. cacheDir
  const rawCacheDir = input.cacheDir ?? input['cache-dir'];
  let cacheDir = DEFAULT_CACHE_DIR;
  if (rawCacheDir !== undefined && rawCacheDir !== null && String(rawCacheDir).trim() !== '') {
    cacheDir = resolveSafeCacheDir(String(rawCacheDir).trim());
    sources.cacheDir = 'user';
  } else {
    cacheDir = resolveSafeCacheDir(DEFAULT_CACHE_DIR);
    sources.cacheDir = 'default';
  }

  // 12. openapiUrl
  const rawOpenapiUrl = input.openapiUrl ?? input['openapi-url'];
  let openapiUrl = '';
  if (rawOpenapiUrl !== undefined && rawOpenapiUrl !== null && String(rawOpenapiUrl).trim() !== '') {
    openapiUrl = validateHttpUrl(String(rawOpenapiUrl).trim(), 'openapi-url');
    sources.openapiUrl = 'user';
  } else {
    sources.openapiUrl = 'default';
  }

  // 13. 标记开关选项
  const dryRun = Boolean(input.dryRun ?? input['dry-run']);
  const offline = Boolean(input.offline);
  const preferOffline = Boolean(input.preferOffline ?? input['prefer-offline']);

  // 14. 依赖同步开关 (syncDeps / no-sync-deps)
  let syncDeps = true;
  const rawSyncDeps = input.syncDeps ?? input['sync-deps'];
  if (rawSyncDeps !== undefined && rawSyncDeps !== null) {
    syncDeps = Boolean(rawSyncDeps);
    sources.syncDeps = 'user';
  } else if (input['no-sync-deps'] === true || input.noSyncDeps === true) {
    syncDeps = false;
    sources.syncDeps = 'user';
  } else {
    syncDeps = true;
    sources.syncDeps = 'default';
  }

  const targetPath = name ? path.join(targetDir, name) : '';

  const resolved = {
    name,
    appName: name,
    nameZh,
    appNameZh: nameZh,
    description,
    activeRule,
    fullActiveRule: normalizeSubAppActiveRule(activeRule, name),
    port,
    apiBase,
    proxyTarget,
    targetDir,
    templateUrl,
    templateBranch,
    cacheDir,
    openapiUrl,
    dryRun,
    offline,
    preferOffline,
    syncDeps,
  };

  return {
    resolved,
    sources,
    warnings,
    targetPath,
  };
};
