import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import YConditionBuilder from '../index.vue';
import type { ConditionGroup, YConditionExpose } from '../types';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YConditionBuilder 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下为条件控件挂载 y-condition-builder__control-box 类名', async () => {
    const modelValue: ConditionGroup = {
      id: 'root',
      type: 'GROUP',
      logicalOp: 'AND',
      children: [
        {
          id: 'leaf-1',
          type: 'LEAF',
          field: '',
          operator: 'EQ',
          value: '',
        },
      ],
    };

    let builderRef: YConditionExpose | undefined;

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(ConfigProvider, { prefixCls: 'custom' }, () =>
              h(YConditionBuilder, {
                ref: (el: unknown) => {
                  builderRef = el as YConditionExpose;
                },
                modelValue,
                fieldMode: 'select',
              })
            );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    builderRef?.validate();
    await nextTick();

    const fieldSelect = wrapper.find('.field-select');
    expect(fieldSelect.exists()).toBe(true);
    expect(fieldSelect.classes()).toContain('custom-select');
    expect(fieldSelect.classes()).toContain('is-error');

    const controlBox = fieldSelect.find('.y-condition-builder__control-box');
    expect(controlBox.exists()).toBe(true);
    expect(controlBox.classes()).toContain('custom-select-selector');
  });
});
