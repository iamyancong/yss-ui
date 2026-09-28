import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import YConditionBuilder from '../index.vue';
import ConditionLeaf from '../components/ConditionLeaf.vue';
import type { ConditionGroup, YConditionExpose } from '../types';

/** 当前测试创建的组件包装器。 */
const wrappers: VueWrapper[] = [];

/** 忽略第三方控件属性、仅保留插槽结构的测试替身。 */
const ControlStub = defineComponent({
  name: 'ControlStub',
  inheritAttrs: false,
  setup:
    (_, { attrs, slots }) =>
    () =>
      h('div', attrs, slots.default?.()),
});

/** 创建一棵完整且可校验的标准条件树。 */
const createConditionGroup = (): ConditionGroup => ({
  id: 'root',
  type: 'GROUP',
  logicalOp: 'AND',
  children: [
    {
      id: 'age-condition',
      type: 'LEAF',
      field: 'age',
      operator: 'EQ',
      value: 18,
    },
  ],
});

/** 挂载条件构造器并记录包装器，便于测试后统一卸载。 */
const mountConditionBuilder = (modelValue: ConditionGroup, props: Record<string, any> = {}): VueWrapper => {
  const wrapper = mount(YConditionBuilder, {
    props: { modelValue, ...props },
    global: {
      stubs: {
        AAutoComplete: ControlStub,
        AButton: ControlStub,
        ASelect: ControlStub,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YConditionBuilder 公开实例契约', () => {
  it('默认格式返回标准条件树', () => {
    const wrapper = mountConditionBuilder(createConditionGroup());
    const exposed = wrapper.vm as unknown as YConditionExpose;

    expect(exposed.getValue()).toEqual(createConditionGroup());
    expect(exposed.validate()).toBe(true);
  });

  it('legacy 历史参数与 normalized 返回相同标准结构', () => {
    const wrapper = mountConditionBuilder(createConditionGroup());
    const exposed = wrapper.vm as unknown as YConditionExpose;

    expect(exposed.getValue('legacy')).toEqual(exposed.getValue('normalized'));
  });

  it('渲染 ConditionLeaf 子组件', async () => {
    const wrapper = mountConditionBuilder(createConditionGroup());
    await nextTick();

    const leaf = wrapper.findComponent(ConditionLeaf);
    expect(leaf.exists()).toBe(true);
  });

  it('多条件时展示逻辑操作符并支持切换', async () => {
    const group: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        { id: 'c1', type: 'LEAF', field: 'name', operator: 'EQ', value: 'a' },
        { id: 'c2', type: 'LEAF', field: 'age', operator: 'GT', value: 10 },
      ],
    };
    const wrapper = mountConditionBuilder(group);
    await nextTick();

    const logicBtn = wrapper.find('.logic-btn');
    expect(logicBtn.exists()).toBe(true);
    expect(logicBtn.text()).toBe('且');

    await logicBtn.trigger('click');
    await nextTick();
    const exposed = wrapper.vm as unknown as YConditionExpose;
    expect(exposed.getValue().logicalOp).toBe('OR');
  });

  it('支持通过实例方法添加与删除条件', async () => {
    const wrapper = mountConditionBuilder(createConditionGroup());
    const exposed = wrapper.vm as unknown as YConditionExpose;

    exposed.addLeaf();
    await nextTick();
    expect(exposed.getValue().children.length).toBe(2);

    exposed.remove([1]);
    await nextTick();
    expect(exposed.getValue().children.length).toBe(1);
  });

  it('校验失败时对应控件标记 .is-error 样式类', async () => {
    const invalidGroup: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'invalid-leaf',
          type: 'LEAF',
          field: '',
          operator: '',
          value: '',
        },
      ],
    };
    const wrapper = mountConditionBuilder(invalidGroup);
    await nextTick();

    const exposed = wrapper.vm as unknown as YConditionExpose;
    const isValid = exposed.validate();
    expect(isValid).toBe(false);

    await nextTick();
    const errorField = wrapper.find('.field-select.is-error');
    const errorOperator = wrapper.find('.operator-select.is-error');
    expect(errorField.exists()).toBe(true);
    expect(errorOperator.exists()).toBe(true);
  });

  it('字段未选择时操作符控件处于禁用状态', async () => {
    const emptyFieldGroup: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf-empty',
          type: 'LEAF',
          field: '',
          operator: '=',
          value: '',
        },
      ],
    };
    const wrapper = mountConditionBuilder(emptyFieldGroup);
    await nextTick();

    const operatorSelect = wrapper.find('.operator-select');
    expect(operatorSelect.attributes()).toHaveProperty('disabled');
  });

  it('切换字段后立即刷新操作符缓存并更新当前合法操作符', async () => {
    const group: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf-1',
          type: 'LEAF',
          field: 'name',
          operator: 'LIKE',
          value: 'test',
        },
      ],
    };

    const getOperators = async (field: unknown) => {
      if (field === 'age') {
        return [
          { label: '大于', value: 'GT' },
          { label: '小于', value: 'LT' },
        ];
      }
      return [{ label: '包含', value: 'LIKE' }];
    };

    const wrapper = mountConditionBuilder(group, { getOperators });
    await nextTick();

    const leaf = wrapper.findComponent(ConditionLeaf);
    expect(leaf.exists()).toBe(true);

    // 触发字段变更为 age
    await leaf.props('ctx').state.handleFieldChange(0, 'age');
    await nextTick();

    const exposed = wrapper.vm as unknown as YConditionExpose;
    const currentGroup = exposed.getValue();
    const leafNode = currentGroup.children[0] as any;

    expect(leafNode.field).toBe('age');
    // 原操作符 LIKE 在 age 下不支持，应自动更新为 age 的首个可用操作符 GT
    expect(leafNode.operator).toBe('GT');

    // 操作符 options 应已立即包含 age 的选项，而不是旧选项或默认选项
    const operatorOptions = leaf.props('ctx').state.getOperatorOptionsSync(0);
    expect(operatorOptions.map((o: any) => o.value)).toEqual(['GT', 'LT']);
  });

  it('getOperators 返回空数组时尊重空选项，不回退到默认操作符', async () => {
    const group: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf-1',
          type: 'LEAF',
          field: 'custom',
          operator: '',
          value: '',
        },
      ],
    };

    const wrapper = mountConditionBuilder(group, {
      getOperators: async () => [],
    });
    await nextTick();

    const leaf = wrapper.findComponent(ConditionLeaf);
    const options = await leaf.props('ctx').state.refreshOperatorOptions(0);
    expect(options).toEqual([]);
  });

  it('fieldMode 为 select 时渲染 ASelect 并具备搜索过滤能力', async () => {
    const group: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf-select',
          type: 'LEAF',
          field: 'age',
          operator: 'EQ',
          value: 18,
        },
      ],
    };

    const loadFields = async () => [
      { label: '年龄', value: 'age' },
      { label: '姓名', value: 'name' },
    ];

    const wrapper = mountConditionBuilder(group, {
      fieldMode: 'select',
      loadFields,
    });
    await nextTick();

    const leaf = wrapper.findComponent(ConditionLeaf);
    const fieldSelect = leaf.find('.field-select');
    expect(fieldSelect.exists()).toBe(true);

    const filterOption = leaf.props('ctx').state.filterFieldOption;
    expect(filterOption('年', { label: '年龄', value: 'age' })).toBe(true);
    expect(filterOption('age', { label: '年龄', value: 'age' })).toBe(true);
    expect(filterOption('无', { label: '年龄', value: 'age' })).toBe(false);
  });

  it('操作符选择框不再包含 allowClear 属性', async () => {
    const wrapper = mountConditionBuilder(createConditionGroup());
    await nextTick();

    const operatorSelect = wrapper.find('.operator-select');
    expect(operatorSelect.exists()).toBe(true);
    expect(operatorSelect.attributes('allow-clear')).toBeUndefined();
    expect(operatorSelect.attributes('allowclear')).toBeUndefined();
  });
});
