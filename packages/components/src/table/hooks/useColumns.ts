import { computed, unref } from 'vue';
import { useLocale } from '../../locale/useLocale';
import type { YTableActionConfig, YTableColumn } from '../type';

export function useNormalizedColumns(props: { columns: any; autoFlexColumn: any }) {
  const normalizedColumns = computed(() => {
    const auto = unref(props.autoFlexColumn);
    const inputCols = unref(props.columns) || [];
    if (!auto) return inputCols;
    const cols = [...inputCols];
    const dataCols = cols.filter(
      (c: any) => !['seq', 'radio', 'checkbox', 'expand', 'drag', 'action'].includes((c as any)?.type as any)
    );
    if (!dataCols.length) return cols;
    const hasFlexible = dataCols.some((c: any) => (c as any)?.width === null);
    if (hasFlexible) return cols;
    const last = dataCols[dataCols.length - 1];
    if (last) {
      delete (last as any).width;
      (last as any).minWidth = (last as any).minWidth || 120;
    }
    return cols;
  });
  return { normalizedColumns };
}

export function useActionColumn(props: {
  actionConfig?: YTableActionConfig | any;
  columns?: YTableColumn[] | any;
  showActionColumn?: boolean | any;
}) {
  const hasActionColumnInColumns = computed(() =>
    (unref(props.columns) || []).some((c: any) => (c as any)?.type === 'action')
  );
  const appendActionColumn = computed(() => {
    const show = !!unref((props as any).showActionColumn);
    const actionCfg = unref(props.actionConfig) as YTableActionConfig | undefined;
    return show && !!actionCfg?.buttons?.length && !hasActionColumnInColumns.value;
  });
  return { hasActionColumnInColumns, appendActionColumn };
}

export function useColumnProps(baseProps: any, resolveActionConfig: (column?: YTableColumn) => YTableActionConfig) {
  const getColumnProps = (column: YTableColumn) => {
    const {
      field,
      title,
      width,
      minWidth,
      align,
      type,
      fixed,
      sortable,
      filterable,
      filters,
      isTransform,
      filterMethod,
      filterMultiple,
      filterRender,
      formatter: columnFormatter,
      ...rest
    } = column as any;

    const colProps: any = {
      field,
      title,
      width,
      minWidth,
      align: align || 'left',
      type,
      fixed,
      sortable,
      filters: filterable ? filters : undefined,
      filterMethod,
      filterMultiple,
      filterRender,
      ...rest,
    };

    if (type === 'action') {
      const cfg = resolveActionConfig(column);
      const { t } = useLocale('table');
      // 为操作列提供稳定的字段名，避免在启用 custom-config.storage 时 vxe 提示缺少 field
      // 若外部已传入 field，则优先使用外部；否则回退为内置固定值
      (colProps as any).field = (colProps as any).field || '__yss_action__';
      colProps.title = cfg.title || t('actionTitle');
      colProps.width = cfg.width;
      colProps.align = cfg.align || 'center';
      colProps.fixed = cfg.fixed || 'right';
      delete colProps.type;
    }

    if (isTransform) {
      colProps.formatter = ({ cellValue, column: c }: any) => {
        const fm = (column as any)?.props?.fieldNames || { label: 'label', value: 'value' };
        if (cellValue === null || cellValue === undefined) return '';
        const map = (baseProps as any).optionsMap || {};
        const list = map[(c as any).field] || [];
        const hit = list.find((opt: any) => `${opt[fm.value]}` === `${cellValue}`);
        return hit ? hit[fm.label] : cellValue;
      };
    } else if (columnFormatter) {
      colProps.formatter = columnFormatter;
    }

    return colProps;
  };

  // 仅用于 vxe-colgroup：默认全量透传，剔除不属于分组列的叶子列属性
  const getColgroupProps = (group: YTableColumn) => {
    const {
      // 分组自身不需要的叶子列属性/扩展能力，避免无意义传递
      // 注意：children 由递归列节点自行渲染，不能透传给 vxe-colgroup（非其 Prop，会落到 DOM attribute 上）
      // field 保留透传：列设置持久化（custom-config.storage）与列拖拽依赖分组列的 field 作为标识
      children: _children,
      type: _type,
      filterable: _filterable,
      filters: _filters,
      filterMethod: _filterMethod,
      filterMultiple: _filterMultiple,
      filterRender: _filterRender,
      isTransform: _isTransform,
      props: _props,
      formatter: _formatter,
      actionConfig: _actionConfig,
      ...rest
    } = (group as any) || {};

    const result: Record<string, any> = { ...rest };
    // 若未显式传 headerAlign，则回退为 align
    if (result.headerAlign === undefined && result.align !== undefined) {
      result.headerAlign = result.align;
    }
    return result;
  };

  return { getColumnProps, getColgroupProps };
}
