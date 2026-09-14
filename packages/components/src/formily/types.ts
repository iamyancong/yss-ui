import type { Form } from '@formily/core';

/** YFormily 通用对象类型。 */
export type YssFormilyValues = Record<string, any>;

/** YFormily 组件 Props。 */
export interface YssFormilyProps {
  /** JSON Schema 描述。 */
  schema: YssFormilyValues;
  /** 初始值。 */
  initialValues?: YssFormilyValues;
  /** 传入外部 Formily Form，若不传则内部创建。 */
  form?: Form;
  /** 自定义组件注册，会与内置组件合并。 */
  components?: YssFormilyValues;
  /** 表达式作用域。 */
  scope?: YssFormilyValues;
  /** 是否使用只读展示态。 */
  readPretty?: boolean;
  /** 实例级默认栅格参数。 */
  gridDefaults?: YssFormilyValues;
  /** 表单模式：0-新增、1-编辑、2-查看。 */
  mode?: number;
  /** 详情模式选项。 */
  detailOptions?: YssFormilyValues;
  /** v-model 绑定值。 */
  modelValue?: YssFormilyValues;
  /** 是否启用查询表单展开/收起。 */
  collapsible?: boolean;
  /** 受控展开状态，可使用 v-model:expanded。 */
  expanded?: boolean;
  /** 非受控模式的初始展开状态。 */
  defaultExpanded?: boolean;
  /** 收起状态保留的行数。 */
  collapsedRows?: number;
}

/** YFormilyProps 标准别名。 */
export type YFormilyProps = YssFormilyProps;

/** 展开/收起触发器插槽作用域。 */
export interface YssFormilyCollapseSlotScope {
  /** 当前是否展开。 */
  expanded: boolean;
  /** 当前响应式布局的总行数。 */
  rowCount: number;
  /** 收起状态保留的行数。 */
  collapsedRows: number;
  /** 切换展开状态。 */
  toggle: () => void;
  /** 展开表单。 */
  expand: () => void;
  /** 收起表单。 */
  collapse: () => void;
}

/** 自定义操作区插槽作用域。 */
export interface YssFormilyActionsSlotScope extends YssFormilyCollapseSlotScope {
  /** 当前是否显示展开/收起入口。 */
  showTrigger: boolean;
  /** 当前 Formily Form 实例。 */
  form: Form;
  /** 读取当前表单值。 */
  getValues: () => YssFormilyValues;
  /** 触发表单提交。 */
  submit: () => Promise<any>;
}

/** YFormily 组件 Emits。 */
export interface YssFormilyEmits {
  /** 表单值更新。 */
  (e: 'update:modelValue', values: YssFormilyValues): void;
  /** 展开状态更新。 */
  (e: 'update:expanded', expanded: boolean): void;
  /** 通过组件交互或实例方法切换状态。 */
  (e: 'toggle', expanded: boolean): void;
}

/**
 * YFormily 组件类型导出。
 * 重新导出 @formily 常用类型，避免业务层重复安装依赖。
 */

// 导出 JSON Schema 相关类型（官方类型）
export type { ISchema } from '@formily/json-schema';

// 导出 Form 相关类型
export type { Form, IFormProps } from '@formily/core';

// 导出 Field 相关类型
export type { Field } from '@formily/core';

// 导出 Vue 组件相关类型
export type { IProviderProps } from '@formily/vue';
