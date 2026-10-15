# AI Skills

欢迎来到 **YSS AI Skills** 文档中心。

## 频道导航

- 业务开发：页面骨架、列表模块、表单模块、API 集成
- Formily 专项：基础能力、联动与分步表单
- 维护能力：组件测试、Skill 开发、文档、提交流程、更新日志与发布

本栏目采用**单一事实源**：`packages/skills/*/SKILL.md` 为唯一维护入口，`docs/skills/*.md` 由脚本自动同步生成，不做手工双写。

`SKILL.md` frontmatter 中的 `description` 为中文摘要，会自动展示在对应 docs 页面标题下方。

## 快速上手 Demo

### 1. 安装 CLI（在业务项目）

```bash
pnpm add -D @yss-ui/skills-cli
```

### 2. 在 `package.json` 添加脚本

```json
{
  "scripts": {
    "sync:skills": "yss-skills sync"
  }
}
```

### 3. 执行同步

```bash
pnpm sync:skills
```

如需同步全部技能（包含组件库维护类, 业务侧无须执行）：

```bash
pnpm sync:skills --all
```

在 yss-ui 源码仓库中，`pnpm sync:skills` 会强制使用当前 `packages/skills`，不会下载已发布旧包覆盖工作树。维护者如需让本机多个 AI IDE 始终跟随当前源码，可执行：

```bash
pnpm sync:skills:ides
```

该命令按 Skill 粒度链接到 Codex、Cursor、Claude、Trae 与通用 Agents 用户目录，只替换 YSS 同名项并保留第三方 Skills。

## 可用技能

### 📱 业务开发 (Application)

- [Create YSS App](./create-yss-app.md)：新建微应用工程首选入口，通过官方脚手架与 CLI 交互在线快速生成。
- [YSS Frontend Dev](./yss-frontend-dev.md)：业务开发总入口与流程编排总线，通过状态识别与有限构件分流调度。
- [YSS Create Microapp](./yss-create-microapp.md)：本地创建微应用，一键生成基于模板的项目骨架。
- [YSS UI Business Page Generation](./yss-ui-business-page-generation.md)：业务页面生成总控，串联组件、Hooks、Utils、表格、树和表单规则。
- [Theme Token Usage](./theme-token-usage.md)：主题 Token、交互态、透明色派生与明暗模式规范。
- [Component Selection Imports](./component-selection-imports.md)：组件选型与导入守门（默认查 `llms-full.txt`）。
- [Page Module Development](./page-module-development.md)：兼容旧项目的页面模块开发入口。
- [Page Skeleton](./page-skeleton.md)：页面骨架与目录结构标准。
- [Page List Module](./page-list-module.md)：列表查询分页与操作模块。
- [Page Form Module](./page-form-module.md)：新增/编辑/查看表单模块。
- [YTable Usage](./ytable-usage.md)：YTable 列配置、分页、操作列和气泡确认规范。
- [YEditTable Usage](./yedit-table-usage.md)：可编辑表格、行内编辑、添加行、下拉可输入/多选和校验规范。
- [YTree Usage](./ytree-usage.md)：YTree 搜索、节点操作、受控选中和树表联动规范。
- [YSheet Usage](./ysheet-usage.md)：YSheet 协同表格、optionalDependencies 与 Univer Preset 子路径规范。
- [YConditionBuilder Usage](./ycondition-builder-usage.md)：条件树、AND/OR、远程字段值和严格校验规范。
- [YFileImport Usage](./yfile-import-usage.md)：文件导入弹窗两步流程、nextStep.onSuccess 与 importResult 规范。
- [Prototype Page Acceptance](./prototype-page-acceptance.md)：按原型截图或老项目还原页面时的验收清单。
- [API Integration](./api-integration.md)：Orval API 集成与类型安全。
- [File Export Download](./file-export-download.md)：Orval Blob 导出、responseType 兜底、响应头文件名和下载处理规范。
- [Vue3 Best Practices](./vue3-best-practices.md)：Vue 3 组合式最佳实践。
- [I18n Locale Management](./i18n-locale-management.md)：国际化多语言字典模块化设计、命名分层与 Vite 自动化装配规范。
- [Use Table Height](./use-table-height.md)：YTable 高度自适配。
- [Use Tree Height](./use-tree-height.md)：YTree 高度自适配。
- [Use Url State](./use-url-state.md)：当前路由 URL query 同步与清理。
- [Use Polling Task](./use-polling-task.md)：页面级静默轮询调度与失效保护。
- [Frontend Commit](./frontend-commit.md)：前端项目规范提交，覆盖原子拆分、commitlint 校验与安全提交。
- [Java Backend Commit](./java-backend-commit.md)：Java 后端项目规范提交，覆盖模块 scope、迁移风险与验证提交。

### 🧩 Formily 专项

- [YssFormily 表单开发](./yss-formily.md)：YssFormily 总入口，覆盖 Schema、mode、联动、详情和分步表单。
- [Formily Foundation](./formily-foundation.md)：基础 schema、提交链路与导入边界。
- [Formily Linkage Effects](./formily-linkage-effects.md)：联动、副作用和失败兜底。
- [Formily Mode Slot Detail](./formily-mode-slot-detail.md)：mode/slot/detail 渲染规则。
- [Formily Step Flow](./formily-step-flow.md)：分步表单默认方案（`Steps + 多 YssFormily`）。

### 🔧 维护类 (Library Maintenance)

- [Component Development](./component-development.md)：组件开发规范。
- [Component Testing](./component-testing.md)：组件与 Hooks 回归测试、浏览器 API mock 和资源清理规范。
- [Skill Development](./skill-development.md)：YSS 官方 Skill 新建、触发评测、同步和安全门禁规范。
- [Documentation](./documentation.md)：文档与 Demo 编写规范。
- [Commit Linting](./commit-linting.md)：组件库提交规范。
- [Changelog Generation](./changelog-generation.md)：更新日志生成规范。
- [Release Management](./release-management.md)：发版管理流程。
- [Release Workflow](./release-workflow.md)：完整发版工作流。
- [Sync Internal Dev](./sync-internal-dev.md)：内网 dev 代码一键同步至 GitHub main 分支规范。

## 命名迁移说明

- `yss-formily` 保留为 Formily 总入口；基础表单细节继续查看 `formily-foundation`
- `yss-formily-linkage-effects` -> `formily-linkage-effects`
- `yss-formily-mode-slot-detail` -> `formily-mode-slot-detail`
- `page-module-development` 保留为旧项目兼容入口；新页面优先查看 `yss-ui-business-page-generation`
- `microapp-commit` 已移除 -> 前端业务仓库提交请使用 `frontend-commit`（Java 后端使用 `java-backend-commit`）

## 说明

- `docs/skills` 页面由 `packages/skills/*/SKILL.md` 自动同步生成。
- 新增或修改技能后，请在组件库仓库执行：`pnpm sync:skills-docs`。
- `packages/skills/*/references/*.md` 当前不会自动生成独立 docs 页面，如需展示详细参考资料，建议后续通过 Markdown 预览组件直接读取 packages 源文件。
