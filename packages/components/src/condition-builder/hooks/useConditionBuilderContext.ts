import { computed, onMounted, ref, watch } from 'vue';
import type { ConditionGroup, OptionItem } from '@yss-ui/components';
import { DEFAULT_OPERATOR_OPTIONS, createEmptyGroup } from '../types';
import type { YConditionBuilderProps } from '../types';
import { useLocale } from '../../locale/useLocale';
import { useConditionTree } from './useConditionTree';
import { useLinkage } from './useLinkage';
import { useConditionBuilderValidation } from './useConditionBuilderValidation';
import { useConditionBuilderState } from './useConditionBuilderState';

/**
 * 聚合条件构造器的完整交互逻辑与状态管理。
 *
 * @param props YConditionBuilder 属性。
 * @param emit 事件发送函数。
 * @returns 供视图消费的上下文对象。
 */
export function useConditionBuilderContext(
  props: YConditionBuilderProps & { andText?: string; orText?: string; isRoot?: boolean; depth?: number },
  emit: any
) {
  const { t } = useLocale('conditionBuilder');

  const resolvedOperators = computed(
    () =>
      props.operatorOptions ??
      DEFAULT_OPERATOR_OPTIONS.map(option => ({
        ...option,
        label: t(`operators.${option.value}`),
      }))
  );
  const resolvedAndText = computed(() => props.andText ?? t('and'));
  const resolvedOrText = computed(() => props.orText ?? t('or'));

  const initial = computed(() => props.modelValue || createEmptyGroup());
  const rootRef = ref<ConditionGroup>(initial.value);

  const { root, addLeaf, addGroup, remove } = useConditionTree(initial.value, {
    maxDepth: props.maxDepth ?? 3,
    operatorResolver: async field => {
      if (props.getOperators) {
        const val = await props.getOperators(field);
        return Array.isArray(val) ? val : [];
      }
      return resolvedOperators.value;
    },
    defaultOperator: resolvedOperators.value[0]?.value,
  });

  const cachedFieldOptions = ref<OptionItem[]>([]);
  const hasCached = ref(false);
  const nestedRefs = ref<any[]>([]);
  const setNestedRef = (el: any, idx: number) => {
    if (el) nestedRefs.value[idx] = el;
  };

  const loadFieldsWrapper = async (q: string) => {
    if (!q && hasCached.value) return cachedFieldOptions.value;
    if (props.loadFields) {
      const res = await props.loadFields(q);
      if (!q) {
        cachedFieldOptions.value = res;
        hasCached.value = true;
      }
      return res;
    }
    return [];
  };

  const { fieldOptions, valueOptionsMap, fetchFields, fetchValues, getOperatorOptions, initializeFields } = useLinkage({
    getOperators: props.getOperators,
    get operatorOptions() {
      return resolvedOperators.value;
    },
    loadFields: loadFieldsWrapper,
    loadValues: props.loadValues,
  });

  const errors = ref<Record<string, { field?: boolean; operator?: boolean; value?: boolean }>>({});
  let validateNodeFn = (_idx: number) => {};

  const state = useConditionBuilderState(
    props,
    rootRef,
    root,
    resolvedOperators,
    fieldOptions,
    valueOptionsMap,
    fetchFields,
    fetchValues,
    getOperatorOptions,
    addLeaf,
    addGroup,
    remove,
    emit,
    idx => validateNodeFn(idx),
    errors
  );

  const { validateNode, validate } = useConditionBuilderValidation(
    rootRef,
    () => props.strictMode ?? true,
    idx => state.getOperatorKind(idx),
    () => state.betweenValues.value,
    nestedRefs,
    errors
  );

  validateNodeFn = validateNode;

  watch(
    () => root.value,
    newVal => {
      rootRef.value = newVal;
      state.ensureLineStates();
    },
    { immediate: true, deep: true }
  );

  const preloadLeafOperators = async () => {
    if (rootRef.value.children) {
      await Promise.all(
        rootRef.value.children.map(async (child, idx) => {
          if (child.type === 'LEAF') {
            if (props.loadValues) fetchValues(child as any, '');
            if ((child as any).field) {
              await state.refreshOperatorOptions(idx);
            }
          }
        })
      );
    }
  };

  watch(
    () => props.modelValue,
    v => {
      if (!v) return;
      if (root.value !== v) root.value = v as ConditionGroup;
      emit('change', root.value);
      preloadLeafOperators();
    },
    { immediate: true, deep: true }
  );

  watch(
    () => root.value,
    v => {
      emit('update:modelValue', v);
      emit('change', v);
      const isValid = validate();
      emit('validate', isValid);
      state.ensureLineStates();
    },
    { immediate: true, deep: true }
  );

  onMounted(async () => {
    initializeFields();
    await preloadLeafOperators();
  });

  const handleNestedChange = (nestedCondition: any, index: number) => {
    const newChildren = [...rootRef.value.children];
    newChildren[index] = nestedCondition;
    rootRef.value = { ...rootRef.value, children: newChildren };
    root.value = { ...rootRef.value };
    state.emitBlur();
  };

  const getValue = (_format: 'normalized' | 'legacy' = 'normalized'): ConditionGroup => rootRef.value;
  const setValue = (v: ConditionGroup) => {
    root.value = v;
  };

  return {
    props,
    t,
    rootRef,
    resolvedOperators,
    resolvedAndText,
    resolvedOrText,
    fieldOptions,
    valueOptionsMap,
    errors,
    state,
    setNestedRef,
    loadFieldsWrapper,
    handleNestedChange,
    validate,
    getValue,
    setValue,
    addLeaf: (path?: number[], index?: number) => addLeaf(path || [index || 0]),
    addGroup: (path?: number[], index?: number) => addGroup(path || [index || 0]),
    remove: (path: number[]) => remove(path),
  };
}

export type ConditionBuilderContext = ReturnType<typeof useConditionBuilderContext>;
