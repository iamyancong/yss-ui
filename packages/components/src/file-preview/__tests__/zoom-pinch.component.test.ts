import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '../index.vue';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import type { PreviewZoomController } from '../renderers/types';
import { textBuffer } from './helpers';

describe('外壳：捏合实时预览、结束时提交', () => {
  afterEach(() => {
    unregisterPreviewRenderer('txt');
    document.body.innerHTML = '';
  });

  it('捏合中只调用 preview、实时更新百分比，不触发 update:zoom；停下后 set 一次（带锚点）并通知', async () => {
    const log: { preview: number[]; set: Array<[number, unknown]> } = { preview: [], set: [] };
    registerPreviewRenderer({
      types: ['txt'],
      create() {
        let scale = 1;
        const zoom: PreviewZoomController = {
          get: () => scale,
          set: (z, o) => {
            scale = z;
            log.set.push([z, o?.anchor]);
          },
          preview: z => log.preview.push(z),
        };
        return {
          async render(container: HTMLElement) {
            container.textContent = 'zoomable';
          },
          zoom,
        };
      },
    });
    const wrapper = mount(FilePreview, {
      props: { source: textBuffer('a'), fileName: 'a.txt' },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('zoomable'));
    await nextTick();
    const vm = wrapper.vm as unknown as { zoomState: { value: number } };
    const content = wrapper.element.querySelector('.yss-file-preview__content')!;
    const pinch = (deltaY: number) => {
      const e = new WheelEvent('wheel', { deltaY, clientX: 120, clientY: 80, bubbles: true, cancelable: true });
      // 测试环境的 WheelEvent 不认 ctrlKey / clientX 初始化参数
      Object.defineProperty(e, 'ctrlKey', { value: true });
      Object.defineProperty(e, 'clientX', { value: 120 });
      Object.defineProperty(e, 'clientY', { value: 80 });
      content.dispatchEvent(e);
      return e;
    };
    const emittedBefore = wrapper.emitted('update:zoom')?.length ?? 0;
    for (let i = 0; i < 10; i++) expect(pinch(-2.5).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(log.preview.length).toBeGreaterThan(0));
    expect(log.set).toHaveLength(0);
    expect(vm.zoomState.value).toBeCloseTo(Math.exp(0.25), 3);
    expect(wrapper.emitted('update:zoom')?.length ?? 0).toBe(emittedBefore);
    await vi.waitFor(() => expect(log.set).toHaveLength(1), { timeout: 1000 });
    expect(log.set[0]![0]).toBeCloseTo(Math.exp(0.25), 3);
    expect(log.set[0]![1]).toEqual({ x: 120, y: 80 });
    expect(wrapper.emitted('update:zoom')!.at(-1)![0]).toBeCloseTo(Math.exp(0.25), 3);
    // 鼠标滚轮一格仍按步长
    pinch(-100);
    expect(vm.zoomState.value).toBe(1.3);
    wrapper.unmount();
  });
});
