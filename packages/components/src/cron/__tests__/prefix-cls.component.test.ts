import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import YCron from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YCron 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下为数字输入与下拉选择器挂上组件自有类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YCron, { modelValue: '0 0 12 * * ?' })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const inputNumbers = wrapper.findAll('.y-cron__input-number');
    expect(inputNumbers.length).toBeGreaterThan(0);
    expect(inputNumbers[0].classes()).toContain('custom-input-number');

    const selects = wrapper.findAll('.y-cron__select');
    expect(selects.length).toBeGreaterThan(0);
    expect(selects[0].classes()).toContain('custom-select');
  });
});
