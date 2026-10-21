---
title: 测试覆盖矩阵
description: YSS UI 组件库与基础模块自动化测试覆盖率及健壮度大盘
toc: content
---

# 测试覆盖矩阵

展示 YSS UI 核心组件、Hooks 与工具模块的自动化测试（Unit / Component Test）覆盖情况。

## 总体覆盖率大盘

| 指标类别 | 全库综合覆盖率 | 目标阈值 | 状态 |
| :--- | :--- | :--- | :--- |
| **行覆盖率 (Lines)** | **79.05%** | 45% | ✅ 达标 |
| **分支覆盖率 (Branches)** | **77.03%** | 62% | ✅ 达标 |
| **函数覆盖率 (Functions)** | **69.55%** | 48% | ✅ 达标 |
| **语句覆盖率 (Statements)** | **79.05%** | 45% | ✅ 达标 |

## UI 组件（@yss-ui/components）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **authority** | 1 | 100% (53/53) | 80% | `🟢 优秀 (100%)` | `authority-dropdown.component.test.ts` |
| **button** | 1 | 100% (147/147) | 85.29% | `🟢 优秀 (100%)` | `button.component.test.ts` |
| **card** | 1 | 93.41% (170/182) | 71.43% | `🟢 优秀 (93.41%)` | `card.component.test.ts` |
| **condition-builder** | 2 | 74.6% (1037/1390) | 71.19% | `🟡 良好 (74.6%)` | `condition-builder.component.test.ts`<br/>`use-condition-tree.test.ts` |
| **cron** | 1 | 90.03% (840/933) | 68.97% | `🟢 优秀 (90.03%)` | `cron.component.test.ts` |
| **echarts** | 1 | 97.07% (331/341) | 66.67% | `🟢 优秀 (97.07%)` | `echarts.component.test.ts` |
| **edit-table** | 5 | 76.95% (1502/1952) | 61.32% | `🟡 良好 (76.95%)` | `action-config.test.ts`<br/>`dynamic-editor.test.ts`<br/>`edit-table.component.test.ts`<br/>`error-tooltip-scroll.test.ts`<br/>`virtual-scroll.test.ts` |
| **file-import** | 1 | 94.94% (413/435) | 67.8% | `🟢 优秀 (94.94%)` | `file-import.component.test.ts` |
| **file-preview** | 25 | 94.6% (7745/8187) | 82.24% | `🟢 优秀 (94.6%)` | `csv-renderer.component.test.ts`<br/>`csv.test.ts`<br/>`detect.test.ts`<br/>`docx-fixup.component.test.ts`<br/>`excel-display.test.ts`<br/>`excel-renderer.component.test.ts`<br/>`file-preview.component.test.ts`<br/>`file-switcher.component.test.ts`<br/>`hook-context.component.test.ts`<br/>`image-renderer.component.test.ts`<br/>`media-detect.test.ts`<br/>`missing-dep.component.test.ts`<br/>`modal-nav.component.test.ts`<br/>`modal.component.test.ts`<br/>`p0-extensibility.component.test.ts`<br/>`pptx-charts.component.test.ts`<br/>`pptx-media.component.test.ts`<br/>`pptx-renderer.component.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`registry.test.ts`<br/>`renderers.component.test.ts`<br/>`resize.component.test.ts`<br/>`subpath-boundary.test.ts`<br/>`text.test.ts`<br/>`use-file-preview.component.test.ts` |
| **formily** | 5 | 61.72% (1554/2518) | 79.22% | `🟡 良好 (61.72%)` | `collapse.component.test.ts`<br/>`collapse.test.ts`<br/>`feedback.component.test.ts`<br/>`feedback.test.ts`<br/>`subpath-table-formily.component.test.ts` |
| **locale** | 2 | 97.15% (1125/1158) | 80% | `🟢 优秀 (97.15%)` | `adapters.component.test.ts`<br/>`locale.component.test.ts` |
| **monaco** | 3 | 49.58% (2150/4336) | 51.79% | `🟠 偏低 (49.58%)` | `monaco.component.test.ts`<br/>`subpath-exports.component.test.ts`<br/>`nginxFormat.test.ts` |
| **month-calendar** | 2 | 96.03% (1039/1082) | 84.08% | `🟢 优秀 (96.03%)` | `date-boundary.test.ts`<br/>`month-calendar.component.test.ts` |
| **sheet** | 1 | 65.13% (564/866) | 52.63% | `🟡 良好 (65.13%)` | `sheet.component.test.ts` |
| **split-pane** | 1 | 92.45% (1237/1338) | 71.81% | `🟢 优秀 (92.45%)` | `split-pane.component.test.ts` |
| **table** | 14 | 83.21% (2786/3348) | 79.2% | `🟢 优秀 (83.21%)` | `action-button-contract.test.ts`<br/>`action-button-state.component.test.ts`<br/>`action-column.component.test.ts`<br/>`action-scroll.component.test.ts`<br/>`action-scroll.test.ts`<br/>`action-width.test.ts`<br/>`polling-regression.component.test.ts`<br/>`row-identity.test.ts`<br/>`safe-data.component.test.ts`<br/>`selection.component.test.ts`<br/>`toolbar.component.test.ts`<br/>`useSafeData.test.ts`<br/>`actionRetry.test.ts`<br/>`subpath-table-formily.component.test.ts` |
| **tree** | 1 | 97.87% (596/609) | 76.4% | `🟢 优秀 (97.87%)` | `tree.component.test.ts` |

## Composables（@yss-ui/hooks）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **useFullscreen** | 1 | 97.78% (309/316) | 80.85% | `🟢 优秀 (97.78%)` | `useFullscreen.test.ts` |
| **useLoading** | 1 | 100% (108/108) | 94.44% | `🟢 优秀 (100%)` | `useLoading.test.ts` |
| **usePollingTask** | 1 | 94.78% (236/249) | 76.67% | `🟢 优秀 (94.78%)` | `usePollingTask.test.ts` |
| **useTableHeight** | 0 | 88.08% (229/260) | 53.13% | `🟢 优秀 (88.08%)` | *(暂无)* |
| **useTreeHeight** | 0 | 97.74% (130/133) | 70% | `🟢 优秀 (97.74%)` | *(暂无)* |
| **useUrlState** | 1 | 90.61% (222/245) | 76.32% | `🟢 优秀 (90.61%)` | `useUrlState.test.ts` |

## 工具函数（@yss-ui/utils）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **auth** | 0 | 46.51% (20/43) | 0% | `🟠 偏低 (46.51%)` | *(暂无)* |
| **clipboard** | 0 | 18.18% (6/33) | 0% | `🟠 偏低 (18.18%)` | *(暂无)* |
| **download** | 0 | 32.11% (35/109) | 0% | `🟠 偏低 (32.11%)` | *(暂无)* |
| **format** | 0 | 37.65% (32/85) | 0% | `🟠 偏低 (37.65%)` | *(暂无)* |
| **getUrlData** | 0 | 10% (8/80) | 0% | `🟠 偏低 (10%)` | *(暂无)* |
| **storage** | 0 | 50.48% (53/105) | 0% | `🟡 良好 (50.48%)` | *(暂无)* |
| **theme** | 0 | 18.81% (19/101) | 0% | `🟠 偏低 (18.81%)` | *(暂无)* |

## 主题规范（@yss-ui/theme）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **colors** | 0 | 0% (0/74) | 0% | `🔴 待补单测` | *(暂无)* |
| **spacing** | 0 | 0% (0/33) | 0% | `🔴 待补单测` | *(暂无)* |
| **typography** | 0 | 0% (0/52) | 0% | `🔴 待补单测` | *(暂无)* |

## 待补充测试清单 (Backlog)

供 Maintainer 与 Coding Agent（通过 `component-testing` 技能）作为测试补充依据：

- **monaco**（UI 组件（@yss-ui/components））：行覆盖率偏低 (49.58%)
- **useTableHeight**（Composables（@yss-ui/hooks））：尚未建立单测
- **useTreeHeight**（Composables（@yss-ui/hooks））：尚未建立单测
- **auth**（工具函数（@yss-ui/utils））：尚未建立单测
- **clipboard**（工具函数（@yss-ui/utils））：尚未建立单测
- **download**（工具函数（@yss-ui/utils））：尚未建立单测
- **format**（工具函数（@yss-ui/utils））：尚未建立单测
- **getUrlData**（工具函数（@yss-ui/utils））：尚未建立单测
- **storage**（工具函数（@yss-ui/utils））：尚未建立单测
- **theme**（工具函数（@yss-ui/utils））：尚未建立单测
- **colors**（主题规范（@yss-ui/theme））：尚未建立单测
- **spacing**（主题规范（@yss-ui/theme））：尚未建立单测
- **typography**（主题规范（@yss-ui/theme））：尚未建立单测
