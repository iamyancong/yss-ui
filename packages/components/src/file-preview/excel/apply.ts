/**
 * 用 WorkbookModel 修正 @vue-office/excel 交给 x-spreadsheet 的数据（options.transformData）。
 *
 * @vue-office/excel 自带的转换有这些问题，这里逐项修正：
 * - 公式单元格直接显示计算结果的原始值：0.45 不按 0% 显示、3 不按 0.0 显示、日期显示为
 *   Date.toString()（「…GMT+0800 (中国标准时间)」），日期格式里的文字结果显示为 Invalid Date；
 * - 普通数字只粗略处理了少数格式，日期只认几种写法；结果为 0 的单元格显示为空；
 * - 合并区域里被覆盖的单元格也会画出主单元格的文字（重影）；
 * - 字号除以 1.33、行高把 pt 当 px、列宽按每字符 6px，整体缩小、表头文字换行后被截断；
 * - 主题颜色用固定调色板，不读文件的主题；未设置水平对齐时数字也靠左；
 * - 不支持冻结窗格、下划线 / 删除线。
 */
import type { CfStyle } from './cf';
import type { CellFormatter, FormattedCell } from './format';
import { columnName, type RawCell, type SheetModel, type WorkbookModel } from './model';

/** x-spreadsheet 的单元格样式（只列出这里用到的字段） */
export interface XsStyle {
  align?: string;
  valign?: string;
  color?: string;
  bgcolor?: string;
  textwrap?: boolean;
  underline?: boolean;
  strike?: boolean;
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: unknown;
    underline?: unknown;
    strike?: unknown;
  };
  fill?: { type?: string; pattern?: string; fgColor?: XsColorRef };
  [key: string]: unknown;
}

interface XsColorRef {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

export interface XsCell {
  text?: unknown;
  style?: number;
  merge?: [number, number];
}

export interface XsRow {
  cells?: Record<string, XsCell>;
  height?: number;
  /** x-spreadsheet 用 hide 跳过绘制；展开时仍用 height */
  hide?: boolean;
}

export interface XsCol {
  width?: number;
  hide?: boolean;
}

export interface XsSheet {
  name: string;
  styles: XsStyle[];
  rows: Record<string, XsRow | number> & { len?: number };
  cols: Record<string, XsCol | number> & { len?: number };
  merges?: string[];
  freeze?: string;
  [key: string]: unknown;
}

/** x-spreadsheet 内置的字号表（pt → px）；表外的字号会被它直接当作 px */
const XS_FONT_PT = [7.5, 8, 9, 10, 10.5, 11, 12, 14, 15, 16, 18, 22, 24, 26, 36, 42];

/** 让 x-spreadsheet 按 pt 正确显示字号 */
export function xsFontSize(pt: number): number {
  if (XS_FONT_PT.includes(pt)) return pt;
  const px = Math.round(((pt * 4) / 3) * 100) / 100;
  return XS_FONT_PT.includes(px) ? px + 0.001 : px;
}

/** Excel 列宽（字符数）→ 像素；mdw 为默认字体的数字宽度 */
export function columnWidthPx(width: number, mdw = 7): number {
  return Math.max(1, Math.trunc(((256 * width + Math.trunc(128 / mdw)) / 256) * mdw));
}

/** 没有 defaultColWidth 时的默认列宽：基础列宽 × 数字宽度 + 5px 边距，向上取到 8 的倍数（Excel 默认 64px） */
export const defaultColumnPx = (baseColWidth: number, mdw = 7) => Math.ceil((baseColWidth * mdw + 5) / 8) * 8;

export const pointsToPx = (pt: number) => Math.round((pt * 4) / 3);

/** 主题色 + tint（Excel 按 HSL 亮度调整） */
export function applyTint(hex: string, tint = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m || !tint) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let rr = l;
  let gg = l;
  let bb = l;
  if (s) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue(p, q, h + 1 / 3);
    gg = hue(p, q, h);
    bb = hue(p, q, h - 1 / 3);
  }
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(rr)}${to(gg)}${to(bb)}`.toUpperCase();
}

const themeColor = (ref: XsColorRef | undefined, theme: string[]): string | undefined => {
  if (!ref || typeof ref.theme !== 'number') return undefined;
  const base = theme[ref.theme];
  return base ? applyTint(base, ref.tint) : undefined;
};

export interface ApplyOptions {
  formatter: CellFormatter;
  /** 默认字体的数字宽度（像素），用于换算列宽 */
  mdw?: number;
  /** 测量文字宽度，用于估算没有行高的换行行；不传时不估算 */
  measure?: (text: string, fontPx: number, fontName?: string, bold?: boolean) => number;
}

const MAX_AUTO_ROW_PX = 409 * (4 / 3);
/** 换行列宽低于此值时不再按 1px 估算行数（隐藏列 colPx=0 会变成几千行） */
const MIN_WRAP_WIDTH_PX = 8;

/** 修正一个工作表；返回实际处理的单元格数 */
export function applySheetModel(
  target: XsSheet,
  sheet: SheetModel,
  model: WorkbookModel,
  options: ApplyOptions
): number {
  const { formatter } = options;
  const mdw = options.mdw ?? 7;
  const rows = target.rows as Record<string, XsRow> & { len?: number };
  const styles = target.styles ?? (target.styles = []);
  const defaultSz = model.defaultFont.sz || 11;
  let count = 0;

  // 合并区域里被覆盖的单元格（非左上角）：exceljs 会把主单元格的值复制给它们，x-spreadsheet 会重复绘制
  const covered = new Set<string>();
  for (const m of sheet.merges) {
    for (let r = m.r0; r <= m.r1; r++) {
      for (let c = m.c0; c <= m.c1; c++) {
        if (r === m.r0 && c === m.c0) continue;
        covered.add(`${r},${c}`);
        const row = rows[r];
        const cell = row && typeof row === 'object' ? row.cells?.[c] : undefined;
        if (cell) cell.text = '';
      }
    }
  }

  const styleOf = (cell: XsCell): XsStyle => {
    if (typeof cell.style !== 'number' || !styles[cell.style]) {
      styles.push({});
      cell.style = styles.length - 1;
    }
    return styles[cell.style];
  };

  const rowMaxFont = new Map<number, number>();
  const wrapped: Array<{ r: number; c: number; text: string; px: number; font?: string; bold?: boolean }> = [];

  for (const [r, cells] of sheet.cells) {
    let row = rows[r];
    if (!row || typeof row !== 'object') row = rows[r] = { cells: {} };
    const xsCells = row.cells ?? (row.cells = {});
    for (const [c, raw] of cells) {
      let cell = xsCells[c];
      if (raw.covered || covered.has(`${r},${c}`)) {
        if (cell) cell.text = '';
        continue;
      }
      if (!cell) {
        if (raw.t === 'z') continue;
        cell = xsCells[c] = {};
      }
      const out: FormattedCell = formatter.format(raw);
      cell.text = out.text;
      count++;
      const style = styleOf(cell);
      fixStyle(style, raw, out, model.themeColors);
      const sz = raw.sz ?? defaultSz;
      rowMaxFont.set(r, Math.max(rowMaxFont.get(r) ?? 0, sz));
      // 隐藏列上的换行 Excel / WPS 不参与自动行高；按 0 宽估算会把该行撑到上限
      if (style.textwrap && out.text && options.measure && !sheet.hiddenCols.has(c)) {
        wrapped.push({ r, c, text: out.text, px: (sz * 4) / 3, font: style.font?.name, bold: !!style.font?.bold });
      }
    }
  }

  // 条件格式：按单元格复制一份样式再覆盖（样式是多个单元格共用的）
  if (sheet.cf?.styles.size) {
    const derived = new Map<string, number>();
    for (const [key, cf] of sheet.cf.styles) {
      const [r, c] = key.split(',').map(Number);
      let row = rows[r];
      if (!row || typeof row !== 'object') row = rows[r] = { cells: {} };
      const cells = row.cells ?? (row.cells = {});
      const cell = cells[c] ?? (cells[c] = {});
      const baseIndex = typeof cell.style === 'number' && styles[cell.style] ? cell.style : -1;
      const id = `${baseIndex}|${cf.bg ?? ''}|${cf.color ?? ''}|${cf.bold ?? ''}|${cf.italic ?? ''}|${cf.strike ?? ''}|${cf.underline ?? ''}`;
      let index = derived.get(id);
      if (index === undefined) {
        styles.push(withConditionalStyle(baseIndex >= 0 ? styles[baseIndex] : {}, cf));
        index = styles.length - 1;
        derived.set(id, index);
      }
      cell.style = index;
    }
  }

  // 列宽：按 Excel 的换算（列宽字符数 × 数字宽度 + 边距）
  const cols = target.cols as Record<string, XsCol> & { len?: number };
  let maxCol = (cols.len ?? 0) - 1;
  for (const cells of sheet.cells.values()) for (const c of cells.keys()) maxCol = Math.max(maxCol, c);
  // 图表、图片在已用区域之外时扩大表格范围，保证能滚动到
  const extent = objectExtent(sheet);
  maxCol = Math.min(16383, Math.max(maxCol, extent.col + 1));
  const defaultPx = sheet.defaultColWidth
    ? columnWidthPx(sheet.defaultColWidth, mdw)
    : defaultColumnPx(sheet.baseColWidth ?? 8, mdw);
  const colPx: number[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const hidden = sheet.hiddenCols.has(c);
    const px = sheet.colWidths.has(c) ? columnWidthPx(sheet.colWidths.get(c)!, mdw) : defaultPx;
    colPx[c] = hidden ? 0 : px;
    const entry = cols[c] && typeof cols[c] === 'object' ? cols[c] : (cols[c] = {});
    entry.width = px;
    if (hidden) entry.hide = true;
    else delete entry.hide;
  }
  cols.len = Math.max(cols.len ?? 0, maxCol + 1);

  // 行高：pt → px；文件没写行高的行按字号与换行估算（Excel 打开时会自动调整这些行）
  const wrapLines = new Map<number, number>();
  for (const w of wrapped) {
    if (sheet.rowHeights.has(w.r)) continue;
    const merged = sheet.merges.find(m => m.r0 === w.r && m.c0 === w.c);
    const width = wrapContentWidth(sheet, colPx, w.c, merged ? merged.c1 : w.c);
    const lineWidth = width - 4;
    if (lineWidth < MIN_WRAP_WIDTH_PX) continue;
    const lines = w.text
      .split(/\r?\n/)
      .reduce((n, part) => n + Math.max(1, Math.ceil(options.measure!(part, w.px, w.font, w.bold) / lineWidth)), 0);
    wrapLines.set(w.r, Math.max(wrapLines.get(w.r) ?? 1, lines));
  }
  const defaultRowPt = sheet.defaultRowHeight ?? Math.max(15, Math.round(defaultSz * 1.36 * 4) / 4);
  let lastRow = -1;
  for (const r of sheet.cells.keys()) if (r > lastRow) lastRow = r;
  lastRow = Math.min(1048575, Math.max(lastRow, extent.row + 1));
  const len = Math.max(rows.len ?? 0, lastRow + 1);
  for (let r = 0; r < len; r++) {
    let row = rows[r];
    if (!row || typeof row !== 'object') row = rows[r] = { cells: {} };
    if (sheet.hiddenRows.has(r)) row.hide = true;
    else delete row.hide;
    const stored = sheet.rowHeights.get(r);
    if (stored !== undefined) {
      row.height = stored === 0 ? 0.1 : pointsToPx(stored);
      continue;
    }
    const fontPt = rowMaxFont.get(r) ?? defaultSz;
    const linePt = Math.max(defaultRowPt, fontPt * 1.36);
    const lines = wrapLines.get(r) ?? 1;
    row.height = Math.min(MAX_AUTO_ROW_PX, pointsToPx(lines > 1 ? fontPt * 1.3 * lines + 3 : linePt));
  }
  rows.len = len;

  if (sheet.freeze) target.freeze = `${columnName(sheet.freeze.cols)}${sheet.freeze.rows + 1}`;
  // x-spreadsheet 只认 freeze，不认 view 里的其他设置
  return count;
}

function withConditionalStyle(base: XsStyle, cf: CfStyle): XsStyle {
  const out: XsStyle = { ...base };
  if (cf.bg) out.bgcolor = cf.bg;
  if (cf.color) out.color = cf.color;
  if (cf.bold !== undefined || cf.italic !== undefined)
    out.font = {
      ...(base.font ?? {}),
      ...(cf.bold !== undefined ? { bold: cf.bold } : {}),
      ...(cf.italic !== undefined ? { italic: cf.italic } : {}),
    };
  if (cf.strike !== undefined) out.strike = cf.strike;
  if (cf.underline !== undefined) out.underline = cf.underline;
  return out;
}

/** 自动行高用的可见列宽之和；隐藏列不计入 */
function wrapContentWidth(sheet: SheetModel, colPx: number[], c0: number, c1: number): number {
  let width = 0;
  for (let c = c0; c <= c1; c++) {
    if (sheet.hiddenCols.has(c)) continue;
    width += colPx[c] ?? 0;
  }
  return width;
}

/** 绘图对象覆盖到的最远行列（单元格锚点按 to；其他按 from 加尺寸粗略估算） */
function objectExtent(sheet: SheetModel): { row: number; col: number } {
  let row = -1;
  let col = -1;
  for (const o of sheet.extras?.objects ?? []) {
    const a = o.anchor;
    if (a.to) {
      row = Math.max(row, a.to.row);
      col = Math.max(col, a.to.col);
    } else if (a.from && a.ext) {
      row = Math.max(row, a.from.row + Math.ceil(a.ext.cy / 9525 / 20));
      col = Math.max(col, a.from.col + Math.ceil(a.ext.cx / 9525 / 64));
    } else if (a.pos && a.ext) {
      row = Math.max(row, Math.ceil((a.pos.y + a.ext.cy) / 9525 / 20));
      col = Math.max(col, Math.ceil((a.pos.x + a.ext.cx) / 9525 / 64));
    }
  }
  for (const s of sheet.extras?.sparklines ?? []) for (const it of s.items) row = Math.max(row, it.row);
  return { row: Math.min(row, 1048575), col: Math.min(col, 16383) };
}

function fixStyle(style: XsStyle, raw: RawCell, out: FormattedCell, theme: string[]) {
  // 未设置水平对齐时按 Excel：数字靠右，布尔与错误值居中，文字靠左
  if (!style.align || style.align === 'general') {
    if (out.kind === 'number') style.align = 'right';
    else if (out.kind === 'bool' || out.kind === 'error') style.align = 'center';
    else delete style.align;
  } else if (style.align === 'centerContinuous' || style.align === 'distributed') style.align = 'center';
  else if (style.align === 'fill' || style.align === 'justify') style.align = 'left';
  if (style.valign === 'center' || style.valign === 'distributed' || style.valign === 'justify')
    style.valign = 'middle';

  const font = style.font;
  if (font) {
    const sz = raw.sz ?? undefined;
    if (sz) style.font = { ...font, size: xsFontSize(sz) };
    // x-spreadsheet 直接用「字号px 字体名」设置画布字体，系统没有该字体时会退回衬线字体，补上无衬线后备
    if (typeof font.name === 'string' && font.name && !font.name.includes(',')) {
      style.font = { ...style.font, name: `"${font.name.replace(/"/g, '')}", sans-serif` };
    }
    if (font.underline && font.underline !== 'none') style.underline = true;
    if (font.strike) style.strike = true;
    const fc = themeColor(font.color as XsColorRef | undefined, theme);
    if (fc) style.color = fc;
  } else if (raw.sz) {
    style.font = { size: xsFontSize(raw.sz) };
  }
  const fill = style.fill;
  if (fill) {
    if (fill.type === 'pattern' && (!fill.pattern || fill.pattern === 'none')) delete style.bgcolor;
    else {
      const bg = themeColor(fill.fgColor, theme);
      if (bg) style.bgcolor = bg;
    }
  }
  if (out.color) style.color = out.color;
}

/** 按 WorkbookModel 修正全部工作表（按名称对应） */
export function applyWorkbookModel(data: XsSheet[], model: WorkbookModel, options: ApplyOptions): XsSheet[] {
  const byName = new Map(model.sheets.map(s => [s.name, s]));
  for (const sheet of data) {
    const m = byName.get(sheet.name);
    if (m) applySheetModel(sheet, m, model, options);
  }
  return data;
}
