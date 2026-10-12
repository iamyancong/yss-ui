/** 内部重试信号，供 Ant Design Vue Popconfirm 识别操作失败并重置加载状态与点击锁。 */
export const ACTION_RETRY_SIGNAL = Object.freeze(
  Object.assign(new Error('yss-action-retry'), { name: 'YssActionRetry' })
);

export const GLOBAL_FILTER_KEY = '__YSS_ACTION_RETRY_FILTER_REGISTERED__';

let isFilterRegistered = false;

/**
 * 懒注册全局 unhandledrejection 过滤器。
 * 仅在首次进入二次确认的 needLoading 逻辑时按需注册，避免模块导入副作用。
 * 仅过滤 ACTION_RETRY_SIGNAL，不影响应用中其他未捕获异常。
 */
export const ensureRetrySignalFilter = () => {
  if (isFilterRegistered) return;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    if ((window as any)[GLOBAL_FILTER_KEY]) {
      isFilterRegistered = true;
      return;
    }
    window.addEventListener('unhandledrejection', (event: any) => {
      if (
        event.reason === ACTION_RETRY_SIGNAL ||
        (event.reason instanceof Error && event.reason.name === 'YssActionRetry')
      ) {
        event.preventDefault();
      }
    });
    (window as any)[GLOBAL_FILTER_KEY] = true;
    isFilterRegistered = true;
  }
};

/** 仅供单元测试重置单例状态。 */
export const _resetFilterStateForTest = () => {
  isFilterRegistered = false;
  if (typeof window !== 'undefined') {
    delete (window as any)[GLOBAL_FILTER_KEY];
  }
};
