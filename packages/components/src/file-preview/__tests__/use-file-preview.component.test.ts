import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCustomRenderers, registerPreviewRenderer } from '../renderers/registry';
import type { RenderContext } from '../renderers/types';
import { useFilePreview } from '../useFilePreview';
import type { UseFilePreviewReturn } from '../types';
import { textBuffer } from './helpers';

function mountHost() {
  let api!: UseFilePreviewReturn;
  const Host = defineComponent({
    setup() {
      api = useFilePreview();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, api: () => api };
}

describe('useFilePreview', () => {
  afterEach(() => {
    vi.useRealTimers();
    clearCustomRenderers();
    document.body.innerHTML = '';
  });

  it('open 打开弹窗，close 后在动画结束时卸载并复位状态', async () => {
    vi.useFakeTimers();
    const { wrapper, api } = mountHost();
    api().open(textBuffer('hello'), { fileName: 'hello.txt' });
    expect(api().visible.value).toBe(true);
    expect(api().fileList.value[0]?.fileName).toBe('hello.txt');
    await vi.waitFor(() => expect(document.body.textContent).toContain('hello.txt'));

    api().close();
    expect(api().visible.value).toBe(false);
    vi.advanceTimersByTime(350);
    expect(api().fileList.value).toEqual([]);
    expect(document.querySelector('.yss-file-preview-modal')).toBeNull();
    wrapper.unmount();
  });

  it('关闭动画期间再次打开，不会被上一次的卸载定时器关掉', async () => {
    vi.useFakeTimers();
    const { wrapper, api } = mountHost();
    api().open(textBuffer('a'), { fileName: 'a.txt' });
    api().close();
    vi.advanceTimersByTime(100);
    api().open(textBuffer('b'), { fileName: 'b.txt' });
    vi.advanceTimersByTime(1000);
    expect(api().visible.value).toBe(true);
    expect(api().fileList.value[0]?.fileName).toBe('b.txt');
    await vi.waitFor(() => expect(document.body.textContent).toContain('b.txt'));
    wrapper.unmount();
  });

  it('openList 收敛起始索引，组件卸载时一并销毁弹窗', async () => {
    const { wrapper, api } = mountHost();
    api().openList([textBuffer('1'), { source: textBuffer('2'), fileName: 'two.txt' }], 5);
    expect(api().currentIndex.value).toBe(1);
    await vi.waitFor(() => expect(document.body.textContent).toContain('two.txt'));
    wrapper.unmount();
    expect(document.querySelector('.yss-file-preview-modal .ant-modal')).toBeNull();
  });

  it('空列表不打开弹窗', () => {
    const { wrapper, api } = mountHost();
    api().openList([]);
    expect(api().visible.value).toBe(false);
    wrapper.unmount();
  });

  it('渲染时继承调用方应用的 appContext（同一个 app 与全局配置）', async () => {
    let received: RenderContext['appContext'] = null;
    registerPreviewRenderer({
      types: ['probe'],
      create: () => ({
        render: async (_el, _data, ctx) => {
          received = ctx.appContext;
        },
      }),
    });
    const { wrapper, api } = mountHost();
    api().open(textBuffer('x'), { fileName: 'x.probe', fileType: 'probe' });
    await vi.waitFor(() => expect(received).not.toBeNull());
    const callerContext = wrapper.vm.$.appContext;
    expect(received!.app).toBe(callerContext.app);
    expect(received!.config).toBe(callerContext.config);
    expect(received!.components).toBe(callerContext.components);
    wrapper.unmount();
  });
});
