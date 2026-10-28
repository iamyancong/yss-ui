/**
 * 读取老版 .xls（BIFF8，Excel 97-2003）里的单元格值、数字格式与显示信息，得到 WorkbookModel。
 *
 * @vue-office/excel 打开 xls 时先用内置的 SheetJS 转成 xlsx 再交给 exceljs，转换时数字格式与公式结果都会丢失
 * （日期显示为 46287 这样的序列号、45% 显示为 0.45、公式单元格为空）。这里直接读取 BIFF 记录拿回这些信息。
 * SheetJS 社区版转换时还会丢掉全部样式（边框、填充、字体、对齐），这里一并从 FONT / XF / PALETTE 记录读取。
 * 只读取需要的记录，不解析公式本身；BIFF5（Excel 95）及更早版本返回 null，按 exceljs 的数据显示。
 */
import { builtinFormat } from './builtin-formats';
import { INDEXED } from './cf';
import {
  createSheetModel,
  setCell,
  type BorderSide,
  type CellStyleModel,
  type RawCell,
  type SheetModel,
  type WorkbookModel,
} from './model';

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

/** 读取复合文档（CFB）里的指定流 */
export function readCompoundStream(data: ArrayBuffer, names: string[]): Uint8Array | null {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  if (data.byteLength < 512 || view.getUint32(0, true) !== 0xe011cfd0 || view.getUint32(4, true) !== 0xe11ab1a1) return null;
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const firstDir = view.getUint32(0x30, true);
  const cutoff = view.getUint32(0x38, true);
  const firstMiniFat = view.getUint32(0x3c, true);
  const firstDifat = view.getUint32(0x44, true);
  const sectorOffset = (n: number) => (n + 1) * sectorSize;
  const maxSectors = Math.floor(data.byteLength / sectorSize);

  // DIFAT → FAT
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getUint32(0x4c + i * 4, true);
    if (s !== FREESECT && s !== ENDOFCHAIN) fatSectors.push(s);
  }
  for (let s = firstDifat, guard = 0; s !== ENDOFCHAIN && s !== FREESECT && guard < maxSectors; guard++) {
    const at = sectorOffset(s);
    if (at + sectorSize > data.byteLength) break;
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const v = view.getUint32(at + i * 4, true);
      if (v !== FREESECT && v !== ENDOFCHAIN) fatSectors.push(v);
    }
    s = view.getUint32(at + per * 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const at = sectorOffset(s);
    if (at + sectorSize > data.byteLength) continue;
    for (let i = 0; i < sectorSize / 4; i++) fat.push(view.getUint32(at + i * 4, true));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== ENDOFCHAIN && s !== FREESECT && s < table.length && !seen.has(s); s = table[s]) {
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const s of chain(start, fat)) {
      const at = sectorOffset(s);
      const n = Math.min(sectorSize, size - pos, data.byteLength - at);
      if (n <= 0) break;
      out.set(bytes.subarray(at, at + n), pos);
      pos += n;
      if (pos >= size) break;
    }
    return out.subarray(0, pos);
  };

  // 目录
  const dirSectors = chain(firstDir, fat);
  const dir = new Uint8Array(dirSectors.length * sectorSize);
  dirSectors.forEach((s, i) => dir.set(bytes.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), i * sectorSize));
  const dv = new DataView(dir.buffer);
  const entries: Array<{ name: string; type: number; start: number; size: number }> = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameLen = dv.getUint16(at + 0x40, true);
    let name = '';
    for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(dv.getUint16(at + i, true));
    entries.push({ name, type: dir[at + 0x42], start: dv.getUint32(at + 0x74, true), size: dv.getUint32(at + 0x78, true) });
  }
  const root = entries.find(e => e.type === 5);
  const target = names.map(n => entries.find(e => e.type === 2 && e.name === n)).find(Boolean);
  if (!target || !root) return null;
  if (target.size >= cutoff) return readChain(target.start, target.size);

  // 小于 4096 字节的流放在迷你流里
  const miniFat: number[] = [];
  for (const s of chain(firstMiniFat, fat)) {
    const at = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4 && at + i * 4 + 4 <= data.byteLength; i++) miniFat.push(view.getUint32(at + i * 4, true));
  }
  const ministream = readChain(root.start, root.size);
  const out = new Uint8Array(target.size);
  let pos = 0;
  for (const s of chain(target.start, miniFat)) {
    const at = s * miniSectorSize;
    const n = Math.min(miniSectorSize, target.size - pos, ministream.length - at);
    if (n <= 0) break;
    out.set(ministream.subarray(at, at + n), pos);
    pos += n;
  }
  return out.subarray(0, pos);
}

interface BiffRecord {
  type: number;
  offset: number;
  data: Uint8Array;
}

function* records(stream: Uint8Array, start = 0): Generator<BiffRecord> {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  let at = start;
  while (at + 4 <= stream.length) {
    const type = view.getUint16(at, true);
    const len = view.getUint16(at + 2, true);
    const end = Math.min(stream.length, at + 4 + len);
    yield { type, offset: at, data: stream.subarray(at + 4, end) };
    at = end;
  }
}

const u16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8);
const u32 = (d: Uint8Array, at: number) => (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
const f64 = (d: Uint8Array, at: number) => new DataView(d.buffer, d.byteOffset + at, 8).getFloat64(0, true);

const latin1 = new TextDecoder('latin1');
const utf16 = new TextDecoder('utf-16le');

/** 跨 CONTINUE 记录读取字符串（SST、STRING 记录） */
class SegmentReader {
  private seg = 0;
  private pos = 0;
  constructor(private readonly segments: Uint8Array[]) {}
  private get cur() {
    return this.segments[this.seg];
  }
  private ensure() {
    while (this.cur && this.pos >= this.cur.length && this.seg < this.segments.length - 1) {
      this.seg++;
      this.pos = 0;
    }
  }
  get done() {
    this.ensure();
    return !this.cur || this.pos >= this.cur.length;
  }
  u8() {
    this.ensure();
    return this.cur?.[this.pos++] ?? 0;
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    let left = n;
    while (left > 0 && !this.done) {
      const take = Math.min(left, this.cur.length - this.pos);
      this.pos += take;
      left -= take;
    }
  }
  /** 读取 cch 个字符；跨记录时新记录开头有一个新的编码标志字节 */
  chars(cch: number, highByte: boolean): string {
    let out = '';
    let left = cch;
    let wide = highByte;
    while (left > 0 && !this.done) {
      const avail = this.cur.length - this.pos;
      const size = wide ? 2 : 1;
      const take = Math.min(left, Math.floor(avail / size));
      if (take > 0) {
        const slice = this.cur.subarray(this.pos, this.pos + take * size);
        out += wide ? utf16.decode(slice) : latin1.decode(slice);
        this.pos += take * size;
        left -= take;
      }
      if (left > 0) {
        this.seg++;
        this.pos = 0;
        if (!this.cur) break;
        wide = (this.u8() & 1) === 1;
      }
    }
    return out;
  }
  /** XLUnicodeRichExtendedString */
  richString(): string {
    const cch = this.u16();
    const flags = this.u8();
    const runs = flags & 0x08 ? this.u16() : 0;
    const ext = flags & 0x04 ? this.u32() : 0;
    const text = this.chars(cch, (flags & 1) === 1);
    this.skip(runs * 4 + ext);
    return text;
  }
}

/** XLUnicodeString（单条记录内） */
const xlString = (d: Uint8Array, at: number, cchBytes: 1 | 2 = 2) => {
  const cch = cchBytes === 1 ? d[at] : u16(d, at);
  const flags = d[at + cchBytes];
  const start = at + cchBytes + 1;
  return flags & 1 ? utf16.decode(d.subarray(start, start + cch * 2)) : latin1.decode(d.subarray(start, start + cch));
};

const RK = (rk: number) => {
  let v: number;
  if (rk & 2) v = rk >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
};

const ERRORS: Record<number, string> = {
  0x00: '#NULL!',
  0x07: '#DIV/0!',
  0x0f: '#VALUE!',
  0x17: '#REF!',
  0x1d: '#NAME?',
  0x24: '#NUM!',
  0x2a: '#N/A',
  0x2b: '#GETTING_DATA',
};

interface BiffFont {
  sz: number;
  name: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: boolean;
  color: number;
}

interface BiffXf {
  font: number;
  fmt: number;
  /** 水平对齐 alc、垂直对齐 alcV、自动换行 */
  alc: number;
  alcV: number;
  wrap: boolean;
  /** 左右上下边框线型（dgLeft…）与颜色序号 */
  dg: [number, number, number, number];
  icv: [number, number, number, number];
  /** 填充图案、前景色、背景色 */
  fls: number;
  fore: number;
  back: number;
}

/** BIFF 线型 → x-spreadsheet 线型（它只认 thin / medium / thick / dashed / dotted / double） */
const BORDER_STYLES = [
  '',
  'thin',
  'medium',
  'dashed',
  'dotted',
  'thick',
  'double',
  'thin', // hair
  'medium', // mediumDashed
  'dashed', // dashDot
  'medium', // mediumDashDot
  'dashed', // dashDotDot
  'medium', // mediumDashDotDot
  'medium', // slantDashDot
];
const H_ALIGN = ['general', 'left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'];
const V_ALIGN = ['top', 'middle', 'bottom', 'justify', 'distributed'];
/** 非实心图案按前景色占比与背景色混合（50% 灰、75% 灰、25% 灰、条纹…、12.5% 灰、6.25% 灰） */
const PATTERN_DENSITY = [
  0, 1, 0.5, 0.75, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.125, 0.0625,
];

const mix = (a: string, b: string, t: number) => {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map(i =>
      Math.round(ch(a, i) * t + ch(b, i) * (1 - t))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase();
};

/** 把 XF 记录转成单元格样式 */
function xfToStyle(
  xf: BiffXf,
  font: BiffFont | undefined,
  color: (icv: number, fallback: string) => string
): CellStyleModel {
  const style: CellStyleModel = {};
  if (font) {
    style.font = { name: font.name || undefined, bold: font.bold || undefined, italic: font.italic || undefined };
    if (font.underline) style.underline = true;
    if (font.strike) style.strike = true;
    const fc = color(font.color, '#000000');
    if (fc !== '#000000') style.color = fc;
  }
  if (xf.alc) style.align = H_ALIGN[xf.alc] ?? 'general';
  style.valign = V_ALIGN[xf.alcV] ?? 'bottom';
  if (xf.wrap) style.textwrap = true;
  const sides: BorderSide[] = ['left', 'right', 'top', 'bottom'];
  sides.forEach((side, i) => {
    const line = BORDER_STYLES[xf.dg[i]];
    if (line) (style.border ??= {})[side] = [line, color(xf.icv[i], '#000000')];
  });
  if (xf.fls) {
    const fore = color(xf.fore, '#000000');
    const back = color(xf.back, '#FFFFFF');
    style.bgcolor = xf.fls === 1 ? fore : mix(fore, back, PATTERN_DENSITY[xf.fls] ?? 0.5);
  }
  return style;
}

/** 解析 BIFF8 xls；不是 BIFF8 或解析失败时返回 null */
export function parseXlsModel(data: ArrayBuffer, { locale = 'zh-CN' }: { locale?: string } = {}): WorkbookModel | null {
  const stream = readCompoundStream(data, ['Workbook', 'Book']);
  if (!stream) return null;
  const first = records(stream).next().value as BiffRecord | undefined;
  // BOF：BIFF8 版本号 0x0600
  if (!first || first.type !== 0x0809 || u16(first.data, 0) !== 0x0600) return null;

  const formats = new Map<number, string>();
  const fonts: BiffFont[] = [];
  const xfs: BiffXf[] = [];
  const palette = INDEXED.map(c => `#${c}`);
  const sheets: Array<{ name: string; state: SheetModel['state']; offset: number }> = [];
  const sst: string[] = [];
  let date1904 = false;
  let activeTab = 0;

  const iter = records(stream);
  let pendingSst: Uint8Array[] | null = null;
  const flushSst = () => {
    if (!pendingSst) return;
    const reader = new SegmentReader(pendingSst);
    reader.u32();
    const unique = reader.u32();
    for (let i = 0; i < unique && !reader.done; i++) sst.push(reader.richString());
    pendingSst = null;
  };
  for (const rec of iter) {
    if (rec.type === 0x003c && pendingSst) {
      pendingSst.push(rec.data);
      continue;
    }
    flushSst();
    const d = rec.data;
    switch (rec.type) {
      case 0x000a: // EOF（工作簿全局部分结束）
        break;
      case 0x0022:
        date1904 = u16(d, 0) === 1;
        break;
      case 0x003d:
        activeTab = u16(d, 10);
        break;
      case 0x0031: {
        // FONT
        const grbit = u16(d, 2);
        fonts.push({
          sz: u16(d, 0) / 20,
          italic: (grbit & 0x02) !== 0,
          strike: (grbit & 0x08) !== 0,
          color: u16(d, 4),
          bold: u16(d, 6) >= 700,
          underline: d[10] !== 0,
          name: d.length > 15 ? xlString(d, 14, 1) : '',
        });
        break;
      }
      case 0x0092: {
        // PALETTE：自定义的 8~63 号颜色
        const n = Math.min(u16(d, 0), 56);
        for (let i = 0; i < n; i++) {
          const at = 2 + i * 4;
          const rgb = [d[at], d[at + 1], d[at + 2]].map(v => v.toString(16).padStart(2, '0'));
          palette[8 + i] = `#${rgb.join('')}`.toUpperCase();
        }
        break;
      }
      case 0x041e:
        formats.set(u16(d, 0), xlString(d, 2));
        break;
      case 0x00e0: {
        // XF
        const b1 = u32(d, 10);
        const b2 = u32(d, 14);
        const fill = u16(d, 18);
        xfs.push({
          font: u16(d, 0),
          fmt: u16(d, 2),
          alc: d[6] & 0x07,
          wrap: (d[6] & 0x08) !== 0,
          alcV: (d[6] >> 4) & 0x07,
          dg: [b1 & 0x0f, (b1 >> 4) & 0x0f, (b1 >> 8) & 0x0f, (b1 >> 12) & 0x0f],
          icv: [(b1 >>> 16) & 0x7f, (b1 >>> 23) & 0x7f, b2 & 0x7f, (b2 >>> 7) & 0x7f],
          fls: (b2 >>> 26) & 0x3f,
          fore: fill & 0x7f,
          back: (fill >> 7) & 0x7f,
        });
        break;
      }
      case 0x0085: {
        const dt = d[5];
        if (dt === 0) {
          const hs = d[4] & 3;
          sheets.push({ name: xlString(d, 6, 1), state: hs === 1 ? 'hidden' : hs === 2 ? 'veryHidden' : 'visible', offset: u32(d, 0) });
        }
        break;
      }
      case 0x00fc:
        pendingSst = [d];
        break;
      default:
        break;
    }
    if (rec.type === 0x000a) break;
  }
  flushSst();

  // FONT 序号 4 不存在（BIFF 的历史约定），4 以后的序号要减 1
  const fontAt = (i: number): BiffFont | undefined => fonts[i >= 4 ? i - 1 : i];
  const fmtCode = (ifmt: number) => formats.get(ifmt) ?? builtinFormat(ifmt, locale);
  const xfFmt = xfs.map(x => fmtCode(x.fmt));
  const xfSize = xfs.map(x => fontAt(x.font)?.sz);
  // 64 / 0x7FFF 等为系统颜色（窗口前景、自动），按默认色处理
  const color = (icv: number, fallback: string) => (icv < 64 ? (palette[icv] ?? fallback) : fallback);
  const cellStyles = xfs.map(x => xfToStyle(x, fontAt(x.font), color));
  /** 空白单元格只有设置了边框或填充时才需要显示 */
  const visibleBlank = (ixfe: number) => !!(cellStyles[ixfe]?.border || cellStyles[ixfe]?.bgcolor);
  const model: WorkbookModel = {
    date1904,
    activeTab,
    fullCalcOnLoad: false,
    sheets: [],
    themeColors: [],
    defaultFont: { name: fonts[0]?.name || undefined, sz: fonts[0]?.sz || 10 },
    cellStyles,
  };

  for (const info of sheets) {
    const sheet = createSheetModel(info.name, info.state);
    const cell = (ixfe: number, t: RawCell['t'], v: RawCell['v'], f = false): RawCell => {
      const c: RawCell = { t, v, fmt: xfFmt[ixfe] ?? 'General', sz: xfSize[ixfe] };
      if (cellStyles[ixfe]) c.style = ixfe;
      if (f) {
        c.f = true;
        sheet.formulaCells++;
      }
      return c;
    };
    let pendingString: { row: number; col: number; ixfe: number } | null = null;
    let frozen = false;
    for (const rec of records(stream, info.offset)) {
      const d = rec.data;
      if (rec.type === 0x000a) break;
      if (pendingString && rec.type === 0x0207) {
        setCell(sheet, pendingString.row, pendingString.col, cell(pendingString.ixfe, 's', xlString(d, 0), true));
        pendingString = null;
        continue;
      }
      switch (rec.type) {
        case 0x0203: // NUMBER
          setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), 'n', f64(d, 6)));
          break;
        case 0x027e: // RK
          setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), 'n', RK(u32(d, 6))));
          break;
        case 0x00bd: {
          // MULRK
          const row = u16(d, 0);
          const colFirst = u16(d, 2);
          const n = (d.length - 6) / 6;
          for (let i = 0; i < n; i++) setCell(sheet, row, colFirst + i, cell(u16(d, 4 + i * 6), 'n', RK(u32(d, 6 + i * 6))));
          break;
        }
        case 0x0201: // BLANK
          if (visibleBlank(u16(d, 4))) setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), 'z', null));
          break;
        case 0x00be: {
          // MULBLANK
          const row = u16(d, 0);
          const colFirst = u16(d, 2);
          const n = (d.length - 6) / 2;
          for (let i = 0; i < n; i++) {
            const ixfe = u16(d, 4 + i * 2);
            if (visibleBlank(ixfe)) setCell(sheet, row, colFirst + i, cell(ixfe, 'z', null));
          }
          break;
        }
        case 0x00fd: // LABELSST
          setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), 's', sst[u32(d, 6)] ?? ''));
          break;
        case 0x0204: // LABEL
          setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), 's', xlString(d, 6)));
          break;
        case 0x0205: {
          // BOOLERR
          const isError = d[7] === 1;
          setCell(sheet, u16(d, 0), u16(d, 2), cell(u16(d, 4), isError ? 'e' : 'b', isError ? (ERRORS[d[6]] ?? '#N/A') : d[6] === 1));
          break;
        }
        case 0x0006: {
          // FORMULA：只读取保存的计算结果
          const row = u16(d, 0);
          const col = u16(d, 2);
          const ixfe = u16(d, 4);
          if (d[12] === 0xff && d[13] === 0xff) {
            const kind = d[6];
            if (kind === 0) pendingString = { row, col, ixfe };
            else if (kind === 1) setCell(sheet, row, col, cell(ixfe, 'b', d[8] === 1, true));
            else if (kind === 2) setCell(sheet, row, col, cell(ixfe, 'e', ERRORS[d[8]] ?? '#N/A', true));
            else setCell(sheet, row, col, cell(ixfe, 's', '', true));
          } else setCell(sheet, row, col, cell(ixfe, 'n', f64(d, 6), true));
          break;
        }
        case 0x0208: {
          // ROW
          const row = u16(d, 0);
          if (u16(d, 12) & 0x20) sheet.hiddenRows.add(row);
          sheet.rowHeights.set(row, (u16(d, 6) & 0x7fff) / 20);
          break;
        }
        case 0x007d: {
          // COLINFO
          const width = u16(d, 4) / 256;
          const hidden = (u16(d, 8) & 1) === 1;
          for (let c = u16(d, 0); c <= Math.min(u16(d, 2), 16383); c++) {
            if (width > 0) sheet.colWidths.set(c, width);
            if (hidden) sheet.hiddenCols.add(c);
          }
          break;
        }
        case 0x0055: // DEFCOLWIDTH
          sheet.baseColWidth = u16(d, 0);
          break;
        case 0x0225: // DEFAULTROWHEIGHT
          sheet.defaultRowHeight = u16(d, 2) / 20;
          break;
        case 0x00e5: {
          // MERGEDCELLS
          const n = u16(d, 0);
          for (let i = 0; i < n; i++) {
            const at = 2 + i * 8;
            sheet.merges.push({ r0: u16(d, at), r1: u16(d, at + 2), c0: u16(d, at + 4), c1: u16(d, at + 6) });
          }
          break;
        }
        case 0x023e: {
          // WINDOW2
          const grbit = u16(d, 0);
          frozen = (grbit & 0x0008) !== 0;
          if ((grbit & 0x0002) === 0) sheet.showGridLines = false;
          break;
        }
        case 0x0041: // PANE
          if (frozen && (u16(d, 0) || u16(d, 2))) sheet.freeze = { cols: u16(d, 0), rows: u16(d, 2) };
          break;
        default:
          break;
      }
    }
    model.sheets.push(sheet);
  }
  return model;
}
