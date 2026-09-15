---
title: EditTable 编辑表格
route: /components/edit-table
toc: content
---

# EditTable 可编辑表格

基于 vxe-table 4.19.10 封装的可编辑表格组件，支持行内编辑、校验、自定义列、字典转换、下拉过滤、行拖拽排序、操作列与分页等能力。

### 统一消费与构建契约

- 默认单包安装，从 `@yss-ui/components` 具名导入并局部注册；不全局安装 YSSUI，不拆新的功能包。
- `@yss-ui/components/table`、`@yss-ui/components/formily` 自 1.6.7 起公开，是可选入口；旧版本先核对 exports，禁止批量改写根入口。
- 子路径与插件改善加载边界，不减少默认安装依赖；VXE/Formily 仍由组件库配套安装。
- 官方 `@yss-ui/components/vite` 插件目标版本 1.7.0，Vite 6 模板统一接入。旧项目先读取实际安装版本、exports 和现有插件，禁止与旧隔离插件同时运行。
- 生成代码前用 MCP `get_consumption_contract` 核对版本；未知版本不得假设新插件可用。文档站 Demo 的样式导入不能直接复制为业务全局样式策略。

## 基础使用

<code id="demo-edit-table-basic" src="./demos/edit-table/basic/index.vue"></code>

## 表单类型

<code id="demo-edit-table-all-types" src="./demos/edit-table/all-types/index.vue"></code>

## 同列按行切换编辑器

列配置的 `component` 支持函数形式，函数会收到 `{ row, field, column }`，可根据当前行返回不同的内置编辑器。非编辑态仍展示文本，进入编辑态后才渲染对应表单控件。

<code id="demo-edit-table-dynamic-editor" src="./demos/edit-table/dynamic-editor/index.vue"></code>

## 行级编辑保存（编辑/保存/取消）

点击"编辑"按钮进入编辑态，通过"保存"按钮提交修改（包含校验），通过"取消"按钮放弃修改并还原数据。

<code id="demo-edit-table-row-edit" src="./demos/edit-table/row-edit/index.vue"></code>

## 必填项校验（editRules）

<code id="demo-edit-table-required" src="./demos/edit-table/required/index.vue"></code>

## 自定义校验（去重/长度）

<code id="demo-edit-table-custom-rule" src="./demos/edit-table/custom-rule/index.vue"></code>

## 下拉过滤（按行过滤 filterOptions）

> 此处的「下拉过滤」指编辑态下拉候选的行级过滤（`filterOptions`），与下方的「表头列筛选」是两回事，请勿混淆。

<code id="demo-edit-table-row-options-filter" src="./demos/edit-table/row-options-filter/index.vue"></code>

## 表头列筛选（与 YTable 对齐）

可编辑表格支持与 `YTable` 一致的表头列筛选能力。列配置 `filterable: true` 后，可通过以下两种方式渲染筛选面板：

- **内置渲染器（推荐，最省事）**：设置 `filterRender: { name: 'VxeInput', props: { clearable: true, placeholder: '请输入关键词' } }`，无需写插槽即可获得文本筛选输入框。
- **自定义筛选面板**：通过插槽 `#<field>-filter`（兼容 `#<field>Filter` / 全局 `#filter`）完全自定义面板内容；面板内修改 `option.data` 后需调用 `getTableInstance().updateFilterOptionStatus(option, !!option.data)` 同步选项状态。

> 两种方式都必须提供 `filters`（如 `[{ data: '' }]` 或多选项数组）与本地 `filterMethod`；多选筛选设置 `filterMultiple: true`。切换数据源或新增行时，可调用 `getTableInstance().clearFilter()` 清空筛选状态。筛选变化会触发 `filter-change` 事件。

<code id="demo-edit-table-column-filter" src="./demos/edit-table/column-filter/index.vue"></code>

## 行拖拽排序

<code id="demo-edit-table-drag" src="./demos/edit-table/drag/index.vue"></code>

## 分页

<code id="demo-edit-table-pagination-action" src="./demos/edit-table/pagination-action/index.vue"></code>

## 配置引用写法

<code id="demo-edit-table-config-reference" src="./demos/edit-table/config-reference/index.vue"></code>

## 行级字典（rowOptionsFieldName）

当“每一行”的下拉候选不同，或不希望全局字典变化后历史值退化为 code 时，可使用行级字典覆盖。组件读取每行对象上 `rowOptionsFieldName` 指定的字段（默认 `'options'`）作为该行的候选项，优先级：行级 > 列级 `options` > 全局 `optionsMap[field]`。

适用场景：
- 某列候选项依赖该行的其它字段（如产品→版本），不同的行候选不同；
- 版本等选项来源于后端联动接口，只想影响当前行而非整体；
- 全局 `optionsMap` 切换时，已选择的历史值仍需被正确翻译展示。

示例：

<code id="demo-edit-table-row-options" src="./demos/edit-table/row-options/index.vue"></code>

## 直接可编辑（默认进入编辑态）

<code id="demo-edit-table-direct-editable" src="./demos/edit-table/direct-editable/index.vue"></code>

## 字段联动（Select 反显到 Input，并联动其他列）

<code id="demo-edit-table-linkage" src="./demos/edit-table/linkage/index.vue"></code>

## 字段级禁用与数据清空联动

当改变表格中某一列（如“算法构成类型”）的选择值时，能够动态控制该行其他列（如“前推数”与“时间窗口”）的禁用状态，并且在切回特定选项（如“手工录入”）时自动清空所填写的数据。

可以通过在列配置中指定 `cellProps` 返回动态的 `disabled` 属性（属性级禁用联动），并在表格的 `@update-row` 事件中响应数据修改，直接清空关联字段（数据级清空联动）。

<code id="demo-edit-table-scenario-linkage" src="./demos/edit-table/scenario-linkage/index.vue"></code>

## 异步接口联动（同列按行选择触发服务端切换）
<code id="demo-edit-table-async-remote" src="./demos/edit-table/async-remote/index.vue"></code>


## 自定义插槽渲染（控件层联动）

<code id="demo-edit-table-slot-linkage" src="./demos/edit-table/slot-linkage/index.vue"></code>

## 大数据无分页（滚动渲染）

<code id="demo-edit-table-big-data" src="./demos/edit-table/big-data/index.vue"></code>

## 提交后展示保存的数据

<code id="demo-edit-table-submit-view" src="./demos/edit-table/submit-view/index.vue"></code>

## API

YEditTable 当前基于 `vxe-table@4.19.10`。组件自有能力使用顶层 Props；底层 VXE Table 的扩展能力通过 `tableConfig` 或 `$attrs` 透传，本文不复制上游完整 API。

### YEditTable Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `data` | `any[]` | `[]` | 表格数据（支持 `v-model:data`） |
| `columns` | `Array<YEditColumn>` | `[]` | 列配置（见下） |
| `tableConfig` | `Record<string, any>` | `{}` | vxe-table 配置聚合（兼容 v4：`rowConfig/cellConfig/columnConfig/editConfig/tooltipConfig/validConfig/...`） |
| `optionsMap` | `Record<string, any[]>` | `{}` | 字典数据映射，按列 `field` 取值 |
| `rowOptionsFieldName` | `string` | `'options'` | 行级字典字段名（用于每行覆盖候选项，优先级最高） |
| `disabled` | `boolean` | `false` | 禁用编辑 |
| `loading` | `boolean` | `false` | 加载中 |
| `maxHeight` | `number \| string` | `-` | 最大高度 |
| `actionConfig` | `YTableActionConfig` | `{ buttons: [] }` | 列级 `type:'action'` 使用的按钮配置（不默认追加） |
| `rowDragable` | `boolean` | `false` | 是否开启行拖拽（v4 `rowDragConfig`） |
| `showDragHandle` | `boolean` | `true` | 是否显示拖拽把手列 |
| `dragHandleWidth` | `number \| string` | `46` | 把手列宽 |
| `dragHandlePlacement` | `'left' \| 'right'` | `'left'` | 拖拽把手列位置（左侧或右侧） |
| `dragHandleFixed` | `boolean \| 'left' \| 'right'` | `false` | 拖拽把手列是否固定。`false` 不固定，`true` 自动根据 `dragHandlePlacement` 决定，`'left'/'right'` 明确指定固定方向 |
| `rowDragConfig` | `VxeTablePropTypes.RowDragConfig` | `-` | 行拖拽配置（合并到内置配置） |
| `toolbarConfig` | `{ custom?: boolean }` | `{ custom:false }` | 工具栏配置（最小：开启列设置） |
| `expandConfig` | `VxeTablePropTypes.ExpandConfig` | `{}` | 展开行配置 |
| `pageable` | `boolean` | `false` | 是否分页（Ant Design Vue Pagination） |
| `pagination` | `{ current, pageSize, total?, remote?, showSizeChanger?, showQuickJumper?, pageSizeOptions? }` | `{ current:1,pageSize:20,... }` | 分页配置 |
| `addable` | `boolean` | `false` | 是否显示“添 加”按钮 |
| `addBtnText` | `string` | `'添 加'` | “添 加”按钮文案 |
| `addPosition` | `'top' \| 'bottom'` | `'bottom'` | 点击“添 加”按钮时，新行插入的位置（顶部或底部） |
| `autoScrollOnAdd`| `boolean` | `true` | 点击“添 加”按钮新增行后，是否自动滚动到新行位置 |
| `errorTooltipConfig` | `false \| YEditTableErrorTooltipConfig` | `{ mode:'active', placement:'topLeft', maxWidth:260 }` | 校验错误 Tooltip 展示配置；传 `false` 关闭气泡，仅保留错误红框 |

### vxe-table 配置透传

`YEditTable` 类型继承 `vxe-table` 的 `VxeTableProps`。除上方列出的组件特有属性外，理论上 vxe-table 的表格能力都可以通过两种方式配置：

1. **直接写在组件上**：适合少量配置，例如 `:keyboard-config="{ isEdit: true }"`、`:mouse-config="{ selected: true }"`。
2. **写入 `tableConfig` 聚合对象**：适合集中维护配置，例如 `rowConfig`、`cellConfig`、`columnConfig`、`editConfig`、`tooltipConfig`、`validConfig`、`sortConfig`、`filterConfig`、`keyboardConfig`、`mouseConfig`、`~~scrollY~~`（已废弃）、`virtualXConfig`、`virtualYConfig`、`aggregateConfig`、`aggregateAccuracyConfig` 等。

vxe-table 4.19.x 新增或增强的原生配置也会继续透传，例如 `aggregateConfig`、`aggregateAccuracyConfig`，以及 `tooltipConfig.defaultPlacement`、`tooltipConfig.popupClassName`、`tooltipConfig.useHTML`。

组件会对以下配置做默认值合并，业务传入值优先生效：

- `rowConfig`：默认 `{ keyField:'_X_ROW_KEY', useKey:true }`，开启拖拽时会合并 `drag:true`。（~~rowConfig.height 已废弃~~，行高设置请使用 `cellConfig.height`）
- `cellConfig`：单元格配置，默认保留 vxe-table 行为，可传入 `height` 配置数据行高（用于代替原废弃的 `rowConfig.height`）。
- `columnConfig`：默认 `{ resizable:true, useKey:true }`。
- `editConfig`：默认 `{ enabled: !disabled, trigger:'click', mode:'row', autoClear:true }`。
- `tooltipConfig`：默认 `{ enterable:true, contentMethod: 内置文本清洗 }`，传入 `contentMethod` 可完全覆盖内置提示内容。
- `virtualXConfig`：默认智能开启横向虚拟滚动 `{ enabled: true, gt: 50 }`，列数超过 50 列时自动启用；支持通过直接 Props 或 `tableConfig.virtualXConfig` 传入。兼容废弃属性 `scrollX`。
- `virtualYConfig`：默认智能开启纵向虚拟滚动 `{ enabled: true, gt: 100 }`，数据行超过 100 行时自动启用；支持通过直接 Props 或 `tableConfig.virtualYConfig` 传入。兼容废弃属性 `scrollY`。
- `scrollX` / `scrollY`：~~已废弃~~，分别被 `virtualXConfig` 与 `virtualYConfig` 替代。直接传参或在 `tableConfig` 中设置均会平滑兼容映射。

> 若同时使用组件顶层 vxe 属性与 `tableConfig`，顶层属性优先级更高；组件特有 props（如 `toolbarConfig`、`expandConfig`、`rowDragConfig`）会按组件语义继续合并或覆盖。

### YEditTableErrorTooltipConfig

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'active' \| 'hover' \| 'always' \| 'none'` | `'active'` | 错误气泡展示策略；`active` 仅自动展开当前激活错误，其它错误悬浮展示 |
| `placement` | `string` | `'topLeft'` | Tooltip 位置，透传给 Ant Design Vue Tooltip |
| `maxWidth` | `number \| string` | `260` | Tooltip 内容最大宽度，数字按 px 处理 |
| `overlayClassName` | `string` | - | 追加的浮层 class |
| `overlayInnerStyle` | `Record<string, any>` | - | 透传给 Tooltip 的内部样式，会与默认换行样式合并 |
| `mouseEnterDelay` | `number` | - | 鼠标移入延迟，单位秒 |
| `mouseLeaveDelay` | `number` | - | 鼠标移出延迟，单位秒 |
| `autoAdjustOverflow` | `boolean \| Record<string, any>` | `true` | 是否自动调整浮层位置 |
| `zIndex` | `number` | - | 浮层层级 |
| `getPopupContainer` | `(triggerNode?: HTMLElement) => HTMLElement` | `document.body` | 自定义浮层挂载容器 |

### 事件

| 事件名 | 参数 | 说明 |
| --- | --- | --- |
| `update:data` | `data: any[]` | v-model:data 回写 |
| `updateRow` | `{ row, key, value }` | 单元格变更回调 |
| `add` | `-` | 点击“添 加” |
| `delete` | `scope, btn, helpers` | 删除操作回调。`scope` 包含 `{ row, rowIndex, column }`，`btn` 为按钮配置，`helpers` 包含 `{ close, hideLoading }` 方法 |
| `page-change` | `{ current, pageSize }` | 分页变更 |
| `size-change` | `pageSize: number` | 页大小变更 |
| `filter-change` | `params` | 表头列筛选变化（透传 vxe 参数，含 `column`/`filterList` 等），可用于远程筛选 |

### 插槽说明

插槽支持如下几类（在 HTML/JSP 等 DOM 模板中请一律使用 kebab-case）：

- **单元格内容（推荐）**：按列字段命名 `#<field>`（如 `#name`），仅作用于该列的非编辑态显示。作用域参数包含 `row`（当前行数据）、`column`（列配置）、`rowIndex`（行索引）。
- **表头（推荐）**：`#<field>-header`（如 `#name-header`）优先于全局 `#header`。兼容旧写法 `#<field>Header`。
- **自定义筛选面板**：`#<field>-filter`（如 `#name-filter`）优先于全局 `#filter`，兼容旧写法 `#<field>Filter`。需配合列配置 `filterable: true` 与 `filters`/`filterMethod` 使用。作用域参数包含 `column`（含 `filters`）、`$panel` 等。
- **展开行内容**：`#expand-row` / `#expandRow`，用于自定义展开行的内容。需配合列配置 `type: 'expand'` 使用。作用域参数包含 `row`、`rowIndex` 等。
- **分组表头**：`#group-header` / `#groupHeader`，用于自定义分组表头的内容。仅在列配置包含 `children` 时生效。作用域参数包含 `column` 等。
- **操作列"更多"图标**：`#action-more-icon` / `#actionMoreIcon` 更换收纳触发图标（适用于所有操作列）。

**提示**：DOM 模板（如 JSP、原生 HTML 模板）会将属性名统一转为小写，`#nameHeader` 会变为 `#nameheader` 导致匹配失败。因此我们统一推荐使用中划线（kebab-case）插槽名；为兼容历史代码，组件内部同时支持 camelCase，但后续将逐步以 kebab-case 为规范。


### Expose（通过 ref 获取）

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `getTableInstance` | `() => VxeTable` | 获取 vxe 实例 |
| `validate` | `() => Promise<{ valid: boolean; errorMsg: Map<string,string> }>` | 触发表格校验（含必填与自定义） |

### 列配置（YEditColumn）

在 `vxe-column` 基础上扩展以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `field` | `string` | 字段名 |
| `title` | `string` | 列标题 |
| `component` | `YEditComponentName \| ((ctx: { row, field, column }) => YEditComponentName)` | 编辑器类型（基于 Ant Design Vue）；函数形式可根据当前行动态返回不同编辑器，解析函数应保持为无副作用的纯函数 |
| `props` | `Record<string,any>` | 透传编辑器 props；<br />`Select` 支持 `fieldNames`、`multiple`、`allowCreate(tags)`；<br />`TreeSelect/Cascader` 支持 `fieldNames:{ label,value,children }`；`Switch/Checkbox` 支持 `trueText/falseText`（查看态显示文案）；`TreeSelect` 支持 `treeNodeFilterProp`（默认按 `label` 过滤）；<br />`DatePicker` 支持 `format/valueFormat`，并默认 `getPopupContainer: () => document.body` |
| `cellProps` | `(ctx) => Record<string,any>` | 单元格级动态 props 函数。按行/按值返回透传给编辑器的 props，与 `props` 合并后生效，优先级高于 `props`。<br />**参数**：`{ row, field, column }`<br />**使用场景**：为特定行的单元格定制交互，如仅当前行的 Select 显示 loading，或根据行数据动态禁用某些选项。详见下方示例 |
| `isTransform` | `boolean` | 查看态字典翻译（基于 `optionsMap`） |
| `formatter` | `(ctx) => string \| number` | 自定义查看态文本渲染函数。若提供，优先于内置翻译。<br />**参数**：`{ cellValue, row, column, transformed }`<br />- `cellValue`：当前单元格的原始值<br />- `row`：当前行数据<br />- `column`：列配置<br />- `transformed`：组件根据字典翻译/路径计算好的文本，可直接复用或自定义拼接 |
| `filterOptions` | `(ctx) => any[]` | 行级下拉过滤器（编辑态下拉候选）。参数：`{ field, optionsMap, row }` |
| `filterable` | `boolean` | 是否开启该列表头筛选 |
| `filters` | `any[]` | 筛选项配置，与 vxe 对齐。文本筛选常用 `[{ data: '' }]`，多选用 `[{ label, value }]` |
| `filterMethod` | `(params) => boolean` | 本地筛选方法。参数含 `{ option, values, cellValue, row, column }`，返回 `true` 表示保留该行 |
| `filterMultiple` | `boolean` | 是否多选筛选 |
| `filterRender` | `Record<string, any>` | 内置筛选渲染器配置，如 `{ name: 'VxeInput', props: {...} }`；不设置时可用 `#<field>-filter` 插槽自定义面板 |
| `customRule` | `(value, row, field, tableData) => { errMsg?: string }` | 自定义校验函数 |
| `options` | `any[]` | 行内写死下拉数据（优先于 `optionsMap[field]`） |

**`cellProps` 使用示例**：

```typescript
{
  field: 'status',
  component: 'form-item-select',
  props: {
    placeholder: '请选择状态'
  },
  // 仅当前行正在加载时显示 loading
  cellProps: ({ row }) => ({
    loading: row.isLoadingStatus === true,
    disabled: row.locked === true
  })
}
```

**`formatter` 使用示例**：

```typescript
{
  field: 'status',
  component: 'form-item-select',
  isTransform: true,
  // 在字典翻译的基础上添加图标
  formatter: ({ cellValue, transformed }) => {
    const icons = { 1: '✅', 2: '⏸', 3: '❌' }
    return `${icons[cellValue] || ''} ${transformed}`
  }
}
```

> 其余 `vxe-column` 原生属性（如 `width/sortable/fixed/filters/filterMethod/...`）保持透传。

### 操作列（YTableActionConfig）

不再默认追加操作列。如需操作列，请在 `columns` 中显式声明 `{ type: 'action', actionConfig }` 或自行插槽渲染。沿用 `y-table` 的按钮配置，按权限/禁用/隐藏、二次确认与异步 loading 全部可用：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | `string` | 列标题（默认“操作”） |
| `width` | `number` | 列宽（默认 120） |
| `align` | `'left' | 'center' | 'right'` | 对齐方式（默认 'center'） |
| `fixed` | `'left' | 'right'` | 是否固定（默认 'right'） |
| `displayLimit` | `number` | 直显按钮个数（默认 3） |
| `moreRenderType` | `'ellipsis' | 'moreButton'` | 更多的展示形式（默认 'moreButton'） |
| `buttons` | `ActionButtonConfig[]` | 按钮列表（支持 `label/value/click`，也兼容 `key/text/clickFn` 等旧配置） |

### 操作按钮（ActionButtonConfig）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `label` | `string` | 按钮文案（推荐配置写法，会回退给 `text`） |
| `value` | `string \| number` | 按钮唯一标识（推荐配置写法，会回退给 `key`） |
| `click` | `(scope, btn, helpers) => void \| Promise<void>` | 点击回调（推荐配置写法，会回退给 `clickFn`） |
| `text` | `string` | 按钮文案（兼容旧写法） |
| `key` | `string \| number` | 按钮唯一标识（兼容旧写法） |
| `clickFn` | `(scope, btn, helpers) => void \| Promise<void>` | 点击回调（兼容旧写法） |
| `type` | `'text' \| 'link' \| 'primary' \| 'default'` | 按钮风格 |
| `permissionCode` | `string` | 权限码 |
| `fallback` | `'hide' \| 'disable'` | 无权限时隐藏或禁用 |
| `hideFn` | `(scope) => boolean` | 返回 `true` 时隐藏 |
| `disabledFn` | `(scope) => boolean` | 返回 `true` 时禁用 |
| `isConfirm` | `boolean` | 是否二次确认 |
| `confirmProps` | `{ title?, okText?, cancelText?, needLoading?, popProps? }` | 二次确认配置 |

```typescript
const actionConfig: YTableActionConfig = {
  buttons: [
    {
      label: '删除',
      value: 'delete',
      isConfirm: true,
      click: (scope, _btn, { close, hideLoading }) => onDelete(scope, { close, hideLoading })
    }
  ]
}
```


> 属性优先级（从高到低）：`columns[i]` 上显式配置 > `columns[i].actionConfig` > 组件 `props.actionConfig` > 内置默认值（`title:'操作'`、`align:'center'`、`fixed:'right'`、`width:120`）。
>
> 因此：当列未显式写 `align/width/fixed/title` 时，可以只在 `actionConfig` 中统一配置这些列级属性。

### Types

`YEditTableProps`、`YEditColumn`、`YTableActionConfig`、`ActionButtonConfig` 等相关类型可从 `@yss-ui/components` 进行类型导入；VXE 原生类型仍从 `vxe-table` 导入。
