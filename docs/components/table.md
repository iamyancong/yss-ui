---
toc: content
---

# Y-Table 表格

基于 `vxe-table 4.19.10` 版本封装的 Vue3 表格组件，采用 Composition API 重构，支持现代化的开发体验。

### 统一消费与构建契约

- 默认单包安装，从 `@yss-ui/components` 具名导入并局部注册；不全局安装 YSSUI，不拆新的功能包。
- `@yss-ui/components/table`、`@yss-ui/components/formily` 自 1.6.7 起公开，是可选入口；旧版本先核对 exports，禁止批量改写根入口。
- 子路径与插件改善加载边界，不减少默认安装依赖；VXE/Formily 仍由组件库配套安装。
- 官方 `@yss-ui/components/vite` 插件目标版本 1.7.0，Vite 6 模板统一接入。旧项目先读取实际安装版本、exports 和现有插件，禁止与旧隔离插件同时运行。
- 生成代码前用 MCP `get_consumption_contract` 核对版本；未知版本不得假设新插件可用。文档站 Demo 的样式导入不能直接复制为业务全局样式策略。

## 特性

- 🚀 **Vue3 原生支持** - 使用 Composition API 和 `<script setup>` 语法
- 💪 **TypeScript 友好** - 完整的类型定义和智能提示  
- 🎨 **高度可定制** - 支持插槽、渲染器等多种自定义方式
- ⚡ **性能优化** - 基于 vxe-table 4.19.10 的虚拟滚动和性能优化
- 🛠 **企业级功能** - 支持编辑、筛选、排序、拖拽等企业级功能

## 代码演示

### 基础用法

<code id="demo-table-basic" src="./demos/table/basic/index.vue" title="工具栏左右按钮 + 操作列自定义更多图标"></code>

### 树形表格

<code id="demo-table-tree-table" src="./demos/table/tree-table/index.vue" title="tree-config + treeNode 树形表格"></code>

### 大数据量+自定义筛选(虚拟列表)

<code id="demo-table-column-custom-search" src="./demos/table/column-custom-search/index.vue"></code>

### 远程分页
<code id="demo-table-pagination-remote" src="./demos/table/pagination-remote/index.vue"></code>

### 操作列（更多/隐藏/二次确认）

<code id="demo-table-action" src="./demos/table/action/index.vue"></code>

### 操作列权限按钮（隐藏/禁用）（localStorage）

<code id="demo-table-action-auth" src="./demos/table/action-auth/index.vue"></code>

### 自定义操作列（插槽方式）

<code id="demo-table-action-slot" src="./demos/table/action-slot/index.vue"></code>

### 行拖拽排序

<code id="demo-table-drag" src="./demos/table/drag/index.vue"></code>

### 字典翻译列

<code id="demo-table-transform" src="./demos/table/transform/index.vue"></code>

### 筛选能力

<code id="demo-table-filter-remote" src="./demos/table/filter-remote/index.vue" title="后端筛选（监听 filter-change）"></code>

<code id="demo-table-filter-local" src="./demos/table/filter-local/index.vue" title="本地筛选（filterMethod）"></code>

<code id="demo-table-filter-custom" src="./demos/table/filter-custom/index.vue" title="自定义筛选渲染（输入框）"></code>

<code id="demo-table-filter-mixed" src="./demos/table/filter-mixed/index.vue" title="组合筛选：每列不同类型"></code>

<code id="demo-table-filter-async" src="./demos/table/filter-async/index.vue" title="接口返回列 filters（异步）"></code>

<code id="demo-table-filter-auto" src="./demos/table/filter-auto/index.vue" title="自动匹配：按列类型渲染筛选 UI"></code>

### 展开行（占位示例）

<code id="demo-table-expand" src="./demos/table/expand/index.vue"></code>

### 操作列触发行展开

<code id="demo-table-action-expand" src="./demos/table/expand/action-expand.vue"></code>

### 表头插槽（推荐）

<code id="demo-table-renderers" src="./demos/table/renderers/index.vue"></code>

### 分组表头

<code id="demo-table-group-header" src="./demos/table/group-header/index.vue"></code>

### 表头行高（headerHeight）

<code id="demo-table-header-height" src="./demos/table/header-height/index.vue"></code>

### 行选择与高亮
<code id="demo-table-selection-checkbox" src="./demos/table/selection-checkbox/index.vue" title="复选框：双向受控绑定 + 批量操作 + 实例 API 控制"></code>
<code id="demo-table-selection-radio" src="./demos/table/selection-radio/index.vue" title="单选：API 控制 + 高亮"></code>

### 配置引用写法

<code id="demo-table-config-reference" src="./demos/table/config-reference/index.vue" title="内联对象与稳定引用都支持"></code>

### 合并单元格

支持透传 `spanMethod` 到内置的 `vxe-table`，可实现复杂的跨行/跨列合并逻辑：

<code id="demo-table-merge-cells" src="./demos/table/merge-cells/index.vue"></code>

## API

YTable 当前基于 `vxe-table@4.19.10`。本文完整记录 YSS 自有 Props、事件、插槽、Expose 和配置结构；未声明的 VXE 属性通过 `$attrs` 透传，具体含义与兼容性以该版本上游文档为准。

### Props

> **说明**：YTable 完整继承 vxe-table 的所有 props，以下仅列出 **YTable 特有属性** 和 **有默认值覆盖的属性**。其他 vxe-table 原生属性请参考 <a href="https://vxetable.cn/#/table/api" target="_blank" rel="noopener noreferrer">vxe-table 官方文档</a>。
>
> **vxe-table 4.19.x 新能力**：YTable 会继续透传原生配置。业务侧可直接使用 `aggregate-config`、`aggregate-accuracy-config`，以及 `tooltip-config` 中的 `defaultPlacement`、`popupClassName`、`useHTML` 等 4.19.x 配置。

#### YTable 特有属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| data | `any[]` | `[]` | 表格数据源；行拖拽后可通过 `v-model:data` 接收新顺序。 |
| columns | `YTableColumn[]` | `[]` | 列配置，详见下方 `YTableColumn` 说明 |
| selectedRows | `any[]` | - | 选中的行记录列表（支持 `v-model:selectedRows` / `v-model:selected-rows` 双向受控绑定） |
| selectedRowKeys | `(string \| number)[]` | - | 选中的行 Key 列表（支持 `v-model:selectedRowKeys` / `v-model:selected-row-keys` 双向受控绑定） |
| showActionColumn | `boolean` | `true` | 是否显示操作列（配合 `actionConfig` 使用） |
| actionConfig | `YTableActionConfig` | `{ buttons: [] }` | 操作列配置，详见下方 `YTableActionConfig` 说明 |
| autoFlexColumn | `boolean` | `true` | 是否自动为最后一列添加弹性宽度以填充剩余空间 |
| rowDragable | `boolean` | `false` | 是否开启行拖拽排序 |
| showDragHandle | `boolean` | `true` | 是否显示拖拽把手列（仅在 `rowDragable=true` 时生效） |
| dragHandleWidth | `number \| string` | `46` | 拖拽把手列的宽度 |
| rowDragConfig | `VxeTablePropTypes.RowDragConfig` | - | vxe-table 行拖拽配置，与内置拖拽语义合并。 |
| pageable | `boolean` | `false` | 是否启用内部分页（基于 Ant Design Vue Pagination） |
| pagination | `YTablePagination` | 见下方默认值 | 分页配置，详见下方 `YTablePagination` 说明 |
| optionsMap | `Record<string, any[]>` | `{}` | 字典数据映射，用于字典翻译列的数据源 |
| toolbar-config | `{ custom?: boolean }` | `{ custom: false }` | 工具栏配置。开启 `custom` 后显示列设置齿轮；注：使用 `#toolbar-left`/`#toolbar-right` 插槽时会自动渲染工具栏，无需强制开启 `custom`。 |
| toolbarSize | `'mini' \| 'small' \| 'medium' \| 'large'` | `'medium'` | 仅控制工具栏尺寸，与表格的 `size` 独立 |
| toolbarTools | `any[]` | `[]` | 透传给 `vxe-toolbar` 的工具项；数组非空时会自动渲染工具栏。普通业务主操作仍优先使用 `#toolbar-left` / `#toolbar-right` 插槽。 |
| headerHeight | `number` | - | 表头行高（px），仅影响表头，不影响数据行 |
| checkboxConfig | `VxeTablePropTypes.CheckboxConfig` | `{}` | 多选行为配置，透传给 vxe-table。 |
| radioConfig | `VxeTablePropTypes.RadioConfig` | `{}` | 单选行为配置，透传给 vxe-table。 |
| editConfig | `VxeTablePropTypes.EditConfig` | `{ trigger:'click', mode:'row' }` | 编辑模式配置。 |
| expandConfig | `VxeTablePropTypes.ExpandConfig` | `{}` | 展开行配置。 |
| headerTooltipConfig | `VxeTablePropTypes.HeaderTooltipConfig` | `{}` | 表头 Tooltip 配置。 |
| footerTooltipConfig | `VxeTablePropTypes.FooterTooltipConfig` | `{}` | 表尾 Tooltip 配置。 |

#### 继承自 vxe-table（有默认值覆盖）

以下属性继承自 vxe-table，但 YTable 提供了不同的默认值：

| 属性 | 类型 | YTable 默认值 | 说明 |
| --- | --- | --- | --- |
| height | `number \| string` | - | 表格固定高度。 |
| maxHeight | `number \| string` | - | 表格最大高度。 |
| loading | `boolean` | `false` | 表格加载状态。 |
| showHeader | `boolean` | `true` | 是否显示表头。 |
| stripe | `boolean` | `false` | 是否显示斑马纹。 |
| size | `'mini' \| 'small' \| 'medium' \| 'large'` | `'small'` | 表格尺寸（vxe-table 默认 `medium`） |
| border | `boolean \| 'default' \| 'full' \| 'none'` | `true` | 表格边框风格 |
| showOverflow | `boolean \| 'ellipsis' \| 'title' \| 'tooltip'` | `'tooltip'` | 单元格内容溢出时的显示方式 |
| showHeaderOverflow | `boolean \| 'ellipsis' \| 'title' \| 'tooltip'` | `'tooltip'` | 表头内容溢出时的显示方式 |
| rowConfig | `Record<string, any>` | `{ keyField: '_X_ROW_KEY', useKey: true, isCurrent: true, isHover: true }` | 行配置。**默认启用行悬浮和当前行高亮**，可通过 `{ isCurrent: false, isHover: false }` 关闭。（~~height 已废弃，行高配置请改用 cellConfig.height~~） |
| cellConfig | `Record<string, any>` | `{ height: 36 }` | 单元格配置。内置数据行高（用于代替原废弃的 `rowConfig.height`） |
| columnConfig | `Record<string, any>` | `{ resizable: true, useKey: true }` | 列配置，默认开启列宽拖拽 |
| virtualXConfig | `Record<string, any>` | `{ enabled: true, gt: 50 }` | **智能横向虚拟滚动**：超过 50 列自动启用 |
| virtualYConfig | `Record<string, any>` | `{ enabled: true, gt: 200 }` | **智能纵向虚拟滚动**：超过 200 行自动启用 |
| customConfig | `Record<string, any>` | `{}` | 若未传且提供了 `id`，自动启用本地存储 |

#### 废弃兼容属性

| 属性 | 替代项 | 说明 |
| --- | --- | --- |
| scrollX | `virtualXConfig` | 已废弃，仅为旧项目兼容保留。 |
| scrollY | `virtualYConfig` | 已废弃，仅为旧项目兼容保留。 |

**关于 `autoFlexColumn`**：

- **`true`**（默认）：自动为最后一列添加弹性宽度，填充剩余空间。适合大多数场景，表格会自动占满容器宽度。
- **`false`**：所有列严格按照 `width` 或 `minWidth` 显示，不会自动填充。适合需要精确控制每列宽度的场景。

**示例**：

```
<!-- 场景 1：默认行为 - 自动填充 -->
<YTable :columns="columns" :data="data" />

<!-- 场景 2：精确控制列宽 - 不自动填充 -->
<YTable 
  :columns="columns" 
  :data="data" 
  :auto-flex-column="false" 
/>
```

**常见问题**：

- 如果发现最后一列宽度设置不生效，很可能是 `autoFlexColumn=true` 导致的，可以设置为 `false` 解决。
- 如果表格右侧出现大量空白，可能是 `autoFlexColumn=false` 且所有列宽度之和小于容器宽度，可以增加某列的 `minWidth` 或设置 `autoFlexColumn=true`。

提示：若仅开启 `filterable` 而不提供 `filters`，组件不会再注入空数组，避免渲染抖动；如需内置筛选，请提供稳定引用的 `filters` 数组。

---

### 树形表格说明

YTable 会透传 vxe-table 原生属性，树形表格可通过 `tree-config` 开启，并在需要展示树节点缩进与展开图标的列上配置 `treeNode: true`。建议同时显式配置 `row-config.keyField`，保证树节点展开、选中与刷新状态稳定。

```vue | pure
<YTable
  :data="tableData"
  :columns="columns"
  :row-config="{ keyField: 'id', useKey: true }"
  :tree-config="{ rowField: 'id', parentField: 'parentId', childrenField: 'children' }"
/>
```

```typescript | pure
const columns = [
  { field: 'nodeName', title: '节点名称', treeNode: true },
  { field: 'nodeLevel', title: '节点层级' },
];
```

---

### 表格多选与批量操作说明

当业务需要 Checkbox 多选与批量操作（如批量删除、批量导出、批量启用）时，遵循以下规范：

1. **列配置**：首列声明 `{ type: 'checkbox', width: 50, fixed: 'left', align: 'center' }`。
2. **行唯一键**：必须显式指定 `:row-config="{ keyField: 'id', useKey: true }"`（`keyField` 与业务主键如 `userCode` 对齐）。
3. **受控双向绑定**：推荐优先使用 `v-model:selected-row-keys="selectedRowKeys"` 或 `v-model:selected-rows="selectedRows"`，或者统一监听 `@selection-change`。
4. **批量操作按钮**：直接放入 `#toolbar-right` 插槽，并配置 `:disabled="selectedRowKeys.length === 0"`。**无需配置 `toolbar-config.custom`**。
5. **清空选中态**：批量操作成功后，直接重置 `selectedRowKeys.value = []` 或调用 `tableRef.value.clearSelection()`。

```vue | pure
<script setup lang="ts">
import { ref } from 'vue';
import { YButton, YTable, type YTableSelectionChangePayload } from '@yss-ui/components';

const selectedRowKeys = ref<(string | number)[]>([]);
const tableRef = ref<InstanceType<typeof YTable> | null>(null);

const onSelectionChange = (payload: YTableSelectionChangePayload) => {
  console.log('当前选中项：', payload.selectedRows, payload.selectedRowKeys);
};

const handleBatchDelete = () => {
  // 批量删除业务逻辑...
  tableRef.value?.clearSelection();
};
</script>

<template>
  <YTable
    ref="tableRef"
    v-model:selected-row-keys="selectedRowKeys"
    :row-config="{ keyField: 'id', useKey: true }"
    :data="tableData"
    :columns="columns"
    @selection-change="onSelectionChange"
  >
    <template #toolbar-left>
      <span>已选中 {{ selectedRowKeys.length }} 项</span>
    </template>
    <template #toolbar-right>
      <YButton danger :disabled="selectedRowKeys.length === 0" @click="handleBatchDelete">
        批量删除
      </YButton>
    </template>
  </YTable>
</template>
```

---

### 插槽说明

插槽支持如下几类（在 HTML/JSP 等 DOM 模板中请一律使用 kebab-case）：

- **单元格内容（推荐）**：按列字段命名 `#<field>`（如 `#name`），仅作用于该列。
- **表头（推荐）**：`#<field>-header`（如 `#name-header`）优先于全局 `#header`。兼容旧写法 `#<field>Header`。
- **筛选面板**：按列字段命名 `#<field>-filter`（如 `#name-filter`），或全局 `#filter`；当某列未提供前者时会回退使用全局插槽。兼容旧写法 `#<field>Filter`。
- **展开行内容**：`#expand-row` / `#expandRow`，用于自定义展开行的内容。需配合列配置 `type: 'expand'` 使用。作用域参数包含 `row`（当前行数据）、`rowIndex`（行索引）等。
- **分组表头**：`#group-header` / `#groupHeader`，用于自定义分组表头的内容。仅在列配置包含 `children` 时生效。作用域参数包含 `column`（列配置）等。
- **工具栏**：`#toolbar-left`、`#toolbar-right` 分别位于 vxe-toolbar 左/右侧，便于在“列设置”按钮旁放置自定义操作。兼容旧写法 `#toolbarLeft`/`#toolbarRight`。
- **操作列“更多”图标**：`#action-more-icon` / `#actionMoreIcon` 更换收纳触发图标（适用于所有操作列）。

**提示**：DOM 模板（如 JSP、原生 HTML 模板）会将属性名统一转为小写，`#toolbarLeft` 会变为 `#toolbarleft` 导致匹配失败。因此我们统一推荐使用中划线（kebab-case）插槽名；为兼容历史代码，组件内部同时支持 camelCase，但后续将逐步以 kebab-case 为规范。

### 列配置 YTableColumn

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| field | `string` | - | 列对应字段名 |
| title | `string` | - | 列标题 |
| treeNode | `boolean` | - | 是否作为树节点列。开启树形表格时，设置为 `true` 的列会展示缩进与展开/收起图标 |
| width | `number \| string` | - | 列宽度。设置固定宽度后，列宽不会自动伸缩 |
| minWidth | `number \| string` | - | 最小列宽。当未设置 `width` 时生效，列宽会根据内容和剩余空间自动分配，但不会小于此值 |
| align | `'left' \| 'center' \| 'right'` | - | 内容对齐方式（同时作用于表头和单元格） |
| headerAlign | `'left' \| 'center' \| 'right'` | - | 表头对齐方式（优先级高于 `align`，仅作用于表头；分组表头同样生效） |
| type | `'seq' \| 'radio' \| 'checkbox' \| 'expand' \| 'drag' \| 'action'` | - | 特殊列类型。`seq`=序号列，`action`=操作列（组件自定义类型） |
| fixed | `'left' \| 'right'` | - | 固定列位置 |
| resizable | `boolean` | `true` (继承自 `columnConfig`) | 是否允许用户拖拽调整列宽 |
| sortable | `boolean` | - | 是否可排序 |
| filterable | `boolean` | - | 是否启用筛选功能（配合 `filters` 使用） |
| filters | `any[]` | - | 筛选配置数组，与 vxe-table 对齐。例如：`[{ label: '选项1', value: 1 }]` |
| filterMethod | `(params: any) => boolean` | - | 筛选方法。**本地筛选**：定义筛选逻辑，返回 `true` 表示该行通过筛选；**远程筛选**：返回 `() => true` 禁用本地筛选，数据由后端返回。参数包含 `value`、`option`、`row`、`cellValue` 等 |
| filterMultiple | `boolean` | `true` | 筛选是否支持多选 |
| formatter | `(params: any) => string \| number` | - | 单元格内容格式化函数，与 vxe-table 对齐 |
| isTransform | `boolean` | - | 是否启用字典翻译显示（配合 `optionsMap` 使用） |
| props | `Record<string, any>` | - | 扩展配置对象，如字典翻译的 `fieldNames: { label: 'name', value: 'id' }` |
| actionConfig | `YTableActionConfig` | - | 当 `type='action'` 时的列级操作配置（优先级高于顶层 `actionConfig`） |
| children | `YTableColumn[]` | - | 分组表头：子列配置（仅叶子列会渲染为实际列） |

> **提示**：
> - 当 `filterable=true` 时，如不需要内置筛选 UI，可直接省略 `filters`；如需远程筛选，请监听 `filter-change` 事件并更新数据源。
> - **远程筛选关键**：设置 `filterMethod: () => true` 禁用本地筛选，让数据直接显示（vxe-table 默认会对数据进行本地过滤，即使数据已从后端获取）。
> - `width` 与 `minWidth` 的区别：`width` 是固定宽度，`minWidth` 是弹性宽度（会根据剩余空间自动分配）。
> - 如需禁止某列调整宽度，设置 `resizable: false`。

**筛选使用示例**：

```typescript
// 本地筛选（前端过滤）
{
  field: 'name',
  filterable: true,
  filters: [{ data: '' }],
  filterMethod: ({ option, cellValue }) => {
    const keyword = String(option?.data || '').trim();
    if (!keyword) return true;
    return String(cellValue || '').includes(keyword);
  }
}

// 远程筛选（后端接口）
{
  field: 'name',
  filterable: true,
  filters: [{ data: '' }],
  // ✅ 关键：返回 true 禁用本地筛选，数据由后端返回
  filterMethod: () => true,
}
```


### 分页 YTablePagination

YTable 的分页基于 Ant Design Vue 的 `Pagination` 组件，**支持几乎所有 AntD Pagination 的 API**（通过 `v-bind` 透传）。

**类型继承与扩展**：
- 继承自 `ant-design-vue@^4` 的 `PaginationProps`。
- **移除了事件类 props**：`onChange`、`onShowSizeChange`、`onUpdate:current`、`onUpdate:pageSize`（请使用组件事件 `page-change`、`size-change`、`update:pagination`）。
- **扩展属性**：`remote?: boolean` 用于声明是否远程分页。
- **类型收窄**：`showQuickJumper` 仅支持 `boolean`（AntD 原生支持对象配置，我们简化为布尔值）。
- **类型扩展**：`pageSizeOptions` 支持 `(number | string)[]`（更灵活）。

**常用属性**：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| current | `number` | 1 | 当前页码 |
| pageSize | `number` | 20 | 每页条数 |
| total | `number` | 0 | 数据总数（`remote=true` 时由外部传入；`remote=false` 时组件自动计算） |
| remote | `boolean` | 自动推断 | 是否远程分页。未显式设置时：若 `total>0` 自动视为远程分页（不对数据做前端 `slice`） |
| size | `'small' \| 'default'` | `'small'` | 分页器尺寸 |
| showSizeChanger | `boolean` | `true` | 是否显示每页条数切换器 |
| showQuickJumper | `boolean` | `true` | 是否显示快速跳转输入框 |
| pageSizeOptions | `(number \| string)[]` | `['20','50','100','200']` | 每页条数选项列表 |
| showTotal | `(total, range) => string` | `(t) => \`共 ${t} 条\`` | 自定义总数展示函数 |
| disabled | `boolean` | `false` | 是否禁用分页 |
| hideOnSinglePage | `boolean` | `false` | 只有一页时是否隐藏分页器 |
| simple | `boolean` | `false` | 是否使用简单模式 |
| responsive | `boolean` | `false` | 是否响应式显示（窄屏幕时自动收缩） |
| showLessItems | `boolean` | `false` | 是否显示较少的页码 |
| itemRender | `Function` | - | 自定义分页项渲染函数 |

**透传支持**：

除上述常用属性外，YTable 通过 `v-bind="innerPagination"` 将分页配置透传给 AntD Pagination，因此 **Ant Design Vue Pagination 的其他所有属性均可使用**（除了已移除的事件类 props）。

分页配置支持"部分传入"，组件会基于默认值进行合并（如仅传 `{ remote: true }`）。

**使用示例**：
```
<YTable
  :data="tableData"
  :columns="columns"
  pageable
  :pagination="{
    current: 1,
    pageSize: 20,
    total: 100,
    remote: true,          // 远程分页
    simple: false,         // 完整模式
    responsive: true,      // 响应式
    showTotal: (total) => `共 ${total} 条记录`,
  }"
  @page-change="handlePageChange"
/>
```

### 操作列配置 YTableActionConfig

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| title | `string` | 操作 | 列标题 |
| width | `number` | 120 | 列宽 |
| align | `'left' \| 'center' \| 'right'` | center | 对齐方式 |
| fixed | `'left' \| 'right'` | right | 固定方向 |
| displayLimit | `number` | 3 | 直显按钮个数，超出收纳到"更多" |
| moreRenderType | `'ellipsis' \| 'moreButton'` | moreButton | 更多展现形式：`ellipsis` 显示省略号图标，`moreButton` 显示"更多"文字按钮 |
| buttons | `ActionButtonConfig[]` | [] | 按钮配置数组 |

### 操作按钮配置 ActionButtonConfig

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| key | `string \| number` | - | 按钮唯一标识（兼容旧写法） |
| value | `string \| number` | - | 按钮唯一标识（推荐配置写法，会回退给 `key`） |
| text | `string` | - | 按钮文案（兼容旧写法） |
| label | `string` | - | 按钮文案（推荐配置写法，会回退给 `text`） |
| type | `'text' \| 'link' \| 'primary' \| 'default'` | `text` | 按钮风格 |
| permissionCode | `string` | - | 权限码，传入后会根据权限控制按钮显示/禁用 |
| fallback | `'hide' \| 'disable'` | `hide` | 无权限时的处理方式：`hide` 隐藏按钮，`disable` 禁用按钮 |
| hideFn | `(scope) => boolean` | - | 动态控制按钮是否隐藏，返回 `true` 则隐藏。`scope` 包含 `{ row, rowIndex, column }` |
| disabledFn | `(scope) => boolean` | - | 动态控制按钮是否禁用，返回 `true` 则禁用。`scope` 包含 `{ row, rowIndex, column }` |
| isConfirm | `boolean` | `false` | 是否启用二次确认（点击时弹出确认框） |
| confirmProps | `object` | - | 二次确认配置，详见下方 |
| clickFn | `(scope, btn, helpers) => void \| Promise<void>` | - | 按钮点击回调函数，详见下方 |
| click | `(scope, btn, helpers) => void \| Promise<void>` | - | 按钮点击回调函数（推荐配置写法，会回退给 `clickFn`） |

> `label/value/click` 与 `text/key/clickFn` 等价，组件会在渲染前统一归一化。原有 `key/text/clickFn` 配置保持兼容。

```typescript
const actionConfig: YTableActionConfig = {
  buttons: [
    {
      label: '查看',
      value: 'view',
      click: ({ row }) => {
        console.log(row)
      }
    }
  ]
}
```

**confirmProps 配置**：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| title | `string` | `确定要执行此操作吗？` | 确认框标题 |
| okText | `string` | `确定` | 确认按钮文字 |
| cancelText | `string` | `取消` | 取消按钮文字 |
| needLoading | `boolean` | `false` | 是否在确认后显示 loading 状态（需配合 `clickFn` 中的 `helpers.hideLoading()` 手动关闭） |
| popProps | `Record<string, any>` | - | 透传给 `Popconfirm` 的其他属性（如 `placement`、`icon` 等） |

**clickFn 回调参数**：

```typescript
clickFn?: (scope, btn, helpers) => void | Promise<void>
click?: (scope, btn, helpers) => void | Promise<void>

// scope: { row, rowIndex, column } - 当前行数据、行索引、列配置
// btn: ActionButtonConfig - 当前按钮配置
// helpers: {
//   close: () => void        // 关闭确认框（仅 isConfirm=true 时有效）
//   hideLoading: () => void  // 关闭 loading 状态（仅 needLoading=true 时有效）
// }
```

> **“更多”菜单关闭规则**：点击普通操作后菜单会立即关闭；启用 `isConfirm` 时，点击操作只打开气泡确认框，确认或取消后再关闭“更多”菜单；禁用操作不会触发关闭。分页、虚拟滚动或权限变化导致当前行/收纳操作集合变化时，组件也会自动清理旧菜单，避免浮层残留。

> **`displayLimit` 边界处理**：`0` 表示全部操作收纳到“更多”；负数按 `0` 处理，小数向下取整，`NaN` 回退为默认值 `3`。

### 事件

| 事件名 | 回调参数 | 说明 |
| --- | --- | --- |
| selection-change | `(payload: YTableSelectionChangePayload) => void` | 统一表格行选择变动事件（单选/全选均会触发，返回包含 `selectedRows`, `selectedRowKeys`, `records`, `row`, `checked`, `event`） |
| checkbox-change | `(params: any) => void` | vxe-table 原生多选单行变动事件 |
| checkbox-all | `(params: any) => void` | vxe-table 原生多选表头全选事件 |
| current-row-change | `params` | 当前行变更（vxe-table 原生事件） |
| current-change | `params` | 兼容旧事件，等同 `current-row-change` |
| cell-click | `params` | 单元格点击（vxe-table 原生事件） |
| edit-closed | `params` | 关闭编辑（vxe-table 原生事件） |
| edit-activated | `params` | 激活编辑（vxe-table 原生事件） |
| filter-change | `params: { column, values, datas, ... }` | 筛选条件变化。`column` 为触发筛选的列配置，`values` 为选中的值列表（多选筛选），`datas` 为自定义筛选的数据（如输入框内容）。详见下方说明 |
| page-change | `{ current: number, pageSize: number }` | 分页变化（页码或每页条数改变时触发） |
| size-change | `pageSize: number` | 每页条数变化 |
| update:selectedRows | `(selectedRows: any[]) => void` | 受控选中行列表变动（用于 `v-model:selectedRows`） |
| update:selectedRowKeys | `(selectedRowKeys: (string \| number)[]) => void` | 受控选中行 Key 列表变动（用于 `v-model:selectedRowKeys`） |
| update:pagination | `pagination: YTablePagination` | 受控分页同步（用于 `v-model:pagination`） |
| update:data | `data: any[]` | 受控数据同步（用于 `v-model:data`，行拖拽时触发） |
| row-dragend | `data: any[]` | 行拖拽结束，参数为拖拽后的完整数据数组 |

**`filter-change` 事件参数详解**：

触发时机：用户在列筛选面板中确认筛选条件后触发。

参数结构（从 vxe-table 透传）：
```typescript
{
  column: YTableColumn,     // 触发筛选的列配置对象
  values: any[],            // 选中的值列表（适用于多选筛选，如复选框列表）
  datas: any[],             // 自定义筛选数据（适用于自定义筛选面板，如输入框内容、日期范围等）
  filters: any[],           // 当前列的 filters 配置
  // ... 其他 vxe-table 原生参数
}
```

使用示例：
```
<YTable @filter-change="handleFilterChange" />

const handleFilterChange = (params) => {
  const { column, values, datas } = params
  const field = column?.field
  
  if (field === 'name') {
    // 自定义筛选（输入框）使用 datas
    const [keyword] = datas || []
    tableData.value = allData.filter(row => row.name.includes(keyword))
  } else if (field === 'status') {
    // 多选筛选使用 values
    tableData.value = allData.filter(row => values.includes(row.status))
  }
}
```

### 实例方法（通过 `ref` 调用）

| 方法 | 说明 |
| --- | --- |
| `getTableInstance()` | 获取底层 vxe-table 实例 |
| `refresh()` | 刷新表格数据 |
| `recalculate()` | 重新计算表格布局 |
| `clearSelection()` | 清除多选勾选状态（同时同步受控绑定） |
| `getSelectedRows()` | 获取当前选中的行数据列表 |
| `getSelectedRowKeys()` | 获取当前选中的行 Key 列表 |
| `setSelection()` | 设置选中行（支持传入行对象列表或 Key 列表，第二个参数可选指定选中/取消） |
| `syncSelection()` | 手动触发选中状态同步 |
| `getPaginationInstance()` | 获取 Ant Design Vue Pagination 实例 |

### Types

`YTableProps`、`YTableColumn`、`YTablePagination`、`YTableActionConfig`、`ActionButtonConfig`、`YTableSelectionChangePayload` 等包装层类型可从 `@yss-ui/components` 导入；VXE 原生类型仍从 `vxe-table` 导入。
