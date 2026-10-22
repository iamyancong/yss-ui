/**
 * 叠加层坐标：三种锚点、隐藏行列、冻结滚动换算、超出已用区域。
 */
import { describe, expect, it } from 'vitest';
import { EMU_PER_PX } from '../excel/dml';
import { SheetGeometry } from '../excel/geometry';

const geo = (opts?: { hiddenRow?: number; hiddenCol?: number; freeze?: { rows: number; cols: number }; rows?: number; cols?: number }) =>
  new SheetGeometry({
    colCount: opts?.cols ?? 8,
    rowCount: opts?.rows ?? 20,
    defaultColWidth: 64,
    defaultRowHeight: 20,
    freeze: opts?.freeze,
    colWidth: c => (c === opts?.hiddenCol ? 0.1 : undefined),
    rowHeight: r => (r === opts?.hiddenRow ? 0.1 : undefined),
  });

describe('SheetGeometry 锚点', () => {
  it('twoCellAnchor / oneCellAnchor / absoluteAnchor 换成像素矩形', () => {
    const g = geo();
    const two = g.anchorRect({
      kind: 'two',
      from: { col: 1, row: 2, colOff: EMU_PER_PX * 10, rowOff: 0 },
      to: { col: 3, row: 5, colOff: 0, rowOff: 0 },
    });
    expect(two.x).toBeCloseTo(64 + 10);
    expect(two.y).toBeCloseTo(40);
    expect(two.w).toBeCloseTo(64 * 2 - 10);
    expect(two.h).toBeCloseTo(20 * 3);

    const one = g.anchorRect({
      kind: 'one',
      from: { col: 0, row: 0, colOff: 0, rowOff: 0 },
      ext: { cx: EMU_PER_PX * 120, cy: EMU_PER_PX * 40 },
    });
    expect(one).toEqual({ x: 0, y: 0, w: 120, h: 40 });

    const abs = g.anchorRect({
      kind: 'abs',
      pos: { x: EMU_PER_PX * 700, y: EMU_PER_PX * 60 },
      ext: { cx: EMU_PER_PX * 120, cy: EMU_PER_PX * 60 },
    });
    expect(abs).toEqual({ x: 700, y: 60, w: 120, h: 60 });
  });

  it('单元格内偏移不超过该单元格；隐藏行列按 0.1px', () => {
    const g = geo({ hiddenRow: 10, hiddenCol: 2 });
    const over = g.anchorRect({
      kind: 'one',
      from: { col: 0, row: 0, colOff: EMU_PER_PX * 9999, rowOff: EMU_PER_PX * 9999 },
      ext: { cx: EMU_PER_PX * 10, cy: EMU_PER_PX * 10 },
    });
    expect(over.x).toBeCloseTo(64);
    expect(over.y).toBeCloseTo(20);
    expect(g.cols.sizeOf(2)).toBeCloseTo(0.1);
    expect(g.rows.sizeOf(10)).toBeCloseTo(0.1);
    const span = g.anchorRect({
      kind: 'two',
      from: { col: 1, row: 9, colOff: 0, rowOff: 0 },
      to: { col: 3, row: 11, colOff: 0, rowOff: 0 },
    });
    expect(span.h).toBeCloseTo(20 + 0.1);
    expect(span.w).toBeCloseTo(64 + 0.1);
  });

  it('对象超出已用区域时能算出覆盖到的行列', () => {
    const g = geo({ rows: 10, cols: 5 });
    const far = g.anchorExtent({
      kind: 'one',
      from: { col: 15, row: 59, colOff: 0, rowOff: 0 },
      ext: { cx: EMU_PER_PX * 150, cy: EMU_PER_PX * 80 },
    });
    expect(far.col).toBeGreaterThan(5);
    expect(far.row).toBeGreaterThan(10);
    expect(g.anchorExtent({ kind: 'two', from: { col: 1, row: 8, colOff: 0, rowOff: 0 }, to: { col: 4, row: 14, colOff: 0, rowOff: 0 } })).toEqual({
      row: 14,
      col: 4,
    });
  });

  it('冻结窗格：滚动从冻结线之后整行整列换算', () => {
    const g = geo({ freeze: { rows: 2, cols: 1 } });
    expect(g.frozen).toEqual({ w: 64, h: 40 });
    expect(g.scrollOffset(0, 0)).toEqual({ x: 0, y: 0 });
    expect(g.scrollOffset(10, 10)).toEqual({ x: 64, y: 20 });
    const inFrozen = g.cellAt(10, 10, { x: 200, y: 200 });
    expect(inFrozen).toEqual({ row: 0, col: 0 });
    const inMain = g.cellAt(100, 80, { x: 64, y: 20 });
    expect(inMain.col).toBeGreaterThan(0);
    expect(inMain.row).toBeGreaterThan(1);
  });
});
