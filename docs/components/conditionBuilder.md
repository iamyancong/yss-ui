---
toc: content
---

### YConditionBuilder 条件构造器

基于 Vue3 与 TypeScript 的表达式构造组件，支持嵌套 AND/OR、联动选项、BETWEEN、多种输入形态与远程数据源。

## 代码演示

### 1. 基础用法（固定选项，无联动）
<code id="demo-cb-basic" src="./demos/condition-builder/basic/index.vue"></code>

### 2. 固定选项 + 联动（字段 → 操作符/值）
<code id="demo-cb-linked" src="./demos/condition-builder/linked/index.vue"></code>

### 3. 服务端返回（自定义联动逻辑）
<code id="demo-cb-remote" src="./demos/condition-builder/remote/index.vue"></code>

### 4. 嵌套 + BETWEEN 特性
<code id="demo-cb-nesting-between" src="./demos/condition-builder/nesting-between/index.vue"></code>

### 5. 表单校验（严格模式）
<code id="demo-cb-validation" src="./demos/condition-builder/validation/index.vue"></code>

### 6. 非严格模式（允许空值）
<code id="demo-cb-validation-custom" src="./demos/condition-builder/validation-custom/index.vue"></code>

## 使用说明

- 默认提供 `field/operator/value` 三段；操作符内置 `none/single/between/multiple` 四类输入语义。
- 字段选择支持 `field-mode`：默认为 `'autocomplete'`（支持自由输入与模糊补全提示），也可指定为 `'select'`（下拉选择模式，严格限定仅能从候选选项中选择，支持搜索过滤）。
- 通过 `operator-options` 传入静态操作符；或通过 `get-operators(field)` 动态拉取。
- 通过 `load-fields(q)` 与 `load-values({ q, field, operator })` 实现本地/远程搜索。
- 事件：`update:modelValue`、`change`、`blur`；实例方法见类型定义。

## API

### Props

| 参数 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| modelValue / v-model | 绑定的条件组数据 | `ConditionGroup` | - |
| field-mode / fieldMode | 字段选择模式：`autocomplete`（自动补全，支持自由输入与模糊提示）或 `select`（下拉选择，严格限定从候选列表选择） | `'autocomplete' \| 'select'` | `'autocomplete'` |
| segments | 自定义条件分段配置 | `SegmentSchema[]` | 内置分段 |
| max-depth | 最大嵌套深度 | `number` | `3` |
| load-fields | 加载字段选项的方法，支持搜索 | `(q: string) => Promise<OptionItem[]>` | - |
| load-values | 加载值选项的方法，支持搜索 | `(params: { q: string, field: string, operator: string }) => Promise<OptionItem[]>` | - |
| operator-options | 静态操作符选项列表 | `OperatorOption[]` | `DEFAULT_OPERATOR_OPTIONS` |
| get-operators | 动态获取操作符选项的方法 | `(field: string) => Promise<OperatorOption[]>` | - |
| and-text | "且" 逻辑关系的显示文本 | `string` | `'且'` |
| or-text | "或" 逻辑关系的显示文本 | `string` | `'或'` |
| disabled | 是否禁用（只读模式） | `boolean` | `false` |
| readonly | 已废弃且当前不生效，请使用 `disabled` | `boolean` | - |
| strict-mode | 是否开启严格校验模式（false允许空值） | `boolean` | `true` |
| is-root | 递归渲染内部参数；业务入口保持默认值 | `boolean` | `true` |
| depth | 当前递归深度；业务入口保持默认值 | `number` | `1` |

### Events

| 事件名 | 说明 | 回调参数 |
| --- | --- | --- |
| update:modelValue | 数据更新时触发 | `(value: ConditionGroup) => void` |
| change | 数据变化时触发 | `(value: ConditionGroup) => void` |
| validate | 每次数据变化时自动触发，返回当前验证状态 | `(valid: boolean) => void` |
| blur | 条件失去焦点时触发 | `(value: ConditionGroup) => void` |
| remove | 非根递归节点请求父级移除当前分组时触发 | `() => void` |

### Slots

YConditionBuilder 当前没有公开插槽。

### Expose

| 方法名 | 说明 | 参数 | 返回值 |
| --- | --- | --- | --- |
| validate | 校验所有条件是否完整填写（字段、操作符、值） | - | `boolean` |
| getValue | 读取当前标准条件组；`legacy` 仅为历史参数，当前与 `normalized` 返回相同结构 | `(mode?: 'normalized' \| 'legacy')` | `ConditionGroup` |
| setValue | 替换当前条件组 | `(value: ConditionGroup)` | `void` |
| addLeaf | 在指定路径添加条件叶子 | `(path?: number[], index?: number)` | `void` |
| addGroup | 在指定路径添加条件分组 | `(path?: number[], index?: number)` | `void` |
| remove | 删除指定路径的条件节点 | `(path: number[])` | `void` |

### 兼容与废弃

- `getValue('legacy')` 仅保留历史调用兼容，当前不会转换为另一套数据结构；新代码统一使用默认的 `getValue()`。

`readonly` 仅为历史兼容字段，当前不生效并已标记 deprecated；只读/禁用场景统一使用 `disabled`。`isRoot`、`depth` 和 `remove` 事件用于组件递归节点协作，业务入口通常不应主动设置或监听。

### Types

`YConditionBuilderProps`、`YConditionExpose`、`ConditionNode`、`ConditionGroup`、`ConditionLeaf`、`SegmentSchema`、`OperatorOption` 等类型均可从 `@yss-ui/components` 导入。

#### ConditionGroup

```typescript
interface ConditionGroup {
  id: string;
  type: 'GROUP';
  logicalOp: 'AND' | 'OR';
  children: (ConditionGroup | ConditionLeaf)[];
  linkedFromLeafId?: string; // 关联的父级叶子节点ID
}
```

#### ConditionLeaf

```typescript
interface ConditionLeaf {
  id: string;
  type: 'LEAF';
  field: string;
  operator: string;
  value: any;
  betweenValue1?: any;
  betweenValue2?: any;
}
```

#### OptionItem

```typescript
interface OptionItem {
  label: string;
  value: string | number;
  [key: string]: any;
}
```

#### OperatorOption

```typescript
interface OperatorOption {
  label: string;
  value: string;
  kind?: 'single' | 'multiple' | 'between' | 'none'; // 输入框类型
}
```
