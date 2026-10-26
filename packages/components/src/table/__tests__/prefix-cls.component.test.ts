import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import ActionButton from '../ActionButton.vue';
import YTable from '../index.vue';

vi.mock('@yss-ui/utils', () => ({ hasAuth: () => true }));

vi.mock('vxe-table', async () => {
  const { defineComponent: defineVueComponent, h: render } = await import('vue');
  return {
    VxeTable: defineVueComponent({
      name: 'VxeTable',
      setup(_props, { slots }) {
        return () => render('div', { class: 'vxe-table-mock' }, slots.default?.());
      },
    }),
    VxeColumn: defineVueComponent({
      name: 'VxeColumn',
      setup() {
        return () => render('div', { class: 'vxe-column-mock' });
      },
    }),
    VxeColgroup: defineVueComponent({
      name: 'VxeColgroup',
      setup() {
        return () => render('div', { class: 'vxe-colgroup-mock' });
      },
    }),
    VxeToolbar: defineVueComponent({
      name: 'VxeToolbar',
      setup(_props, { slots }) {
        return () => render('div', { class: 'vxe-toolbar-mock' }, [slots.buttons?.(), slots.tools?.()]);
      },
    }),
  };
});

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YTable 自定义 prefixCls', () => {
  it('ActionButton 在 prefixCls="custom" 禁用态下挂载 y-table-action-link--disabled 类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(ActionButton, {
              scope: { row: { id: 1 } },
              config: {
                key: 'delete',
                label: '删除',
                disabledFn: () => true,
              },
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const btn = wrapper.find('.y-table-action-link');
    expect(btn.exists()).toBe(true);
    expect(btn.classes()).toContain('custom-btn');
    expect(btn.classes()).toContain('y-table-action-link--disabled');
  });

  it('YTable 分页区在 prefixCls="custom" 下同步 y-pagination__* 语义类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YTable, {
              data: [{ id: 1, name: 'Alice' }],
              columns: [{ field: 'name', title: '姓名' }],
              pageable: true,
              pagination: {
                current: 1,
                pageSize: 10,
                total: 50,
                showSizeChanger: true,
              },
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.find('.y-table-pagination .custom-pagination').exists()).toBe(true);
    expect(wrapper.find('.y-table-pagination .y-pagination__options').exists()).toBe(true);
    expect(wrapper.find('.y-table-pagination .y-pagination__size-changer').exists()).toBe(true);
    expect(wrapper.find('.y-table-pagination .y-pagination__size-selector').exists()).toBe(true);
  });
});
