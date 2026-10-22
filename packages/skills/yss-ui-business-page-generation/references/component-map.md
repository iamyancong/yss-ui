# YSS UI 组件来源速查

此文件用于业务页面生成前的组件选型。优先使用 YSS UI 已封装组件；未封装能力再从 `ant-design-vue` 导入。

## 从 `@yss-ui/components` 导入

| 组件 | 适用场景 | 备注 |
| --- | --- | --- |
| `YButton` | 操作按钮、权限按钮 | 支持 `permissionCode`、`fallback`、`modifiers`；优先替代 `a-button`。 |
| `YCard` | 页面容器、区域容器 | 支持 `title`、`extra`、`padding`、Meta 插槽。 |
| `YTable` | 标准列表、分页、操作列、筛选、字典翻译 | 继承 vxe-table 能力，分页用 AntDV Pagination。 |
| `YEditTable` | 可编辑表格 | 需要底部添加按钮高度时配合 `useTableHeight(tableAreaRef, { withAddButton: true })`。 |
| `YTree` | 左侧分类树、组织树、搜索过滤树 | 节点操作用 `getNodeActions`。 |
| `YSplitPane` | 左树右表、可拖拽分割布局 | 左右或上下区域分割。 |
| `YFormily` | JSON Schema 表单、新增/编辑/查看 | 默认表单方案。 |
| `YssFormily` | 表单兼容导出 | 仅用于维护历史代码；新代码统一使用 `YFormily`。 |
| `YConditionBuilder` | 条件构建器、规则配置 | 常用于数据质量、筛选条件配置。 |
| `YFileImport` | 文件导入 | Formily schema 内也可用 `YFileImport`。 |
| `YFilePreview` / `YFilePreviewModal` / `useFilePreview` | 文件预览（docx、xlsx、xls、pdf、txt、csv、md、常见图片；xlsx 图表 / 图片 / 形状 / 批注等由组件叠加显示；pptx 为实验性 opt-in，默认不启用） | 只从子路径 `@yss-ui/components/file-preview` 导入；仅当用户要预览 `.pptx` 时才 `pnpm add @aiden0z/pptx-renderer@1.4.0` 并在 `main.ts` 调用一次 `registerPptxRenderer()`（从 `@yss-ui/components/file-preview/pptx` 导入，不要直接导入 `@aiden0z/pptx-renderer`）；旧版 `.ppt` / `.doc` 由后端转 PDF，`fileType: 'pdf'`；附件列表、上传前预览优先用 `useFilePreview().openList()`；它返回 `FilePreviewController`（`update` 删除当前文件、`await afterClose` 刷新列表）；标题栏业务按钮用 `slots.actions`（参数 `FilePreviewContext`），下载权限 / 留痕用 `customDownload`；多文件标题自带文件切换下拉（`fileSwitcher`，传 `fileSize` 显示大小），循环翻页用 `loop: true`；`useFilePreview()` 在 `setup` 中调用，弹窗继承调用位置的主题、语言与 provide。Excel 图表按需加载 echarts，未安装时显示占位；不要在前端引入公式计算引擎。 |
| `YMonaco` | 代码编辑器 | SQL、JSON、脚本编辑。 |
| `YMonacoDiff` | 代码 Diff | 变更对比场景。 |
| `YCron` | Cron 表达式编辑 | 定时任务配置。 |
| `YMonthCalendar` | 月度日历、节假日和连续区间 | 支持单元格、右键菜单和头部插槽。 |
| `YEcharts` | 图表展示 | 业务图表封装。 |
| `YSheet` | 协同/类 Excel 表格 | 复杂表格编辑。 |
| `AuthorityDropdown` | 权限相关下拉 | 可从 `@yss-ui/components` 导入；全局安装后也注册了 `YDropdown` 组件名别名。 |

## 回退到 `ant-design-vue`

`@yss-ui/components` 未导出的组件不要臆造 Y 前缀，应直接从 `ant-design-vue` 导入：

- `Modal`、`Drawer`、`Popconfirm`
- `Input`、`Select`、`Switch`、`DatePicker`、`Tag`
- `Steps`、`Tabs`、`Space`、`Tooltip`
- `message`、`notification`

## 禁止规则

- 不要编造未导出的 Y 前缀组件；弹窗、抽屉、输入框等未封装能力直接从 `ant-design-vue` 导入。
- 业务层不要从 `@formily/antdv` 导入 `FormItem`、`Input` 等 UI 适配组件。
