---
title: AI Skills 更新日志
nav:
  title: 更新日志
  path: /changelog/skills
toc: content
---

# AI Skills 更新日志

YSS AI Skills（`@yss-ui/skills`）的版本更新记录。

## v1.5.1

`2026-09-16`

### 📝 Documentation

- **统一消费契约**：将官方 Vite 插件的版本说明更新为“自 1.7.0 起已发布”，明确 Vite 6 验收边界，避免 Agent 把已发布能力识别为待发布能力。

---

## v1.5.0

`2026-09-15`

### ✨ Features

- **统一消费规则**：根入口具名导入继续为默认，补齐 table/formily 可选子路径和同包官方插件的版本检查、旧项目兼容及安装体积边界。

---

## v1.4.4

`2026-09-14`

### ⚠️ Deprecations

- **page-module-development**: 进入 Phase 1 软废弃阶段，正文与元数据增加 `[DEPRECATED]` 警示；将旧版页面模块开发触发用例收编至 `yss-ui-business-page-generation`，消除 Tier 2 词法评测碰撞与冗余重定向开销 (#6)。

---

## v1.4.3

`2026-09-12`

### 💄 Improvements

- **component-selection-imports**: 规范 Monaco / ECharts / Sheet 等重型依赖按需消费方式，支持从官方子路径或主入口异步导入，杜绝未使用的重型模块及其 CSS 被打包到业务页面中。

---

## v1.4.2

`2026-09-12`

### 💄 Improvements

- **component-selection-imports**: 强化样式敏感工程与微前端子应用的组件导入指引，明确推荐优先使用 `@yss-ui/components/lite` 纯净入口并按需显式导入样式，防止全局样式副作用污染。
- **yedit-table-usage**: 补充大表性能约束与反模式防护（强制固定行高、严禁每格嵌入 Formily 表单、横纵双向虚拟滚动合理阈值与分页优先）。
- **yss-formily**: 补充长列表与大表性能反模式警示，严禁在海量表格行中循环嵌套实例化 Formily 表单，明确推荐抽屉编辑或 YEditTable 内置轻量组件体系。

---

## v1.4.1

`2026-09-11`

### ✨ Features

- **ysheet-usage**: 新增 YSheet 协同表格 Skill，固化 optionalDependencies、主入口异步组件与 `@yss-ui/components/sheet` Preset 子路径，避免 AI 从 `@univerjs/*` 幻觉导入或漏配 `extraPresets`/`extraLocales`。
- **ycondition-builder-usage**: 新增 YConditionBuilder 条件树 Skill，规范 `ConditionGroup`、`loadFields`/`loadValues`、操作符 `kind`、`strictMode` 与 `disabled`，明确 `readonly`/`segments`/`getValue('legacy')` 不可用。
- **yfile-import-usage**: 新增 YFileImport 两步导入弹窗 Skill，强调 `nextStep.onSuccess`、`importResult.successkey/failkey`、`loadings` 字符串标识，并与导出下载 Skill 分流。
- **use-url-state**: 新增 `useUrlState` Skill，规范当前路由 URL query 的 history 无感更新、`setState` 删 key 语义和 `router`/`push` 选择。
- **use-polling-task**: 新增 `usePollingTask` Skill，规范静默轮询调度、`isCurrent` 失效保护、`pauseWhenHidden` 与页面 loading 解耦。

### 🔧 Build

- **Skills Metadata**: 官方 Skill 数量更新为 39；为上述 5 个 Skill 补充 trigger eval 正例与相邻 near-miss。

---

## v1.4.0

`2026-09-05`

### ✨ Features

- **i18n-locale-management**: 统一语言事务、请求头内存状态、门户修订号、独立模式与清理规范；补充编辑状态保持、日期/数字语义和引擎能力边界，修正规范与完整三语目标的冲突。

- **ytable-usage**: 新增表格国际化多语言工厂函数规范（`createColumns(t)`、`createActionConfig(handlers, t)`），强化分页总数提示 `showTotal` 国际化模板绑定与工具栏按钮多语言词条约束，杜绝硬编码中文；补充操作列列宽多语言智能自适应与安全下限纠偏规范说明。
- **page-list-module**: 强化列表模块全链路多语言规范，规定查询/重置按钮、列名、操作列、工具栏按钮及分页器均需通过多语言词条绑定。
- **yss-formily & formily-foundation**: 新增 Formily Schema 国际化工厂函数范式（`createSearchSchema(t)` / `createFormSchema(t)`），禁止导出包含硬编码中文的静态 Schema 常量，规范字段标题、占位符、枚举字典与校验规则文案的动态多语言响应。
- **page-form-module**: 规范弹窗/抽屉表单标题、确认/取消按钮以及表单 Schema 的多语言工厂函数驱动模式。
- **yss-ui-business-page-generation**: 总入口 Skill 增加国际化项目全链路工厂规范，统一自动判定国际化项目并强制生成无中文硬编码的业务页面与交付检查清单。
- **i18n-locale-management**: 优化微应用路由标题多语言渐进式非强制规范，澄清普通/隐藏路由与多语言标题映射边界。

---

## v1.3.9

`2026-09-01`

### ✨ Features

- **i18n-locale-management**: 新增国际化多语言字典设计与维护规范 Skill，规范业务模块独立目录拆分、中英镜像对齐、三级语义命名分层（columns/modal/actions/messages 等）、Vite 零配置自动化扫描装配与通用词条复用。
- **component-testing**: 新增组件库测试维护 Skill，规范公开契约、受控状态、事件载荷、浏览器 API mock、异步等待和卸载清理的 Vitest / Vue Test Utils 测试方式。
- **skill-development**: 新增 YSS 官方 Skill 开发维护 Skill，固化唯一源码、分类配置、trigger eval、派生文档、安全扫描和目标版本 changelog 链路。

### 🔧 Build

- **Trigger Evals**: 为两个维护者 Skill 增加真实正例和相邻 near-miss，用词法路由门禁验证测试任务、Skill 源码维护与普通组件开发/Skill 使用之间的边界。
- **Skills Metadata**: 当前官方 Skill 数量更新为 33，易漂移的说明文档改用 `30+` 或动态范围表述。

---

## v1.3.8

`2026-08-27`

### ✨ Features

- **sync-internal-dev 技能规范**: 新增内网 `dev` 代码一键同步至 GitHub `main` 分支的官方维护类技能规范与评测用例，规范独立临时分支隔离、配置防污染、内网脱敏与 GitHub Actions 自动发包流程。
- **生态命名大一统**: 包名正式升级为 `@yss-ui/skills` 与 `@yss-ui/skills-cli`，并完善 NPM 官方发布说明与企业私服配置支持。

### 📝 Documentation

- **文档与 README**: 为 `@yss-ui/skills` 与 `@yss-ui/skills-cli` 补齐详细的使用指引、参数列表与跨 IDE 目录映射说明。

---

## v1.3.7

`2026-08-19`

### ✨ Features

- **Skills 标准目录**: 项目级单一事实源调整为 `.agents/skills`，对齐 Codex / Agent Skills 自动发现约定；YSS UI 源码仓的主目录直接链接 `packages/skills` 并同步全部维护技能，`.agent/skills`、Cursor、Claude 与 Trae 目录则作为按 Skill 粒度的兼容入口，保留各目录已有的第三方 Skills。

### 🐛 Bug Fixes

- **Skills CLI / 重复发现**: 用户级 Codex 同步统一使用 `~/.agents/skills`；升级时仅根据 YSS 同步清单清理旧 `~/.codex/skills` 中的托管项，避免同名 Skill 重复出现且不影响其他用户 Skill。
- **Skills CLI / 规则路径**: `.cursorrules` 与 `.agents/rules/yss-ai-skills.md` 改为从 `primaryTarget` 生成 Skill 路径，移除写死的 `.agent/skills`。

### 🔧 Build

- **Skills Sync Tests**: 增加 `.agents/skills` 主目录、旧整目录链接兼容、第三方 Skill 保留、废弃用户目录定向清理与规则路径生成测试，并在 `validate:skills` 中固化目录架构约束。
- **Skills Source Cleanup**: 移除仓库中已跟踪的 `.agent/skills` YSS 派生副本，保留非 YSS 第三方 Skill；组件库本地入口统一由链接解析到 `packages/skills`。

---

## v1.3.6

`2026-08-19`

### ✨ Features

- **Skills CLI / 多 IDE 同步**: 新增用户级 Codex、Cursor、Claude、Trae 与通用 Agents 目录同步；源码仓库使用 `pnpm sync:skills:ides` 后按 Skill 粒度链接到 `packages/skills` 单一事实源，持续读取当前最新内容，同时保留各目录中的第三方 Skills。

### 🐛 Bug Fixes

- **Formily Foundation / Page Form Module**: 对齐 YFormily 校验反馈归一化能力，明确自定义长度、格式和跨字段校验不得重复承担必填职责；空值交由 `required` 统一处理，非空值仅展示当前实际失败的校验消息。
- **Skills CLI / Source Resolution**: yss-ui 源码仓库的 `pnpm sync:skills` 固定使用当前 `packages/skills`，避免优先下载尚未发版的旧包并覆盖本地最新 Skill；同步清单自动清理已废弃的 `microapp-commit`。

### 📝 Documentation

- **Formily Foundation / Page Form Module**: 补充内置 FormItem 适配层的运行时兜底说明，覆盖空消息过滤、重复消息去重与残留必填提示清理，同时强调适配层不能替代正确的 Schema 校验职责拆分。
- **Page Skeleton**: 统一标准页面示例的 Less 样式导入写法与颜色函数格式，保持生成代码符合当前样式检查规范。
- **Release Workflow / Changelog Generation / Commit Linting**: 明确首页 `highlight` 属于长期产品总体介绍，常规发版只能更新版本号和日期，禁止将其替换为当次变更摘要。

### 🔧 Build

- **Homepage Release Guard**: 将首页产品定位抽离为独立契约，增加受保护快照测试并接入 pre-commit 与文档构建校验，误改 `highlight` 时直接阻止提交和 CI。
- **Skills Sync Tests**: 覆盖多 IDE 同步保留第三方 Skills、清理废弃 YSS Skills、项目目录按项链接及 monorepo 本地源优先级。
- **Test Runner**: Vitest 排除由 Node.js 原生 test runner 执行的脚本，避免全量测试将已通过的 `node:test` 文件误判为无测试套件。

---

## v1.3.5

`2026-08-18`

### 🐛 Bug Fixes

- **Page Form Module / YSS Formily**: 固化弹窗与抽屉表单的数据前置同步原则，要求在 `openCreate` / `openEdit` 中同步设置 `formModel`，禁止通过 `watch(visible)` 滞后回填，避免多次新增/编辑切换后的空白回显和脏状态残留。
- **Formily Foundation / Page Form Module**: 必填文本校验增加 `whitespace: true`，长度与格式规则改为非空时才执行的函数式校验，修复纯空格可绕过必填以及空值多条错误拼接的问题。

### 📝 Documentation

- **Page Form Module**: 标准骨架改为 `v-model="formModel"` 单一数据源，补充 `destroy-on-close` + `v-if` 生命周期隔离，并移除依赖动态 `:key` 强制重建表单的示例。
- **Formily Foundation**: 补充含空白字符、长度区间与 `allowClear` 的文本字段校验示例。

---

## v1.3.4

`2026-08-17`

### ✨ Features

- **YTable Usage**: 规范「表格多选与批量操作标准模式」，明确 Checkbox 列配置、行主键 `row-config.keyField` 声明、受控双向绑定、批量按钮置灰与清空选中态的标准写法。
- **Page List Module / Business Page Generation**: 简化工具栏使用规则，主操作直接放入 `#toolbar-right` 插槽即可自动渲染工具栏，无需冗余配置 `:toolbar-config="{ custom: true }"`（避免无端展示列设置齿轮图标）。

---

## v1.3.3

`2026-08-17`

### 📝 Documentation

- **Changelog Generation**: 补充 `@yss/mcp` 派生发版与索引同步规范，明确文档/Demo 驱动发版时 changelog 由发版脚本自动补全。
- **Commit Linting**: scope 表与发版检测规则补充 `@yss/mcp` 派生索引输入源（`docs/components/**`、`docs/hooks/**`、`docs/utils/**`、`.cursorrules`、`.dumirc.ts`）。

---

## v1.3.2

`2026-08-14`

### ✨ Features

- **MCP 优先文档检索**: 统一 16 个业务消费类 Skill 的组件文档检索链路，优先使用 `get_codegen_rules`、`list_components`、`get_component_docs`、`get_demo` 和 `search_docs` 精确查询；仅在 MCP 不可用、调用失败或校正后仍无结果时回退 `llms-full.txt`。
- **检索失败与版本兜底**: 明确 MCP 未命中时先校正组件名称和文档归属；文档与项目依赖版本不一致时，通过当前源码、CodeGraph 和真实导出交叉核验，禁止猜测 API。
- **Utils 文档路由**: 文件下载 Skill 改用 `search_docs` 定位 `handleBlobResponse` 与 `downloadBlob`，避免将工具函数错误地按组件别名查询。

### 📝 Documentation

- **Skills / LLM Artifacts**: 同步更新业务页面、表格、树、Formily、API、文件下载和高度 Hook 的 Skill 文档，并重新生成 `llms-full.txt`。

---

## v1.3.1

`2026-08-13`

### ✨ Features

- **Evals 触发评测门禁**: 新增全部 30 个 skill 的触发路由评测用例与安全扫描（`packages/skills/evals/`），并入 `pnpm validate:skills` 执行，守住 description 触发面不回归。

### 🐛 Bug Fixes

- **触发词汇修复**: `page-form-module` 补充「数据回显/表单被清空」、`formily-mode-slot-detail` 补充「查看态只读/详情页展示」、`ytree-usage` 补充「字段映射」、`frontend-commit` 补充「项目」——修复"Vue 项目的改动提交"等话术被错误路由到 `java-backend-commit` 的问题。

### 📝 Documentation

- **Commit Linting**: scope 与 changelog 映射表补充 `packages/mcp/**` → `mcp`。

---

## v1.3.0

`2026-08-12`

### ✨ Features

- **Frontend Commit**: 新增前端规范提交 Skill，覆盖仓库规则优先级、原子提交拆分、业务 scope 选择、commitlint stdin 校验、密钥拦截与安全提交流程，附带 Type/Scope 参考与 agents 元数据。
- **Java Backend Commit**: 新增 Java 后端规范提交 Skill，覆盖 Maven/Gradle 模块 scope、跨层原子提交、Flyway/Liquibase 迁移风险检查、wrapper 验证与安全提交流程。

### 💥 Breaking Changes

- **Microapp Commit**: 移除 `microapp-commit`，由 `frontend-commit` 接替；旧的目录名 scope（`views`/`hooks` 等）不再推荐，改为业务模块 scope。已同步过的业务仓库重新执行 `pnpm sync:skills` 后清单自动更新，残留的 `microapp-commit` 目录可手动删除。

### 📝 Documentation

- **Commit Linting / Changelog Generation**: 「不适用场景」路由由 `microapp-commit` 更新为 `frontend-commit` 与 `java-backend-commit`。
- **Skills Navigation**: Dumi 侧边栏与 Skills 索引补充两个新 Skill 入口，并在命名迁移说明中记录 `microapp-commit` 的替换关系。

---

## v1.2.6

`2026-08-10`

### 📝 Documentation

- **YSS Formily / Formily Foundation / Linkage Effects / Mode Slot Detail / Step Flow / Page Form Module**: 推荐导入与示例统一改为 `YFormily`；`YssFormily` 仅保留兼容说明，不再作为新代码主路径。
- **Formily Step Flow**: 固化分步表单推荐方案为 Ant Design Vue `Steps` + 多 `YFormily`；禁止推荐代码直接导入 `@formily/antdv FormStep`。
- **Formily Mode Slot Detail**: 移除已删除的 `detail-as` 推荐写法，明确查看态 `mode=2` 直接进入 Descriptions。
- **YTable Usage / YTree Usage / Business Page Generation / Component Selection Imports / Theme Token Usage / Page List / Page Skeleton**: 对齐当前公开组件契约与具名导出，修正过期 Props、Slots 与组件映射说明。
- **LLM Artifacts**: `llms.txt` / `llms-full.txt` 纳入 Skills 索引与全文，生成链路与 `validate:docs` 新鲜度校验打通。

### 🔧 Build

- **Docs Validation**: `validate:skills` 叠加组件契约校验（具名导入、自有 Props/Events/Slots/Expose、禁用模式）；`prebuild` 接入 `validate:docs`，防止文档/Skill 再次漂移。
- **Skills Package**: 版本升级为 `@yss/skills@1.2.6`，确保终端同步到本轮契约对齐后的 Skill 内容。

---

## v1.2.5

`2026-07-31`

### 🐞 Bug Fixes

- **API Integration / Page Modules**: 对齐当前 Orval 工厂导出与 mutator 响应契约，移除 `if (res?.success)` 和业务 `else/catch` 中重复的错误 Toast，并补充 HTTP 200 Blob 业务错误边界。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **YTable / YEditTable / YTree**: 修正 `refresh()`、`addable`、`disabled`、可创建下拉与树节点操作的过期示例，删除不存在的 YTree 确认字段。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **YssFormily**: 删除 `show-button-group`、`detail-as` 和虚构实例方法，修正 `submit()` reject、YMonaco Props、分步数据聚合及 `onFormSubmitFailed` 重复提示问题。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **YSS Create Microapp**: 将生成脚本改为可稳定直接执行的 `create.mjs`，移除 shell 参数拼接，增加参数、目标目录、临时缓存和 Git remote 安全校验。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)

### 📝 Documentation

- **All Skills**: 完成 29 个 Skill 的 frontmatter、触发边界、失败兜底、真实 API 与跨 Skill 规则一致性审计，统一小写短横线 `name` 及六段标准结构。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **Skills Navigation**: 补齐微应用创建、主题 Token、YEditTable、原型验收与文件导出的 Dumi 侧边栏入口。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)

### 🔧 Build

- **Skills Validation**: 新增 frontmatter/目录同名、必填章节、分类、Markdown 断链、mutator 错误处理契约、agents 元数据、Dumi 导航和 `docs/skills` 精确同步校验。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **Skills Package**: 版本升级为 `@yss/skills@1.2.5`，避免内容已修正但发布版本未变导致终端继续获取旧 Skill。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)
- **Skills CLI**: 版本升级为 `@yss/skills-cli@1.0.8`；正式读取 `defaultSync` 分类，并同步最新 YTable、YssFormily、Orval 错误处理与 API 导出常驻规则。 [`15eea31`](https://github.com/yss-ui/yss-ui/commit/15eea31b85d59f80e0d124b1f0f563b8616284fa)

---

## v1.2.4
`2026-07-30`

### ✨ Features

- **File Export Download**: 新增文件导出下载 Skill，覆盖 Blob 导出、`responseType` 兜底与 `handleBlobResponse`。
- **Theme Token Usage**: 新增主题 Token 使用 Skill，规范主色/交互态/换肤与禁止硬编码色值。

### 📝 Documentation

- **API Integration / Business Page Generation / Component Development**: 路由导出与主题场景至上述新 Skill，并补充相关硬约束。

### 🔧 Build

- **Skills CLI**: `theme-token-usage`、`file-export-download` 纳入同步配置。

---

## v1.2.3
`2026-07-28`

### 📝 Documentation

- **API Integration**: 补充响应与错误处理硬约束——禁止在 `else`/`catch` 中重复 `message.error`，禁止 `if (res?.success)` 冗余嵌套；新增「自定义请求配置」章节，说明 Orval 第二参数 `options` 及 `skipBusinessError` / `skipErrorHandler` / `responseType` / `signal` 等常见场景。 [`66bba26`](https://github.com/yss-ui/yss-ui/commit/66bba263ae937ae3e187aaac9fe69901972e5894)
- **Page List Module**: 同步强化接口响应处理约束，明确直接使用 `res?.data ?? []` / `res?.data ?? {}` 做数据兜底，避免重复错误提示。 [`66bba26`](https://github.com/yss-ui/yss-ui/commit/66bba263ae937ae3e187aaac9fe69901972e5894)

---

## v1.2.2
`2026-07-07`

### 📝 Documentation

- **Page Form Module**: 补充并强化「表单放在 `a-modal` / `a-drawer` 等初始隐藏容器」场景的硬约束：`YssFormily` 必须通过 `v-if` 条件渲染，确保弹层完全展开后再挂载以拿到真实容器宽度，避免 `FormGrid` 首次测量宽度为 0 导致布局退化；关闭时销毁表单以回收状态，防止脏数据/错误提示残留闪现。 [`03fb246`](https://github.com/yss-ui/yss-ui/commit/03fb246)

---

## v1.2.1
`2026-07-06`

### ✨ Features

- **YSS Create Microapp**: 新增 `yss-create-microapp` 专项 Skill，支持在本地一键生成基于 Vue 3 + TypeScript + qiankun 的微前端子应用项目骨架。AI 会主动收集应用英文名、中文名、激活路由前缀等配置，并通过内置 `create.js` 脚本完成项目初始化。

### 📝 Documentation

- **API Integration**: 补充「标准代码骨架」章节，推荐将 API 请求与加载状态封装在 Composable hook 中，提供 `useUserDetail` 参考示例。
- **Skills Index**: 索引页新增 `YSS Create Microapp` 入口说明。

### 🔧 Build

- **Skills CLI**: `skills.config.json` 将 `yss-create-microapp` 纳入 `library` 分类与 `validSkills` 列表，支持 `sync:skills` 同步至 `.agent/skills`、`.cursor/skills` 等目标目录。

---

## v1.1.13
`2026-06-30`

### 📝 Documentation

- **YEdit Table Usage**: 新增「表头列筛选（与 YTable 对齐）」专项规范，明确表头筛选（`filterable`）与编辑态下拉候选过滤（`filterOptions`）是两回事，禁止混用。
  - 优先使用内置渲染器 `filterRender: { name: 'VxeInput', props: {...} }`，不必再手搓 `slots: { filter }` 面板；仅当需要高度定制时才用 `#<field>-filter` 插槽。
  - 补充文本/多选筛选示例、`filterMethod` 写法，以及远程筛选监听 `@filter-change`、切换数据后 `getTableInstance().clearFilter()` 清空的要点。

---

## v1.1.12
`2026-06-26`

### 📝 Documentation

- **API Integration**: 新增「大数字与精度（json-bigint）」专项规范，明确接口返回的 `number` 字段（id/主键/金额/数量等）一律按字符串透传，禁止 `Number()`/`parseInt`/`parseFloat`/`+x`/`*1`/`~~` 等任何数字转换；补充禁止/推荐写法、类型断言兜底与高精度计算指引；更新 `description` 以提升 AI 匹配率。
- **Page List / Form / Vue3 Best Practices**: 在 `page-list-module`、`page-form-module`、`vue3-best-practices` 硬约束与交付检查清单中交叉引用上述规则，覆盖列表行操作、表单回填/提交、hook 业务逻辑等易漏场景。
- **Page Skeleton**: 修复 `StandardListPage` 示例中 `useRuleActions` 对 `row.id` 使用 `Number()` 的反例写法。
- **Project Rules**: `.cursorrules` 新增常驻 reminder，提醒接口 number 字段禁止数字转换。

---

## v1.1.11
`2026-05-21`

### 📝 Documentation

- **API Integration**: 深度优化 Orval API 接入规范：
  - **具名导入约束**：明确规范要求在业务层按需使用扁平化的具名 API 请求函数进行导入，禁止在 Hook 内部调用 `getApi()` 再进行解构，规避高频组装闭包带来的运行时内存及性能开销。
  - **更新标准骨架**：使用扁平化具名 API 与全新的 Schemas 规范，重构了推荐的业务 Composable 示例，提升了类型安全性。
  - **完善检查清单**：新增具名 API 导入与 `getApi()` 禁用相关的交付验收校验项。

---

## v1.1.10
`2026-05-13`

### 📝 Documentation

- **Page Module & Formily Skills**: 统一与规范了业务页面中“列表查询区”的布局与组件嵌套标准：
  - 更新 `yss-formily`、`formily-foundation`、`page-list-module`、`prototype-page-acceptance` 及 `yss-ui-business-page-generation` 等相关 Skill。
  - **查询区布局规范**：废弃在 schema 内部通过 `AutoButtonGroup` 定义查询/重置按钮的方式。改为标准纵向布局：将 `YssFormily` 搜索表单区与原生的 `YButton` 按钮操作区分离，按钮行统一下置并右对齐。
  - **响应式适配优化**：明确要求查询区配置 `FormGrid { maxColumns: 3 或 4, minColumns: 1, minWidth: 260~360 }`，确保缩放或窄屏下字段换行后，操作按钮仍稳定居于搜索卡片右下角，避免因 flex 布局硬写 gap/padding 导致的不对齐与错位问题。

---

## v1.1.9
`2026-04-30`

### ✨ Features

- **New Skills**: 新增 `prototype-page-acceptance`（原型页面验收）与 `yedit-table-usage`（可编辑表格使用规范）专项 Skill，进一步完善前端页面验收与复杂表格的 AI 生成能力。
- **Skills CLI**: 优化 `sync:skills` 同步脚本，提升文档同步与元数据处理的稳定性。

---

## v1.1.8
`2026-04-30`

### 📝 Documentation

- **YTree Usage & Height Hook**: 协同完善了 `use-tree-height` 与 `ytree-usage` 的内容规范：
  - 明确 `YTree` 的标准高度写法为 `:height="treeHeight"`，不再建议默认强制追加 `:virtual="true"`。
  - 补充虚拟滚动行为说明：仅在展开后的可见扁平节点总高度超过容器高度时（`itemCount * itemHeight > height`）才会触发 DOM 裁剪，节点较少时不裁剪属于正常行为。
  - 新增故障排查步骤：针对“设置了 height 但未裁剪”的情况，优先确认展开后的节点数量是否足够，针对旧版本组件库提供了临时补充 `:virtual="true"` 的排障验证手段。

---

## v1.1.7
`2026-04-30`

### ✨ Features

- **Business Page Generation**: 新增 `yss-ui-business-page-generation` Skill，作为 Vue3 YSS UI 业务页面开发的主干架构入口，统合组件、Hooks 和 Utils 的标准复用。
- **YTable / YTree Usage**: 新增 `ytable-usage` 与 `ytree-usage` 细分组件级 Skill，提供详尽的 API 标准、分页与树表关联配置指南。
- **YssFormily**: 重新整合 `yss-formily` 作为表单开发入口 Skill，统筹管理 Schema 编写、模式控制以及相关分步表单场景。
- **Page Module Development**: 恢复 `page-module-development` 入口，用作旧版模块生成的兼容并自动路由至新版工作流。

### 📝 Documentation

- **Config**: 同步更新 `skills.config.json` 将新增细粒度模块注册至应用级 (app) 类别。
- **Hooks & List Module**: 协同完善了 `use-table-height`、`use-tree-height` 及 `page-list-module` 的内容表述和引用规范。

---

## v1.1.5
`2026-04-02`

### ✨ Features

- **Skill 架构重构**: 持续践行「分层解耦与职责单一」原则，将包含多场景的宏大技能拆分为多个明确的重构技能，从而提升 AI 代码生成和上下文理解的准确率：
  - **页面开发系列 (`Page Module`)**: 废弃原本的 `page-module-development`，拆分为 `component-selection-imports` (组件选取与引入说明)、`page-skeleton` (模块基础骨架)、`page-list-module` (表格搜索列表模块) 和 `page-form-module` (表单录入模块)。
  - **表单系列 (`YFormily`)**: 废弃 `yss-formily` 及过往关联分支，重组为细粒度的 `formily-foundation` (表单基础与 Schema)、`formily-linkage-effects` (联动与反应机制)、`formily-mode-detail` (模式渲染与排版插槽)、`formily-step-flow` (面向步骤分发流程表单)。
- **Scripts**: 新增 `validate:skills` npm script，以便对 Skills 定义规范实现前置验证。
- **Scripts**: 新增 `sync:skills` 原生命令入口，规范本地构建和协同触发链路。

### 📝 Documentation

- 同步相关 `examples` 以及多组件的配置依赖至全新的细分技能中进行重新归档。

---

## v1.1.4
`2026-03-20`

### ✨ Features

- **yss-formily**: 拆分并增强 YFormily 专项技能，提升针对复杂业务表单的代码生成质量：
    - `yss-formily-linkage-effects`: 新增联动逻辑专项，包含表达式显隐、`x-reactions`、`scope` 事件及 `effects` 统一处理规范。
    - `yss-formily-mode-slot-detail`: 新增模式与插槽专项，规范 `mode` 语义、插槽命名法则及 查看态/编辑态 的渲染差异。
    - `yss-formily (Core)`: 重构基础技能，强化导入源约束、Schema 三层结构标准及 `Submit` 提交逻辑。
- **sync-skills-docs**: 优化同步机制，支持从 `SKILL.md` 的 YAML header 中提取 `description` 并自动注入文档顶部，提升 Dumi 文档页的信息丰富度。

---

## v1.1.2

`2026-03-03`

### 📝 Documentation

- **Commit Linting**: 优化 Skill description，添加触发条件和中文关键词示例，提升 AI 自动识别率
- **Changelog Generation**: 优化 Skill description，添加触发条件和中文关键词示例
- **Component Development**: 优化 Skill description，添加触发条件和中文关键词示例
- **Documentation**: 优化 Skill description，添加触发条件和中文关键词示例
- **Release Management**: 优化 Skill description，添加触发条件和中文关键词示例
- **Release Workflow**: 优化 Skill description，添加触发条件和中文关键词示例
- **Microapp Commit**: 优化 Skill description，明确与 Commit Linting 的职责区分

---

## v1.2.0

`2026-02-27`

### ✨ Features

- **yss-formily**: 新增 YFormily 表单开发 Skill，涵盖 Schema 结构规范、动态表单渲染、事件联动机制及查看模式选项配置指南

---

## v1.0.13

`2026-02-06`

### ✨ Features

- **skills-cli**: 新增多 IDE 符号链接支持，运行 `sync:skills` 后自动创建 `.trae/skills` 和 `.cursor/skills` 符号链接，指向 `.agent/skills`
- **skills.config.json**: 新增 `primaryTarget` 和 `symbolicLinks` 配置项，支持配置多 IDE 目标目录
- **yss-skills.js**: 新增 `--no-links` 选项，可跳过符号链接创建
- **use-table-height**: 新增表格高度计算 Hook 专属 Skill，解决 AI 生成代码时解构语法和 `withPagination` 配置遗漏问题
- **use-tree-height**: 新增树组件高度计算 Hook 专属 Skill，包含 `YTREE_SEARCH_HEIGHT` 常量使用规范

### 📝 Documentation

- 符号链接支持跨平台：macOS/Linux 使用符号链接，Windows 自动降级为硬拷贝
- 采用「分层 Skill 架构」，为高频 Hooks 创建独立 Skill，提升业务层 AI 代码生成准确率
- 更新 `skills.config.json`，新增 `hooks` 分类

---

## v1.0.12

`2026-02-04`

### 📝 Documentation

- **Commit Linting**: 新增"验证 Changelog 完整性"检查表，强制逐个 Scope 核对 changelog 条目
- **Changelog Generation**: 补充 `docs/changelog/skills.md` 维护步骤说明


---

## v1.0.11

`2026-02-04`

### 📝 Documentation

- **Commit Linting**: 强化前置 Changelog 检查的强制性措辞，使用 CRITICAL 警告框，明确路径与 changelog 文件的映射关系
- **Microapp Commit**: 更新 Skill，强化中文提交信息要求和详细描述格式

---

## v1.0.10

`2026-02-04`

### ✨ Features

- **Commit Linting**: 新增前置 Changelog 检查步骤，feat/fix 类型变更需确认 changelog 已更新后再生成提交信息

---

## v1.0.9

`2026-02-03`

### ✨ Features

- **Release Workflow**: 新增发版工作流 Skill，整合 changelog-generation 和 commit-linting 流程，定义完整的发版工作流

---

## v1.0.8

`2026-02-03`

### ✨ Features

- **Microapp Commit**: 新增微应用项目提交信息生成 Skill，支持多模块 scope 推断和 Conventional Commits 格式

---

## v1.0.7

`2026-01-30`

### ✨ Features

- **Page Module Development**: 更新 Skill，禁止导入 `@formily/antd*` 等 UI 适配包，强制使用 `YFormily`

---

## v1.0.6

`2026-01-29`

### 📝 Documentation

- **Component Development**: 更新组件开发规范，新增 API 文档同步检查项

---

## v1.0.5

`2026-01-28`

### ✨ Features

- **Changelog Generation**: 新增 commit link 回填验证步骤

---

## v1.0.4

`2026-01-27`

### 🐛 Bug Fixes

- **Page Module Development**: 修复 StandardListPage 示例中布局样式遗漏问题

---

## v1.0.3

`2026-01-26`

### ✨ Features

- **Documentation**: 新增文档编写 Skill，支持组件/Hooks/工具函数文档生成

---

## v1.0.2

`2026-01-25`

### ✨ Features

- **Release Management**: 新增发版管理 Skill

---

## v1.0.1

`2026-01-24`

### 🐛 Bug Fixes

- **Commit Linting**: 修复多文件变更时 scope 推断错误

---

## v1.0.0

`2026-01-23`

### 🎉 Initial Release

- **API Integration**: Orval 生成的 API 客户端使用指南
- **Changelog Generation**: 基于 git 提交记录生成 CHANGELOG
- **Commit Linting**: Conventional Commits 规范提交信息生成
- **Component Development**: Vue 3 组件开发规范
- **Page Module Development**: 业务页面模块开发规范
