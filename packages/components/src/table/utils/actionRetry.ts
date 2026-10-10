/** 内部重试信号，供 Ant Design Vue Popconfirm 识别操作失败并重置加载状态与点击锁。 */
export const ACTION_RETRY_SIGNAL = Object.freeze(
  Object.assign(new Error('yss-action-retry'), { name: 'YssActionRetry' })
);

let isFilterRegistered = false;

/**
 * 懒注册全局 unhandledrejection 过滤器。
 * 仅在首次进入二次确认的 needLoading 逻辑时按需注册，避免模块导入副作用。
 * 仅过滤 ACTION_RETRY_SIGNAL，不影响应用中其他未捕获异常。
 */
export const ensureRetrySignalFilter = () => {
  if (isFilterRegistered) return;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', event => {
      if (event.reason === ACTION_RETRY_SIGNAL) {
        event.preventDefault();
      }
    });
    isFilterRegistered = true;
  }
};
