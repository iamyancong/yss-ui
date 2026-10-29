/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import YTable from '../index.vue';
import TableColumnNode, { getColumnNodeKey, getSlotKeys, toKebabCase } from '../TableColumnNode';
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
    // 分组列：模拟真实 VxeColgroup 在 setup 阶段捕获 slots.header 的行为，无插槽时回退 title
    VxeColgroup: defineVueComponent({
      name: 'VxeColgroup',
      props: ['title', 'field', 'headerAlign', 'fixed'],
      setup(props, { slots }) {
        const initialHeaderSlot = slots.header;
        return () =>
          render('div', { class: 'vxe-colgroup-mock', 'data-title': props.title }, [
            render(
              'div',
              { class: 'group-header' },
              initialHeaderSlot ? initialHeaderSlot({ column: { title: props.title } }) : props.title
            ),
            slots.default?.(),
          ]);
      },
    }),
    // 叶子列：模拟真实 VxeColumn 的 header / default / filter / content 插槽与默认回退
    VxeColumn: defineVueComponent({
      name: 'VxeColumn',
      props: ['title', 'field', 'width', 'align', 'type', 'fixed'],
      setup(props, { slots }) {
        return () =>
          render('div', { class: 'vxe-column-mock', 'data-field': props.field, 'data-title': props.title }, [
            render('div', { class: 'col-header' }, slots.header ? slots.header({ column: props }) : props.title),
            render(
              'div',
              { class: 'col-cell' },
              slots.default
                ? slots.default({ row: { [props.field]: `cell-${props.field}` }, column: props, rowIndex: 0 })
                : `default-${props.field}`
            ),
            slots.filter ? render('div', { class: 'col-filter' }, slots.filter({ column: props })) : null,
            slots.content
              ? render('div', { class: 'col-content' }, slots.content({ row: {}, column: props, rowIndex: 0 }))
              : null,
          ]);
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

  it('getColumnNodeKey 为无 field/type 的同级分组生成唯一 key，并兼容 colId=0 等边界值', () => {
    const groups: YTableColumn[] = [{ title: 'A' }, { title: 'B' }, { title: 'A' }, {}];
    const keys = groups.map((g, i) => getColumnNodeKey(g, i));
    expect(new Set(keys).size).toBe(4);
    expect(getColumnNodeKey({ field: 'name' }, 0)).toBe('name');
    expect(getColumnNodeKey({ type: 'seq' }, 0)).toBe('seq');
    expect(getColumnNodeKey({ colId: 0, field: 'name' } as any, 0)).toBe(0);
    expect(getColumnNodeKey({ colId: '', field: 'name' } as any, 0)).toBe('name');
  });

  it('children 为空数组时按普通叶子列渲染 vxe-column，不产生空分组', () => {
    const wrapper = mount(YTable, {
      props: {
        data: [],
        pageable: false,
        columns: [{ field: 'emptyChildrenCol', title: '空子列配置', children: [] }],
      },
    });
    expect(wrapper.findAll('.vxe-colgroup-mock')).toHaveLength(0);
    const col = wrapper.find('.vxe-column-mock');
    expect(col.attributes('data-field')).toBe('emptyChildrenCol');
    expect(col.find('.col-header').text()).toBe('空子列配置');
  });

  it('业务方通过 v-if 动态增删表头插槽时，列节点实时重渲染且移除后回退默认标题（不出现空表头）', async () => {
    const showCustomHeader = ref(false);
    const showGlobalHeader = ref(false);
    const columns = buildColumns(['A']);

    const wrapper = mount(
      defineComponent({
        components: { YTable },
        setup() {
          return { showCustomHeader, showGlobalHeader, columns };
        },
        template: `
          <YTable :data="[]" :columns="columns" :pageable="false">
            <template v-if="showCustomHeader" #labelHeader="{ column }">
              <span class="custom-label-header">自定义-{{ column.title }}</span>
            </template>
            <template v-if="showGlobalHeader" #header="{ column }">
              <span class="global-header">全局-{{ column.title }}</span>
            </template>
          </YTable>
        `,
      })
    );

    const getLabelHeaderText = () => wrapper.find('.vxe-column-mock[data-field="label"] .col-header').text();

    // 1. 初始两个 v-if 均为 false：显示列默认 title
    expect(getLabelHeaderText()).toBe('账户名称');

    // 2. 开启字段专属表头插槽 #labelHeader
    showCustomHeader.value = true;
    await nextTick();
    expect(getLabelHeaderText()).toBe('自定义-账户名称');

    // 3. 同时开启全局 #header，字段专属插槽优先级更高
    showGlobalHeader.value = true;
    await nextTick();
    expect(getLabelHeaderText()).toBe('自定义-账户名称');
    expect(wrapper.find('.vxe-column-mock[data-field="A_2026-06-30"] .col-header').text()).toBe('全局-整体');

    // 4. 关闭字段专属插槽 #labelHeader，自动降级到全局 #header
    showCustomHeader.value = false;
    await nextTick();
    expect(getLabelHeaderText()).toBe('全局-账户名称');

    // 5. 关闭全局 #header，回退到列默认 title，不出现空表头
    showGlobalHeader.value = false;
    await nextTick();
    expect(getLabelHeaderText()).toBe('账户名称');
    expect(wrapper.find('.vxe-column-mock[data-field="A_2026-06-30"] .col-header').text()).toBe('整体');
  });

  it('业务方通过 v-if 动态增删分组表头插槽、深层单元格插槽与筛选插槽时实时生效并安全回退', async () => {
    const showGroupHeader = ref(true);
    const showDeepCell = ref(true);
    const showFilter = ref(false);
    const columns = buildColumns(['A']);

    const wrapper = mount(
      defineComponent({
        components: { YTable },
        setup() {
          return { showGroupHeader, showDeepCell, showFilter, columns };
        },
        template: `
          <YTable :data="[]" :columns="columns" :pageable="false">
            <template v-if="showGroupHeader" #group-header="{ column }">
              <b class="dynamic-group-header">分组:{{ column.title }}</b>
            </template>
            <template v-if="showDeepCell" #A_2026-06-30="{ row }">
              <span class="dynamic-deep-cell">插槽:{{ row['A_2026-06-30'] }}</span>
            </template>
            <template v-if="showFilter" #labelFilter="{ column }">
              <div class="dynamic-filter">筛选:{{ column.field }}</div>
            </template>
          </YTable>
        `,
      })
    );

    // 初始开启 group-header 与深层单元格插槽
    expect(wrapper.findAll('.group-header').map(n => n.text())).toEqual([
      '分组:A',
      '分组:2026-06-30',
      '分组:2026-09-30',
    ]);
    expect(wrapper.find('.vxe-column-mock[data-field="A_2026-06-30"] .col-cell').text()).toBe('插槽:cell-A_2026-06-30');
    expect(wrapper.find('.dynamic-filter').exists()).toBe(false);

    // 关闭 group-header 与深层单元格插槽，开启筛选插槽
    showGroupHeader.value = false;
    showDeepCell.value = false;
    showFilter.value = true;
    await nextTick();

    // 分组表头回退到原 title，不为空
    expect(wrapper.findAll('.group-header').map(n => n.text())).toEqual(['A', '2026-06-30', '2026-09-30']);
    // 深层单元格回退到默认渲染，不为空
    expect(wrapper.find('.vxe-column-mock[data-field="A_2026-06-30"] .col-cell').text()).toBe('default-A_2026-06-30');
    // 筛选插槽挂载成功
    expect(wrapper.find('.dynamic-filter').text()).toBe('筛选:label');

    // 再次开启 group-header，且验证列顺序未发生错乱
    showGroupHeader.value = true;
    showFilter.value = false;
    await nextTick();
    expect(wrapper.findAll('.group-header').map(n => n.text())).toEqual([
      '分组:A',
      '分组:2026-06-30',
      '分组:2026-09-30',
    ]);
    expect(wrapper.find('.dynamic-filter').exists()).toBe(false);
    expect(wrapper.findAll('.vxe-column-mock').map(c => c.attributes('data-field'))).toEqual([
      'label',
      'A_2026-06-30',
      'A_2026-09-30',
    ]);
  });

  it('getSlotKeys 与 toKebabCase 边界值处理正确', () => {
    expect(getSlotKeys(null)).toBe('');
    expect(getSlotKeys(undefined)).toBe('');
    expect(getSlotKeys({ b: () => null, a: undefined, c: () => null })).toBe('b|c');
    expect(toKebabCase('userName')).toBe('user-name');
    expect(toKebabCase('user_name_1')).toBe('user-name-1');
    expect(toKebabCase('')).toBe('');
  });

  it('表头插槽多种命名方式（camelCase / field-header / kebab-case-header / header）按优先级动态降级与回退', async () => {
    const useCamel = ref(true);
    const useRawSuffix = ref(true);
    const useKebab = ref(true);
    const useGlobal = ref(true);
    const columns: YTableColumn[] = [{ field: 'userName', title: '用户名' }];

    const wrapper = mount(
      defineComponent({
        components: { YTable },
        setup() {
          return { useCamel, useRawSuffix, useKebab, useGlobal, columns };
        },
        template: `
          <YTable :data="[]" :columns="columns" :pageable="false">
            <template v-if="useCamel" #userNameHeader>camelHeader</template>
            <template v-if="useRawSuffix" #userName-header>rawSuffixHeader</template>
            <template v-if="useKebab" #user-name-header>kebabHeader</template>
            <template v-if="useGlobal" #header>globalHeader</template>
          </YTable>
        `,
      })
    );

    const getHeaderText = () => wrapper.find('.vxe-column-mock[data-field="userName"] .col-header').text();

    expect(getHeaderText()).toBe('camelHeader');
    useCamel.value = false;
    await nextTick();
    expect(getHeaderText()).toBe('rawSuffixHeader');

    useRawSuffix.value = false;
    await nextTick();
    expect(getHeaderText()).toBe('kebabHeader');

    useKebab.value = false;
    await nextTick();
    expect(getHeaderText()).toBe('globalHeader');

    useGlobal.value = false;
    await nextTick();
    expect(getHeaderText()).toBe('用户名');
  });

  it('区分「插槽显式渲染空文本」与「v-if 移除插槽后回退默认标题」', async () => {
    const hasHeaderSlot = ref(true);
    const headerText = ref('');
    const columns: YTableColumn[] = [{ field: 'status', title: '状态' }];

    const wrapper = mount(
      defineComponent({
        components: { YTable },
        setup() {
          return { hasHeaderSlot, headerText, columns };
        },
        template: `
          <YTable :data="[]" :columns="columns" :pageable="false">
            <template v-if="hasHeaderSlot" #statusHeader>{{ headerText }}</template>
          </YTable>
        `,
      })
    );

    const getHeaderText = () => wrapper.find('.vxe-column-mock[data-field="status"] .col-header').text();

    // 插槽存在且内容为空字符串时，尊重插槽自身的空内容
    expect(getHeaderText()).toBe('');

    // 插槽内容更新为非空
    headerText.value = '状态(自定义)';
    await nextTick();
    expect(getHeaderText()).toBe('状态(自定义)');

    // v-if 移除插槽后，回退为列配置的 title
    hasHeaderSlot.value = false;
    await nextTick();
    expect(getHeaderText()).toBe('状态');
  });

  it('TableColumnNode 脱离 YTable 单独挂载时抛出明确错误提示', () => {
    expect(() =>
      mount(TableColumnNode, {
        props: { column: { field: 'name', title: '姓名' } },
      })
    ).toThrow('[YTable] YTableColumnNode 只能在 YTable 内部使用');
  });
});
