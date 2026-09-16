# @yss-ui/mcp

YSS UI 文档 MCP Server：让 coding agent 精准查询组件 API、官方 Demo 源码、Skills 与代码生成规则。

## 为什么需要它

AI 生成 YSS UI 业务页面不准确的根因之一，是模型只能"凭记忆"猜组件配置。
本包把文档站的全部内容（组件 API 表、171+ 官方 Demo 源码、30+ 个 Skills、代码生成硬规则）
打成随包发布的离线索引，AI 工具在编码时按需精准查询：

- 写 `YTable` 列配置前 → `get_component_docs` 查真实 API 表；
- 实现表单新增/编辑/查看三态前 → `get_demo formily/modes` 取官方标准写法；
- 拿不准"回显丢失"该看哪份规范 → `search_docs 编辑表单回显` 直达 `page-form-module`；
- 防止虚构组件 → `list_components` 给出全部真实导出。

查询零网络、零 LLM 依赖、确定性输出；索引版本与组件库版本对齐。

## 使用

### 一键安装（推荐）

```bash
npx -y @yss-ui/mcp install                    # 交互式勾选 AI 工具
npx -y @yss-ui/mcp install cursor codex       # 直接指定目标
npx -y @yss-ui/mcp install cursor --global    # 写全局配置（默认写当前项目）
```

支持 12 个目标：`cursor` / `antigravity` / `kiro` / `vscode` / `gemini-cli`（项目/全局双作用域），`codex` / `claude` / `trae` / `qoder` / `windsurf` / `cline` / `copilot-cli`（单作用域）。安装器只增改 `yss-ui` 一个条目（VS Code 的 `servers` 键已自动适配），重复执行安全，配置文件损坏时跳过并打印手工片段。

### 手动配置

所有工具本质相同：用 `npx -y @yss-ui/mcp` 启动 stdio 进程，配置写入各工具的 MCP 配置文件：

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

## 验证调用成功

1. **连接层**：工具的 MCP 面板中 `yss-ui` 已连接且有 10 个工具；或终端运行 `npx -y @yss-ui/mcp`，stderr 输出 `yss-mcp v<已安装版本> 已启动…` 即 server 正常。
2. **调用层**：对 AI 说「用 yss-ui MCP 的 list_components 列出全部组件」——回复必须带工具调用卡片，且首行含真实版本号（如 `YSS UI v1.5.15`）。没有卡片、直接口头列组件 = 未调用，是凭记忆编的。
3. **过程层**：让 AI 写组件代码时，应能看到 `get_component_docs` / `get_demo` 调用记录。不调用时可在项目规则中强制：「生成 YSS UI 代码前必须先用 yss-ui MCP 查询真实 API」。

完整接入指南见文档站 `指南 → AI 工具集成 → MCP Server 查询`（`/guide/mcp`）。

## 工具清单

| 工具 | 入参 | 说明 |
| --- | --- | --- |
| `get_consumption_contract` | `componentsVersion?` | 查询目标版本的统一入口、插件与样式规则；未知版本要求核验实际 exports |
| `list_components` | — | 列出全部组件/Hooks/工具函数（含 Demo 数量） |
| `get_component_docs` | `name`，`section?: api\|full` | 组件文档，默认仅 API 章节；支持 `YTable` / `y-table` / `表格` 等写法 |
| `get_demo` | `component`，`demo?` | 不传 `demo` 列出可用 Demo；传入返回完整源码（vue/hooks/less） |
| `search_docs` | `query`，`limit?` | 中文二元组词法全文搜索（组件文档 + Skills） |
| `list_skills` | — | 全部 Skills 及触发场景描述 |
| `get_skill` | `name` | Skill 完整内容（硬约束、标准骨架、失败兜底） |
| `get_codegen_rules` | — | 业务代码生成硬规则（.cursorrules 快照） |
| `get_component_schema` | `name`，`detail?: core\|all` | 获取组件精确 JSON Schema（Props约束/枚举值/默认值/Emits/Slots），防止属性名幻觉 |
| `get_test_coverage` | `component?` | 获取组件库自动化测试覆盖率指标与单测文件清单；不传查全库大盘，传参查单模块 |

## 索引构建（仅在 yss-ui 仓库内）

```bash
pnpm mcp:index   # 生成 data/index.json（发布时 prepack/prepublishOnly 自动执行）
```

数据源与文档站同源：`.dumirc.ts` sidebar → `docs/**/*.md` + `docs/**/demos/**` + `packages/skills/*/SKILL.md` + `.cursorrules`。

`get_consumption_contract` 中的 `plugin.vite` 表示官方插件已完成验证的范围，`plugin.vitePeer` 与顶层 `peerDependencies.vite` 表示实际安装兼容范围；两者不应混用。当前 Vite 6 完整验收，Vite 5 仅完成包管理器解析验证。

发版时 MCP 必须在组件包版本写入并发布后重建索引；GitHub Actions 会从 registry tarball 复核 `componentsVersion` 与本批组件目标版本一致，防止工作区索引和最终发布包漂移。

本地调试可用环境变量覆盖索引路径：`YSS_MCP_INDEX=/path/to/index.json yss-mcp`。
