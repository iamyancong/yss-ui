import type { Ref } from 'vue';
import { computed, nextTick } from 'vue';
import type { VxeTable } from 'vxe-table';
import { useLocale } from '../../locale/useLocale';
import { useStableConfig } from '../../table/hooks/useStableConfig';
import { useActionScrollClose } from '../../table/hooks/useActionScrollClose';
import type { TableScrollEvent } from '../../table/utils/actionScroll';
import { useTableDragScroll } from '../../table/hooks/useTableDragScroll';
import { makeProxyTableInstance } from '../../table/utils';
import { useActionConfig } from './useActionConfig';
import { useAutoScrollOnAdd } from './useAutoScrollOnAdd';
import { useCellFormatter } from './useCellFormatter';
import { useColumns } from './useColumns';
import { useEditors } from './useEditors';
import { useErrorTooltip } from './useErrorTooltip';
import { useOptions } from './useOptions';
import { usePagination } from './usePagination';
import { useRowDrag } from './useRowDrag';
import { useStyleVars } from './useStyleVars';
import { useToolbar } from './useToolbar';
import { useValidation } from './useValidation';
import { useXTableProps } from './useXTableProps';

/**
 * 聚合 YEditTable 核心状态与业务逻辑。
 *
 * @param props YEditTable 属性。
 * @param emit 事件发送函数。
 * @param tableRef 表格 DOM/组件引用。
 * @param attrs 透传属性集合。
 * @returns 组合后的视图与交互状态。
 */
export function useEditTableContext(
  props: any,
  emit: any,
  tableRef: Ref<InstanceType<typeof VxeTable> | undefined>,
  attrs: Record<string, any>
) {
  const { t } = useLocale('common');
  const resolvedAddBtnText = computed(() => props.addBtnText || t('add'));
  const handleFilterChange = (params: any) => emit('filter-change', params);

  const {
    getCellError,
    handleEditClosed,
    isActiveErrorCell,
    setActiveErrorCell,
    markProgrammaticScrolling,
    handleTableScroll: handleValidationScroll,
    scheduleValidateRow,
    validate: validateInternal,
    showTooltipContent,
    shouldShowError,
  } = useValidation(props, tableRef);

  const { xTableProps } = useXTableProps(props, showTooltipContent);
  const { wrapperStyleVars } = useStyleVars(xTableProps);
  const { toolbarConfigComputed } = useToolbar(props.toolbarConfig);
  const { innerPagination, computedTotal, displayData, handleAntdChange, handleAntdShowSizeChange } = usePagination(
    props,
    emit
  );

  const rawTableProps = computed(() => ({
    ...xTableProps.value,
    ...attrs,
    toolbarConfig: toolbarConfigComputed.value,
    expandConfig: props.expandConfig,
  }));
  const mergedTableProps = useStableConfig(() => rawTableProps.value as Record<string, any>);

  const { getOptions, transformLabel } = useOptions(props);
  const { shouldTransform, hasFormatter, callFormatter } = useCellFormatter(getOptions, transformLabel);

  const updateCell = (row: any, key: string, value: any) => {
    row[key] = value;
    emit('updateRow', { row, key, value });
  };

  const handleCellFocus = (col: any, row: any) => {
    if (getCellError(col, row)) {
      setActiveErrorCell(row, col?.field);
    }
  };

  const { resolveEditor, editorProps, editorEvents } = useEditors(
    getOptions,
    updateCell,
    scheduleValidateRow,
    handleCellFocus
  );
  const { getErrorTooltipProps } = useErrorTooltip(props, getCellError, shouldShowError, isActiveErrorCell);

  const { dragHandleFixedComputed, handleRowDragend } = useRowDrag(props, tableRef, emit);
  useTableDragScroll(tableRef, {
    enabled: computed(() => props.rowDragable === true),
    threshold: 50,
    maxSpeed: 15,
  });

  const { scrollToNewRow } = useAutoScrollOnAdd(tableRef, { addPosition: props.addPosition });
  const handleAdd = () => {
    emit('add');
    if (props.autoScrollOnAdd) scrollToNewRow();
  };

  const { getColumnProps, getColgroupProps } = useColumns(props);
  const { resolveActionConfig } = useActionConfig({ actionConfig: props.actionConfig });
  const { handleActionScroll } = useActionScrollClose();

  /**
   * 校验气泡与操作列浮层共用同一次表格滚动。
   * 程序化 scrollToRow 不派发 vxe scroll，因此不会关闭用户刚打开的确认。
   *
   * @param params vxe scroll 事件参数
   */
  const handleTableScroll = (params?: TableScrollEvent) => {
    const programmatic = handleValidationScroll();
    if (programmatic) return;
    handleActionScroll(params);
  };

  const validate = async () => {
    const res: any = await validateInternal();
    if (!res?.valid && res?.firstError) {
      const { row, field } = res.firstError;
      await nextTick();
      try {
        markProgrammaticScrolling(400);
        tableRef.value?.scrollToRow?.(row);
        const colObj = tableRef.value?.getColumnByField?.(field);
        if (colObj) {
          tableRef.value?.scrollToColumn?.(colObj);
        }
        tableRef.value?.setEditCell?.(row, field);
      } catch (e) {
        // ignore
      }
    }
    return res;
  };

  const getTableInstance = () => makeProxyTableInstance(tableRef.value);

  return {
    resolvedAddBtnText,
    handleFilterChange,
    handleEditClosed,
    handleRowDragend,
    mergedTableProps,
    wrapperStyleVars,
    innerPagination,
    computedTotal,
    displayData,
    handleAntdChange,
    handleAntdShowSizeChange,
    dragHandleFixedComputed,
    handleAdd,
    getColumnProps,
    getColgroupProps,
    resolveActionConfig,
    hasFormatter,
    callFormatter,
    shouldTransform,
    transformLabel,
    shouldShowError,
    getCellError,
    resolveEditor,
    editorProps,
    editorEvents,
    getErrorTooltipProps,
    handleTableScroll,
    validate,
    getTableInstance,
  };
}

export type EditTableContext = ReturnType<typeof useEditTableContext>;
