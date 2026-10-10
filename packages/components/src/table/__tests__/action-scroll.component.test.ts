import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from 'ant-design-vue';
import { nextTick } from 'vue';
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

/**
 * happy-dom 给 scrollTop 赋值时不派发 scroll。浏览器会派发。
 * 补上这次派发后，scrollToRow 的 setScrollTop 才会真正走进 vxe 的 scroll 监听；
 * vxe 4.19 在程序滚动期间置 intoRunScroll，监听会直接返回。
 *
 * @param element 表格主体滚动容器
 */
const emitScrollOnAssign = (element: HTMLElement) => {
  let top = element.scrollTop;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      if (value === top) return;
      top = value;
      element.dispatchEvent(new Event('scroll'));
    },
  });
};

/**
 * 仍打开的「更多」浮层数量。
 * 程序滚动会让浏览器派发原生 scroll，弹层节点可能暂时停在 opacity 0，触发器 class 也会晚一拍去掉。
 * 以 Popover 的 open 为准。
 *
 * @param wrapper 表格挂载结果
 * @returns 打开中的浮层数量
 */
const openedMoreCount = (wrapper: VueWrapper) =>
  wrapper.findAllComponents(Popover).filter(item => item.props('open') === true).length;

describe('YTable 操作浮层与真实滚动', () => {
  const columns: YTableColumn[] = [{ field: 'name', title: '姓名' }];

  it('用户纵向滚动关闭更多浮层，scrollToRow 不关闭', async () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      id: String(index + 1),
      name: `行${index + 1}`,
    }));
    const wrapper = mount(YTable, {
      props: {
        data: rows,
        columns,
        height: 180,
        actionConfig: {
          displayLimit: 0,
          buttons: [{ key: 'view', text: '查看', clickFn: vi.fn() }],
        },
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);

    await waitForBodyRow(wrapper);
    const body = wrapper.get('.vxe-table--body-wrapper.body--wrapper .vxe-table--body-inner-wrapper')
      .element as HTMLElement;
    expect(wrapper.find('.vxe-table--scroll-y-handle').exists()).toBe(true);
    expect(wrapper.find('.vxe-table--scroll-x-handle').exists()).toBe(true);

    const openMore = async () => {
      await wrapper.get('.y-table-action-btn').trigger('click');
      await flushPromises();
      expect(openedMoreCount(wrapper)).toBe(1);
    };

    await openMore();

    const bodyRows = body.querySelectorAll<HTMLElement>('.vxe-body--row');
    const lastRowElement = bodyRows[bodyRows.length - 1];
    Object.defineProperty(lastRowElement, 'offsetTop', { configurable: true, get: () => 800 });
    Object.defineProperty(lastRowElement, 'clientHeight', { configurable: true, get: () => 36 });
    emitScrollOnAssign(body);

    const table = (
      wrapper.vm as unknown as {
        getTableInstance: () => { scrollToRow: (row: object) => Promise<unknown> };
      }
    ).getTableInstance();
    await table.scrollToRow(rows[rows.length - 1]);
    await flushPromises();
    await nextTick();
    const vxe = wrapper.findComponent({ name: 'VxeTable' });
    expect(vxe.emitted('scroll')).toBeFalsy();
    expect(openedMoreCount(wrapper)).toBe(1);

    body.scrollTop = body.scrollTop + 48;
    await flushPromises();
    await nextTick();
    const scrollEvents = vxe.emitted('scroll') ?? [];
    expect(scrollEvents).toHaveLength(1);
    expect(scrollEvents[0]?.[0]).toMatchObject({ isY: true });
    expect(openedMoreCount(wrapper)).toBe(0);
  });
});
