/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import YTable from '../index.vue';
import { getColumnNodeKey } from '../TableColumnNode';
import type { YTableColumn } from '../types';

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
    // 分组列：渲染子列，便于断言嵌套结构
    VxeColgroup: defineVueComponent({
      name: 'VxeColgroup',
      props: ['title', 'field', 'headerAlign', 'fixed'],
      setup(props, { slots }) {
        return () =>
          render('div', { class: 'vxe-colgroup-mock', 'data-title': props.title }, [
            render('div', { class: 'group-header' }, slots.header?.({ column: { title: props.title } })),
            slots.default?.(),
          ]);
      },
    }),
    // 叶子列：渲染 default 插槽，便于断言字段插槽透传到深层叶子
    VxeColumn: defineVueComponent({
      name: 'VxeColumn',
      props: ['title', 'field', 'width', 'align', 'type', 'fixed'],
      setup(props, { slots }) {
        return () =>
          render(
            'div',
            { class: 'vxe-column-mock', 'data-field': props.field, 'data-title': props.title },
            slots.default?.({ row: { [props.field]: `cell-${props.field}` }, column: props, rowIndex: 0 })
          );
      },
    }),
    VxeToolbar: defineVueComponent({
      name: 'VxeToolbar',
      setup() {
        return () => render('div', { class: 'vxe-toolbar-mock' });
      },
    }),
  };
});

/** 构造「方案 → 日期 → 账户」多级表头（3 层）。 */
const buildColumns = (schemes: string[]): YTableColumn[] => [
  { field: 'label', title: '账户名称', fixed: 'left', width: 200 },
  ...schemes.map<YTableColumn>(scheme => ({
    title: scheme,
    children: ['2026-06-30', '2026-09-30'].map<YTableColumn>(date => ({
      title: date,
      children: [{ field: `${scheme}_${date}`, title: '整体', align: 'right' }],
    })),
  })),
];

describe('YTable 多级分组表头', () => {
  it('children 嵌套多层时递归渲染 vxe-colgroup，叶子列顺序与配置一致', () => {
    const wrapper = mount(YTable, { props: { data: [], columns: buildColumns(['A', 'B']), pageable: false } });

    const topGroups = wrapper.findAll('.vxe-table-mock > .vxe-colgroup-mock');
    expect(topGroups.map(g => g.attributes('data-title'))).toEqual(['A', 'B']);

    const dateGroups = Array.from(topGroups[0].element.children).filter(el =>
      el.classList.contains('vxe-colgroup-mock')
    );
    expect(dateGroups.map(el => el.getAttribute('data-title'))).toEqual(['2026-06-30', '2026-09-30']);

    const leafFields = wrapper.findAll('.vxe-column-mock').map(c => c.attributes('data-field'));
    expect(leafFields).toEqual(['label', 'A_2026-06-30', 'A_2026-09-30', 'B_2026-06-30', 'B_2026-09-30']);
  });

  it('分组列不再把 children 等叶子列专属属性透传给 vxe-colgroup', () => {
    const wrapper = mount(YTable, {
      props: {
        data: [],
        pageable: false,
        columns: [
          {
            title: '分组',
            field: 'group',
            isTransform: true,
            props: { fieldNames: {} },
            children: [{ field: 'name', title: '名称' }],
          },
        ],
      },
    });
    const group = wrapper.findComponent({ name: 'VxeColgroup' });
    expect(group.props('field')).toBe('group');
    expect(group.attributes('children')).toBeUndefined();
    expect(group.attributes('props')).toBeUndefined();
    expect(group.attributes('istransform')).toBeUndefined();
  });

  it('字段插槽、分组表头插槽可作用于任意层级', () => {
    const wrapper = mount(YTable, {
      props: { data: [], columns: buildColumns(['A']), pageable: false },
      slots: {
        'A_2026-06-30': ({ row }: any) => h('span', { class: 'deep-cell' }, row['A_2026-06-30']),
        'group-header': ({ column }: any) => h('b', { class: 'group-title' }, column.title),
      },
    });
    expect(wrapper.find('.deep-cell').text()).toBe('cell-A_2026-06-30');
    expect(wrapper.findAll('.group-title').map(n => n.text())).toEqual(['A', '2026-06-30', '2026-09-30']);
  });

  it('动态增删分组后列顺序与最新配置一致', async () => {
    const schemes = ref(['A', 'B']);
    const wrapper = mount(
      defineComponent({
        render: () => h(YTable, { data: [], columns: buildColumns(schemes.value), pageable: false }),
      })
    );

    schemes.value = ['C', 'A', 'B'];
    await nextTick();
    const titles = wrapper.findAll('.vxe-table-mock > .vxe-colgroup-mock').map(g => g.attributes('data-title'));
    expect(titles).toEqual(['C', 'A', 'B']);

    schemes.value = ['B'];
    await nextTick();
    const leafFields = wrapper.findAll('.vxe-column-mock').map(c => c.attributes('data-field'));
    expect(leafFields).toEqual(['label', 'B_2026-06-30', 'B_2026-09-30']);
  });

  it('getColumnNodeKey 为无 field/type 的同级分组生成唯一 key', () => {
    const groups: YTableColumn[] = [{ title: 'A' }, { title: 'B' }, { title: 'A' }];
    const keys = groups.map((g, i) => getColumnNodeKey(g, i));
    expect(new Set(keys).size).toBe(3);
    expect(getColumnNodeKey({ field: 'name' }, 0)).toBe('name');
    expect(getColumnNodeKey({ type: 'seq' }, 0)).toBe('seq');
  });
});
