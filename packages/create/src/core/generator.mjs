/**
 * @fileoverview 脚手架主生成逻辑（模板脚本调用与生成工程后处理定制）。
 * 纯 Node 原生 child_process 与 fs 实现，零第三方依赖。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EXIT_CODES } from './constants.mjs';
import { syncDependencies } from './deps.mjs';
import { YssCreateError } from './errors.mjs';
import { syncTemplate } from './template.mjs';
import { pathExists } from './validate.mjs';

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

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['inherit', routeToStderr ? 'pipe' : 'inherit', 'inherit'],
      shell: false,
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
 * 同步并定制生成项目内的中文名与应用描述。
 *
 * @param {string} targetProjectRoot 生成项目根目录绝对路径
 * @param {string} appNameZh 应用中文名
 * @param {string} [description=''] 应用描述
 * @returns {Promise<void>}
 */
export const customizeGeneratedProject = async (targetProjectRoot, appNameZh, description = '') => {
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
    await fs.writeFile(microConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  const packagePath = path.join(targetProjectRoot, 'packages/package.json');
  if (description && (await pathExists(packagePath))) {
    const content = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    packageJson.description = description;
    await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  }
};

/**
 * 执行微应用完整生成流。
 *
 * @param {Record<string, any>} resolved 规范化后的参数对象
 * @param {{ onProgress?: (message: string) => void, scaffoldStdout?: 'inherit' | 'stderr', allowGitPrompt?: boolean }} [options]
 *   进度回调、模板脚本 stdout 去向，以及是否允许 git 在终端询问凭据（仅交互模式）
 * @returns {Promise<{ targetPath: string, templateCommit: string }>} 生成结果
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

  onProgress('正在执行模板骨架生成...');
  await runScaffoldScript(scaffoldScriptPath, resolved, { scaffoldStdout: options.scaffoldStdout });

  onProgress('正在写入应用中文名与项目描述...');
  await customizeGeneratedProject(targetProjectRoot, resolved.nameZh || resolved.appNameZh, resolved.description);

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

  return {
    targetPath: targetProjectRoot,
    templateCommit: commit,
    dependencyUpdates,
    lockfile,
    hasVersionChange,
    warnings,
  };
};
