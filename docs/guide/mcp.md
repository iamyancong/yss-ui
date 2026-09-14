---
title: AI 工具集成（MCP Server）
description: 通过 @yss-ui/mcp 让 AI 工具按需精准查询组件 API、Demo 源码与技能规范
toc: content
---

# MCP Server 查询（@yss-ui/mcp）

让 AI 工具在编码时**按需精准查询**：写组件配置前查真实 API 表、实现表单三态前取官方 Demo 源码、拿不准归属时全文搜索。查询完全离线——文档索引随包发布、版本与组件库对齐，无需任何 LLM 服务或网络。

## 三种集成方式怎么选

| 方式 | 一句话定位 | 何时使用 |
| --- | --- | --- |
| [Skills 技能同步](/guide/ai-skills) | 把开发规范装进项目，AI 生成代码时按需触发标准骨架与硬约束 | 必装，所有 AI 辅助开发的业务项目 |
| **MCP Server 查询**（本页） | AI 编码时按需精准查询组件 API、Demo 源码 | 推荐搭配，工具支持 MCP 时启用 |
| [LLMs.txt 全量文档](/guide/llms) | 把全量文档一次性喂给 AI | 兜底，工具不支持 MCP / 临时会话 |

相比一次性塞入全量 `llms-full.txt`，MCP 的优势是**准**（只取当前需要的章节，不稀释上下文）和**新**（索引随包版本发布，不受工具缓存影响）。推荐组合 = Skills + MCP。

## 可用工具

| 工具 | 用途 |
| --- | --- |
| `list_components` | 列出全部组件/Hooks/工具函数，杜绝虚构 Y 前缀组件 |
| `get_component_docs` | 查询组件 API 章节（props/events/slots/methods）或完整文档 |
| `get_demo` | 获取官方 Demo 完整源码（如 `formily/modes` 三态切换） |
| `search_docs` | 中文关键词全文搜索组件文档与 Skills |
| `list_skills` / `get_skill` | 浏览并读取开发技能规范 |
| `get_codegen_rules` | 获取业务代码生成硬规则（样式导入、SFC 结构等） |
| `get_component_schema` | 获取组件精确 JSON Schema（Props约束/枚举值/默认值/Emits/Slots），防止属性名幻觉 |
| `get_test_coverage` | 获取组件库自动化测试覆盖率指标与单测文件清单；不传查全库大盘，传参查单模块 |

> 索引由 `pnpm mcp:index` 生成（发布时自动执行），数据源与本文档站同源，含 25 个文档条目与 171+ 官方 Demo 源码。组件文档、官方 Demo、Skills 或代码生成规则变更后，发版流水线会重建索引并发布新的 `@yss-ui/mcp`。业务项目通过 `npx -y @yss-ui/mcp` 使用的是 npm 包内的离线快照，不是 yss-ui 仓库工作树。

## 一键安装（推荐）

在业务项目根目录执行：

```bash
npx -y @yss-ui/mcp install
```

交互式勾选要安装的 AI 工具（Cursor / Codex / Claude Code / Antigravity / Trae / Qoder / Kiro / Windsurf / VS Code Copilot / Cline / Gemini CLI / Copilot CLI），安装器会自动把 `yss-ui` 写入各工具的 MCP 配置文件，并给出每个工具的验证方法。

也可以跳过交互直接指定目标：

```bash
npx -y @yss-ui/mcp install cursor codex            # 只装这两个
npx -y @yss-ui/mcp install cursor --global         # Cursor/Antigravity 写全局配置（默认写当前项目）
```

各目标的写入位置：

| 目标 | 写入位置 |
| --- | --- |
| `cursor` | 项目 `.cursor/mcp.json`，`--global` 时 `~/.cursor/mcp.json` |
| `codex` | `~/.codex/config.toml`（`[mcp_servers.yss-ui]`） |
| `claude` | 项目 `.mcp.json`（可提交仓库共享；全局请用 `claude mcp add`） |
| `antigravity` | 项目 `.agents/mcp_config.json`，`--global` 时 `~/.gemini/config/mcp_config.json` |
| `trae` | 全局 `~/Library/Application Support/Trae/User/mcp.json`（项目级为实验特性，不写入） |
| `qoder` | 用户级 `~/.qoder/settings.json` |
| `kiro` | 项目 `.kiro/settings/mcp.json`，`--global` 时 `~/.kiro/settings/mcp.json` |
| `windsurf` | 全局 `~/.codeium/windsurf/mcp_config.json`（Windsurf 不支持项目级） |
| `vscode` | 项目 `.vscode/mcp.json`，`--global` 时 VS Code 用户目录 `mcp.json`（顶层键为 `servers`，安装器已自动适配） |
| `cline` | 全局，VS Code globalStorage 内 `cline_mcp_settings.json`（按操作系统自动定位） |
| `gemini-cli` | 项目 `.gemini/settings.json`，`--global` 时 `~/.gemini/settings.json` |
| `copilot-cli` | 全局 `~/.copilot/mcp-config.json` |

> 安装器只增改 `mcpServers` 下的 `yss-ui` 条目，不会碰其他 server 配置；目标文件解析失败时会跳过并打印手工配置片段，绝不覆盖。重复执行安全（已配置则跳过）。

## 手动配置方式

不想用安装器时，可手动配置。所有工具的配置本质相同：用 `npx -y @yss-ui/mcp` 启动一个 stdio 进程。以下按工具给出配置位置与格式。

### Cursor

在业务项目根目录创建 `.cursor/mcp.json`（仅当前项目生效），或写入 `~/.cursor/mcp.json`（全局生效）：

```json
{
  "mcpServers": {
    "yss-ui": {
      "command": "npx",
      "args": ["-y", "@yss-ui/mcp"]
    }
  }
}
```

保存后打开 **Settings → Tools & Integrations → MCP**，看到 `yss-ui` 状态为绿色且展开有 7 个工具即接入成功。

### Codex（CLI / IDE 插件）

编辑 `~/.codex/config.toml`，追加：

```toml
[mcp_servers.yss-ui]
command = "npx"
args = ["-y", "@yss-ui/mcp"]
```

在 Codex 会话中输入 `/mcp` 可查看已连接的 server 与工具清单。

### Claude Code

```bash
claude mcp add yss-ui -- npx -y @yss-ui/mcp
```

或在项目根目录创建 `.mcp.json`（内容与 Cursor 的 `mcpServers` 格式相同，可提交进仓库供团队共享）。用 `claude mcp list` 验证连接。

### Antigravity

打开 Agent 面板右上角 **MCP Servers → Manage MCP Servers → View raw config**，在打开的 `mcp_config.json` 中添加（格式与 Cursor 相同）：

```json
{
  "mcpServers": {
    "yss-ui": {
      "command": "npx",
      "args": ["-y", "@yss-ui/mcp"]
    }
  }
}
```

保存后点击 Refresh，面板中 `yss-ui` 显示工具数量即生效。Trae / Qoder 等其他支持 MCP 的工具同理，均使用 `mcpServers` 标准格式。

> **注意**：`npx -y @yss-ui/mcp` 支持从公网 npm 或内网 npm registry 下载。在 yss-ui 仓库内开发时可直接指向本地入口：`"command": "node", "args": ["packages/mcp/bin/yss-mcp.js"]`（本仓库已内置 `.cursor/mcp.json`）。

## 如何验证 MCP 调用成功

按可信度从高到低，三层验证：

### 1. 连接层（配置后先看一次）

- Cursor：Settings → MCP 中 `yss-ui` 为绿色，展开可见 7 个工具；
- Codex：会话中输入 `/mcp`，列表出现 `yss-ui` 及工具清单；
- Claude Code：`claude mcp list` 显示 `yss-ui: connected`；
- Antigravity：MCP Servers 面板显示 `yss-ui` 及工具数量。

不依赖任何 AI 工具的终端自检：运行 `npx -y @yss-ui/mcp`，stderr 输出 `yss-mcp v0.1.1 已启动（YSS UI v1.5.x，25 个文档条目）` 即 server 本身正常（Ctrl+C 退出）。

### 2. 调用层（发一条探针指令）

对 AI 说：

```
用 yss-ui MCP 的 list_components 工具列出全部组件
```

判定标准：回复中出现**工具调用卡片**（Cursor/Antigravity 会显示 "Called list_components" 之类的折叠块，Codex 显示 tool call 记录），且返回内容第一行带**真实版本号与索引时间**（如 `YSS UI v1.5.15（索引生成于 2026-08-13…）`）。版本号能对上 = 数据真的来自 MCP；没有卡片、直接口头列组件 = AI 在凭记忆编，未调用。

### 3. 编码过程层（日常观察）

让 AI 写一个 YTable 列表页，过程中应能看到 `get_component_docs`、`get_demo`、`get_skill` 等调用记录穿插出现。如果 AI 从不调用，可在项目规则（如 `.cursor/rules`）中加一条：

```
生成 YSS UI 组件代码前，必须先通过 yss-ui MCP 的 get_component_docs 查询真实 API，禁止凭记忆编写配置项。
```

## 常见问题

### Q: 首次启动很慢或失败？

**A:** `npx -y @yss-ui/mcp` 首次执行需从 npm registry 下载包（之后走本地缓存）。确认网络可达或 `.npmrc` 指向有效 registry；若长期离线，可全局安装一次 `npm i -g @yss-ui/mcp` 后把 `command` 改为 `yss-mcp`。

### Q: 查询结果的版本和项目用的组件库版本不一致？

**A:** 索引随 `@yss-ui/mcp` 包发布，`npx -y` 默认拉最新版。若项目锁定旧版组件库，可安装对应版本：`npx -y @yss-ui/mcp@<version>`（各版本内置与其同期的文档索引）。

### Q: 和 LLMs.txt 应该二选一吗？

**A:** 工具支持 MCP 时优先用 MCP（更准、更省上下文）；LLMs.txt 保留给不支持 MCP 的工具或临时会话，两者可共存互不影响。
