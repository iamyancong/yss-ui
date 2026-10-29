import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import YTable from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YTable 真实 VXE 空态加载契约', () => {
  it('源数据非空但本地筛选无结果时，加载期间仍保留空态占位标记', async () => {
    const wrapper = mount(YTable, {
      attachTo: document.body,
      props: {
        data: [{ id: '1', name: '张三' }],
        columns: [
          {
            field: 'name',
            title: '姓名',
            filterable: true,
            filters: [{ label: '无匹配', value: 'none' }],
            filterMethod: () => false,
          },
        ],
      },
    });
    wrappers.push(wrapper);
    const table = wrapper.vm.getTableInstance();
    await flushPromises();
    await table.refreshColumn();
    await table.setFilter('name', [{ label: '无匹配', value: 'none', checked: true }], true);
    expect(table.getTableData().tableData).toHaveLength(0);
    expect(wrapper.props('data')).toHaveLength(1);
    await wrapper.setProps({ loading: true });
    await nextTick();
    expect(wrapper.classes()).toContain('y-table-wrapper--no-data');
    await wrapper.setProps({ loading: false });
    expect(wrapper.classes()).not.toContain('y-table-wrapper--no-data');
  });

  it('加载中用户改筛选导致结果变空或恢复时，空态占位无需等 props 变化即同步', async () => {
    const wrapper = mount(YTable, {
      attachTo: document.body,
      props: {
        data: [{ id: '1', name: '张三' }],
        loading: true,
        columns: [
          {
            field: 'name',
            title: '姓名',
            filterable: true,
            filters: [{ label: '无匹配', value: 'none' }],
            filterMethod: () => false,
          },
        ],
      },
    });
    wrappers.push(wrapper);
    const table = wrapper.vm.getTableInstance();
    await flushPromises();
    await table.refreshColumn();
    await nextTick();
    expect(wrapper.classes()).not.toContain('y-table-wrapper--no-data');

    await table.setFilter('name', [{ label: '无匹配', value: 'none', checked: true }], true);
    await nextTick();
    expect(wrapper.classes()).toContain('y-table-wrapper--no-data');

    await table.clearFilter('name');
    await nextTick();
    expect(wrapper.classes()).not.toContain('y-table-wrapper--no-data');
  });

  it('加载中筛选结果重新出现时移除空态占位，避免额外添加空行', async () => {
    const wrapper = mount(YTable, {
      attachTo: document.body,
      props: { data: [], columns: [{ field: 'name', title: '姓名' }], loading: true },
    });
    wrappers.push(wrapper);
    await nextTick();
    expect(wrapper.classes()).toContain('y-table-wrapper--no-data');
    await wrapper.setProps({ data: [{ id: '1', name: '张三' }] });
    await wrapper.vm.getTableInstance().updateData();
    await nextTick();
    expect(wrapper.classes()).not.toContain('y-table-wrapper--no-data');
  });
});
