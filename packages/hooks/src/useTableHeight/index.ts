import {
  ref,
  computed,
  onScopeDispose,
  type Ref,
  watch,
  type ComponentPublicInstance,
} from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { resolveConfigProviderPrefixCls } from './resolveConfigProviderPrefixCls';
import type { UseTableHeightOptions, UseTableHeightReturn } from './types';

/** ref 可能是 DOM 元素或 Vue 组件实例 */
type ElementOrComponent = HTMLElement | ComponentPublicInstance | undefined;

/** 默认 Card 类名前缀 */
const DEFAULT_CARD_PREFIX_CLS = 'ant-card';

/**
 * 从当前 Vue 组件实例上下文中获取 Ant Design Vue ConfigProvider 的 Card 类名前缀
 * @description 通过遍历组件 provides 原型链查找 Symbol('configProvider')，无需运行时依赖 ant-design-vue
 */
const resolveCardPrefixClsFromInstance = (): string =>
  resolveConfigProviderPrefixCls('card') ?? DEFAULT_CARD_PREFIX_CLS;

/**
 * 判断元素是否为 Card 根容器并解析其实际 Card 类名前缀
 * @description 仅识别当前上下文解析出的 cardPrefixCls 与组件库 YCard (.y-card)，
 * 避免将业务自定义的 .xxx-card（如 .order-card）误判为 Card 容器。
 */
const resolveElementCardPrefix = (el: HTMLElement, cardPrefixCls: string): string | null => {
  if (el.classList.contains(cardPrefixCls)) return cardPrefixCls;
  if (el.classList.contains('y-card')) {
    const candidates = [...el.classList].filter(c => c !== 'y-card' && c.endsWith('-card'));
    const directChildren = [...el.children];
    const matchedWithChild = candidates.find(c =>
      directChildren.some(
        child => child.classList.contains(`${c}-body`) || child.classList.contains(`${c}-head`)
      )
    );
    return matchedWithChild ?? candidates[0] ?? cardPrefixCls;
  }
  return null;
};

/**
 * 获取 Card 元素的 Body 节点
 */
const findCardBodyElement = (cardElement: HTMLElement, prefixCls: string): HTMLElement | null => {
  const directMatch = Array.from(cardElement.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.classList.contains('y-card__body') || child.classList.contains(`${prefixCls}-body`))
  );
  if (directMatch) return directMatch;
  return cardElement.querySelector<HTMLElement>(`.y-card__body, .${prefixCls}-body`);
};

/**
 * 向上查找最近的父级 Card 容器及其类名前缀
 */
const findParentCard = (
  el: HTMLElement,
  cardPrefixCls: string
): { cardElement: HTMLElement; prefixCls: string } | null => {
  let cur: HTMLElement | null = el;
  while (cur) {
    const matchedPrefix = resolveElementCardPrefix(cur, cardPrefixCls);
    if (matchedPrefix) {
      return { cardElement: cur, prefixCls: matchedPrefix };
    }
    cur = cur.parentElement;
  }
  return null;
};

/**
 * 从 ref 中获取真实的 DOM 元素
 * @description 兼容原生 DOM 元素和 Vue 组件实例
 * - 如果是 YCard/AntCard 组件，会自动获取 Card Body 元素（.y-card__body / .{prefix}-card-body，避免 padding 影响）
 * - 如果是其他 Vue 组件实例，通过 $el 获取根 DOM
 * - 如果是原生 DOM 元素，直接返回
 */
const getElement = (
  target: ElementOrComponent,
  cardPrefixCls = DEFAULT_CARD_PREFIX_CLS
): HTMLElement | null => {
  if (!target) return null;

  let element: HTMLElement | null = null;

  // 如果是 Vue 组件实例，通过 $el 获取 DOM
  if ('$el' in target) {
    const el = target.$el;
    // 处理 Fragment 组件（多根节点）：$el 可能是 Text/Comment 节点
    if (el instanceof Element) {
      element = el as HTMLElement;
    } else if (el?.nextElementSibling instanceof Element) {
      // Fragment 情况下，尝试获取下一个真实元素
      element = el.nextElementSibling as HTMLElement;
    }
  }

  // 如果本身就是 DOM 元素（SSR 安全检查）
  if (!element && typeof Element !== 'undefined' && target instanceof Element) {
    element = target as HTMLElement;
  }

  if (!element) {
    // 开发环境警告
    if (process.env.NODE_ENV === 'development') {
      console.warn('[useTableHeight] 无法获取有效的 DOM 元素，请检查 ref 绑定是否正确');
    }
    return null;
  }

  // 智能检测：如果是 Ant Design Card / YCard 组件，获取 Card Body 元素
  // 因为 Card Body 有 padding，直接使用外层会导致高度计算偏差
  const matchedPrefix = resolveElementCardPrefix(element, cardPrefixCls);
  if (matchedPrefix) {
    const cardBody = findCardBodyElement(element, matchedPrefix);
    if (cardBody) {
      return cardBody;
    }
  }

  return element;
};

/**
 * 获取 Card Header 高度
 * @description 当表格容器在 YCard/AntCard 内时，需要减去 Card Header 高度以避免遮挡
 * @param cardElement - Card 根元素（.{prefix}-card 或 .y-card）
 * @param prefixCls - 当前 Card 的类名前缀（如 ant-card 或 custom-card）
 * @returns header height in pixels, or 0 if no header
 */
const getCardHeaderHeight = (
  cardElement: HTMLElement,
  prefixCls = DEFAULT_CARD_PREFIX_CLS
): number => {
  const directHeader = Array.from(cardElement.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.classList.contains('y-card__head') || child.classList.contains(`${prefixCls}-head`))
  );
  const header =
    directHeader ?? cardElement.querySelector<HTMLElement>(`.y-card__head, .${prefixCls}-head`);
  if (!header) return 0;

  const rect = header.getBoundingClientRect();
  return rect.height;
};

export type { UseTableHeightOptions, UseTableHeightReturn } from './types';

/**
 * YTable 分页区域默认高度
 * @description padding: 12px 0 + Pagination组件高度 (small:24px / default:32px)
 * 取稍大值以确保安全
 */
export const YTABLE_PAGINATION_HEIGHT = 48;

/**
 * YTable 工具栏默认高度
 * @description vxe-toolbar medium 尺寸或自定义 toolbar
 */
export const YTABLE_TOOLBAR_HEIGHT = 48;

/**
 * YEditTable 添加按钮区域默认高度
 * @description height: 28px + margin-top: 8px + 冗余
 */
export const YEDITTABLE_ADD_BTN_HEIGHT = 40;

/**
 * 表格高度计算 Hook
 *
 * @description 用于动态计算 YTable 或 edit-table 的高度，使其在 Flex 容器中自适应。
 * 自动处理窗口缩放及容器尺寸变化。支持自动减去分页、工具栏等预设高度。
 *
 * **✨ 智能检测特性**：
 * - 如果 tableAreaRef 在 YCard/AntCard 内，会自动减去 Card Header 高度
 * - 如果 ref 绑定的是 YCard 组件实例，会自动定位到 Card Body（.y-card__body / .{prefix}-card-body）
 * - 确保表格不会被 Card 的 title/extra 插槽遮挡
 *
 * @param tableAreaRef - 表格父容器的 ref (建议设置 flex: 1; overflow: hidden;)
 * @param options - 配置选项
 * @returns 包含响应式高度值和手动计算方法
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ref } from 'vue';
 * import { useTableHeight } from '@yss-ui/hooks';
 *
 * const containerRef = ref<HTMLDivElement>();
 * const { tableHeight } = useTableHeight(containerRef, {
 *   withPagination: true,
 *   withToolbar: true
 * });
 * </script>
 *
 * <template>
 *   <div ref="containerRef" style="height: 100%; display: flex; flex-direction: column;">
 *      <YTable :height="tableHeight" :pageable="true" ... />
 *   </div>
 * </template>
 * ```
 */
export const useTableHeight = (
  tableAreaRef: Ref<ElementOrComponent>,
  options: UseTableHeightOptions = {}
): UseTableHeightReturn => {
  const {
    minHeight = 200,
    defaultHeight = 400,
    extraOffset = 0,
    withPagination = false,
    withToolbar = false,
    withAddButton = false,
    paginationHeight,
    toolbarHeight,
    addButtonHeight,
  } = options;

  /** 当前上下文解析出的 Card 类名前缀（支持 ConfigProvider prefixCls） */
  const cardPrefixCls = resolveCardPrefixClsFromInstance();

  /** 响应式表格高度 */
  const tableHeight = ref(defaultHeight);

  /** 高度是否已计算完成 */
  const isReady = ref(false);

  /** 最近一次已处理的容器高度，仅宽度变化时跳过计算。 */
  let lastObservedHeight: number | null = null;

  /** 合并 ResizeObserver 回调的 RAF ID。 */
  let resizeRafId: number | null = null;

  /**
   * 必须减去的固定高度
   * 基于配置的预设值，支持自定义覆盖
   */
  const getPresetOffset = () => {
    let offset = 0;
    if (withPagination) offset += paginationHeight ?? YTABLE_PAGINATION_HEIGHT;
    if (withToolbar) offset += toolbarHeight ?? YTABLE_TOOLBAR_HEIGHT;
    if (withAddButton) offset += addButtonHeight ?? YEDITTABLE_ADD_BTN_HEIGHT;
    return offset;
  };

  /**
   * 计算并更新表格高度
   * @param entries - ResizeObserver 回调的 entries 参数
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calculateHeight = (entries?: any) => {
    const element = getElement(options.boundaryRef?.value || tableAreaRef.value, cardPrefixCls);
    if (!element) return;

    let height = 0;

    // 优先使用 ResizeObserver 的 contentRect (不受 transform scale 影响)
    if (entries && entries.length > 0) {
      const entry = entries[0];
      height = entry.contentRect.height;
    } else {
      // Fallback: 主动调用时没有 entries
      const rect = element.getBoundingClientRect();
      height = rect.height;
    }

    // 只有当高度有效时才计算，避免 hidden 状态下的计算错误
    if (height <= 0) return;
    lastObservedHeight = height;

    // 🆕 检测父级 Card 的 Header 高度
    // 如果表格容器在 YCard/AntCard 内部，需要额外减去 Card Header 占用的空间
    let cardHeaderOffset = 0;
    const parentCard = findParentCard(element, cardPrefixCls);
    if (parentCard) {
      cardHeaderOffset = getCardHeaderHeight(parentCard.cardElement, parentCard.prefixCls);
    }

    const presetOffset = getPresetOffset();
    const availableHeight = Math.floor(height - presetOffset - extraOffset - cardHeaderOffset);

    // 优先保证分页/工具栏可见：当容器高度不足时，牺牲 minHeight
    // 只有当可用高度 > minHeight 时才应用 minHeight 限制
    // 否则使用实际可用高度（确保至少为 0）
    tableHeight.value = availableHeight > minHeight ? availableHeight : Math.max(0, availableHeight);

    // 标记已就绪
    if (!isReady.value) {
      isReady.value = true;
    }
  };

  // 创建 computed ref 用于 ResizeObserver (兼容组件实例)
  // const elementRef = computed(() => getElement(tableAreaRef.value));

  // 监听容器尺寸变化
  const observerRef = computed(() =>
    getElement(options.boundaryRef?.value || tableAreaRef.value, cardPrefixCls)
  );

  useResizeObserver(observerRef, entries => {
    const observedHeight = entries[0]?.contentRect.height ?? 0;
    if (observedHeight <= 0) return;
    if (lastObservedHeight !== null && Math.abs(lastObservedHeight - observedHeight) < 0.5) return;

    lastObservedHeight = observedHeight;
    if (resizeRafId !== null) window.cancelAnimationFrame(resizeRafId);
    // 使用单个 RAF 合并连续变化，避免 ResizeObserver loop limit exceeded。
    resizeRafId = window.requestAnimationFrame(() => {
      resizeRafId = null;
      calculateHeight(entries);
    });
  });

  onScopeDispose(() => {
    if (resizeRafId !== null) {
      window.cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
  });

  // 监听 ref 变化（处理懒加载组件首次挂载）
  watch(
    () => tableAreaRef.value,
    val => {
      if (val) {
        // 尝试立即计算 (fallback to getBoundingClientRect)
        calculateHeight();
        // 针对 Modal/Drawer 动画，可能需要延时重试 (以防 display:none -> block 尚未触发 observer)
        // 但主要依赖 ResizeObserver
      }
    },
    { immediate: true, flush: 'post' }
  );

  return {
    tableHeight,
    isReady,
    recalculateHeight: calculateHeight,
  };
};
