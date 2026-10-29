import { computed, nextTick, onBeforeUnmount, onUpdated, ref, watch, type Ref } from 'vue';

/** 表体可用高度低于该值时，加载提示切换为「图标 + 文案」单行紧凑布局。 */
export const LOADING_COMPACT_THRESHOLD = 64;

/** 表体低于一行提示所需高度时，只保留可缩小的加载图标。 */
const LOADING_TINY_THRESHOLD = 24;

/**
 * 加载中布局修正：
 * vxe 的 loading 遮罩覆盖整个表格（含表头），提示内容按整表高度垂直居中。表体较矮（如只有 1 行）时，
 * 提示会浮到表头上。这里测量真实表体，排除表头、汇总表尾和滚动条，遮罩本身仍覆盖整表以阻止交互；
 * 表体较矮时改为单行，极矮时仅显示图标，并将提示限制在表体范围内。
 *
 * @param tableRef vxe-table 组件实例引用
 * @param loading 当前是否加载中
 * @returns 表体位置样式变量、紧凑布局与极小高度标记
 */
export function useLoadingLayout(tableRef: Ref<unknown>, loading: Ref<boolean>) {
  const bodyTop = ref(0);
  const bodyHeight = ref(0);
  const loadingCompact = computed(() => loading.value && bodyHeight.value < LOADING_COMPACT_THRESHOLD);
  const loadingTiny = computed(() => loading.value && bodyHeight.value < LOADING_TINY_THRESHOLD);

  let observer: ResizeObserver | null = null;
  let observedElements: HTMLElement[] = [];
  let generation = 0;
  let disposed = false;

  const getRoot = (): HTMLElement | null => {
    // VXE 的公开实例类型只声明方法，DOM 入口在 Vue 实例运行时提供。
    const instance = tableRef.value as { $el?: unknown } | null | undefined;
    const el = instance?.$el;
    return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement ? el : null;
  };

  const measure = () => {
    const root = getRoot();
    if (!root) return;
    const header = root.querySelector<HTMLElement>('.vxe-table--header-wrapper');
    const body = root.querySelector<HTMLElement>('.vxe-table--body-wrapper');
    const rootRect = root.getBoundingClientRect();
    // 使用布局像素，避免业务容器 transform:scale 后混用视口坐标与 CSS 尺寸。
    const scale = rootRect.height > 0 ? root.offsetHeight / rootRect.height : 1;
    const top =
      body && rootRect.height > 0
        ? (body.getBoundingClientRect().top - rootRect.top) * scale
        : (header?.offsetHeight ?? 0);
    bodyTop.value = Math.max(0, top);
    bodyHeight.value = Math.max(0, body?.clientHeight ?? 0);
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
    observedElements = [];
  };

  /** 表头、表体被重新创建后更新观察目标。 */
  const syncLayout = () => {
    if (!loading.value || disposed) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const root = getRoot();
    if (!root) return;
    const elements = [
      root,
      root.querySelector('.vxe-table--header-wrapper'),
      root.querySelector('.vxe-table--body-wrapper'),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    observer ??= new ResizeObserver(measure);
    if (elements.length === observedElements.length && elements.every((element, i) => element === observedElements[i]))
      return;
    observer.disconnect();
    elements.forEach(element => observer?.observe(element));
    observedElements = elements;
  };

  // 仅在加载期间测量并监听尺寸，避免常驻观察者
  watch(
    [loading, tableRef],
    ([value]) => {
      const current = ++generation;
      stop();
      if (value) {
        void nextTick(() => {
          if (current === generation) syncLayout();
        });
      }
    },
    { immediate: true, flush: 'post' }
  );

  onUpdated(syncLayout);
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
    stop();
  });

  /** 挂到 YTable 根节点的样式变量。 */
  const loadingStyleVars = computed(() => ({
    '--y-table-loading-offset': `${bodyTop.value}px`,
    '--y-table-loading-body-height': `${bodyHeight.value}px`,
  }));

  return { loadingStyleVars, loadingCompact, loadingTiny };
}
