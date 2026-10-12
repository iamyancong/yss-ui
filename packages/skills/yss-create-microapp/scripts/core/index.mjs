/**
 * @fileoverview 脚手架共享核心 API 入口。
 * 纯 ESM，零第三方依赖，Node >= 18。
 */

export {
  ACTIVE_RULE_PATTERN,
  APP_NAME_PATTERN,
  BRANCH_PATTERN,
  DEFAULT_CACHE_DIR,
  DEFAULT_CACHE_DIR_NAME,
  DEFAULT_PORT,
  DEFAULT_PROXY_TARGET,
  DEFAULT_TEMPLATE_BRANCH,
  DEFAULT_TEMPLATE_URL,
  DEFAULTS,
  EXIT_CODES,
  SCAFFOLD_TIPS,
} from './constants.mjs';

export { PlanMismatchError, YssCreateError } from './errors.mjs';

export {
  HTTP_PROTOCOLS,
  pathExists,
  resolveSafeCacheDir,
  TEMPLATE_URL_PROTOCOLS,
  toActiveRule,
  validateActiveRule,
  validateAppName,
  validateHttpUrl,
} from './validate.mjs';

export { probeFreePort } from './port.mjs';

export { resolveOptions } from './options.mjs';

export { diagnoseGitFailure, getGitErrorDetail, runGit, syncTemplate } from './template.mjs';

export { customizeGeneratedProject, generate, runScaffoldScript } from './generator.mjs';

export { canonicalizePlan, computePlanHash, createPlan, parsePlanContent, PLAN_VERSION, verifyPlan } from './plan.mjs';
