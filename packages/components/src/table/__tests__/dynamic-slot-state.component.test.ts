/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import YTable from '../index.vue';
import type { YTableColumn } from '../types';

vi.mock('@yss-ui/utils', () => ({ hasAuth: () => true }));

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

/** 多等几轮，让 VXE 的列收集、parseColumns 与重渲染都跑完。 */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
    await flushPromises();
    await nextTick();
  }
};

const rows = [
  { id: '1', name: '张三', amount: 1234.5 },
  { id: '2', name: '李四', amount: 20 },
];

/** 真实 VXE 下，业务方用 v-if 切换某列的表头 / 单元格插槽。 */
const mountHost = (columns: YTableColumn[]) => {
  const showHeader = ref(false);
  const showCell = ref(false);
  const Host = defineComponent({
    components: { YTable },
    setup() {
      return { showHeader, showCell, columns, rows };
    },
    template: `
      <YTable ref="table" :data="rows" :columns="columns" :height="300">
        <template v-if="showHeader" #nameHeader>自定义姓名</template>
        <template v-if="showCell" #amount="{ row }">插槽-{{ row.amount }}</template>
      </YTable>
    `,
  });
  const wrapper = mount(Host, { attachTo: document.body });
  wrappers.push(wrapper);
  const table = () => (wrapper.vm.$refs.table as any).getTableInstance();
  const headerText = (field: string) => {
    const colid = table().getColumnByField(field).id;
    return wrapper.find(`.vxe-header--column.${colid}`).text();
  };
  const cellText = (field: string) => {
    const colid = table().getColumnByField(field).id;
    return wrapper.find(`.vxe-body--column.${colid}`).text();
  };
  return { wrapper, table, showHeader, showCell, headerText, cellText };
};

describe('YTable 真实 VXE：v-if 动态增删插槽时保留列状态', () => {
  it('切换表头插槽后，拖拽列宽与已勾选筛选项都保留，表头即时更新', async () => {
    const ctx = mountHost([
      {
        field: 'name',
        title: '姓名',
        filterable: true,
        filters: [
          { label: '张三', value: '张三' },
          { label: '李四', value: '李四' },
        ],
        filterMethod: ({ value, row }: any) => row.name === value,
      },
      { field: 'amount', title: '金额' },
    ]);
    await settle();
    const table = ctx.table();
    const column = table.getColumnByField('name');

    // 模拟用户拖宽列 + 勾选筛选项
    await table.setColumnWidth('name', 260);
    await table.setFilter('name', [{ label: '张三', value: '张三', checked: true }], true);
    await settle();
    expect(table.getTableData().tableData).toHaveLength(1);
    expect(ctx.headerText('name')).toBe('姓名');

    // 打开表头插槽
    ctx.showHeader.value = true;
    await settle();
    expect(ctx.headerText('name')).toBe('自定义姓名');
    expect(table.getColumnByField('name')).toBe(column);
    expect(column.resizeWidth).toBe(260);
    expect(table.isActiveFilterByColumn('name')).toBe(true);
    expect(table.getTableData().tableData).toHaveLength(1);

    // 关闭表头插槽：回到 VXE 默认标题，状态仍在
    ctx.showHeader.value = false;
    await settle();
    expect(ctx.headerText('name')).toBe('姓名');
    expect(table.getColumnByField('name')).toBe(column);
    expect(column.resizeWidth).toBe(260);
    expect(table.isActiveFilterByColumn('name')).toBe(true);
    expect(table.getTableData().tableData).toHaveLength(1);
  });

  it('移除单元格插槽后按 VXE 默认方式渲染，列 formatter 仍然生效', async () => {
    const ctx = mountHost([
      { field: 'name', title: '姓名' },
      { field: 'amount', title: '金额', formatter: ({ cellValue }: any) => `¥${cellValue}` },
    ]);
    await settle();
    expect(ctx.cellText('amount')).toBe('¥1234.5');

    ctx.showCell.value = true;
    await settle();
    expect(ctx.cellText('amount')).toBe('插槽-1234.5');

    ctx.showCell.value = false;
    await settle();
    expect(ctx.cellText('amount')).toBe('¥1234.5');
  });

  it('切换 #group-header 不重建分组及其子列，子列列宽与 titlePrefix/titleSuffix 保留，分组标题回到默认', async () => {
    const showGroupHeader = ref(false);
    const columns: YTableColumn[] = [
      { field: 'name', title: '姓名' },
      {
        title: '财务',
        titlePrefix: { content: '前缀提示' },
        titleSuffix: { content: '后缀提示' },
        children: [{ field: 'amount', title: '金额' }],
      },
    ];
    const Host = defineComponent({
      components: { YTable },
      setup() {
        return { showGroupHeader, columns, rows };
      },
      template: `
        <YTable ref="table" :data="rows" :columns="columns" :height="300">
          <template v-if="showGroupHeader" #group-header="{ column }">分组-{{ column.title }}</template>
        </YTable>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });
    wrappers.push(wrapper);
    await settle();
    const table = (wrapper.vm.$refs.table as any).getTableInstance();
    const amount = table.getColumnByField('amount');
    const group = amount.parentId ? table.getColumnById(amount.parentId) : null;
    const groupCell = () => wrapper.find(`.vxe-header--column.${group.id}`);
    const groupText = () => groupCell().text();

    expect(groupText()).toBe('财务');
    expect(groupCell().find('.vxe-cell-title-prefix-icon').exists()).toBe(true);
    expect(groupCell().find('.vxe-cell-title-suffix-icon').exists()).toBe(true);
    await table.setColumnWidth('amount', 220);

    showGroupHeader.value = true;
    await settle();
    expect(groupText()).toBe('分组-财务');
    expect(groupCell().find('.vxe-cell-title-prefix-icon').exists()).toBe(true);
    expect(groupCell().find('.vxe-cell-title-suffix-icon').exists()).toBe(true);
    expect(table.getColumnByField('amount')).toBe(amount);
    expect(amount.resizeWidth).toBe(220);

    showGroupHeader.value = false;
    await settle();
    expect(groupText()).toBe('财务');
    expect(groupCell().find('.vxe-cell-title-prefix-icon').exists()).toBe(true);
    expect(groupCell().find('.vxe-cell-title-suffix-icon').exists()).toBe(true);
    expect(table.getColumnByField('amount')).toBe(amount);
    expect(amount.resizeWidth).toBe(220);
  });
});
