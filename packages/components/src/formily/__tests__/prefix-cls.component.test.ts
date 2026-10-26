import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, getCurrentInstance, h, nextTick } from 'vue';
import {
  ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION,
  CompatibleFormilyFormItem,
  resolveFormItemPrefixCls,
} from '../components/CompatibleFormItem';
import GroupHeader from '../components/GroupHeader.vue';
import DescriptionsView from '../components/DescriptionsView/index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  ConfigProvider.config({ prefixCls: 'ant' });
});

describe('YFormily 自定义 prefixCls（真实 @formily/antdv 组件）', () => {
  it('锁住 ant-design-vue ConfigProvider 内部 Symbol("configProvider") 注入名称契约', () => {
    let matchedSymbolDesc: string | undefined;
    let resolvedFromCp: string | undefined;

    const Probe = defineComponent({
      setup() {
        const instance = getCurrentInstance() as unknown as { provides?: Record<PropertyKey, unknown> } | null;
        let cur = instance?.provides;
        while (cur && !matchedSymbolDesc) {
          const cpSym = Object.getOwnPropertySymbols(cur).find(
            s => s.description === ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION
          );
          if (cpSym) {
            matchedSymbolDesc = cpSym.description;
          }
          cur = Object.getPrototypeOf(cur);
        }
        resolvedFromCp = resolveFormItemPrefixCls();
        return () => h('div');
      },
    });

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () => h(Probe));
        },
      })
    );
    wrappers.push(wrapper);

    expect(matchedSymbolDesc).toBe('configProvider');
    expect(resolvedFromCp).toBe('custom-formily-form-item');
  });

  it('CompatibleFormilyFormItem 与 GroupHeader 在 <ConfigProvider prefixCls="custom"> 下同步 yss-formily-item 语义类名', async () => {
    const BaseItem = CompatibleFormilyFormItem.BaseItem;

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(
              BaseItem,
              { label: '基础信息' },
              {
                default: () => h(GroupHeader, { description: '分组说明', fullSpan: true }),
              }
            )
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const item = wrapper.find('.yss-formily-item');
    expect(item.exists()).toBe(true);
    expect(item.classes()).toContain('custom-formily-form-item');

    const label = wrapper.find('.yss-formily-item__label');
    expect(label.exists()).toBe(true);
    expect(label.classes()).toContain('custom-formily-form-item-label');

    const control = wrapper.find('.yss-formily-item__control');
    expect(control.exists()).toBe(true);
    expect(control.classes()).toContain('custom-formily-form-item-control');
  });

  it('仅通过 ConfigProvider.config({ prefixCls }) 设置全局前缀且无组件级 ConfigProvider 时，不覆盖全局前缀', async () => {
    ConfigProvider.config({ prefixCls: 'global-custom' });
    await nextTick();

    const BaseItem = CompatibleFormilyFormItem.BaseItem;
    let resolvedInSetup: string | undefined = 'initial';

    const wrapper = mount(
      defineComponent({
        setup() {
          resolvedInSetup = resolveFormItemPrefixCls();
          return () =>
            h(
              BaseItem,
              { label: '全局前缀字段' },
              {
                default: () => h('input', { class: 'inner-input' }),
              }
            );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    // 无组件级 ConfigProvider 时应返回 undefined，交由 @formily/antdv globalConfig() 消费全局前缀
    expect(resolvedInSetup).toBeUndefined();

    const item = wrapper.find('.yss-formily-item');
    expect(item.exists()).toBe(true);
    expect(item.classes()).toContain('global-custom-formily-form-item');
    expect(item.classes()).not.toContain('ant-formily-form-item');

    const label = wrapper.find('.yss-formily-item__label');
    expect(label.exists()).toBe(true);
    expect(label.classes()).toContain('global-custom-formily-form-item-label');

    const control = wrapper.find('.yss-formily-item__control');
    expect(control.exists()).toBe(true);
    expect(control.classes()).toContain('global-custom-formily-form-item-control');
  });

  it('DescriptionsView 在 prefixCls="custom" 下同步 yss-descriptions__view 与 yss-descriptions__item-content 类名', async () => {
    const schema = {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          title: '用户名',
          'x-component': 'Input',
        },
      },
    };

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(DescriptionsView, {
              schema,
              modelValue: { username: 'Alice' },
              responsive: false,
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const desc = wrapper.find('.yss-descriptions');
    expect(desc.exists()).toBe(true);
    expect(desc.classes()).toContain('custom-descriptions');

    const view = wrapper.find('.yss-descriptions__view');
    expect(view.exists()).toBe(true);
    expect(view.classes()).toContain('custom-descriptions-view');

    const content = wrapper.find('.yss-descriptions__item-content');
    expect(content.exists()).toBe(true);
    expect(content.classes()).toContain('custom-descriptions-item-content');
  });
});
