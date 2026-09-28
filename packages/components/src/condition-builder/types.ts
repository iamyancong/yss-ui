export type LogicalOp = 'AND' | 'OR';

export interface ConditionGroup {
  id: string;
  type: 'GROUP';
  logicalOp: LogicalOp;
  children: Array<ConditionGroup | ConditionLeaf>;
  // 由哪个父级 LEAF 通过“子级条件”创建，用于联动删除与渲染判断
  linkedFromLeafId?: string;
}

export interface ConditionLeaf {
  id: string;
  type: 'LEAF';
  // 直接使用字段，兼容原始组件结构
  field: string;
  operator: string;
  value: unknown;
  // BETWEEN 操作符的分离值
  betweenValue1?: string;
  betweenValue2?: string;
}

export type ConditionNode = ConditionGroup | ConditionLeaf;

export interface OptionItem {
  label: string;
  value: string;
  disabled?: boolean;
}

export type OperatorInputKind = 'none' | 'single' | 'between' | 'multiple';

export interface OperatorOption extends OptionItem {
  kind: OperatorInputKind;
}

export interface SegmentSchema {
  key: string;
  component: 'select' | 'autocomplete' | 'input' | 'number' | 'date' | 'custom';
  // 受哪些段影响
  dependsOn?: string[];
  // 当依赖变化时是否重置当前段的值
  resetOnDepsChange?: boolean;
  // 宽度（grid 最小宽度）
  min?: number;
  // 自定义渲染（备用）
  render?: never;
}

export interface YConditionBuilderProps {
  modelValue?: ConditionGroup;
  segments?: SegmentSchema[];
  maxDepth?: number;
  // 操作符：允许静态或动态
  operatorOptions?: OperatorOption[];
  getOperators?: (field: unknown) => Promise<OperatorOption[] | undefined> | OperatorOption[] | undefined;

  // 字段、值加载
  loadFields?: (q: string) => Promise<OptionItem[]>;
  loadValues?: (args: {
    q: string;
    field: unknown;
    operator: string | undefined;
    node: ConditionLeaf;
  }) => Promise<OptionItem[]>;

  disabled?: boolean;
  /** @deprecated 当前实现不消费该属性，请使用 disabled。 */
  readonly?: boolean;
  /**
   * 字段选择模式：
   * - 'autocomplete': (默认) 自动补全模式，支持自由输入与模糊下拉提示
   * - 'select': 下拉选择模式，仅允许从选项列表中选择，严格避免非候选非法字符输入
   */
  fieldMode?: 'autocomplete' | 'select';
  /**
   * 是否开启严格校验模式
   * - true: (默认) 所有字段必填，值为空时校验不通过
   * - false: 允许字段为空，不强制校验
   */
  strictMode?: boolean;
}

export interface YConditionExpose {
  validate: () => boolean;
  /**
   * 读取当前标准条件树。
   *
   * `legacy` 仅保留为历史调用参数，当前与 `normalized` 返回相同的 `ConditionGroup` 结构。
   */
  getValue: (mode?: 'normalized' | 'legacy') => ConditionGroup;
  setValue: (v: ConditionGroup) => void;
  addLeaf: (path?: number[], index?: number) => void;
  addGroup: (path?: number[], index?: number) => void;
  remove: (path: number[]) => void;
}

export interface ValidateOptions {
  requiredSegments?: string[];
}

export interface ValueChangeContext {
  path: number[];
  node: ConditionNode;
}

export const DEFAULT_SEGMENTS: SegmentSchema[] = [
  { key: 'field', component: 'autocomplete', min: 140, resetOnDepsChange: false },
  { key: 'operator', component: 'select', min: 120, dependsOn: ['field'], resetOnDepsChange: true },
  { key: 'value', component: 'autocomplete', min: 160, dependsOn: ['field', 'operator'], resetOnDepsChange: true },
];

export const DEFAULT_OPERATOR_OPTIONS: OperatorOption[] = [
  { label: '等于', value: 'EQ', kind: 'single' },
  { label: '大于', value: 'GT', kind: 'single' },
  { label: '小于', value: 'LT', kind: 'single' },
  { label: '区间', value: 'BETWEEN', kind: 'between' },
  { label: '包含', value: 'IN', kind: 'multiple' },
  { label: '大于等于', value: 'GTE', kind: 'single' },
  { label: '小于等于', value: 'LTE', kind: 'single' },
  { label: '为空', value: 'IS NULL', kind: 'none' },
  { label: '不为空', value: 'IS NOT NULL', kind: 'none' },
];

export const createEmptyGroup = (): ConditionGroup => ({
  id: Math.random().toString(36).slice(2),
  type: 'GROUP',
  logicalOp: 'AND',
  children: [],
});

export const createEmptyLeaf = (): ConditionLeaf => ({
  id: Math.random().toString(36).slice(2),
  type: 'LEAF',
  field: '',
  operator: '=',
  value: '',
  betweenValue1: '',
  betweenValue2: '',
});

export const isGroup = (n: ConditionNode): n is ConditionGroup => n.type === 'GROUP';
export const isLeaf = (n: ConditionNode): n is ConditionLeaf => n.type === 'LEAF';
