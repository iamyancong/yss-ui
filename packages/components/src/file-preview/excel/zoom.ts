/**
 * 表格缩放：按比例改写 x-spreadsheet 数据里的行高、列宽、字号，再让它重绘。
 *
 * 不用 CSS 放大画布（会模糊，叠加层也会错位）。x-spreadsheet 的 loadData 保留数据对象的引用
 * （rows / cols / styles 直接引用传入的对象），原地改写后派发 resize 即按新尺寸重绘，画布始终按 devicePixelRatio 绘制。
 * 100% 时的原始值单独保存，任何比例都从原始值换算，来回缩放不会累积误差。
 */
import type { XsSheet, XsStyle } from './apply';
import { HIDDEN_SIZE, SheetGeometry } from './geometry';

/** x-spreadsheet 内置字号表（pt → px）；表外的值它直接当作 px */
const XS_FONT_PX: Record<string, number> = {
  7.5: 10,
  8: 11,
  9: 12,
  10: 13,
  10.5: 14,
  11: 15,
  12: 16,
  14: 18.7,
  15: 20,
  16: 21.3,
  18: 24,
  22: 29.3,
  24: 32,
  26: 34.7,
  36: 48,
  42: 56,
};
/** x-spreadsheet 默认字号 10pt */
const DEFAULT_FONT_PX = 13;

interface StyleBase {
  /** 原来的 font.size（可能没有） */
  size: unknown;
  hasFont: boolean;
  px: number;
}

export interface SheetBase {
  rows: Array<[string, number]>;
  cols: Array<[string, number]>;
  styles: StyleBase[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** x-spreadsheet 字号（pt 表内的值或 px）→ px */
export function xsFontPx(size: unknown): number {
  if (typeof size !== 'number' || !(size > 0)) return DEFAULT_FONT_PX;
  return XS_FONT_PX[String(size)] ?? size;
}

/** px → 写进 x-spreadsheet 的字号：避开字号表里的值，否则会被当作 pt 再换算一次 */
export function pxToXsFont(px: number): number {
  let v = round2(px);
  if (XS_FONT_PX[String(v)] !== undefined) v = round2(v + 0.01);
  return v;
}

/** 记录 100% 时的行高、列宽、字号 */
export function captureSheetBase(sheets: XsSheet[]): SheetBase[] {
  return sheets.map(sheet => {
    const rows: Array<[string, number]> = [];
    const cols: Array<[string, number]> = [];
    fillDefaults(sheet);
    for (const [k, v] of Object.entries(sheet.rows ?? {})) {
      if (v && typeof v === 'object' && typeof v.height === 'number') rows.push([k, v.height]);
    }
    for (const [k, v] of Object.entries(sheet.cols ?? {})) {
      if (v && typeof v === 'object' && typeof v.width === 'number') cols.push([k, v.width]);
    }
    const styles = (sheet.styles ?? []).map((s: XsStyle) => {
      // 每个样式用自己的 font 对象，缩放时原地改写字号（大表有几十万个样式，每帧新建对象太慢）
      if (s?.font) s.font = { ...s.font };
      return { size: s?.font?.size, hasFont: !!s?.font, px: xsFontPx(s?.font?.size) };
    });
    return { rows, cols, styles };
  });
}

/** x-spreadsheet 未给出时的默认行高、列宽（与 @vue-office/excel 的设置一致） */
export const XS_ROW_HEIGHT = 24;
export const XS_COL_WIDTH = 80;
/** 补齐默认尺寸的行列数上限（更多时剩下的行列不随缩放改变） */
const FILL_LIMIT = 20000;

/** 没写尺寸的行列补上默认尺寸，缩放时它们才会一起变 */
function fillDefaults(sheet: XsSheet) {
  const fill = (axis: Record<string, unknown>, fallback: number, key: 'height' | 'width', size: number) => {
    const n = Math.min(axisCount(axis, fallback), FILL_LIMIT);
    for (let i = 0; i < n; i++) {
      const v = axis[i];
      if (v === undefined) axis[i] = { [key]: size };
      else if (v && typeof v === 'object' && typeof (v as Record<string, unknown>)[key] !== 'number')
        (v as Record<string, unknown>)[key] = size;
    }
  };
  if (sheet.rows && typeof sheet.rows === 'object') fill(sheet.rows, 100, 'height', XS_ROW_HEIGHT);
  if (sheet.cols && typeof sheet.cols === 'object') fill(sheet.cols, 26, 'width', XS_COL_WIDTH);
}

/** 按比例改写（scale = 1 时恢复原始值）；only 为只改写的工作表序号（捏合中每帧只改当前表） */
export function scaleSheets(sheets: XsSheet[], bases: SheetBase[], scale: number, only?: number): void {
  const one = Math.abs(scale - 1) < 1e-6;
  sheets.forEach((sheet, i) => {
    const base = bases[i];
    if (!base || (only !== undefined && i !== only)) return;
    const rows = sheet.rows as Record<string, { height?: number }>;
    const cols = sheet.cols as Record<string, { width?: number }>;
    // 普通 for 循环：捏合中每帧都会执行，大表有上万行
    for (let n = 0; n < base.rows.length; n++) {
      const e = base.rows[n]!;
      const row = rows[e[0]];
      if (row) row.height = one ? e[1] : round2(e[1] * scale);
    }
    for (let n = 0; n < base.cols.length; n++) {
      const e = base.cols[n]!;
      const col = cols[e[0]];
      if (col) col.width = one ? e[1] : round2(e[1] * scale);
    }
    const styles = sheet.styles ?? [];
    // 同一字号只换算一次
    const sized = new Map<number, number>();
    for (let j = 0; j < base.styles.length; j++) {
      const b = base.styles[j]!;
      const style = styles[j];
      if (!style) continue;
      if (one) {
        if (!b.hasFont) delete style.font;
        else if (b.size === undefined) delete style.font!.size;
        else if (style.font) style.font.size = b.size as number;
        else style.font = { size: b.size as number };
        continue;
      }
      let v = sized.get(b.px);
      if (v === undefined) {
        v = pxToXsFont(b.px * scale);
        sized.set(b.px, v);
      }
      if (style.font) style.font.size = v;
      else style.font = { size: v };
    }
  });
}

/** 已用区域（含图表等对象）在 100% 时的宽高，用于适应宽度 / 整页 */
export function usedSize(sheet: XsSheet, base: SheetBase): { w: number; h: number } {
  let lastCol = -1;
  let lastRow = -1;
  for (const [r, row] of Object.entries(sheet.rows ?? {})) {
    const cells =
      row && typeof row === 'object' ? (row as { cells?: Record<string, { text?: unknown }> }).cells : undefined;
    if (!cells) continue;
    for (const [c, cell] of Object.entries(cells)) {
      if (cell && cell.text !== undefined && cell.text !== '') {
        lastRow = Math.max(lastRow, Number(r));
        lastCol = Math.max(lastCol, Number(c));
      }
    }
  }
  const colW = new Map(base.cols.map(([k, v]) => [Number(k), v]));
  const rowH = new Map(base.rows.map(([k, v]) => [Number(k), v]));
  let w = 0;
  for (let c = 0; c <= Math.max(lastCol, 0); c++) w += colW.get(c) ?? 80;
  let h = 0;
  for (let r = 0; r <= Math.max(lastRow, 0); r++) h += rowH.get(r) ?? 24;
  return { w, h };
}

function axisCount(axis: Record<string, unknown>, fallback: number): number {
  let n = Number((axis as { len?: number }).len) || 0;
  if (!n) {
    n = fallback;
    for (const k of Object.keys(axis)) if (/^\d+$/.test(k)) n = Math.max(n, Number(k) + 1);
  }
  return n;
}

/** 按 x-spreadsheet 数据当前的行高、列宽计算坐标（与叠加层同一套规则） */
export function geometryOf(sheet: XsSheet, freeze?: { rows: number; cols: number }): SheetGeometry {
  const rows = sheet.rows as Record<string, { height?: number; hide?: boolean } | number>;
  const cols = sheet.cols as Record<string, { width?: number; hide?: boolean } | number>;
  return new SheetGeometry({
    rowCount: axisCount(rows, 100),
    colCount: axisCount(cols, 26),
    rowHeight: r => {
      const v = rows[r];
      return v && typeof v === 'object' ? (v.hide ? HIDDEN_SIZE : v.height) : undefined;
    },
    colWidth: c => {
      const v = cols[c];
      return v && typeof v === 'object' ? (v.hide ? HIDDEN_SIZE : v.width) : undefined;
    },
    freeze,
  });
}

/** 滚动条位置 → 左上角第一个可见（非冻结）单元格 */
export function topLeftCell(geo: SheetGeometry, scrollLeft: number, scrollTop: number): { row: number; col: number } {
  const off = geo.scrollOffset(scrollLeft, scrollTop);
  return {
    row: geo.rows.indexAt(geo.rows.start(geo.freeze.rows) + off.y + 0.5),
    col: geo.cols.indexAt(geo.cols.start(geo.freeze.cols) + off.x + 0.5),
  };
}

/**
 * 让 row / col 成为左上角第一个可见单元格的滚动条位置。
 * x-spreadsheet 从冻结行之后累加行高，第一次超过滚动距离时停下，所以取目标位置减 1
 */
export function scrollForCell(geo: SheetGeometry, row: number, col: number): { top: number; left: number } {
  const top = geo.rows.start(Math.max(row, geo.freeze.rows)) - geo.rows.start(geo.freeze.rows);
  const left = geo.cols.start(Math.max(col, geo.freeze.cols)) - geo.cols.start(geo.freeze.cols);
  return { top: Math.max(0, top - 1), left: Math.max(0, left - 1) };
}

type AxisLike = SheetGeometry['rows'];

/** 一个方向上缩放锚点：指针下的是第 index 个行 / 列、格内比例 frac；frozen 为指针在冻结区（该方向保持左上角） */
export interface AxisAnchor {
  index: number;
  frac: number;
  frozen: boolean;
  /** 指针在单元格区域（不含行号列标）里的位置 */
  local: number;
}

/** 一个方向上的滚动状态：左上角第一个非冻结的序号、它被裁掉的像素（亚像素对齐用），以及 x-spreadsheet 的滚动距离 */
export interface AxisView {
  index: number;
  trim: number;
  offset: number;
}

/**
 * 手势开始时记录锚点。geo 为当前（可能已裁掉 view.trim 的）尺寸，view 为当前滚动状态
 */
export function captureAxisAnchor(axis: AxisLike, from: number, view: AxisView, local: number): AxisAnchor {
  const frozenSize = axis.start(from);
  const frozen = !(local >= frozenSize);
  const l = frozen ? frozenSize : local;
  const p = l + view.offset;
  const i = axis.indexAt(p);
  const size = axis.sizeOf(i);
  let within = p - axis.start(i);
  let full = size;
  // 左上角那格被裁掉了 trim：换算回完整尺寸里的比例
  if (view.trim > 0 && i === view.index) {
    within += view.trim;
    full += view.trim;
  }
  const frac = full > 0 ? Math.min(1, Math.max(0, within / full)) : 0;
  return { index: i, frac, frozen, local: l };
}

/**
 * 每帧：按缩放后的尺寸（未裁剪）计算让锚点留在指针下的滚动状态。
 * x-spreadsheet 只能按整行 / 整列滚动，余下不足一格的部分通过把左上角那格裁短 trim 像素实现（表头、网格、文字一起对齐）
 */
export function axisView(axis: AxisLike, from: number, anchor: AxisAnchor): AxisView {
  const local = anchor.frozen ? axis.start(from) : anchor.local;
  const p = axis.start(anchor.index) + anchor.frac * axis.sizeOf(anchor.index);
  const total = Math.max(0, p - local);
  const target = axis.start(from) + total;
  let index = Math.max(from, axis.indexAt(target));
  let trim = target - axis.start(index);
  const size = axis.sizeOf(index);
  if (!(size >= 1) || trim < 0.05) trim = 0;
  else if (trim > size - 0.05) {
    index += 1;
    trim = 0;
  }
  return { index, trim: Math.round(trim * 100) / 100, offset: axis.start(index) - axis.start(from) };
}
