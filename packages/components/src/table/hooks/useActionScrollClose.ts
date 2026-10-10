import { provide, ref } from 'vue';
import { Y_TABLE_ACTION_SCROLL_KEY, shouldCloseActionsOnScroll, type TableScrollEvent } from '../utils/actionScroll';

/**
 * 把表格用户纵向滚动广播给当前表格内的操作列。
 * vxe 的 scrollTo / scrollToRow 会置 intoRunScroll，不派发 scroll，因此程序滚动不会走到这里。
 *
 * @returns 绑定到 vxe `@scroll` 的处理函数
 */
export function useActionScrollClose() {
  const scrollTick = ref(0);
  let previousScrollTop = 0;

  provide(Y_TABLE_ACTION_SCROLL_KEY, { scrollTick });

  /**
   * 响应表格 scroll。纵向位移超过阈值时通知操作列关闭空闲浮层。
   *
   * @param params vxe scroll 事件参数
   */
  const handleActionScroll = (params?: TableScrollEvent) => {
    const decision = shouldCloseActionsOnScroll(params, previousScrollTop);
    previousScrollTop = decision.scrollTop;
    if (!decision.close) return;
    scrollTick.value += 1;
  };

  return { handleActionScroll };
}
