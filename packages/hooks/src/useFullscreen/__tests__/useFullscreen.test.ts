// @vitest-environment happy-dom

import { defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import screenfull from 'screenfull';
import { useFullscreen } from '../index';

const changeHandlers = new Set<() => void>();

vi.mock('screenfull', () => {
  return {
    default: {
      isEnabled: true,
      element: null as any,
      request: vi.fn((el: any) => {
        (screenfull as any).element = el;
        changeHandlers.forEach(h => h());
      }),
      exit: vi.fn(() => {
        (screenfull as any).element = null;
        changeHandlers.forEach(h => h());
      }),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'change') changeHandlers.add(handler);
      }),
      off: vi.fn((event: string, handler: () => void) => {
        if (event === 'change') changeHandlers.delete(handler);
      }),
    },
  };
});

describe('useFullscreen 行为契约测试', () => {
  beforeEach(() => {
    (screenfull as any).isEnabled = true;
    (screenfull as any).element = null;
    changeHandlers.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('浏览器全屏模式：进入全屏、退出全屏与切换状态', async () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();

    const wrapper = mount(
      defineComponent({
        setup() {
          const containerRef = ref<HTMLElement>();
          const fullscreen = useFullscreen(containerRef, { onEnter, onExit, escTip: false });
          return { containerRef, ...fullscreen };
        },
        template: '<div ref="containerRef" id="container">Content</div>',
      }),
      { attachTo: document.body }
    );

    expect(wrapper.vm.isFullscreen).toBe(false);

    // 进入全屏
    wrapper.vm.enterFullscreen();
    expect(screenfull.request).toHaveBeenCalledWith(wrapper.get('#container').element);
    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);

    // 退出全屏
    wrapper.vm.exitFullscreen();
    expect(screenfull.exit).toHaveBeenCalled();
    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);

    // 切换全屏 toggleFullscreen
    wrapper.vm.toggleFullscreen();
    expect(wrapper.vm.isFullscreen).toBe(true);
    wrapper.vm.toggleFullscreen();
    expect(wrapper.vm.isFullscreen).toBe(false);
  });

  it('页面全屏 (pageFullscreen) 模式：通过样式类与 fixed 布局模拟全屏', async () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();

    const wrapper = mount(
      defineComponent({
        setup() {
          const containerRef = ref<HTMLElement>();
          const fullscreen = useFullscreen(containerRef, {
            pageFullscreen: { className: 'custom-fullscreen-class', zIndex: 8888 },
            onEnter,
            onExit,
            escTip: true,
          });
          return { containerRef, ...fullscreen };
        },
        template: '<div ref="containerRef" id="page-container">Content</div>',
      }),
      { attachTo: document.body }
    );

    const containerEl = wrapper.get('#page-container').element as HTMLElement;

    // 进入页面全屏
    wrapper.vm.enterFullscreen();
    expect(containerEl.classList.contains('custom-fullscreen-class')).toBe(true);
    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(document.getElementById('yss-fullscreen-esc-tip')).not.toBeNull();

    // 按 Esc 键触发退出
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(containerEl.classList.contains('custom-fullscreen-class')).toBe(false);
    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(document.getElementById('yss-fullscreen-esc-tip')).toBeNull();
  });

  it('不支持浏览器原生全屏时的降级与状态响应', () => {
    (screenfull as any).isEnabled = false;

    const wrapper = mount(
      defineComponent({
        setup() {
          const containerRef = ref<HTMLElement>();
          const fullscreen = useFullscreen(containerRef);
          return { containerRef, ...fullscreen };
        },
        template: '<div ref="containerRef">Fallback</div>',
      })
    );

    expect(wrapper.vm.isEnabled).toBe(false);
    wrapper.vm.enterFullscreen();
    expect(wrapper.vm.isFullscreen).toBe(false);
  });

  it('组件卸载时正确移除事件监听器', () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const containerRef = ref<HTMLElement>();
          const fullscreen = useFullscreen(containerRef, { pageFullscreen: true });
          return { containerRef, ...fullscreen };
        },
        template: '<div ref="containerRef">Unmount Test</div>',
      }),
      { attachTo: document.body }
    );

    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    wrapper.unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
