# @yss-ui/skills

YSS UI 集中式 AI 技能规范包：为 coding agent 提供标准业务骨架、硬约束拦截与最佳实践。

## 为什么需要它

AI 生成 YSS UI 业务页面不准确的根因之一，是模型不知道组件库的最佳实践与业务约束，容易出现：
- 表单编辑态**回显数据丢失**、字段值被意外清空；
- 表格**双滚动条**或高度塌陷、缺少响应式自适应；
- **硬编码品牌色**导致动态换肤与暗色模式失效；
- Orval API 接口调用时**重复弹错**、BigInt 精度丢失；
- 虚构不存在的组件或 Props（如猜测 `request` / `search-params`）。

本包将 YSS UI 经过生产检验的架构规范提炼为 30+ 份标准技能（`SKILL.md`），包含**触发条件、硬约束（禁止/必须）、标准代码骨架、交付检查清单与失败兜底**。AI 工具在生成代码前先阅读规范，确保产出即符合生产要求。

## 三种 AI 集成方式定位

| 方式 | 定位 | 何时使用 |
| --- | --- | --- |
| **Skills 技能规范**（本包） | 把开发规范装进项目，AI 生成代码时按需触发标准骨架与硬约束 | **必装**，所有 AI 辅助开发的业务项目 |
| [@yss-ui/mcp](https://www.npmjs.com/package/@yss-ui/mcp) | 编码时按需精准查询组件真实 API、171+ 官方 Demo 源码 | **推荐搭配**，工具支持 MCP 时启用 |
| `llms-full.txt` | 把文档站全量内容一次性喂给 AI | **兜底**，工具不支持 MCP / 临时会话 |

> **三者协作关系**：`Skills` 管“怎么写才对（规范与模式）”，`MCP` 管“API 到底长什么样（数据与源码）”，`llms-full.txt` 负责离线兜底。

## 技能清单（39 个 Skills）

### 1. 业务页面与骨架
- `yss-ui-business-page-generation`：Vue3 YSS UI 业务页面生成主入口（CRUD、列表、表单、详情、左树右表）；
- `page-skeleton`：列表、表单、详情和弹窗页面模块骨架与模块化拆分（`index.vue`, `constant.ts`, `style.less`, `hooks/`）；
- `prototype-page-acceptance`：根据原型截图或旧项目路径提取验收清单与像素级还原；

### 2. 表格与列表全家桶
- `page-list-module`：标准列表页（查询重置、远程分页、YTable 工具栏、批量操作、左树右表）；
- `ytable-usage`：YTable 组件进阶用法（列配置、操作列、气泡确认、列筛选、字典翻译、行拖拽）；
- `yedit-table-usage`：YEditTable 可编辑表格（行内编辑、添加/删除行、下拉多选、行级候选联动、表头筛选）；
- `use-table-height`：YTable / YEditTable 响应式高度自适应与双滚动条消除。

### 3. 表单与 Formily 全家桶
- `page-form-module`：新增/编辑/查看表单模块（mode 0/1/2、数据回显与回填、弹窗销毁、列表刷新）；
- `yss-formily`：YFormily 表单主入口与核心规范；
- `formily-foundation`：YFormily 基础表单、字段校验、提交链路、查询表单栅格布局；
- `formily-linkage-effects`：字段动态显隐、禁用、级联选项、x-reactions 与表单级副作用；
- `formily-mode-slot-detail`：新增/编辑/查看三态切换、只读态 Descriptions 渲染与自定义插槽；
- `formily-step-flow`：分步表单与复杂流程录入（跨步状态保留、独立校验、最终聚合提交）。

### 4. 树形与高价值业务组件
- `ytree-usage`：YTree 组件用法（字段映射 `fieldNames`、搜索过滤、受控选中、节点操作）；
- `use-tree-height`：YTree 自适应高度与独立滚动计算。
- `ysheet-usage`：YSheet 协同表格（optionalDependencies、`@yss-ui/components/sheet` 子路径、extraPresets）；
- `ycondition-builder-usage`：YConditionBuilder 嵌套 AND/OR 条件树、远程字段值和严格校验。

### 5. API 与数据流
- `api-integration`：Orval API 接口集成（mutator 统一错误契约、加载状态、长整型精度）；
- `file-export-download`：文件导出、报表下载、模板下载与 Blob 流处理（`handleBlobResponse`）；
- `yfile-import-usage`：YFileImport 两步导入弹窗（`nextStep.onSuccess`、`importResult`、loadings）；
- `use-url-state`：当前路由 URL query 读写、history 无感更新与分享链接恢复；
- `use-polling-task`：页面级静默轮询调度（`isCurrent`、`pauseWhenHidden`、动态间隔）。

### 6. 主题与工程规范
- `theme-token-usage`：主题 Token 规范（主色、状态色、透明色派生，严禁硬编码色值）；
- `component-selection-imports`：组件导入与选型边界判定（`@yss-ui/components` vs `ant-design-vue`）；
- `vue3-best-practices`：Vue 3 Composition API 最佳实践（响应式状态、异步竞态、模块拆分）；
- `i18n-locale-management`：国际化多语言字典模块化设计、命名分层与 Vite 自动化装配规范；
- `frontend-commit`：前端工程规范化提交（Conventional Commits）；
- `java-backend-commit`：后端服务规范化提交。

### 7. 组件库维护者技能
- `component-development`：YSS UI 源码组件新增、重构与测试；
- `component-testing`：Vue Test Utils 组件测试、回归复现、浏览器 API mock 与资源清理；
- `skill-development`：YSS 官方 Skill 新建、触发边界、评测、同步与安全门禁；
- `documentation`：Dumi 文档、Demo 编写与 API 表维护；
- `release-management` / `release-workflow`：多包自动化版本管理与 CI 发版；
- `commit-linting` / `changelog-generation`：提交信息门禁与更新日志生成；
- `yss-create-microapp`：Vue3 + TypeScript + qiankun 微前端脚手架；
- `sync-internal-dev`：内网与开源分支同步。

## 如何使用

推荐使用配套 CLI 工具 [@yss-ui/skills-cli](https://www.npmjs.com/package/@yss-ui/skills-cli) 一键将技能规范同步到项目中：

```bash
# 在业务项目根目录下执行
npx -y @yss-ui/skills-cli sync
```

该命令会自动：
1. 下载最新 `@yss-ui/skills` 技能包；
2. 同步业务技能至 `.agents/skills/`；
3. 为 Cursor、Claude Code、Trae 等 IDE 建立按 Skill 粒度的兼容软链接；
4. 自动维护 `.cursorrules` 与 `.agents/rules/yss-ai-skills.md`（内容来自包内 `rules/core.md`）。

## 触发机制与验证

- **自动触发**：当你在 AI 提示词中描述需求（例如：“*生成一个带有查询重置和远程分页的标准列表页*” 或 “*实现一个新增/编辑共用的抽屉表单*”），AI 会根据 `.cursorrules` / `.agents/rules/yss-ai-skills.md`（规则由包内 `rules/core.md` 渲染）自动命中对应 Skill，先读取 `SKILL.md` 再生成代码。
- **显式指定**：也可以在提示词中显式点名（例如：“*请严格按照 page-form-module 的规范实现编辑弹窗*”）。
- **验证生效**：观察 AI 在动笔前是否有读取对应 `SKILL.md` 的记录，且生成的代码严格遵守规范（如：抽离 `constant.ts`、使用 `useTableHeight`、无硬编码色值、无重复 `message.error`）。

## 维护与更新

本包随 YSS UI 组件库统一发版。在 yss-ui 源码仓库中修改 Skills 后，请遵循单一事实源原则：
```bash
pnpm sync:skills-docs   # 同步至文档站
pnpm validate:skills    # 运行结构校验、触发路由评测与安全扫描
```
