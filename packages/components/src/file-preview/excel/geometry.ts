/**
 * 工作表坐标：按 x-spreadsheet 实际使用的列宽、行高（./apply.ts 写入的像素值）计算单元格与绘图锚点的位置，
 * 并按 x-spreadsheet 的规则把滚动条位置换算成表格的滚动偏移（x-spreadsheet 按整行、整列滚动）。
 */
import type { Anchor, Marker } from './drawing';
import { EMU_PER_PX } from './dml';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeometryInput {
  colWidth(c: number): number | undefined;
  rowHeight(r: number): number | undefined;
  colCount: number;
  rowCount: number;
  /** x-spreadsheet 的默认列宽、行高（vue-office 设置为 80、24） */
  defaultColWidth?: number;
  defaultRowHeight?: number;
  freeze?: { rows: number; cols: number };
}

/** 一维的累计尺寸（前缀和），超出已知范围时按默认尺寸外推 */
class Axis {
  private readonly sums: Float64Array;
  constructor(
    private readonly size: (i: number) => number,
    readonly count: number,
    private readonly fallback: number
  ) {
    this.sums = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) this.sums[i + 1] = this.sums[i] + size(i);
  }

  sizeOf(i: number): number {
    return i < this.count ? this.size(i) : this.fallback;
  }

  /** 第 i 个（0 起）之前的累计尺寸 */
  start(i: number): number {
    if (i <= 0) return 0;
    if (i <= this.count) return this.sums[i];
    return this.sums[this.count] + (i - this.count) * this.fallback;
  }

  get total(): number {
    return this.sums[this.count];
  }

  /** 位置 p 所在的序号 */
  indexAt(p: number): number {
    if (p < 0) return 0;
    if (p >= this.sums[this.count]) return this.count + Math.floor((p - this.sums[this.count]) / this.fallback);
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.sums[mid] <= p) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * x-spreadsheet 的 scrolly / scrollx：从冻结的行（列）之后开始累加，第一次超过滚动条位置时停下，
   * 偏移为已累加的尺寸（整行滚动）。
   */
  snap(distance: number, from: number): number {
    if (distance <= 0) return 0;
    let s = 0;
    for (let i = from; i < this.count; i++) {
      if (s > distance) break;
      s += this.sizeOf(i);
    }
    return s;
  }
}

/** 与 x-spreadsheet 用同样的尺寸（隐藏行列为 0.1px），叠加层与画布逐像素对齐 */
const visibleSize = (v: number | undefined, fallback: number) => (v === undefined || !(v > 0) ? fallback : v);

export class SheetGeometry {
  readonly cols: Axis;
  readonly rows: Axis;
  readonly freeze: { rows: number; cols: number };

  constructor(input: GeometryInput) {
    const dw = input.defaultColWidth ?? 80;
    const dh = input.defaultRowHeight ?? 24;
    this.cols = new Axis(c => visibleSize(input.colWidth(c), dw), input.colCount, dw);
    this.rows = new Axis(r => visibleSize(input.rowHeight(r), dh), input.rowCount, dh);
    this.freeze = input.freeze ?? { rows: 0, cols: 0 };
  }

  /** 冻结区域的宽高 */
  get frozen(): { w: number; h: number } {
    return { w: this.cols.start(this.freeze.cols), h: this.rows.start(this.freeze.rows) };
  }

  cellRect(row: number, col: number, rows = 1, cols = 1): Rect {
    const x = this.cols.start(col);
    const y = this.rows.start(row);
    return { x, y, w: this.cols.start(col + cols) - x, h: this.rows.start(row + rows) - y };
  }

  /** 锚点在单元格内的偏移不超过该单元格（Excel 打开时也会截断） */
  private point(m: Marker): { x: number; y: number } {
    const cw = this.cols.sizeOf(m.col);
    const rh = this.rows.sizeOf(m.row);
    return {
      x: this.cols.start(m.col) + Math.min(m.colOff / EMU_PER_PX, cw),
      y: this.rows.start(m.row) + Math.min(m.rowOff / EMU_PER_PX, rh),
    };
  }

  anchorRect(anchor: Anchor): Rect {
    if (anchor.kind === 'abs' && anchor.pos && anchor.ext) {
      return {
        x: anchor.pos.x / EMU_PER_PX,
        y: anchor.pos.y / EMU_PER_PX,
        w: anchor.ext.cx / EMU_PER_PX,
        h: anchor.ext.cy / EMU_PER_PX,
      };
    }
    const a = this.point(anchor.from!);
    if (anchor.kind === 'one' && anchor.ext)
      return { ...a, w: anchor.ext.cx / EMU_PER_PX, h: anchor.ext.cy / EMU_PER_PX };
    const b = anchor.to ? this.point(anchor.to) : a;
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  /** 锚点覆盖到的最后一行、最后一列（用于把表格范围扩展到能看到对象） */
  anchorExtent(anchor: Anchor): { row: number; col: number } {
    if (anchor.kind === 'two' && anchor.to) return { row: anchor.to.row, col: anchor.to.col };
    const r = this.anchorRect(anchor);
    return { row: this.rows.indexAt(r.y + r.h), col: this.cols.indexAt(r.x + r.w) };
  }

  /** 滚动条位置 → 表格滚动偏移 */
  scrollOffset(scrollLeft: number, scrollTop: number): { x: number; y: number } {
    return { x: this.cols.snap(scrollLeft, this.freeze.cols), y: this.rows.snap(scrollTop, this.freeze.rows) };
  }

  /** 内容区域（不含行号、列标）里的点 → 单元格 */
  cellAt(px: number, py: number, scroll: { x: number; y: number }): { row: number; col: number } {
    const f = this.frozen;
    const x = px < f.w ? px : px + scroll.x;
    const y = py < f.h ? py : py + scroll.y;
    return { row: this.rows.indexAt(y), col: this.cols.indexAt(x) };
  }
}
