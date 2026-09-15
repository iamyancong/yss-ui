---
title: Formily 表单
nav: 组件
group:
  title: 表单
  order: 2
toc: content
---

### 统一消费与构建契约

- 默认单包安装，从 `@yss-ui/components` 具名导入并局部注册；不全局安装 YSSUI，不拆新的功能包。
- `@yss-ui/components/table`、`@yss-ui/components/formily` 自 1.6.7 起公开，是可选入口；旧版本先核对 exports，禁止批量改写根入口。
- 子路径与插件改善加载边界，不减少默认安装依赖；VXE/Formily 仍由组件库配套安装。
- 官方 `@yss-ui/components/vite` 插件目标版本 1.7.0，Vite 6 模板统一接入。旧项目先读取实际安装版本、exports 和现有插件，禁止与旧隔离插件同时运行。
- 生成代码前用 MCP `get_consumption_contract` 核对版本；未知版本不得假设新插件可用。文档站 Demo 的样式导入不能直接复制为业务全局样式策略。

## 入门与学习路径

- 基础概念：理解 JSON Schema 与 UI Schema 的区别，熟悉 `x-component`、`x-decorator`、`x-component-props`、`x-visible`、`x-disabled`、`x-reactions`。
- 表达式与联动：掌握 `'{{ }}'` 表达式，使用 `x-reactions` 实现显隐/禁用/赋值。
- 事件与副作用：区分组件事件（`x-component-props`）、`x-reactions` 和表单级 `effects` 的使用场景。
- 扩展与定制：通过 `components` 注册自定义组件、`scope` 注入工具方法。
- 实战与优化：模式/只读、性能与可维护性。

## 官方文档速查

- **表单 Form** (核心 API): [https://core.formilyjs.org/zh-CN/api/models/form](https://core.formilyjs.org/zh-CN/api/models/form)
- **Schema 属性** (`x-component`, `x-decorator`, `x-visible`, `x-reactions` 等): [https://vue.formilyjs.org/api/shared/schema.html#属性](https://vue.formilyjs.org/api/shared/schema.html#属性)

## 事件写法速查

| 场景 | 建议写法 | 说明 |
| --- | --- | --- |
| 输入即触发 | `x-component-props.onUpdate:value` | 更贴近 v-model 行为 |
| 选择/失焦触发 | `x-component-props.onChange` 或 `@change` | 以底层 antdv 组件事件为准 |
| 跨字段操作（就近） | `scope` 注入函数，在 `x-component-props` 中引用 | 复用/可测试 |
| 跨字段联动 | `x-reactions` | 结构化依赖，更直观 |
| 表单级行为 | `createForm({ effects })` + `onFieldValueChange`/`onFormSubmit` | 处理埋点/异步/复杂逻辑 |
| 提交回调 | `Submit.x-component-props.onSubmit` | 校验通过后拿到 `values` |

> 注意：事件名以底层组件为准（此处是 Ant Design Vue 生态）。输入类优先监听 `onUpdate:value`，选择类常用 `onChange`/`@change`。

## 基础使用（JSON Schema）

<code src="./demos/formily/basic.vue"></code>

## 对齐方式

<code src="./demos/formily/align.vue"></code>

## 栅格布局

<code src="./demos/formily/grid.vue"></code>

## 查询表单展开/收起

`collapsible` 默认为 `false`。开启后，组件会按 FormGrid 当前实际响应式行数判断：默认收起保留首行，当表单达到 2 行及以上时显示展开/收起入口。

<code src="./demos/formily/search-collapse.vue" title="自定义查询操作区与展开/收起入口"></code>

> Schema 内已使用 `AutoButtonGroup` 时，入口会自动放在第一个按钮组的查询/重置按钮左侧。业务使用 `#actions` 自定义按钮时，`#actions` 优先，Schema 按钮组不再重复渲染入口。

## 动态显隐

<code src="./demos/formily/dynamic.vue"></code>

## 动态禁用

<code src="./demos/formily/disabled.vue"></code>

## 标签提示

<code src="./demos/formily/label-tip.vue"></code>

## 自定义插槽

<code src="./demos/formily/slot.vue"></code>

## 分组

<code src="./demos/formily/group.vue" title="查看模式描述列表插槽"></code>

## 折叠面板表单
<code src="./demos/formily/collapse.vue" ></code>

## 联动

<code src="./demos/formily/linkage.vue"></code>

## 模式（新增/编辑/查看）

<code src="./demos/formily/modes.vue"></code>

## 远程字典翻译（接口返回）

<code src="./demos/formily/remote-enum.vue"></code>

## 自定义组件（新增/编辑/查看）

<code src="./demos/formily/custom-component.vue"></code>

## 事件（行内函数）按钮loading

<code src="./demos/formily/events-inline.vue"></code>

## 事件（作用域方法）
<code src="./demos/formily/events-scope.vue"></code>

## Effects（表单级副作用）

<code src="./demos/formily/effects.vue"></code>

## 异步校验（作用域方法优先）

<code src="./demos/formily/async-validate.vue"></code>

## 多依赖联动（scope + effects）

<code src="./demos/formily/linkage-multi.vue"></code>

## 提交失败提示（effects 统一兜底）

<code src="./demos/formily/submit-failed.vue"></code>

## 自定义提交按钮 loading（YButton + 手动控制）

<code src="./demos/formily/submit-loading-ybutton.vue"></code>

## 帮助文案与自定义插槽

<code src="./demos/formily/helper-slot.vue"></code>

## 分步表单（Steps + 多 YFormily）

<code id="demo-formily-steps" src="./demos/formily/steps.vue"></code>

> 旧版 `@formily/antdv FormStep` 仅用于历史项目兼容。新页面使用 Ant Design Vue Steps 负责步骤展示，每一步由独立 `YFormily` 实例校验，并通过统一状态聚合最终数据。

## 动态表单（ArrayItems）

<code src="./demos/formily/dynamic-array.vue"></code>

## 校验反馈展示

YFormily 内置的 `FormItem` 适配器会统一归一化 Formily 字段反馈：

- 空值或纯空白文本未通过必填校验时，只展示必填提示，不同时展示长度、格式等次级提示。
- 字段已有有效输入时，自动移除与当前值不符的残留必填提示，只展示实际未通过的长度或格式提示。
- 同一反馈级别存在多条消息时，会过滤空消息、去除重复消息并只拼接一次，避免出现 `", , , "` 等异常分隔符。

业务自定义校验仍应保持职责清晰：空值交给 `required` 规则处理，自定义长度和格式校验在空值时返回通过。适配器是运行时兜底，不用于替代正确的 Schema 校验语义。

## API

YFormily 当前基于 `@formily/antdv@2.0.1-beta.3`，Schema 中的内置组件由适配层统一注册；业务层不得把 `@formily/antdv` 的 UI 组件 Props 当作 YFormily 顶层 Props。

### YFormily Props

推荐统一使用公开导出 `YFormily`。`YssFormily` 指向同一实现，仅用于兼容历史代码；新 Demo、Skills 和业务页面统一使用 `YFormily`。

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `schema` | `Record<string, any>` | - | JSON Schema 描述（使用 `x-component`/`x-decorator` 语法） |
| `modelValue` / `v-model` | `Record<string, any>` | - | 双向绑定表单值（推荐）；更新时触发 `update:modelValue`。 |
| `initial-values` | `Record<string, any>` | `{}` | 初始表单值（仅初始化时一次性生效，若使用了 v-model 则优先取 v-model） |
| `form` | `Form` | - | 传入已有的 Formily 实例（不传则内部创建） |
| `components` | `Record<string, any>` | - | 扩展或覆盖内置组件（会与内置合并） |
| `scope` | `Record<string, any>` | - | 表达式作用域（可在 `{{ }}` 中使用） |
| `readPretty` | `boolean` | `false` | 只读查看态开关（通常由 `mode=2` 自动开启） |
| `mode` | `0 \| 1 \| 2` | `0` | 表单模式：0-新增 1-编辑 2-查看（查看强制只读） |
| `detail-options` | `Record<string, any>` | - | 描述列表参数，详见下方说明 |
| `grid-defaults` | `Record<string, any>` | `{ maxColumns:3, minColumns:1, columnGap:16, rowGap:0, minWidth:260 }` | 实例级默认栅格；schema 上的 `x-component-props` 会覆盖它 |
| `collapsible` | `boolean` | `false` | 是否启用查询表单展开/收起 |
| `expanded` / `v-model:expanded` | `boolean` | - | 受控展开状态 |
| `default-expanded` | `boolean` | `false` | 非受控模式的初始展开状态 |
| `collapsed-rows` | `number` | `1` | 收起时保留行数，小于 1 或非有限数值回退为 1 |

### 插槽说明

YFormily 支持以下插槽：

#### 1. 默认插槽（`#default`）

用于在表单底部追加额外内容（如自定义按钮组）。

**使用示例**：
```
<YFormily :schema="schema">
  <!-- 表单底部追加内容 -->
  <div style="margin-top: 16px; text-align: center">
    <a-button @click="handleCancel">取消</a-button>
  </div>
</YFormily>
```

#### 2. 查询操作区与折叠入口插槽

- `#actions`：渲染查询、重置等按钮，组件会将折叠入口放在插槽内容左侧。作用域为 `{ expanded, rowCount, collapsedRows, showTrigger, toggle, expand, collapse, form, getValues, submit }`。
- `#collapse-trigger`：完全自定义展开/收起内容。作用域为 `{ expanded, rowCount, collapsedRows, toggle, expand, collapse }`。
- 提供 `#actions` 时操作区始终渲染；当实际行数未超过 `collapsedRows` 时，仅隐藏折叠入口，不隐藏查询/重置按钮。

#### 3. 详情视图字段插槽

**适用场景**：`mode=2`（查看模式）时自动使用 Descriptions 渲染，无需额外详情开关。

**命名规则**：`#detail-<path>`，将字段路径中的 `.` 替换为 `-`。

**作用域参数**：
- `value` - 当前字段的值
- `item` - 字段的 schema 配置
- `values` - 整个表单的值对象

**使用示例**：
```
<YFormily :schema="schema" :mode="2">
  <!-- 简单路径：email -->
  <template #detail-email="{ value }">
    <a-tag v-for="(v, i) in value" :key="i" color="blue">{{ v }}</a-tag>
  </template>
  
  <!-- 嵌套路径：user.email（路径中的点替换为横线） -->
  <template #detail-user-email="{ value }">
    <a :href="`mailto:${value}`">{{ value }}</a>
  </template>
</YFormily>
```

**说明**：
- 未提供插槽时，自动回退到默认显示规则（字典翻译、日期格式化等）
- 更多示例见"分组"演示

#### 4. Schema 中的 Slot 组件

**适用场景**：在 schema 中引用父组件的具名插槽，实现灵活的自定义内容插入。

**使用方式**：在 schema 中使用 `x-component: 'Slot'`，并通过 `x-component-props.name` 指定插槽名称。

**使用示例**：
```
<YFormily :schema="schema">
  <template #customHint>
    <a-alert message="这是自定义提示内容" type="info" show-icon />
  </template>
</YFormily>
```

```typescript
// schema 定义
{
  type: 'object',
  properties: {
    hint: {
      type: 'void',
      'x-component': 'Slot',
      'x-component-props': {
        name: 'customHint'  // 对应父组件的 #customHint 插槽
      }
    },
    name: {
      type: 'string',
      title: '姓名',
      'x-decorator': 'FormItem',
      'x-component': 'Input'
    }
  }
}
```

**说明**：
- Slot 组件允许在 schema 的任意位置插入父组件传递的插槽内容
- 更多示例见"自定义插槽"演示

#### 5. 编辑 + 查看模式组合使用

**适用场景**：同一字段在编辑模式和查看模式下都需要自定义渲染（如 SQL 代码、富文本等）。

**原理**：
- **编辑模式**：通过 schema 中的 `x-component: 'Slot'` 引用 `#<slotName>` 插槽
- **查看模式**：通过 `#detail-<path>` 插槽自定义渲染

**使用示例**：

```
<YFormily
  v-model="formData"
  :schema="schema"
  :mode="mode"
  :detail-options="{ columns: 1 }"
>
  <!-- 编辑/新增模式下的自定义 SQL 插槽 -->
  <template #sql="{ value, onChange }">
    <YMonaco
      :value="value"
      language="sql"
      :height="300"
      @change="onChange"
    />
  </template>

  <!-- 查看模式下的自定义 SQL 插槽（注意命名规则：detail-<字段名>） -->
  <template #detail-sql="{ value }">
    <YMonaco
      :value="value"
      language="sql"
      :height="300"
      :read-only="true"
    />
  </template>
</YFormily>
```

```typescript
// schema 定义
const schema = {
  type: 'object',
  properties: {
    sql: {
      type: 'string',
      title: 'SQL代码',
      'x-decorator': 'FormItem',
      'x-decorator-props': { gridSpan: 2 },
      'x-component': 'Slot',
      'x-component-props': {
        name: 'sql',
      }
    }
  }
};
```

**命名规则对照表**：

| 字段路径 | 编辑模式插槽名 | 查看模式插槽名 |
| --- | --- | --- |
| `sql` | `#sql` | `#detail-sql` |
| `user.email` | `#userEmail` | `#detail-user-email` |
| `config.database.host` | `#dbHost` | `#detail-config-database-host` |

> [!TIP]
> 编辑模式插槽名由 `x-component-props.name` 自定义，查看模式插槽名固定为 `detail-<路径>`（点替换为横线）。

### 暴露方法

通过 `ref` 获取组件实例后可调用：

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `form` | `ComputedRef<Form>` | 内部表单实例 |
| `getValues` | `() => Record<string, any>` | 读取当前值（浅拷贝） |
| `setValues` | `(values: Record<string, any>) => void` | 批量设置值 |
| `submit` | `() => Promise<any>` | 触发提交（校验通过后返回） |
| `setFieldState` | `(...args:any[]) => void` | 低层能力，透传到 `form.setFieldState` |
| `toggle` | `() => void` | 切换展开/收起状态 |
| `expand` | `() => void` | 展开查询表单 |
| `collapse` | `() => void` | 收起查询表单 |

### 展开/收起事件

| 事件 | 签名 | 说明 |
| --- | --- | --- |
| `update:expanded` | `(expanded: boolean)` | 触发器、插槽方法或实例方法请求更新展开状态 |
| `update:modelValue` | `(values: Record<string, any>)` | 表单值变化时触发，用于 `v-model` 同步 |
| `toggle` | `(expanded: boolean)` | 内部交互或实例方法成功切换状态时触发，外部 Prop 同步不重复触发 |

### Types

`YssFormilyProps`、`YssFormilyEmits`、`YssFormilyValues`、`YssFormilyActionsSlotScope`、`YssFormilyCollapseSlotScope` 以及常用 `ISchema`、`Form`、`Field` 类型均可从 `@yss-ui/components` 导入。

### 兼容与废弃

`YssFormily` 是与 `YFormily` 指向同一实现的历史兼容具名导出，新 Demo 与 Skills 统一使用 `YFormily`。旧 `detail-as`、`show-button-group` 及 FormStep 主路径均不属于当前推荐契约。

### 内置组件（可在 `schema.x-component` 中直接使用）

- `FormItem`、`FormLayout`、`FormGrid`（已内置默认响应式）  
- `FormButtonGroup`、`Submit`、`Reset`  
- `Input`、`Select`、`DatePicker`、`Radio`、`Switch`  
- 适配层：`GroupHeader`、`AutoButtonGroup`（右对齐按钮组）

### 详情视图（Descriptions）

- 当 `mode=2` 时，表单以 `Descriptions` 风格展示字段。
- 默认规则：
  - `enum` 显示 label；`DatePicker` 显示 `YYYY-MM-DD`；`Switch/boolean` 显示“是/否”。
  - 数组以 `、` 拼接；空值显示 `-`（可用 `detailOptions.hideEmpty` 隐藏该项）。
  - `x-decorator-props.gridSpan` 影响列跨距；可用字段级 `x-preview-format` 覆盖默认渲染，或用 `detail` 插槽自定义展示。
- **响应式支持（x-reactions / 联动引擎）**：
  - **动态显隐**：支持通过 `x-reactions` 动态控制字段的 `visible`、`hidden`、`display` 状态。底层自动挂载隐式解析树，实现与编辑态完全一致的联动显隐。
  - **动态数据源**：支持异步接口或联动更新的 `dataSource`/`enum`，会自动读取最新 `field.dataSource` 进行 Label 命中翻译（如 TreeSelect、Select），避免只显示 ID。
  - **动态属性**：支持 `x-component-props` 里的 `{{ }}` 动态表达式计算，组件内部处理格式化时会自动获取运算后的最新值。
  - **动态标题**：支持联动修改 `field.title`，表格 Label 头文字会自动响应变化。

#### detail-options 配置项

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `columns` | `number` | `3` | 固定列数（仅当 `responsive=false` 时生效） |
| `bordered` | `boolean` | `true` | 是否显示边框 |
| `hideEmpty` | `boolean` | `false` | 是否隐藏空值字段 |
| `emptyPlaceholder` | `string` | `'-'` | 空值占位符 |
| `labelWidth` | `number` | `120` | 标签宽度（px） |
| `responsive` | `boolean` | `true` | 是否根据容器宽度自适应列数（**默认开启**） |
| `maxColumns` | `number` | `3` | 响应式模式下的**最大列数** |
| `minColumns` | `number` | `1` | 响应式模式下的最小列数 |
| `minWidth` | `number` | `260` | 每列最小宽度（px），决定响应式断点 |
| `showTooltip` | `boolean` | `true` | 是否在长文本溢出时显示 Tooltip（设为 `false` 可完全禁用） |
| `tooltipProps` | `object` | `{}` | 透传给 ATooltip 的配置项（如 `{ placement: 'topLeft' }`），会与内置滚动样式合并 |

> [!IMPORTANT]
> **响应式模式下 `columns` 会被忽略！** 默认开启 `responsive: true`，此时列数由 `maxColumns`、`minColumns` 和 `minWidth` 动态计算得出。如需固定 2 列，请设置 `maxColumns: 2` 或关闭响应式 `responsive: false`。

#### 字段级自定义插槽（仅 `mode=2` 生效）

- 插槽命名：`#detail-<path>`（将路径中的 `.` 替换为 `-`），如 `user.email` ⇒ `#detail-user-email`。
- 插槽入参：`{ value, item, values }`。
- 未提供插槽时，自动回退到默认显示规则。
- 示例（更多见“分组”示例中的 `分组demo`）：

```typescript

<YFormily :schema="schema" :mode="2">
  <template #detail-email="{ value }">
    <Tag v-for="(v, i) in value" :key="i" color="blue">{{ v }}</Tag>
  </template>
  <template #detail-user-email="{ value }">{{ value }}</template>
</YFormily>

```

### Schema 约定与技巧

- **布局**：在任意层使用
  - `FormLayout`：`{ layout: 'horizontal' | 'vertical', labelAlign?: 'left' | 'right', labelWidth?: number, size?: 'small' | 'middle' | 'large' }`
  - `FormGrid`：默认已开启 3列→2列→1列 的响应式；可在 `x-component-props` 局部覆盖
    - 可用项：`maxColumns`、`minColumns`、`minWidth`、`columnGap`、`rowGap`
- **栅格占位**：给字段的 `x-decorator-props` 设置 `gridSpan` 控制跨列数（如 `gridSpan: 2`）
- **折叠目标**：启用 `collapsible` 时默认管理第一个 FormGrid。多 FormGrid 需要合并管理时，给目标 Grid 设置 `x-component-props: { collapseTarget: true }`；只要存在显式目标，未标记的 Grid 不参与行数与折叠计算
- **分组标题**：使用 `GroupHeader` 作为分组行。默认独占一行（`fullSpan: true`），如需参与栅格与其它字段并列，设置 `x-component-props: { fullSpan: false }`；可通过 `description` 传分组说明文案
- **按钮组对齐**：使用 `x-component: 'AutoButtonGroup'`，并给外层字段加 `x-decorator: 'FormItem'` 以参与对齐/栅格
- **标签提示**：给 `FormItem` 的 `x-decorator-props` 传入 `tooltip`，图标将自动与 label 垂直居中

> 若希望全局调整默认栅格，可在使用处传入 `<YFormily :gridDefaults="{ minWidth: 300 }" />`；局部覆盖时，在具体 `FormGrid` 的 `x-component-props` 再写即可
