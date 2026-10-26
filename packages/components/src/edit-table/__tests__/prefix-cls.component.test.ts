import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider, Input, Select } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import EditCellEditor from '../components/EditCellEditor.vue';
import EditTablePagination from '../components/EditTablePagination.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YEditTable 自定义 prefixCls', () => {
  it('EditCellEditor 在 prefixCls="custom" 下为输入框与选择器挂载 y-edit-table-editor__box 类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () => [
            h(EditCellEditor, {
              col: { field: 'name' },
              row: { name: '' },
              editorComponent: Input,
              editorProps: {},
              editorEvents: {},
              tooltipProps: { open: false },
              isError: true,
            }),
            h(EditCellEditor, {
              col: { field: 'role' },
              row: { role: undefined },
              editorComponent: Select,
              editorProps: { options: [{ label: 'Admin', value: 'admin' }] },
              editorEvents: {},
              tooltipProps: { open: false },
              isError: true,
            }),
          ]);
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    const editors = wrapper.findAll('.y-edit-table-editor.is-error');
    expect(editors.length).toBe(2);

    const inputBox = editors[0].find('.y-edit-table-editor__box');
    expect(inputBox.exists()).toBe(true);
    expect(inputBox.classes()).toContain('custom-input');

    const selectBox = editors[1].find('.y-edit-table-editor__box');
    expect(selectBox.exists()).toBe(true);
    expect(selectBox.classes()).toContain('custom-select-selector');
  });

  it('EditTablePagination 在 prefixCls="custom" 下同步分页内部语义类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(EditTablePagination, {
              pagination: {
                current: 1,
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: [10, 20],
              },
              total: 50,
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();

    expect(wrapper.find('.custom-pagination').exists()).toBe(true);
    expect(wrapper.find('.y-pagination__options').exists()).toBe(true);
    expect(wrapper.find('.y-pagination__size-changer').exists()).toBe(true);
    expect(wrapper.find('.y-pagination__size-selector').exists()).toBe(true);
  });
});
