import { computed, getCurrentInstance, nextTick, ref, watch, useAttrs } from 'vue';

export function useValidation(props: any, tableRef: any) {
  const attrs = getCurrentInstance() ? useAttrs() : {};
  const errorMsgList = ref<Record<string, Map<string, string>>>({});
  const isTriggerValidate = ref(false);
  const touchedMap = ref<Record<string, Set<string>>>({});
  const activeErrorCell = ref<{ rowId: string; field: string } | null>(null);

  const rowKeyField = computed(() => ((props.tableConfig?.rowConfig as any)?.keyField || '_X_ROW_KEY') as string);
  const __rowWeakIdMap = new WeakMap<any, string>();
  const __rowIdToRow = new Map<string, any>();
  let __autoRowIdSeq = 1;
  const getRowId = (row: any) => {
    const key = row?.[rowKeyField.value];
    if (key !== undefined && key !== null && key !== '') return key as string;
    const cached = __rowWeakIdMap.get(row);
    if (cached) return cached;
    const gen = `__RID__${__autoRowIdSeq++}`;
    __rowWeakIdMap.set(row, gen);
    __rowIdToRow.set(gen, row);
    return gen;
  };

  const getCellError = (col: any, row: any): string | undefined => {
    const rowId = getRowId(row);
    const map = errorMsgList.value?.[rowId];
    return map?.get(col?.field) as any;
  };
  const markTouched = (row: any, key: string) => {
    const rowId = getRowId(row);
    if (!touchedMap.value[rowId]) touchedMap.value[rowId] = new Set<string>();
    if (key) touchedMap.value[rowId].add(key);
  };
  const isTouched = (row: any, key: string) => {
    const rowId = getRowId(row);
    return !!touchedMap.value[rowId]?.has(key);
  };
  const setCellError = (rowId: string, key: string, msg: string) => {
    if (!errorMsgList.value[rowId]) errorMsgList.value[rowId] = new Map<string, string>();
    if (msg) errorMsgList.value[rowId].set(key, msg);
    else errorMsgList.value[rowId].delete(key);
  };
  const isActiveErrorCell = (row: any, key: string) => {
    const rowId = getRowId(row);
    return activeErrorCell.value?.rowId === rowId && activeErrorCell.value?.field === key;
  };
  const setActiveErrorCell = (row: any, key: string) => {
    if (!row || !key) {
      activeErrorCell.value = null;
      return;
    }
    activeErrorCell.value = { rowId: getRowId(row), field: key };
  };

  /**
   * 清除当前激活的错误气泡。
   */
  const clearActiveErrorCell = () => {
    activeErrorCell.value = null;
  };

  let isProgrammaticScrolling = false;
  let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 标记当前正在进行程序化自动滚动，在此期间跳过滚动关闭气泡逻辑。
   *
   * @param duration 保护持续时长（毫秒），默认 300ms。
   */
  const markProgrammaticScrolling = (duration = 300) => {
    isProgrammaticScrolling = true;
    if (programmaticScrollTimer) {
      clearTimeout(programmaticScrollTimer);
    }
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScrolling = false;
      programmaticScrollTimer = null;
    }, duration);
  };

  /**
   * 监听表格滚动事件，若非程序化滚动则自动收起当前悬浮的校验气泡。
   *
   * @returns 当前是否处于程序化滚动保护期
   */
  const handleTableScroll = (): boolean => {
    if (isProgrammaticScrolling) return true;
    if (activeErrorCell.value) {
      clearActiveErrorCell();
    }
    return false;
  };

  const isEmptyValue = (v: any) => v === '' || v === null || v === undefined;
  const updateTableValid = async (targetRows?: any | any[]) => {
    await nextTick();
    const allRows = (tableRef.value?.getTableData?.().tableData || props.data) as any[];
    const rules = (props.tableConfig?.editRules ||
      (props as any).editRules ||
      (attrs as any)?.editRules ||
      (attrs as any)?.['edit-rules'] ||
      {}) as Record<string, any[]>;
    const rows = Array.isArray(targetRows) ? targetRows : targetRows ? [targetRows] : allRows;
    const columnFields = (props.columns || []).map((c: any) => c?.field).filter((f: any) => !!f) as string[];
    rows.forEach((row: any) => {
      const rowId = getRowId(row);
      __rowIdToRow.set(rowId, row);
      columnFields.forEach(key => {
        const col = (props.columns || []).find((c: any) => c?.field === key) || {};
        const rulesArray = rules[key];
        const hasRequiredTrue = Array.isArray(rulesArray) && rulesArray.some((rule: any) => rule?.required === true);
        const required =
          hasRequiredTrue || (typeof col?.customRequired === 'function' && col.customRequired(row?.[key], row));
        let msg = '';
        if (required && isEmptyValue(row?.[key])) {
          const ruleItem = Array.isArray(rulesArray) ? rulesArray.find((rule: any) => rule?.required === true) : null;
          msg = ruleItem?.message || `${col?.title || key}不能为空`;
        }
        setCellError(rowId, key, msg);
        if (!msg && typeof col?.customRule === 'function') {
          const { errMsg } = col.customRule(row?.[key], row, key, props.data || []) || { errMsg: '' };
          setCellError(rowId, key, errMsg || '');
        }
      });
    });
  };

  const showTooltipContent = (config: any) => {
    const { cell } = config || {};
    const { innerHTML } = cell || {};
    if (!innerHTML) return null;
    const div = document.createElement('div');
    div.innerHTML = innerHTML;
    const errorEl = div.querySelector('div.y-edit-table-cell-error') as HTMLElement | null;
    const vxeCell = div.querySelector('div.vxe-cell') as HTMLElement | null;
    if (!errorEl) return null;
    if (errorEl.parentElement) {
      errorEl.parentElement.removeChild(errorEl);
    } else if (vxeCell && vxeCell.contains(errorEl) && (vxeCell as any).removeChild) {
      (vxeCell as any).removeChild(errorEl);
    } else {
      (errorEl as any).remove?.();
    }
    const text = (vxeCell?.innerText || div.innerText || '').trim();
    if (!text) return null;
    return text;
  };

  const handleEditClosed = (params: any) => {
    updateTableValid(params?.row);
    if (activeErrorCell.value) {
      clearActiveErrorCell();
    }
  };
  const scheduleValidateRow = async (row: any, field?: string) => {
    await updateTableValid(row);
    if (field) markTouched(row, field);
    if (!field) return;
    if (getCellError({ field }, row)) {
      setActiveErrorCell(row, field);
      return;
    }
    if (isActiveErrorCell(row, field)) {
      activeErrorCell.value = null;
    }
  };
  const validate = async () => {
    isTriggerValidate.value = true;
    await updateTableValid();
    const hasError = Object.values(errorMsgList.value || {}).some(m => (m?.size || 0) > 0);
    const firstEntry = Object.entries(errorMsgList.value || {}).find(([_, m]) => (m?.size || 0) > 0);
    const [firstRowId, firstMap] = (firstEntry || [null, new Map<string, string>()]) as [
      string | null,
      Map<string, string>,
    ];
    let firstField: string | undefined;
    let firstMessage: string | undefined;
    if (firstMap && firstMap.size > 0) {
      const iter = firstMap.keys();
      const k = iter.next();
      firstField = (k && (k.value as string)) || undefined;
      firstMessage = firstField ? (firstMap.get(firstField) as string | undefined) : undefined;
    }
    const firstRow = firstRowId ? __rowIdToRow.get(firstRowId) : undefined;
    if (firstRow && firstField) {
      setActiveErrorCell(firstRow, firstField);
    } else {
      activeErrorCell.value = null;
    }
    return {
      valid: !hasError,
      errorMsg: firstMap,
      firstError: firstRow && firstField ? { row: firstRow, field: firstField, message: firstMessage } : undefined,
    };
  };

  watch(
    () => props.data.length,
    () => {
      isTriggerValidate.value = false;
      errorMsgList.value = {} as any;
      touchedMap.value = {} as any;
      activeErrorCell.value = null;
      updateTableValid();
    }
  );

  const shouldShowError = (col: any, row: any) => {
    const key = col?.field as string;
    if (!key) return false;
    const hasErr = !!getCellError(col, row);
    if (!hasErr) return false;
    return isTriggerValidate.value || isTouched(row, key);
  };

  return {
    isTriggerValidate,
    getCellError,
    handleEditClosed,
    isActiveErrorCell,
    setActiveErrorCell,
    clearActiveErrorCell,
    markProgrammaticScrolling,
    handleTableScroll,
    scheduleValidateRow,
    validate,
    showTooltipContent,
    shouldShowError,
  };
}
