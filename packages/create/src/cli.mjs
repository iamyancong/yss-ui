/**
 * @fileoverview 脚手架 CLI 主入口与命令解析调度中心。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  createPlan,
  EXIT_CODES,
  generate,
  parsePlanContent,
  pathExists,
  PlanMismatchError,
  resolveOptions,
  verifyPlan,
  YssCreateError,
} from './core/index.mjs';
import { assertSupportedPackageManager, detectPackageManager, getNextSteps } from './pm.mjs';
import { runGitInit, runInstall, runSkillsSync } from './post.mjs';
import { formatPreviewTable } from './preview.mjs';
import { confirmCreation, promptPostActions, resolveInteractiveAnswers, runInteractivePrompts } from './prompts.mjs';

/** 命令行参数定义（strict 模式下未声明的参数直接报错，退出码 2）。 */
const CLI_OPTIONS = {
  'name-zh': { type: 'string' },
  name: { type: 'string' },
  'active-rule': { type: 'string' },
  port: { type: 'string' },
  'api-base': { type: 'string' },
  'proxy-target': { type: 'string' },
  'target-dir': { type: 'string' },
  description: { type: 'string' },
  'openapi-url': { type: 'string' },
  'template-url': { type: 'string' },
  'template-branch': { type: 'string' },
  'cache-dir': { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  config: { type: 'string' },
  'dry-run': { type: 'boolean' },
  json: { type: 'boolean' },
  'plan-out': { type: 'string' },
  apply: { type: 'string' },
  install: { type: 'boolean' },
  'no-install': { type: 'boolean' },
  skills: { type: 'boolean' },
  'no-skills': { type: 'boolean' },
  git: { type: 'boolean' },
  'no-git': { type: 'boolean' },
  offline: { type: 'boolean' },
  'prefer-offline': { type: 'boolean' },
  pm: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

/**
 * 严格解析命令行参数，未知参数、缺少取值或多余位置参数均转换为退出码 2 的业务错误。
 *
 * @param {string[]} args 去掉 node 与脚本路径后的参数
 * @returns {{ values: Record<string, any>, positionals: string[] }}
 */
const parseCliArgs = args => {
  let parsed;
  try {
    parsed = parseArgs({ args, options: CLI_OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new YssCreateError(`命令行参数无效: ${error.message}`, {
      code: 'INVALID_CLI_ARGS',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '请检查参数拼写（如 --dry-run 而非 --dryrun），运行 --help 查看全部参数',
    });
  }

  if (parsed.positionals.length > 1) {
    throw new YssCreateError(`只允许一个位置参数作为应用英文名，收到: ${parsed.positionals.join(' ')}`, {
      code: 'INVALID_CLI_ARGS',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '含空格的值请加引号，例如 --name-zh "订单 中心"',
    });
  }

  return parsed;
};

/**
 * 读取并校验计划文件；文件不存在、不可读或非法 JSON 均视为计划校验失败（退出码 4）。
 *
 * @param {string} planFile 计划文件路径
 * @returns {Promise<Record<string, any>>} 计划对象
 */
const readPlanFile = async planFile => {
  const planPath = path.resolve(planFile);
  let content;
  try {
    content = await fs.readFile(planPath, 'utf8');
  } catch (error) {
    throw new PlanMismatchError(
      `无法读取计划文件 (${planPath}): ${error.message}`,
      '请确认 --apply 传入的计划文件路径正确',
      'PLAN_INVALID'
    );
  }
  return parsePlanContent(content, planPath);
};

/**
 * 根据显式开关解析非交互模式下的后置动作；未显式开启一律为否。
 *
 * @param {Record<string, any>} values 解析后的命令行参数
 * @returns {{ install: boolean, skills: boolean, git: boolean }}
 */
const resolveExplicitPostActions = values => ({
  install: values.install === true && values['no-install'] !== true,
  skills: values.skills === true && values['no-skills'] !== true,
  git: values.git === true && values['no-git'] !== true,
});

/**
 * 将 --xxx / --no-xxx 转为交互提问的预设值：显式传入则跳过提问。
 *
 * @param {Record<string, any>} values 解析后的命令行参数
 * @returns {{ install?: boolean, skills?: boolean, git?: boolean }}
 */
const resolvePostActionPresets = values => {
  const preset = key => {
    if (values[key] === true) return true;
    if (values[`no-${key}`] === true) return false;
    return undefined;
  };
  return { install: preset('install'), skills: preset('skills'), git: preset('git') };
};

/**
 * 打印 CLI 帮助文案。
 */
export const printHelp = () => {
  // eslint-disable-next-line no-console
  console.log(`
${pc.bold('npm create yss-app')} [appName] [options]
${pc.bold('npx @yss-ui/create')} [appName] [options]

${pc.bold('基础参数:')}
  --name-zh <str>             应用中文名 (例如: 订单中心)
  --name <str>                应用英文名 (例如: order-center)
  --active-rule </route>      微前端激活路由 (默认小驼峰推导，如 /orderCenter)
  --port <number>             本地端口 (默认 8081 起向上探测可用端口)
  --api-base </api/path>      接口统一前缀 (默认 /api\${activeRule})
  --proxy-target <url>        后端代理目标 (默认优先读取环境变量 YSS_PROXY_TARGET)
  --target-dir <dir>          项目生成父目录 (默认当前工作目录)
  --description <str>         应用描述 (写入 micro-config.json)
  --openapi-url <url>         OpenAPI JSON 规范地址

${pc.bold('自动化与流水线:')}
  -y, --yes                   非交互模式，全部未提供字段使用推导/预设
  --config <file|- >          从 JSON 文件或标准输入读取参数
  --dry-run                   仅预检解析与校验，不写盘、不联网
  --json                      以机器可读 JSON 输出到 stdout
  --plan-out <file>           只写出可审阅的执行计划文件，不生成项目
  --apply <file>              按执行计划执行 (校验 sha256 并重新校验全部参数，失败退出码 4)

${pc.bold('后续行为控制:')}
  --install / --no-install    生成后是否安装依赖 (非交互默认否)
  --skills / --no-skills      生成后是否同步 AI Skills 规范 (非交互默认否)
  --git / --no-git            是否初始化 Git 仓库与初始提交 (非交互默认否)
  --pm <pnpm|npm|yarn>        显式指定包管理器

${pc.bold('进阶与调试:')}
  --template-url <url>        自定义微应用模板 Git 地址
  --template-branch <branch>  自定义微应用模板分支
  --cache-dir <dir>           自定义模板本地安全缓存目录
  --offline                   纯离线模式，仅使用已有缓存
  --prefer-offline            优先离线模式
  -h, --help                  查看帮助信息
  -v, --version               查看版本号
`);
};

/**
 * 从文件或 stdin 中读取 JSON 配置。
 *
 * @param {string} sourceFile 文件路径或 '-'
 * @returns {Promise<Record<string, any>>}
 */
const readConfigFile = async sourceFile => {
  if (sourceFile === '-') {
    if (process.stdin.isTTY) {
      throw new YssCreateError('--config - 需要通过管道传入 JSON，但当前标准输入是终端', {
        code: 'INVALID_CONFIG_STDIN',
        exitCode: EXIT_CODES.INVALID_ARGUMENTS,
        hint: '例如 cat config.json | npx @yss-ui/create --config -，或改用 --config <file>',
      });
    }
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => {
        data += chunk;
      });
      process.stdin.on('end', () => {
        try {
          resolve(data.trim() ? JSON.parse(data) : {});
        } catch (err) {
          reject(
            new YssCreateError(`解析标准输入 JSON 配置失败: ${err.message}`, {
              code: 'INVALID_CONFIG_JSON',
              exitCode: EXIT_CODES.INVALID_ARGUMENTS,
              hint: '请确保标准输入传递的是合法的 JSON 字符串',
            })
          );
        }
      });
      process.stdin.on('error', reject);
    });
  }

  try {
    const raw = await fs.readFile(path.resolve(sourceFile), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new YssCreateError(`读取配置文件失败 (${sourceFile}): ${error.message}`, {
      code: 'INVALID_CONFIG_FILE',
      exitCode: EXIT_CODES.INVALID_ARGUMENTS,
      hint: '请检查 --config 传入的文件路径及 JSON 语法',
    });
  }
};

/**
 * 输出 JSON 结果到 stdout（--json 模式下 stdout 只允许出现这一行）。
 *
 * @param {Record<string, any>} payload 输出对象
 */
const printJson = payload => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
};

/**
 * 执行生成后的可选动作（安装依赖 / 同步 Skills / git init）。
 *
 * @param {string} targetPath 生成的项目目录
 * @param {{ install: boolean, skills: boolean, git: boolean }} actions 要执行的动作
 * @param {'pnpm' | 'npm' | 'yarn'} pm 包管理器
 * @param {(...args: any[]) => void} log 日志函数
 * @returns {Promise<void>}
 */
const runPostActions = async (targetPath, actions, pm, log) => {
  if (actions.install) {
    log(pc.cyan(`\n📦 正在使用 ${pm} 安装项目依赖...`));
    await runInstall(targetPath, pm);
  }
  if (actions.skills) {
    log(pc.cyan('\n🧠 正在同步官方 AI Skills 规范...'));
    await runSkillsSync(targetPath);
  }
  if (actions.git) {
    log(pc.cyan('\n🔧 正在初始化 Git 仓库...'));
    await runGitInit(targetPath);
  }
};

/**
 * 输出创建成功结果。
 *
 * @param {{ targetPath: string, templateCommit: string }} result 生成结果
 * @param {string[]} nextSteps 后续步骤
 * @param {string[]} warnings 解析阶段的警告
 * @param {boolean} isJsonMode 是否 JSON 模式
 * @param {string} title 成功标题
 */
const printSuccess = (result, nextSteps, warnings, isJsonMode, title) => {
  if (isJsonMode) {
    printJson({
      ok: true,
      targetPath: result.targetPath,
      templateCommit: result.templateCommit,
      warnings,
      nextSteps,
    });
    return;
  }
  p.outro(
    pc.green(`${title}\n\n`) +
      pc.bold('后续快速开始:') +
      '\n' +
      nextSteps.map(step => `  ${pc.cyan('➜')} ${step}`).join('\n')
  );
};

/**
 * 运行 CLI 主函数。
 *
 * @param {string[]} [rawArgv=process.argv] 命令行参数
 * @returns {Promise<void>}
 */
export const runCli = async (rawArgv = process.argv) => {
  const isJsonMode = rawArgv.includes('--json');
  /** 常规日志：JSON 模式下全部走 stderr，保证 stdout 可直接 JSON.parse。 */
  const log = (...args) => {
    if (!isJsonMode) {
      // eslint-disable-next-line no-console
      console.log(...args);
    } else {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  };
  const logWarnings = warnings => {
    for (const warning of warnings || []) {
      log(pc.yellow(`⚠️  ${warning}`));
    }
  };
  const scaffoldStdout = isJsonMode ? 'stderr' : 'inherit';

  try {
    const { values, positionals } = parseCliArgs(rawArgv.slice(2));

    if (values.help) {
      printHelp();
      return;
    }

    if (values.version) {
      const pkgPath = new URL('../package.json', import.meta.url);
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      // eslint-disable-next-line no-console
      console.log(pkg.version);
      return;
    }

    // --pm 非法值在任何流程开始前就报错，而不是静默回退
    assertSupportedPackageManager(values.pm);
    const detectedPm = detectPackageManager(values.pm);

    // 1. --apply <file>：按计划执行。hash 只防误改，verifyPlan 会按当前规则重新校验全部参数。
    if (values.apply) {
      const plan = await readPlanFile(values.apply);
      const { resolved } = await verifyPlan(plan);

      log(pc.cyan('🔄 计划校验通过，正在同步模板并生成微应用工程...'));
      const result = await generate(resolved, {
        onProgress: msg => log(pc.dim(msg)),
        scaffoldStdout,
      });

      await runPostActions(result.targetPath, resolveExplicitPostActions(values), detectedPm, log);

      const nextSteps = getNextSteps({
        targetPath: result.targetPath,
        port: resolved.port,
        activeRule: resolved.activeRule,
        pm: detectedPm,
      });
      printSuccess(result, nextSteps, [], isJsonMode, '🎉 微应用已按计划成功创建！');
      return;
    }

    // 2. 收集原始输入参数
    let fileConfig = {};
    if (values.config) {
      fileConfig = await readConfigFile(values.config);
    }

    const positionalName = positionals[0];
    const initialInput = {
      ...fileConfig,
      name: values.name ?? positionalName ?? fileConfig.name,
      nameZh: values['name-zh'] ?? fileConfig.nameZh ?? fileConfig['name-zh'],
      activeRule: values['active-rule'] ?? fileConfig.activeRule ?? fileConfig['active-rule'],
      port: values.port ?? fileConfig.port,
      apiBase: values['api-base'] ?? fileConfig.apiBase ?? fileConfig['api-base'],
      proxyTarget: values['proxy-target'] ?? fileConfig.proxyTarget ?? fileConfig['proxy-target'],
      targetDir: values['target-dir'] ?? fileConfig.targetDir ?? fileConfig['target-dir'],
      description: values.description ?? fileConfig.description,
      openapiUrl: values['openapi-url'] ?? fileConfig.openapiUrl ?? fileConfig['openapi-url'],
      templateUrl: values['template-url'] ?? fileConfig.templateUrl ?? fileConfig['template-url'],
      templateBranch: values['template-branch'] ?? fileConfig.templateBranch ?? fileConfig['template-branch'],
      cacheDir: values['cache-dir'] ?? fileConfig.cacheDir ?? fileConfig['cache-dir'],
      dryRun: Boolean(values['dry-run'] || fileConfig.dryRun),
      offline: Boolean(values.offline || fileConfig.offline),
      preferOffline: Boolean(values['prefer-offline'] || fileConfig.preferOffline),
    };

    const isNonInteractive =
      Boolean(values.yes) || !process.stdout.isTTY || Boolean(process.env.CI) || Boolean(values.config) || isJsonMode;

    let resolvedOptions;
    let sourcesMap;
    let warningsList;
    let finalTargetPath;

    if (!isNonInteractive) {
      // 交互模式流程
      const promptResult = await runInteractivePrompts(initialInput);
      const res = await resolveInteractiveAnswers(initialInput, promptResult);
      resolvedOptions = res.resolved;
      sourcesMap = res.sources;
      warningsList = res.warnings;
      finalTargetPath = res.targetPath;

      // 英文名由 --name/位置参数预设时不会经过交互阶段的目录冲突检查，这里兜底
      if (await pathExists(finalTargetPath)) {
        throw new YssCreateError(`目标项目目录已存在，已停止以避免覆盖: ${finalTargetPath}`, {
          code: 'TARGET_EXISTS',
          exitCode: EXIT_CODES.TARGET_EXISTS,
          hint: '请更换应用英文名称或指定其他目标父目录',
        });
      }

      const confirmed = await confirmCreation(resolvedOptions, sourcesMap, finalTargetPath);
      if (!confirmed) {
        p.cancel('已取消创建。');
        process.exit(0);
      }
    } else {
      // 非交互模式流程
      if (!initialInput.name) {
        throw new YssCreateError('非交互模式缺少必需参数: 应用英文名 (--name 或位置参数)', {
          code: 'MISSING_NAME',
          exitCode: EXIT_CODES.INVALID_ARGUMENTS,
          hint: '请传入应用英文名，例如 npx @yss-ui/create my-app --name-zh 我的应用',
        });
      }
      if (!initialInput.nameZh) {
        throw new YssCreateError('非交互模式缺少必需参数: 应用中文名 (--name-zh)', {
          code: 'MISSING_NAME_ZH',
          exitCode: EXIT_CODES.INVALID_ARGUMENTS,
          hint: '请通过 --name-zh 传入应用中文名，例如 --name-zh 订单中心',
        });
      }

      const res = await resolveOptions(initialInput, { probePort: true });
      resolvedOptions = res.resolved;
      sourcesMap = res.sources;
      warningsList = res.warnings;
      finalTargetPath = res.targetPath;

      if (await pathExists(finalTargetPath)) {
        throw new YssCreateError(`目标项目已存在，已停止以避免覆盖: ${finalTargetPath}`, {
          code: 'TARGET_EXISTS',
          exitCode: EXIT_CODES.TARGET_EXISTS,
          hint: '请更换应用英文名称或指定其他 --target-dir 目录',
        });
      }
      logWarnings(warningsList);
    }

    // 3. --plan-out：只写计划文件，不拉模板、不生成项目，由 --apply 执行
    if (values['plan-out']) {
      const plan = createPlan(resolvedOptions);
      const planPath = path.resolve(values['plan-out']);
      await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

      if (isJsonMode) {
        printJson({
          ok: true,
          planPath,
          plan,
          resolved: resolvedOptions,
          sources: sourcesMap,
          warnings: warningsList,
          targetPath: finalTargetPath,
        });
        return;
      }
      // eslint-disable-next-line no-console
      console.log(formatPreviewTable(resolvedOptions, sourcesMap, finalTargetPath));
      // eslint-disable-next-line no-console
      console.log(pc.green(`\n📄 执行计划已写入: ${planPath}`));
      // eslint-disable-next-line no-console
      console.log(pc.dim(`未生成项目。审阅后执行: npx @yss-ui/create --apply ${planPath}`));
      return;
    }

    // 4. --dry-run
    if (resolvedOptions.dryRun) {
      if (isJsonMode) {
        printJson({
          ok: true,
          resolved: resolvedOptions,
          sources: sourcesMap,
          warnings: warningsList,
          targetPath: finalTargetPath,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log(formatPreviewTable(resolvedOptions, sourcesMap, finalTargetPath));
        // eslint-disable-next-line no-console
        console.log(pc.green('\n✅ 参数与路径校验通过，dry-run 模式未执行写盘或网络操作。'));
      }
      return;
    }

    // 5. 正式执行生成
    const spin = !isNonInteractive ? p.spinner() : null;
    if (spin) {
      spin.start('正在拉取模板并生成微应用工程...');
    } else {
      log(pc.cyan('🔄 正在同步模板并生成微应用工程...'));
    }

    const genResult = await generate(resolvedOptions, {
      onProgress: msg => {
        if (spin) spin.message(msg);
        else log(pc.dim(msg));
      },
      scaffoldStdout,
    });

    if (spin) {
      spin.stop('微应用骨架代码生成完毕！');
    }

    // 6. 后置动作：非交互只认显式开关；交互模式对未显式指定的项逐个询问
    const postActions = isNonInteractive
      ? resolveExplicitPostActions(values)
      : await promptPostActions(resolvePostActionPresets(values));
    await runPostActions(genResult.targetPath, postActions, detectedPm, log);

    const nextSteps = getNextSteps({
      targetPath: genResult.targetPath,
      port: resolvedOptions.port,
      activeRule: resolvedOptions.activeRule,
      pm: detectedPm,
    });
    printSuccess(genResult, nextSteps, warningsList, isJsonMode, '🎉 微应用项目创建成功！');
  } catch (error) {
    const exitCode = error instanceof YssCreateError ? error.exitCode : EXIT_CODES.UNKNOWN_ERROR;
    const code = error instanceof YssCreateError ? error.code : 'UNKNOWN_ERROR';
    const message = error instanceof Error ? error.message : String(error);
    const hint = error instanceof YssCreateError ? error.hint : '';

    if (isJsonMode) {
      printJson({ ok: false, code, message, hint });
    } else {
      // eslint-disable-next-line no-console
      console.error(pc.red(`\n✖ ${message}`));
      if (hint) {
        // eslint-disable-next-line no-console
        console.error(pc.yellow(`  → 建议: ${hint}`));
      }
    }
    if (process.env.DEBUG === 'yss-create' && error instanceof Error && error.stack) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
    process.exitCode = exitCode;
  }
};
