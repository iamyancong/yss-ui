/**
 * 按 Excel 数字格式把单元格原始值转成显示文本。
 *
 * 格式解析交给 numfmt（MIT，按需加载）：支持内置与自定义格式、日期时间（含中文年月日、[h]:mm 累计时长）、
 * 百分比、千分位、货币、科学计数、分数、条件区段（[>=100]）、颜色（[Red]）、文本区段（@）。
 * numfmt 没装或加载失败时退回内置的简化实现（常规数字、小数位、百分比、千分位、日期），保证不再显示
 * 原始序列号或 Date 对象。
 */
import type { RawCell } from './model';

export type CellKind = 'number' | 'text' | 'bool' | 'error' | 'empty';

export interface FormattedCell {
  text: string;
  kind: CellKind;
  /** 数字格式指定的颜色，如 [Red] */
  color?: string;
}

export interface CellFormatter {
  format(cell: RawCell): FormattedCell;
  /** 是否使用了完整的格式库（false 表示退回简化实现） */
  readonly full: boolean;
}

export interface NumfmtLike {
  format(pattern: string, value: unknown, options?: Record<string, unknown>): string;
  formatColor(pattern: string, value: unknown, options?: Record<string, unknown>): string | number | undefined;
}

export interface FormatterOptions {
  /** 显示语言，影响月份 / 星期 / 上午下午的写法与内置日期格式 */
  locale?: string;
  /** 工作簿使用 1904 日期系统 */
  date1904?: boolean;
  /** 测试用：替换 numfmt 的加载 */
  loadNumfmt?: () => Promise<unknown>;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  blue: '#0000FF',
  cyan: '#00FFFF',
  green: '#00FF00',
  magenta: '#FF00FF',
  red: '#FF0000',
  white: '#FFFFFF',
  yellow: '#FFFF00',
};

const isZh = (locale: string) => locale.toLowerCase().startsWith('zh');

/** 把 Excel 写法里 numfmt 不认识的部分换成等价写法 */
export function normalizeFormatCode(code: string, locale = 'zh-CN'): string {
  let out = code;
  // 中文 Excel 的上午/下午标记
  out = out.replace(/上午\/下午/g, 'AM/PM');
  // 系统长日期、长时间（随操作系统地区显示）
  if (/\[\$-(?:F800|x-sysdate)\]/i.test(out)) return isZh(locale) ? 'yyyy"年"m"月"d"日"' : 'dddd, mmmm d, yyyy';
  if (/\[\$-(?:F400|x-systime)\]/i.test(out)) return isZh(locale) ? 'h:mm:ss' : 'h:mm:ss AM/PM';
  return out;
}

const EXCEL_EPOCH_OFFSET_1904 = 1462;

/** Excel 「常规」格式：整数原样显示，其他最多约 11 个字符，过大过小用科学计数（numfmt 不可用时使用） */
export function formatGeneralNumber(value: number): string {
  if (!Number.isFinite(value)) return '#NUM!';
  if (value === 0) return '0';
  if (Number.isInteger(value) && Math.abs(value) < 1e11) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e11 || abs < 1e-9) {
    const [m, e] = value.toExponential(5).split('e');
    const exp = Number(e);
    return `${m.replace(/\.?0+$/, '')}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  const intDigits = Math.max(1, Math.floor(Math.log10(abs)) + 1);
  const fixed = value.toFixed(Math.max(0, 10 - intDigits));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

const QUOTED = /"[^"]*"|\\.|\[[^\]]*\]/g;

/** 简化实现：numfmt 不可用时使用 */
function basicFormat(code: string, value: number): string {
  const section = code.split(';')[value < 0 ? 1 : 0] ?? code.split(';')[0];
  const bare = section.replace(QUOTED, '');
  if (/^general$/i.test(code.trim()) || !bare.trim()) return formatGeneralNumber(value);
  if (/[yd]/i.test(bare) || /h/i.test(bare) || /s/i.test(bare)) {
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '######';
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (/[yd]/i.test(bare)) return /h/i.test(bare) ? `${date} ${time}` : date;
    return time;
  }
  const percent = bare.includes('%');
  const v = Math.abs(percent ? value * 100 : value);
  const decimals = /\.([0#?]+)/.exec(bare)?.[1].length ?? 0;
  let text = v.toFixed(decimals);
  if (bare.includes(',')) {
    const [i, d] = text.split('.');
    text = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? `.${d}` : '');
  }
  const negative = value < 0 && code.split(';').length < 2;
  return `${negative ? '-' : ''}${text}${percent ? '%' : ''}`;
}

/** numfmt 遇到无效格式时输出的标记 */
const INVALID = '\u0000invalid';

const isGeneral = (code: string) => !code || /^general$/i.test(code) || code === '@';

/** 加载 numfmt；没装或加载失败时返回 null（使用简化实现），不抛错 */
export async function loadNumfmt(loader?: () => Promise<unknown>): Promise<NumfmtLike | null> {
  try {
    const mod = (await (loader ? loader() : import('numfmt'))) as (NumfmtLike & { default?: NumfmtLike }) | null;
    const candidate = mod && typeof mod.format === 'function' ? mod : mod?.default;
    return candidate && typeof candidate.format === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

/** 加载格式化器 */
export async function loadCellFormatter(options: FormatterOptions = {}): Promise<CellFormatter> {
  return createCellFormatter(await loadNumfmt(options.loadNumfmt), options);
}

export function createCellFormatter(
  lib: NumfmtLike | null,
  { locale = 'zh-CN', date1904 = false }: { locale?: string; date1904?: boolean } = {}
): CellFormatter {
  const codes = new Map<string, string>();
  // 格式里直接写的 AM/PM 按原文显示（Excel / WPS 中文环境也显示 AM / PM）；上午/下午 写法才显示中文
  const latinMeridiem = new Set<string>();
  const normalized = (code: string) => {
    let n = codes.get(code);
    if (n === undefined) {
      codes.set(code, (n = normalizeFormatCode(code, locale)));
      if (/AM\/PM|A\/P/i.test(code) && !/上午|下午/.test(code)) latinMeridiem.add(n);
    }
    return n;
  };
  const dateCodes = new Map<string, boolean>();
  const isDateCode = (code: string) => {
    let d = dateCodes.get(code);
    if (d === undefined) dateCodes.set(code, (d = looksLikeDate(code)));
    return d;
  };
  // 日期列的值大量重复（同一天），缓存格式化结果；数量有上限，避免大表占用过多内存
  const dateTexts = new Map<string, string>();
  const numfmtOptions = { locale, dateSpanLarge: false, dateErrorThrows: false, throws: false, invalid: INVALID };
  const latinOptions = { ...numfmtOptions, locale: 'en-US' };
  const colorOf = (code: string, value: unknown): string | undefined => {
    if (!lib || !code.includes('[')) return undefined;
    try {
      const c = lib.formatColor(code, value, { throws: false });
      if (typeof c !== 'string') return undefined;
      return NAMED_COLORS[c.toLowerCase()] ?? (c.startsWith('#') ? c : undefined);
    } catch {
      return undefined;
    }
  };

  const formatNumber = (code: string, value: number): string => {
    if (isGeneral(code)) {
      if (Number.isInteger(value) && Math.abs(value) < 1e11) return String(value);
      if (lib) {
        try {
          return lib.format('General', value, numfmtOptions);
        } catch {
          // 退回简化实现
        }
      }
      return formatGeneralNumber(value);
    }
    const isDate = isDateCode(code);
    if (isDate) {
      const key = code + '\u0000' + value;
      const hit = dateTexts.get(key);
      if (hit !== undefined) return hit;
      const text = formatWith(code, value + (date1904 ? EXCEL_EPOCH_OFFSET_1904 : 0));
      if (dateTexts.size < 20000) dateTexts.set(key, text);
      return text;
    }
    // 1904 日期系统只影响日期显示，普通数字不变。
    // 非日期数字按 Excel 的方式四舍五入：Excel 先取 15 位有效数字再舍入（-1.005 显示为 -1.01），
    // 二进制浮点里 -1.005 略小于真实值，向远离 0 的方向挪一个极小量后再交给 numfmt
    return formatWith(code, value * (1 + 4 * Number.EPSILON));
  };
  const formatWith = (code: string, v: number): string => {
    if (lib) {
      try {
        const out = lib.format(code, v, latinMeridiem.has(code) ? latinOptions : numfmtOptions);
        if (out !== INVALID) return out;
      } catch {
        // 格式代码无效时退回简化实现
      }
    }
    return basicFormat(code, v);
  };

  return {
    full: !!lib,
    format(cell) {
      const code = normalized(cell.fmt || 'General');
      switch (cell.t) {
        case 'n': {
          const value = cell.v as number;
          return { text: formatNumber(code, value), kind: 'number', color: colorOf(code, value) };
        }
        case 's': {
          const text = String(cell.v ?? '');
          if (isGeneral(code) || !lib || !/@|;.*;.*;/.test(code)) return { text, kind: 'text' };
          try {
            const out = lib.format(code, text, numfmtOptions);
            return { text: out === INVALID ? text : out, kind: 'text', color: colorOf(code, text) };
          } catch {
            return { text, kind: 'text' };
          }
        }
        case 'b':
          return { text: cell.v ? 'TRUE' : 'FALSE', kind: 'bool' };
        case 'e':
          return { text: String(cell.v ?? '#N/A'), kind: 'error' };
        default:
          return { text: '', kind: 'empty' };
      }
    },
  };
}

/** 格式里是否有日期 / 时间占位（去掉引号文字、转义和 [..] 后判断） */
export function looksLikeDate(code: string): boolean {
  const bare = code
    .split(';')[0]
    .replace(/\[(?:h+|m+|s+)\]/gi, 'h')
    .replace(QUOTED, '');
  return /[ymdhs]/i.test(bare) && !/^[#0?,.\s%E+-]*$/i.test(bare);
}
