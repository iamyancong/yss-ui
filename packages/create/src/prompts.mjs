/**
 * @fileoverview Clack 交互式提问流程与用户确认控制。
 */

import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  DEFAULT_PORT,
  DEFAULT_PROXY_TARGET,
  HTTP_PROTOCOLS,
  pathExists,
  probeFreePort,
  resolveOptions,
  toActiveRule,
  validateActiveRule,
  validateAppName,
} from './core/index.mjs';
import { formatPreviewTable, resolvePreviewRegistry } from './preview.mjs';

/**
 * 校验并检查是否用户按下了 Ctrl+C 中断。
 *
 * @template T
 * @param {T | symbol} value 返回值
 * @returns {T} 正常值
 */
const handleCancel = value => {
  if (p.isCancel(value)) {
    p.cancel(pc.yellow('已取消操作，未写入任何文件。'));
    process.exit(130);
  }
  return value;
};

/**
 * 打印交互模式标题，标题中带当前 CLI 版本号，便于用户确认运行的是哪个版本。
 *
 * @param {string} cliVersion 当前 CLI 版本
 */
export const showIntro = cliVersion => {
  p.intro(pc.bgCyan(pc.black(` YSS 微应用创建 v${cliVersion} `)));
};

/**
 * 发现新版本时询问是否切换到新版本继续创建；默认「是」，直接回车即切换到新版本。
 *
 * @param {import('./update.mjs').UpdateInfo} info 版本信息
 * @returns {Promise<boolean>} 是否切换
 */
export const confirmUseLatest = async ({ currentVersion, latestVersion }) => {
  p.note(pc.yellow(`当前 ${currentVersion} → 最新 ${latestVersion}`), '发现新版本');
  const accepted = handleCancel(
    await p.confirm({
      message: `是否下载 ${latestVersion} 并用新版本继续创建？`,
      initialValue: true,
    })
  );
  return Boolean(accepted);
};

/**
 * 交互式问答主流程（标题由 showIntro 单独打印）。
 *
 * @param {Record<string, any>} initialInput 预设输入参数
 * @returns {Promise<{
 *   answers: Record<string, any>,
 *   defaults: Record<string, string>
 * }>} 用户应答，以及实际弹出过的问题的初始值（用于区分「用户修改」与「直接回车采纳」）
 */
export const runInteractivePrompts = async (initialInput = {}) => {
  // 1. 中文名称（必填）
  let nameZh = initialInput.nameZh;
  if (!nameZh) {
    nameZh = handleCancel(
      await p.text({
        message: '应用中文名:',
        placeholder: '例如: 订单中心、用户权限管理',
        validate: value => {
          if (!value || !value.trim()) return '应用中文名不能为空';
          return undefined;
        },
      })
    );
  }

  // 2. 英文名称（必填）。目标目录冲突在此处立即提示并重新询问，避免填完所有问题才发现。
  const targetDir = path.resolve(String(initialInput.targetDir || process.cwd()));
  let name = initialInput.name;
  while (!name) {
    const answer = handleCancel(
      await p.text({
        message: '应用英文名 (仅支持字母、数字与中划线):',
        placeholder: '例如: order-center、crm',
        validate: value => {
          const err = validateAppName(value);
          return err || undefined;
        },
      })
    );
    const candidate = String(answer).trim();
    const candidatePath = path.join(targetDir, candidate);
    if (await pathExists(candidatePath)) {
      p.note(
        `目标目录已存在: ${candidatePath}\n请更换应用英文名，或退出后通过 --target-dir 指定其他父目录。`,
        '目录冲突'
      );
      continue;
    }
    name = candidate;
  }

  /** 实际弹出过的问题的初始值；命令行已预设、未提问的字段不记录，保持「用户指定」。 */
  const defaults = {};

  // 3. 激活路由 (activeRule)
  const defaultActiveRule = toActiveRule(name);
  let activeRule = initialInput.activeRule;
  if (!activeRule) {
    defaults.activeRule = defaultActiveRule;
    activeRule = handleCancel(
      await p.text({
        message: '激活路由 (activeRule):',
        initialValue: defaultActiveRule,
        placeholder: defaultActiveRule,
        validate: value => {
          const err = validateActiveRule(value);
          return err || undefined;
        },
      })
    );
  }

  // 4. 本地端口探测
  let probedPort = DEFAULT_PORT;
  try {
    probedPort = await probeFreePort(DEFAULT_PORT);
  } catch {}
  if (probedPort !== DEFAULT_PORT) {
    p.note(`默认端口 ${DEFAULT_PORT} 已被占用，已为您推荐空闲端口 ${probedPort}`, '端口提示');
  }

  let port = initialInput.port;
  if (!port) {
    defaults.port = String(probedPort);
    const portAnswer = handleCancel(
      await p.text({
        message: '本地开发端口:',
        initialValue: String(probedPort),
        validate: value => {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 1 || n > 65535) {
            return '端口必须是 1 到 65535 之间的整数';
          }
          return undefined;
        },
      })
    );
    port = Number(portAnswer);
  }

  // 5. 接口前缀 (apiBase)
  const defaultApiBase = `/api${activeRule}`;
  let apiBase = initialInput.apiBase;
  if (!apiBase) {
    defaults.apiBase = defaultApiBase;
    apiBase = handleCancel(
      await p.text({
        message: '接口请求前缀 (apiBase):',
        initialValue: defaultApiBase,
        validate: value => {
          if (!value.startsWith('/')) return 'apiBase 必须以 / 开头';
          return undefined;
        },
      })
    );
  }

  // 6. 代理目标 (proxyTarget)
  const defaultProxyTarget = process.env.YSS_PROXY_TARGET || DEFAULT_PROXY_TARGET;
  let proxyTarget = initialInput.proxyTarget;
  if (!proxyTarget) {
    defaults.proxyTarget = defaultProxyTarget;
    proxyTarget = handleCancel(
      await p.text({
        message: '后端代理目标 (proxyTarget):',
        initialValue: defaultProxyTarget,
        placeholder: '填后端本地或测试环境网关地址',
        validate: value => {
          try {
            const u = new URL(value);
            if (!HTTP_PROTOCOLS.includes(u.protocol)) return '必须是 HTTP(S) URL';
          } catch {
            return '请输入合法的 URL 地址，如 http://127.0.0.1:3000';
          }
          return undefined;
        },
      })
    );
  }

  // 7. 描述（可选）；OpenAPI 地址不再询问，仅通过 --openapi-url 传入
  const description =
    initialInput.description ??
    handleCancel(
      await p.text({
        message: '项目描述 (可选):',
        placeholder: '用于微应用元信息与 README',
      })
    );

  const openapiUrl = initialInput.openapiUrl ?? '';

  const answers = {
    name,
    nameZh,
    activeRule,
    port,
    apiBase,
    proxyTarget,
    description: description ? description.trim() : '',
    openapiUrl: openapiUrl ? openapiUrl.trim() : '',
  };

  return {
    answers,
    defaults,
  };
};

/**
 * 将交互回答合并为最终配置，并保证来源标注准确：
 * 用户直接回车采纳的初始值不作为用户输入传入，交给 resolveOptions 自行推导/取默认/读环境变量。
 *
 * 端口例外：采纳值来自交互阶段的探测结果，而这里以 probePort: false 解析，不传会退回 8081，
 * 因此照常传值，再按与非交互模式一致的规则改标来源（8081 为 default，探测改用其他端口为 derived）。
 *
 * @param {Record<string, any>} initialInput 命令行/配置文件预设输入
 * @param {{ answers: Record<string, any>, defaults: Record<string, string> }} promptResult 交互结果
 * @returns {Promise<{ resolved: Record<string, any>, sources: Record<string, 'user' | 'derived' | 'default' | 'env'>, warnings: string[], targetPath: string }>}
 */
export const resolveInteractiveAnswers = async (initialInput, promptResult) => {
  const { answers, defaults = {} } = promptResult;
  const isAccepted = key => key in defaults && String(answers[key]).trim() === String(defaults[key]).trim();

  const edited = Object.fromEntries(Object.entries(answers).filter(([key]) => key === 'port' || !isAccepted(key)));
  const result = await resolveOptions({ ...initialInput, ...edited }, { probePort: false });

  if (isAccepted('port')) {
    if (result.resolved.port === DEFAULT_PORT) {
      result.sources.port = 'default';
    } else {
      result.sources.port = 'derived';
      result.warnings.push(`默认端口 ${DEFAULT_PORT} 已被占用，已自动选择下一个空闲端口 ${result.resolved.port}`);
    }
  }

  return result;
};

/**
 * 展示预览并询问用户是否确认创建。
 *
 * @param {Record<string, any>} resolved 规范化后的配置
 * @param {Record<string, 'user' | 'derived' | 'default' | 'env'>} sources 字段来源
 * @param {string} targetPath 目标项目绝对路径
 * @returns {Promise<boolean>} 是否确认
 */
export const confirmCreation = async (resolved, sources, targetPath) => {
  const registry = await resolvePreviewRegistry(resolved);
  const table = formatPreviewTable(resolved, sources, targetPath, { registry });
  p.note(table, '创建参数与来源预览');

  const confirmed = handleCancel(
    await p.confirm({
      message: `确认在目录 ${targetPath} 下创建微应用吗？`,
      initialValue: true,
    })
  );

  return Boolean(confirmed);
};

/**
 * 询问后续初始化选项。
 *
 * @param {object} defaults 默认选择
 * @returns {Promise<{ install: boolean, git: boolean }>}
 */
export const promptPostActions = async (defaults = {}) => {
  const install =
    defaults.install !== undefined
      ? defaults.install
      : handleCancel(
          await p.confirm({
            message: '是否立即安装项目依赖？',
            initialValue: false,
          })
        );

  const git =
    defaults.git !== undefined
      ? defaults.git
      : handleCancel(
          await p.confirm({
            message: '是否初始化 Git 仓库并执行首次提交？',
            initialValue: true,
          })
        );

  return {
    install: Boolean(install),
    git: Boolean(git),
  };
};
