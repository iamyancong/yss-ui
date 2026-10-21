/**
 * 直接读取 xlsx 里的 XML，得到单元格原始值与显示信息（WorkbookModel）。
 *
 * @vue-office/excel 内部用 exceljs 解析，会丢掉或改写一部分信息：日期格式单元格里的文字结果变成
 * Invalid Date、公式结果直接显示为 Date.toString()、中文内置日期格式编号丢失、没有保存结果的公式
 * 与结果为空字符串的公式无法区分等。这里按文件原样读取，供 ./apply.ts 修正显示。
 *
 * 用正则顺序扫描，不建 DOM：10 万级单元格的工作表也只需几百毫秒。
 */
import { builtinFormat } from './builtin-formats';
import { createSheetModel, parseCellRef, setCell, type RawCell, type SheetModel, type WorkbookModel } from './model';
import { listZipEntries, readZipText } from './zip';

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
}

export function parseStyles(xml: string | null, locale: string): StylesInfo {
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
  return { formats, sizes, defaultFont: { name: base.name, sz: base.sz ?? 11 } };
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

export function parseSheet(
  xml: string,
  sheet: SheetModel,
  shared: string[],
  styles: StylesInfo
): SheetModel {
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

  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rowIndex = -1;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
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

  const tail = xml.slice(xml.lastIndexOf('</sheetData>') + 1 || 0);
  for (const m of tail.matchAll(/<mergeCell\b[^>]*>/g)) {
    const [a, b] = (attr(m[0], 'ref') ?? '').split(':');
    const p = parseCellRef(a ?? '');
    const q = parseCellRef(b ?? a ?? '');
    if (p && q) sheet.merges.push({ r0: Math.min(p.row, q.row), c0: Math.min(p.col, q.col), r1: Math.max(p.row, q.row), c1: Math.max(p.col, q.col) });
  }
  return sheet;
}

export interface ParseXlsxOptions {
  locale?: string;
  signal?: AbortSignal;
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
  const styles = parseStyles(stylesXml, locale);
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const pr = /<workbookPr\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const calc = /<calcPr\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const viewTag = /<workbookView\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const model: WorkbookModel = {
    date1904: isTrue(attr(pr, 'date1904')),
    activeTab: Number(attr(viewTag, 'activeTab') ?? 0) || 0,
    fullCalcOnLoad: isTrue(attr(calc, 'fullCalcOnLoad')) || !attr(calc, 'calcId'),
    sheets: [],
    themeColors: parseThemeColors(themeXml),
    defaultFont: styles.defaultFont,
  };
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    if (options.signal?.aborted) return null;
    const name = attr(m[0], 'name') ?? '';
    const state = (attr(m[0], 'state') ?? 'visible') as SheetModel['state'];
    const path = targets.get(attr(m[0], 'r:id') ?? '');
    const sheet = createSheetModel(name, state === 'hidden' || state === 'veryHidden' ? state : 'visible');
    const xml = path ? await read(path) : null;
    if (xml) parseSheet(xml, sheet, shared, styles);
    model.sheets.push(sheet);
  }
  return model;
}
