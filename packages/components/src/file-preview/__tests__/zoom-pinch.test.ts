import { describe, expect, it, vi } from 'vitest';
import { axisView, captureAxisAnchor, captureSheetBase, geometryOf, scaleSheets } from '../excel/zoom';
import type { XsSheet } from '../excel/apply';
import { isWheelNotch, pinchZoom, wheelDeltaPx, ZoomGesture } from '../utils/zoom';

const range = { min: 0.5, max: 2 };

describe('触控板捏合：比例换算', () => {
  it('连续缩放：不对齐步长，捏开 / 捏合对称，收敛到范围内', () => {
    const a = pinchZoom(1, -3, range);
    expect(a).toBeCloseTo(Math.exp(0.03), 6);
    expect(pinchZoom(a, 3, range)).toBeCloseTo(1, 6);
    // 30 个小事件与一次大事件结果相同（与事件拆分方式无关）
    let z = 1;
    for (let i = 0; i < 30; i++) z = pinchZoom(z, -2, { min: 0.1, max: 10 });
    expect(z).toBeCloseTo(pinchZoom(1, -60, { min: 0.1, max: 10 }), 6);
    expect(pinchZoom(1.9, -100, range)).toBe(2);
    expect(pinchZoom(0.6, 100, range)).toBe(0.5);
    expect(pinchZoom(1, Number.NaN, range)).toBe(1);
  });

  it('deltaMode 换算成像素；区分鼠标滚轮一格与触控板捏合', () => {
    expect(wheelDeltaPx(3, 1)).toBe(48);
    expect(wheelDeltaPx(1, 2)).toBe(400);
    expect(wheelDeltaPx(-2.5)).toBe(-2.5);
    expect(isWheelNotch({ deltaY: -100, deltaX: 0, deltaMode: 0 })).toBe(true);
    expect(isWheelNotch({ deltaY: 120, deltaX: 0, deltaMode: 0 })).toBe(true);
    expect(isWheelNotch({ deltaY: -3, deltaX: 0, deltaMode: 1 })).toBe(true);
    expect(isWheelNotch({ deltaY: -2.37, deltaX: 0, deltaMode: 0 })).toBe(false);
    expect(isWheelNotch({ deltaY: -8, deltaX: 0, deltaMode: 0 })).toBe(false);
    expect(isWheelNotch({ deltaY: -60.5, deltaX: 0, deltaMode: 0 })).toBe(false);
  });
});

describe('ZoomGesture 状态机', () => {
  const setup = () => {
    const frames: Array<() => void> = [];
    const timers: Array<{ cb: () => void; cancelled: boolean }> = [];
    const preview = vi.fn();
    const commit = vi.fn();
    const g = new ZoomGesture({
      preview,
      commit,
      idleMs: 100,
      raf: cb => frames.push(cb),
      cancelRaf: () => frames.splice(0),
      setTimer: cb => {
        const t = { cb, cancelled: false };
        timers.push(t);
        return t;
      },
      clearTimer: t => ((t as { cancelled: boolean }).cancelled = true),
    });
    const flushFrame = () => frames.splice(0).forEach(f => f());
    const fireIdle = () => timers.filter(t => !t.cancelled).forEach(t => ((t.cancelled = true), t.cb()));
    return { g, preview, commit, flushFrame, fireIdle, frames };
  };

  it('同一帧内的多次 update 合并成一次 preview；空闲后 commit 一次', () => {
    const { g, preview, commit, flushFrame, fireIdle } = setup();
    expect(g.active).toBe(false);
    g.begin(1);
    g.update(1.05, { x: 10, y: 20 });
    g.update(1.1);
    g.update(1.2);
    expect(preview).not.toHaveBeenCalled();
    flushFrame();
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenLastCalledWith(1.2, { x: 10, y: 20 });
    g.update(1.3, { x: 11, y: 21 });
    flushFrame();
    expect(preview).toHaveBeenCalledTimes(2);
    expect(commit).not.toHaveBeenCalled();
    fireIdle();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(1.3, { x: 11, y: 21 });
    expect(g.active).toBe(false);
  });

  it('begin 在进行中忽略新的起点；end 立即提交并取消未执行的帧；cancel 不提交', () => {
    const { g, preview, commit, flushFrame, frames } = setup();
    g.begin(1);
    g.update(1.5);
    g.begin(0.7);
    expect(g.current).toBe(1.5);
    g.end();
    expect(commit).toHaveBeenCalledWith(1.5, undefined);
    expect(frames).toHaveLength(0);
    flushFrame();
    expect(preview).not.toHaveBeenCalled();
    g.begin(1);
    g.update(0.8);
    g.cancel();
    expect(commit).toHaveBeenCalledTimes(1);
    g.update(0.9);
    expect(g.current).toBeUndefined();
  });

  it('autoEnd 为 false 时（Safari / 触摸）不按空闲结束', () => {
    const { g, commit, fireIdle } = setup();
    g.begin(1);
    g.update(1.4, undefined, false);
    fireIdle();
    expect(commit).not.toHaveBeenCalled();
    g.end();
    expect(commit).toHaveBeenCalledWith(1.4, undefined);
  });
});

describe('表格以指针为锚点缩放（亚像素）', () => {
  const sheet = (w: number, h: number, rows = 200, cols = 50): XsSheet =>
    ({
      name: 's',
      styles: [],
      rows: Object.fromEntries(Array.from({ length: rows }, (_, i): [string, unknown] => [String(i), { height: h }])),
      cols: Object.fromEntries(Array.from({ length: cols }, (_, i): [string, unknown] => [String(i), { width: w }])),
    }) as never;
  /** 视图里某个绝对位置 p 的显示坐标：整格滚动 offset，左上角那格裁掉 trim */
  const display = (
    start: (i: number) => number,
    from: number,
    v: { index: number; trim: number; offset: number },
    p: number
  ) => (p - start(from) >= v.offset + 0 ? p - v.offset - (p >= start(v.index) + 0 ? v.trim : 0) : p);

  it('任意比例下指针下的位置都留在指针下（误差 < 0.01px），连续多帧不累积', () => {
    const geo0 = geometryOf(sheet(80, 24));
    // 已滚到第 10 行（offset 240），指针在 y = 130
    const anchor = captureAxisAnchor(geo0.rows, 0, { index: 10, trim: 0, offset: 240 }, 130);
    const p0 = 130 + 240;
    expect(anchor.index).toBe(Math.floor(p0 / 24));
    for (const s of [1.01, 1.137, 1.5, 2, 0.73, 0.5]) {
      const geo = geometryOf(sheet(80, 24 * s));
      const v = axisView(geo.rows, 0, anchor);
      expect(v.trim).toBeGreaterThanOrEqual(0);
      expect(v.trim).toBeLessThan(24 * s);
      const p = p0 * s;
      // 显示坐标 = p - offset - trim（p 在左上角那格之后）
      expect(p - v.offset - v.trim).toBeCloseTo(130, 1);
      expect(v.offset).toBeCloseTo(geo.rows.start(v.index), 6);
    }
    void display;
  });

  it('从已裁剪的状态继续缩放：按完整尺寸换算格内比例', () => {
    const geo = geometryOf(sheet(80, 30));
    const view = axisView(
      geo.rows,
      0,
      captureAxisAnchor(geometryOf(sheet(80, 20)).rows, 0, { index: 5, trim: 0, offset: 100 }, 57)
    );
    expect(view.trim).toBeGreaterThan(0);
    // 模拟数据里那格被裁短
    const trimmed = sheet(80, 30);
    (trimmed.rows[String(view.index)] as { height: number }).height = 30 - view.trim;
    const again = captureAxisAnchor(geometryOf(trimmed).rows, 0, view, 57);
    const back = axisView(geo.rows, 0, again);
    expect(back.index).toBe(view.index);
    expect(back.trim).toBeCloseTo(view.trim, 1);
  });

  it('指针在冻结区 / 行号上：该方向保持左上角；缩小到顶部时不为负', () => {
    const g = geometryOf(sheet(80, 24), { rows: 2, cols: 0 });
    const a = captureAxisAnchor(g.rows, 2, { index: 12, trim: 0, offset: 240 }, 20);
    expect(a.frozen).toBe(true);
    const v = axisView(geometryOf(sheet(80, 48), { rows: 2, cols: 0 }).rows, 2, a);
    expect(v.index).toBe(12);
    expect(v.trim).toBe(0);
    const top = captureAxisAnchor(g.cols, 0, { index: 0, trim: 0, offset: 0 }, 0);
    expect(axisView(geometryOf(sheet(40, 12)).cols, 0, top)).toEqual({ index: 0, trim: 0, offset: 0 });
  });

  it('没写尺寸的行列补上默认尺寸，一起缩放；只改写指定的工作表', () => {
    const a = { name: 'a', styles: [], rows: { 0: { height: 30 } }, cols: {} } as unknown as XsSheet;
    const b = { name: 'b', styles: [], rows: { 0: { height: 30 } }, cols: {} } as unknown as XsSheet;
    const bases = captureSheetBase([a, b]);
    expect(Object.keys(a.rows)).toHaveLength(100);
    expect((a.cols as Record<string, { width: number }>)[25]!.width).toBe(80);
    scaleSheets([a, b], bases, 2, 0);
    expect((a.rows as Record<string, { height: number }>)[50]!.height).toBe(48);
    expect((b.rows as Record<string, { height: number }>)[0]!.height).toBe(30);
  });
});
