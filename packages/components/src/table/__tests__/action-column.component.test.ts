/* eslint-disable vue/one-component-per-file */
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRaw } from 'vue';

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
        h('div', { class: 'popover-stub' }, [
          h(
            'div',
            {
              class: 'popover-trigger',
              onClick: () => emit('update:open', !props.open),
            },
            slots.default?.()
          ),
          props.open ? h('div', { class: 'popover-content' }, slots.content?.()) : undefined,
        ]);
    },
  });

  const Popconfirm = defineComponent({
    name: 'APopconfirmStub',
    props: {
      open: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:open', 'confirm', 'cancel'],
    setup(props, { emit, slots }) {
      return () =>
        h('span', { class: 'popconfirm-stub' }, [
          h(
            'span',
            {
              class: 'popconfirm-trigger',
              onClick: () => {
                if (!props.disabled) emit('update:open', true);
              },
            },
            slots.default?.()
          ),
          props.open
            ? h('span', { class: 'popconfirm-content' }, [
                h('button', { class: 'popconfirm-confirm', onClick: () => emit('confirm') }, '确定'),
                h('button', { class: 'popconfirm-cancel', onClick: () => emit('cancel') }, '取消'),
              ])
            : undefined,
        ]);
    },
  });

  return { Button, Popover, Popconfirm };
});

import ActionColumn from '../ActionColumn.vue';
import type { ActionButtonConfig } from '../type';

const wrappers: VueWrapper[] = [];

/** 挂载操作列并记录清理。 */
const mountActionColumn = (options: {
  buttons: ActionButtonConfig[];
  displayLimit?: number;
  scope?: Record<string, unknown>;
}) => {
  const wrapper = mount(ActionColumn, {
    props: {
      buttons: options.buttons,
      displayLimit: options.displayLimit,
      scope: options.scope ?? { row: { id: 1 } },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
};

/** 打开“更多”菜单。 */
const openMore = async (wrapper: VueWrapper) => {
  await wrapper.get('.popover-trigger').trigger('click');
  expect(wrapper.find('.popover-content').exists()).toBe(true);
};

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('YTable ActionColumn 更多菜单', () => {
  it('普通操作执行前自动关闭更多菜单', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'version', text: '版本', clickFn: click }],
    });

    await openMore(wrapper);
    await wrapper.get('.y-table-action-link').trigger('click');

    expect(click).toHaveBeenCalledOnce();
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('异步操作未完成时也立即关闭更多菜单', async () => {
    let resolveAction: (() => void) | undefined;
    const pendingAction = new Promise<void>(resolve => {
      resolveAction = resolve;
    });
    const click = vi.fn(() => pendingAction);
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'detail', text: '详情', clickFn: click }],
    });

    await openMore(wrapper);
    await wrapper.get('.y-table-action-link').trigger('click');

    expect(click).toHaveBeenCalledOnce();
    expect(wrapper.find('.popover-content').exists()).toBe(false);

    resolveAction?.();
    await pendingAction;
  });

  it('禁用操作不执行且保持更多菜单打开', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'disabled', text: '禁用操作', disabledFn: () => true, clickFn: click }],
    });

    await openMore(wrapper);
    const actionButton = wrapper.get('.y-table-action-link');
    expect(actionButton.attributes('disabled')).toBeDefined();

    await actionButton.trigger('click');

    expect(click).not.toHaveBeenCalled();
    expect(wrapper.find('.popover-content').exists()).toBe(true);
  });

  it('直显禁用操作透传 disabled 且不触发点击', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 2,
      buttons: [{ key: 'view', text: '查看', disabledFn: () => true, clickFn: click }],
    });

    const actionButton = wrapper.get('.y-table-action-link');
    expect(actionButton.attributes('disabled')).toBeDefined();
    await actionButton.trigger('click');
    expect(click).not.toHaveBeenCalled();
  });

  it('二次确认操作在确认前保持菜单，确认后关闭并执行', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'delete', text: '删除', isConfirm: true, clickFn: click }],
    });

    await openMore(wrapper);
    await wrapper.get('.y-table-action-link').trigger('click');

    expect(wrapper.find('.popover-content').exists()).toBe(true);
    expect(wrapper.find('.popconfirm-content').exists()).toBe(true);
    expect(click).not.toHaveBeenCalled();

    await wrapper.get('.popconfirm-confirm').trigger('click');

    expect(click).toHaveBeenCalledOnce();
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('取消二次确认后关闭更多菜单且不执行操作', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'delete', text: '删除', isConfirm: true, clickFn: click }],
    });

    await openMore(wrapper);
    await wrapper.get('.y-table-action-link').trigger('click');
    await wrapper.get('.popconfirm-cancel').trigger('click');

    expect(click).not.toHaveBeenCalled();
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('收纳按钮清空后再次出现时不会恢复旧的打开状态', async () => {
    const directButton: ActionButtonConfig = { key: 'edit', text: '编辑' };
    const moreButton: ActionButtonConfig = { key: 'version', text: '版本' };
    const wrapper = mountActionColumn({
      displayLimit: 1,
      buttons: [directButton, moreButton],
    });

    await openMore(wrapper);
    await wrapper.setProps({ buttons: [directButton] });
    expect(wrapper.find('.popover-trigger').exists()).toBe(false);

    await wrapper.setProps({ buttons: [directButton, moreButton] });
    expect(wrapper.find('.popover-trigger').exists()).toBe(true);
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('行被复用时自动关闭上一行的更多菜单', async () => {
    const wrapper = mountActionColumn({
      displayLimit: 0,
      buttons: [{ key: 'version', text: '版本' }],
    });

    await openMore(wrapper);
    await wrapper.setProps({ scope: { row: { id: 2 } } });

    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('规范化 displayLimit 的负数、小数和 NaN 边界', async () => {
    const buttons: ActionButtonConfig[] = [
      { key: 'one', text: '一' },
      { key: 'two', text: '二' },
      { key: 'three', text: '三' },
    ];
    const wrapper = mountActionColumn({ buttons, displayLimit: -1 });

    expect(wrapper.findAll('.y-table-action-list > .y-table-action-link')).toHaveLength(0);
    expect(wrapper.find('.popover-trigger').exists()).toBe(true);

    await wrapper.setProps({ displayLimit: 1.9 });
    expect(wrapper.findAll('.y-table-action-list > .y-table-action-link')).toHaveLength(1);

    await wrapper.setProps({ displayLimit: Number.NaN });
    expect(wrapper.find('.popover-trigger').exists()).toBe(false);
    expect(wrapper.findAll('.y-table-action-list > .y-table-action-link')).toHaveLength(3);
  });

  it('轮询刷新行对象但 id 不变时保持更多菜单打开', async () => {
    const wrapper = mountActionColumn({
      displayLimit: 0,
      scope: { row: { id: 1, status: 'pending' } },
      buttons: [{ key: 'version', text: '版本' }],
    });

    await openMore(wrapper);
    await wrapper.setProps({ scope: { row: { id: 1, status: 'running' } } });

    expect(wrapper.find('.popover-content').exists()).toBe(true);
  });

  it('基于 scope.rowid 识别稳定行身份：rowid 不变保持打开，变化则关闭', async () => {
    const wrapper = mountActionColumn({
      displayLimit: 0,
      scope: { rowid: 'row_101', row: { name: 'task-a' } },
      buttons: [{ key: 'version', text: '版本' }],
    });

    await openMore(wrapper);
    // 重建行对象但 rowid 不变
    await wrapper.setProps({ scope: { rowid: 'row_101', row: { name: 'task-a-updated' } } });
    expect(wrapper.find('.popover-content').exists()).toBe(true);

    // rowid 变化（换行或复用）
    await wrapper.setProps({ scope: { rowid: 'row_102', row: { name: 'task-b' } } });
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('更多中的 Popconfirm 打开后轮询刷新保持打开，确认时读取最新 row', async () => {
    const click = vi.fn();
    const wrapper = mountActionColumn({
      displayLimit: 0,
      scope: { row: { id: 1, status: 'pending' } },
      buttons: [{ key: 'delete', text: '删除', isConfirm: true, clickFn: click }],
    });

    await openMore(wrapper);
    await wrapper.get('.y-table-action-link').trigger('click');
    expect(wrapper.find('.popconfirm-content').exists()).toBe(true);

    // 轮询刷新，产生新的 row 引用
    const nextRow = { id: 1, status: 'success' };
    await wrapper.setProps({ scope: { row: nextRow } });

    expect(wrapper.find('.popover-content').exists()).toBe(true);
    expect(wrapper.find('.popconfirm-content').exists()).toBe(true);

    await wrapper.get('.popconfirm-confirm').trigger('click');
    expect(click).toHaveBeenCalledOnce();
    expect(toRaw(click.mock.calls[0][0].row)).toBe(nextRow);
    expect(click.mock.calls[0][0].row.status).toBe('success');
  });

  it('直显按钮动态隐藏导致收纳按钮提升时关闭更多菜单', async () => {
    let hideFirst = false;
    const wrapper = mountActionColumn({
      displayLimit: 1,
      buttons: [
        { key: 'edit', text: '编辑', hideFn: () => hideFirst },
        { key: 'detail', text: '详情' },
        { key: 'delete', text: '删除' },
      ],
    });

    await openMore(wrapper);
    expect(wrapper.find('.popover-content').exists()).toBe(true);

    // 动态隐藏编辑按钮，使得详情按钮从 tail 移动到 head
    hideFirst = true;
    await wrapper.setProps({
      buttons: [
        { key: 'edit', text: '编辑', hideFn: () => true },
        { key: 'detail', text: '详情' },
        { key: 'delete', text: '删除' },
      ],
    });

    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });
});
