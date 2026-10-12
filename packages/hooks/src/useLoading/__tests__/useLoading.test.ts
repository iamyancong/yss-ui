// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { useLoading } from '../index';

describe('useLoading 行为契约测试', () => {
  it('默认状态为 false，支持初始化指定状态', () => {
    const { loading: defaultLoading } = useLoading();
    expect(defaultLoading.value).toBe(false);

    const { loading: initLoading } = useLoading(true);
    expect(initLoading.value).toBe(true);
  });

  it('setLoading 与 toggleLoading 手动控制状态', () => {
    const { loading, setLoading, toggleLoading } = useLoading();

    setLoading(true);
    expect(loading.value).toBe(true);

    setLoading(false);
    expect(loading.value).toBe(false);

    toggleLoading();
    expect(loading.value).toBe(true);

    toggleLoading();
    expect(loading.value).toBe(false);
  });

  it('withLoading 包装成功异步操作：自动置 true并在完成后置 false，触发 onSuccess 和 onFinally', async () => {
    const { loading, withLoading } = useLoading();
    const onSuccess = vi.fn();
    const onFinally = vi.fn();

    expect(loading.value).toBe(false);

    const promise = withLoading(async () => {
      expect(loading.value).toBe(true);
      return 'data-result';
    }, { onSuccess, onFinally });

    expect(loading.value).toBe(true);
    const result = await promise;

    expect(result).toBe('data-result');
    expect(loading.value).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith('data-result');
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('withLoading 异常复位：默认吞掉异常防止白屏，复位 loading，触发 onError 与 onFinally', async () => {
    const { loading, withLoading } = useLoading();
    const onError = vi.fn();
    const onFinally = vi.fn();
    const error = new Error('接口超时');

    const result = await withLoading(async () => {
      throw error;
    }, { onError, onFinally });

    expect(result).toBeUndefined();
    expect(loading.value).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('withLoading 配置 rethrowError=true 时重新抛出错误', async () => {
    const { loading, withLoading } = useLoading();
    const error = new Error('致命错误');

    await expect(
      withLoading(async () => {
        throw error;
      }, { rethrowError: true })
    ).rejects.toThrow('致命错误');

    expect(loading.value).toBe(false);
  });

  it('withLoading 配置 keepLoadingOnError=true 时发生错误保持 loading 状态', async () => {
    const { loading, withLoading, setLoading } = useLoading();

    await withLoading(async () => {
      throw new Error('保持 loading 错误');
    }, { keepLoadingOnError: true });

    expect(loading.value).toBe(true);

    // 手动重置
    setLoading(false);
    expect(loading.value).toBe(false);
  });

  it('并发请求计数控制：多个并发异步操作，直到所有操作完成才将 loading 置为 false', async () => {
    const { loading, withLoading } = useLoading();

    let resolveP1: () => void = () => {};
    let resolveP2: () => void = () => {};

    const p1 = withLoading(() => new Promise<void>(r => { resolveP1 = r; }));
    const p2 = withLoading(() => new Promise<void>(r => { resolveP2 = r; }));

    expect(loading.value).toBe(true);

    // 完成第一个操作，loading 仍应为 true（因为 p2 还在执行）
    resolveP1();
    await Promise.resolve();
    expect(loading.value).toBe(true);

    // 完成第二个操作，loading 转为 false
    resolveP2();
    await Promise.all([p1, p2]);
    expect(loading.value).toBe(false);
  });
});
