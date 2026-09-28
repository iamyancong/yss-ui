import type { Ref } from 'vue';
import { ref } from 'vue';
import type { ConditionGroup, OperatorInputKind, OperatorOption, OptionItem } from '../types';

/**
 * 管理条件构造器的选项联动、字段值状态及增删操作。
 *
 * @param props YConditionBuilder 属性。
 * @param rootRef 条件树响应式引用。
 * @param root 树操作根节点引用。
 * @param resolvedOperators 操作符选项列表。
 * @param fieldOptions 字段选项列表。
 * @param valueOptionsMap 值选项映射。
 * @param fetchFields 字段拉取方法。
 * @param fetchValues 候选项拉取方法。
 * @param getOperatorOptions 获取操作符列表方法。
 * @param addLeaf 添加叶子节点方法。
 * @param addGroup 添加节点组方法。
 * @param remove 删除节点方法。
 * @param emit 事件发送函数。
 * @param validateNode 节点校验函数。
 * @param errors 错误对象映射。
 * @returns 条件构建状态与操作集。
 */
export function useConditionBuilderState(
  props: any,
  rootRef: Ref<ConditionGroup>,
  root: Ref<ConditionGroup>,
  resolvedOperators: Ref<OperatorOption[]>,
  fieldOptions: Ref<OptionItem[]>,
  valueOptionsMap: Ref<Record<string, OptionItem[]>>,
  fetchFields: (q: string) => void,
  fetchValues: (leaf: any, q: string) => void,
  getOperatorOptions: (field?: string) => Promise<OperatorOption[]>,
  addLeaf: (path?: number[], index?: number) => any,
  addGroup: (path?: number[], index?: number) => any,
  remove: (path: number[]) => any,
  emit: any,
  validateNode: (idx: number) => void,
  errors: Ref<Record<string, any>>
) {
  // 操作符选项缓存（节点维度与字段维度）
  const operatorOptionsCache = ref<Record<string, OperatorOption[]>>({});
  const operatorOptionsByFieldCache = ref<Record<string, OperatorOption[]>>({});

  // operator kind/ options per line
  const betweenValues = ref<Array<[string | undefined, string | undefined]>>([]);

  const getOperatorKind = (idx: number): OperatorInputKind => {
    const child = rootRef.value.children[idx];
    if (child?.type !== 'LEAF') return 'single';
    const op = (child as any).operator;
    if (!op) return 'single';

    const id = (rootRef.value.children[idx] as any)?.id as string | undefined;
    const field = (rootRef.value.children[idx] as any)?.field as string | undefined;
    const options =
      (field && operatorOptionsByFieldCache.value[field]) ||
      (props.getOperators && id && operatorOptionsCache.value[id]) ||
      resolvedOperators.value;
    const found = options.find((o: any) => o.value === op);
    return found?.kind || 'single';
  };

  const getOperatorOptionsSync = (idx: number): OperatorOption[] => {
    const child = rootRef.value.children[idx] as any;
    if (!child || child.type !== 'LEAF') return resolvedOperators.value;
    const field = String(child.field ?? '').trim();
    if (!field) {
      return props.getOperators ? [] : resolvedOperators.value;
    }
    if (operatorOptionsByFieldCache.value[field]) {
      return operatorOptionsByFieldCache.value[field];
    }
    const id = String(child.id ?? '');
    if (id && operatorOptionsCache.value[id]) {
      return operatorOptionsCache.value[id];
    }
    if (typeof props.getOperators === 'function') {
      try {
        const direct = props.getOperators(field);
        if (Array.isArray(direct)) {
          operatorOptionsByFieldCache.value[field] = direct;
          if (id) operatorOptionsCache.value[id] = direct;
          return direct;
        }
      } catch {
        // ignore
      }
      refreshOperatorOptions(idx);
      return [];
    }
    return resolvedOperators.value;
  };

  // 异步加载操作符选项
  const refreshOperatorOptions = async (idx: number) => {
    const child = rootRef.value.children[idx];
    if (child?.type === 'LEAF') {
      const field = String((child as any).field ?? '').trim();
      if (!field) {
        return [];
      }
      const options = await getOperatorOptions(field);
      operatorOptionsCache.value[String((child as any).id)] = options;
      operatorOptionsByFieldCache.value[field] = options;
      return options;
    }
    return [];
  };

  const ensureLineStates = () => {
    betweenValues.value = [];
    rootRef.value.children.forEach((child, idx) => {
      if (child.type === 'LEAF') {
        const kind = getOperatorKind(idx);
        if (kind === 'between') {
          const val = (child as any).value;
          const tuple: [string | undefined, string | undefined] = Array.isArray(val)
            ? [val[0], val[1]]
            : [undefined, undefined];
          betweenValues.value.push(tuple);
        } else {
          betweenValues.value.push([undefined, undefined]);
        }
      } else {
        betweenValues.value.push([undefined, undefined]);
      }
    });
  };

  const cleanupCacheStates = () => {
    operatorOptionsCache.value = {};
    operatorOptionsByFieldCache.value = {};
    ensureLineStates();
  };

  const clearValueOptions = (idx: number) => {
    const child = rootRef.value.children[idx] as any;
    if (!child || child.type !== 'LEAF') return;
    const key = String(child.id);
    valueOptionsMap.value[key] = [];
  };

  const filterFieldOption = (input: string, option: any): boolean => {
    if (!input) return true;
    const query = String(input).trim().toLowerCase();
    const label = String(option?.label ?? '').toLowerCase();
    const value = String(option?.value ?? '').toLowerCase();
    return label.includes(query) || value.includes(query);
  };

  const getFieldLabel = (value: string | undefined): string => {
    if (!value) return '';
    const option = fieldOptions.value.find((o: any) => o.value === value);
    return option?.label || value;
  };

  const getValueLabel = (idx: number, value: string | undefined): string => {
    if (!value) return '';
    const child = rootRef.value.children[idx];
    if (!child || child.type !== 'LEAF') return value || '';
    const key = String(child.id);
    const options = valueOptionsMap.value[key] || [];
    const option = options.find((o: any) => o.value === value);
    return option?.label || value;
  };

  const emitBlur = () => {
    emit('blur', rootRef.value);
  };

  const handleFieldChange = async (idx: number, val: any) => {
    const child = rootRef.value.children[idx] as any;
    if (!child || child.type !== 'LEAF') return;

    if (!val || val === '') {
      child.field = '';
      child.value = '';
      child.operator = '';
      betweenValues.value[idx] = [undefined, undefined];
      clearValueOptions(idx);
      operatorOptionsCache.value[String(child.id)] = [];
    } else {
      let matchedOption = fieldOptions.value.find((o: any) => o.value === val);
      if (!matchedOption) {
        matchedOption = fieldOptions.value.find((o: any) => o.label === val);
      }

      const actualValue = matchedOption ? matchedOption.value : val;
      child.field = actualValue;
      child.value = '';
      betweenValues.value[idx] = [undefined, undefined];
      clearValueOptions(idx);
      if (props.loadValues) fetchValues(child, '');

      if (typeof props.getOperators === 'function') {
        try {
          const direct = props.getOperators(actualValue);
          if (Array.isArray(direct)) {
            operatorOptionsCache.value[String(child.id)] = direct;
            operatorOptionsByFieldCache.value[actualValue] = direct;
            if (!child.operator || !direct.some((o: any) => o.value === child.operator)) {
              child.operator = direct[0]?.value ?? '';
            }
          }
        } catch {
          // ignore
        }
      }

      const newOptions = await getOperatorOptions(actualValue);
      operatorOptionsCache.value[String(child.id)] = newOptions;
      operatorOptionsByFieldCache.value[actualValue] = newOptions;

      if (!child.operator || !newOptions.some((o: any) => o.value === child.operator)) {
        child.operator = newOptions[0]?.value ?? '';
      }
    }

    root.value = { ...rootRef.value };
    validateNode(idx);
  };

  const handleOperatorChange = (idx: number, newOperator?: string) => {
    const child = rootRef.value.children[idx] as any;
    if (!child || child.type !== 'LEAF') return;
    child.operator = newOperator ?? '';
    const kind = getOperatorKind(idx);
    if (kind === 'between') {
      child.value = ['', ''];
      betweenValues.value[idx] = [undefined, undefined];
    } else if (kind === 'multiple') {
      child.value = [];
    } else if (kind === 'none') {
      child.value = '';
    } else {
      child.value = '';
    }
    clearValueOptions(idx);
    if (props.loadValues) fetchValues(child, '');

    root.value = { ...rootRef.value };
    validateNode(idx);
  };

  const handleValueChange = (idx: number, position: number, val: any, type: 'between' | 'single' | 'multiple') => {
    const child = rootRef.value.children[idx];
    if (!child || child.type !== 'LEAF') return;

    if (type === 'multiple') {
      (child as any).value = Array.isArray(val) ? val : [];
      root.value = { ...rootRef.value };
      validateNode(idx);
      return;
    }

    const key = String(child.id);
    const options = valueOptionsMap.value[key] || [];

    if (!val || val === '') {
      if (type === 'between') {
        if (!betweenValues.value[idx]) {
          betweenValues.value[idx] = [undefined, undefined];
        }
        betweenValues.value[idx][position] = undefined;
        const tuple = betweenValues.value[idx];
        (child as any).value = [tuple[0] || '', tuple[1] || ''];
      } else {
        (child as any).value = '';
      }
    } else {
      let matchedOption = options.find((o: any) => o.value === val);
      if (!matchedOption) {
        matchedOption = options.find((o: any) => o.label === val);
      }
      const actualValue = matchedOption ? matchedOption.value : val;

      if (type === 'between') {
        if (!betweenValues.value[idx]) {
          betweenValues.value[idx] = [undefined, undefined];
        }
        betweenValues.value[idx][position] = actualValue;
        const tuple = betweenValues.value[idx];
        (child as any).value = [tuple[0] || '', tuple[1] || ''];
      } else {
        (child as any).value = actualValue;
      }
    }

    root.value = { ...rootRef.value };
    validateNode(idx);
  };

  const onSearchFields = (q: string) => {
    if (props.loadFields) {
      fetchFields(q);
    }
  };

  const onSearchValues = (idx: number, q: string) => {
    const child = rootRef.value.children[idx];
    if (child?.type === 'LEAF' && props.loadValues) {
      fetchValues(child as any, q);
    }
  };

  const addLeafAfter = (idx: number) => {
    const next = rootRef.value.children[idx + 1];
    const at = next && next.type === 'GROUP' ? idx + 2 : idx + 1;
    addLeaf(undefined, at);
  };

  const addChildGroup = (idx: number) => {
    const beforeLeaf = rootRef.value.children[idx] as any;
    addGroup(undefined, idx + 1);
    const inserted = rootRef.value.children[idx + 1] as any;
    if (inserted && inserted.type === 'GROUP' && beforeLeaf && beforeLeaf.type === 'LEAF') {
      inserted.linkedFromLeafId = beforeLeaf.id;
    }
    root.value = { ...rootRef.value };
  };

  const onToggleRoot = () => {
    rootRef.value.logicalOp = rootRef.value.logicalOp === 'AND' ? 'OR' : 'AND';
    root.value = { ...rootRef.value };
    emitBlur();
  };

  const onRemove = (path: number[]) => {
    if (path.length === 1) {
      const index = path[0];
      if (index >= 0 && index < rootRef.value.children.length) {
        const newChildren = [...rootRef.value.children];
        const currentIsLeaf = newChildren[index] && newChildren[index].type === 'LEAF';
        const nextIsGroup = newChildren[index + 1] && newChildren[index + 1].type === 'GROUP';
        const currentLeafId = currentIsLeaf ? (newChildren[index] as any).id : undefined;
        const nextGroupLinkedFrom = nextIsGroup ? (newChildren[index + 1] as any).linkedFromLeafId : undefined;
        if (currentIsLeaf && nextIsGroup && nextGroupLinkedFrom && nextGroupLinkedFrom === currentLeafId) {
          newChildren.splice(index, 2);
        } else {
          newChildren.splice(index, 1);
        }

        rootRef.value = {
          ...rootRef.value,
          children: newChildren,
        };

        cleanupCacheStates();

        if (!props.isRoot && newChildren.length === 0) {
          emit('remove');
          return;
        }

        root.value = { ...rootRef.value };
      }
    } else {
      remove(path);
    }
    emitBlur();
    errors.value = {};
  };

  const shouldShowRemoveButton = (_idx: number): boolean => {
    const count = rootRef.value.children.length;
    if (props.isRoot && count >= 1) return true;
    if (!props.isRoot && count === 1) return true;
    return count > 1;
  };

  return {
    operatorOptionsCache,
    operatorOptionsByFieldCache,
    betweenValues,
    getOperatorKind,
    getOperatorOptionsSync,
    refreshOperatorOptions,
    ensureLineStates,
    cleanupCacheStates,
    clearValueOptions,
    filterFieldOption,
    getFieldLabel,
    getValueLabel,
    emitBlur,
    handleFieldChange,
    handleOperatorChange,
    handleValueChange,
    onSearchFields,
    onSearchValues,
    addLeafAfter,
    addChildGroup,
    onToggleRoot,
    onRemove,
    shouldShowRemoveButton,
  };
}
