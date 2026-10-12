// @vitest-environment happy-dom

import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePollingTask } from '../index';

describe('usePollingTask 行为契约测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('启动/停止、固定间隔调度', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, immediate: false });
        },
        template: '<div />',
      })
    );

    expect(wrapper.vm.isActive).toBe(false);
    expect(task).not.toHaveBeenCalled();

    // 启动轮询
    await wrapper.vm.start();
    expect(wrapper.vm.isActive).toBe(true);
    expect(task).not.toHaveBeenCalled();

    // 推进 1000ms
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    // 再推进 1000ms
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);

    // 停止轮询
    wrapper.vm.stop();
    expect(wrapper.vm.isActive).toBe(false);
    expect(wrapper.vm.isRunning).toBe(false);

    // 停止后再推进不应触发
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('immediate=true 立即执行首次任务', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, immediate: true });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('请求进行中不重叠：未完成时不提前触发下一 tick', async () => {
    let resolveTask: () => void = () => {};
    const task = vi.fn().mockImplementation(() => {
      return new Promise<void>(resolve => {
        resolveTask = resolve;
      });
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, immediate: true });
        },
        template: '<div />',
      })
    );

    const startPromise = wrapper.vm.start();
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.isRunning).toBe(true);

    // 时间推进 2000ms，任务未 resolve 时绝不重叠发起第二次
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    // 慢请求终于 resolve
    resolveTask();
    await startPromise;
    await flushPromises();
    expect(wrapper.vm.isRunning).toBe(false);

    // 完成后再过 1000ms 触发下一次
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('错误处理策略：continueOnError=true 报错后继续轮询', async () => {
    const onError = vi.fn();
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockResolvedValueOnce(undefined);

    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, {
            interval: 1000,
            continueOnError: true,
            onError,
            immediate: true,
          });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    await flushPromises();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(wrapper.vm.isActive).toBe(true);

    // 继续下一次
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('错误处理策略：continueOnError=false 报错后自动停止轮询', async () => {
    const onError = vi.fn();
    const task = vi.fn().mockRejectedValue(new Error('fatal-error'));

    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, {
            interval: 1000,
            continueOnError: false,
            onError,
            immediate: true,
          });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    await flushPromises();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.isActive).toBe(false);

    vi.advanceTimersByTime(3000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runNow 手动立即刷新，且重置后续定时器', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, immediate: false });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(task).not.toHaveBeenCalled();

    // 在第 400ms 手动刷新
    await wrapper.vm.runNow();
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    // 后续在 1000ms 后触发下一次（即从刷新完成点重新计时）
    vi.advanceTimersByTime(600);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('动态响应式 interval 与停止行为', async () => {
    const intervalRef = ref(1000);
    const task = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: intervalRef, immediate: false });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    expect(wrapper.vm.currentInterval).toBe(1000);

    // 动态改为 500ms
    intervalRef.value = 500;
    expect(wrapper.vm.currentInterval).toBe(500);

    vi.advanceTimersByTime(500);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);

    // 设置为 0 时自动 stop
    intervalRef.value = 0;
    expect(wrapper.vm.isActive).toBe(false);
  });

  it('组件卸载时自动停止轮询并中断请求', async () => {
    let aborted = false;
    const task = vi.fn().mockImplementation(({ signal }) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise(() => {});
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, immediate: true, autoStart: true });
        },
        template: '<div />',
      })
    );

    expect(task).toHaveBeenCalledTimes(1);

    // 卸载组件
    wrapper.unmount();
    expect(aborted).toBe(true);

    vi.advanceTimersByTime(3000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('页面可见性监听与恢复机制', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    const task = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(
      defineComponent({
        setup() {
          return usePollingTask(task, { interval: 1000, pauseWhenHidden: true });
        },
        template: '<div />',
      })
    );

    await wrapper.vm.start();
    expect(wrapper.vm.isActive).toBe(true);

    // 页面切后台
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wrapper.vm.isActive).toBe(false);

    // 页面切回前台，自动恢复
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wrapper.vm.isActive).toBe(true);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
