/**
 * 直接读取 xlsx 里的 XML，得到单元格原始值与显示信息（WorkbookModel）。
 *
 * @vue-office/excel 内部用 exceljs 解析，会丢掉或改写一部分信息：日期格式单元格里的文字结果变成
 * Invalid Date、公式结果直接显示为 Date.toString()、中文内置日期格式编号丢失、没有保存结果的公式
 * 与结果为空字符串的公式无法区分等。这里按文件原样读取，供 ./apply.ts 修正显示。
 *
 * 用正则顺序扫描，不建 DOM：10 万级单元格的工作表也只需几百毫秒。
 */
import { applyTint } from './apply';
import { builtinFormat } from './builtin-formats';
import {
  createSheetModel,
  parseCellRef,
  setCell,
  trimTruncatedSheet,
  type BorderSide,
  type CellBudget,
  type CellStyleModel,
  type RawCell,
  type SheetModel,
  type WorkbookModel,
} from './model';
import { computeConditionalFormats, INDEXED, parseDxfs } from './cf';
import { parseThemeFonts, type ThemeInfo } from './dml';
import { parseSheetExtras, type PartReader } from './drawing';
import { parseXml } from './xml';
import { listZipEntries, MAX_ENTRY_BYTES, readZipEntry, readZipEntryHead, readZipText, replaceZipEntries } from './zip';

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** 解码 XML 实体与 OOXML 的 _xHHHH_ 转义 */
export function decodeXmlText(s: string): string {
  if (!s.includes('&') && !s.includes('_x')) return s;
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      }
      return ENTITY[e.toLowerCase()] ?? '';
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** 读取标签里的属性（不会把 xr:r 当成 r） */
const attrRes = new Map<string, RegExp>();
export function attr(tag: string, name: string): string | undefined {
  let re = attrRes.get(name);
  if (!re) attrRes.set(name, (re = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`)));
  const m = re.exec(tag);
  return m ? decodeXmlText(m[1]) : undefined;
}

const isTrue = (v: string | undefined) => v === '1' || v === 'true';

/** 共享字符串：拼接所有 <t>，跳过注音 <rPh> */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const si = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = si.exec(xml))) out.push(textOf(m[1] ?? ''));
  return out;
}

function textOf(inner: string): string {
  const body = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let text = '';
  const t = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = t.exec(body))) text += decodeXmlText(m[1] ?? '');
  return text;
}

export interface StylesInfo {
  /** cellXfs 序号 → 格式代码 */
  formats: string[];
  /** cellXfs 序号 → 字号 */
  sizes: Array<number | undefined>;
  defaultFont: { name?: string; sz: number };
  /** cellXfs 序号 → 单元格样式（只在 parseXlsxModel 的 cellStyles 选项打开时读取） */
  cellStyles?: CellStyleModel[];
}

/** 主题里没有对应颜色时的后备（与 @vue-office/excel 一致） */
const FALLBACK_THEME = ['#FFFFFF', '#000000', '#BFBFBF', '#323232', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#71AD47'];

/**
 * `<color rgb="FFFF0000"/>`、`theme="1" tint="-0.25"`、`indexed="8"` → #RRGGBB；auto 返回 undefined。
 * 调色板以外的序号（64 为系统前景色）：fill 为 true 时与 @vue-office/excel 一致（64 黑色，其他 #C7C9CC），否则 undefined
 */
export function xlsxColor(tag: string | undefined, theme: string[], fill = false): string | undefined {
  if (!tag) return undefined;
  const rgb = attr(tag, 'rgb');
  if (rgb && /^[0-9a-f]{6,8}$/i.test(rgb)) return `#${rgb.slice(-6).toUpperCase()}`;
  const t = attr(tag, 'theme');
  if (t !== undefined) {
    const i = Number(t);
    const base = theme[i] || FALLBACK_THEME[i];
    if (!base) return undefined;
    return applyTint(base, Number(attr(tag, 'tint') ?? 0) || 0);
  }
  const idx = attr(tag, 'indexed');
  if (idx !== undefined) {
    const i = Number(idx);
    const c = INDEXED[i];
    if (c) return `#${c}`;
    return fill ? (i === 64 ? '#000000' : '#C7C9CC') : undefined;
  }
  return undefined;
}

const flag = (inner: string, name: string) => {
  const tag = new RegExp(`<${name}\\b[^>]*>`).exec(inner)?.[0];
  if (!tag) return false;
  const v = attr(tag, 'val');
  return v === undefined || (v !== '0' && v !== 'false' && v !== 'none');
};

const BORDER_SIDES: BorderSide[] = ['left', 'right', 'top', 'bottom'];

/** 读取字体、填充、边框、对齐，转换成与 x-spreadsheet 一致的样式（与 @vue-office/excel + exceljs 的显示一致） */
function readCellStyles(xml: string, theme: string[]): CellStyleModel[] {
  const fonts: Array<Pick<CellStyleModel, 'font' | 'color' | 'underline' | 'strike'>> = [];
  const fontsXml = /<fonts\b[\s\S]*?<\/fonts>/.exec(xml)?.[0] ?? '';
  for (const m of fontsXml.matchAll(/<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g)) {
    const inner = m[1] ?? '';
    const name = attr(/<name\b[^>]*>/.exec(inner)?.[0] ?? '', 'val');
    const out: (typeof fonts)[number] = { font: { name, bold: flag(inner, 'b'), italic: flag(inner, 'i') } };
    if (flag(inner, 'u')) out.underline = true;
    if (flag(inner, 'strike')) out.strike = true;
    const color = xlsxColor(/<color\b[^>]*>/.exec(inner)?.[0], theme);
    if (color) out.color = color;
    fonts.push(out);
  }
  const fills: Array<string | undefined> = [];
  const fillsXml = /<fills\b[\s\S]*?<\/fills>/.exec(xml)?.[0] ?? '';
  for (const m of fillsXml.matchAll(/<fill\b[^>]*?(?:\/>|>([\s\S]*?)<\/fill>)/g)) {
    const inner = m[1] ?? '';
    const pattern = /<patternFill\b[^>]*>/.exec(inner)?.[0];
    const type = pattern ? attr(pattern, 'patternType') : undefined;
    fills.push(type && type !== 'none' ? xlsxColor(/<fgColor\b[^>]*>/.exec(inner)?.[0], theme, true) : undefined);
  }
  const borders: Array<CellStyleModel['border']> = [];
  const bordersXml = /<borders\b[\s\S]*?<\/borders>/.exec(xml)?.[0] ?? '';
  for (const m of bordersXml.matchAll(/<border\b[^>]*?(?:\/>|>([\s\S]*?)<\/border>)/g)) {
    const inner = m[1] ?? '';
    let border: CellStyleModel['border'];
    for (const side of BORDER_SIDES) {
      const sm = new RegExp(`<${side}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${side}>)`).exec(inner);
      const style = sm ? attr(sm[1], 'style') : undefined;
      if (!style || style === 'none') continue;
      (border ??= {})[side] = [style, xlsxColor(/<color\b[^>]*>/.exec(sm?.[2] ?? '')?.[0], theme) ?? '#000000'];
    }
    borders.push(border);
  }
  const out: CellStyleModel[] = [];
  const xfsXml = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? '';
  for (const m of xfsXml.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)) {
    const a = m[1];
    const style: CellStyleModel = { ...fonts[Number(attr(a, 'fontId') ?? 0)] };
    if (style.font) style.font = { ...style.font };
    const bg = fills[Number(attr(a, 'fillId') ?? 0)];
    if (bg) style.bgcolor = bg;
    const border = borders[Number(attr(a, 'borderId') ?? 0)];
    if (border) style.border = border;
    const align = /<alignment\b[^>]*>/.exec(m[2] ?? '')?.[0];
    if (align) {
      const h = attr(align, 'horizontal');
      const v = attr(align, 'vertical');
      if (h) style.align = h;
      if (v) style.valign = v;
      if (isTrue(attr(align, 'wrapText'))) style.textwrap = true;
    }
    out.push(style);
  }
  return out;
}

export function parseStyles(xml: string | null, locale: string, theme?: string[]): StylesInfo {
  const custom = new Map<number, string>();
  const fonts: Array<{ name?: string; sz?: number }> = [];
  const formats: string[] = [];
  const sizes: Array<number | undefined> = [];
  if (xml) {
    for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
      const id = Number(attr(m[0], 'numFmtId'));
      const code = attr(m[0], 'formatCode');
      if (Number.isFinite(id) && code !== undefined) custom.set(id, code);
    }
    const fontsXml = /<fonts\b[\s\S]*?<\/fonts>/.exec(xml)?.[0] ?? '';
    for (const m of fontsXml.matchAll(/<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g)) {
      const inner = m[1] ?? '';
      const sz = Number(attr(/<sz\b[^>]*>/.exec(inner)?.[0] ?? '', 'val'));
      fonts.push({ sz: Number.isFinite(sz) && sz > 0 ? sz : undefined, name: attr(/<name\b[^>]*>/.exec(inner)?.[0] ?? '', 'val') });
    }
    const xfsXml = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? '';
    for (const m of xfsXml.matchAll(/<xf\b[^>]*>/g)) {
      const id = Number(attr(m[0], 'numFmtId') ?? 0);
      formats.push(custom.get(id) ?? builtinFormat(id, locale));
      sizes.push(fonts[Number(attr(m[0], 'fontId') ?? 0)]?.sz);
    }
  }
  const base = fonts[0] ?? {};
  const info: StylesInfo = { formats, sizes, defaultFont: { name: base.name, sz: base.sz ?? 11 } };
  if (xml && theme) info.cellStyles = safe(() => readCellStyles(xml, theme), undefined);
  return info;
}

const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

/** 主题颜色，按 Excel 单元格里 theme 属性的序号排列 */
export function parseThemeColors(xml: string | null): string[] {
  if (!xml) return [];
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] ?? '';
  return THEME_ORDER.map(name => {
    const block = new RegExp(`<a:${name}\\b[\\s\\S]*?</a:${name}>`).exec(scheme)?.[0] ?? '';
    const rgb = /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(block)?.[1] ?? /lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1];
    return rgb ? `#${rgb.toUpperCase()}` : '';
  });
}

const resolveTarget = (target: string) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
};

/** ISO 日期（t="d"）→ Excel 序列号 */
const isoToSerial = (iso: string) => {
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}${iso.includes('T') ? '' : 'T00:00:00'}Z`);
  return Number.isFinite(ms) ? ms / 86400000 + 25569 : NaN;
};

/** 解析行的进度（分段解析时在两段之间保存） */
interface RowCursor {
  /** 下一行在 xml 里的位置 */
  at: number;
  rowIndex: number;
}

export function parseSheet(
  xml: string,
  sheet: SheetModel,
  shared: string[],
  styles: StylesInfo,
  onProgress?: (fraction: number) => void
): SheetModel {
  parseSheetHead(xml, sheet);
  const cursor: RowCursor = { at: 0, rowIndex: -1 };
  // 分段解析只为报告进度；不让出线程（Worker 里使用）
  while (cursor.at >= 0) {
    parseSheetRows(xml, sheet, shared, styles, cursor, onProgress ? ROWS_PER_SLICE * 10 : Infinity);
    if (cursor.at >= 0) onProgress?.(cursor.at / xml.length);
  }
  parseSheetTail(xml, sheet);
  return sheet;
}

/** 每段解析的行数：大表分段解析，段与段之间让出主线程 */
const ROWS_PER_SLICE = 2000;

/** 分段解析工作表，每段之后让出主线程；signal 中止时返回 false */
export async function parseSheetAsync(
  xml: string,
  sheet: SheetModel,
  shared: string[],
  styles: StylesInfo,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void
): Promise<boolean> {
  parseSheetHead(xml, sheet);
  const cursor: RowCursor = { at: 0, rowIndex: -1 };
  while (cursor.at >= 0) {
    parseSheetRows(xml, sheet, shared, styles, cursor, ROWS_PER_SLICE);
    if (cursor.at < 0) break;
    onProgress?.(cursor.at / xml.length);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (signal?.aborted) return false;
  }
  parseSheetTail(xml, sheet);
  return true;
}

function parseSheetHead(xml: string, sheet: SheetModel) {
  const head = xml.slice(0, Math.max(0, xml.indexOf('<sheetData')) || 4096);
  const fmt = /<sheetFormatPr\b[^>]*>/.exec(head)?.[0];
  if (fmt) {
    const dcw = Number(attr(fmt, 'defaultColWidth'));
    const bcw = Number(attr(fmt, 'baseColWidth'));
    const drh = Number(attr(fmt, 'defaultRowHeight'));
    if (dcw > 0) sheet.defaultColWidth = dcw;
    else if (bcw > 0) sheet.baseColWidth = bcw;
    if (drh > 0) sheet.defaultRowHeight = drh;
  }
  const view = /<sheetView\b[^>]*>/.exec(head)?.[0];
  if (view && (attr(view, 'showGridLines') === '0' || attr(view, 'showGridLines') === 'false')) sheet.showGridLines = false;
  const pane = /<pane\b[^>]*>/.exec(head)?.[0];
  if (pane && /^frozen/.test(attr(pane, 'state') ?? '')) {
    const cols = Math.max(0, Math.floor(Number(attr(pane, 'xSplit') ?? 0)));
    const rows = Math.max(0, Math.floor(Number(attr(pane, 'ySplit') ?? 0)));
    if (cols || rows) sheet.freeze = { cols, rows };
  }
  for (const m of head.matchAll(/<col\b[^>]*>/g)) {
    const min = Number(attr(m[0], 'min'));
    const max = Math.min(Number(attr(m[0], 'max')), min + 16384);
    const width = Number(attr(m[0], 'width'));
    const hidden = isTrue(attr(m[0], 'hidden'));
    for (let c = min - 1; c < max && c < 16384; c++) {
      if (width > 0) sheet.colWidths.set(c, width);
      if (hidden || width === 0) sheet.hiddenCols.add(c);
    }
  }

}

/** 从 cursor 处解析最多 limit 行；解析完时 cursor.at 为 -1 */
function parseSheetRows(
  xml: string,
  sheet: SheetModel,
  shared: string[],
  styles: StylesInfo,
  cursor: RowCursor,
  limit: number
) {
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  rowRe.lastIndex = cursor.at;
  let rowIndex = cursor.rowIndex;
  let rm: RegExpExecArray | null;
  let count = 0;
  for (;;) {
    if (count++ >= limit) {
      cursor.at = rowRe.lastIndex;
      cursor.rowIndex = rowIndex;
      return;
    }
    // 超过单元格上限后不再读取（见 CellBudget）
    if (sheet.truncatedRows !== undefined) break;
    rm = rowRe.exec(xml);
    if (!rm) break;
    const rowAttrs = rm[1];
    const r = Number(attr(rowAttrs, 'r'));
    rowIndex = r > 0 ? r - 1 : rowIndex + 1;
    const ht = Number(attr(rowAttrs, 'ht'));
    if (ht >= 0 && attr(rowAttrs, 'ht') !== undefined) sheet.rowHeights.set(rowIndex, ht);
    if (isTrue(attr(rowAttrs, 'hidden'))) sheet.hiddenRows.add(rowIndex);
    const body = rm[2];
    if (!body) continue;
    let colIndex = -1;
    cellRe.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body))) {
      const a = cm[1];
      const ref = attr(a, 'r');
      const pos = ref ? parseCellRef(ref) : null;
      colIndex = pos ? pos.col : colIndex + 1;
      const row = pos ? pos.row : rowIndex;
      const s = Number(attr(a, 's') ?? 0);
      const t = attr(a, 't') ?? 'n';
      const inner = cm[2] ?? '';
      const hasFormula = inner.includes('<f');
      const vMatch = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(inner);
      const vText = vMatch ? decodeXmlText(vMatch[1] ?? '') : undefined;
      const cell: RawCell = { t: 'z', v: null, fmt: styles.formats[s] ?? 'General', sz: styles.sizes[s] };
      // 与 exceljs 一致：s 为 0（或没写）的单元格不带样式，按 x-spreadsheet 的默认样式显示
      if (s > 0 && styles.cellStyles?.[s]) cell.style = s;
      if (hasFormula) {
        cell.f = true;
        sheet.formulaCells++;
      }
      if (t === 'inlineStr') {
        const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner);
        cell.t = 's';
        cell.v = textOf(is?.[1] ?? '');
      } else if (vText === undefined || (vText === '' && t !== 'str' && t !== 's')) {
        // 没有保存结果：普通空单元格，或公式没有缓存值
        if (hasFormula) {
          cell.missing = true;
          sheet.missingFormulas++;
        }
      } else if (t === 's') {
        cell.t = 's';
        cell.v = shared[Number(vText)] ?? '';
      } else if (t === 'str') {
        cell.t = 's';
        cell.v = vText;
      } else if (t === 'b') {
        cell.t = 'b';
        cell.v = vText === '1' || vText.toLowerCase() === 'true';
      } else if (t === 'e') {
        cell.t = 'e';
        cell.v = vText;
      } else if (t === 'd') {
        const serial = isoToSerial(vText);
        if (Number.isFinite(serial)) {
          cell.t = 'n';
          cell.v = serial;
        } else {
          cell.t = 's';
          cell.v = vText;
        }
      } else {
        const n = Number(vText);
        if (Number.isFinite(n)) {
          cell.t = 'n';
          cell.v = n;
        } else {
          cell.t = 's';
          cell.v = vText;
        }
      }
      setCell(sheet, row, colIndex, cell);
    }
  }
  cursor.at = -1;
  cursor.rowIndex = rowIndex;
}

function parseSheetTail(xml: string, sheet: SheetModel) {
  const tail = xml.slice(xml.lastIndexOf('</sheetData>') + 1 || 0);
  for (const m of tail.matchAll(/<mergeCell\b[^>]*>/g)) {
    const [a, b] = (attr(m[0], 'ref') ?? '').split(':');
    const p = parseCellRef(a ?? '');
    const q = parseCellRef(b ?? a ?? '');
    if (p && q) sheet.merges.push({ r0: Math.min(p.row, q.row), c0: Math.min(p.col, q.col), r1: Math.max(p.row, q.row), c1: Math.max(p.col, q.col) });
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export interface ParseXlsxOptions {
  locale?: string;
  signal?: AbortSignal;
  /**
   * 同时读取单元格样式（字体、填充、边框、对齐，见 WorkbookModel.cellStyles），
   * 用于不经过 exceljs、直接从模型生成 x-spreadsheet 数据（见 ./build.ts）
   */
  cellStyles?: boolean;
  /** 每段解析之间让出线程（主线程上需要；Worker 里不需要） */
  yieldRows?: boolean;
  /** 单元格总数上限，超过时截断（见 CellBudget） */
  budget?: CellBudget;
  /** 解析进度（0~1，按工作表 XML 的字节数估算） */
  onProgress?: (fraction: number) => void;
}

/** 给模型接上读取图片等二进制部件的方法（Worker 传回的模型没有函数，在主线程重新接上） */
export function attachXlsxAssets(model: WorkbookModel, data: ArrayBuffer, entries = listZipEntries(data)) {
  Object.defineProperty(model, 'assets', {
    enumerable: false,
    configurable: true,
    value: {
      bytes: async (p: string) => {
        const e = entries?.get(p);
        return e ? readZipEntry(data, e) : null;
      },
      size: (p: string) => entries?.get(p)?.size,
    },
  });
}

/** 解析 xlsx；不是 xlsx 或浏览器不支持解压时返回 null（调用方按原样显示） */
export async function parseXlsxModel(data: ArrayBuffer, options: ParseXlsxOptions = {}): Promise<WorkbookModel | null> {
  const locale = options.locale ?? 'zh-CN';
  const entries = listZipEntries(data);
  if (!entries || !entries.has('xl/workbook.xml')) return null;
  const read = (path: string) => readZipText(data, entries, path);
  const [workbook, rels, stylesXml, sharedXml, themeXml] = await Promise.all([
    read('xl/workbook.xml'),
    read('xl/_rels/workbook.xml.rels'),
    read('xl/styles.xml'),
    read('xl/sharedStrings.xml'),
    read('xl/theme/theme1.xml'),
  ]);
  if (!workbook || !rels) return null;
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target && attr(m[0], 'TargetMode') !== 'External') targets.set(id, resolveTarget(target));
  }
  const themeColors = parseThemeColors(themeXml);
  const styles = parseStyles(stylesXml, locale, options.cellStyles ? themeColors : undefined);
  const theme: ThemeInfo = { colors: themeColors, ...safe(() => parseThemeFonts(parseXml(themeXml)), {}) };
  const dxfs = safe(() => parseDxfs(stylesXml, themeColors), []);
  const reader: PartReader = { text: read, has: p => entries.has(p) };
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const pr = /<workbookPr\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const calc = /<calcPr\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const viewTag = /<workbookView\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const model: WorkbookModel = {
    date1904: isTrue(attr(pr, 'date1904')),
    activeTab: Number(attr(viewTag, 'activeTab') ?? 0) || 0,
    fullCalcOnLoad: isTrue(attr(calc, 'fullCalcOnLoad')) || !attr(calc, 'calcId'),
    sheets: [],
    themeColors,
    defaultFont: styles.defaultFont,
    theme,
  };
  if (styles.cellStyles) model.cellStyles = styles.cellStyles;
  attachXlsxAssets(model, data, entries);
  const budget = options.budget;
  const sheetTags = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]);
  const sheetPaths = sheetTags.map(tag => targets.get(attr(tag, 'r:id') ?? ''));
  // 进度按各工作表 XML 解压后的大小分配
  const weights = sheetPaths.map(p => Math.max(1, (p && entries.get(p)?.size) || 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let doneWeight = 0;
  for (let i = 0; i < sheetTags.length; i++) {
    if (options.signal?.aborted) return null;
    const tag = sheetTags[i];
    const name = attr(tag, 'name') ?? '';
    const state = (attr(tag, 'state') ?? 'visible') as SheetModel['state'];
    const path = sheetPaths[i];
    const sheet = createSheetModel(name, state === 'hidden' || state === 'veryHidden' ? state : 'visible');
    if (budget) sheet.budget = budget;
    let xml = path ? await read(path) : null;
    let cut = false;
    if (!xml && path && entries.get(path)) {
      // 解压后超过 MAX_ENTRY_BYTES（内容异常多）：只读开头部分，显示前面的行
      const head = await readZipEntryHead(data, entries.get(path)!, MAX_ENTRY_BYTES);
      if (head && head.byteLength) {
        xml = utf8Decode(head);
        cut = true;
      }
    }
    if (options.signal?.aborted) return null;
    const progress = options.onProgress
      ? (f: number) => options.onProgress!((doneWeight + weights[i] * Math.min(1, Math.max(0, f))) / totalWeight)
      : undefined;
    // 分段解析、段间让出主线程：切换文件 / 关闭能及时生效
    if (xml) {
      if (options.yieldRows === false) parseSheet(xml, sheet, shared, styles, progress);
      else if (!(await parseSheetAsync(xml, sheet, shared, styles, options.signal, progress))) return null;
      if (cut && sheet.truncatedRows === undefined) sheet.truncatedRows = lastRow(sheet) + 1;
    }
    doneWeight += weights[i];
    options.onProgress?.(doneWeight / totalWeight);
    if (xml && path && sheet.state === 'visible') {
      // sheetData 之前（工作表属性、视图）与之后（合并、超链接、条件格式、绘图引用）两段
      const start = xml.indexOf('<sheetData');
      const end = xml.lastIndexOf('</sheetData>');
      const head = xml.slice(0, start < 0 ? Math.min(xml.length, 8192) : start);
      const tail = end < 0 ? (start < 0 ? '' : xml.slice(start).replace(/^<sheetData\b[^>]*\/>/, '')) : xml.slice(end);
      sheet.extras = await parseSheetExtras(path, head, tail, reader, theme).catch(() => undefined);
      sheet.cf = safe(() => computeConditionalFormats(tail, sheet, dxfs, themeColors, model.date1904), undefined);
    }
    delete sheet.budget;
    trimTruncatedSheet(sheet);
    model.sheets.push(sheet);
  }
  if (budget) model.cellCount = budget.count;
  return model;
}

const utf8Decoder = new TextDecoder();
const utf8Decode = (bytes: Uint8Array) => utf8Decoder.decode(bytes);

/** 有单元格的最后一行（0 起），没有时为 -1 */
function lastRow(sheet: SheetModel): number {
  let last = -1;
  for (const r of sheet.cells.keys()) if (r > last) last = r;
  return last;
}

const EMPTY_DRAWING = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>'
);

/**
 * 给 @vue-office/excel（内置 exceljs）的副本，避开 exceljs 读不了的写法：
 * - 清空绘图部件：图表、图片、形状由叠加层自己画；exceljs 读某些绘图（如不带 xdr 前缀的 wsDr、absoluteAnchor）会直接抛错，整个文件都打不开；
 * - 去掉工作表关系里的批注：批注也由叠加层显示；exceljs 只认 xl/commentsN.xml，其他程序写的 xl/comments/comment1.xml 会让它抛错；
 * - 工作表关系里以 /xl/ 开头的绝对路径改成相对路径（含义相同，exceljs 只按相对路径查找）。
 * 不需要修改或读取失败时返回 null（使用原文件）。
 */
export async function prepareForExcelJs(data: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    const entries = listZipEntries(data);
    if (!entries) return null;
    const replacements = new Map<string, Uint8Array>();
    const encoder = new TextEncoder();
    for (const path of entries.keys()) {
      if (/^xl\/drawings\/[^/]+\.xml$/i.test(path)) replacements.set(path, EMPTY_DRAWING);
      else if (/^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(path)) {
        const text = await readZipText(data, entries, path);
        if (!text) continue;
        const fixed = text
          .replace(/<Relationship\b[^>]*Type="[^"]*\/comments"[^>]*\/>/g, '')
          .replace(/Target="\/xl\//g, 'Target="../');
        if (fixed !== text) replacements.set(path, encoder.encode(fixed));
      }
    }
    if (!replacements.size) return null;
    return replaceZipEntries(data, entries, replacements);
  } catch {
    return null;
  }
}
