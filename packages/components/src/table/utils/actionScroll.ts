import type { InjectionKey, Ref } from 'vue';

/** 纵向位移超过该像素才关闭操作列浮层，避开触控板 1px 抖动。 */
export const ACTION_SCROLL_CLOSE_THRESHOLD = 1;

/** vxe 表格 scroll 事件里和浮层关闭有关的字段。 */
export interface TableScrollEvent {
  /** 是否发生纵向滚动 */
  isY?: boolean;
  /** 当前纵向滚动位置 */
  scrollTop?: number;
}

/** 一次滚动是否关闭浮层，以及应记录的滚动位置。 */
export interface ActionScrollDecision {
  close: boolean;
  scrollTop: number;
}

/** 表格实例向操作列广播的用户纵向滚动信号。每个表格单独 provide。 */
export interface YTableActionScrollContext {
  /** 需要关闭空闲浮层时递增 */
  scrollTick: Ref<number>;
}

/** 操作列滚动关闭的注入键。未包在表格里时不注入，浮层保持原行为。 */
export const Y_TABLE_ACTION_SCROLL_KEY: InjectionKey<YTableActionScrollContext> = Symbol('yTableActionScroll');

/**
 * 判断这次表格滚动是否应关闭操作列浮层。
 * 只处理纵向且位移超过阈值的滚动。
 *
 * @param params vxe scroll 事件参数
 * @param previousScrollTop 上一次记录的 scrollTop
 * @returns 是否关闭，以及本次应记住的 scrollTop
 */
export function shouldCloseActionsOnScroll(
  params: TableScrollEvent | undefined,
  previousScrollTop: number
): ActionScrollDecision {
  const scrollTop = typeof params?.scrollTop === 'number' ? params.scrollTop : previousScrollTop;
  if (!params?.isY) {
    return { close: false, scrollTop };
  }
  if (Math.abs(scrollTop - previousScrollTop) <= ACTION_SCROLL_CLOSE_THRESHOLD) {
    return { close: false, scrollTop };
  }
  return { close: true, scrollTop };
}
