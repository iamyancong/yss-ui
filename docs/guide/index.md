---
title: 快速开始
description: YSS UI 快速开始指南
toc: content
---

# 快速开始

YSS UI 是一个基于 Vue 3、Ant Design Vue 与 VXE-Table 的企业级中后台组件库，专为微应用架构设计。

## 频道导航

- 安装与接入：本页 + [安装](/guide/installation)
- 生产发布： [发版工作流](/guide/release-workflow) / [GitLab CI 集成](/guide/gitlab-ci-integration)
- 性能与调优： [大表性能最佳实践手册](/guide/table-perf-handbook)
- 存量系统接入： [JSP 项目接入](/guide/jsp)

## 安装

> **💡 安装说明**
>
> `@yss-ui/*` 系列包均已公开发布至官方公共 **npm 制品库**，可直接使用 npm、pnpm 或 yarn 进行安装。完整配置说明请参阅 👉 **[安装指南](/guide/installation)**。

### 环境要求

- Node.js >= 22.10.0（建议升级到 22.17.1，我们在该版本验证良好）
- Vue >= 3.0.0

### 包管理器

推荐使用 pnpm：

```bash
pnpm add @yss-ui/components
```

或者使用 npm：

```bash
npm install @yss-ui/components
```

## 默认接入：根入口具名导入

Vue 3 微应用与独立项目都默认在页面局部导入，不在 main.ts 全量注册：

<code id="guide-on-demand-import-button" src="./main/Button.vue" ></code>

```ts
import { YCard, YTable, YFormily } from '@yss-ui/components';
```

自 1.6.0 起根入口支持生产 tree-shaking。新的同包官方 Vite 插件（目标版本 1.7.0，支持 Vite 6）进一步处理开发预构建和组件 CSS 关联，详见[统一入口与 Vite 消费契约](/guide/unified-consumption)。当前安装版本未公开 `./vite` 时保留已有适配配置；不要把未发布能力当作 1.6.6/1.6.7 已有能力。

默认安装和动态整包导入仍可用于历史兼容，明确引用全部组件时会保留全量语义。`app.use(YSSUI)` 不是新微应用的默认方案。旧 dist 文件和全量 CSS 路径继续保留，不批量重写旧业务页面。

### 样式策略

- 接入官方插件后，组件 CSS 随实际实现入口加载；官方全量 style.css 导入会转换为公共基础样式。
- 未接入插件时保留项目已有样式策略；全量 CSS 不会因为 JS 具名导入自动消失。
- `lite` 是可选兼容入口，与根入口共享组件和语言状态。它不是微应用必改写法，也不意味着样式完全不会影响宿主。

### 可选公开子路径

| 子路径 | 用途 |
| --- | --- |
| `@yss-ui/components/table` | YTable、YEditTable 和表格类型（1.6.7 起） |
| `@yss-ui/components/formily` | YFormily、YssFormily 和表单类型（1.6.7 起） |
| `@yss-ui/components/monaco` | YMonaco、YMonacoDiff、ensureMonacoCss |
| `@yss-ui/components/echarts` | YEcharts |
| `@yss-ui/components/sheet` | YSheet 和 Univer 深度配置 |

子路径是同一个包的可选入口，不是需要分别安装的功能包，也不会降低默认安装树。Monaco/ECharts/Sheet 保留异步组件策略，最终加载边界以真实页面 JS/CSS 和浏览器请求为准，不承诺固定减重比例。

组件库本地开发使用 `pnpm --filter @yss-ui/components dev`，监听流程依次更新旧产物、统一构建图和消费契约。真实安装验收使用 `pnpm test:consumption`；源码映射、类型检查及浏览器复现命令见统一消费报告。

## 使用 Utils 和 Hooks

```typescript
// 使用工具函数
import { formatDate, formatMoney, downloadBlob } from '@yss-ui/utils';

// 使用 Hooks
import { useTableHeight, useTreeHeight, usePollingTask } from '@yss-ui/hooks';
```

## TypeScript 支持

YSS UI 使用 TypeScript 开发，提供完整的类型定义：

```typescript
import type { ButtonProps, FormProps } from '@yss-ui/components';
```

## 配置

### 国际化与全局配置

推荐使用 `YConfigProvider` 包裹应用根节点进行语言与全局设置：

```vue
<script setup lang="ts">
import { YConfigProvider, zhCN } from '@yss-ui/components';
</script>

<template>
  <YConfigProvider :locale="zhCN">
    <App />
  </YConfigProvider>
</template>
```

### 主题定制

```typescript
import { colors, spacing, typography } from '@yss-ui/theme';

// 使用主题变量
const primaryColor = colors.primary[6];
const basePadding = spacing.md;
```

## 最佳实践

### 1. 组件命名

统一使用 `y-` 前缀避免命名冲突：

<code id="guide-best-practice-naming-button" src="./main/Button.vue" ></code>

### 2. 类型安全

充分利用 TypeScript 类型：

```typescript
import type { YTableProps } from '@yss-ui/components';

const tableProps: YTableProps = {
  data: [],
  columns: [],
  showPagination: true,
};
```

### 3. 主题一致性（避免颜色硬编码）

使用主题变量保持设计一致性：

<code src="./main/ButtonTheme.vue" ></code>

## 下一步

- 查看 [组件文档](/components) 了解所有可用组件
- 查看 [工具函数](/utils) 了解实用工具
- 查看 [Hooks](/hooks) 了解可复用逻辑
- 面向存量系统：查看 [JSP 项目接入（UMD + CDN/本地）](/guide/jsp)
