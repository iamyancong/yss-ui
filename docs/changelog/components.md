---
title: 组件库更新日志
nav:
  title: 更新日志
  path: /changelog/components
toc: content
---

# 📦 组件库更新日志

YSS UI 组件库（`@yss-ui/components`）的版本更新记录。

## v1.7.1

`2026-09-16`

### 🐛 Bug Fixes

- **AuthorityDropdown 稳定入口**：移除稳定入口误带的 Formily、Monaco、ECharts 等无关 JavaScript/CSS 副作用，避免官方 Vite 按需消费加载无关资源。

### 🧪 Test & Quality

- **消费契约**：明确官方插件已验证的 Vite 范围与 package peer 范围，并在构建阶段校验两者一致。

## v1.7.0

`2026-09-15`

### ✨ Features

- **升级兼容**：保留旧 dist 产物，包级 Vite optional peer 兼容 5.4/6；官方插件拒绝与已知旧入口插件或旧预构建器同时启用。
- **统一入口消费**：新增同包 `@yss-ui/components/vite` 与机器可读消费契约，按真实具名导出生成稳定组件入口，关联组件样式，保留单包安装与历史写法。

---

## v1.6.7

`2026-09-14`

### ⚡ Performance & Optimization

- **Table & Formily Subpaths**: 拆分官方子路径 `@yss-ui/components/table`（导出 `YTable`、`YEditTable` 及专属类型与工具函数）与 `@yss-ui/components/formily`（导出 `YFormily`、`YssFormily` 及表单辅助组件与类型），强化模块化导入与类型边界；主入口与 lite 入口保持 100% 向后兼容 (#21)。
- **Dependencies Cleanup**: 彻底剔除全库 0 引用无用依赖 `sortablejs`；切断 Monaco 编辑器对表格工具库 `xe-utils` 的跨模块隐式依赖；为 `syncVxeLanguage` 增加容错保护，防止动态加载异常阻断全局流程 (#21)。

### 🐛 Bug Fixes

- **Lite Entry**: 补齐 `@yss-ui/components/lite` 遗漏的 `authority/types` 与 `file-import/types` 类型 re-export，解决从 lite 入口引入 `YFileImportProps`、`FileImportTexts`、`ImportResult`、`AuthorityDropdownProps` 时的 TypeScript 编译报错 (#20)。

### 📝 Documentation

- **Quick Start**: 对齐根目录 `README.md` 快速开始指南，补充微前端/样式隔离推荐的 `@yss-ui/components/lite` 纯净模式指引与重型组件官方子路径导航表格 (#20)。

---

## v1.6.6

`2026-09-12`

### ⚡ Performance & Optimization

- **Monaco & ECharts**: 重型依赖解耦与官方子路径化。拆分官方子路径入口 `@yss-ui/components/monaco` 与 `@yss-ui/components/echarts`；主入口/lite 入口与全局安装全面切换为 `defineAsyncComponent` 异步按需加载，Monaco 核心样式改为异步按需动态注入；将 `monaco-editor`、`echarts`、`prettier`、`sql-formatter` 等迁移至 `optionalDependencies`，使轻量微应用在升级组件库后首屏不再被强行绑架打包 6MB~10MB 重型依赖，同时存量项目老代码保持 100% 语法向后兼容 (#13)。

---

## v1.6.5

`2026-09-12`

### ⚡ Performance & Optimization

- **YEditTable**: 对齐 `YEditTable` 与 `YTable` 的虚拟滚动配置 API 与智能默认（`virtualXConfig` 默认 `{ enabled: true, gt: 50 }`，`virtualYConfig` 默认 `{ enabled: true, gt: 100 }`），支持直接 Props 或 `tableConfig` 透传，并保留对废弃 `scrollX`/`scrollY` 的平滑映射，消除宽表横向卡顿隐患 (#17)。
- **Components Entry**: 治理根入口样式副作用，强化微前端与样式敏感工程优先通过 `@yss-ui/components/lite` 消费并在入口按需引入样式的规范引导 (#14)。

### ♻️ Refactor & Types

- **Types Standard**: 统一全库组件类型定义文件为 `types.ts`（规范 `table`、`edit-table`、`echarts`、`monaco`），保留 `type.ts` 作为向前兼容转发，对齐公开导出类型路径 (#5)。

---

## v1.6.4

`2026-09-12`

### 🐞 Bug Fixes

- **YEditTable**: 修复单元格校验错误提示在表格容器滚动时的脱节与位置同步问题，确保在横向与纵向滚动时 tooltip 浮层能够平滑随单元格吸附定位并在超出可视区后正确销毁。

### 🧪 Test & Quality

- **YConditionBuilder**: 模块化收尾治理，规范化测试用例文件名（`debug.test.ts` -> `use-condition-tree.test.ts`），清理调试代码残留；补充组件级校验失败时对应控件标记 `.is-error` 错误状态的自动化回归测试，固化模块化拆分后的子树样式穿透效果。

---
## v1.6.3

`2026-09-11`

### ♻️ Refactor

- **YEditTable**: 主 SFC 从 895 行深度瘦身至 137 行（≤ 150 行）。拆分独立单元格/编辑器/列/分页子组件（`EditTableCell.vue`、`EditCellEditor.vue`、`EditTablePagination.vue`、`EditTableColumn.vue`）与逻辑 Hook（`useEditTableContext`、`useCellFormatter`、`useErrorTooltip`）；抽离独立样式 `style.less` 与 `global.less`，全面消除硬编码颜色，保持所有公开 Props、Events、Slots 及 Expose 100% 向后兼容。
- **YConditionBuilder**: 主 SFC 从 878 行瘦身至 125 行（≤ 150 行）。拆分子组件 `ConditionLeaf.vue`，彻底消除 `vue/no-mutating-props` 隐式属性篡改警告；拆分 `useConditionBuilderValidation`、`useConditionBuilderState`、`useConditionBuilderContext` 状态与校验 Hooks；清理大段注释死代码并实现 Less 样式 Token 收敛。

### 🌐 Locale

- **ConditionBuilder**: 对齐 `zh-CN`、`en-US`、`zh-TW` 三语字典，补齐 `addCondition` 词条。

### 🧪 Test & Quality

- **EditTable & ConditionBuilder Tests**: 为 `YEditTable` 补充单元测试套件（覆盖数据渲染、行内编辑、添加删除行、分页事件与实例公开方法）；优化 `YConditionBuilder` 测试断言；修复初始化顺序与国际化镜像，单测、覆盖率门禁、ESLint 与 Vue-TSC 类型检查全数通过。

---
## v1.6.2

`2026-09-11`

### ♻️ Refactor

- **YssForm / AuthorityButton**: 删除从未进入公开导出面的死代码。`packages/components/src/form/`（`YssForm`）与 `AuthorityButton.vue` 未出现在 `index.ts` / `install.ts`；权限能力继续由 `YButton.permissionCode` 与公开导出的 `AuthorityDropdown` 承接。公开组件 API 不变。

### 🧪 Test & Quality

- **Component Vitest Coverage**: 按使用频率与公开规范全面补齐 8 个无单测核心组件（`YTree`、`YCron`、`YButton`、`YCard`、`AuthorityDropdown`、`YEcharts`、`YMonaco`、`YSheet`）的组件级交互与回归测试；全量覆盖率（Statements / Lines）由 ~33% 跃升至 57.75%，Vitest 覆盖率门禁阈值由 30/60/45/30 稳步上调至 45/62/48/45（Statements/Branches/Functions/Lines），夯实防退化屏障。

---
## v1.6.1

`2026-09-10`

### 🔧 Build

- **Root Entry**: 根入口具名导入直接使用按组件拆分的产物，全量安装独立隔离；无需专用轻量路径或业务插件。保留 lite、sheet、CSS 路径、历史别名及旧内部构建兼容性。
- **Locale**: 新入口复用现有公开语言模块，避免混用入口导致 Provider 注入上下文分裂。
- **Package Consumer**: 增加新入口类型与浏览器构建验证，检查普通表格页面未静态引入 Monaco、ECharts、Univer。

---

## v1.6.0
`2026-09-05`

### 🐞 Bug Fixes

- **Locale**: 拆分语言核心与 VXE 加载，支持完整词条路径、Provider 继承和安全回退；表格按需注册真实英文、繁体词典。
- **YTable / YEditTable**: 操作列支持多语言字符级动态列宽计算与安全下限纠偏（Safety Clamp），解决英文及多语言环境下长单词被生硬裁切截断的问题；老业务写死宽度自动向上兼容撑开，联动自适应直显折叠。
- **YFormily**: 语言切换刷新已有校验错误并保留表单实例及输入。
- **YMonthCalendar / YConditionBuilder**: 修复旧日期实例的英文月份显示、日历词典、默认操作符与逻辑词的响应式翻译。
- **YSheet**: 补充繁体词典，使用原生语言切换保留工作簿。
- **YMonaco**: 标记无效的旧 NLS 接入为废弃，明确内核英文与组件三语按钮的边界。

### 📝 Documentation

- **ConfigProvider**: 修复演示的表格操作列、分页参数及 runtime-only 子组件写法，补充微应用、失败重试与引擎边界说明。

## v1.5.19
`2026-09-01`

### 🐞 Bug Fixes

- **Package Exports**: 修复 `@yss-ui/components/sheet` 类型入口路径错误导致 TS 无法解析的问题。
- **YMonthCalendar**: 补齐 Day.js 依赖子路径的 `.js` 扩展名，修复 ESM 产物在 Node.js/SSR 下解析失败的问题。

### 📝 Documentation

- **YConditionBuilder**: 明确 `getValue('legacy')` 与默认格式均返回标准 `ConditionGroup` 结构。
- **YTable**: 补充 `toolbarTools` 属性的 API 说明与工具栏插槽用法。

### 🔧 Build

- **YConditionBuilder**: 新增公开实例组件测试，覆盖取值格式与 `validate()` 校验。
- **YFileImport**: 组件按规范模块化重构（视图/Hook/样式），补齐核心测试，保持对外 API 兼容。
- **TypeScript**: 全仓启用 `strictNullChecks`，完善空值分支保护。
- **Quality Gate**: 引入全量覆盖率门禁与发布包 tarball 自动化消费验证。
- **Stylelint**: 支持 Vue `:deep()` 语法并合并清理冗余选择器。

---
## v1.5.18
`2026-08-19`

### 🐞 Bug Fixes

- **YFormily**: 修复 `@formily/antdv@2.0.1-beta.3` 在多条字段反馈场景中重复拼接分隔符的问题；内置 FormItem 适配器现在会统一过滤空消息、去重并只拼接一次。
- **YFormily**: 统一必填反馈展示语义。空值未通过必填校验时只展示必填提示；字段已有有效输入时移除残留必填提示，仅展示当前实际失败的长度或格式消息。
- **主题 / YTable**: 同步 dumi 明暗主题与 vxe-ui 主题状态，修复主题切换后表头、表尾及 Teleport 弹层颜色不一致的问题。
- **YConditionBuilder / YCron / YFileImport / YSplitPane / YTree**: 同时兼容 `data-prefers-color` 与 `data-theme` 暗色标识，修复暗色模式下文字、背景、边框及操作控件的显示与交互反馈。

### 📝 Documentation

- **文档站与 Demo**: 统一正文、导航、搜索、目录、页脚及组件示例的明暗主题变量，提升暗色模式下的可读性与视觉一致性。

### 🔧 Build

- 新增 YFormily 反馈归一化与组件渲染回归测试，覆盖空值、纯空白、非空长度错误、密码强度错误、多消息去重和适配器注册。

---

## v1.5.17
`2026-08-18`

### 🔧 Build

- 将 `vxe-table` 与 `vxe-pc-ui` 固定为组件库已验证的精确版本组合，避免业务项目重建锁文件时静默解析到未经验证的新版本。
- 组件包发版前新增 Registry 制品门禁，同时校验依赖版本声明、包元数据与 tgz 下载地址，避免 Nexus 元数据存在但制品不可下载时继续发布。

### 📝 Documentation

- 安装指南补充应用锁文件、CI frozen 安装、VXE tgz 404 排查与临时 overrides 的生命周期说明。
- 贡献指南与 Cursor 代码生成规则的 VXE 开发基线同步到 4.19.x，避免继续按过期 4.16.x 规范生成代码。

---

## v1.5.16
`2026-08-17`

### ✨ Features

- **YTable**: 新增 `selectedRows` (`v-model:selectedRows` / `v-model:selected-rows`) 与 `selectedRowKeys` (`v-model:selectedRowKeys` / `v-model:selected-row-keys`) 双向受控绑定，支持单页及跨页行选中；新增统一选择事件 `@selection-change`，扩展 `getSelectedRows`、`getSelectedRowKeys`、`setSelection`、`syncSelection` 等实例方法，`clearSelection` 自动同步清空受控绑定。
- **YTable**: 优化工具栏按需渲染机制，当使用 `#toolbar-left` / `#toolbar-right` 插槽或配置 `toolbarTools` 时自动展示工具栏容器，无需配置 `:toolbar-config="{ custom: true }"`（避免无端展示列设置图标）；仅在业务明确开启列设置时才需声明 `custom: true`。

### 🔧 Build

- 统一各子包与根工作区 `typescript` 开发依赖版本至 `^5.6.3`。
- 新增 `YTable` 多选受控与工具栏按需渲染的组件单元测试（`selection.component.test.ts`、`toolbar.component.test.ts`）。

---

## v1.5.15
`2026-08-10`

### ✨ Features

- **公开类型导出**: 补齐文档已引用但总入口缺失的类型域，现可从 `@yss-ui/components` 直接导入 `AuthorityDropdownProps` / `AuthorityDropdownItem`、`YFileImportProps` / `ImportResult`，以及 `YEcharts`、`YMonaco` / `YMonacoDiff` 相关 Props 类型；新增入口类型编译测试，避免回归。
- **YFormily**: 统一推荐名称为 `YFormily`，`YssFormily` 仅保留为具名与全局兼容别名；入口注释、文档与 Demo 主路径同步对齐，运行时行为不变。

### 📝 Documentation

- **全量 API 契约**: 16 个公开组件文档统一补齐 Props / Events / Slots / Expose / Types 五类章节；无对应能力时明确标注「无公开能力」，第三方包装组件标明透传边界与锁定版本。
- **AuthorityDropdown**: Button 文档补全完整 API 契约（此前仅有 Demo）。
- **YConditionBuilder**: Expose 与 Types 章节对齐源码；过时能力补充 deprecated / 迁移说明。
- **YTable / YEditTable / YTree**: 补齐自有 Props、实例方法与受控状态说明；移除未声明的无效文档 API `toolbarTools`。
- **YFormily**: 分步主 Demo 由旧 `@formily/antdv FormStep` 迁移为 Ant Design Vue `Steps` + 多 `YFormily` 独立校验与数据聚合；移除已删除的 `detail-as` 用法，明确 `mode=2` 直接进入 Descriptions。
- **Demo 清理**: 删除不可达或重复的旧 Demo 源文件（卡片指标、旧 Formily actions、ConditionBuilder validation-custom 重复 helper）。
- **LLM 文档**: `llms.txt` 增加 Skills 索引，`llms-full.txt` 纳入全部 Skill 全文，并接入构建前确定性新鲜度校验（`validate:docs`）。
- **审计报告**: 新增 `docs/audits/component-demo-skill-api-audit.md`，记录契约矩阵、修复状态与验收证据。

### 🔧 Build

- 新增组件契约抽取（`scripts/lib/component-contracts.mjs`）与文档校验（`scripts/validate-docs.mjs`），覆盖公开导出、API 章节、Demo/Skill 具名导入、自有 Props/Events/Slots/Expose、禁用模式、Demo 可达性与 LLM 新鲜度；`prebuild` 接入 `validate:docs`。
- 新增 CSS/Less 副作用导入模块声明，修复组件入口样式导入的 TypeScript 编辑器报错。

---

## v1.5.14
`2026-08-05`

### ✨ Features

- **YSplitPane**: 新增 `collapseAnimation`（`size` / `transform` / `none`）与 `resizeMode`（`realtime` / `deferred`），优化重内容场景下的折叠动画与拖拽性能。 [`70b938f`](https://github.com/yss-ui/yss-ui/commit/70b938f1af602e504e4fc426182af7185127c4d8)

### 🐞 Bug Fixes

- **YTable / YEditTable**: 修复操作列链接按钮禁用态仍显示主色、看起来可点击的问题。 [`70b938f`](https://github.com/yss-ui/yss-ui/commit/70b938f1af602e504e4fc426182af7185127c4d8)

### 📝 Documentation

- **YSplitPane**: 新增重内容折叠/拖拽示例，补充相关 API 说明。 [`70b938f`](https://github.com/yss-ui/yss-ui/commit/70b938f1af602e504e4fc426182af7185127c4d8)

---

## v1.5.13
`2026-07-30`

### ✨ Features

- **YEditTable**: 列配置 `component` 新增支持函数形式，可基于 `{ row, field, column }` 按当前行动态解析内置编辑器类型。同一列现在可以在不拆列的前提下，按行切换 `Select`、`InputNumber`、`Input`、`Switch`、`Checkbox` 等编辑器，并同步兼容查看态字典翻译、动态 `cellProps`、校验事件和编辑态渲染逻辑。 [`ad8fb70`](https://github.com/yss-ui/yss-ui/commit/ad8fb704edc6b94b398cd27afb7f4811a521e256)

### 🐞 Bug Fixes

- **YTable / YEditTable**: 修复操作列“更多”菜单点击操作后未自动关闭，导致打开 Modal、Drawer 等弹层时旧菜单仍悬浮在遮罩上方的问题。普通及异步操作会在回调执行前收起菜单；二次确认操作会在确认或取消后收起；禁用操作保持菜单不变。 [`138f0e0`](https://github.com/yss-ui/yss-ui/commit/138f0e077aa274aeba91b0601e7dda45e1713427)
- **YTable / YEditTable**: 补强操作菜单边界处理。当前行或收纳按钮集合发生变化时自动清理旧浮层；`displayLimit` 现在会规范化负数、小数和 `NaN`，避免异常切片结果。 [`138f0e0`](https://github.com/yss-ui/yss-ui/commit/138f0e077aa274aeba91b0601e7dda45e1713427)

### 📝 Documentation

- **YEditTable**: 文档新增“同列按行切换编辑器”示例，补充 `component` 函数签名与使用说明，演示在参数配置场景中按行切换下拉、数字输入和文本输入的写法。 [`ad8fb70`](https://github.com/yss-ui/yss-ui/commit/ad8fb704edc6b94b398cd27afb7f4811a521e256)

---

## v1.5.12
`2026-07-30`

### 💄 Styles

- **YTable / YEditTable**: 当前行、勾选/单选行及其 hover 背景色跟随主题主色。 [`118b980`](https://github.com/yss-ui/yss-ui/commit/118b980ef64c2285f176ea6087246c2e30590b0a)
- **YTable**: 操作列链接按钮统一使用主题主色，并补齐 hover/focus 态。 [`118b980`](https://github.com/yss-ui/yss-ui/commit/118b980ef64c2285f176ea6087246c2e30590b0a)

---

## v1.5.11
`2026-07-28`

### 🐞 Bug Fixes

- **YEditTable**: 修复校验规则读取不完整的问题。`editRules` 现同时支持从 `tableConfig.editRules`、props 与 attrs（含 `edit-rules`）读取；必填校验优先使用规则项中的自定义 `message`，未配置时回退为「列标题不能为空」。 [`3cfaebc`](https://github.com/yss-ui/yss-ui/commit/3cfaebc372bc95f0a76c3e3ec0cf93d0eafd9af4)

---

## v1.5.10
`2026-07-24`

### ✨ Features

- **YSheet**: `@univerjs/*`、`react`、`rxjs` 改为 optionalDependencies，业务无需手动安装；主入口异步加载 `YSheet`，避免私服缺包阻断整体安装。 [`c1b6bbd`](https://github.com/yss-ui/yss-ui/commit/c1b6bbd9b8c5d3f0e776ccccc55f3f1a086de532)
- **YSheet**: 正式导出 `@yss-ui/components/sheet`，进阶 Preset 推荐从此路径引入。 [`c1b6bbd`](https://github.com/yss-ui/yss-ui/commit/c1b6bbd9b8c5d3f0e776ccccc55f3f1a086de532)
- **YTable / YEditTable**: 优化行拖拽手柄样式与松手态清理，增强 `row-dragend` 事件载荷。 [`c1b6bbd`](https://github.com/yss-ui/yss-ui/commit/c1b6bbd9b8c5d3f0e776ccccc55f3f1a086de532)

---

## v1.5.9
`2026-07-15`

### ✨ Features

- **YssFormily**: 新增折叠查询（Search Collapse）功能。引入折叠触发展示组件 `CollapseTrigger` 与 `useFormilyCollapse` 逻辑，支持表单项在超出设定栅格行数时自动折叠并提供展开/收起切换按钮，同时按钮组 `AutoButtonGroup` 支持响应折叠状态，优化了在多筛选条件下的表单显示布局。

### ♻️ Refactor

- **YssFormily**: 依据组件库模块化拆分规范进行深度重构，解耦 `index.vue` 核心逻辑：
  - 抽离常量配置与类型定义至 `constant.ts` 与 `types.ts`。
  - 抽离样式代码至 `style.less`。
  - 提炼核心逻辑至 Composable Hooks 文件夹下，包含 `useFormilyModel`（数据模型管理）、`useFormilySchema`（Schema 解析/响应式属性处理）以及重构后的 `useFormilyGrid`（栅格自愈重算与布局逻辑）。

---

## v1.5.8
`2026-07-09`

### ✨ Features

- **YTable**: 新增 `tooltipConfig`、`headerTooltipConfig` 和 `footerTooltipConfig` 属性，支持透传底层 vxe-table 的 Tooltip 相关配置。 [`a1650af`](https://github.com/yss-ui/yss-ui/commit/a1650af306c9f231063059e9b08afee9153561d8)

### 🐞 Bug Fixes

- **YTable**: 修复单元格溢出提示 Tooltip 定位异常的 Bug。组件内部默认对 `tooltipConfig` 注入定位隔离类 `y-table-vxe-tooltip` 并重置样式为 `fixed` 定位，以防在父级 `overflow: hidden` 容器内提示浮层被截断或偏移。 [`a1650af`](https://github.com/yss-ui/yss-ui/commit/a1650af306c9f231063059e9b08afee9153561d8)

---

## v1.5.7
`2026-07-08`

### 🐞 Bug Fixes

- **Formily**: 增强 `FormGrid` 在动画容器（如 `Modal/Drawer`）内的自愈重算机制。支持在多阶段延迟时间点（`0ms`、`50ms`、`150ms`、`350ms`、`700ms`）自动触发 Reflow 微调以唤醒 `ResizeObserver`，彻底覆盖由于容器展开动画不同步引起的列数计算不准确问题。 [`7ba545a`](https://github.com/yss-ui/yss-ui/commit/7ba545a181872b5fd454149593ff403854a7152a)
- **Formily**: 优化 `useFormilyGrid` 的生命周期与性能，在组件卸载时自动清理全部待执行定时器与动画帧任务，防范潜在的内存泄漏风险。 [`7ba545a`](https://github.com/yss-ui/yss-ui/commit/7ba545a181872b5fd454149593ff403854a7152a)

---

## v1.5.6
`2026-07-08`

### 🐞 Bug Fixes

- **Formily**: 优化 `FormGrid` 在 `Modal/Drawer` 等容器内的自愈机制。由原先「宽度为 0 时强制重挂载」改为「初始宽度不足时延迟检测后触发 `resize` 事件与 `ResizeObserver` 重算」，避免整组件重挂载带来的闪烁，并覆盖动画展开期间宽度不足的场景。 [`c38df2f`](https://github.com/yss-ui/yss-ui/commit/c38df2f)

---

## v1.5.5
`2026-07-07`

### 🐞 Bug Fixes

- **Formily**: 修复 `FormGrid` 在 `Modal/Drawer` 等初始隐藏容器内挂载时，因首次测量宽度为 0 导致响应式列数退化为单列的问题。现在会在挂载阶段检测宽度为 0 的场景，并在容器宽度恢复后延迟触发一次自愈刷新（重新挂载栅格），确保栅格布局稳定回到预期列数。 [`03fb246`](https://github.com/yss-ui/yss-ui/commit/03fb246)

---

## v1.5.4
`2026-07-06`

### ✨ Features

- **YSheet**: 新增文档站专用导出入口 `@yss-ui/components/sheet`。支持将电子表格组件与 Univer Preset 运行时模块保持在同一 chunk 打包，规避了文档站（dumi）在异步分包加载 `YSheet` 时由于 `@univerjs` 核心 Preset 重复打包导致的运行时多实例冲突问题。

### ♻️ Refactor

- **YSheet**: 重构文档站 Demo (`basic` 与 `advanced`) 的导入路径，改为从 `@yss-ui/components/sheet` 导入 `YSheet` 及相关 Presets/类型，以保持运行环境隔离。

### 🔧 Build

- **Components**: 锁定依赖中的 `@univerjs/*` 相关预设包版本为精确的 `0.25.0`。
- **Components**: 移除主入口 `docs-entry.ts` 对 `@univerjs` 预设运行时代码的直接导出，仅保留纯类型定义导出，收拢运行时依赖。

---

## v1.5.3
`2026-07-06`

### ✨ Features

- **YTable / YEditTable**: `getTableInstance()` 对 vxe-table 废弃 API 做 Proxy 兼容，旧方法（如 `setActiveCell`、`clearActived` 等）自动重定向至新 API。 [`04a47b8`](https://github.com/yss-ui/yss-ui/commit/04a47b8)
- **YTable / YEditTable**: `rowConfig.height` 废弃，统一改用 `cellConfig.height`（旧配置自动兼容）。 [`04a47b8`](https://github.com/yss-ui/yss-ui/commit/04a47b8)
- **YEditTable**: `scrollY` 废弃，改用 `tableConfig.virtualYConfig`（`scrollY` 入参仍兼容）。 [`04a47b8`](https://github.com/yss-ui/yss-ui/commit/04a47b8)

### 🐞 Bug Fixes

- **YEditTable / Formily**: 修复 Select 布尔值字段触发 ant-design-vue value 类型警告的问题。 [`04a47b8`](https://github.com/yss-ui/yss-ui/commit/04a47b8)

### 📝 Documentation

- **YTable / YEditTable**: 补充废弃配置迁移说明。 [`04a47b8`](https://github.com/yss-ui/yss-ui/commit/04a47b8)

---

## v1.5.2
`2026-07-03`

### ✨ Features

- **MonthCalendar**: 头部插槽增强。新增 `header-left`、`header-right-before` 和 `header-right-after` 插槽，支持在不破坏自带切换按钮的前提下，往默认头部区域插入自定义内容（如刷新按钮等）。
- **MonthCalendar**: 新增 `fillHeight`（模板写法 `fill-height`）高度填充模式，在父容器具有明确高度时让六行日期均分剩余空间。

### 🐞 Bug Fixes

- **MonthCalendar**: 修复 `fill-height` 模式下表格单元格高度规则冲突造成的首行过高、末行被压缩或裁切问题。
- **MonthCalendar**: 优化 Dayjs 兼容性与多实例处理，修复受控模式连续跨月后“回到今天”可能出现面板和值状态不同步的问题。
- **MonthCalendar**: 修正周一至周日表头与日期网格的起始星期一致性。

### 📝 Documentation

- **MonthCalendar**: 新增「头部插槽增强」示例，并补全 Props、Events、Slots、Expose API。
- **MonthCalendar**: Props 表同时展示驼峰名称与 Vue 模板中划线名称，支持通过 `fillHeight` 或 `fill-height` 等关键词搜索。

### 🔧 Build

- **Components**: 将 `dayjs` 及其插件声明为构建外部依赖，并增加 `dayjs: ">=1.11.0"` peer dependency，避免组件库与宿主应用产生重复 Dayjs 运行时。

---

## v1.5.1
`2026-07-02`

### ✨ Features

- **MonthCalendar**: 增强月日历布局与展示能力。 [`757b57f`](https://github.com/yss-ui/yss-ui/commit/757b57f)
  - 新增 `cellLayout` 日期单元格布局：`card`（默认卡片）/ `grid`（连续网格，适合连续日程或假期条）。
  - 新增 `responsive`（默认 `true`），根据容器宽度自动压缩日期高度/间距/头部操作；传 `false` 可恢复固定宽度模式。
  - 新增 `todayIndicator` 控制今天标记展示方式：`date`（圆形日期，默认）/ `badge`（文字徽标）/ `both`。

### 📝 Documentation

- **MonthCalendar**: 新增「连续假期日历」示例，演示 `cellLayout="grid"` 下的连续区间条渲染与周内分段策略；同时补充 `cellLayout`、`responsive`、`todayIndicator` 等能力的说明。 [`757b57f`](https://github.com/yss-ui/yss-ui/commit/757b57f)

---

## v1.5.0
`2026-07-02`

### ✨ Features

- **MonthCalendar**: 新增 `YMonthCalendar` 月日历组件，基于 Dayjs 提供独立的选择日期和展示月份状态。 [`6a44d63`](https://github.com/yss-ui/yss-ui/commit/6a44d63)
  - 支持 `glass`（毛玻璃）和 `plain`（扁平）两种外观预设。
  - 支持通过 `validRange` 限制合法日期选择范围，并通过 `disabledDate` 函数自定义禁用日期。
  - 支持通过键盘（方向键/PageUp/PageDown 等）快捷切换焦点和选择，支持双击与右键菜单事件，并配备快捷右键菜单自动开启及自定义 `#context-menu` 插槽。
  - 提供了丰富的布局和自定义插槽，包括：`#header`（自定义头部）、`#weekday`（自定义星期）、`#date-cell`（自定义日期单元格主体）和 `#date-cell-extra`（追加额外内容）。

---

## v1.4.2
`2026-06-30`

### ✨ Features

- **EditTable**: 新增与 `YTable` 对齐的表头列筛选能力，支持内置渲染器与自定义面板两种方式。
  - 列配置开放 `filterRender`（如 `{ name: 'VxeInput', props: { clearable: true, placeholder: '请输入关键词' } }`），无需写插槽即可获得内置文本筛选输入框。
  - 新增自定义筛选面板插槽 `#<field>-filter`（兼容 `#<field>Filter` / 全局 `#filter`），用于完全自定义筛选面板内容。
  - 新增 `filter-change` 事件，透传 vxe 原生筛选参数（含 `column`/`filterList` 等），可用于远程筛选。
  - 配合列配置 `filterable`、`filters`、`filterMethod`、`filterMultiple` 使用；切换数据源或新增行后可调用 `getTableInstance().clearFilter()` 清空筛选状态。

### 📝 Documentation

- **EditTable**: 文档明确区分「下拉过滤（行级 `filterOptions`）」与「表头列筛选（`filterable`）」两种概念，新增表头列筛选示例与 API 说明，避免混淆。

---

## v1.4.1
`2026-06-15`

### 🐞 Bug Fixes

- **Table**: 修复筛选下拉面板受表格高度限制被截断的 Bug。将选项列表及自定义模板的最大高度提取为 CSS 变量 `--y-table-filter-max-height`（默认 `180px`），支持业务端灵活、无侵入地定制筛选面板最大高度。

---

## v1.4.0
`2026-06-10`

### ✨ Features

- **EditTable**: 新增 `errorTooltipConfig` 校验错误气泡配置，支持按场景控制错误提示展示方式。
  - 新增 `mode` 展示策略：`active`（仅自动展开当前激活错误）、`hover`（悬浮展示）、`always`（全部展开）、`none`（关闭气泡，仅保留错误红框）；传 `false` 等价于 `mode: 'none'`。
  - 支持 `placement`、`maxWidth`、`overlayClassName`、`overlayInnerStyle`、`mouseEnterDelay`、`mouseLeaveDelay`、`autoAdjustOverflow`、`zIndex`、`getPopupContainer` 等 Tooltip 细粒度配置。
  - 默认 `mode: 'active'`，校验失败时只自动展开首个/当前激活错误，其余错误悬浮查看，避免多气泡互相遮挡。
- **Table / EditTable**: 升级底层 `vxe-table` 至 `4.19.10`，同步透传 4.19.x 原生能力。
  - 业务侧可直接使用 `aggregateConfig`、`aggregateAccuracyConfig` 等聚合配置。
  - `tooltipConfig` 支持 `defaultPlacement`、`popupClassName`、`useHTML` 等 4.19.x 新增项。
  - 补充 `tableConfig` 透传说明，明确 `rowConfig`、`cellConfig`、`columnConfig`、`editConfig`、`tooltipConfig`、`validConfig`、`scrollY`、`virtualXConfig`、`virtualYConfig` 等配置的默认合并与覆盖规则。

### 🔧 Build

- **Table**: 升级 `vxe-table` 至 `4.19.10`（自 `4.17.41`），同步升级 `vxe-pc-ui` 至 `4.14.32`（自 `4.9.23`），保持表格组件与 Vxe UI 配套版本一致。
- **Table**: 优化 `useVxeInstall`，改为模块加载阶段静态引入 `vxe-pc-ui`，与组件库统一安装入口对齐。

### 🐞 Bug Fixes

- **EditTable**: 修复 `tableConfig.tooltipConfig`、`tableConfig.rowDragConfig`、`tableConfig.scrollY` 等 vxe-table 配置容易被组件内置默认覆盖的问题，业务传入值优先生效。

---

## v1.3.16
`2026-06-10`

### ✨ Features

- **FileImport**: 新增按钮显隐与文案配置，业务侧可按场景隐藏「下载导入模板」等按钮并自定义提示文案。
  - 新增 `showDownloadTemplate`、`showCancel`、`showUploadTip`、`showNextStep`、`showLastStep` 控制底部按钮与上传提示显隐。
  - 新增 `draggerText` 自定义拖拽区主文案。
  - 新增 `texts` 统一配置按钮文案与校验提示（如 `downloadTemplate`、`uploadTip`、`emptyFileMessage` 等）。
  - 底部左侧无内容时自动隐藏，仅保留右侧按钮时底栏右对齐。

---

## v1.3.15
`2026-06-09`

### ✨ Features

- **Sheet**: 增强 `YSheet` 只读与扩展能力，支持通过 `extraPresets`、`extraPlugins`、`extraLocales` 按需接入筛选、数据校验等 Univer Preset，业务侧无需单独安装 `@univerjs/*` 依赖。
  - 新增 `extraLocales`，按当前 `locale` 与核心语言包自动合并扩展语言包。
  - 完善 `readonly` 只读模式，拦截键盘编辑、粘贴、拖拽、双击编辑与右键入口，保留复制、撤销等组合键操作。
  - 内置并导出 `UniverSheetsFilterPreset`、`UniverSheetsDataValidationPreset`、`UniverSheetsDrawingPreset` 及对应中文语言包；组件内已引入筛选与数据校验样式。
  - `modelValue` 与 `reload` 支持 `null`，空值时回退默认空白工作簿。
  - 新增「只读与扩展 Preset」文档 Demo，演示只读切换与筛选、数据校验扩展配置。

### 🐞 Bug Fixes

- **Sheet**: 修复 `save()` 触发 `v-model` 回写后，watcher 立即 reload 同一份快照导致的数据重复加载问题。
- **Sheet**: 优化工作簿渲染竞态处理，避免快速切换数据时加载态与就绪状态错乱。
- **Sheet**: 完善 Univer 实例销毁逻辑，同时释放 `univerAPI` 与 `univer` 实例。
- **Hooks**: 修复 `usePollingTask` 间隔切换 Demo 中 `handleIntervalChange` 入参类型兼容问题。

---

## v1.3.14
`2026-06-09`

### 🐞 Bug Fixes

- **Monaco**: 修复代码编辑器（`YMonaco` 与 `YMonacoDiff`）内置代码折叠指示器（折叠箭头）缺失的问题。
  - 在初始化阶段补充导入 `folding` contribution 模块以激活编辑器折叠功能。
  - 默认启用 `foldingStrategy: 'indentation'`，确保在特定语言 Worker 禁用时仍可通过行缩进解析并渲染折叠箭头。

---

## v1.3.13
`2026-06-04`

### ✨ Features

- **Sheet**: 升级 `@univerjs/presets` 与 `@univerjs/preset-sheets-core` 至 `^0.25.0`（自 `^0.16.1`），同步 Univer 电子表格引擎版本，使 `YSheet` 与官方最新表格能力、交互优化及稳定性修复保持一致。

---

## v1.3.12
`2026-05-21`

### ✨ Features

- **EditTable**: 新增「字段级禁用与数据清空联动」Demo 示例，演示如何通过列 `cellProps` 进行动态属性级禁用控制，以及在 `@update-row` 中响应数据层清空。

### 🐞 Bug Fixes

- **Monaco**: 修复 Monaco 编辑器（`YMonaco` 与 `YMonacoDiff`）在全屏模式下，仍然受到外层容器 `rootStyle` 样式尺寸约束导致无法完整铺满屏幕的问题。

---

## v1.3.11
`2026-05-15`

### 💅 Style

- **Table**: 修复分页器（Pagination）中「每页条数」下拉选择框宽度不足导致文字截断的问题。
- **EditTable**: 同步修复分页器「每页条数」下拉选择框宽度不足导致文字截断的问题。

---

## v1.3.10
`2026-05-13`

### 🐞 Bug Fixes

- **Sheet**: 修复文档站切换到 `YSheet` 示例时右键菜单在页面左上角短暂闪烁的问题，同时保留表格内右键菜单的正常交互能力。 [`994bc2a`](https://github.com/yss-ui/yss-ui/commit/994bc2a)

---

## v1.3.9
`2026-05-13`

### ✨ Features

- **Table**: 新增树形表格（Tree Table）示例，补充 `tree-config`、`row-config.keyField` 与 `treeNode` 列配置，展示树形数据展示与操作列交互。 [`384fb73`](https://github.com/yss-ui/yss-ui/commit/384fb73)
- **Sheet**: 新增初始化加载态、异常提示与 `reload` 暴露方法，提升 `YSheet` 在异步初始化、异常恢复和手动重试场景下的可用性。

### ⚡ Performance

- **Sheet**: 优化 `YSheet` 在文档站中的加载体验，对 `YSheet`、`YMonaco`、`YEcharts` 等重组件采用异步加载与占位提示，减少首次打开文档时的长时间空白。
- **Sheet**: 优化 Univer 实例与工作簿数据的响应式处理，减少大对象被深层代理带来的初始化开销。

### 🐞 Bug Fixes

- **Sheet**: 修复初始化失败时缺少明确反馈的问题，加载工作簿异常时展示错误状态并支持重新加载。

- **Styles**: 修复树形表格示例中部分 Scoped 样式未生效的问题。 [`89e9e0c`](https://github.com/yss-ui/yss-ui/commit/89e9e0c)

### 📝 Documentation

- **Global**: 调整文档站整体视觉样式与暗色模式适配，优化导航、页脚、搜索与示例区域的可读性。 [`2c938ec`](https://github.com/yss-ui/yss-ui/commit/2c938ec)

---

## v1.3.8
`2026-05-12`

### 💅 Style

- **Tree**: 深度优化树组件（`YTree`）的交互视觉体验。 [`78b5b04`](https://github.com/yss-ui/yss-ui/commit/78b5b04)
  - 新增基于 `color-mix` 的响应式背景色变量，统一并平滑悬浮（Hover）与选中（Selected）状态的色彩表现。
  - 重构 "更多" 操作按钮，集成平滑的 `background-color` 与 `box-shadow` 过渡动画，增强交互细腻度。
  - 优化操作按钮激活逻辑，支持在节点内容区域（Content Wrapper）悬浮时同步显示，提升易用性。
  - 全面适配暗黑模式（Dark Mode），优化深色主题下的对比度与高亮视觉质感。

---

## v1.3.7
`2026-05-11`

### ✨ Features

- **Monaco**: 新增 `log` / `yss-log` 日志语言，支持按 `ERROR`、`WARN`、`INFO`、`DEBUG` 等等级高亮发布日志与运行日志。 [`cc18b44`](https://github.com/yss-ui/yss-ui/commit/cc18b44)
- **Monaco**: 新增 `nginx` 语言支持，内置 Nginx 配置语法高亮、常用指令补全与右键菜单格式化能力。 [`cc18b44`](https://github.com/yss-ui/yss-ui/commit/cc18b44)

### 📝 Documentation

- **Monaco**: 更新日志查看器、语言切换 Demo 与 API 文档，补充日志高亮和 Nginx 格式化说明。 [`cc18b44`](https://github.com/yss-ui/yss-ui/commit/cc18b44)

---

## v1.3.6
`2026-05-08`

### 🐞 Bug Fixes

- **FileImport**: 修复 `nextStep` 事件的 `onSuccess` 回调未被正确调用的问题。 [`c1d0514`](https://github.com/yss-ui/yss-ui/commit/c1d0514)

---

## v1.3.5
`2026-04-30`

### ✨ Features

- **SplitPane**: 新增 `destroyOnCollapse` 属性，支持折叠动画结束后卸载左侧/上侧面板内容，适用于重 DOM 场景下减少折叠后常驻渲染开销。 [`ed3ee71`](https://github.com/yss-ui/yss-ui/commit/ed3ee71)

### 🐞 Bug Fixes

- **SplitPane**: 优化折叠/展开动画体验，新增内部内容容器固定折叠前尺寸，避免面板收起时左侧/上侧内容随宽高变化被逐步挤压变形。 [`ed3ee71`](https://github.com/yss-ui/yss-ui/commit/ed3ee71)
- **SplitPane**: 修复 vertical 非受控模式读取缓存高度时缺少 fallback 导致的类型异常，确保本地缓存尺寸初始化逻辑稳定。 [`ed3ee71`](https://github.com/yss-ui/yss-ui/commit/ed3ee71)
- **Tree**: 修复 `YTree` 在 `virtual=true` 时与 ant-design-vue 的 `defaultExpandedKeys`/`defaultSelectedKeys`/`defaultCheckedKeys` 属性冲突，导致未设置 `virtual`（保留 undefined）或手动传入 `true` 时，预期的默认展开/选中状态不生效问题。 [`4b7bc14`](https://github.com/yss-ui/yss-ui/commit/4b7bc14)
- **Tree**: 完善 `YTree` 对 ant-design-vue 4.x 响应式状态属性的代理能力，确保在虚拟滚动开启时，外部对 `selectedKeys`、`expandedKeys`、`checkedKeys`、`loadedKeys` 的变更能正确同步至组件内部逻辑（如节点展开、选中状态更新）。 [`4b7bc14`](https://github.com/yss-ui/yss-ui/commit/4b7bc14)

### 📝 Documentation

- **SplitPane**: 补充 `destroyOnCollapse` API 说明，并明确该属性只控制折叠后的内容保留策略，不替代树或列表虚拟滚动。 [`ed3ee71`](https://github.com/yss-ui/yss-ui/commit/ed3ee71)
- **Tree**: 补充 `virtual` 属性在虚拟滚动场景下的约束说明（仅支持 `number` 类型），并澄清与 ant-design-vue 全局配置的关系。 [`4b7bc14`](https://github.com/yss-ui/yss-ui/commit/4b7bc14)
- **Tree**: 修正或移除与 4.x 较新 API 不完全一致的属性描述，确保文档与组件实现同步。 [`4b7bc14`](https://github.com/yss-ui/yss-ui/commit/4b7bc14)

---

## v1.3.4
`2026-04-22`

### ✨ Features

- **Table**: 增强操作列按钮 (`ActionButton`) 配置兼容性。新增支持 `label` (映射至 `text`)、`value` (映射至 `key`) 和 `click` (映射至 `clickFn`) 配置写法，更符合 Ant Design 习惯且易于从原生配置迁移。 [`3084e70`](https://github.com/yss-ui/yss-ui/commit/3084e70)

### 🐞 Bug Fixes

- **Table**: 优化操作列渲染逻辑，支持自动通过 `value` 或 `label` 兜底生成 `key`，修复未提供 key 时导致的渲染警告。 [`3084e70`](https://github.com/yss-ui/yss-ui/commit/3084e70)

### 📝 Documentation

- **Table**: 更新操作列 API 与示例，展示新增的兼容性配置用法。 [`3084e70`](https://github.com/yss-ui/yss-ui/commit/3084e70)

---

## v1.3.3
`2026-04-21`

### ✨ Features

- **SplitPane**: 新增 direction 设置为纵向 vertical 场景的能力。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)
- **SplitPane**: 新增 `showVerticalQuickActions` 能力，支持 vertical 场景下“隐藏上侧 / 恢复 / 隐藏下侧”快捷按钮组，并与默认折叠按钮互斥显示。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)
- **SplitPane**: 新增 vertical 快捷按钮子组件与组合式 Hook（`VerticalQuickActions`、`useVerticalQuickActions`），统一管理按钮显隐、偏移、缓存写入与恢复策略。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)

---

### 📝 Documentation

- **SplitPane**: 新增“快捷按钮（vertical）”示例，展示上侧自适应表格 + 下侧自适应折线图的完整用法。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)
- **SplitPane**: 新增“嵌套布局（Tree + Vertical Quick Actions）”示例，覆盖外层左右分割 + 内层上下分割的组合场景。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)
- **SplitPane**: 更新 API 文档，补充 `showVerticalQuickActions` 属性说明与相关使用约束。 [`7ce25f7`](https://github.com/yss-ui/yss-ui/commit/7ce25f7)

---

## v1.3.2
`2026-04-17`

### 🐞 Bug Fixes

- **Formily**: 修复 `YFormily` 查看态下部分 `x-reactions`、动态显隐及联动字段在 `DescriptionsView` 中不生效的问题。现在会在只读详情渲染时隐式构建一份 Formily Field 树，确保联动计算、动态标题和字段状态能够正常执行。 [`03c5f09`](https://github.com/yss-ui/yss-ui/commit/03c5f09)
- **Formily**: 修复 `DescriptionsView` 对动态字典和运行时组件属性的取值不完整问题。现在会优先读取字段实例上的 `dataSource` 与 `componentProps`，使 `Select`、`TreeSelect`、`Cascader` 等组件在查看态下能正确回显联动后的最新文案。 [`03c5f09`](https://github.com/yss-ui/yss-ui/commit/03c5f09)

### ✨ Features

- **Formily**: 新增查看态渲染专用的隐藏树组件适配层，对输入类组件做空渲染、对容器类组件做透传渲染，既保留 Field 树和联动能力，又避免详情模式重复输出表单控件。 [`03c5f09`](https://github.com/yss-ui/yss-ui/commit/03c5f09)
- **Formily**: 新增详情页渲染耗时埋点事件，支持采集 `DescriptionsView` 首次渲染耗时，便于后续排查复杂表单查看态性能问题。 [`03c5f09`](https://github.com/yss-ui/yss-ui/commit/03c5f09)

---

## v1.3.1
`2026-04-15`

### 🐞 Bug Fixes

- **Formily**: 修复 `YFormily` 在业务层通过 `v-model` 将表单值重置为空对象时，仅同步外部响应式值、未同步清空内部表单状态的问题。现在当外部 `modelValue` 置为 `{}` 或 `null` 时，会自动执行表单级 `reset('*', { forceClear: true })`，确保页面展示与查询入参保持一致。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)
- **Formily**: 优化 `YFormily` 的外部值同步策略。非空值写入时改为覆盖式同步，避免旧字段残留导致的表单回显异常。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)
- **Monaco**: 修复应用内全屏切换的视觉跳变问题。全屏进入/退出现在支持可配置过渡动画，退出时会基于占位节点回落到原始布局位置，并自动遵循 `prefers-reduced-motion`。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)
- **Monaco**: 修复站点亮暗模式切换后编辑器主题不一致的问题。`YMonaco` / `YMonacoDiff` 在未显式传入 `theme` 时会自动跟随站点 `data-prefers-color` 状态同步主题。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)
- **Monaco**: 修复部分语言补全动态加载不稳定的问题。将语言补全加载改为显式白名单映射，覆盖 `sql`、`mysql`、`pgsql`、`html`、`css`、`javascript`、`typescript`、`json`、`yaml`、`shell`、`xml`、`python`、`java`、`go` 等常用语言。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)

### ✨ Features

- **Monaco**: 新增工具栏 Tooltip 配置能力，支持统一设置悬浮位置、延迟和按钮文案；复制、全屏、下载按钮同时补充了 `aria-label`，提升可访问性。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)
- **Monaco**: 新增 `fullscreenTransition` 配置项，支持控制应用内全屏的动画时长和缓动曲线，也可直接关闭动画。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)

### 📝 Documentation

- **Monaco**: 同步更新组件文档与 Demo 示例，补充全屏目标容器用法、主题切换说明以及新工具栏配置项说明。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)


### 🔧 Infrastructure

- **Build**: 调整 UMD 构建配置，仅保留 `vue` 为外部依赖，并显式注入 `process.env.NODE_ENV=production`，提升独立验证和发版产物的一致性。 [`2f3927b`](https://github.com/yss-ui/yss-ui/commit/2f3927b)

---

## v1.3.0
`2026-04-03`

### 🔨 Refactoring

- **Build**: 深度优化构建架构与依赖管理策略。 [`153715b`](https://github.com/yss-ui/yss-ui/commit/153715b)
  - **依赖外部化 (Externalization)**: 将 `echarts`, `@formily/*`, `@univerjs/*`, `diff`, `sql-formatter`, `rxjs`, `react`, `react-dom` 等重型第三方库标记为 `external`。此变动显著降低了组件库主包体积，将依赖控制权交还给业务项目，避免重复打包。
  - **产物规范**: 统一构建产物扩展名，ES 模块使用 `.mjs`，CommonJS 模块使用 `.cjs`，提升在 Node.js 及现代构建工具中的兼容性。
  - **输出配置**: 在 Rollup 配置中显式开启 `exports: 'named'`，确保在各种模块加载环境下的导出行为一致。

### ✨ Features

- **Lite Entry**: 新增 `packages/components/src/lite.ts` 轻量化入口。该入口仅导出组件定义与 TypeScript 类型，不包含全局样式注入及自动安装逻辑，适用于对包体积及样式污染有严格要求的按需引入场景。 [`153715b`](https://github.com/yss-ui/yss-ui/commit/153715b)
- **Docs Entry**: 新增 `packages/components/src/docs-entry.ts` 文档专用入口。通过 `defineAsyncComponent` 对 `YSheet`、`YMonaco`、`YEcharts` 等重型组件进行异步加载包装，大幅提升文档站点的首屏加载速度与开发效率。 [`153715b`](https://github.com/yss-ui/yss-ui/commit/153715b)
- **Formily**: 规范化组件导出名称，主推 `YFormily` 作为标准名称，同时通过 `YssFormily` 别名保持对旧版本的 100% 兼容。 [`153715b`](https://github.com/yss-ui/yss-ui/commit/153715b)

### 🔧 Infrastructure

- **CI/CD**: 更新 `Dockerfile` 及 `.dumirc.ts` 配置，适配新的构建路径与站点渲染策略。 [`153715b`](https://github.com/yss-ui/yss-ui/commit/153715b)


---

## v1.2.13
`2026-04-01`

### 🐞 Bug Fixes

- **Formily**: 修复 `DescriptionsView`（表单查看模式）下 `x-reactions` 联动失效的问题。通过隐式挂载底层 `SchemaField` 引擎并深度连接响应式状态，现已支持动态显隐（`visible`）、异步数据源翻译（`dataSource`）、动态组件属性及标题的响应式更新。 [`4d6716a`](https://github.com/yss-ui/yss-ui/commit/4d6716a)

---

## v1.2.12
`2026-03-30`

### ⚡ Performance

- **Table**: 进一步优化大数据量渲染性能。改进 `useSafeData` 机制，通过复用未修改行的引用大幅降低内存消耗；同时优化 `useStableConfig` 以避免深度同步数组或非纯对象（如 Vue 组件实例），防止深层响应式克隆导致的帧率抖动。 [`a733a99`](https://github.com/yss-ui/yss-ui/commit/a733a99)
- **EditTable**: 将由顶层 `rawTableProps` 代理的 `data` 与 `loading` 属性转为在 `<vxe-table>` 层显式响应绑定，切断深层克隆链条，彻底解决巨型表格下重新赋值的浏览器卡死问题。 [`a733a99`](https://github.com/yss-ui/yss-ui/commit/a733a99)

---

## v1.2.11
`2026-03-28`

### ⚡ Performance

- **Table**: 优化内部属性透传与配置响应机制。新增 `useStableConfig` 核心 Hook，对 `checkbox-config`、`expand-config` 等复杂对象配置进行深度比较与稳定化处理，彻底解决由于业务层传入内联对象（如 `:checkbox-config="{ highlight: true }"`）导致 `vxe-table` 高频无意义重排与重绘的性能问题。 [`e553159`](https://github.com/yss-ui/yss-ui/commit/e553159)
- **EditTable**: 同步接入 `useStableConfig` 稳定化配置机制，提升大数据量与复杂表单嵌套场景下的渲染性能。 [`e553159`](https://github.com/yss-ui/yss-ui/commit/e553159)

### 📝 Documentation

- **Table**: 新增「配置项性能优化（Stable Config）」相关文档与 Demo，演示内联对象写法与稳定引用写法的内置优化表现。 [`e553159`](https://github.com/yss-ui/yss-ui/commit/e553159)
- **EditTable**: 同步补充配置项性能优化最佳实践示例。 [`e553159`](https://github.com/yss-ui/yss-ui/commit/e553159)

---

## v1.2.10
`2026-03-27`

### 🐞 Bug Fixes

- **Monaco**: 优化 SQL 格式化策略。支持多级格式化兜底及多语句（Multi-statement）准确解析，大幅提升稳定性。 [`71fe5e8`](https://github.com/yss-ui/yss-ui/commit/71fe5e8)
- **Monaco**: 增强 `#date#` 等非标准 SQL 标注兼容性，解决格式化导致的标注损坏问题。 [`15d0319`](https://github.com/yss-ui/yss-ui/commit/15d0319)
- **Monaco**: 修复行内注释可能导致的意外换行。 [`71fe5e8`](https://github.com/yss-ui/yss-ui/commit/71fe5e8)

### 🔨 Refactoring

- **Build**: 优化依赖管理。将 `sql-formatter` 正式移入 `dependencies`，确保生产环境格式化功能可用。 [`71fe5e8`](https://github.com/yss-ui/yss-ui/commit/71fe5e8)
---

## v1.2.9
`2026-03-24`

### 🐞 Bug Fixes

- **Formily**: 修复 `YFormily` 场景下 `Reset` 按钮在部分版本 `@formily/antdv` 中可能触发两次 `onClick`，从而导致业务重置查询接口重复调用的问题。组件库新增并覆盖了安全版 `Reset` 组件，统一规避重复触发。 [`eddd0c8`](https://github.com/yss-ui/yss-ui/commit/eddd0c8)
- **Table**: 修复分页器切换 `pageSize` 时页码状态处理不一致的问题。现在调整每页条数后会统一将 `current` 重置为 `1`，并以重置后的页码触发 `page-change`。 [`eddd0c8`](https://github.com/yss-ui/yss-ui/commit/eddd0c8)

### 🔨 Refactoring

- **Table**: 清理分页事件实现，移除冗余的 `show-size-change` 绑定与 `handleAntdShowSizeChange` 分支，统一使用 `change` 事件处理分页与每页条数切换逻辑。 [`eddd0c8`](https://github.com/yss-ui/yss-ui/commit/eddd0c8)

---

## v1.2.8
`2026-03-23`

### 💥 Breaking Changes

- **Monaco**: 移除 `resizable` 属性及拖拽缩放功能。因固定像素缩放与“内部全屏模式”及响应式布局的绝对定位存在交互冲突，现已彻底清理相关代码及 Props。

### 🐞 Bug Fixes

- **Monaco**: 修复带有非标准 SQL 标注（如 `#20260208wc`）的代码，格式化时被 `sql-formatter` 误认为行内注释或引发语法报错的问题，通过预/后置替换符确保完美解析。

### 🔨 Refactoring

- **Build**: 优化依赖项结构，将 `vxe-table`、`vxe-pc-ui`、`xe-utils` 移至 `peerDependencies`，减少重复打包体积；并将 `sql-formatter` 配置为可选的 Peer 依赖，结合 `external` 进一步精简包体。

---

## v1.2.7
`2026-03-20`

### 🐞 Bug Fixes

- **Monaco**: 修复 `readonly` 模式下 `formatOnMount` 不生效的问题，自动格式化前会自动解除只读模式并在完成后恢复。

---

## v1.2.6
`2026-03-20`

### 🐞 Bug Fixes

- **Utils**: 修复 `getUrlData` 工具函数在传入自定义 URL 时逻辑反向且由于 `undefined` 访问可能导致崩溃的问题。

### ✨ Features

- **Monaco**:
  - 新增 `formatOnMount` 和 `formatLanguages` 属性，支持在编辑器初始化完成后自动执行代码格式化（内置 SQL/JSON 兜底格式化策略）。
- **Build**: 优化各包的构建配置，引入 `tsconfig.build.json` 并精简 `dts` 生成逻辑。
- **Docs**: 优化侧边栏样式及 TOC 展示逻辑，改善 AI Skills 专项文档的阅读体验。

---

## v1.2.5
`2026-03-19`

### ✨ Features

- **Table**: 增强行拖拽能力，拖拽至表格顶部或底部边界（甚至延伸到表格外部）时，表格内部滚动条支持自动滚动，提升跨屏拖拽排序的丝滑体验。
- **EditTable**: 同步支持 `YTable` 的拖拽自动滚动特性。
- **EditTable**: 新增 `addPosition` (`'top' | 'bottom'`) 和 `autoScrollOnAdd` 属性，支持点击“添加”按钮后，新行插入到指定位置并自动滚动至新行，大幅提升大数据量表单下的体验。

---

## v1.2.4
`2026-03-17`

### 🐞 Bug Fixes

- **Formily**: 修复 `DescriptionsView` 组件中 Tooltip 提示气泡内容过多时超出屏幕边界的问题，并支持通过 `:detail-options="{ tooltipProps: { overlayInnerStyle: { minWidth: '...' } } }"` 配置最小宽度。
- **Table**: 修复操作列末尾按钮的气泡确认框（Popconfirm）展开方向向右偏移导致被边界截断的问题，动态调整为 `topLeft`。

---

## v1.2.3
`2026-03-12`

### 🐞 Bug Fixes

- **EditTable**: 修复亮色模式、暗黑模式下气泡提示背景色与边框色不一致的问题。[`b848e87`](https://github.com/yss-ui/yss-ui/commit/b848e87c37c710e79e20eccea71d0c2271beb012)
- **Table**: 修复展开行内容高度变化时，表格高度未自适应的问题。

---

## v1.2.2
`2026-03-06`

### 🐞 Bug Fixes

- **Sheet**: 升级 Univer 引擎至 `0.16.1`，修复在非全屏滚动容器（如文档页、弹窗）内嵌入时，单元格编辑器高度计算错误导致交互视图超出边界的问题（已向开源社区提交 Issue 并修复）。 [`#6603`](https://github.com/dream-num/univer/issues/6603)

---

## v1.2.1
`2026-03-03`

### ✨ Features

- **Utils**: 抽取 `copyToClipboard` 为公共工具函数，统一处理剪贴板复制及跨域安全上下文降级。

### 🐞 Bug Fixes

- **Monaco**: 修复 HTTP 非安全上下文下 `YMonaco` 工具栏复制功能报错（`navigator.clipboard` 为 undefined）的问题。
- **Cron**: 修复 `YCron` 组件复制表达式功能在非安全上下文报错的问题，现已共用安全降级逻辑。
- **Docs**: 更新 `@dumijs/preset-vue` 补丁，修复 Vue Demo 懒加载渲染相关问题。

### ✨ Features

- **Cron**: 深度适配暗黑模式下的组件样式。
- **EditTable**: 新增暗黑模式适配，支持深色主题下气泡提示等元素的表现。
- **Sheet**: 实现暗黑模式（`darkMode`）参数动态注入机制，自动跟随应用级别主题。
- **Table**: 增强表格和操作列（`ActionColumn`）的暗黑模式表现。

### 🔨 Refactoring

- **ConditionBuilder**: 抽取组件内联样式为独立的 `style.less` 文件。

### 📝 Documentation

- **Echarts**: 补充并更新环形图图表示例。
- **Cron**: 优化与 Select 下拉选项结合使用的 Demo。

---

## v1.2.0
`2026-02-25`

### ✨ Features

- **Sheet**: 新增 `YSheet` 协同表格组件，基于 Univer 引擎封装，多 Sheet、公式计算等功能。
- **Sheet**: 支持 `v-model` 双向绑定，通过 Facade API 暴露 `save`、`reload`、`dispose` 等实例方法。
- **Sheet**: 支持暗黑模式（`darkMode`）、多语言（`locale`）、只读模式（`readonly`）等配置。
- **Sheet**: 内置导出 `LocaleType`、`IWorkbookData` 等核心类型，业务项目无需单独安装 `@univerjs/*` 依赖。
- **Sheet**: 支持通过 `extraPresets` 和 `config` 灵活扩展绘图、公式等进阶功能。

### 📝 Documentation

- **Sheet**: 新增 `YSheet` 组件文档及 Demo 示例（基础用法）。

---

## v1.1.42
`2026-02-03`

### ✨ Features

- **Tree**: 新增 CSS 变量 `--y-tree-header-padding` 和 `--y-tree-body-padding`，支持全局自定义树组件的内边距。新项目可在全局样式中设置 `:root { --y-tree-header-padding: 0; }` 一键去除内边距，老项目默认保持原有样式（向后兼容）。

---

## v1.1.41
`2026-01-28`

### ✨ Features

- **Formily**: `DescriptionsView` 组件新增 `emptyPlaceholder` 属性，支持自定义空值占位符（默认为 -）。

### 🐞 Bug Fixes

- **Table**: 修复翻译列（`isTransform: true`）在数据为 `null` 或 `undefined` 时显示 "null" 字符串的问题，现已统一为空字符串。

### 🔨 Refactoring

- **Formily**: 重构 `DescriptionsView` 组件，拆分为模块化架构（constant + hooks），提升代码可维护性。

### 📝 Documentation

- **Development**: 更新组件开发规范（SKILL），新增 API 文档同步检查项。
- **Formily**: 更新 `DescriptionsView` 文档，补充 `emptyPlaceholder` 配置说明。

---

## v1.1.40
`2026-01-28`

### 🐞 Bug Fixes

- **Monaco**: 修复 Monaco 编辑器工具栏按钮在表单中可能会触发表单校验的问题。通过为工具栏按钮显式添加 `type="button"` 属性，防止其在 Form 组件中被误识别为提交按钮。 [`7c805b8`](https://github.com/yss-ui/yss-ui/commit/7c805b8)

---

## v1.1.39
`2026-01-26`

### ✨ Features

- **Monaco**: 新增 Toolbar 工具栏设计，默认支持复制、全屏、下载功能，且支持灵活插拔配置（同步支持 `YMonaco` & `YMonacoDiff`）。 [`b9088bf`](https://github.com/yss-ui/yss-ui/commit/b9088bf)
- **Monaco**: 完善插槽机制，新增 `toolbar-prefix` 与 `toolbar-suffix` 插槽，并同步更新文档说明。 [`b9088bf`](https://github.com/yss-ui/yss-ui/commit/b9088bf)

### 📝 Documentation

- **Monaco**: 更新文档说明，新增 `toolbar` 插槽的使用示例。 [`b9088bf`](https://github.com/yss-ui/yss-ui/commit/b9088bf)

---

## v1.1.38
`2026-01-23`

### 🔨 Refactoring

- **Global**: 优化 CSS 变量优先级机制。构建 `var(--yss-*, var(--ant-*, #default))` 变量链，优先响应 `applyYssTheme` 配置，回退至 Ant Design 主题配置，最后兜底组件库默认色。此改动确保了与 `applyYssTheme` 工具的完美兼容，同时支持标准 Ant Design 主题系统。

### ⚡ Performance

- **Table**: 优化列设置面板拖拽性能。默认设置 `customConfig.immediate` 为 `false`，消除列排序时的渲染卡顿。

### 💥 Breaking Changes

- **Formily**: 移除 `detailAs` 属性。简化详情模式逻辑，当 `mode=2` (查看模式) 时默认使用 `DescriptionsView` 渲染，不再支持回退到表单只读模式。

### 📝 Documentation

- **Global**: 明确组件库主题变量使用规范，推荐优先使用 `ConfigProvider` 进行主题定制，同时保留 `applyYssTheme` 作为低样式侵入的动态换肤方案。 [`3484adf`](https://github.com/yss-ui/yss-ui/commit/3484adf)

---

## v1.1.37
`2026-01-21`

### 🐞 Bug Fixes

- **Table**: 修复操作列按钮 `isConfirm: true` 配合 `disabledFn` 时，按钮置灰但仍能触发确认弹窗的问题。现在 `Popconfirm` 会正确响应禁用状态。
- **Formily**: 修复 `SlotRenderer` (Slot 渲染器) 的 TypeScript 类型错误，兼容 `Field`、`VoidField` 和 `Ref<GeneralField>` 等多种字段类型。

### ✨ Features

- **Table**: 优化操作列「更多」图标交互体验。使用 `MoreOutlined` 图标替代文本省略号，新增 hover 背景反馈和过渡动画。
- **Card**: 为 `.ant-card-body` 添加 `display: flex; flex-direction: column; height: 100%` 默认样式，支持内容区域弹性布局。
- **Formily**: `SlotRenderer` 默认传递 `value` 和 `onChange` 参数，无需在 schema 中显式配置 `params`，简化自定义插槽用法。

### 📝 Documentation

- **Formily**: 新增「自定义插槽 (Slot)」章节，完善编辑模式与查看模式的插槽命名规则说明。 [`fe5dc58`](https://github.com/yss-ui/yss-ui/commit/fe5dc58)

---

## v1.1.36
`2026-01-19`

### ✨ Features

- **Monaco**: 全新 UI 视觉升级。默认支持圆角 (`6px`) 与聚焦高亮动画，提升编辑体验。
- **Monaco**: 优化深色模式 (`vs-dark`) 下的边框与交互样式适配。
- **Monaco**: 重构拖拽缩放手柄 (Resize Handle)，增大交互热区并添加 Hover 视觉反馈。
- **SplitPane**: 全面性能优化，解决大数据量 DOM 场景下的卡顿问题。

### 🐞 Bug Fixes

- **Monaco**: 修复代码提示框 (Suggestion Widget) 被容器遮挡的问题 (默认开启 `fixedOverflowWidgets`)。
- **Table**: 增强数据安全性。修复数据对象无原型 (如 `Object.create(null)`) 时导致的 `hasOwnProperty` 报错问题。

### 🔨 Refactoring

- **SplitPane**: 重构为模块化架构 (constant.ts + hooks)，代码从 171 行精简到 142 行，提升可维护性。
- **SplitPane**: 使用 `requestAnimationFrame` 优化拖拽渲染，消除高频 Layout 重排。
- **SplitPane**: 新增布局缓存机制 (`useLayoutCache`)，避免频繁调用 `getBoundingClientRect()`。
- **SplitPane**: 优化 `localStorage` 写入策略，从高频写入改为拖拽结束时一次性保存。 [`b6e6289`](https://github.com/yss-ui/yss-ui/commit/b6e6289)

---

## v1.1.35

`2026-01-19`

### ✨ Features

- **YMonacoDiff**: 全面升级差异对比引擎，移除 Worker 依赖，改用主线程 Diff 算法，彻底解决内网环境加载问题。
- **YMonacoDiff**: 默认启用增强的高对比度视觉效果（移除 `enhanceDiff` 配置），并自动适配深色模式 (`vs-dark`)。
- **YMonacoDiff**: 引入 Diff 计算防抖 (`debounce 200ms`) 机制，显著优化大文件编辑时的性能体验。

### 🐞 Bug Fixes

- **YMonacoDiff**: 修复深色模式下 Diff 高亮背景色过浅的问题，现已支持自动切换为半透明高对比度配色。 [`c3b45dd`](https://github.com/yss-ui/yss-ui/commit/c3b45dd)


---

## v1.1.34
`2026-01-15`

### ✨ Features

- **Formily**: 组件标准名重构为 `YFormily`，同时保留 `YssFormily` 作为命名导出及全局别名，确保 100% 向下兼容。
- **Tree**: 优化事件传递机制。禁用 `inheritAttrs` 并过滤 `$attrs` 中的 `onSelect`，避免 AntDV Tree 重复触发选择事件，解决事件冒泡导致的逻辑异常。
- **Tree**: 完善 `select` 事件透传，确保外部能接收到完整的选中信息（keys, info）。

### 🐞 Bug Fixes
- **Monaco**: 为 `YMonaco` 和 `YMonacoDiff` 组件显式添加 `name` 选项，解决部分场景（如 KeepAlive）下的组件名称识别问题。 [`35f3059`](https://github.com/yss-ui/yss-ui/commit/35f3059)

---

## v1.1.33
`2026-01-14`

### ✨ Features

- **Table**: 默认开启行悬浮高亮 (`isHover`) 和当前行选中高亮 (`isCurrent`)，提升表格交互体验。可通过 `row-config` 显式关闭。
- **Table**: 增强插槽名称解析逻辑，新增对 `[field]-header` 和 `[field]-filter` 格式的支持（保留字段名原大小写），解决列字段含下划线（如 `user_name`）时插槽无法匹配的问题。

### 📝 Documentation

- **Table**: 更新 `rowConfig` 文档，补充默认开启的高亮配置说明。
- **Table**: 更新本地筛选（Filter Local）示例，演示字段名包含下划线时的正确插槽用法。 [`56d7a24`](https://github.com/yss-ui/yss-ui/commit/56d7a24)

---

## v1.1.32
`2026-01-13`

### ✨ Features

- **Table**: 升级 vxe-table 至 `4.17.41`，支持新的虚拟滚动 API `virtual-x-config` 和 `virtual-y-config`。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)
- **Table**: 新增**智能虚拟滚动**默认配置，超过 200 行或 50 列时自动启用虚拟滚动，无需手动配置。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)

### 🐞 Bug Fixes

- **YCron**: 修复边界值（如 0、1）的 InputNumber 组件样式问题，统一设置为 `size="small"`。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)
- **YCron**: 修复 `watch` 监听问题，优化表达式解析与双向绑定逻辑。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)
- **Table**: 修复操作列按钮（ActionButton）loading 状态下布局错位问题。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)

### 🔨 Refactoring

- **Table**: 移除模板中冗余的显式绑定（span-method、expand-config、checkbox-config、radio-config），统一通过 `v-bind` 透传。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)

### 📝 Documentation

- **Table**: 重构 Props 文档，分为「YTable 特有属性」和「继承自 vxe-table（有默认值覆盖）」两部分，移除冗余的 vxe-table 原生属性说明。[`b7e293e`](https://github.com/yss-ui/yss-ui/commit/b7e293e)
- **Table**: 新增智能虚拟滚动配置说明（`virtualXConfig`、`virtualYConfig`）。

---

## v1.1.31
`2026-01-12`

### ✨ Features

- **YCron**: 新增 Cron 表达式组件 (`YCron`)，支持 秒/分/时/天/月/年 六个维度的可视化配置。
- **YCron**: 采用左右分栏布局设计，解决小屏/抽屉场景下显示不全的问题。
- **YCron**: 支持 `v-model` 双向绑定、Ant Design Vue 主题色跟随、交互动画等特性。
- **YCron**: 提供 `useCronState` 核心 Hook，支持 Cron 表达式的实时解析与生成。

### 📝 Documentation

- **YCron**: 新增组件文档及 Demo 示例（基础用法、下拉面板用法）。 [`2c0b070`](https://github.com/yss-ui/yss-ui/commit/2c0b070)

---

## v1.1.30
`2026-01-10`

### ✨ Features

- **ConditionBuilder**: 新增 `validate` 事件支持。当条件发生变化时自动触发校验，并对外透传校验结果（true/false），便于父组件实时感知表单状态。[`208c627`](https://github.com/yss-ui/yss-ui/commit/208c627)
- **ConditionBuilder**: 优化新增条件的默认逻辑。现在会优先使用配置的 `operatorOptions` 中的第一个操作符作为默认值，而非硬编码的 `=`。[`208c627`](https://github.com/yss-ui/yss-ui/commit/208c627)

### 🐞 Bug Fixes

- **ConditionBuilder**: 修复多层嵌套时的样式问题。调整根节点与子节点的连接线位置及逻辑操作符按钮（AND/OR）的布局，解决遮挡和错位问题。[`208c627`](https://github.com/yss-ui/yss-ui/commit/208c627)
- **ConditionBuilder**: 修复校验逻辑透传问题。确保 `validate` 方法能正确递归校验所有子分组，并准确返回整体校验结果。[`208c627`](https://github.com/yss-ui/yss-ui/commit/208c627)

### 📝 Documentation

- **ConditionBuilder**: 更新校验示例（Validation Demo），展示如何监听 `validate` 事件及手动触发校验。
---


## v1.1.29
`2026-01-09`

### 🐞 Bug Fixes

- **Monaco**: 修复 Monaco Editor 全屏模式被 Drawer/Modal 遮挡的问题。新增 `fullscreenZIndex` 属性，并将默认值提升至 `10000`，确保覆盖绝大多数业务弹窗。[`ba69f80`](https://github.com/yss-ui/yss-ui/commit/ba69f80)
- **Table**: 修复操作列按钮（ActionButton）中的气泡确认框在 loading 状态下按钮布局错乱的问题。
- **Formily**: 修复分组标题（GroupHeader）过长时被截断的问题，优化样式以确保标题完整显示。

---

## v1.1.28
`2026-01-08`

### ✨ Features

- **Formily**: 导出 `ISchema` 等核心类型定义，优化 TypeScript 类型提示体验。[`38c86b1`](https://github.com/yss-ui/yss-ui/commit/38c86b1)
- **Formily**: 全面升级 Demo 示例，增加标准化类型注解，提升开发参考价值。[`24d484c`](https://github.com/yss-ui/yss-ui/commit/24d484c)

### 💅 Style

- **Table**: 优化表格样式，调整表头背景色为 `#11192a`，内容背景色为 `#323847`，提升视觉体验。[`38c86b1`](https://github.com/yss-ui/yss-ui/commit/38c86b1)
- **EditTable**: 优化编辑表格样式，同步表头与内容背景色风格。[`38c86b1`](https://github.com/yss-ui/yss-ui/commit/38c86b1)

---

## v1.1.27
`2026-01-06`

### ✨ Features

- **ConditionBuilder**: 新增 `strictMode` 属性，支持控制校验模式。设置为 `false` 时允许字段为空，不进行强制校验（默认为 `true`）。[`6f08d5c`](https://github.com/yss-ui/yss-ui/commit/6f08d5c)
- **ConditionBuilder**: 实现实时校验功能，字段值变化时自动触发校验，优化用户体验。[`6f08d5c`](https://github.com/yss-ui/yss-ui/commit/6f08d5c)
- **Formily**: 新增 `v-model` 双向绑定支持，表单值变化时自动同步，支持外部控制表单值。[`6f08d5c`](https://github.com/yss-ui/yss-ui/commit/6f08d5c)

### 🐞 Bug Fixes

- **ConditionBuilder**: 修复操作符和值字段的校验逻辑，确保值为空时正确展示错误状态。[`6f08d5c`](https://github.com/yss-ui/yss-ui/commit/6f08d5c)
- **Formily**: 移除错误的 `defineExpose` 导入，修复组件内部命名冲突。[`6f08d5c`](https://github.com/yss-ui/yss-ui/commit/6f08d5c)

### 📝 Documentation

- **ConditionBuilder**: 新增 `validation-custom` demo，展示 `strictMode` 为 `false` 时的松散校验模式。
- **ConditionBuilder**: 更新 API 文档，补充 `strictMode` 属性的详细说明。
- **Formily**: 更新分组表单示例，展示 `v-model` 双向绑定的使用方法。

---

## v1.1.24
`2025-12-29`

### ✨ Features

- **Monaco**: Worker 加载方式全面优化，使用 Blob Worker 动态导入，**无需任何配置**即可在内网环境使用，所有项目自动支持本地加载。

### 🐞 Bug Fixes

- **Monaco**: 修复 Monaco Editor Worker 在组件库打包时的路径解析问题，彻底解决消费者项目构建失败的问题。[`8656aa4`](https://github.com/yss-ui/yss-ui/commit/8656aa4)

### 🔨 Refactoring

- **Monaco**: 移除 CDN 依赖，使用 Blob + 动态 import 方式创建 Worker，无需消费者项目配置即可在内网环境使用。
- **Code Quality**: 清理代码中的调试 `console` 语句，提升生产环境代码质量。

### 💥 Breaking Changes

- **Monaco**: 默认不再使用 CDN 加载 Worker，统一使用本地加载。如有特殊需求使用 CDN，请参考文档自定义配置。

---

## v1.1.23
`2025-12-26`

### ✨ Features

- **Monaco**: 新增 `MonacoEnvironment.getWorker` 配置，支持 JSON/TypeScript/CSS/HTML 等语言的 Worker 加载，解决 JSON 语法验证报错问题。[`23359bc`](https://github.com/yss-ui/yss-ui/commit/23359bc53f7c2dedc0d1557299170f653ee392b5)

---

## v1.1.22
`2025-12-26`

### ✨ Features

- **Tree**: 新增 `loading` 和 `loadingTip` 属性，支持整棵树的加载状态显示。[`3ca16a1f`](https://github.com/yss-ui/yss-ui/commit/3ca16a1f3c2ffcb13d2e834771cefb4981a7205c)
- **Tree**: 新增 `selectOnActionClick` 配置项，控制点击"更多"按钮时是否自动选中当前节点（默认 `true`）。
- **Tree**: 添加内部 `selectedKeys` 状态管理，支持非受控模式下的节点选中。

### 🐞 Bug Fixes

- **Tree**: 修复更多图标在选中节点时一直显示的问题，改为仅悬浮时显示。[`3ca16a1f`](https://github.com/yss-ui/yss-ui/commit/3ca16a1f3c2ffcb13d2e834771cefb4981a7205c)
- **Monaco**: 修复初始内容为空时输入无 SQL 代码提示的问题，重构补全逻辑为运行时从 Monaco 动态加载关键词，无需手动维护。[`f81e3b1f`](https://github.com/yss-ui/yss-ui/commit/f81e3b1f2a07eed801831edee19cf0b4574bebe4)

### 📝 Documentation

- **Tree**: 更新 API 文档，补充 `loading`、`loadingTip`、`selectOnActionClick`、`selectedKeys` 等属性说明。

---

## v1.1.21
`2025-12-25`

### 🐞 Bug Fixes

- **EditTable**: 修复 Select 下拉框搜索 label 不生效的问题，设置 `optionFilterProp: 'label'` 使搜索按 label 过滤。[`dd34b6fb`](https://github.com/yss-ui/yss-ui/commit/dd34b6fbf42f68d298557b855215ad0bf004998a)

### 💅 Style

- **EditTable**: 隐藏 vxe-table 内置的校验错误提示气泡（使用自定义校验样式）。[`dd34b6fb`](https://github.com/yss-ui/yss-ui/commit/dd34b6fbf42f68d298557b855215ad0bf004998a)

---

## v1.1.20
`2025-12-22`

### ✨ Features

- **EditTable**: 新增行级编辑保存 demo，展示完整的编辑/保存/取消流程。

### 🐞 Bug Fixes

- **EditTable**: 修复 `editRules` 必填校验逻辑 bug，现在正确识别 `required: false` 配置。

---

## v1.1.19
`2025-12-17`

### ✨ Features

- **Table**: 优化远程筛选 demo，重构为模块化结构（constant.ts + hooks/useTableData.ts），增强真实后端场景示例。[`6f6934a`](https://github.com/yss-ui/yss-ui/commit/6f6934a20c91bf433776c841ec5a6bb847e6c6a2)

### 🐞 Bug Fixes

- **Table**: 修复 VxeUI 插件安装警告，移除不必要的 `app.use(VxeUI)` 调用。
- **Table**: 修复 `row-config.height` 废弃警告，全局迁移至 `cell-config.height`（符合 vxe-table v4 规范）。
- **Table**: 修复 `getColgroupProps` 中 `children` 属性泄漏导致的 Vue 警告。
- **Table**: 为启用 storage 的列添加 `field` 属性，解决 vxe-table storage 警告。

### 📝 Documentation

- **Table**: 更新 API 文档，明确 `rowConfig` 和 `cellConfig` 职责分离。
- **Table**: 增强 `customConfig.storage` 使用说明，添加 field 属性要求的注意事项。
- **Table**: 完善 `filterMethod` 使用说明，区分本地筛选和远程筛选场景。

---

## v1.1.18
`2025-12-11`

### ✨ Features

- **FormDescriptionsView**: 新增对 `TreeSelect` 和 `Cascader` 组件的预览支持，支持自动解析 `treeData`/`options` 并显示对应标签。[`88eec41`](https://github.com/yss-ui/yss-ui/commit/88eec417f163b55bf3aff328b8bb74027a4bbfaf)



## v1.1.17
`2025-12-11`

### 🐞 Bug Fixes
*   🐛 **Table**: 修复表格 `columns` 与后端字段不一致时表格不渲染的问题。[`18f6c6c`](https://github.com/yss-ui/yss-ui/commit/18f6c6c3e89a1ff347a6cb3e828432d8937fc59b)

---

## 2025-12

### ✨ Features
*   🌟 **ConditionBuilder**: 新增 `disabled` 属性支持禁用整个条件构建器。[`51568d1`](https://github.com/yss-ui/yss-ui/commit/51568d1)
*   🌟 **SplitPane**: 增强分割面板控制能力，优化 Echarts 示例。[`516330d`](https://github.com/yss-ui/yss-ui/commit/516330d)
*   🌟 **Tree**: 新增 `y-tree` 组件，支持搜索、动画、自定义字段名等功能。[`14a5135`](https://github.com/yss-ui/yss-ui/commit/14a5135)
*   🌟 **Card**: 新增 `y-card` 卡片组件及相关文档和示例。[`10df2eb`](https://github.com/yss-ui/yss-ui/commit/10df2eb)

### 🐞 Bug Fixes
*   🐛 **Tree**: 解决 `y-tree` 传递 `fieldNames` 不生效的问题。[`a5f02aa`](https://github.com/yss-ui/yss-ui/commit/a5f02aa)
*   🐛 **ConditionBuilder**: 移除无用样式，修改操作符默认值。[`eb19846`](https://github.com/yss-ui/yss-ui/commit/eb19846)
*   🐛 **ConditionBuilder**: 组件下拉默认改为展示 `label` 而非 `value`。[`590399a`](https://github.com/yss-ui/yss-ui/commit/590399a)
*   🐛 **ConditionBuilder**: 修复表达式添加多项后继续添加删除导致数据被清空的问题。[`df10954`](https://github.com/yss-ui/yss-ui/commit/df10954)

### 🛠 Refactoring
*   ♻️ **Tree & SplitPane**: 增加动画交互体验，梳理 demo 应用场景。[`d7fe6c5`](https://github.com/yss-ui/yss-ui/commit/d7fe6c5)

---

## 2025-11

### ✨ Features
*   🌟 **ConditionBuilder**: 新增 `conditionBuilder` 表达式组件。[`761fde9`](https://github.com/yss-ui/yss-ui/commit/761fde9)
*   🌟 **Table**: 支持 `vxe-colgroup` 分组列功能及 `group-header` 插槽。[`0923506`](https://github.com/yss-ui/yss-ui/commit/0923506)
*   🌟 **EditTable**: 新增 `vxe-colgroup` 支持和分组表头插槽。[`7203973`](https://github.com/yss-ui/yss-ui/commit/7203973)
*   🌟 **Monaco**: 新增 `y-monaco` 代码编辑器组件。[`c69a026`](https://github.com/yss-ui/yss-ui/commit/c69a026)

### 🐞 Bug Fixes
*   🐛 **Table**: 修复分组列配置属性丢失问题。[`eedc7ed`](https://github.com/yss-ui/yss-ui/commit/eedc7ed)
*   🐛 **Table**: 修复 `vxe-colgroup` 对齐属性传递问题（使分组表头能够居中）。[`97d9192`](https://github.com/yss-ui/yss-ui/commit/97d9192)
*   🐛 **Table**: 兼容 vxe-table props 所有类型。[`78cad89`](https://github.com/yss-ui/yss-ui/commit/78cad89)
*   🐛 **Table**: 透传 vxe-table props 属性。[`29c2efc`](https://github.com/yss-ui/yss-ui/commit/29c2efc)
*   🐛 **Table**: 引入 Vue 的 `toRaw` 方法，在调用 `structuredClone` 之前将响应式对象转换为原始对象。[`d24490b`](https://github.com/yss-ui/yss-ui/commit/d24490b)
*   🐛 **ConditionBuilder**: 修复递归层级添加删除时关系线展示问题。[`2bf32e7`](https://github.com/yss-ui/yss-ui/commit/2bf32e7)
*   🐛 **Monaco**: 增强 YAML 等格式颜色高亮支持。[`5e4f014`](https://github.com/yss-ui/yss-ui/commit/5e4f014)

### 💅 Style
*   💅 **Card**: 修复响应式样式。[`729ef2c`](https://github.com/yss-ui/yss-ui/commit/729ef2c)
*   💅 **Table**: Column-custom-search demo 筛选面板内容省略 tooltip 展示。[`fb6e7fa`](https://github.com/yss-ui/yss-ui/commit/fb6e7fa)

---

## 2025-09 ~ 2025-10

### 🎉 First Release

---
