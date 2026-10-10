import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, toRaw } from 'vue';
import YTable from '../index.vue';
import type { YTableColumn } from '../type';

vi.mock('@yss-ui/utils', () => ({ hasAuth: () => true }));

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

/** 等待 vxe 把行渲染出来。 */
const waitForBodyRow = async (wrapper: VueWrapper) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushPromises();
    await nextTick();
    if (wrapper.find('.vxe-body--row').exists()) return;
  }
};

describe('YTable 缺字段刷新', () => {
  const columns: YTableColumn[] = [
    { field: 'name', title: '姓名' },
    { field: 'status', title: '状态' },
    { field: 'profile.city', title: '城市' },
  ];

  it('默认 keyField 下缺字段刷新保持 rowid，更多确认层不关闭，回调拿到业务行', async () => {
    const row = { name: '张三', profile: { city: '上海' } };
    const data = ref([row]);
    const click = vi.fn();
    const Host = defineComponent({
      setup() {
        return () =>
          h(YTable, {
            data: data.value,
            columns,
            height: 240,
            actionConfig: {
              displayLimit: 0,
              buttons: [{ key: 'delete', text: '删除', isConfirm: true, clickFn: click }],
            },
          });
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });
    wrappers.push(wrapper);

    await waitForBodyRow(wrapper);
    const bodyRow = wrapper.get('.vxe-body--row');
    const rowid = bodyRow.attributes('rowid');
    expect(rowid).toBeTruthy();
    expect(wrapper.text()).toContain('上海');
    expect(Object.prototype.hasOwnProperty.call(row, 'status')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, 'profile.city')).toBe(false);
    expect((row as { _X_ROW_KEY?: string })._X_ROW_KEY).toBeTruthy();

    await wrapper.get('.y-table-action-btn').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('.y-table-action-pop-list')).toBeTruthy();

    await document.body.querySelector<HTMLElement>('.y-table-action-link')?.click();
    await flushPromises();
    expect(document.body.querySelector('.y-table-action-popconfirm, .ant-popconfirm')).toBeTruthy();

    data.value = [row];
    await nextTick();
    await flushPromises();
    await nextTick();

    expect(wrapper.get('.vxe-body--row').attributes('rowid')).toBe(rowid);
    expect(document.body.querySelector('.y-table-action-pop-list')).toBeTruthy();
    expect(document.body.querySelector('.ant-popconfirm')).toBeTruthy();

    const confirm = document.body.querySelector<HTMLElement>('.ant-popconfirm .ant-btn-primary');
    confirm?.click();
    await flushPromises();
    expect(click).toHaveBeenCalled();
    expect(toRaw(click.mock.calls[0][0].row)).toBe(row);
    expect(click.mock.calls[0][0].row).toBe(data.value[0]);
  });
});
