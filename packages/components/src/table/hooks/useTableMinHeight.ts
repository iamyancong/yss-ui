import { nextTick, onBeforeUnmount, onUpdated, ref, watch, type Ref } from 'vue';

/**
 * 为受限高度的表格提供默认下限：完整表头、至少一行、汇总表尾和横向滚动条。
 * 不放大常规自适应表格；调用方显式设置 minHeight 时由调用方决定布局。
 * @param tableRef VXE 实例引用
 * @param enabled 是否需要默认最小高度保护
 * @param rowHeight 配置的最小数据行高
 * @returns 动态最小表格高度
 */
export function useTableMinHeight(tableRef: Ref<unknown>, enabled: () => boolean, rowHeight: () => number) {
  const minimumHeight = ref<number>();
  let observer: ResizeObserver | undefined;
  let observed: HTMLElement[] = [];
  let disposed = false;

  const stop = () => {
    observer?.disconnect();
    observer = undefined;
    observed = [];
  };

  const sync = () => {
    if (disposed) return;
    if (!enabled()) {
      minimumHeight.value = undefined;
      stop();
      return;
    }
    const instance = tableRef.value as { $el?: unknown } | undefined;
    const root = instance?.$el;
    if (typeof HTMLElement === 'undefined' || !(root instanceof HTMLElement)) return;
    const header = root.querySelector<HTMLElement>('.vxe-table--header-wrapper');
    const footer = root.querySelector<HTMLElement>('.vxe-table--footer-wrapper');
    const row = root.querySelector<HTMLElement>('.vxe-table--body-wrapper .vxe-body--row');
    const empty = root.querySelector<HTMLElement>('.vxe-table--empty-block');
    const scrollbar = root.querySelector<HTMLElement>('.vxe-table--scroll-x-virtual');
    const configuredHeight = rowHeight();
    const fallback = Number.isFinite(configuredHeight) && configuredHeight > 0 ? configuredHeight : 36;
    const contentHeight = Math.max(fallback, row?.offsetHeight ?? 0, row ? 0 : (empty?.offsetHeight ?? 0));
    minimumHeight.value = Math.ceil(
      (header?.offsetHeight ?? 0) + contentHeight + (footer?.offsetHeight ?? 0) + (scrollbar?.offsetHeight ?? 0)
    );
    if (typeof ResizeObserver === 'undefined') return;
    const elements = [root, header, footer, row, empty, scrollbar].filter(
      (element): element is HTMLElement => element instanceof HTMLElement
    );
    observer ??= new ResizeObserver(sync);
    if (elements.length === observed.length && elements.every((element, index) => element === observed[index])) return;
    observer.disconnect();
    elements.forEach(element => observer?.observe(element));
    observed = elements;
  };

  watch(
    [tableRef, enabled, rowHeight],
    () => {
      void nextTick(sync);
    },
    { immediate: true, flush: 'post' }
  );
  // VXE 4.19 不监听 minHeight 的变化，测量下限更新后须主动同步内部滚动布局。
  watch(
    minimumHeight,
    () => {
      void nextTick(() => {
        if (disposed) return;
        const instance = tableRef.value as { recalculate?: (full?: boolean) => unknown } | undefined;
        instance?.recalculate?.(true);
      });
    },
    { flush: 'post' }
  );
  onUpdated(sync);
  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return minimumHeight;
}
