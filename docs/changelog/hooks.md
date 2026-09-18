---
title: Hooks 更新日志
nav:
  title: 更新日志
  path: /changelog/hooks
toc: content
---

# 🪝 Hooks 更新日志

YSS UI Hooks 库（`@yss-ui/hooks`）的版本更新记录。

---

## v1.1.3
`2026-09-01`

### 🔧 Build

- **usePollingTask**: 移除 `finally` 中的控制流返回，显式区分过期 generation 与当前任务的收尾调度，保持原有停止语义并通过非修改式 ESLint 门禁。

---

## v1.1.2
`2026-08-05`

### ⚡ Performance

- **useTableHeight / useTreeHeight**: 仅宽度变化时跳过高度重算，并用 RAF 合并 ResizeObserver 回调，减少分割面板拖拽等场景下的无效计算。 [`70b938f`](https://github.com/yss-ui/yss-ui/commit/70b938f1af602e504e4fc426182af7185127c4d8)

---

## v1.1.1
`2026-04-22`

### ✨ Features

- **useTableHeight**: 新增 `boundaryRef` 配置项。支持指定外部固定高度容器作为监听边界，有效解决在“内容撑开型”容器中使用时由于双向依赖导致的表格高度死循环计算及页面闪烁问题。

### 📝 Documentation

- 新增 `useTableHeight` 「内容撑开边界场景」文档与示例，说明如何利用 `boundaryRef` 锁定稳定高度参考系。

---

# v1.1.0
`2026-04-08`

### ✨ Features

- **useUrlState**: 新增 URL query 状态管理 Hook
  - 提供 `state / setState / clearKeys / clearState` API
  - 支持 `push / replace` 两种导航模式，默认 `replace`
  - 默认更新策略采用 `history` 无感模式，默认 `setState / clearKeys / clearState` 使用 `history.pushState/replaceState`
  - 新增 `strategy: 'history' | 'router'`，可按需回退到路由导航语义

### 📝 Documentation

- 新增 `useUrlState` 文档页与示例 Demo
- 更新 hooks 左侧导航，补充 `useUrlState` 入口

---

# v1.0.17
`2026-04-07`

### ✨ Features

- **usePollingTask**: 新增通用轮询调度 Hook
  - 支持 `start / stop / restart / runNow / setInterval`
  - 支持动态轮询间隔、标签页隐藏暂停与恢复
  - 内置 generation 失效保护，避免旧结果覆盖新结果
  - 支持向业务层透传 `AbortSignal`
  - 支持错误继续轮询或错误后停止轮询两种模式

### 📝 Documentation

- 新增 `usePollingTask` 完整文档页
- 新增 4 个 Demo：基础启停、动态间隔、错误控制、标签页暂停与失效保护
- 更新 hooks 左侧导航，补充 `usePollingTask` 入口

---

## v1.0.13
`2026-02-03`

### 🐞 Bug Fixes

- **useTableHeight**: 修复 YCard / AntCard 内表格高度计算不准确的问题
  - **智能 Header 检测**: 新增 `getCardHeaderHeight` 辅助函数，自动识别父级 Card 是否包含 Title/Extra 插槽
  - **自动扣减**: 在计算可用高度时，自动减去 Card Header 的高度，防止表格内容被 Header 遮挡
  - **兼容性**: 完美兼容 YCard 自定义插槽 (#title, #extra) 场景

---

## v1.0.12

`2026-01-15`

### ✨ Features

- **useTableHeight**: 功能增强与 API 扩展
  - **组件实例支持**: `tableAreaRef` 参数现在支持传入 Vue 组件实例（如 `YCard`、`AntCard`），自动获取真实 DOM 元素
  - **智能 Card 检测**: 自动识别 Ant Design Card 组件，优先获取 `.ant-card-body` 元素，避免 padding 影响高度计算
  - **自定义高度配置**: 新增 `paginationHeight`、`toolbarHeight`、`addButtonHeight` 参数，支持覆盖默认预设值
  - **就绪状态**: 新增 `isReady` 返回值，首次计算完成后为 `true`，可用于条件渲染或加载状态判断
  - **边界优化**: 当容器高度极小时，优先保证分页/工具栏可见，而非强制 `minHeight`

### 📝 Documentation

- 更新 `useTableHeight` 文档，补充智能检测、边界处理等新特性说明

---

## v1.0.10
`2026-01-10`

### ✨ Features

- **useTableHeight**: 新增表格高度自适应 Hook
  - **自适应布局**: 基于 `ResizeObserver` 自动监听容器高度变化，专为 Flex 布局设计。
  - **内置偏移预设**: 提供 `withPagination`、`withToolbar`、`withAddButton` 等快捷选项，自动扣除常见表格元素高度。
  - **多场景支持**: 针对 `Modal`、`Drawer` 等弹窗组件的动画过度场景进行专门优化，优先使用 `contentRect` 避免 Transform 导致的计算错误。
  - **懒加载支持**: 智能处理 `display: none` 到显示的切换场景，内置重试机制确保高度准确。

### 📝 Documentation

- 新增 `useTableHeight` 完整文档，包含 Flex 布局、弹窗（Modal）、抽屉（Drawer）等多种场景的实战 Demo。

---

## v1.0.8
`2026-01-04`

### 🐞 Bug Fixes

- **useTreeHeight**: 修复配合 `YTree` 使用时高度计算存在的细微偏差(8px)
  - 实际上修复了 `YTree` 组件样式的多余 padding，确保 `useTreeHeight` 计算出的高度能完美填充容器

### 📝 Documentation

- 修正 `useTreeHeight` 演示示例文档中的高度设置

---

## v1.0.7
`2025-12-31`

### ✨ Features

- **useTreeHeight**: 新增树组件高度自适应 Hook
  - **更智能的计算**: 废弃 `offset` 参数，改为传入树区域容器 `ref`，Hook 自动监听容器大小变化
  - **Flex 布局支持**: 专为 Flex 布局优化，配合 `flex: 1` 可实现高度自动填充
  - **YTree Search 支持**: 新增 `extraOffset` 参数和 `YTREE_SEARCH_HEIGHT` 常量，完美解决 YTree 内置搜索框高度计算问题
  - **API**: 提供 `recalculateHeight` 手动重算方法

### 📝 Documentation

- 新增 `useTreeHeight` 完整文档
  - 包含 3 个典型场景 Demo：基础用法、带搜索框头部、头部+底部复杂布局
  - 详细的 API 说明和布局最佳实践指南

---

## v1.0.3
`2025-12-19`

### ✨ Features

- **useFullscreen**: 新增全屏控制 Hook，支持元素全屏、页面全屏等多种场景
  - 提供 `isFullscreen`、`enterFullscreen`、`exitFullscreen`、`toggleFullscreen` 等完整 API
  - 支持全屏状态监听和错误处理
  - 新增 4 个示例文档：基础用法、图片全屏、页面全屏、多实例共存
- **useLoading**: 重构 Loading 状态管理 Hook
  - 采用模块化结构（`index.ts`、`constant.ts`、`README.md`）
  - 支持自动和手动两种控制模式
  - 提供完整的类型定义和使用文档
  - 新增 2 个示例文档：基础用法、手动控制

### 📝 Documentation

- 新增 `useFullscreen` 完整文档，包含 API 说明和 4 个实战示例
- 新增 `useLoading` 完整文档，包含 README 和 2 个使用示例
- 更新 hooks 导航结构，优化文档展示

---

## v1.1.19
`2025-12-17`

### ✨ Features


### 🐞 Bug Fixes


### 📝 Documentation


---

## v1.1.18
`2025-12-11`

### ✨ Features
