# YSS UI 业务开发规则

本项目使用 YSS UI 业务页面开发规范。处理 Vue3 业务页面、CRUD、列表、表单、抽屉、YTable、YEditTable、YFormily、YTree、API 对接任务时，必须先读取匹配的 SKILL.md，再写计划或代码。

## 先查 MCP 与禁止猜 API

- **先查 MCP**：编写 YSS UI 相关代码前，先通过 yss-ui MCP 的 `get_codegen_rules`、`get_component_docs`、`get_component_schema`、`get_consumption_contract` 核对；MCP 不可用时阅读对应 Skill。
- **禁止猜 API**：Props、事件、插槽、暴露方法、Orval 导出名必须以 MCP 文档、Schema 或真实生成文件为准。

## 任务 → 必读 Skill

1. 页面/CRUD/列表/表单任务：先读 `{{skillRoot}}/yss-ui-business-page-generation/SKILL.md`。
2. 新增或修改页面、组件、Less、内联样式、TS 渲染配置、SVG 色值：必须读 `{{skillRoot}}/theme-token-usage/SKILL.md`。
3. 导出、报表、模板、附件、Excel、CSV、PDF、ZIP、Blob 下载任务：必须读 `{{skillRoot}}/file-export-download/SKILL.md`。
4. 列表或表格任务：同时读 `{{skillRoot}}/page-list-module/SKILL.md`、`{{skillRoot}}/ytable-usage/SKILL.md`、`{{skillRoot}}/use-table-height/SKILL.md`。
5. 新增/编辑/查看/抽屉表单：同时读 `{{skillRoot}}/yss-formily/SKILL.md`、`{{skillRoot}}/page-form-module/SKILL.md`。
6. 可编辑表格、扩展属性、添加行/删除行：必须读 `{{skillRoot}}/yedit-table-usage/SKILL.md`。
7. 用户给原型截图或旧项目路径：必须读 `{{skillRoot}}/prototype-page-acceptance/SKILL.md`，先生成验收清单，再实现。

## Hard Stops 摘要

- 禁止使用 YTable 不存在的 `request`、`search-params` Props 和 `actionConfig.actions`；实例 `refresh()` 只刷新当前表格数据，不得当作远程重新查询。
- 可编辑表格必须优先使用 `YEditTable`，禁止用 `a-table` 手搓。
- 禁止在业务代码中直接导入样式文件（如 `import './style.less'`），统一使用 scoped style 块。
- 页面和组件禁止硬编码品牌色及 hover/active/selected/focus 色阶；主色透明态必须从真实动态 Token 派生。
- 导出下载必须优先调用 `handleBlobResponse(res.data, res.headers)`；生成方法缺少 Blob 配置时第二参数必须传 `{ responseType: 'blob' }`。
- 接口返回的 number 字段（id/主键/金额/数量等）一律按字符串透传，禁止 Number()/parseInt/+x 等任何数字转换。

完整 Hard Stops 与详细代码生成规则：调用 MCP `get_codegen_rules`。
