import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '../index.vue';
import FilePreviewModal from '../FilePreviewModal.vue';
import { RESIZE_DEBOUNCE } from '../constant';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import { observeResize } from '../utils/resize';
import { textBuffer } from './helpers';

/** 可手动触发的 ResizeObserver */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  targets: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** jsdom 没有布局，用 defineProperty 模拟元素尺寸 */
const setSize = (el: Element, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
};

const observerOf = (el: Element) => MockResizeObserver.instances.find(o => o.targets.includes(el));

describe('file-preview 尺寸变化', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('observeResize：防抖，只在尺寸真正变化时回调，停止后断开', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    setSize(el, 100, 100);
    const callback = vi.fn();
    const stop = observeResize(el, callback, 50);
    const observer = observerOf(el)!;

    observer.trigger(); // observe 时的首次回调，尺寸没变
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();

    setSize(el, 200, 100);
    observer.trigger();
    observer.trigger();
    vi.advanceTimersByTime(49);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    setSize(el, 200, 300);
    observer.trigger();
    stop();
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(observer.disconnected).toBe(true);
  });

  it('observeResize：不支持 ResizeObserver 时安全退化', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const stop = observeResize(document.createElement('div'), vi.fn());
    expect(() => stop()).not.toThrow();
  });

  it('容器尺寸变化后调用渲染器 resize，卸载时断开 ResizeObserver', async () => {
    const resize = vi.fn();
    registerPreviewRenderer({
      types: ['sized'],
      create: () => ({
        async render(container) {
          container.textContent = 'SIZED';
        },
        resize,
      }),
    });
    try {
      const wrapper = mount(FilePreview, { props: { source: textBuffer('x'), fileName: 'a.sized' } });
      await vi.waitFor(() => expect(wrapper.emitted('loaded')).toBeTruthy());
      const content = wrapper.find('.yss-file-preview__content').element;
      const observer = observerOf(content);
      expect(observer).toBeTruthy();

      vi.useFakeTimers();
      setSize(content, 800, 600);
      observer!.trigger();
      vi.advanceTimersByTime(RESIZE_DEBOUNCE);
      expect(resize).toHaveBeenCalledTimes(1);

      // 渲染器 resize 抛错不影响组件
      resize.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      setSize(content, 1000, 600);
      observer!.trigger();
      expect(() => vi.advanceTimersByTime(RESIZE_DEBOUNCE)).not.toThrow();
      expect(resize).toHaveBeenCalledTimes(2);
      vi.useRealTimers();

      wrapper.unmount();
      expect(observer!.disconnected).toBe(true);
    } finally {
      unregisterPreviewRenderer('sized');
    }
  });

  it('渲染完成前的尺寸变化不调用 resize', async () => {
    const resize = vi.fn();
    let release: () => void = () => {};
    registerPreviewRenderer({
      types: ['pending'],
      create: () => ({
        render: () => new Promise<void>(resolve => (release = resolve)),
        resize,
      }),
    });
    try {
      const wrapper = mount(FilePreview, { props: { source: textBuffer('x'), fileName: 'a.pending' } });
      await vi.waitFor(() => expect(observerOf(wrapper.find('.yss-file-preview__content').element)).toBeTruthy());
      const content = wrapper.find('.yss-file-preview__content').element;
      setSize(content, 640, 480);
      observerOf(content)!.trigger();
      await new Promise(r => setTimeout(r, RESIZE_DEBOUNCE + 20));
      expect(resize).not.toHaveBeenCalled();
      release();
      wrapper.unmount();
    } finally {
      unregisterPreviewRenderer('pending');
    }
  });
});

describe('YFilePreviewModal 全屏', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const files = [{ source: textBuffer('hello'), fileName: 'a.txt' }];
  const wrap = () => document.querySelector<HTMLElement>('.yss-file-preview-modal')!;
  const pressEsc = (target: EventTarget) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

  it('全屏时外层带 --fullscreen，标题栏固定、内容区占满剩余高度', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    document.querySelector<HTMLButtonElement>('button[aria-label="全屏"]')!.click();
    await nextTick();
    expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(true);
    // 结构：header / body 是 content 的直接子节点，预览组件是 body 内唯一的填充节点
    const content = wrap().querySelector('.yss-file-preview-modal__content')!;
    const children = [...content.children].map(el => el.className);
    expect(children.some(c => c.includes('yss-file-preview-modal__titlebar'))).toBe(true);
    expect(children.some(c => c.includes('yss-file-preview-modal__main'))).toBe(true);
    expect(content.querySelector('.yss-file-preview-modal__main > .yss-file-preview-modal__body > .yss-file-preview')).not.toBeNull();
    wrapper.unmount();
  });

  it('样式：content 为 flex 列、header 不收缩、body flex:1 + min-height:0，全屏占满视口', () => {
    const less = readFileSync(resolve(__dirname, '../style.less'), 'utf8');
    const modal = less.slice(less.indexOf('.yss-file-preview-modal {'), less.indexOf('// CSV 表格视图'));
    const block = (selector: string, from = modal) => {
      const start = from.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      return from.slice(start, from.indexOf('}', start));
    };
    const content = block('.yss-file-preview-modal__content');
    expect(content).toContain('display: flex');
    expect(content).toContain('flex-direction: column');
    expect(block('.yss-file-preview-modal__titlebar')).toContain('flex-shrink: 0');
    const body = block('.yss-file-preview-modal__main');
    expect(body).toContain('flex: 1');
    expect(body).toContain('min-height: 0');
    const fullscreen = modal.slice(modal.indexOf('&--fullscreen {'));
    const fsContent = block('.yss-file-preview-modal__content', fullscreen);
    expect(fsContent).toContain('width: 100%');
    expect(fsContent).toContain('height: 100vh');
  });

  it('回归：全屏不沿用居中 inline-block 排版，出现滚动条时弹窗也不会被挤出视口（只剩遮罩）', async () => {
    const less = readFileSync(resolve(__dirname, '../style.less'), 'utf8');
    const modal = less.slice(less.indexOf('.yss-file-preview-modal {'), less.indexOf('// CSV 表格视图'));
    const fullscreen = modal.slice(modal.indexOf('&--fullscreen {'));
    const head = fullscreen.slice(0, fullscreen.indexOf('.yss-file-preview-modal__dialog'));
    // 外层不滚动、去掉居中用的 ::before（否则 100% 宽的 inline-block 会换到它下面）
    expect(head).toContain('overflow: hidden');
    expect(head).toMatch(/&::before \{\s*display: none;/);
    const dialog = fullscreen.slice(fullscreen.indexOf('.yss-file-preview-modal__dialog {'));
    const dialogBlock = dialog.slice(0, dialog.indexOf('}'));
    expect(dialogBlock).toContain('position: fixed');
    expect(dialogBlock).toContain('inset: 0');
    expect(dialogBlock).not.toContain('100vw');
    // 100vw 包含滚动条宽度，全屏宽度必须用 100%
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    document.querySelector<HTMLButtonElement>('button[aria-label="全屏"]')!.click();
    await nextTick();
    expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(true);
    const dialogEl = wrap().querySelector<HTMLElement>('.yss-file-preview-modal__dialog')!;
    expect(dialogEl.style.width).toBe('100%');
    // 视口反复变大 / 变小、退出全屏后再缩放：状态与宽度保持一致
    for (const [w, h] of [[1000, 700], [1600, 1000], [900, 600], [1400, 900]]) {
      Object.assign(window, { innerWidth: w, innerHeight: h });
      window.dispatchEvent(new Event('resize'));
      await nextTick();
      expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(true);
      expect(dialogEl.style.width).toBe('100%');
    }
    document.querySelector<HTMLButtonElement>('button[aria-label="退出全屏"]')!.click();
    await nextTick();
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(false);
    expect(wrap().querySelector<HTMLElement>('.yss-file-preview-modal__dialog')!.style.width).not.toBe('100%');
    wrapper.unmount();
  });

  it('全屏时 Esc 先退出全屏（即使事件已被页面 preventDefault），再按一次才关闭', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    document.querySelector<HTMLButtonElement>('button[aria-label="全屏"]')!.click();
    await nextTick();

    const preventer = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener('keydown', preventer);
    try {
      pressEsc(wrap().querySelector('button[aria-pressed]')!);
      await nextTick();
      expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(false);
      expect(wrapper.emitted('update:open')).toBeUndefined();

      pressEsc(wrap().querySelector('button[aria-pressed]')!);
      await nextTick();
      expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    } finally {
      document.removeEventListener('keydown', preventer);
    }
    wrapper.unmount();
  });

  it('keyboard=false 时 Esc 既不退出全屏也不关闭', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, keyboard: false }, attachTo: document.body });
    await nextTick();
    pressEsc(wrap().querySelector('button[aria-pressed]')!);
    await nextTick();
    expect(wrapper.emitted('update:open')).toBeUndefined();
    document.querySelector<HTMLButtonElement>('button[aria-label="全屏"]')!.click();
    await nextTick();
    pressEsc(wrap().querySelector('button[aria-pressed]')!);
    await nextTick();
    expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(true);
    expect(wrapper.emitted('update:open')).toBeUndefined();
    wrapper.unmount();
  });
});
