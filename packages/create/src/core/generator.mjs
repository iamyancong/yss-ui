/**
 * @fileoverview 脚手架主生成逻辑（模板脚本调用与生成工程后处理定制）。
 * 纯 Node 原生 child_process 与 fs 实现，零第三方依赖。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PROXY_TARGET, EXIT_CODES } from './constants.mjs';
import { syncDependencies } from './deps.mjs';
import { YssCreateError } from './errors.mjs';
import { syncSkills } from './skills.mjs';
import { syncTemplate } from './template.mjs';
import { normalizeSubAppActiveRule, pathExists } from './validate.mjs';

/**
 * 交给模板脚本的「后处理由 create 负责」开关：跳过模板自带的 Skills 同步与结尾 Next steps。
 * 旧模板的 parseArgs 会把不带值的未知 --xxx 当布尔值忽略，因此可以先于模板发布。
 */
export const SCAFFOLD_DRIVER_FLAGS = ['--skip-skills', '--no-summary'];

/** 告知模板脚本调用方身份的环境变量。 */
export const SCAFFOLD_DRIVER_ENV = { YSS_CREATE_DRIVER: 'cli' };

/**
 * 运行模板内的微应用生成脚本。
 *
 * @param {string} scriptPath 模板生成脚本绝对路径
 * @param {Record<string, any>} resolved 规范化后的配置对象
 * @param {{ scaffoldStdout?: 'inherit' | 'stderr' }} [options] 子进程 stdout 去向；
 *   `--json` 等要求 stdout 只输出 JSON 的场景应传 'stderr'
 * @returns {Promise<void>}
 */
export const runScaffoldScript = (scriptPath, resolved, options = {}) => {
  const routeToStderr = options.scaffoldStdout === 'stderr';
  const appName = resolved.name || resolved.appName;
  const args = [
    scriptPath,
    '--name',
    appName,
    '--target-dir',
    resolved.targetDir,
    '--port',
    String(resolved.port),
    '--active-rule',
    resolved.activeRule,
    '--api-base',
    resolved.apiBase,
    '--proxy-target',
    resolved.proxyTarget,
  ];

  if (resolved.openapiUrl) {
    args.push('--openapi-url', resolved.openapiUrl);
  }
  args.push(...SCAFFOLD_DRIVER_FLAGS);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['inherit', routeToStderr ? 'pipe' : 'inherit', 'inherit'],
      shell: false,
      env: { ...process.env, ...SCAFFOLD_DRIVER_ENV },
    });
    if (routeToStderr && child.stdout) {
      child.stdout.pipe(process.stderr);
    }
    child.once('error', error => {
      reject(
        new YssCreateError(`启动模板生成脚本失败: ${error.message}`, {
          code: 'SCAFFOLD_SPAWN_ERROR',
          exitCode: EXIT_CODES.SCAFFOLD_FAILED,
          hint: '请确保本地 Node.js 环境具备执行子进程权限',
        })
      );
    });
    child.once('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new YssCreateError(`模板脚手架生成脚本执行失败，退出码: ${code ?? '未知'}`, {
          code: 'SCAFFOLD_SCRIPT_FAILED',
          exitCode: EXIT_CODES.SCAFFOLD_FAILED,
          hint: '请检查模板仓库内部 scripts/create-microapp.mjs 执行报错日志',
        })
      );
    });
  });
};

/**
 * 定制与校准生成项目中的所有 .env* 环境变量文件。
 * 防御性改写 packages/ 下的所有环境变量文件，确保应用名、API 前缀与激活路由严格对齐。
 *
 * @param {string} targetProjectRoot 生成项目根目录绝对路径
 * @param {object} options 环境变量配置
 * @param {string} options.appName 应用英文名
 * @param {string} options.apiBase 接口 Base 前缀
 * @param {string} options.fullActiveRule 带 /subApp 前缀的完整激活路由
 * @param {string} [options.proxyTarget] 代理目标地址
 * @returns {Promise<void>}
 */
export const customizeEnvFiles = async (targetProjectRoot, { appName, apiBase, fullActiveRule, proxyTarget }) => {
  const pkgDir = path.join(targetProjectRoot, 'packages');
  if (!(await pathExists(pkgDir))) {
    return;
  }

  const subAppName = fullActiveRule.replace(/^\/subApp\//, '') || appName;
  const entries = await fs.readdir(pkgDir, { withFileTypes: true });
  const envFiles = entries.filter(e => e.isFile() && e.name.startsWith('.env')).map(e => e.name);

  // 仅改写 packages/ 下实际存在的 .env* 文件，绝不凭空创建模板中不存在的文件
  for (const filename of envFiles) {
    const filePath = path.join(pkgDir, filename);
    const content = await fs.readFile(filePath, 'utf8');

    const lines = content.split('\n');
    const keysToSet = {
      VITE_SUB_APP_NAME: subAppName,
      VITE_API_BASE_URL: apiBase,
      VITE_ACTIVE_RULE: fullActiveRule,
    };
    if (proxyTarget) {
      keysToSet.VITE_PROXY_TARGET = proxyTarget;
    }

    const updatedKeys = new Set();
    const newLines = lines.map(line => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (match && keysToSet[match[1]] !== undefined) {
        updatedKeys.add(match[1]);
        return `${match[1]}=${keysToSet[match[1]]}`;
      }
      return line;
    });

    for (const [key, val] of Object.entries(keysToSet)) {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${val}`);
      }
    }

    const resultText = newLines.join('\n').replace(/\n+$/, '') + '\n';
    await fs.writeFile(filePath, resultText, 'utf8');
  }
};

/**
 * 同步并定制生成项目内的中文名、应用描述及各环境配置。
 *
 * @param {string} targetProjectRoot 生成项目根目录绝对路径
 * @param {string | object} optionsOrNameZh 应用中文名或配置对象
 * @param {string} [maybeDescription=''] 应用描述（仅当第二个参数为字符串时生效）
 * @returns {Promise<void>}
 */
export const customizeGeneratedProject = async (targetProjectRoot, optionsOrNameZh, maybeDescription = '') => {
  const options =
    typeof optionsOrNameZh === 'object' && optionsOrNameZh !== null
      ? optionsOrNameZh
      : { appNameZh: optionsOrNameZh, description: maybeDescription };

  const { appNameZh, description, appName, apiBase, fullActiveRule, proxyTarget, port } = options;

  const microConfigPath = path.join(targetProjectRoot, 'micro-config.json');
  if (await pathExists(microConfigPath)) {
    const content = await fs.readFile(microConfigPath, 'utf8');
    const config = JSON.parse(content);
    if (appNameZh) {
      config.name = appNameZh;
      if (config.app) {
        config.app.name = appNameZh;
      }
    }
    if (description) {
      config.description = description;
      if (config.app) {
        config.app.description = description;
      }
    }
    if (config.app && fullActiveRule) {
      config.app.activeRule = fullActiveRule;
      if (port) {
        config.app.entry = `http://localhost:${port}${fullActiveRule}/`;
      }
    }
    await fs.writeFile(microConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  const packagePath = path.join(targetProjectRoot, 'packages/package.json');
  if (description && (await pathExists(packagePath))) {
    const content = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    packageJson.description = description;
    await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  }

  if (fullActiveRule && apiBase) {
    await customizeEnvFiles(targetProjectRoot, {
      appName: appName || fullActiveRule.replace(/^\/subApp\//, '') || '',
      apiBase,
      fullActiveRule,
      proxyTarget: proxyTarget || DEFAULT_PROXY_TARGET,
    });
  }
};

/**
 * 执行微应用完整生成流。
 *
 * @param {Record<string, any>} resolved 规范化后的参数对象
 * @param {{ onProgress?: (message: string) => void, scaffoldStdout?: 'inherit' | 'stderr', allowGitPrompt?: boolean, syncSkills?: boolean }} [options]
 *   进度回调、模板脚本 stdout 去向、是否允许 git 在终端询问凭据（仅交互模式），
 *   以及是否在生成后同步最新 AI Skills（默认是，仅供离线/内网流水线显式关闭）
 * @returns {Promise<{ targetPath: string, templateCommit: string, skills: 'synced' | 'failed' | 'skipped' }>} 生成结果
 */
export const generate = async (resolved, options = {}) => {
  const onProgress = options.onProgress || (() => undefined);
  const appName = resolved.name || resolved.appName;
  const targetProjectRoot = path.join(resolved.targetDir, appName);

  if (await pathExists(targetProjectRoot)) {
    throw new YssCreateError(`目标项目已存在，已停止以避免覆盖: ${targetProjectRoot}`, {
      code: 'TARGET_EXISTS',
      exitCode: EXIT_CODES.TARGET_EXISTS,
      hint: '请更换目标父目录或更改应用英文名称',
    });
  }

  await fs.mkdir(resolved.targetDir, { recursive: true });

  const { commit } = await syncTemplate(
    {
      url: resolved.templateUrl,
      branch: resolved.templateBranch,
      cacheDir: resolved.cacheDir,
      offline: resolved.offline,
      preferOffline: resolved.preferOffline,
      allowGitPrompt: options.allowGitPrompt === true,
    },
    onProgress
  );

  const scaffoldScriptPath = path.join(resolved.cacheDir, 'scripts/create-microapp.mjs');
  if (!(await pathExists(scaffoldScriptPath))) {
    throw new YssCreateError(`模板缓存内未找到项目生成脚本: ${scaffoldScriptPath}`, {
      code: 'SCAFFOLD_SCRIPT_NOT_FOUND',
      exitCode: EXIT_CODES.SCAFFOLD_FAILED,
      hint: '请尝试清理本地模板缓存后重试',
    });
  }

  const fullActiveRule = resolved.fullActiveRule || normalizeSubAppActiveRule(resolved.activeRule, appName);

  onProgress('正在执行模板骨架生成...');
  await runScaffoldScript(scaffoldScriptPath, resolved, { scaffoldStdout: options.scaffoldStdout });

  onProgress('正在写入应用中文名与项目描述...');
  await customizeGeneratedProject(targetProjectRoot, {
    appName,
    appNameZh: resolved.nameZh || resolved.appNameZh,
    description: resolved.description,
    apiBase: resolved.apiBase,
    fullActiveRule,
    proxyTarget: resolved.proxyTarget,
    port: resolved.port,
  });

  let dependencyUpdates = [];
  let lockfile = 'unchanged';
  let hasVersionChange = false;
  const warnings = [];

  if (resolved.syncDeps !== false) {
    const depResult = await syncDependencies(targetProjectRoot, {
      offline: resolved.offline,
      preferOffline: resolved.preferOffline,
      syncDeps: resolved.syncDeps,
      install: options.install === true,
      deferLockfile: options.deferLockfile === true,
      fetchImpl: options.fetchImpl,
      spawnImpl: options.spawnImpl,
      onProgress,
    });
    dependencyUpdates = depResult.updates;
    lockfile = depResult.lockfile;
    hasVersionChange = Boolean(depResult.hasVersionChange);
    if (depResult.warnings && depResult.warnings.length > 0) {
      warnings.push(...depResult.warnings);
    }
  }

  let skills = 'skipped';
  if (options.syncSkills !== false) {
    if (!resolved.offline) onProgress('正在同步最新官方 AI Skills 规范...');
    const skillsResult = await syncSkills(targetProjectRoot, {
      offline: resolved.offline,
      spawnImpl: options.skillsSpawnImpl,
    });
    skills = skillsResult.status;
    if (skills === 'synced') onProgress('AI Skills 已同步至最新版');
    warnings.push(...skillsResult.warnings);
  }

  return {
    targetPath: targetProjectRoot,
    templateCommit: commit,
    fullActiveRule,
    dependencyUpdates,
    lockfile,
    hasVersionChange,
    skills,
    warnings,
  };
};
