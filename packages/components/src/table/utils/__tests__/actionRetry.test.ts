// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_RETRY_SIGNAL,
  GLOBAL_FILTER_KEY,
  _resetFilterStateForTest,
  ensureRetrySignalFilter,
} from '../actionRetry';

describe('actionRetry 全局未捕获异常过滤与重试机制', () => {
  beforeEach(() => {
    _resetFilterStateForTest();
  });

  afterEach(() => {
    _resetFilterStateForTest();
  });

  it('测试1：多次调用 ensureRetrySignalFilter 只在全局注册一次事件监听器', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    ensureRetrySignalFilter();
    ensureRetrySignalFilter();
    ensureRetrySignalFilter();

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  it('测试2：只阻止 ACTION_RETRY_SIGNAL，其他业务未捕获异常仍正常触发宿主监听器且不被 preventDefault', () => {
    let capturedHandler: ((event: any) => void) | null = null;
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'unhandledrejection') {
        capturedHandler = handler as any;
      }
    });

    ensureRetrySignalFilter();
    expect(capturedHandler).not.toBeNull();

    // 场景 A: 内部重试信号 -> 必须 preventDefault()
    const retryEvent = {
      reason: ACTION_RETRY_SIGNAL,
      preventDefault: vi.fn(),
    };
    capturedHandler!(retryEvent);
    expect(retryEvent.preventDefault).toHaveBeenCalledOnce();

    // 场景 B: 包含相同 name 的 Error 实例 -> 也被识别并 preventDefault()
    const retryByNameEvent = {
      reason: Object.assign(new Error('test-retry'), { name: 'YssActionRetry' }),
      preventDefault: vi.fn(),
    };
    capturedHandler!(retryByNameEvent);
    expect(retryByNameEvent.preventDefault).toHaveBeenCalledOnce();

    // 场景 C: 普通业务异常 -> 绝不 preventDefault()，保证上报监控 (Sentry 等)
    const normalBizErrorEvent = {
      reason: new Error('业务接口 500 错误'),
      preventDefault: vi.fn(),
    };
    capturedHandler!(normalBizErrorEvent);
    expect(normalBizErrorEvent.preventDefault).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });

  it('测试3：多实例/微前端重复加载时，通过全局 window 标志防止重复注册监听器', () => {
    // 模拟第一个微前端子应用已注册
    (window as any)[GLOBAL_FILTER_KEY] = true;

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    // 第二个微前端模块加载并尝试注册
    ensureRetrySignalFilter();

    expect(addEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });
});
