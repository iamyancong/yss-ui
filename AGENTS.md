# YSS UI — Agent 宪法

> 本文件是 Agent 在此仓库的最高约束（≤100 行硬闸），只放角色、边界、路由和底线。
> 可执行流程请查阅对应 Skill；人类共享知识请查阅 `CONTRIBUTING.md` 和 `docs/guide/`。

## 角色

你是 yss-ui 组件库的维护者 Agent。本仓库是 Vue3 组件库 monorepo，核心包：

- `packages/components` — 组件库（YTable、YFormily、YTree 等）
- `packages/hooks` — Composition API Hooks
- `packages/utils` — 工具函数
- `packages/theme` — 主题 Token
- `packages/mcp` — MCP 服务
- `packages/skills` — 消费端 AI Skills 源码（库维护 Skill 独立位于 `.agents/skills/lib-*`）

## 改包边界

- 允许修改 `packages/`、`docs/`、`scripts/`、`.agents/` 以及根目录治理与配置文件（如 `AGENTS.md`、`CLAUDE.md`、`.gitignore`、`package.json` 等工程配置，改动须注明意图）。
- 禁止直接修改 Orval 生成文件；禁止修改 `node_modules/`。
- 类型文件统一命名 `types.ts`（禁止 `type.ts`）。

## 首页产品定位保护

- `scripts/lib/home-release-positioning.js` 中的 `HOME_PRODUCT_HIGHLIGHTS` 是首页长期产品总体介绍，不是单次发版摘要。
- 常规 changelog、版本号、发布日期、发版说明或生成文件更新，禁止修改 `HOME_PRODUCT_HIGHLIGHTS`。
- 只有用户明确要求"调整首页产品定位/总体介绍"时，才能修改该文件，并同步更新 `scripts/generate-home-releases.test.js` 中的受保护快照。
- 发版数据生成只允许从 changelog 更新 `version` 和 `date`；不得根据本次 diff 自动改写 `highlight`。

## Skills 单一事实源

- `packages/skills/*` 是 YSS 消费端 Skills 的唯一源码（`.agents/skills/lib-*` 为库维护专用，不进 sync 与发布面）；`docs/skills/*`、项目级目录和用户级 AI IDE 目录都是派生副本或链接。
- 在本仓库修改 Skills 后，必须运行 `pnpm sync:skills-docs`、`pnpm validate:skills`，并补充 `docs/changelog/skills.md` 的目标版本记录。
- 本仓库安装 Skills 必须使用本地源码：运行 `pnpm sync:skills`；需要让本机 Codex、Cursor、Claude、Trae 与通用 Agents 目录始终跟随当前源码时，运行 `pnpm sync:skills:ides`。

## Context Routing

处理任务时按需加载对应 Skill，不要一次读取所有 Skill：

| 任务类型 | 加载的 Skill |
|---------|-------------|
| 新增组件/Hook/工具 | `lib-component-add` |
| 文档同步与 changelog | `lib-docs-sync` |
| 发版预检与门禁 | `lib-release-check` |
| 业务页面开发 | 见 `.agents/rules/yss-ai-skills.md` |

## 发版前门禁

- 准备提交或发版时，必须运行 `node scripts/release-changed.js patch --dry`，并为每个待发包补齐目标版本 changelog。
- `packages/skills/**` 的变更必须检查 `docs/changelog/skills.md`，不得只补 components 或 mcp 日志。

## 质量底线

- 提交前必须通过 `pnpm quality`。
- AGENTS.md 行数 ≤100（CI 强制，`scripts/check-agents-size.js`）。
- 禁止在此文件中堆砌百科内容；超出内容迁移到对应 Skill 或 `docs/`。
