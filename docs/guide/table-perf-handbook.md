---
title: 大表与可编辑表性能最佳实践手册
description: YSS UI 大数据量表格、可编辑表格与 Formily 交互场景的性能调优与反模式防御指南
toc: content
---

# 大表与可编辑表性能最佳实践手册

在中后台业务系统中，复杂的报表展示、大批量数据编辑、明细分录录入等场景频繁出现。

`YTable` 与 `YEditTable` 基于 VXE-Table 4 底层深度封装，具备出色的虚拟滚动与大数据渲染能力。但在实际业务开发中，不恰当的用法（反模式）往往会导致 DOM 节点爆炸、双向绑定性能雪崩以及页面卡顿。

本手册系统性梳理大数据量表格的性能基准、核心调优策略与典型反模式。

---

## 一、 核心性能基准与选型原则

| 数据规模 | 交互场景 | 推荐选型 | 关键配置 |
| :--- | :--- | :--- | :--- |
| **超大数据量（> 1,000 行）** | 纯展示、筛选、排序、导出 | **`YTable`** | 启用虚拟滚动（默认自动开启），必须固定行高 |
| **中大数据量（100 ~ 1,000 行）** | 行内编辑、添加行、下拉联动 | **`YEditTable`** | 采用内置轻量组件、固定行高、开启纵横双向虚拟滚动 |
| **极复杂表单（含深层联动/校验）** | 每一条明细有数十个字段且强联动 | **`YTable` + 抽屉/弹窗 `YFormily`** | 列表保持轻量展示态，点击行弹窗编辑，避免行内全量挂载 |
| **常规分页（≤ 100 行/页）** | 日常 CRUD 列表 | **`YTable` / `YEditTable`** | 开启分页 `pageable: true`，按需加载 |

---

## 二、 核心性能优化策略

### 1. 强制固定行高（消除重排与虚拟滚动估算抖动）

虚拟滚动依赖视口高度和行高来计算当前可视区域的渲染切片。如果单元格内容高度不一致或未设定固定行高，虚拟滚动引擎需要动态估算行高并频繁触发浏览器 Reflow（重排）：

```vue | pure
<!-- ✅ 推荐：显式声明固定行高（默认推荐 36px 或 40px） -->
<YEditTable
  :columns="columns"
  :data="data"
  :table-config="{
    cellConfig: { height: 36 }
  }"
/>
```

> **注意**：vxe-table 4 已废弃 `rowConfig.height`，请统一通过 `cellConfig.height` 设置数据行高。

---

### 2. 双向虚拟滚动阈值调优（`virtualXConfig` / `virtualYConfig`）

`YTable` 与 `YEditTable` 现已统一虚拟滚动 API，默认配置如下：
- **纵向虚拟滚动**：`virtualYConfig: { enabled: true, gt: 100 }`（行数超过 100 自动开启）
- **横向虚拟滚动**：`virtualXConfig: { enabled: true, gt: 50 }`（列数超过 50 自动开启）

针对特别多列（如宽表 30 列以上且带有复杂编辑器）的场景，可主动调低横向虚拟滚动开启阈值：

```vue | pure
<!-- ✅ 宽表场景：提前开启横向虚拟滚动与适当预加载缓冲区 -->
<YEditTable
  :columns="columns"
  :data="data"
  :virtual-x-config="{ enabled: true, gt: 20, oSize: 4 }"
  :virtual-y-config="{ enabled: true, gt: 80, oSize: 10 }"
/>
```

---

### 3. 编辑态与浏览态分离（按需挂载）

在 `YEditTable` 中，只有被激活的行或单元格才应当渲染完整的表单控件；非激活单元格应渲染为纯静态格式化文本。

* `YEditTable` 默认 `editConfig: { trigger: 'click', mode: 'row' }` 即遵循此设计：点击某一行才激活该行编辑控件，未点击时以文本展示，极大减少常驻 Vue 组件实例数。
* **反模式预警**：严禁在插槽 `#fieldName="{ row }"` 中自行写 `<a-input v-model:value="row.name" />` 导致全表常驻成百上千个 Input 实例！

---

## 三、 典型反模式（Anti-Patterns）清单

### ❌ 反模式 1：在表格每格中循环实例化 `<YFormily>`

```vue | pure
<!-- ❌ 严重反模式：千万不要在每一行单元格中嵌入完整 Formily 表单 -->
<vxe-column title="信息">
  <template #default="{ row }">
    <YFormily :form="row.formInstance" :schema="cellSchema" />
  </template>
</vxe-column>
```
* **危害**：100 行数据将创建 100 个 Formily 表单核心、1,000+ 个 Observable 监听器，内存占用暴增，页面必死卡。
* **正确做法**：使用 `YEditTable` 原生支持的 `component: 'form-item-input'` 机制，或者单行点击弹窗抽屉编辑。

---

### ❌ 反模式 2：超大表格主动关闭虚拟滚动

```vue | pure
<!-- ❌ 危险操作：为了排查某些样式直接把虚拟滚动禁用 -->
<YEditTable :table-config="{ virtualYConfig: { enabled: false } }" :data="thousandRows" />
```
* **危害**：1,000 行 × 20 列 = 20,000 个 DOM 节点瞬间塞满浏览器，导致白屏或掉帧。
* **正确做法**：保持虚拟滚动开启；若有浮层样式问题，使用 `getPopupContainer: () => document.body` 解决遮挡，而不是牺牲虚拟滚动。

---

### ❌ 反模式 3：在单元格插槽中进行高开销计算或深拷贝

```vue | pure
<!-- ❌ 反模式：在插槽模板中直接调用高开销复杂过滤 -->
<template #department="{ row }">
  <span>{{ departments.find(d => d.id === row.depId)?.deepTree?.name }}</span>
</template>
```
* **危害**：虚拟滚动快速滚动时，每一帧都在高频执行 `find` 和深层属性查找，CPU 满载导致滚动卡顿。
* **正确做法**：在拿到列表数据或字典后，一次性建立 `Map<id, name>` 哈希查找字典，或在数据拉取阶段预处理为展示字段（如 `row.depName`）。

---

## 四、 总结口诀

> **大表行高要固定，横纵虚拟按需定；**  
> **浏览编辑要分离，轻量组件最省心；**  
> **千万莫套 Formily，百行以上先分页！**
