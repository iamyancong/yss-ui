/**
 * 监听元素尺寸变化（防抖）。只有宽或高真正变化时才回调，首次 observe 的回调会被忽略。
 * 返回停止监听的函数；环境不支持 ResizeObserver 时什么也不做。
 */
export function observeResize(target: HTMLElement, callback: () => void, delay = 100): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let width = target.clientWidth;
  let height = target.clientHeight;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const observer = new ResizeObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const nextWidth = target.clientWidth;
      const nextHeight = target.clientHeight;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      callback();
    }, delay);
  });
  observer.observe(target);

  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    observer.disconnect();
  };
}
