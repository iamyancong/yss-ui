import {
  defineComponent,
  h,
  inject,
  withDirectives,
  type Directive,
  type InjectionKey,
  type PropType,
  type Slots,
  type VNode,
} from 'vue';
import { VxeColgroup, VxeColumn } from 'vxe-table';
import ActionColumn from './ActionColumn.vue';
import type { YTableActionConfig, YTableColumn } from './types';

/**
 * YTable 列渲染上下文：由 YTable 根组件 provide，递归列节点 inject 使用。
 */
export interface YTableColumnNodeContext {
  /** YTable 根组件插槽（字段插槽、表头插槽、筛选插槽、分组表头插槽等） */
  slots: Slots;
  /** 叶子列属性解析 */
  getColumnProps: (column: YTableColumn) => Record<string, any>;
  /** 分组列属性解析 */
  getColgroupProps: (column: YTableColumn) => Record<string, any>;
  /** 操作列配置合并 */
  resolveActionConfig: (column?: YTableColumn) => YTableActionConfig;
  /** 展开行内容尺寸变化回调 */
  onExpandResize: () => void;
}

/** YTable 列渲染上下文注入键（内部使用，不对外导出）。 */
export const Y_TABLE_COLUMN_NODE_CONTEXT: InjectionKey<YTableColumnNodeContext> = Symbol('YTableColumnNodeContext');

/**
 * 将驼峰/下划线转换为中划线（用于 DOM 模板下的插槽名兼容）。
 * @param input 原始字段名
 * @returns kebab-case 字段名
 */
export const toKebabCase = (input: string): string => {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
};

/**
 * 计算列节点在同级列表中的稳定 key。
 *
 * 分组列通常没有 `field`/`type`，若直接用 `field || type` 作为 key，同级多个分组会得到相同的
 * `undefined` key，列配置变化时 Vue 可能错误复用/移动列组件；而 vxe-table 只在列挂载时按 DOM
 * 位置登记列顺序，移动不会重新登记，最终表现为分组顺序错乱。因此缺省时回退为「索引 + 标题」。
 *
 * @param column 列配置
 * @param index 同级索引
 * @returns 同级唯一 key
 */
export const getColumnNodeKey = (column: YTableColumn, index: number): string | number => {
  const { colId, field, type, title } = (column || {}) as YTableColumn & { colId?: string | number };
  if (colId !== undefined && colId !== null && colId !== '') return colId;
  if (field) return field;
  if (type) return type;
  return `__y_col_${index}_${title ?? ''}`;
};

/**
 * 局部指令：监听 DOM 尺寸变化（用于展开行内容高度变化后重算表格）。
 */
const vResize: Directive<HTMLElement, () => void> = {
  mounted(el, binding) {
    const observer = new ResizeObserver(() => {
      binding.value?.();
    });
    observer.observe(el);
    (el as any)._resizeObserver = observer;
  },
  unmounted(el) {
    if ((el as any)._resizeObserver) {
      (el as any)._resizeObserver.disconnect();
    }
  },
};

/** 按候选名称顺序返回第一个已提供的插槽名。 */
const pickSlotName = (slots: Slots, names: Array<string | false | undefined>): string | undefined =>
  names.find((name): name is string => !!name && !!slots[name]);

/**
 * YTable 内部递归列节点：
 * - 存在 `children` 时渲染 `vxe-colgroup`，并递归渲染子列，支持任意层级的多级分组表头；
 * - 否则渲染 `vxe-column`，并接入字段插槽、表头插槽、筛选插槽、展开行与操作列。
 *
 * 组件自身不产生额外 DOM，`vxe-column`/`vxe-colgroup` 的根节点仍是父容器的直接子元素，
 * 保证 vxe-table 按 DOM 位置登记列顺序的逻辑不受影响。
 */
const TableColumnNode = defineComponent({
  name: 'YTableColumnNode',
  props: {
    /** 列配置 */
    column: {
      type: Object as PropType<YTableColumn>,
      required: true,
    },
  },
  setup(props) {
    const injected = inject(Y_TABLE_COLUMN_NODE_CONTEXT, null);
    if (!injected) {
      throw new Error('[YTable] YTableColumnNode 只能在 YTable 内部使用');
    }
    const ctx = injected;

    /** 渲染分组列（递归）。 */
    const renderColgroup = (column: YTableColumn): VNode => {
      const { slots } = ctx;
      const groupSlots: Record<string, (scope: any) => any> = {
        default: () =>
          (column.children || []).map((child, index) =>
            h(TableColumnNode, { key: getColumnNodeKey(child, index), column: child })
          ),
      };
      // 分组表头自定义内容插槽（kebab-case 优先，兼容 camelCase）
      const groupHeaderSlot = pickSlotName(slots, ['group-header', 'groupHeader']);
      if (groupHeaderSlot) {
        groupSlots.header = (scope: any) => slots[groupHeaderSlot]?.(scope);
      }
      return h(VxeColgroup as any, ctx.getColgroupProps(column), groupSlots);
    };

    /** 渲染叶子列。 */
    const renderColumn = (column: YTableColumn): VNode => {
      const { slots } = ctx;
      const field = column.field as string | undefined;
      const kebabField = field ? toKebabCase(field) : undefined;
      const columnSlots: Record<string, (scope: any) => any> = {};

      // 表头插槽：优先按列字段命名，其次使用全局 header
      // 支持三种命名方式：fieldHeader (camelCase)、field-header (原始field+后缀)、kebab-case-header
      const headerSlot = pickSlotName(slots, [
        field && `${field}Header`,
        field && `${field}-header`,
        kebabField && `${kebabField}-header`,
        'header',
      ]);
      if (headerSlot) {
        columnSlots.header = (scope: any) => slots[headerSlot]?.(scope);
      }

      // 展开行内容插槽
      const expandSlot = column.type === 'expand' ? pickSlotName(slots, ['expand-row', 'expandRow']) : undefined;
      if (expandSlot) {
        columnSlots.content = (scope: any) =>
          withDirectives(h('div', null, slots[expandSlot]?.(scope)), [[vResize, ctx.onExpandResize]]);
      }

      // 自定义单元格内容（操作列 / 按 field 匹配的字段插槽）
      if (column.type === 'action') {
        const moreSlot = pickSlotName(slots, ['action-more-icon', 'actionMoreIcon']);
        columnSlots.default = (scope: any) => {
          const cfg = ctx.resolveActionConfig(column);
          return h(
            ActionColumn,
            {
              buttons: cfg.buttons as any,
              displayLimit: cfg.displayLimit,
              moreRenderType: cfg.moreRenderType,
              moreText: cfg.moreText,
              closeOnScroll: cfg.closeOnScroll !== false,
              scope,
            },
            moreSlot ? { more: () => slots[moreSlot]?.() } : undefined
          );
        };
      } else if (field && (slots[field] || (kebabField && slots[kebabField]))) {
        const cellSlot = kebabField && slots[kebabField] ? kebabField : field;
        columnSlots.default = (scope: any) =>
          slots[cellSlot]?.({ row: scope.row, column: scope.column, rowIndex: scope.rowIndex });
      }

      // 自定义筛选面板插槽：仅当外部提供时才覆盖 vxe 默认面板
      // 支持三种命名方式：fieldFilter (camelCase)、field-filter (原始field+后缀)、kebab-case-filter
      const filterSlot = pickSlotName(slots, [
        field && `${field}Filter`,
        field && `${field}-filter`,
        kebabField && `${kebabField}-filter`,
        'filter',
      ]);
      if (filterSlot) {
        columnSlots.filter = (scope: any) => slots[filterSlot]?.(scope);
      }

      return h(VxeColumn as any, ctx.getColumnProps(column), columnSlots);
    };

    return () => {
      const { column } = props;
      return column.children && column.children.length ? renderColgroup(column) : renderColumn(column);
    };
  },
});

export default TableColumnNode;
