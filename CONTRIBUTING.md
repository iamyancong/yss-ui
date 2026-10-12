## YSS-UI 贡献指南

本项目使用 Vue 3 + TypeScript + Vite，基于 vxe-table 4.19+ 封装。请在提交任何代码前先阅读并遵循以下规范。

### 架构与目录规范

- **组件拆分标准**：
  - **轻量组件（≤ 150 行）**：如 `YButton`、`YCard` 等单一视图或轻度封装组件，允许仅保持 `index.vue + types.ts`，避免过度拆分。
  - **复杂组件（> 150 行）**：如 `YTable`、`YEditTable`、`YConditionBuilder` 等包含多状态或复杂业务交互的组件，必须严格按以下标准结构组织：
    ```
    ComponentName/
    ├── index.vue          # 主组件（仅负责组合 logic 与视图渲染，≤ 150 行）
    ├── constant.ts        # 常量、静态配置、纯函数
    ├── types.ts           # TypeScript 类型定义与接口
    ├── style.less         # 独立样式文件（不在 index.vue 中堆砌样式）
    └── hooks/             # 业务逻辑 Composables
        ├── useDataFetch.ts
        └── useXTableProps.ts
    ```
- **类型文件命名**：
  - 全库类型文件统一命名为 `types.ts`（禁止使用单数 `type.ts`；历史保留的 `type.ts` 仅用于向前兼容转发 `export * from './types'`）。
- **文档与示例**：
  - 文档位于 `docs/components/`，新增或修改组件 API 时必须同步更新 API 表与示例 demos。
  - 页面命名及 demo 目录一律遵循 kebab-case 规范。

### TypeScript 与注释

- **TypeScript 严格类型**：必须显式标注导出与公开 API 类型，禁止 `any` 滥用。
- **JSDoc 注释**：所有导出的方法、类、接口、Props 必须使用 JSDoc 格式 `/** ... */`（优先使用中文说明），禁止仅用 `//` 作为公开 API 注释。
- **语义化命名**：函数使用动词短语、变量使用名词短语，避免晦涩缩写。

### vxe-table 4.19+ 规范

- **Props 透传与虚拟滚动**：
  - 统一通过 `useXTableProps` / `useTableProps` 规范聚合。
  - 虚拟滚动全面采用 `virtualXConfig`（默认 `{ enabled: true, gt: 50 }`）与 `virtualYConfig`（默认 `{ enabled: true, gt: 100/200 }`），废弃旧版 `scrollX`/`scrollY`（保留兼容解析）。
  - 行高配置使用 `cellConfig.height`（代替废弃的 `rowConfig.height`）。
  - 开启行拖拽时必须设置 `row-config.drag: true`。
- **事件机制**：对齐 vxe-table 4.19+ 标准事件，如 `edit-closed`、`row-dragend` 等。
- **Tooltip 提示**：Tooltip 统一通过 `tooltipConfig.contentMethod` 纯文本清洗，避免 DOM 注入异常。

### 主题与微前端隔离

- **Token 优先**：严禁硬编码色值，必须使用 `@yss-ui/theme` 提供的动态 CSS 变量或 Ant Design Token。
- **弹层挂载**：弹层/下拉统一配置 `getPopupContainer: () => document.body`，避免微前端子容器裁剪。
- **样式按需隔离**：样式敏感项目或微前端子应用，推荐从 `@yss-ui/components/lite` 导入并显式引入 `@yss-ui/components/style.css`，避免全局样式污染。

### AI Skills 与发版门禁

- **Skills 单一事实源**：`packages/skills/*` 是唯一源码。修改 Skills 必须执行：
  ```bash
  pnpm sync:skills-docs
  pnpm validate:skills
  ```
- **发版前门禁检查**：
  ```bash
  node scripts/release-changed.js patch --dry
  ```
- **API 契约快照门禁 (API Snapshot Gate)**：
  - 仓库使用 `api-snapshot/` 维护所有导出组件的 Props/Emits/Slots/Exposed 及 Hooks 类型签名基准快照。CI 和本地 quality 门禁均会运行 `pnpm check:api-snapshot` 严格校验。
  - **有意改动 API 时**：运行 `pnpm check:api-snapshot -- --update` 重新生成快照，和代码一起提交，并在 PR 里详细说明变更原因与兼容性影响。
- **敏感行为文件与行为变更升级说明**：
  - 核心逻辑文件（如 `actionRetry.ts`、`useSafeData.ts`、`ActionColumn.vue` 等）已纳入 `scripts/release-behavior-allowlist.json` 监控。
  - 修改敏感行为文件时必须补充对应行为契约测试。
  - 若修改引入行为调整或非向前兼容改动，发版检测会强制要求升级至 `minor`（或通过 `--override-reason` 显式确认），且必须在 `docs/changelog/*.md` 中补齐 `### ⚠️ 行为变化与升级说明` 小节。
- **后续项跟踪规范 (Follow-up Tracking)**：
  - 当一个 Issue 的解决方案因复杂度、改动边界或外部依赖被拆分或延期到后续 Issue 时，严禁隐式遗漏。
  - 必须立即创建独立 GitHub Issue 跟踪，并在测试用例或源码中标记 `TODO (#IssueId)` / `it.todo('...')` 建立双向链路（如 `#38`、`#39`）。
- **镜像自动同步**：CI 发版成功后会自动按本批次实际发布的包列表向 npmmirror 触发主动同步（`scripts/sync-npmmirror.mjs`），缩短国内消费空窗；本地发版后可运行 `pnpm sync:npmmirror` 手动触发。
- **提交规范**：
  - 遵循 Conventional Commits，格式：`<type>(<scope>): <subject>`。
  - Scope 必须为合规枚举值（如 `components`, `hooks`, `utils`, `theme`, `docs`, `skills`, `release` 等）。
  - 多 Issue 迭代时，遵循 **一 Issue 一原子 Commit** 原则。
