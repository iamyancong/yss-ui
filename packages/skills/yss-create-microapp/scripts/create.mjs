#!/usr/bin/env node

/**
 * @fileoverview yss-create-microapp AI Skill 执行脚本。
 * 基于共享核心 core 的薄包装，零第三方外部依赖。
 */

import { generate, pathExists, resolveOptions, YssCreateError } from './core/index.mjs';

/**
 * 解析命令行参数。
 *
 * @param {string[]} argv 完整命令行参数
 * @returns {Record<string, string | boolean>} 解析后的参数对象
 */
const parseArgs = argv => {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
};

/** 输出命令用法。 */
const printUsage = () => {
  // eslint-disable-next-line no-console
  console.log(`用法:
  node create.mjs --name <app-name> --name-zh <中文名> [--active-rule </route>] [--target-dir <父目录>]

可选参数:
  --port <1-65535>              本地开发端口 (默认 8081 起向上探测)
  --active-rule </route>        激活路由 (默认由 name 推导小驼峰，如 /orderCenter)
  --api-base </api/path>        接口前缀 (默认 /api\${activeRule})
  --proxy-target <http(s)://url> 代理目标地址 (默认优先读取环境变量 YSS_PROXY_TARGET)
  --description <描述>           项目描述文案
  --openapi-url <http(s)://url>  OpenAPI JSON 文档地址
  --target-dir <父目录>          项目生成父目录 (默认当前工作目录)
  --no-skills                   跳过同步 AI Skills (默认生成后总是同步最新版，仅供无法联网的流水线使用)
  --dry-run                     预检解析参数与路径，不写盘不联网`);
};

/**
 * 执行微应用生成流程。
 *
 * @returns {Promise<void>}
 */
const main = async () => {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const { resolved, sources, warnings, targetPath } = await resolveOptions(args);

  for (const warning of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  ${warning}`);
  }

  if (!resolved.name) {
    throw new YssCreateError('缺少必需参数: --name <英文应用名>', {
      code: 'MISSING_NAME',
      exitCode: 2,
      hint: '请提供应用英文名，例如 --name order-center',
    });
  }
  if (!resolved.nameZh) {
    throw new YssCreateError('缺少必需参数: --name-zh <应用中文名>', {
      code: 'MISSING_NAME_ZH',
      exitCode: 2,
      hint: '请提供应用中文名，例如 --name-zh 订单中心',
    });
  }

  if (await pathExists(targetPath)) {
    throw new YssCreateError(`目标项目已存在，已停止以避免覆盖: ${targetPath}`, {
      code: 'TARGET_EXISTS',
      exitCode: 3,
      hint: '请更换应用英文名称或指定其他 --target-dir 目录',
    });
  }

  // eslint-disable-next-line no-console
  console.log(`📁 最终生成路径: ${targetPath}`);

  if (resolved.dryRun) {
    // eslint-disable-next-line no-console
    console.log('✅ 参数与路径校验通过，dry-run 模式未执行网络或写入操作。');
    // eslint-disable-next-line no-console
    console.log(`- 激活路由: ${resolved.activeRule} (来源: ${sources.activeRule})`);
    // eslint-disable-next-line no-console
    console.log(`- 开发端口: ${resolved.port} (来源: ${sources.port})`);
    // eslint-disable-next-line no-console
    console.log(`- 代理目标: ${resolved.proxyTarget} (来源: ${sources.proxyTarget})`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log('🔄 正在同步微应用模板库...');
  // eslint-disable-next-line no-console
  console.log(`- 仓库地址: ${resolved.templateUrl}`);
  // eslint-disable-next-line no-console
  console.log(`- 分支: ${resolved.templateBranch}`);
  // eslint-disable-next-line no-console
  console.log(`- 本地缓存: ${resolved.cacheDir}`);

  const result = await generate(resolved, {
    // eslint-disable-next-line no-console
    onProgress: msg => console.log(msg),
    syncSkills: args['no-skills'] !== true,
  });

  for (const warning of result.warnings || []) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  ${warning}`);
  }

  // eslint-disable-next-line no-console
  console.log('🎉 本地微应用项目已创建。');
  // eslint-disable-next-line no-console
  console.log(`进入目录: cd "${targetPath}"`);
  // eslint-disable-next-line no-console
  console.log('后续可按需执行: pnpm install 与 pnpm dev');
};

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`❌ ${message}`);
  if (error instanceof YssCreateError && error.hint) {
    // eslint-disable-next-line no-console
    console.error(`→ ${error.hint}`);
  }
  process.exitCode = error.exitCode || 1;
});
