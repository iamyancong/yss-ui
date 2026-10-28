import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '../index.vue';
import FilePreviewModal from '../FilePreviewModal.vue';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import type { PreviewZoomController, RenderContext } from '../renderers/types';
import { pdfBuffer, textBuffer } from './helpers';

/** 实现了缩放的测试渲染器：记录收到的初始比例和 set 调用 */
const calls: { initial: Array<number | undefined>; external: boolean[]; set: number[] } = {
  initial: [],
  external: [],
  set: [],
};
const installZoomRenderer = () =>
  registerPreviewRenderer({
    types: ['txt'],
    create() {
      let scale = 1;
      const zoom: PreviewZoomController = {
        get: () => scale,
        set: z => {
          scale = z;
          calls.set.push(z);
        },
        fit: () => {
          scale = 0.8;
          return scale;
        },
      };
      return {
        async render(container: HTMLElement, _data: ArrayBuffer, ctx: RenderContext) {
          calls.initial.push(ctx.zoom);
          calls.external.push(!!ctx.externalZoomControl);
          if (ctx.zoom) scale = ctx.zoom;
          container.textContent = `zoomable ${ctx.fileName}`;
        },
        zoom,
      };
    },
  });

const ctrlKey = (target: Element, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));

describe('文件预览缩放', () => {
  beforeEach(() => {
    calls.initial = [];
    calls.external = [];
    calls.set = [];
    installZoomRenderer();
  });
  afterEach(() => {
    unregisterPreviewRenderer('txt');
    document.body.innerHTML = '';
  });

  it('v-model:zoom、快捷键、Ctrl + 滚轮；超出范围收敛', async () => {
    const wrapper = mount(FilePreview, {
      props: { source: textBuffer('a'), fileName: 'a.txt', zoom: 1.5 },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('zoomable a.txt'));
    await nextTick();
    const vm = wrapper.vm as unknown as InstanceType<typeof FilePreview>;
    expect(calls.initial).toEqual([1.5]);
    expect(vm.zoomState).toMatchObject({ available: true, value: 1.5, min: 0.5, max: 2, canFit: true });

    const root = wrapper.element;
    ctrlKey(root, '=');
    expect(vm.zoomState.value).toBe(1.6);
    ctrlKey(root, '-');
    ctrlKey(root, '-');
    expect(vm.zoomState.value).toBe(1.4);
    ctrlKey(root, '0');
    expect(vm.zoomState.value).toBe(1);

    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    // 测试环境的 WheelEvent 不认 ctrlKey 初始化参数
    Object.defineProperty(wheel, 'ctrlKey', { value: true });
    root.querySelector('.yss-file-preview__content')!.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(vm.zoomState.value).toBeGreaterThan(1);
    // 普通滚轮不缩放
    const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    root.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);

    vm.setZoom(5);
    expect(vm.zoomState.value).toBe(2);
    vm.setZoom(0.1);
    expect(vm.zoomState.value).toBe(0.5);
    vm.fitZoom('width');
    expect(vm.zoomState.value).toBe(0.8);

    const updates = wrapper.emitted('update:zoom')!.map(e => e[0]);
    expect(updates.slice(0, 4)).toEqual([1.5, 1.6, 1.5, 1.4]);
    expect(updates.at(-1)).toBe(0.8);
    expect(wrapper.emitted('zoom-change')!.at(-1)).toEqual([0.8, { fileType: 'txt' }]);

    // 外部修改 v-model
    await wrapper.setProps({ zoom: 1.25 });
    expect(vm.zoomState.value).toBe(1.25);
    expect(calls.set.at(-1)).toBe(1.25);
    wrapper.unmount();
  });

  it('每个文件单独记住比例，切换文件不串；zoomable=false / 不在列表里时不可缩放', async () => {
    const a = textBuffer('a');
    const b = textBuffer('b');
    const wrapper = mount(FilePreview, { props: { source: a, fileName: 'a.txt' }, attachTo: document.body });
    const vm = wrapper.vm as unknown as InstanceType<typeof FilePreview>;
    await vi.waitFor(() => expect(vm.zoomState.available).toBe(true));
    vm.setZoom(1.7);
    await wrapper.setProps({ source: b, fileName: 'b.txt' });
    await vi.waitFor(() => expect(document.body.textContent).toContain('zoomable b.txt'));
    await nextTick();
    expect(vm.zoomState.value).toBe(1);
    vm.setZoom(0.6);
    await wrapper.setProps({ source: a, fileName: 'a.txt' });
    await vi.waitFor(() => expect(document.body.textContent).toContain('zoomable a.txt'));
    await nextTick();
    expect(calls.initial.at(-1)).toBe(1.7);
    expect(vm.zoomState.value).toBe(1.7);

    await wrapper.setProps({ zoomable: ['xlsx'] });
    expect(vm.zoomState.available).toBe(false);
    ctrlKey(wrapper.element, '=');
    expect(vm.zoomState.value).toBe(1.7);
    wrapper.unmount();
  });

  it('zoomFit=width：没有记录的文件首次打开时适应宽度', async () => {
    const wrapper = mount(FilePreview, {
      props: { source: textBuffer('a'), fileName: 'a.txt', zoomFit: 'width' },
      attachTo: document.body,
    });
    const vm = wrapper.vm as unknown as InstanceType<typeof FilePreview>;
    await vi.waitFor(() => expect(vm.zoomState.available).toBe(true));
    await nextTick();
    expect(calls.initial).toEqual([undefined]);
    expect(vm.zoomState.value).toBe(0.8);
    wrapper.unmount();
  });

  it('弹窗头部：有缩放能力时显示 [ − ] [ 100% ▾ ] [ + ]，pdf 不显示；Ctrl 快捷键在弹窗任意位置可用', async () => {
    const wrapper = mount(FilePreviewModal, {
      props: {
        open: true,
        files: [
          { source: textBuffer('a'), fileName: 'a.txt' },
          { source: pdfBuffer(), fileName: 'b.pdf' },
        ],
      },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(document.querySelector('[data-tool="zoom-level"]')).not.toBeNull());
    expect(calls.external).toEqual([true]);
    expect(document.querySelector('[data-tool="zoom-level"]')!.textContent).toContain('100%');
    (document.querySelector('[data-tool="zoom-in"]') as HTMLButtonElement).click();
    await nextTick();
    expect(document.querySelector('[data-tool="zoom-level"]')!.textContent).toContain('110%');
    ctrlKey(document.body, '-');
    ctrlKey(document.body, '-');
    await nextTick();
    expect(document.querySelector('[data-tool="zoom-level"]')!.textContent).toContain('90%');
    expect(wrapper.emitted('update:zoom')!.map(e => e[0])).toEqual([1.1, 1, 0.9]);
    expect(wrapper.emitted('zoom-change')!.at(-1)![0]).toBe(0.9);

    // 下拉：预设比例、适应宽度、重置
    (document.querySelector('[data-tool="zoom-level"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('[data-zoom="2"]')).not.toBeNull());
    (document.querySelector('[data-zoom="2"]') as HTMLElement).click();
    await nextTick();
    expect(document.querySelector('[data-tool="zoom-level"]')!.textContent).toContain('200%');
    expect((document.querySelector('[data-tool="zoom-in"]') as HTMLButtonElement).disabled).toBe(true);

    await wrapper.setProps({ index: 1 });
    await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
    expect(document.querySelector('[data-tool="zoom-level"]')).toBeNull();
    wrapper.unmount();
  });
});
