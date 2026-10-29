/**
 * 表格缩放：按比例改写 x-spreadsheet 数据里的行高、列宽、字号，再让它重绘。
 *
 * 不用 CSS 放大画布（会模糊，叠加层也会错位）。x-spreadsheet 的 loadData 保留数据对象的引用
 * （rows / cols / styles 直接引用传入的对象），原地改写后派发 resize 即按新尺寸重绘，画布始终按 devicePixelRatio 绘制。
 * 100% 时的原始值单独保存（第一次缩放到非 100% 时才记录，见 captureSheet），任何比例都从原始值换算，来回缩放不会累积误差。
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

/**
 * 一个工作表 100% 时的行高、列宽、字号（按行列序号存放，NaN 表示这一项不是对象 / 没有尺寸，不改写）。
 * 只在第一次缩放到非 100% 时记录（见 captureSheet），没缩放过的表格不额外占内存
 */
export interface SheetBase {
  rows: Float64Array;
  cols: Float64Array;
  /** 原来的 font.size（可能没有） */
  fontSize: unknown[];
  /** 原来有没有 font 对象 */
  hasFont: Uint8Array;
  /** 原来的字号（px） */
  fontPx: Float64Array;
  /** 上一次写入数据时的比例（判断行高 / 列宽是否被用户拖动过） */
  applied: number;
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

/** x-spreadsheet 未给出时的默认行高、列宽（与 @vue-office/excel 的设置一致） */
export const XS_ROW_HEIGHT = 24;
export const XS_COL_WIDTH = 80;
/** 数据里没有 len 时 x-spreadsheet 显示的行数、列数 */
const XS_ROW_COUNT = 100;
const XS_COL_COUNT = 26;
/** 行列序号上限（Excel 的最大行数 / 列数），防止异常序号导致分配过大的数组 */
const MAX_ROWS = 1048576;
const MAX_COLS = 16384;
/**
 * 稀疏数据补齐的范围：最后一个已有的行 / 列之后最多再补 FILL_TAIL 个（之后都是空行，只影响网格线间距，
 * 缩到 10% 时一屏也不到 1000 行）；一个方向最多新建 MAX_FILL 个对象，异常稀疏的数据不会让内存暴涨
 */
export const FILL_TAIL = 1000;
export const MAX_FILL = 200_000;

/** 行列数（x-spreadsheet 读取数据时会删掉 len，所以 transformData 时先记下，见 sheetCounts） */
export interface SheetCounts {
  rows: number;
  cols: number;
}

/** 数据交给 x-spreadsheet 之前的 len（没有时为 0）；只读两个数字，不遍历行列 */
export function sheetCounts(sheet: XsSheet): SheetCounts {
  const len = (axis: unknown) => {
    const v = axis && typeof axis === 'object' ? Number((axis as { len?: unknown }).len) : 0;
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  return { rows: len(sheet.rows), cols: len(sheet.cols) };
}

/**
 * 记录一个工作表 100% 时的行高、列宽、字号（必须在数据仍是 100% 时调用）。
 *
 * x-spreadsheet 的默认行高 / 列宽在它的实例里（vue-office 没有暴露），改不了；没写尺寸的行列会一直按默认尺寸绘制，
 * 字号却在缩放，所以范围内（0 ~ 行列数）缺尺寸的行列在这里补上默认尺寸，不设上限。
 * 内置的读取（applyWorkbookModel）已给范围内每一行、每一列写了尺寸，正常情况下这里只检查、不新建对象。
 * counts 为 transformData 时记下的行列数；没有时按现有的序号计算
 */
export function captureSheet(sheet: XsSheet, counts?: SheetCounts): SheetBase {
  const own = sheetCounts(sheet);
  // x-spreadsheet 显示的行列数：数据里的 len（读取后被删掉时用记下的值），都没有时是它的默认 100 行 / 26 列
  const rowCount = counts?.rows || own.rows || XS_ROW_COUNT;
  const colCount = counts?.cols || own.cols || XS_COL_COUNT;
  const rows = axisBase(sheet.rows as Record<string, unknown> | undefined, rowCount, 'height', XS_ROW_HEIGHT);
  const cols = axisBase(sheet.cols as Record<string, unknown> | undefined, colCount, 'width', XS_COL_WIDTH);
  const styles = (sheet.styles ?? []) as XsStyle[];
  const n = styles.length;
  const fontSize: unknown[] = new Array(n);
  const hasFont = new Uint8Array(n);
  const fontPx = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const s = styles[j];
    // 每个样式用自己的 font 对象，缩放时原地改写字号（大表有几十万个样式，每帧新建对象太慢）
    if (s?.font) s.font = { ...s.font };
    fontSize[j] = s?.font?.size;
    hasFont[j] = s?.font ? 1 : 0;
    fontPx[j] = xsFontPx(s?.font?.size);
  }
  return { rows, cols, fontSize, hasFont, fontPx, applied: 1 };
}

/** 记录多个工作表 100% 时的尺寸（初始比例不是 100% 时在交给 x-spreadsheet 之前调用） */
export function captureSheetBase(sheets: XsSheet[], counts?: Array<SheetCounts | undefined>): SheetBase[] {
  return sheets.map((sheet, i) => captureSheet(sheet, counts?.[i]));
}

function axisBase(
  axis: Record<string, unknown> | undefined,
  count: number,
  key: 'height' | 'width',
  size: number
): Float64Array {
  if (!axis || typeof axis !== 'object') return new Float64Array(0);
  const limit = key === 'height' ? MAX_ROWS : MAX_COLS;
  // 已有的最大序号（超过 Excel 上限的序号忽略）
  let last = -1;
  for (const k in axis) {
    if (!/^\d+$/.test(k)) continue;
    const i = Number(k);
    if (i < limit && i > last) last = i;
  }
  // 已有的项全部记录；缺尺寸的项补到最后一项之后 FILL_TAIL 个（不超过行列数）
  const n = Math.max(last + 1, Math.min(count, limit, last + 1 + FILL_TAIL));
  const out = new Float64Array(n);
  let created = 0;
  for (let i = 0; i < n; i++) {
    let v = axis[i] as Record<string, unknown> | number | undefined | null;
    if (v === undefined || v === null) {
      // 超过新建上限：这一项不补（按 x-spreadsheet 的默认尺寸绘制，不随缩放）
      if (created >= MAX_FILL) {
        out[i] = Number.NaN;
        continue;
      }
      created++;
      v = axis[i] = { [key]: size };
    }
    if (typeof v === 'object') {
      if (typeof v[key] !== 'number' || !(v[key] as number > 0)) v[key] = size;
      out[i] = v[key] as number;
    } else out[i] = Number.NaN;
  }
  return out;
}

/**
 * 按比例改写（scale = 1 时恢复原始值）。bases[i] 为 null / undefined 的工作表跳过（还没缩放过，数据仍是 100%）；
 * only 为只改写的工作表序号（捏合中每帧只改当前表）
 */
export function scaleSheets(
  sheets: XsSheet[],
  bases: ReadonlyArray<SheetBase | null | undefined>,
  scale: number,
  only?: number
): void {
  sheets.forEach((sheet, i) => {
    const base = bases[i];
    if (!base || (only !== undefined && i !== only)) return;
    scaleSheet(sheet, base, scale);
  });
}

/** 写入的尺寸（与 scaleSheet 一致，用于识别用户拖动过的值） */
const sizeAt = (base: number, scale: number) => (Math.abs(scale - 1) < 1e-6 ? base : round2(base * scale));

/**
 * 按比例改写一个工作表。
 * 用户拖动过的行高 / 列宽（与上一次写入的值不同）视为上一次比例下的尺寸，换算回 100% 后更新基准，缩放后保留拖动的结果
 */
export function scaleSheet(sheet: XsSheet, base: SheetBase, scale: number): void {
  const one = Math.abs(scale - 1) < 1e-6;
  const prev = base.applied > 0 ? base.applied : 1;
  const rows = sheet.rows as unknown as Record<number, { height?: number } | undefined>;
  const cols = sheet.cols as unknown as Record<number, { width?: number } | undefined>;
  // 普通 for 循环：捏合中每帧都会执行，大表有上万行
  const rb = base.rows;
  for (let n = 0; n < rb.length; n++) {
    let h = rb[n]!;
    if (h !== h) continue;
    const row = rows[n];
    if (!row || typeof row !== 'object') continue;
    const cur = row.height;
    if (typeof cur === 'number' && cur > 0 && cur !== sizeAt(h, prev)) rb[n] = h = cur / prev;
    row.height = one ? h : round2(h * scale);
  }
  const cb = base.cols;
  for (let n = 0; n < cb.length; n++) {
    let w = cb[n]!;
    if (w !== w) continue;
    const col = cols[n];
    if (!col || typeof col !== 'object') continue;
    const cur = col.width;
    if (typeof cur === 'number' && cur > 0 && cur !== sizeAt(w, prev)) cb[n] = w = cur / prev;
    col.width = one ? w : round2(w * scale);
  }
  base.applied = scale;
  const styles = sheet.styles ?? [];
  // 同一字号只换算一次
  const sized = new Map<number, number>();
  const count = Math.min(styles.length, base.fontPx.length);
  for (let j = 0; j < count; j++) {
    const style = styles[j];
    if (!style) continue;
    if (one) {
      const size = base.fontSize[j];
      if (!base.hasFont[j]) delete style.font;
      else if (size === undefined) delete style.font!.size;
      else if (style.font) style.font.size = size as number;
      else style.font = { size: size as number };
      continue;
    }
    const px = base.fontPx[j]!;
    let v = sized.get(px);
    if (v === undefined) {
      v = pxToXsFont(px * scale);
      sized.set(px, v);
    }
    if (style.font) style.font.size = v;
    else style.font = { size: v };
  }
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
  const size = (list: Float64Array, i: number, fallback: number) => {
    const v = i < list.length ? list[i]! : Number.NaN;
    return v === v ? v : fallback;
  };
  let w = 0;
  for (let c = 0; c <= Math.max(lastCol, 0); c++) w += size(base.cols, c, XS_COL_WIDTH);
  let h = 0;
  for (let r = 0; r <= Math.max(lastRow, 0); r++) h += size(base.rows, r, XS_ROW_HEIGHT);
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
