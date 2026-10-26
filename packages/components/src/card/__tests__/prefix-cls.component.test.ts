import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import YCard from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YCard 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下同步 y-card__head 与 y-card__body 类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(
              YCard,
              { title: '自定义前缀标题', padding: 24 },
              {
                default: () => h('div', { class: 'slot-inner' }, '内容区'),
              }
            )
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const card = wrapper.find('.y-card');
    expect(card.exists()).toBe(true);
    expect(card.classes()).toContain('custom-card');

    const head = wrapper.find('.custom-card-head');
    expect(head.exists()).toBe(true);
    expect(head.classes()).toContain('y-card__head');

    const body = wrapper.find('.custom-card-body');
    expect(body.exists()).toBe(true);
    expect(body.classes()).toContain('y-card__body');
    expect(body.attributes('style')).toContain('padding: 24px');
  });

  it('当业务传入以 -card 结尾的自定义类名（如 order-card）时，通过校验子节点避免误判前缀', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(
              YCard,
              { title: '订单卡片', className: 'order-card' },
              {
                default: () => h('div', { class: 'slot-inner' }, '订单内容'),
              }
            )
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const card = wrapper.find('.y-card.order-card.custom-card');
    expect(card.exists()).toBe(true);
    expect(wrapper.find('.custom-card-head.y-card__head').exists()).toBe(true);
    expect(wrapper.find('.custom-card-body.y-card__body').exists()).toBe(true);
  });
});
