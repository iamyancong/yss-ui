/**
 * 条件格式（conditionalFormatting）：按单元格里保存的值计算，结果交给 ./apply.ts（颜色、字体）与 ./overlay.ts（数据条）。
 *
 * 支持：突出显示单元格规则（cellIs：大于、小于、介于、等于…）、文本包含 / 开头 / 结尾、空值 / 错误值、
 * 前 N 项 / 后 N 项、高于 / 低于平均值、重复值 / 唯一值、色阶（2 色、3 色）、数据条。
 * 不支持：公式规则（expression），这类规则按没有条件格式显示。
 */
import type { RawCell, SheetModel } from './model';
import { parseCellRef } from './model';
import { applyTint } from './apply';
import { child, childrenOf, parseXml, type XNode } from './xml';

export interface Dxf {
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
}

export interface CfStyle extends Dxf {}

export interface DataBar {
  row: number;
  col: number;
  /** 条的起点与终点（0~1，按单元格宽度） */
  start: number;
  end: number;
  color: string;
  negative: boolean;
}

export interface CfIcon {
  row: number;
  col: number;
  glyph: string;
  color: string;
}

export interface CfResult {
  styles: Map<string, CfStyle>;
  bars: DataBar[];
  icons: CfIcon[];
  /** 未支持的规则数 */
  unsupported: number;
}

/** Excel 默认的 64 色索引调色板（indexed 颜色） */
export const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

/** spreadsheetml 颜色（rgb / theme + tint / indexed） */
export function sheetColor(node: XNode | undefined | null, theme: string[]): string | undefined {
  if (!node || node.attrs.auto === '1') return undefined;
  const tint = Number(node.attrs.tint) || 0;
  let hex: string | undefined;
  if (node.attrs.rgb && /^[0-9a-f]{6,8}$/i.test(node.attrs.rgb)) hex = `#${node.attrs.rgb.slice(-6).toUpperCase()}`;
  else if (node.attrs.theme !== undefined) hex = theme[Number(node.attrs.theme)] || undefined;
  else if (node.attrs.indexed !== undefined) {
    const i = Number(node.attrs.indexed);
    hex = INDEXED[i] ? `#${INDEXED[i]}` : undefined;
  }
  return hex ? applyTint(hex, tint) : undefined;
}

/** styles.xml 的 dxfs（条件格式用的差异样式） */
export function parseDxfs(stylesXml: string | null, theme: string[]): Dxf[] {
  const block = /<dxfs\b[\s\S]*?<\/dxfs>/.exec(stylesXml ?? '')?.[0];
  const root = parseXml(block);
  return childrenOf(root, 'dxf').map(d => {
    const font = child(d, 'font');
    const fill = child(child(d, 'fill'), 'patternFill');
    const flag = (tag: string) => {
      const n = child(font, tag);
      return n ? n.attrs.val !== '0' && n.attrs.val !== 'false' : undefined;
    };
    const u = child(font, 'u');
    const out: Dxf = {
      color: sheetColor(child(font, 'color'), theme),
      bold: flag('b'),
      italic: flag('i'),
      strike: flag('strike'),
      underline: u ? u.attrs.val !== 'none' : undefined,
    };
    // 条件格式的纯色填充记在 bgColor（与单元格样式相反），没有时取 fgColor
    if (fill && fill.attrs.patternType !== 'none') out.bg = sheetColor(child(fill, 'bgColor'), theme) ?? sheetColor(child(fill, 'fgColor'), theme);
    return out;
  });
}

interface Range {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

const MAX_CF_CELLS = 200000;

function parseSqref(sqref: string): Range[] {
  return sqref
    .split(/\s+/)
    .filter(Boolean)
    .map(part => {
      const [a, b] = part.split(':');
      const p = parseCellRef(a);
      const q = b ? parseCellRef(b) : p;
      return p && q ? { r0: Math.min(p.row, q.row), c0: Math.min(p.col, q.col), r1: Math.max(p.row, q.row), c1: Math.max(p.col, q.col) } : null;
    })
    .filter((r): r is Range => !!r);
}

/** 公式里的常量或同表单元格引用 → 值；无法计算时返回 undefined */
function constant(formula: string | undefined, sheet: SheetModel): number | string | undefined {
  if (formula === undefined) return undefined;
  const f = formula.trim().replace(/^=/, '');
  if (/^"(.*)"$/s.test(f)) return f.slice(1, -1).replace(/""/g, '"');
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(f)) return Number(f);
  if (/^(TRUE|FALSE)$/i.test(f)) return /^TRUE$/i.test(f) ? 1 : 0;
  const ref = parseCellRef(f);
  if (ref) {
    const cell = sheet.cells.get(ref.row)?.get(ref.col);
    if (!cell || cell.t === 'z') return 0;
    if (cell.t === 'n') return cell.v as number;
    if (cell.t === 'b') return cell.v ? 1 : 0;
    if (cell.t === 's') return String(cell.v);
  }
  return undefined;
}

const cellValue = (c: RawCell | undefined): number | string | null => {
  if (!c || c.t === 'z') return null;
  if (c.t === 'n') return c.v as number;
  if (c.t === 'b') return c.v ? 1 : 0;
  if (c.t === 'e') return null;
  return String(c.v ?? '');
};

function compare(a: number | string | null, b: number | string): number {
  const x = a ?? 0;
  if (typeof x === 'number' && typeof b === 'number') return x - b;
  // Excel：文字比数字大；文字之间不区分大小写
  if (typeof x === 'number') return -1;
  if (typeof b === 'number') return 1;
  return x.toLowerCase().localeCompare(b.toLowerCase());
}

function cellIs(op: string, v: number | string | null, a: number | string, b?: number | string): boolean {
  switch (op) {
    case 'greaterThan':
      return compare(v, a) > 0;
    case 'lessThan':
      return compare(v, a) < 0;
    case 'greaterThanOrEqual':
      return compare(v, a) >= 0;
    case 'lessThanOrEqual':
      return compare(v, a) <= 0;
    case 'equal':
      return compare(v, a) === 0;
    case 'notEqual':
      return compare(v, a) !== 0;
    case 'between': {
      if (b === undefined) return false;
      const [lo, hi] = compare(a as never, b) <= 0 ? [a, b] : [b, a];
      return compare(v, lo) >= 0 && compare(v, hi) <= 0;
    }
    case 'notBetween': {
      if (b === undefined) return false;
      const [lo, hi] = compare(a as never, b) <= 0 ? [a, b] : [b, a];
      return compare(v, lo) < 0 || compare(v, hi) > 0;
    }
    default:
      return false;
  }
}

const hexRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
};
const mix = (a: string, b: string, t: number) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return `#${x
    .map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const k = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

function cfvoValue(node: XNode | undefined, sorted: number[], sheet: SheetModel, fallback: 'min' | 'max'): number {
  const type = node?.attrs.type ?? fallback;
  const raw = node?.attrs.val;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  switch (type) {
    case 'min':
    case 'autoMin':
      return type === 'autoMin' ? Math.min(0, min) : min;
    case 'max':
    case 'autoMax':
      return type === 'autoMax' ? Math.max(0, max) : max;
    case 'num': {
      const v = constant(raw, sheet);
      return typeof v === 'number' ? v : fallback === 'min' ? min : max;
    }
    case 'percent':
      return min + ((max - min) * (Number(raw) || 0)) / 100;
    case 'percentile':
      return percentile(sorted, (Number(raw) || 0) / 100);
    default:
      return fallback === 'min' ? min : max;
  }
}

/** 按工作表 XML（sheetData 之后的部分）计算条件格式 */
export function computeConditionalFormats(
  tail: string,
  sheet: SheetModel,
  dxfs: Dxf[],
  theme: string[],
  date1904 = false
): CfResult | undefined {
  if (!tail.includes('<conditionalFormatting')) return undefined;
  const styles = new Map<string, CfStyle>();
  const bars: DataBar[] = [];
  const icons: CfIcon[] = [];
  let unsupported = 0;
  type Rule = { priority: number; stop: boolean; node: XNode; ranges: Range[] };
  const rules: Rule[] = [];
  const blocks = tail.match(/<conditionalFormatting\b[\s\S]*?<\/conditionalFormatting>/g) ?? [];
  for (const b of blocks) {
    // 跳过 extLst 里的 x14 条件格式（只用于扩展数据条外观，主规则已在前面）
    const root = parseXml(b);
    if (!root || root.prefix) continue;
    const ranges = parseSqref(root.attrs.sqref ?? '');
    for (const r of childrenOf(root, 'cfRule')) {
      rules.push({ priority: Number(r.attrs.priority) || 1e9, stop: r.attrs.stopIfTrue === '1', node: r, ranges });
    }
  }
  rules.sort((a, b) => a.priority - b.priority);
  const done = new Set<string>();
  const set = (key: string, dxf: Dxf | undefined) => {
    if (!dxf || done.has(key)) return;
    const prev = styles.get(key) ?? {};
    const next: CfStyle = { ...prev };
    (Object.keys(dxf) as Array<keyof Dxf>).forEach(k => {
      if (dxf[k] !== undefined && next[k] === undefined) (next as Record<string, unknown>)[k] = dxf[k];
    });
    styles.set(key, next);
  };
  for (const rule of rules) {
    const { node } = rule;
    const type = node.attrs.type ?? '';
    const cells: Array<{ r: number; c: number; v: number | string | null; raw?: RawCell }> = [];
    let total = 0;
    for (const range of rule.ranges) {
      for (let r = range.r0; r <= range.r1; r++) {
        const row = sheet.cells.get(r);
        for (let c = range.c0; c <= range.c1; c++) {
          if (++total > MAX_CF_CELLS) break;
          const raw = row?.get(c);
          if (raw?.covered) continue;
          cells.push({ r, c, v: cellValue(raw), raw });
        }
      }
    }
    const dxf = node.attrs.dxfId !== undefined ? dxfs[Number(node.attrs.dxfId)] : undefined;
    const nums = cells.map(x => x.v).filter((v): v is number => typeof v === 'number');
    const sorted = [...nums].sort((a, b) => a - b);
    const formulas = childrenOf(node, 'formula').map(f => f.text);
    let hits: typeof cells = [];
    switch (type) {
      case 'cellIs': {
        const a = constant(formulas[0], sheet);
        const b = constant(formulas[1], sheet);
        if (a === undefined) {
          unsupported++;
          break;
        }
        hits = cells.filter(x => x.raw && x.raw.t !== 'z' && x.raw.t !== 'e' && cellIs(node.attrs.operator ?? 'equal', x.v, a, b));
        break;
      }
      case 'containsText':
      case 'notContainsText':
      case 'beginsWith':
      case 'endsWith': {
        const text = (node.attrs.text ?? '').toLowerCase();
        hits = cells.filter(x => {
          const s = x.v === null ? '' : String(x.v).toLowerCase();
          if (type === 'containsText') return s.includes(text);
          if (type === 'notContainsText') return !s.includes(text);
          if (type === 'beginsWith') return s.startsWith(text);
          return s.endsWith(text);
        });
        break;
      }
      case 'containsBlanks':
        hits = cells.filter(x => x.v === null && x.raw?.t !== 'e' || (typeof x.v === 'string' && !x.v.trim()));
        break;
      case 'notContainsBlanks':
        hits = cells.filter(x => !(x.v === null && x.raw?.t !== 'e') && !(typeof x.v === 'string' && !x.v.trim()));
        break;
      case 'containsErrors':
        hits = cells.filter(x => x.raw?.t === 'e');
        break;
      case 'notContainsErrors':
        hits = cells.filter(x => x.raw?.t !== 'e');
        break;
      case 'top10': {
        const rank = Number(node.attrs.rank) || 10;
        const n = node.attrs.percent === '1' ? Math.max(1, Math.floor((sorted.length * rank) / 100)) : rank;
        const bottom = node.attrs.bottom === '1';
        if (!sorted.length) break;
        const edge = bottom ? sorted[Math.min(n, sorted.length) - 1] : sorted[Math.max(0, sorted.length - n)];
        hits = cells.filter(x => typeof x.v === 'number' && (bottom ? x.v <= edge : x.v >= edge));
        break;
      }
      case 'aboveAverage': {
        if (!nums.length) break;
        const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
        const above = node.attrs.aboveAverage !== '0';
        const eq = node.attrs.equalAverage === '1';
        const sd = Number(node.attrs.stdDev) || 0;
        const dev = sd ? Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, nums.length - 1)) * sd : 0;
        const line = above ? avg + dev : avg - dev;
        hits = cells.filter(x => typeof x.v === 'number' && (above ? (eq ? x.v >= line : x.v > line) : eq ? x.v <= line : x.v < line));
        break;
      }
      case 'duplicateValues':
      case 'uniqueValues': {
        const counts = new Map<string, number>();
        const key = (v: number | string | null) => (typeof v === 'string' ? `s:${v.toLowerCase()}` : `n:${v}`);
        cells.forEach(x => x.v !== null && x.v !== '' && counts.set(key(x.v), (counts.get(key(x.v)) ?? 0) + 1));
        hits = cells.filter(x => x.v !== null && x.v !== '' && (type === 'duplicateValues' ? counts.get(key(x.v))! > 1 : counts.get(key(x.v)) === 1));
        break;
      }
      case 'colorScale': {
        const cs = child(node, 'colorScale');
        const cfvos = childrenOf(cs, 'cfvo');
        const colors = childrenOf(cs, 'color').map(c => sheetColor(c, theme) ?? '#FFFFFF');
        if (cfvos.length < 2 || colors.length < cfvos.length || !sorted.length) break;
        const stops = cfvos.map((v, i) => cfvoValue(v, sorted, sheet, i === 0 ? 'min' : 'max'));
        cells.forEach(x => {
          if (typeof x.v !== 'number') return;
          const key = `${x.r},${x.c}`;
          if (done.has(key) || styles.get(key)?.bg) return;
          let bg: string;
          if (x.v <= stops[0]) bg = colors[0];
          else if (x.v >= stops[stops.length - 1]) bg = colors[colors.length - 1];
          else {
            let i = 0;
            while (i < stops.length - 2 && x.v > stops[i + 1]) i++;
            const span = stops[i + 1] - stops[i];
            bg = mix(colors[i], colors[i + 1], span ? (x.v - stops[i]) / span : 0);
          }
          set(key, { bg });
        });
        continue;
      }
      case 'iconSet': {
        const set = child(node, 'iconSet');
        const name = set?.attrs.iconSet ?? '3Arrows';
        const glyphs = ICON_SETS[name] ?? ICON_SETS['3Arrows']!;
        const cfvos = childrenOf(set, 'cfvo');
        const reverse = set?.attrs.reverse === '1';
        if (!sorted.length) break;
        cells.forEach(x => {
          if (typeof x.v !== 'number') return;
          const idx = iconIndex(x.v, cfvos, sorted, sheet, glyphs.length);
          const g = glyphs[reverse ? glyphs.length - 1 - idx : idx];
          if (g) icons.push({ row: x.r, col: x.c, glyph: g.glyph, color: g.color });
        });
        continue;
      }
      case 'timePeriod': {
        const period = node.attrs.timePeriod ?? '';
        hits = cells.filter(x => typeof x.v === 'number' && inTimePeriod(Math.floor(x.v), period, date1904));
        break;
      }
      case 'dataBar': {
        const db = child(node, 'dataBar');
        const cfvos = childrenOf(db, 'cfvo');
        const color = sheetColor(child(db, 'color'), theme) ?? '#638EC6';
        if (!sorted.length) break;
        const lo = cfvoValue(cfvos[0], sorted, sheet, 'min');
        const hi = cfvoValue(cfvos[1], sorted, sheet, 'max');
        const minLen = (Number(db?.attrs.minLength ?? 10) || 0) / 100;
        const maxLen = (Number(db?.attrs.maxLength ?? 90) || 90) / 100;
        const hasNeg = lo < 0;
        const span = hasNeg ? Math.max(hi, 0) - lo : hi - lo;
        const axis = hasNeg && span ? -lo / span : 0;
        cells.forEach(x => {
          if (typeof x.v !== 'number') return;
          const v = Math.min(hi, Math.max(lo, x.v));
          if (hasNeg) {
            const len = span ? (Math.abs(v) / span) * maxLen : 0;
            const start = v < 0 ? axis * maxLen + (1 - maxLen) / 2 - len : axis * maxLen + (1 - maxLen) / 2;
            bars.push({ row: x.r, col: x.c, start: Math.max(0, start), end: Math.min(1, start + len), color: v < 0 ? '#FF0000' : color, negative: v < 0 });
          } else {
            const t = hi === lo ? 1 : (v - lo) / (hi - lo);
            bars.push({ row: x.r, col: x.c, start: 0, end: minLen + (maxLen - minLen) * t, color, negative: false });
          }
        });
        continue;
      }
      default:
        unsupported++;
        continue;
    }
    hits.forEach(x => {
      const key = `${x.r},${x.c}`;
      set(key, dxf);
      if (rule.stop) done.add(key);
    });
  }
  return styles.size || bars.length || icons.length || unsupported ? { styles, bars, icons, unsupported } : undefined;
}

const ICON_SETS: Record<string, Array<{ glyph: string; color: string }>> = {
  '3Arrows': [
    { glyph: '▼', color: '#C00000' },
    { glyph: '►', color: '#FFC000' },
    { glyph: '▲', color: '#006600' },
  ],
  '3ArrowsGray': [
    { glyph: '▼', color: '#7F7F7F' },
    { glyph: '►', color: '#A6A6A6' },
    { glyph: '▲', color: '#595959' },
  ],
  '3Flags': [
    { glyph: '⚑', color: '#C00000' },
    { glyph: '⚑', color: '#FFC000' },
    { glyph: '⚑', color: '#006600' },
  ],
  '3TrafficLights1': [
    { glyph: '●', color: '#C00000' },
    { glyph: '●', color: '#FFC000' },
    { glyph: '●', color: '#006600' },
  ],
  '3TrafficLights2': [
    { glyph: '●', color: '#C00000' },
    { glyph: '●', color: '#FFC000' },
    { glyph: '●', color: '#006600' },
  ],
  '3Signs': [
    { glyph: '◆', color: '#C00000' },
    { glyph: '▲', color: '#FFC000' },
    { glyph: '●', color: '#006600' },
  ],
  '3Symbols': [
    { glyph: '✕', color: '#C00000' },
    { glyph: '!', color: '#FFC000' },
    { glyph: '✓', color: '#006600' },
  ],
  '3Symbols2': [
    { glyph: '✕', color: '#C00000' },
    { glyph: '!', color: '#FFC000' },
    { glyph: '✓', color: '#006600' },
  ],
  '3Stars': [
    { glyph: '☆', color: '#A6A6A6' },
    { glyph: '★', color: '#FFC000' },
    { glyph: '★', color: '#FFC000' },
  ],
  '3Triangles': [
    { glyph: '▼', color: '#C00000' },
    { glyph: '▬', color: '#FFC000' },
    { glyph: '▲', color: '#006600' },
  ],
  '4Arrows': [
    { glyph: '▼', color: '#C00000' },
    { glyph: '▼', color: '#FFC000' },
    { glyph: '▲', color: '#92D050' },
    { glyph: '▲', color: '#006600' },
  ],
  '4ArrowsGray': [
    { glyph: '▼', color: '#7F7F7F' },
    { glyph: '▼', color: '#A6A6A6' },
    { glyph: '▲', color: '#A6A6A6' },
    { glyph: '▲', color: '#595959' },
  ],
  '4RedToBlack': [
    { glyph: '●', color: '#000000' },
    { glyph: '●', color: '#7F7F7F' },
    { glyph: '●', color: '#FF8080' },
    { glyph: '●', color: '#C00000' },
  ],
  '4Rating': [
    { glyph: '●', color: '#D9D9D9' },
    { glyph: '●', color: '#F4B183' },
    { glyph: '●', color: '#ED7D31' },
    { glyph: '●', color: '#C45911' },
  ],
  '4TrafficLights': [
    { glyph: '●', color: '#000000' },
    { glyph: '●', color: '#C00000' },
    { glyph: '●', color: '#FFC000' },
    { glyph: '●', color: '#006600' },
  ],
  '5Arrows': [
    { glyph: '▼', color: '#C00000' },
    { glyph: '▼', color: '#FFC000' },
    { glyph: '►', color: '#FFC000' },
    { glyph: '▲', color: '#92D050' },
    { glyph: '▲', color: '#006600' },
  ],
  '5ArrowsGray': [
    { glyph: '▼', color: '#7F7F7F' },
    { glyph: '▼', color: '#A6A6A6' },
    { glyph: '►', color: '#A6A6A6' },
    { glyph: '▲', color: '#A6A6A6' },
    { glyph: '▲', color: '#595959' },
  ],
  '5Rating': [
    { glyph: '●', color: '#D9D9D9' },
    { glyph: '●', color: '#F8CBAD' },
    { glyph: '●', color: '#F4B183' },
    { glyph: '●', color: '#ED7D31' },
    { glyph: '●', color: '#C45911' },
  ],
  '5Quarters': [
    { glyph: '○', color: '#7F7F7F' },
    { glyph: '◔', color: '#7F7F7F' },
    { glyph: '◑', color: '#7F7F7F' },
    { glyph: '◕', color: '#7F7F7F' },
    { glyph: '●', color: '#7F7F7F' },
  ],
  '5Boxes': [
    { glyph: '□', color: '#7F7F7F' },
    { glyph: '▤', color: '#7F7F7F' },
    { glyph: '▥', color: '#7F7F7F' },
    { glyph: '▦', color: '#7F7F7F' },
    { glyph: '■', color: '#7F7F7F' },
  ],
};

function iconIndex(v: number, cfvos: XNode[], sorted: number[], sheet: SheetModel, n: number): number {
  const stops = cfvos.length
    ? cfvos.map((c, i) => cfvoValue(c, sorted, sheet, i === 0 ? 'min' : 'max'))
    : Array.from({ length: n }, (_, i) => sorted[0] + ((sorted[sorted.length - 1] - sorted[0]) * i) / n);
  let idx = 0;
  for (let i = 1; i < Math.min(stops.length, n); i++) if (v >= stops[i]) idx = i;
  return Math.min(n - 1, idx);
}

function ymdFromSerial(serial: number, date1904: boolean) {
  const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
  const d = new Date(epoch + Math.floor(serial) * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), t: Math.floor(serial) };
}

function inTimePeriod(serial: number, period: string, date1904: boolean): boolean {
  const cell = ymdFromSerial(serial, date1904);
  const now = new Date();
  const today = ymdFromSerial(
    Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30)) / 86400000),
    date1904
  );
  const dow = (s: number) => {
    // 1899-12-30 是周六；用序列对 7 取模得到周日=0
    const epochDow = date1904 ? 5 : 6;
    return (s + epochDow) % 7;
  };
  const weekStart = (s: number) => s - dow(s);
  if (period === 'today') return cell.y === today.y && cell.m === today.m && cell.d === today.d;
  if (period === 'yesterday') return cell.t === today.t - 1;
  if (period === 'tomorrow') return cell.t === today.t + 1;
  if (period === 'last7Days') return cell.t <= today.t && cell.t >= today.t - 6;
  if (period === 'thisWeek') return weekStart(cell.t) === weekStart(today.t);
  if (period === 'lastWeek') return weekStart(cell.t) === weekStart(today.t) - 7;
  if (period === 'nextWeek') return weekStart(cell.t) === weekStart(today.t) + 7;
  if (period === 'thisMonth') return cell.y === today.y && cell.m === today.m;
  if (period === 'lastMonth') {
    const m = today.m === 0 ? 11 : today.m - 1;
    const y = today.m === 0 ? today.y - 1 : today.y;
    return cell.y === y && cell.m === m;
  }
  if (period === 'nextMonth') {
    const m = today.m === 11 ? 0 : today.m + 1;
    const y = today.m === 11 ? today.y + 1 : today.y;
    return cell.y === y && cell.m === m;
  }
  if (period === 'thisYear') return cell.y === today.y;
  if (period === 'lastYear') return cell.y === today.y - 1;
  if (period === 'nextYear') return cell.y === today.y + 1;
  return false;
}
