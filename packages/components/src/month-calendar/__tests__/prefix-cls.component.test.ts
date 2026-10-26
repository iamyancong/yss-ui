import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import dayjs from 'dayjs';
import YMonthCalendar from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('YMonthCalendar 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下同步日历面板内部语义类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YMonthCalendar, {
              month: dayjs('2026-06-01'),
              fillHeight: true,
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.find('.y-month-calendar__spin.custom-spin-nested-loading').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__spin-container.custom-spin-container').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__calendar.custom-picker-calendar').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__panel.custom-picker-panel').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__date-panel.custom-picker-date-panel').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__picker-body.custom-picker-body').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__picker-content.custom-picker-content').exists()).toBe(true);
    expect(wrapper.find('.y-month-calendar__picker-cell.custom-picker-cell').exists()).toBe(true);
    expect(wrapper.find('.ant-picker-calendar').exists()).toBe(false);
  });
});
