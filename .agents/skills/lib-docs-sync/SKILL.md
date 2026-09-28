---
name: lib-docs-sync
description: 指导在 yss-ui 修改或新增组件、Hook 与工具后，同步 Dumi 文档、Demo 示例、更新日志及 Skills 文档的完整流程与门禁验证。
---

# 文档与更新日志同步

## 触发条件

- 修改了组件、Hook 或工具函数的公开 API（Props、Emits、Slots、Expose 方法或入参/返回值类型）。
- 新增组件、Hook 或工具函数，需要为其创建配套的 Dumi 文档与 Demo 示例。
- 编写或更新版本更新日志（包含综合日志 `docs/changelog.md` 与分包日志）。
- 新增或调整了 `packages/skills/` 源码，需要同步更新到 `docs/skills/`。

## 不适用场景

- 只修改组件或 Hook 内部实现，不涉及任何公开 API、用户行为或导出变更。
- 纯 CI 流水线脚本或本地构建配置微调，且发布脚本确认无任何待发包。
- 业务微应用内的普通业务页面说明文档。

## 硬约束（禁止/必须）

- **文档 Frontmatter 配置（强制）**：
  - 所有组件、Hook 文档以及更新日志的 Markdown frontmatter **必须包含 `toc: content`**。
  - 缺少 `toc: content` 会导致二三级标题被错误渲染到左侧全局导航中，破坏目录结构。
- **Hooks 文档与 Demo 目录规范（Critical）**：
  - `docs/hooks/demos/` 目录下**必须**为每个 Hook 创建独立的子文件夹，子文件夹使用 Hook 名称的 **camelCase** 命名（如 `demos/useFullscreen/`）。
  - **严禁**将 Demo 文件直接平铺在 `demos/` 根目录。
  - Demo 文件必须使用 **kebab-case** 命名（例如 `use-fullscreen-basic.vue`）；Demo 内的 Vue 组件命名必须使用 **PascalCase**（例如 `UseFullscreenBasicDemo`）。
- **Demo 代码编写规范（Critical）**：
  - Demo 中使用 Ant Design Vue 组件时，**必须显式导入并创建别名**（例如：`import { Button } from 'ant-design-vue'; const AButton = Button;`），在模板中使用 `<a-button>`。
  - 未显式导入或未创建别名会导致组件在 Dumi 页面预览中静默丢失或白屏。
  - 优先从 `@yss-ui/components` 导入封装组件；未封装能力或需演示底层特性时方可直接引用 Ant Design Vue。
- **组件文档表格要求**：
  - 组件文档必须清晰列出 **Props**、**Events**、**Slots** 以及 **Methods**（如有）参数表格，表格内容必须与组件 `types.ts` 定义的类型和默认值保持严格一致，禁止杜撰。
- **更新日志格式与生成规范（Critical）**：
  - 综合更新日志为 `docs/changelog.md`，分包日志对应 `docs/changelog/components.md`、`hooks.md`、`utils.md`、`skills.md`、`mcp.md`。
  - 在 `docs/changelog.md` 中，所有更新条目**必须使用标准包名标签**：
    - 组件库：`- **[@yss-ui/components] ComponentName**: 说明`
    - Hooks 库：`- **[@yss-ui/hooks] useXxx**: 说明`
    - 工具库：`- **[@yss-ui/utils] utilName**: 说明`
    - 标签后必须保留一个空格，且必须置于双星号 `**` 内部。
  - 分包日志通过命令自动生成：
    ```bash
    pnpm generate:changelog
    ```
    **禁止手动修改**会被该脚本覆盖的分包日志（`components.md`、`hooks.md`、`utils.md`）。
- **Sidebar 导航配置**：
  - 新增组件或 Hook 必须在 `.dumirc.ts` 的 `sidebar` 中对应分组注册路由。
  - 分组必须遵循项目已有约定：
    - Hooks 分组：`Hooks 介绍`、`DOM`、`状态管理`、`副作用`、`浏览器`。
    - Components 分组：`通用组件`、`表单组件`、`表格组件`、`图表组件`、`业务组件`。
- **Skills 文档同步**：
  - 修改 `packages/skills/` 后，必须执行：
    ```bash
    pnpm sync:skills-docs
    ```
    并检查 `docs/skills/index.md` 是否已正确建立索引链接。
- **验证命令**：
  - 文档、Demo 与日志同步完成后，必须执行：
    ```bash
    pnpm validate:docs && pnpm build:docs:check
    ```

## 标准代码骨架

### 1. Hook 文档骨架 (`docs/hooks/useExample.md`)

```markdown
---
title: useExample
description: 简要描述该 Hook 的核心能力与使用场景
toc: content
---

# useExample

用于管理...状态的组合式函数。

## 代码演示

### 基础用法

最简用法演示。

<code src="./demos/useExample/use-example-basic.vue"></code>

## API

```typescript
const { state, toggle } = useExample(options);
```

### Params

| 参数 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| initialValue | 初始状态值 | `boolean` | `false` |

### Return

| 属性 | 说明 | 类型 |
| --- | --- | --- |
| state | 当前状态响应式引用 | `Ref<boolean>` |
| toggle | 切换状态方法 | `() => void` |

## 类型定义

```typescript
export interface UseExampleOptions {
  initialValue?: boolean;
}
```
```

---

### 2. Demo 代码骨架 (`docs/hooks/demos/useExample/use-example-basic.vue`)

```vue
<script setup lang="ts">
import { useExample } from '@yss-ui/hooks';
import { Button, Space } from 'ant-design-vue';

defineOptions({ name: 'UseExampleBasicDemo' });

// 关键：显式导入 AntDV 并创建别名
const AButton = Button;
const ASpace = Space;

const { state, toggle } = useExample({ initialValue: false });
</script>

<template>
  <div class="demo-box">
    <a-space>
      <span>当前状态: {{ state ? '开启' : '关闭' }}</span>
      <a-button type="primary" @click="toggle">切换状态</a-button>
    </a-space>
  </div>
</template>

<style scoped lang="less">
.demo-box {
  padding: 16px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}
</style>
```

---

### 3. 组件文档表格骨架 (`docs/components/example.md`)

```markdown
---
title: Example 组件
description: 组件的定位与能力说明
toc: content
---

# Example

## API

### YExample Props

| 属性 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| modelValue | 当前绑定值 | `string` | `''` |
| disabled | 是否禁用 | `boolean` | `false` |

### YExample Events

| 事件名 | 说明 | 回调参数 |
| --- | --- | --- |
| update:modelValue | 绑定值变化时触发 | `(value: string) => void` |
| change | 输入确认或失去焦点触发 | `(value: string) => void` |

### YExample Slots

| 插槽名 | 说明 | 参数 |
| --- | --- | --- |
| prefix | 自定义前缀插槽 | `-` |
```

---

### 4. 综合更新日志规范 (`docs/changelog.md`)

```markdown
---
title: 更新日志
nav:
  title: 更新日志
  path: /changelog
toc: content
---

# 更新日志

## v1.2.0
`2026-09-28`

### ✨ Features

- **[@yss-ui/components] YExample**: 新增 Example 组件基础能力支持
- **[@yss-ui/hooks] useExample**: 新增状态切换 Hook

### 🐞 Bug Fixes

- **[@yss-ui/components] YTable**: 修复列宽自适应下的渲染跳动
```

---

### 5. Dumi Sidebar 配置骨架 (`.dumirc.ts`)

```typescript
export default {
  themeConfig: {
    sidebar: {
      '/hooks': [
        {
          title: 'Hooks 介绍',
          children: [{ title: '概览', link: '/hooks' }],
        },
        {
          title: '状态管理',
          children: [{ title: 'useExample', link: '/hooks/use-example' }],
        },
      ],
      '/components': [
        {
          title: '通用组件',
          children: [{ title: 'Example 示例', link: '/components/example' }],
        },
      ],
    },
  },
};
```

## 交付检查清单

- [ ] 所有新创建或修改的 Markdown 文档 frontmatter 均包含 `toc: content`。
- [ ] Hook Demo 放置在 `demos/useXxx/` 子目录下，命名为 kebab-case，Vue 组件命名为 PascalCase。
- [ ] Demo 文件中显式导入 AntDV 组件并完成别名赋值（如 `const AButton = Button`）。
- [ ] 组件 API 表格（Props/Events/Slots/Methods）与实际 `types.ts` 完全一致。
- [ ] `.dumirc.ts` 的 `sidebar` 中对应分组已添加新路由配置。
- [ ] `docs/changelog.md` 中更新条目严格使用 `**[@yss-ui/xxx] Name**: 说明` 标签格式。
- [ ] 执行 `pnpm generate:changelog` 成功重新生成分包日志，无手动覆盖破坏。
- [ ] 若改动涉及 `packages/skills/`，执行 `pnpm sync:skills-docs` 且 `docs/skills/index.md` 已同步。
- [ ] 本地验证通过：`pnpm validate:docs && pnpm build:docs:check`。

## 失败兜底策略

- **目录显示错乱（二三级标题跑到了左侧全局导航）**：
  - 检查对应 Markdown 文件头部的 frontmatter，补上 `toc: content` 即可恢复右侧悬浮 TOC。
- **Ant Design 组件未渲染或控制台报未注册组件警告**：
  - 检查 Demo 文件是否忘记导入对应组件，或忘记定义 `const AButton = Button` 别名。
- **`pnpm generate:changelog` 无法正确过滤分包日志**：
  - 检查 `docs/changelog.md` 中对应版本的条目是否遗漏了双星号 `**` 或标签拼写错误，修正标签后重新执行脚本。
- **`pnpm build:docs:check` 构建失败**：
  - 查看构建报错日志定位具体的 Demo 相对路径，检查 Demo 是否存在语法错误、错误的相对路径 import，或类型错误。
