import { ref } from 'vue';
import type { ConditionLeaf, OperatorOption, OptionItem } from '../types';

export interface LinkageOptions {
  getOperators?: (field: unknown) => Promise<OperatorOption[] | undefined> | OperatorOption[] | undefined;
  operatorOptions: OperatorOption[];
  loadFields?: (q: string) => Promise<OptionItem[]>;
  loadValues?: (args: {
    q: string;
    field: unknown;
    operator: string | undefined;
    node: ConditionLeaf;
  }) => Promise<OptionItem[]>;
}

export const useLinkage = (opts: LinkageOptions) => {
  const fieldOptions = ref<OptionItem[]>([]);
  const valueOptionsMap = ref<Record<string, OptionItem[]>>({});

  const fetchFields = async (q: string) => {
    if (!opts.loadFields) {
      fieldOptions.value = [];
      return;
    }
    fieldOptions.value = await opts.loadFields(q);
  };

  // 初始化时加载字段选项
  const initializeFields = async () => {
    if (opts.loadFields) {
      try {
        fieldOptions.value = await opts.loadFields('');
      } catch (error) {
        console.warn('Failed to initialize field options:', error);
        fieldOptions.value = [];
      }
    }
  };

  const fetchValues = async (node: ConditionLeaf, q: string) => {
    const key = String(node.id);
    if (!opts.loadValues) {
      valueOptionsMap.value[key] = [];
      return;
    }
    const list = await opts.loadValues({
      q,
      field: node.field,
      operator: node.operator as string | undefined,
      node,
    });
    valueOptionsMap.value[key] = list || [];
  };

  const getOperatorOptions = async (field: unknown): Promise<OperatorOption[]> => {
    if (opts.getOperators) {
      const res = await opts.getOperators(field);
      if (Array.isArray(res)) return res;
    }
    return opts.operatorOptions;
  };

  return {
    fieldOptions,
    valueOptionsMap,
    fetchFields,
    fetchValues,
    getOperatorOptions,
    initializeFields,
  };
};
