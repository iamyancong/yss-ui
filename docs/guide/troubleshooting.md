---
title: 常见问题排查
toc: content
---

# 常见问题排查

开发过程中常见的问题及解决方案。

## 文档相关

### 文档分类显示在左侧而不是右侧

**原因**：缺少 `toc: content` 配置。

**解决方案**：在文档 frontmatter 中添加 `toc: content`：

```markdown
---
title: useExample
description: 描述
toc: content
---
```

### Ant Design 组件在 Demo 中未渲染

**原因**：Demo 文件中未显式导入组件。

**解决方案**：显式导入 Ant Design Vue 组件并创建别名：

```typescript
import { Button } from 'ant-design-vue';
const AButton = Button;
```

## 组件开发相关

### 组件代码过长难以维护

**原因**：未进行模块化拆分。

**解决方案**：按照 `CONTRIBUTING.md` 组件拆分标准，将超过 150 行的组件拆分为：

- `index.vue` — 主组件（仅组合 hooks 和渲染视图）
- `types.ts` — TypeScript 类型定义
- `constant.ts` — 常量、静态配置
- `style.less` — 独立样式文件
- `hooks/` — 业务逻辑 Composables

### 类型文件命名冲突

**原因**：使用了 `type.ts` 而不是 `types.ts`。

**解决方案**：全库类型文件统一命名为 `types.ts`（禁止使用 `type.ts`）。历史保留的 `type.ts` 仅用于向前兼容转发 `export * from './types'`。

## 构建相关

### Less 变量未注入

**原因**：未正确配置 Less 全局变量注入。

**解决方案**：确认 `vite.config.ts` 中 `preprocessorOptions.less` 配置了 `additionalData` 或 `modifyVars`。样式中使用 `@yss-ui/theme` 提供的 CSS 变量而非硬编码色值。

### 微前端子应用样式隔离问题

**原因**：弹层/下拉组件挂载到子容器被裁剪。

**解决方案**：

1. 弹层统一配置 `getPopupContainer: () => document.body`
2. 样式敏感项目从 `@yss-ui/components/lite` 导入并显式引入 `@yss-ui/components/style.css`

## 发版相关

### changelog 遗漏导致 CI 失败

**原因**：`node scripts/release-changed.js patch --dry` 检测到待发包但未找到目标版本 changelog。

**解决方案**：

1. 运行 `node scripts/release-changed.js patch --dry` 查看待发包列表
2. 为每个待发包在 `docs/changelog/*.md` 中补充目标版本记录
3. Skills 变更必须同时检查 `docs/changelog/skills.md`

### AGENTS.md 行数超限

**原因**：在 AGENTS.md 中堆砌了过多内容。

**解决方案**：AGENTS.md 只保留角色、边界、路由和底线（≤100 行）。超出内容迁移到对应 Skill（`packages/skills/lib-*`）或 `docs/guide/`。
