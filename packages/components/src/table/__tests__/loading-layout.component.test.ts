import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useLoadingLayout } from '../hooks/useLoadingLayout';

const wrappers: VueWrapper[] = [];

/** 构造独立表头、表体与可选表尾的布局，尺寸均为布局像素。 */
const createRoot = (tableHeight: number, headerHeight: number, bodyHeight = tableHeight - headerHeight) => {
  const root = document.createElement('div');
  const header = document.createElement('div');
  const body = document.createElement('div');
  header.className = 'vxe-table--header-wrapper';
  body.className = 'vxe-table--body-wrapper';
  root.append(header, body);
  Object.defineProperty(root, 'offsetHeight', { configurable: true, value: tableHeight });
  Object.defineProperty(header, 'offsetHeight', { configurable: true, value: headerHeight });
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: bodyHeight });
  root.getBoundingClientRect = () => ({ top: 100, height: tableHeight }) as DOMRect;
  body.getBoundingClientRect = () => ({ top: 100 + headerHeight, height: bodyHeight }) as DOMRect;
  return root;
};

const setup = (root: HTMLElement, initialLoading = false) => {
  const loading = ref(initialLoading);
  let result!: ReturnType<typeof useLoadingLayout>;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useLoadingLayout(ref({ $el: root }), loading);
        return () => h('div');
      },
    })
  );
  wrappers.push(wrapper);
  return { wrapper, loading, result: () => result };
};

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('useLoadingLayout 加载提示定位', () => {
  it('加载时按表头高度设置居中偏移，表体过矮时启用紧凑布局', async () => {
    const root = createRoot(44 + 36, 44);
    const { loading, result } = setup(root);
    expect(result().loadingCompact.value).toBe(false);

    loading.value = true;
    await nextTick();
    await nextTick();
    expect(result().loadingStyleVars.value['--y-table-loading-offset']).toBe('44px');
    // 表体仅 36px（1 行），低于紧凑阈值
    expect(result().loadingCompact.value).toBe(true);
  });

  it('表体足够高时保持纵向布局', async () => {
    const root = createRoot(44 + 300, 44);
    const { result } = setup(root, true);
    await nextTick();
    await nextTick();
    expect(result().loadingStyleVars.value['--y-table-loading-offset']).toBe('44px');
    expect(result().loadingCompact.value).toBe(false);
  });

  it('汇总表尾不计入表体高度与居中基准', async () => {
    const { result } = setup(createRoot(124, 44, 36), true);
    await nextTick();
    await nextTick();
    expect(result().loadingStyleVars.value).toEqual({
      '--y-table-loading-offset': '44px',
      '--y-table-loading-body-height': '36px',
    });
    expect(result().loadingCompact.value).toBe(true);
  });

  it('极小表体降级为仅图标，并保留实际可用高度', async () => {
    const { result } = setup(createRoot(60, 44, 16), true);
    await nextTick();
    await nextTick();
    expect(result().loadingTiny.value).toBe(true);
    expect(result().loadingStyleVars.value['--y-table-loading-body-height']).toBe('16px');
  });

  it('缩放容器仍使用布局像素定位', async () => {
    const root = createRoot(80, 44, 36);
    root.getBoundingClientRect = () => ({ top: 100, height: 160 }) as DOMRect;
    const body = root.querySelector<HTMLElement>('.vxe-table--body-wrapper');
    if (!body) throw new Error('测试表体未创建');
    body.getBoundingClientRect = () => ({ top: 188, height: 72 }) as DOMRect;
    const { result } = setup(root, true);
    await nextTick();
    await nextTick();
    expect(result().loadingStyleVars.value['--y-table-loading-offset']).toBe('44px');
    expect(result().loadingStyleVars.value['--y-table-loading-body-height']).toBe('36px');
  });

  it('加载期间表体尺寸变化后重新测量并切换布局', async () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    const root = createRoot(80, 44, 36);
    const { result } = setup(root, true);
    await nextTick();
    await nextTick();
    const body = root.querySelector('.vxe-table--body-wrapper');
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 120 });
    resize?.([], {} as ResizeObserver);
    expect(result().loadingCompact.value).toBe(false);
    expect(result().loadingStyleVars.value['--y-table-loading-body-height']).toBe('120px');
  });

  it('加载结束后断开尺寸监听', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = disconnect;
      }
    );
    const { loading } = setup(createRoot(80, 44), true);
    await nextTick();
    await nextTick();
    loading.value = false;
    await nextTick();
    expect(disconnect).toHaveBeenCalled();
  });

  it('卸载后不再启动已经排队的尺寸监听', async () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = vi.fn();
      }
    );
    const { wrapper } = setup(createRoot(80, 44), true);
    wrapper.unmount();
    await nextTick();
    expect(observe).not.toHaveBeenCalled();
  });
});
