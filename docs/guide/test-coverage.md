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
| **行覆盖率 (Lines)** | **81.56%** | 45% | ✅ 达标 |
| **分支覆盖率 (Branches)** | **76.17%** | 62% | ✅ 达标 |
| **函数覆盖率 (Functions)** | **72.51%** | 48% | ✅ 达标 |
| **语句覆盖率 (Statements)** | **81.56%** | 45% | ✅ 达标 |

## UI 组件（@yss-ui/components）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **authority** | 1 | 100% (53/53) | 80% | `🟢 优秀 (100%)` | `authority-dropdown.component.test.ts` |
| **button** | 1 | 100% (147/147) | 85.29% | `🟢 优秀 (100%)` | `button.component.test.ts` |
| **card** | 2 | 95.37% (206/216) | 78.57% | `🟢 优秀 (95.37%)` | `card.component.test.ts`<br/>`prefix-cls.component.test.ts` |
| **condition-builder** | 3 | 75.07% (1063/1416) | 73.54% | `🟡 良好 (75.07%)` | `condition-builder.component.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`use-condition-tree.test.ts` |
| **cron** | 2 | 90.2% (856/949) | 68.97% | `🟢 优秀 (90.2%)` | `cron.component.test.ts`<br/>`prefix-cls.component.test.ts` |
| **echarts** | 1 | 97.07% (331/341) | 66.67% | `🟢 优秀 (97.07%)` | `echarts.component.test.ts` |
| **edit-table** | 6 | 77.27% (1530/1980) | 61.66% | `🟡 良好 (77.27%)` | `action-config.test.ts`<br/>`dynamic-editor.test.ts`<br/>`edit-table.component.test.ts`<br/>`error-tooltip-scroll.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`virtual-scroll.test.ts` |
| **file-import** | 2 | 94.95% (414/436) | 68.33% | `🟢 优秀 (94.95%)` | `file-import.component.test.ts`<br/>`prefix-cls.component.test.ts` |
| **file-preview** | 55 | 89.09% (16651/18691) | 78.46% | `🟢 优秀 (89.09%)` | `boundary-62b-text.component.test.ts`<br/>`boundary-62b.component.test.ts`<br/>`boundary-62b.test.ts`<br/>`boundary-63.component.test.ts`<br/>`boundary-63b.component.test.ts`<br/>`boundary-64.component.test.ts`<br/>`boundary-65.test.ts`<br/>`boundary-66-pptx.component.test.ts`<br/>`boundary-66.test.ts`<br/>`boundary-67.test.ts`<br/>`boundary-68.component.test.ts`<br/>`csv-renderer.component.test.ts`<br/>`csv.test.ts`<br/>`detect.test.ts`<br/>`docx-fixup.component.test.ts`<br/>`excel-cf.test.ts`<br/>`excel-chart.test.ts`<br/>`excel-display.test.ts`<br/>`excel-dml.test.ts`<br/>`excel-drawing.test.ts`<br/>`excel-geometry.test.ts`<br/>`excel-limits.component.test.ts`<br/>`excel-media.component.test.ts`<br/>`excel-objects.test.ts`<br/>`excel-overlay.component.test.ts`<br/>`excel-refs.test.ts`<br/>`excel-renderer.component.test.ts`<br/>`excel-xls-styles.test.ts`<br/>`excel-xml.test.ts`<br/>`excel-zip.test.ts`<br/>`file-preview.component.test.ts`<br/>`file-switcher.component.test.ts`<br/>`hook-context.component.test.ts`<br/>`image-renderer.component.test.ts`<br/>`media-detect.test.ts`<br/>`missing-dep.component.test.ts`<br/>`modal-nav.component.test.ts`<br/>`modal.component.test.ts`<br/>`office-crypto.test.ts`<br/>`p0-extensibility.component.test.ts`<br/>`password.component.test.ts`<br/>`pptx-charts.component.test.ts`<br/>`pptx-media.component.test.ts`<br/>`pptx-renderer.component.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`registry.test.ts`<br/>`renderers.component.test.ts`<br/>`resize.component.test.ts`<br/>`subpath-boundary.test.ts`<br/>`text.test.ts`<br/>`use-file-preview.component.test.ts`<br/>`zoom-pinch.component.test.ts`<br/>`zoom-pinch.test.ts`<br/>`zoom.component.test.ts`<br/>`zoom.test.ts` |
| **formily** | 6 | 69.72% (1821/2612) | 62.14% | `🟡 良好 (69.72%)` | `collapse.component.test.ts`<br/>`collapse.test.ts`<br/>`feedback.component.test.ts`<br/>`feedback.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`subpath-table-formily.component.test.ts` |
| **locale** | 2 | 97.46% (1265/1298) | 80.33% | `🟢 优秀 (97.46%)` | `adapters.component.test.ts`<br/>`locale.component.test.ts` |
| **monaco** | 3 | 49.58% (2150/4336) | 45.13% | `🟠 偏低 (49.58%)` | `monaco.component.test.ts`<br/>`subpath-exports.component.test.ts`<br/>`nginxFormat.test.ts` |
| **month-calendar** | 3 | 96.16% (1076/1119) | 83.17% | `🟢 优秀 (96.16%)` | `date-boundary.test.ts`<br/>`month-calendar.component.test.ts`<br/>`prefix-cls.component.test.ts` |
| **sheet** | 1 | 65.47% (567/866) | 53.85% | `🟡 良好 (65.47%)` | `sheet.component.test.ts` |
| **split-pane** | 1 | 92.45% (1237/1338) | 71.81% | `🟢 优秀 (92.45%)` | `split-pane.component.test.ts` |
| **table** | 20 | 87.71% (3225/3677) | 80.91% | `🟢 优秀 (87.71%)` | `action-button-contract.test.ts`<br/>`action-button-state.component.test.ts`<br/>`action-column.component.test.ts`<br/>`action-scroll.component.test.ts`<br/>`action-scroll.test.ts`<br/>`action-width.test.ts`<br/>`dynamic-slot-state.component.test.ts`<br/>`loading-empty.component.test.ts`<br/>`loading-layout.component.test.ts`<br/>`min-height.component.test.ts`<br/>`multi-level-header.component.test.ts`<br/>`polling-regression.component.test.ts`<br/>`prefix-cls.component.test.ts`<br/>`row-identity.test.ts`<br/>`safe-data.component.test.ts`<br/>`selection.component.test.ts`<br/>`toolbar.component.test.ts`<br/>`useSafeData.test.ts`<br/>`actionRetry.test.ts`<br/>`subpath-table-formily.component.test.ts` |
| **tree** | 2 | 93.72% (701/748) | 75.4% | `🟢 优秀 (93.72%)` | `prefix-cls.component.test.ts`<br/>`tree.component.test.ts` |
| **utils** | 0 | 100% (34/34) | 85.71% | `🟢 优秀 (100%)` | *(暂无)* |

## Composables（@yss-ui/hooks）

| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **useFullscreen** | 1 | 97.78% (309/316) | 80.85% | `🟢 优秀 (97.78%)` | `useFullscreen.test.ts` |
| **useLoading** | 1 | 100% (108/108) | 94.44% | `🟢 优秀 (100%)` | `useLoading.test.ts` |
| **usePollingTask** | 1 | 94.78% (236/249) | 76.67% | `🟢 优秀 (94.78%)` | `usePollingTask.test.ts` |
| **useTableHeight** | 1 | 93.72% (358/382) | 75.76% | `🟢 优秀 (93.72%)` | `prefix-cls.component.test.ts` |
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
- **utils**（UI 组件（@yss-ui/components））：尚未建立单测
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
