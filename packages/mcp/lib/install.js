/* eslint-disable no-console -- CLI 安装器，console 即用户界面 */

/**
 * yss-mcp 一键安装器：把 yss-ui MCP Server 写入各 AI IDE 的 MCP 配置。
 *
 * 用法：
 *   npx -y @yss-ui/mcp install                       # 交互式多选
 *   npx -y @yss-ui/mcp install cursor codex          # 指定目标直装
 *   npx -y @yss-ui/mcp install cursor --global       # 项目级/全局（仅影响支持双作用域的工具）
 *
 * 安全约定：
 * - 只增改 mcpServers 下的 yss-ui 条目，绝不动其他 server 配置；
 * - 目标文件 JSON 解析失败时跳过并打印手工配置片段，绝不覆盖损坏文件。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { TOOL_DEFINITIONS } = require('./tools');

/** 写入的 server 名称。 */
const SERVER_NAME = 'yss-ui';

/** 写入的 server 配置。 */
const SERVER_ENTRY = { command: 'npx', args: ['-y', '@yss-ui/mcp'] };

/**
 * 解析 Trae 全局配置路径：多个已知候选（含 CN 版），优先已存在的文件/目录。
 *
 * @returns {string} 配置文件绝对路径
 */
function resolveTraePath() {
  const home = os.homedir();
  const candidates = [];
  if (process.platform === 'darwin') {
    for (const app of ['Trae', 'Trae CN', 'TRAE SOLO CN']) {
      candidates.push(path.join(home, 'Library/Application Support', app, 'User/mcp.json'));
      candidates.push(path.join(home, 'Library/Application Support', app, 'User/settings/mcp.json'));
    }
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData/Roaming');
    for (const app of ['Trae', 'Trae CN', 'TRAE SOLO CN']) {
      candidates.push(path.join(appData, app, 'User/mcp.json'));
      candidates.push(path.join(appData, app, 'User/settings/mcp.json'));
    }
  } else {
    candidates.push(path.join(home, '.config/Trae/User/mcp.json'));
  }
  const existingFile = candidates.find(candidate => fs.existsSync(candidate));
  if (existingFile) return existingFile;
  const installedDir = candidates.find(candidate => fs.existsSync(path.dirname(path.dirname(candidate))));
  return installedDir || candidates[0];
}

/**
 * 解析 VS Code 用户配置目录（按平台）。
 *
 * @returns {string} User 目录绝对路径
 */
function vscodeUserDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library/Application Support/Code/User');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Code/User');
  }
  return path.join(home, '.config/Code/User');
}

/**
 * 安装目标注册表。
 * resolve(scope) 返回 { file, format, jsonPath }：
 * - format: 'json' 时 jsonPath 为 mcpServers 所在的顶层键路径；'toml' 走 Codex 专用写入。
 */
const TARGETS = [
  {
    id: 'cursor',
    label: 'Cursor',
    scoped: true,
    resolve: scope => ({
      file:
        scope === 'global' ? path.join(os.homedir(), '.cursor/mcp.json') : path.join(process.cwd(), '.cursor/mcp.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: `Settings → MCP 中 yss-ui 为绿色且有 ${TOOL_DEFINITIONS.length} 个工具`,
  },
  {
    id: 'codex',
    label: 'Codex（CLI / IDE 插件）',
    scoped: false,
    resolve: () => ({ file: path.join(os.homedir(), '.codex/config.toml'), format: 'toml' }),
    verify: '会话中输入 /mcp 查看 yss-ui 及工具清单',
  },
  {
    id: 'claude',
    label: 'Claude Code（项目 .mcp.json）',
    scoped: false,
    resolve: () => ({ file: path.join(process.cwd(), '.mcp.json'), format: 'json', jsonPath: ['mcpServers'] }),
    verify: 'claude mcp list 显示 yss-ui: connected（全局安装请用 claude mcp add）',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    scoped: true,
    resolve: scope => ({
      file:
        scope === 'global'
          ? path.join(os.homedir(), '.gemini/config/mcp_config.json')
          : path.join(process.cwd(), '.agents/mcp_config.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: 'MCP Servers 面板显示 yss-ui 及工具数量（改完需 Refresh）',
  },
  {
    id: 'trae',
    label: 'Trae（全局；项目级 .trae/mcp.json 需开启 Enable Project MCP，暂不自动写入）',
    scoped: false,
    resolve: () => ({ file: resolveTraePath(), format: 'json', jsonPath: ['mcpServers'] }),
    verify: '设置 → MCP 列表出现 yss-ui（改完需重启）',
  },
  {
    id: 'qoder',
    label: 'Qoder（用户级 settings.json）',
    scoped: false,
    resolve: () => ({
      file: path.join(os.homedir(), '.qoder/settings.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: 'Qoder Settings → MCP 的 My Servers 出现 yss-ui',
  },
  {
    id: 'kiro',
    label: 'Kiro',
    scoped: true,
    resolve: scope => ({
      file:
        scope === 'global'
          ? path.join(os.homedir(), '.kiro/settings/mcp.json')
          : path.join(process.cwd(), '.kiro/settings/mcp.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: '命令面板 → Kiro: Open workspace/user MCP config 可见 yss-ui，MCP 面板显示已连接',
  },
  {
    id: 'windsurf',
    label: 'Windsurf（仅全局）',
    scoped: false,
    resolve: () => ({
      file: path.join(os.homedir(), '.codeium/windsurf/mcp_config.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: 'Cascade 面板 MCP 图标出现 yss-ui（改完需 Refresh）',
  },
  {
    id: 'vscode',
    label: 'VS Code（GitHub Copilot，注意顶层键为 servers）',
    scoped: true,
    resolve: scope => ({
      file: scope === 'global' ? path.join(vscodeUserDir(), 'mcp.json') : path.join(process.cwd(), '.vscode/mcp.json'),
      format: 'json',
      jsonPath: ['servers'],
    }),
    verify: '命令面板 → MCP: List Servers 出现 yss-ui（mcp.json 顶部有 Start 按钮）',
  },
  {
    id: 'cline',
    label: 'Cline（VS Code 扩展，全局）',
    scoped: false,
    resolve: () => ({
      file: path.join(vscodeUserDir(), 'globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: 'Cline 面板 MCP Servers 图标 → Configure 中出现 yss-ui',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    scoped: true,
    resolve: scope => ({
      file:
        scope === 'global'
          ? path.join(os.homedir(), '.gemini/settings.json')
          : path.join(process.cwd(), '.gemini/settings.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: '会话中输入 /mcp 查看 yss-ui 及工具清单',
  },
  {
    id: 'copilot-cli',
    label: 'GitHub Copilot CLI（全局）',
    scoped: false,
    resolve: () => ({
      file: path.join(os.homedir(), '.copilot/mcp-config.json'),
      format: 'json',
      jsonPath: ['mcpServers'],
    }),
    verify: 'copilot 会话中输入 /mcp show 查看 yss-ui',
  },
];

/** 手工配置片段（写入失败时给用户兜底）。 */
const MANUAL_SNIPPET = JSON.stringify({ mcpServers: { [SERVER_NAME]: SERVER_ENTRY } }, null, 2);

/**
 * 合并写入 JSON 配置：只设置 jsonPath 下的 yss-ui 条目。
 *
 * @param {string} file 目标文件绝对路径
 * @param {string[]} jsonPath mcpServers 所在键路径
 * @returns {'written' | 'unchanged'} 写入结果
 */
function writeJsonConfig(file, jsonPath) {
  let root = {};
  if (fs.existsSync(file)) {
    const raw = fs
      .readFileSync(file, 'utf8')
      .replace(/^\uFEFF/, '')
      .trim();
    if (raw) root = JSON.parse(raw);
  }
  let node = root;
  for (const key of jsonPath) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  if (JSON.stringify(node[SERVER_NAME]) === JSON.stringify(SERVER_ENTRY)) return 'unchanged';
  node[SERVER_NAME] = SERVER_ENTRY;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
  return 'written';
}

/**
 * 写入 Codex 的 TOML 配置：替换或追加 [mcp_servers.yss-ui] 区块。
 *
 * @param {string} file config.toml 绝对路径
 * @returns {'written' | 'unchanged'} 写入结果
 */
function writeCodexToml(file) {
  const block = `[mcp_servers.${SERVER_NAME}]\ncommand = "npx"\nargs = ["-y", "@yss-ui/mcp"]\n`;
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const headerRe = new RegExp(`^\\[mcp_servers\\.${SERVER_NAME}\\]\\s*$`, 'm');
  const headerMatch = content.match(headerRe);
  if (headerMatch) {
    const start = headerMatch.index;
    const rest = content.slice(start + headerMatch[0].length);
    const nextHeader = rest.search(/^\[/m);
    const end = nextHeader === -1 ? content.length : start + headerMatch[0].length + nextHeader;
    const replaced = `${content.slice(0, start)}${block}${content.slice(end)}`;
    if (replaced === content) return 'unchanged';
    fs.writeFileSync(file, replaced, 'utf8');
    return 'written';
  }
  const joined = content ? `${content.replace(/\n*$/, '\n\n')}${block}` : block;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, joined, 'utf8');
  return 'written';
}

/**
 * 安装单个目标。
 *
 * @param {object} target 目标定义
 * @param {'project' | 'global'} scope 作用域
 * @returns {boolean} 是否成功
 */
function installTarget(target, scope) {
  const { file, format, jsonPath } = target.resolve(scope);
  const shortFile = file.startsWith(os.homedir())
    ? file.replace(os.homedir(), '~')
    : path.relative(process.cwd(), file);
  try {
    const result = format === 'toml' ? writeCodexToml(file) : writeJsonConfig(file, jsonPath);
    const status = result === 'unchanged' ? '已存在（跳过）' : '已写入';
    console.log(`✅ ${target.label}: ${shortFile} ${status}`);
    console.log(`   验证: ${target.verify}`);
    return true;
  } catch (error) {
    console.error(`❌ ${target.label}: 写入 ${shortFile} 失败（${error.message}），请手动添加以下配置:`);
    console.error(MANUAL_SNIPPET.replace(/^/gm, '   '));
    return false;
  }
}

/**
 * 单行交互提问。
 *
 * @param {readline.Interface} rl readline 实例
 * @param {string} question 提示文案
 * @returns {Promise<string>} 用户输入
 */
function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * 交互式选择目标与作用域。
 *
 * @returns {Promise<{targets: object[], scope: 'project' | 'global'}>} 选择结果
 */
async function promptSelection() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('把 yss-ui MCP Server 安装到哪些 AI 工具？\n');
  TARGETS.forEach((target, i) => console.log(`  ${i + 1}) ${target.label}`));
  console.log('');
  const rawTargets = await ask(rl, '输入编号（逗号/空格分隔），或 a = 全部: ');
  let targets;
  if (/^a(ll)?$/i.test(rawTargets)) {
    targets = [...TARGETS];
  } else {
    const indexes = rawTargets
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(token => Number(token) - 1);
    targets = indexes.map(i => TARGETS[i]).filter(Boolean);
  }
  if (targets.length === 0) {
    rl.close();
    console.log('未选择任何目标，退出。');
    process.exit(0);
  }

  let scope = 'project';
  const scopedTargets = targets.filter(target => target.scoped);
  if (scopedTargets.length > 0) {
    const names = scopedTargets.map(target => target.id).join(' / ');
    const rawScope = await ask(rl, `\n${names} 写入哪个作用域？ 1) 当前项目（默认） 2) 全局: `);
    scope = rawScope === '2' ? 'global' : 'project';
  }
  rl.close();
  return { targets, scope };
}

/**
 * install 子命令入口。
 *
 * @param {string[]} argv install 之后的命令行参数
 */
async function run(argv) {
  const flags = argv.filter(arg => arg.startsWith('-'));
  const names = argv.filter(arg => !arg.startsWith('-')).map(name => name.toLowerCase());
  const scopeFlag = flags.includes('--global') || flags.includes('-g') ? 'global' : 'project';

  let targets;
  let scope = scopeFlag;
  if (names.length > 0) {
    const unknown = names.filter(name => !TARGETS.some(target => target.id === name));
    if (unknown.length > 0) {
      console.error(`未知目标: ${unknown.join(', ')}。可用: ${TARGETS.map(target => target.id).join(', ')}`);
      process.exit(1);
    }
    targets = TARGETS.filter(target => names.includes(target.id));
  } else if (process.stdin.isTTY) {
    const selection = await promptSelection();
    targets = selection.targets;
    scope = selection.scope;
  } else {
    console.error(
      `非交互环境请显式指定目标，如: yss-mcp install cursor codex。可用: ${TARGETS.map(target => target.id).join(', ')}`
    );
    process.exit(1);
  }

  console.log('');
  let failed = 0;
  for (const target of targets) {
    if (!installTarget(target, scope)) failed += 1;
  }
  console.log(`\n完成: ${targets.length - failed}/${targets.length} 个目标${failed ? `，${failed} 个失败` : ''}。`);
  console.log(
    '探针验证: 对 AI 说「用 yss-ui MCP 的 list_components 列出全部组件」，回复应带工具调用卡片与真实版本号。'
  );
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { run, TARGETS };
