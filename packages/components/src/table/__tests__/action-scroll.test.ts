import { describe, expect, it } from 'vitest';
import { shouldCloseActionsOnScroll } from '../utils/actionScroll';

describe('shouldCloseActionsOnScroll', () => {
  it('纵向滚动超过 1px 时关闭浮层', () => {
    expect(shouldCloseActionsOnScroll({ isY: true, scrollTop: 24 }, 0)).toEqual({
      close: true,
      scrollTop: 24,
    });
  });

  it('仅横向滚动不关闭', () => {
    expect(shouldCloseActionsOnScroll({ isY: false, scrollTop: 0 }, 0)).toEqual({
      close: false,
      scrollTop: 0,
    });
  });

  it('1px 以内的纵向抖动不关闭', () => {
    expect(shouldCloseActionsOnScroll({ isY: true, scrollTop: 1 }, 0)).toEqual({
      close: false,
      scrollTop: 1,
    });
  });

  it('没有滚动参数时保持原位置且不关闭', () => {
    expect(shouldCloseActionsOnScroll(undefined, 40)).toEqual({
      close: false,
      scrollTop: 40,
    });
  });
});
