import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useTableMinHeight } from '../hooks/useTableMinHeight';
import YTable from '../index.vue';

const wrappers: VueWrapper[] = [];

/** 构造实际表头、完整数据行、表尾和横向滚动条的尺寸。 */
const setup = (heights: number[], enabled = true) => {
  const root = document.createElement('div');
  const selectors = [
    'vxe-table--header-wrapper',
    'vxe-table--body-wrapper',
    'vxe-table--footer-wrapper',
    'vxe-table--scroll-x-virtual',
  ];
  selectors.forEach((name, index) => {
    const node = document.createElement('div');
    node.className = name;
    if (index === 1) {
      const row = document.createElement('div');
      row.className = 'vxe-body--row';
      Object.defineProperty(row, 'offsetHeight', { value: heights[index] });
      node.append(row);
    } else {
      Object.defineProperty(node, 'offsetHeight', { value: heights[index] });
    }
    root.append(node);
  });
  let height!: ReturnType<typeof useTableMinHeight>;
  const recalculate = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        height = useTableMinHeight(
          ref({ $el: root, recalculate }),
          () => enabled,
          () => 36
        );
        return () => h('div');
      },
    })
  );
  wrappers.push(wrapper);
  return { wrapper, recalculate, height: () => height.value };
};

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('YTable 默认完整一行的最小高度', () => {
  it('表头加一整行，不让过小 height 裁切数据行', async () => {
    const result = setup([44, 36, 0, 0]);
    await nextTick();
    await nextTick();
    expect(result.height()).toBe(80);
    await nextTick();
    expect(result.recalculate).toHaveBeenCalledWith(true);
  });

  it('计入多级表头、实际行高、表尾和横向滚动条', async () => {
    const result = setup([88, 52, 45, 14]);
    await nextTick();
    await nextTick();
    expect(result.height()).toBe(199);
  });

  it('无表头时只要求一整行', async () => {
    const result = setup([0, 36, 0, 0]);
    await nextTick();
    await nextTick();
    expect(result.height()).toBe(36);
  });

  it('不限制自适应表格或显式 minHeight', async () => {
    const result = setup([44, 36, 0, 0], false);
    await nextTick();
    await nextTick();
    expect(result.height()).toBeUndefined();
  });

  it('卸载后不创建排队中的观察者', async () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = vi.fn();
      }
    );
    const result = setup([44, 36, 0, 0]);
    result.wrapper.unmount();
    await nextTick();
    expect(observe).not.toHaveBeenCalled();
  });
});

describe('YTable 动态传入 / 去掉 min-height', () => {
  it('业务方后续去掉 min-height 时恢复默认下限，再次传入时以业务值为准', async () => {
    const wrapper = mount(YTable, {
      attachTo: document.body,
      props: { data: [], columns: [{ field: 'name', title: '姓名' }], height: 100, minHeight: 0 } as any,
    });
    wrappers.push(wrapper);
    const vxeMinHeight = () => wrapper.findComponent({ name: 'VxeTable' }).props('minHeight');
    const settle = async () => {
      for (let i = 0; i < 4; i += 1) {
        await flushPromises();
        await nextTick();
      }
    };
    await settle();
    expect(vxeMinHeight()).toBe(0);

    await wrapper.setProps({ minHeight: undefined } as any);
    await settle();
    // jsdom 无布局尺寸，默认下限回退为配置行高 36
    expect(vxeMinHeight()).toBe(36);

    await wrapper.setProps({ minHeight: 120 } as any);
    await settle();
    expect(vxeMinHeight()).toBe(120);
  });
});
