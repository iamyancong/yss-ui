---
title: MCP 文档服务更新日志
nav:
  title: 更新日志
  path: /changelog/mcp
toc: content
---

# MCP 文档服务更新日志

YSS MCP 文档服务（`@yss-ui/mcp`）的版本更新记录。

## v0.8.6

`2026-10-28`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.8.5

`2026-10-28`

### 📝 Documentation

- **索引同步**：同步 FilePreview 缩放 API、`.xls` 样式说明与 Skills 文档索引。

---

## v0.8.4

`2026-10-28`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.8.3

`2026-10-27`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.8.2

`2026-10-26`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.8.1

`2026-10-22`

### ✨ Features

- **FilePreview Excel 对象**：`get_component_docs('FilePreview')` 返回的用法说明包含 Excel 图表、图片、形状、批注、超链接、条件格式和迷你图的叠加层支持情况（瀑布 / 树状 / 旭日 / 直方图 / 箱线 / 漏斗 / 股票图可绘制；曲面图、地图图表、无位图 EMF、threadedComments、公式类条件格式等限制），以及 echarts 按需加载、不重新计算公式。

---

## v0.8.0

`2026-10-21`

### ✨ Features

- **可选能力说明**：`get_component_docs` 与 `get_component_schema` 查询 FilePreview / FilePreviewModal 时，附带消费契约 `optionalFeatures` 中的实验性 pptx 启用方式（子路径 `@yss-ui/components/file-preview/pptx`、`pnpm add @aiden0z/pptx-renderer@1.4.0`、在 `main.ts` 调用一次 `registerPptxRenderer()`、禁止事项与限制）；`get_consumption_contract` 的 `subpaths` 包含 `./file-preview/pptx` (#57)。

### 🐛 Bug Fixes

- **同目录多组件 Schema**：`generate-schemas` 支持登记同一目录下的额外公开组件，新增 `file-preview-modal`（`YFilePreviewModal`），`get_component_schema` 与 API 快照门禁都能覆盖到 (#57)。
- **Schema 查询优先精确匹配**：`get_component_schema` 先按名称精确匹配，再做模糊匹配，避免 `FilePreview` 命中 `file-preview-modal` (#57)。
- **FilePreviewModal Schema**：`get_component_schema('FilePreviewModal')` 包含新增的 `fileSwitcher`（默认 `true`）与 `loop`（默认 `false`）属性，`FilePreviewItem` 的 `fileSize` 随类型说明同步 (#57)。
- **FilePreview 文档索引**：`get_component_docs('FilePreview')` 返回的用法说明包含 `useFilePreview` 继承调用方上下文的规则与标题栏按钮说明，语言包类型新增 `close` (#57)。
- **FilePreview PPTX 图片与前缀**：`get_component_docs('FilePreview')` 返回的用法说明包含 pptx 图片处理（TIFF 转 PNG、EMF / WMF 占位与 `loadMetafile`、`zipLimits`、`maxImagePixels`）与自定义 `prefixCls` 的说明，语言包类型新增 `pptxImage*`、`pptxTooLarge` (#57)。
- **FilePreview Excel 显示**：`get_component_docs('FilePreview')` 返回的用法说明包含 Excel 显示规则（按保存的值与数字格式显示、不重新计算公式及提示、`numfmt` 可选依赖）与 docx 图片占位说明，语言包类型新增 `excelFormulaMissing`、`excelRecalcOnLoad`、`docxImageUnsupported` (#57)。
- **索引同步**：重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---

## v0.7.2

`2026-10-16`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.7.1

`2026-10-15`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.7.0

`2026-10-15`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.6.0

`2026-10-14`

### 🚀 Features

- **skills 依赖引导**：索引构建时自动识别含脚本的 Skill 并标记 `requiresLocalInstall`；`get_skill` 在正文前置注入本地脚本依赖提示，其中微应用脚手架优先推荐 `npx @yss-ui/create` CLI 免装方式，其他脚本提示确认本地文件或 `npx -y @yss-ui/skills-cli sync` 安装，严禁自行编写替代脚本 (#36)。
- **list_skills 增强**：对依赖本地脚本的 Skill 增加「需本地安装 Skills」标注，纯文档型 Skill 输出保持不变 (#36)。
- **search_docs 标注**：搜索命中带本地脚本的 Skill 时在来源标注「（需本地安装 Skills）」(#36)。
- **文档完善**：MCP README 与文档站 `/guide/mcp` 补充「MCP 与 Skills 的关系」小节及推荐的一体化接入步骤 (#36)。

---

## v0.5.1

`2026-10-14`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.5.0

`2026-10-13`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.4.0

`2026-10-12`

### 🚀 Features

- **skills 资源覆盖**：`build-index.js` 全量索引各 Skill 的 `references/**/*.md` 全文与 `scripts/**` 清单及注释元数据 (#50)。
- **get_skill 扩展**：支持 `include: ['references', 'scripts']` 参数提取参考文档与辅助脚本，支持 `file` 参数精准读取单个指定附属文件 (#50)。
- **list_skills 增强**：输出列表中补充 `references` 和 `scripts` 附属资源标记与数量 (#50)。
- **search_docs 增强**：支持跨 Skill references 内容全文检索 (#50)。

---

## v0.3.9

`2026-10-10`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.3.8

`2026-10-10`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.3.7

`2026-10-10`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.3.6

`2026-09-28`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.3.5

`2026-09-28`

### 📝 Documentation

- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。

---
## v0.3.4

`2026-09-20`

### 🐛 Bug Fixes

- **消费契约索引**：同步无插件 ESM 根入口按组件关联样式、显式全量 CSS 兼容路径及 CJS/全量导入的裁剪边界；同步操作列禁用确认行为说明。

---

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
