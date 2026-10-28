import type { PaginationProps as AntPaginationProps } from 'ant-design-vue';
import type { ExtractPropTypes, PropType } from 'vue';
import type { VxeColumnProps, VxeTablePropTypes, VxeTableDefines, VxeTableProps } from 'vxe-table';

/**
 * Y-Table 组件 Props 类型定义
 */
export const yTableProps = {
  // 基础数据
  data: {
    type: Array as PropType<any[]>,
    default: (): any[] => [],
  },
  // 列配置
  columns: {
    type: Array as PropType<YTableColumn[]>,
    default: (): YTableColumn[] => [],
  },
  /** 选中的行记录列表（支持 v-model:selectedRows） */
  selectedRows: {
    type: Array as PropType<any[]>,
  },
  /** 选中的行 Key 列表（支持 v-model:selectedRowKeys） */
  selectedRowKeys: {
    type: Array as PropType<(string | number)[]>,
  },
  // 复选框配置（透传 vxe-table checkbox-config）
  checkboxConfig: {
    type: Object as PropType<VxeTablePropTypes.CheckboxConfig>,
    default: () => ({}),
  },
  // 单选配置（透传 vxe-table radio-config）
  radioConfig: {
    type: Object as PropType<VxeTablePropTypes.RadioConfig>,
    default: () => ({}),
  },
  // 是否显示边框
  border: {
    type: [Boolean, String] as PropType<VxeTablePropTypes.Border>,
    default: true,
  },
  // 是否显示斑马纹
  stripe: {
    type: Boolean as PropType<VxeTablePropTypes.Stripe>,
    default: false,
  },
  // 表格高度
  height: {
    type: [Number, String] as PropType<VxeTablePropTypes.Height>,
  },
  // 表格最大高度
  maxHeight: {
    type: [Number, String] as PropType<VxeTablePropTypes.MaxHeight>,
  },
  // 是否加载中
  loading: {
    type: Boolean as PropType<VxeTablePropTypes.Loading>,
    default: false,
  },
  // 是否显示表头
  showHeader: {
    type: Boolean as PropType<VxeTablePropTypes.ShowHeader>,
    default: true,
  },
  // 表格尺寸（同时影响 vxe-table 与默认 toolbar 尺寸）
  size: {
    type: String as PropType<VxeTablePropTypes.Size>,
    default: 'medium',
  },
  // 单元格合并：透传 vxe-table 的 span-method
  spanMethod: {
    type: Function as PropType<VxeTablePropTypes.SpanMethod>,
  },
  /** vxe-table 本地列设置持久化需要提供唯一 id（对应 vxe-table 的 id） */
  id: {
    type: String as PropType<string>,
  },
  // 行配置
  rowConfig: {
    type: Object as PropType<VxeTablePropTypes.RowConfig>,
    default: () => ({
      keyField: '_X_ROW_KEY',
      useKey: true,
    }),
  },
  // 单元格配置（v4 推荐使用）
  cellConfig: {
    type: Object as PropType<VxeTablePropTypes.CellConfig>,
    default: () => ({
      height: 36,
    }),
  },
  /** Tooltip 配置（透传 vxe-table tooltip-config，并由组件内部补充定位修复 class） */
  tooltipConfig: {
    type: Object as PropType<VxeTablePropTypes.TooltipConfig>,
    default: () => ({}),
  },
  /** 表头 Tooltip 配置（透传 vxe-table header-tooltip-config） */
  headerTooltipConfig: {
    type: Object as PropType<VxeTablePropTypes.HeaderTooltipConfig>,
    default: () => ({}),
  },
  /** 表尾 Tooltip 配置（透传 vxe-table footer-tooltip-config） */
  footerTooltipConfig: {
    type: Object as PropType<VxeTablePropTypes.FooterTooltipConfig>,
    default: () => ({}),
  },
  /** 表头行高（px），仅影响表头，不影响数据行 */
  headerHeight: {
    type: Number as PropType<number>,
  },
  // 单元格内容溢出省略
  showOverflow: {
    type: [Boolean, String] as PropType<VxeTablePropTypes.ShowOverflow>,
    // vxe-table v4 推荐使用 'tooltip' 或 'title'，默认使用 tooltip
    default: 'tooltip',
  },
  // 表头溢出省略
  showHeaderOverflow: {
    type: [Boolean, String] as PropType<VxeTablePropTypes.ShowHeaderOverflow>,
    default: 'tooltip',
  },
  // 列配置
  columnConfig: {
    type: Object as PropType<VxeTablePropTypes.ColumnConfig>,
    default: () => ({
      resizable: true,
      useKey: true,
    }),
  },
  /** 自定义列设置与持久化配置：透传给 vxe-table 的 custom-config */
  customConfig: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({}),
  },
  // 编辑配置
  editConfig: {
    type: Object as PropType<VxeTablePropTypes.EditConfig>,
    default: () => ({
      trigger: 'click',
      mode: 'row',
    }),
  },
  // 展开行配置
  expandConfig: {
    type: Object as PropType<VxeTablePropTypes.ExpandConfig>,
    default: () => ({}),
  },
  // 是否显示操作列（当提供 actionConfig 或列 type: 'action' 时生效）
  showActionColumn: {
    type: Boolean as PropType<boolean>,
    default: true,
  },
  // 顶层操作列配置（也可以在列上通过 type:'action' + actionConfig 指定）
  actionConfig: {
    type: Object as PropType<YTableActionConfig>,
    default: (): YTableActionConfig => ({ buttons: [] as ActionButtonConfig[] }),
  },
  // 若所有数据列都设置了固定宽度，则自动让最后一个普通列自适应填充剩余空间
  autoFlexColumn: {
    type: Boolean as PropType<boolean>,
    default: true,
  },
  // 行拖拽开关
  rowDragable: {
    type: Boolean as PropType<boolean>,
    default: false,
  },
  // 是否展示行拖拽把手列
  showDragHandle: {
    type: Boolean as PropType<boolean>,
    default: true,
  },
  // 行拖拽把手宽度
  dragHandleWidth: {
    type: [Number, String] as PropType<number | string>,
    default: 46,
  },
  // 行拖拽配置（会与 rowDragable 合并）
  rowDragConfig: {
    type: Object as PropType<VxeTablePropTypes.RowDragConfig>,
  },
  /** 横向虚拟滚动配置 (vxe-table v4.10.6+) */
  virtualXConfig: {
    type: Object as PropType<VxeTablePropTypes.VirtualXConfig>,
  },
  /** 纵向虚拟滚动配置 (vxe-table v4.10.6+) */
  virtualYConfig: {
    type: Object as PropType<VxeTablePropTypes.VirtualYConfig>,
  },
  /** @deprecated 请使用 virtualXConfig 替代 */
  scrollX: {
    type: Object as PropType<VxeTablePropTypes.ScrollX>,
  },
  /** @deprecated 请使用 virtualYConfig 替代 */
  scrollY: {
    type: Object as PropType<VxeTablePropTypes.ScrollY>,
  },
  // 是否分页（使用 Ant Design Vue 的 Pagination）
  pageable: {
    type: Boolean as PropType<boolean>,
    default: false,
  },
  // 工具栏配置（最小：仅列设置）
  toolbarConfig: {
    type: Object as PropType<{ custom?: boolean }>,
    default: () => ({ custom: false }),
  },
  /** vxe-toolbar 尺寸（不传时跟随 size） */
  toolbarSize: {
    type: String as PropType<VxeTablePropTypes.Size>,
  },
  /** vxe-toolbar 工具项（默认在 custom=true 时提供列设置按钮） */
  toolbarTools: {
    type: Array as PropType<any[]>,
    default: (): any[] => [],
  },
  // 字典翻译映射：{ [field]: Array<{ label,value } | 任意字段名> }
  optionsMap: {
    type: Object as PropType<Record<string, any[]>>,
    default: () => ({}),
  },
  // 分页配置（受控/非受控皆可）
  pagination: {
    type: Object as PropType<YTablePagination>,
    default: () => ({
      current: 1,
      pageSize: 20,
      total: 0,
      showSizeChanger: true,
      showQuickJumper: true,
      pageSizeOptions: ['20', '50', '100', '200'],
      remote: false,
    }),
  },
} as const;

export type YTableProps = ExtractPropTypes<typeof yTableProps> &
  Omit<VxeTableProps, keyof ExtractPropTypes<typeof yTableProps>>;

/**
 * 列配置接口
 */
export interface YTableColumn extends Omit<VxeTableDefines.ColumnOptions, 'children' | 'type'> {
  /** 字段名 */
  field?: string;
  /** 列标题 */
  title?: string;
  /** 列宽度 */
  width?: number | string;
  /** 最小宽度 */
  minWidth?: number | string;
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right';
  /** 表头对齐方式（优先级高于 align，仅作用于表头；分组表头同样生效） */
  headerAlign?: 'left' | 'center' | 'right';
  /** 列类型（其中 action 为本组件自定义类型，用于渲染操作列） */
  type?: 'seq' | 'radio' | 'checkbox' | 'expand' | 'drag' | 'action' | VxeColumnProps['type'];
  /** 是否固定列 */
  fixed?: 'left' | 'right';
  /** 是否可排序 */
  sortable?: boolean;
  /** 是否可筛选 */
  filterable?: boolean;
  /** 筛选配置 */
  filters?: any[];
  /** 本地筛选方法（与 vxe-table 对齐） */
  filterMethod?: (params: any) => boolean;
  /** 是否多选（与 vxe-table 对齐） */
  filterMultiple?: boolean;
  /** 是否字典翻译 */
  isTransform?: boolean;
  /** 列渲染扩展 props（如 fieldNames 等） */
  props?: Record<string, any>;
  /** 与 vxe 对齐：单元格 formatter */
  formatter?: (params: any) => string | number;
  /** 当 type 为 'action' 时的列级操作配置（优先级高于顶层 actionConfig） */
  actionConfig?: YTableActionConfig;
  /** 分组表头：子列，支持任意层级嵌套（含 children 的节点渲染为 vxe-colgroup，叶子节点渲染为 vxe-column） */
  children?: YTableColumn[];
}

export type ActionButtonHelpers = { close: () => void; hideLoading: () => void };

export type ActionButtonClick = (
  scope: any,
  btn: ActionButtonConfig,
  helpers: ActionButtonHelpers
) => void | Promise<void>;

/**
 * 操作列按钮项
 */
export interface ActionButtonConfig {
  /** 唯一键（兼容旧写法） */
  key?: string | number;
  /** 按钮值/唯一键（推荐配置写法，会回退给 key） */
  value?: string | number;
  /** 按钮文案（兼容旧写法） */
  text?: string;
  /** 按钮文案（推荐配置写法，会回退给 text） */
  label?: string;
  /** 权限码（传入则按权限显示/隐藏；未传则始终显示） */
  permissionCode?: string;
  /** 无权限时的处理方式（默认隐藏，可指定为 disable 展示禁用态） */
  fallback?: 'hide' | 'disable';
  /** 按钮风格 */
  type?: 'text' | 'link' | 'primary' | 'default';
  /** 是否仅渲染为禁用 */
  disabledFn?: (scope: any) => boolean;
  /** 是否隐藏该按钮 */
  hideFn?: (scope: any) => boolean;
  /** 是否需要二次确认 */
  isConfirm?: boolean;
  /** 确认弹层与异步 loading 配置 */
  confirmProps?: {
    title?: string;
    okText?: string;
    cancelText?: string;
    /** 是否需要在确认时展示 loading，并由外部手动结束 */
    needLoading?: boolean;
    /**
     * 是否启用受控手动关闭模式。
     * 默认 false（兼容 1.7.4 行为）：clickFn 正常 resolve 即视为成功并关闭弹层，reject 时重置 loading 保持弹层供重试，finally 中调用 hideLoading() 也会在正常 resolve 后安全关闭。
     * 为 true 时保留受控语义（1.7.5 模式）：必须显式调用 helpers.close() 才关闭弹层，helpers.hideLoading() 停止 loading 并保持弹层供重试。
     */
    manualClose?: boolean;
    /** 透传给弹层的属性 */
    popProps?: Record<string, any>;
  };
  /** 点击回调（提供 close/hideLoading 能力） */
  clickFn?: ActionButtonClick;
  /** 点击回调（推荐配置写法，会回退给 clickFn） */
  click?: ActionButtonClick;
}

export type MoreRenderType = 'ellipsis' | 'moreButton';

/** 操作列配置 */
export interface YTableActionConfig {
  /** 列标题（默认：操作） */
  title?: string;
  /** “更多”按钮文案（默认使用组件库内置语言：更多 / More） */
  moreText?: string;
  /** 列宽 */
  width?: number;
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right';
  /** 是否固定 */
  fixed?: 'left' | 'right';
  /** 直显按钮个数 */
  displayLimit?: number;
  /** 更多展示形式 */
  moreRenderType?: MoreRenderType;
  /** 按钮列表 */
  buttons: ActionButtonConfig[];
  /**
   * 表格内部纵向滚动时是否关闭「更多」和二次确认浮层。
   * 默认开启。needLoading 执行过程中故意不关闭，这段时间浮层停在原位、不跟着行走。
   * 仅横向滚动、1px 以内的纵向抖动，以及 scrollTo / scrollToRow 等程序滚动不关闭。
   * 设为 false 可恢复滚动后浮层保持打开的原行为。
   */
  closeOnScroll?: boolean;
}

/**
 * 分页配置
 * - 基于 Ant Design Vue PaginationProps，可直接透传其大多数属性
 * - 出于事件统一性，移除了 onChange/onShowSizeChange/`onUpdate:*` 等事件类 props
 * - 扩展 remote 字段用于声明是否采用远程分页
 */
export type YTablePagination = Partial<
  Omit<
    AntPaginationProps,
    'onChange' | 'onShowSizeChange' | 'onUpdate:current' | 'onUpdate:pageSize' | 'showTotal' | 'showQuickJumper'
  >
> & {
  /** 是否使用远程分页（不在组件内 slice 数据） */
  remote?: boolean;
  /** 是否展示快速跳转（仅支持 boolean，收窄 antd 定义） */
  showQuickJumper?: boolean;
  /** 页大小选项（支持 number|string） */
  pageSizeOptions?: (number | string)[];
  /** 自定义总数文案，返回字符串 */
  showTotal?: (total: number, range: [number, number]) => string;
};

/**
 * 分页默认配置
 */
export const DEFAULT_PAGINATION: YTablePagination = {
  current: 1,
  pageSize: 20,
  total: 0,
  size: 'small',
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['20', '50', '100', '200'],
  showTotal: (total: number) => `共 ${total} 条`,
};

/**
 * Y-Table 选择变化事件 Payload
 */
export interface YTableSelectionChangePayload<T = any> {
  /** 选中的行数据列表 */
  selectedRows: T[];
  /** 选中的行 Key 列表 */
  selectedRowKeys: (string | number)[];
  /** 选中的行数据列表（兼容 vxe records） */
  records: T[];
  /** 勾选状态变化的原生行对象（单选触发时存在） */
  row?: T;
  /** 是否勾选（单选触发时存在） */
  checked?: boolean;
  /** 原始事件参数 */
  event?: any;
}

/**
 * Y-Table 事件类型
 */
export interface YTableEmits {
  /** v4：当前行变化 */
  'current-row-change': [params: any];
  /** 兼容旧事件（已废弃）：current-change */
  'current-change': [params: any];
  'cell-click': [params: any];
  'edit-closed': [params: any];
  'edit-activated': [params: any];
  /** vxe：筛选面板确认 */
  'filter-change': [params: any];
  /** 分页变化 */
  'page-change': [payload: { current: number; pageSize: number }];
  /** 每页大小变化（兼容旧命名） */
  'size-change': [pageSize: number];
  /** v-model:pagination */
  'update:pagination': [pagination: YTablePagination];
  /** v-model:data */
  'update:data': [data: any[]];
  /** v-model:selectedRows */
  'update:selectedRows': [selectedRows: any[]];
  /** v-model:selectedRowKeys */
  'update:selectedRowKeys': [selectedRowKeys: (string | number)[]];
  /** 统一表格行选择变动事件（单选/全选均会触发） */
  'selection-change': [payload: YTableSelectionChangePayload];
  /** vxe-table 原生多选单行变动事件 */
  'checkbox-change': [params: any];
  /** vxe-table 原生多选表头全选事件 */
  'checkbox-all': [params: any];
  /** 行拖拽结束 */
  'row-dragend': [params: any];
}
