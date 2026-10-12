import { ref } from 'vue';
import type { UseLoadingReturn, WithLoadingOptions } from './constant';

/**
 * @description 加载状态管理 Hook
 * @param initialValue 初始加载状态，默认为 false
 * @returns {UseLoadingReturn} 包含 loading 状态和控制方法
 * @example
 * ```ts
 * const { loading, setLoading, withLoading } = useLoading();
 *
 * // 手动控制
 * setLoading(true);
 *
 * // 自动控制
 * await withLoading(async () => {
 *   await fetchData();
 * });
 * ```
 */
export function useLoading(initialValue = false): UseLoadingReturn {
  const loading = ref(initialValue);
  // 用于追踪活跃的异步操作数量，防止并发问题
  let activeCount = 0;

  /**
   * 设置加载状态
   * @param value 要设置的状态值
   */
  const setLoading = (value: boolean): void => {
    loading.value = value;
    // 手动设置时重置计数器
    if (!value) {
      activeCount = 0;
    }
  };

  /**
   * 切换加载状态
   */
  const toggleLoading = (): void => {
    loading.value = !loading.value;
    // 切换时重置计数器
    if (!loading.value) {
      activeCount = 0;
    }
  };

  /**
   * 包装异步函数，自动控制加载状态
   * @param fn 要执行的异步函数
   * @param options 配置选项
   * @returns 异步函数的返回值
   */
  const withLoading = async <T>(fn: () => Promise<T>, options: WithLoadingOptions<T> = {}): Promise<T | undefined> => {
    const { keepLoadingOnError = false, onSuccess, onError, onFinally, rethrowError = false } = options;

    activeCount++;
    loading.value = true;

    let hasError = false;
    try {
      const result = await fn();

      // 调用成功回调
      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      hasError = true;
      // 调用错误回调
      if (onError && error instanceof Error) {
        onError(error);
      }

      // 只有在明确配置 rethrowError=true 时才重新抛出错误
      // 默认情况下吞掉错误，防止 Unhandled Promise Rejection 导致白屏
      if (rethrowError) {
        throw error;
      }

      // 如果不重新抛出错误，返回 undefined
      return undefined;
    } finally {
      if (!hasError || !keepLoadingOnError) {
        activeCount--;
        if (activeCount <= 0) {
          activeCount = 0;
          loading.value = false;
        }
      }

      // 调用完成回调
      if (onFinally) {
        onFinally();
      }
    }
  };

  return {
    loading,
    setLoading,
    withLoading,
    toggleLoading,
  };
}
