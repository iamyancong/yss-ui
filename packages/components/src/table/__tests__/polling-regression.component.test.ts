/* eslint-disable vue/one-component-per-file */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, provide, ref } from 'vue';
import ActionColumn from '../ActionColumn.vue';
import type { ActionButtonConfig } from '../types';
import { Y_TABLE_ACTION_SCROLL_KEY } from '../utils/actionScroll';

vi.mock('@yss-ui/utils', () => ({ hasAuth: () => true }));

vi.mock('@ant-design/icons-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    MoreOutlined: defineComponent({
      name: 'MoreOutlinedStub',
      setup: () => () => h('span', { class: 'more-icon-stub' }),
    }),
  };
});

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');

  const Button = defineComponent({
    name: 'AButtonStub',
    inheritAttrs: false,
    props: {
      disabled: { type: Boolean, default: false },
      loading: { type: Boolean, default: false },
      type: { type: String, default: 'default' },
      size: { type: String, default: 'middle' },
    },
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            disabled: props.disabled,
            onClick: (event: MouseEvent) => {
              if (!props.disabled) emit('click', event);
            },
          },
          slots.default?.()
        );
    },
  });

  const Popover = defineComponent({
    name: 'APopoverStub',
    props: {
      open: { type: Boolean, default: false },
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      return () =>
        h('div', { class: 'popover-stub', 'data-open': String(props.open) }, [
          h(
            'div',
            {
              class: 'popover-trigger',
              onClick: () => emit('update:open', !props.open),
            },
            slots.default?.()
          ),
          props.open ? h('div', { class: 'popover-content' }, slots.content?.()) : null,
        ]);
    },
  });

  const Popconfirm = defineComponent({
    name: 'APopconfirmStub',
    props: {
      open: { type: Boolean, default: false },
    },
    emits: ['update:open', 'confirm'],
    setup(props, { emit, slots }) {
      return () =>
        h('div', { class: 'popconfirm-stub' }, [
          h(
            'div',
            {
              class: 'popconfirm-trigger',
              onClick: () => emit('update:open', !props.open),
            },
            slots.default?.()
          ),
          props.open ? h('div', { class: 'popconfirm-content' }, slots.title?.()) : null,
        ]);
    },
  });

  return {
    Button,
    Popover,
    Popconfirm,
  };
});

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount());
  document.body.innerHTML = '';
});

describe('G4 消费方回归：轮询表格场景', () => {
  it('场景 A（#35）：配置 rowConfig.keyField，打开「更多」后轮询 3 次返回新对象引用，浮层保持打开', async () => {
    const buttons: ActionButtonConfig[] = [
      { key: 'view', text: '查看' },
      { key: 'edit', text: '编辑' },
      { key: 'audit', text: '审批' },
      { key: 'del', text: '删除', isConfirm: true, confirmProps: { needLoading: true } },
    ];

    const rowRef = ref({ id: 1, name: 'Alice-v1' });
    const rowIdRef = ref('1');

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(ActionColumn, {
              scope: {
                row: rowRef.value,
                rowid: rowIdRef.value,
                rowIndex: 0,
              },
              displayLimit: 2,
              buttons,
            });
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);

    // 找到并点击「更多」按钮，打开 Popover 浮层
    const popoverTrigger = wrapper.get('.popover-trigger');
    await popoverTrigger.trigger('click');
    await nextTick();
    await flushPromises();

    // 确认已打开
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 轮询 Tick 1：返回全新行对象（引用变化，但 keyField 'id' / rowid 不变）
    rowRef.value = { id: 1, name: 'Alice-v2' };
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 轮询 Tick 2
    rowRef.value = { id: 1, name: 'Alice-v3' };
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 轮询 Tick 3
    rowRef.value = { id: 1, name: 'Alice-v4' };
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 对照组：当行身份真正切换到另一行（如 id 变成 2）时，浮层应被安全关闭
    rowRef.value = { id: 2, name: 'Bob' };
    rowIdRef.value = '2';
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('false');
  });

  it('场景 B（#38）：未配置 keyField 时，行里缺字段或包含深层字段，只要 row.id 不变，刷新数据弹层不关闭', async () => {
    const buttons: ActionButtonConfig[] = [
      { key: 'view', text: '查看' },
      { key: 'edit', text: '编辑' },
      { key: 'audit', text: '审批' },
      { key: 'del', text: '删除' },
    ];

    // 初始行数据，未提供 scope.rowid（未配 keyField 场景），行数据包含嵌套字段与多列字段
    const rowRef = ref<Record<string, any>>({
      id: 101,
      name: 'Order-A',
      detail: { code: 'D-001', remark: 'initial' },
      extraCol: 'val1',
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(ActionColumn, {
              scope: {
                row: rowRef.value,
                rowIndex: 0,
              },
              displayLimit: 2,
              buttons,
            });
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);

    // 打开「更多」弹层
    await wrapper.get('.popover-trigger').trigger('click');
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 轮询刷新：数据缺少 extraCol 与 detail 嵌套字段，但核心 row.id 仍为 101
    rowRef.value = {
      id: 101,
      name: 'Order-A-refreshed',
    };
    await nextTick();
    await flushPromises();
    // 弹层依然保持打开
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 对照组：当行身份切换为另一行 (id 变成 102) 时关闭
    rowRef.value = {
      id: 102,
      name: 'Order-B',
    };
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('false');
  });

  it('场景 C（#39）：用户纵向滚动时弹层关闭，调用 scrollToRow 等程序化滚动时不关闭', async () => {
    const buttons: ActionButtonConfig[] = [
      { key: 'view', text: '查看' },
      { key: 'edit', text: '编辑' },
      { key: 'more1', text: '操作1' },
      { key: 'more2', text: '操作2' },
    ];

    const scrollTick = ref(0);

    const wrapper = mount(
      defineComponent({
        setup() {
          // 提供表格滚动上下文
          provide(Y_TABLE_ACTION_SCROLL_KEY, { scrollTick });
          return () =>
            h(ActionColumn, {
              scope: {
                row: { id: 1, name: 'Row-1' },
                rowid: '1',
                rowIndex: 0,
              },
              displayLimit: 2,
              buttons,
              closeOnScroll: true,
            });
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);

    // 打开「更多」
    await wrapper.get('.popover-trigger').trigger('click');
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 1. 模拟 scrollToRow：程序滚动不派发用户 scroll 事件，scrollTick 不变化，弹层不关闭
    // （在真实 vxe 中，scrollToRow 会置 intoRunScroll，不派发 scroll）
    await nextTick();
    await flushPromises();
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('true');

    // 2. 模拟用户真实纵向滚动：表格监听到真实滚动后派发 scrollTick 递增
    scrollTick.value += 1;
    await nextTick();
    await flushPromises();
    // 用户真实滚动后，操作列弹层应被安全关闭
    expect(wrapper.get('.popover-stub').attributes('data-open')).toBe('false');
  });
});
