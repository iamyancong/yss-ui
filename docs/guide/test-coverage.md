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
| **行覆盖率 (Lines)** | **62.91%** | 45% | ✅ 达标 |
| **分支覆盖率 (Branches)** | **67.09%** | 62% | ✅ 达标 |
| **函数覆盖率 (Functions)** | **54.05%** | 48% | ✅ 达标 |
| **语句覆盖率 (Statements)** | **62.91%** | 45% | ✅ 达标 |

## UI 组件（@yss-ui/components）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **authority** | 1 | 100% (53/53) | 80% | `🟢 优秀 (100%)` | `authority-dropdown.component.test.ts` |
| **button** | 1 | 100% (147/147) | 85.29% | `🟢 优秀 (100%)` | `button.component.test.ts` |
| **card** | 1 | 93.41% (170/182) | 71.43% | `🟢 优秀 (93.41%)` | `card.component.test.ts` |
| **condition-builder** | 2 | 69.63% (892/1281) | 68.29% | `🟡 良好 (69.63%)` | `condition-builder.component.test.ts`<br/>`use-condition-tree.test.ts` |
| **cron** | 1 | 90.03% (840/933) | 68.97% | `🟢 优秀 (90.03%)` | `cron.component.test.ts` |
| **echarts** | 1 | 97.73% (258/264) | 68.57% | `🟢 优秀 (97.73%)` | `echarts.component.test.ts` |
| **edit-table** | 5 | 71.64% (1296/1809) | 53.44% | `🟡 良好 (71.64%)` | `action-config.test.ts`<br/>`dynamic-editor.test.ts`<br/>`edit-table.component.test.ts`<br/>`error-tooltip-scroll.test.ts`<br/>`virtual-scroll.test.ts` |
| **file-import** | 1 | 94.94% (413/435) | 67.8% | `🟢 优秀 (94.94%)` | `file-import.component.test.ts` |
| **formily** | 4 | 27.69% (694/2506) | 73.49% | `🟠 偏低 (27.69%)` | `collapse.component.test.ts`<br/>`collapse.test.ts`<br/>`feedback.component.test.ts`<br/>`feedback.test.ts` |
| **locale** | 2 | 96.97% (897/925) | 81.36% | `🟢 优秀 (96.97%)` | `adapters.component.test.ts`<br/>`locale.component.test.ts` |
| **monaco** | 3 | 39.03% (1609/4122) | 43.18% | `🟠 偏低 (39.03%)` | `monaco.component.test.ts`<br/>`subpath-exports.component.test.ts`<br/>`nginxFormat.test.ts` |
| **month-calendar** | 2 | 96.03% (1039/1082) | 84.08% | `🟢 优秀 (96.03%)` | `date-boundary.test.ts`<br/>`month-calendar.component.test.ts` |
| **sheet** | 1 | 65.47% (567/866) | 53.85% | `🟡 良好 (65.47%)` | `sheet.component.test.ts` |
| **split-pane** | 1 | 92.45% (1237/1338) | 71.81% | `🟢 优秀 (92.45%)` | `split-pane.component.test.ts` |
| **table** | 4 | 78.03% (2263/2900) | 69.6% | `🟡 良好 (78.03%)` | `action-column.component.test.ts`<br/>`action-width.test.ts`<br/>`selection.component.test.ts`<br/>`toolbar.component.test.ts` |
| **trade-calendar-board** | 0 | 0% (0/0) | 0% | `🔴 待补单测` | *(暂无)* |
| **tree** | 1 | 97.87% (596/609) | 76.4% | `🟢 优秀 (97.87%)` | `tree.component.test.ts` |

## Composables（@yss-ui/hooks）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **useFullscreen** | 0 | 0% (0/316) | 0% | `🔴 待补单测` | *(暂无)* |
| **useLoading** | 0 | 0% (0/116) | 0% | `🔴 待补单测` | *(暂无)* |
| **usePollingTask** | 0 | 0% (0/249) | 0% | `🔴 待补单测` | *(暂无)* |
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

- **formily**（UI 组件（@yss-ui/components））：行覆盖率偏低 (27.69%)
- **monaco**（UI 组件（@yss-ui/components））：行覆盖率偏低 (39.03%)
- **trade-calendar-board**（UI 组件（@yss-ui/components））：尚未建立单测
- **useFullscreen**（Composables（@yss-ui/hooks））：尚未建立单测
- **useLoading**（Composables（@yss-ui/hooks））：尚未建立单测
- **usePollingTask**（Composables（@yss-ui/hooks））：尚未建立单测
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
