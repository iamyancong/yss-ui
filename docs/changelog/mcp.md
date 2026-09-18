---
title: MCP 文档服务更新日志
nav:
  title: 更新日志
  path: /changelog/mcp
toc: content
---

# MCP 文档服务更新日志

YSS MCP 文档服务（`@yss-ui/mcp`）的版本更新记录。

## v0.3.3

`2026-09-18`

### 🐛 Bug Fixes

- **索引同步与门禁加固**：组件发版强制跟发派生包 `@yss-ui/mcp` 以重建并发布最新索引，发布后校验门禁阻断组件独发而遗漏 MCP 的情形；同步更新索引中的 `componentsVersion` 与消费契约至 `1.7.2` (#29)。

---

## v0.3.2

`2026-09-16`

### 🐛 Bug Fixes

- **发布索引一致性**：同批次发布时按最终组件目标版本重建 MCP 索引，并在 registry tarball 中复核 `componentsVersion`，避免工作区校验通过但已发布索引漂移。

---

## v0.3.1

`2026-09-16`

### 🐛 Bug Fixes

- **消费契约索引**：同步输出组件库当前版本与 Vite peer 范围；发布前强制重建并校验索引，避免 Agent 继续读取过期版本或不完整的安装约束。

---

## v0.3.0

`2026-09-15`

### ✨ Features

- **消费契约**：新增 `get_consumption_contract`，按目标版本返回入口与构建规则；组件文档、Demo 和代码生成规则标注索引版本及业务消费边界。

---

## v0.2.6

`2026-09-14`

### ✨ Features

- **get_component_schema**: 新增组件精确 JSON Schema 结构化提取工具，基于 `@vue/component-meta` 提取 Props 约束、枚举值、默认值、Emits 与 Slots，支持 core/all 两级剪枝防膨胀，防止 AI 产生属性名幻觉 (#6)。
- **get_test_coverage**: 新增测试覆盖率查询工具，支持查看全库指标大盘与各组件独立覆盖率、单测文件列表 (#6)。
- **list_components**: 列表输出中增强展示各组件的自动化测试覆盖率状态 (#6)。

---

## v0.2.5

`2026-09-12`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.2.4

`2026-09-12`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.2.3

`2026-09-12`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.2.2

`2026-09-11`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.2.1

`2026-09-10`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.2.0

`2026-09-05`

### 📝 Documentation

- **索引同步**: 重建并发布离线文档索引与技能规范（包含表格多语言操作列宽度自适应与纠偏规范）。

---

## v0.1.8

`2026-09-01`

### 📝 Documentation

- **README**: 更新技能数量描述与文档说明。
- **索引同步**: 重建并发布文档索引，纳入新增的 `component-testing` 与 `skill-development` 技能规范。

---

## v0.1.7

`2026-08-27`

### 📝 Documentation

- **索引同步**: 重建并发布离线文档索引（组件 API / Demo / 31 个 Skills / 代码生成规则），包含全新 `sync-internal-dev` 技能规范。
- **命名空间与发包体系**: 包名统一为 `@yss-ui/mcp`，安装器支持多 IDE（Cursor、Codex、Claude Code、Antigravity、Trae、VS Code、Cline）一键自动注册与公网/私服双轨发布。

---

## v0.1.6

`2026-08-19`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则），统一 Skills 标准目录与多 IDE 兼容同步规则。

---

## v0.1.5

`2026-08-19`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则），纳入组件暗色主题适配、YFormily 校验反馈归一化、Formily Skills 校验职责规范与首页产品定位保护规则。

---

## v0.1.4

`2026-08-18`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则），纳入 Formily 弹层表单数据前置同步、生命周期隔离与文本校验防坑规范。

---

## v0.1.3

`2026-08-17`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则），包含 YTable 多选双向受控与批量操作规范。

---

## v0.1.2

`2026-08-17`

### 🔧 Build

- **派生发版**: 组件文档、官方 Demo、Skills 或代码生成规则变更时，发版流水线会重建索引并发布 `@yss/mcp`；索引内容未变则跳过。补充 `build` 脚本，使 CI `pnpm --filter @yss/mcp run build` 可执行。

### 📝 Documentation

- **索引同步**: 业务侧 `npx -y @yss/mcp` 使用 npm 包内离线快照；文档站更新后需随发版发布新的 MCP 包才会生效。

---

## v0.1.1

`2026-08-13`

> 首个发布版本（CI 自动从初始版本 0.1.0 递增）。

### ✨ Features

- **MCP Server**: 新增 `@yss/mcp` 文档查询服务（stdio），供 Cursor、Codex、Antigravity 等 AI 编程工具接入，提供 7 个查询工具：`list_components`（组件清单，杜绝虚构组件）、`get_component_docs`（API 章节/完整文档）、`get_demo`（官方 Demo 完整源码）、`search_docs`（中文全文搜索）、`list_skills` / `get_skill`（技能规范）、`get_codegen_rules`（代码生成硬规则）。
- **离线索引**: 文档索引随包发布（`pnpm mcp:index` 生成，publish 时自动构建），数据与文档站同源（组件 API 表、171+ 官方 Demo 源码、30 个 Skills、代码生成硬规则），查询零网络、零 LLM 依赖，索引版本与组件库版本对齐。
- **名称解析**: 组件名支持 `YTable` / `y-table` / `table` / `表格` / `useTableHeight` 等多种写法；虚构组件（如 `YSelect`）会得到明确纠正提示并引导查询真实组件清单。
- **一键安装器**: `npx -y @yss/mcp install` 交互式（或指定目标）安装到 12 个主流 AI 工具的 MCP 配置——Cursor / Codex / Claude Code / Antigravity / Trae / Qoder / Kiro / Windsurf / VS Code Copilot / Cline / Gemini CLI / Copilot CLI，支持项目级/全局作用域，自动适配各家格式差异（如 VS Code 的 `servers` 键），只增改 `yss-ui` 条目、重复执行安全、损坏配置零覆盖。

### 📝 Documentation

- **AI 工具集成指南**: `指南 → AI 工具集成` 新增「MCP Server 接入」章节，覆盖 Cursor / Codex / Claude Code / Antigravity 的配置方式与调用验证方法。

### 🔧 Build

- **发布配置**: 补充 `publishConfig` 指向 npm-hosted 仓库，修复 CI 发布到只读 group 源返回 400 的问题。
