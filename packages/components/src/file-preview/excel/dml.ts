/**
 * DrawingML 通用部分：颜色（含主题色与亮度、透明度调整）、填充、线条、文字样式。
 * 图表（./chart.ts）与绘图对象（./drawing.ts）共用。
 */
import { child, numVal, type XNode } from './xml';

/** 主题信息：颜色（按 lt1、dk1、lt2、dk2、accent1~6、hlink、folHlink 排列）与字体 */
export interface ThemeInfo {
  colors: string[];
  /** 正文字体（minor）：西文、东亚 */
  minorLatin?: string;
  minorEa?: string;
  majorLatin?: string;
  majorEa?: string;
}

const SCHEME_INDEX: Record<string, number> = {
  lt1: 0,
  bg1: 0,
  dk1: 1,
  tx1: 1,
  lt2: 2,
  bg2: 2,
  dk2: 3,
  tx2: 3,
  accent1: 4,
  accent2: 5,
  accent3: 6,
  accent4: 7,
  accent5: 8,
  accent6: 9,
  hlink: 10,
  folHlink: 11,
};

/** Office 默认主题（文件没有主题时使用） */
export const DEFAULT_THEME_COLORS = [
  '#FFFFFF',
  '#000000',
  '#E7E6E6',
  '#44546A',
  '#4472C4',
  '#ED7D31',
  '#A5A5A5',
  '#FFC000',
  '#5B9BD5',
  '#70AD47',
  '#0563C1',
  '#954F72',
];

const PRESET: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  lime: '00FF00',
  blue: '0000FF',
  yellow: 'FFFF00',
  cyan: '00FFFF',
  magenta: 'FF00FF',
  gray: '808080',
  grey: '808080',
  silver: 'C0C0C0',
  orange: 'FFA500',
  purple: '800080',
  navy: '000080',
  maroon: '800000',
  olive: '808000',
  teal: '008080',
  ltGray: 'D3D3D3',
  dkGray: 'A9A9A9',
  darkBlue: '00008B',
  darkRed: '8B0000',
  darkGreen: '006400',
  lightBlue: 'ADD8E6',
};

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function hexToRgba(hex: string | undefined): Rgba | undefined {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return undefined;
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255, a: 1 };
}

function toHsl({ r, g, b }: Rgba): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number, a: number): Rgba {
  if (!s) return { r: l, g: l, b: l, a };
  const hue = (p: number, q: number, t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue(p, q, h + 1 / 3), g: hue(p, q, h), b: hue(p, q, h - 1 / 3), a };
}

/** 按 DrawingML 的颜色变换（lumMod、lumOff、tint、shade、alpha 等）调整 */
export function applyColorMods(base: Rgba, mods: XNode[]): Rgba {
  let c = { ...base };
  for (const m of mods) {
    const v = Number(m.attrs.val) / 100000;
    if (!Number.isFinite(v)) continue;
    switch (m.name) {
      case 'alpha':
        c.a = clamp01(v);
        break;
      case 'alphaMod':
        c.a = clamp01(c.a * v);
        break;
      case 'alphaOff':
        c.a = clamp01(c.a + v);
        break;
      case 'lumMod': {
        const [h, s, l] = toHsl(c);
        c = fromHsl(h, s, clamp01(l * v), c.a);
        break;
      }
      case 'lumOff': {
        const [h, s, l] = toHsl(c);
        c = fromHsl(h, s, clamp01(l + v), c.a);
        break;
      }
      case 'satMod': {
        const [h, s, l] = toHsl(c);
        c = fromHsl(h, clamp01(s * v), l, c.a);
        break;
      }
      case 'satOff': {
        const [h, s, l] = toHsl(c);
        c = fromHsl(h, clamp01(s + v), l, c.a);
        break;
      }
      case 'hueOff': {
        const [h, s, l] = toHsl(c);
        // hueOff 单位 1/60000 度，这里 v 已除以 100000
        c = fromHsl((h + (v * 100000) / 60000 / 360 + 1) % 1, s, l, c.a);
        break;
      }
      case 'tint':
        c = { r: c.r + (1 - c.r) * (1 - v), g: c.g + (1 - c.g) * (1 - v), b: c.b + (1 - c.b) * (1 - v), a: c.a };
        break;
      case 'shade':
        c = { r: c.r * v, g: c.g * v, b: c.b * v, a: c.a };
        break;
      default:
        break;
    }
  }
  return c;
}

export function rgbaToCss(c: Rgba): string {
  const to = (v: number) => Math.round(clamp01(v) * 255);
  if (c.a >= 0.999) {
    return `#${[c.r, c.g, c.b]
      .map(v => to(v).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }
  return `rgba(${to(c.r)}, ${to(c.g)}, ${to(c.b)}, ${Math.round(c.a * 1000) / 1000})`;
}

const COLOR_TAGS = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'];

/** 解析颜色元素的父节点（如 a:solidFill、a:fgClr）里的颜色；phClr 用 placeholder 替代 */
export function resolveColor(holder: XNode | undefined | null, theme: ThemeInfo, placeholder?: string): string | undefined {
  const node = holder?.children.find(c => COLOR_TAGS.includes(c.name));
  if (!node) return undefined;
  let base: Rgba | undefined;
  const v = node.attrs.val ?? '';
  switch (node.name) {
    case 'srgbClr':
      base = hexToRgba(v);
      break;
    case 'schemeClr': {
      if (v === 'phClr') base = hexToRgba(placeholder);
      else {
        const idx = SCHEME_INDEX[v];
        base = hexToRgba(idx === undefined ? undefined : theme.colors[idx] || DEFAULT_THEME_COLORS[idx]);
      }
      break;
    }
    case 'sysClr':
      base = hexToRgba(node.attrs.lastClr) ?? hexToRgba(v === 'window' ? 'FFFFFF' : '000000');
      break;
    case 'prstClr':
      base = hexToRgba(PRESET[v]);
      break;
    case 'scrgbClr': {
      const p = (k: string) => clamp01(Number(node.attrs[k]) / 100000);
      base = { r: p('r'), g: p('g'), b: p('b'), a: 1 };
      break;
    }
    case 'hslClr': {
      const hh = Number(node.attrs.hue) / 60000 / 360;
      base = fromHsl(hh, clamp01(Number(node.attrs.sat) / 100000), clamp01(Number(node.attrs.lum) / 100000), 1);
      break;
    }
    default:
      break;
  }
  if (!base || ![base.r, base.g, base.b].every(Number.isFinite)) return undefined;
  return rgbaToCss(applyColorMods(base, node.children));
}

/** 按序号取主题强调色（图表系列的默认颜色，超过 6 个时按 Office 的变化规则加深 / 变浅） */
export function accentColor(index: number, theme: ThemeInfo, variations?: XNode[][]): string {
  const accents = [4, 5, 6, 7, 8, 9].map(i => theme.colors[i] || DEFAULT_THEME_COLORS[i]);
  const base = hexToRgba(accents[((index % 6) + 6) % 6])!;
  const round = Math.floor(index / 6);
  if (!round) return rgbaToCss(base);
  const mods = variations?.[round % (variations.length || 1)] ?? DEFAULT_VARIATIONS[(round - 1) % DEFAULT_VARIATIONS.length];
  return rgbaToCss(applyColorMods(base, mods));
}

const mod = (name: string, v: number): XNode => ({ name, prefix: 'a', attrs: { val: String(v) }, children: [], text: '' });
/** Office 默认配色（colors 部件 id=10）第 2 轮起的变化 */
const DEFAULT_VARIATIONS: XNode[][] = [
  [mod('lumMod', 60000)],
  [mod('lumMod', 80000), mod('lumOff', 20000)],
  [mod('lumMod', 80000)],
  [mod('lumMod', 60000), mod('lumOff', 40000)],
  [mod('lumMod', 50000)],
  [mod('lumMod', 70000), mod('lumOff', 30000)],
  [mod('lumMod', 70000)],
  [mod('lumMod', 50000), mod('lumOff', 50000)],
];

/** 读取 cs:colorStyle（xl/charts/colorsN.xml）：颜色列表与变化；没有时返回 undefined */
export function parseColorStyle(root: XNode | null, theme: ThemeInfo): { colors: string[]; variations: XNode[][] } | undefined {
  if (!root || root.name !== 'colorStyle') return undefined;
  const colors: string[] = [];
  const variations: XNode[][] = [];
  for (const c of root.children) {
    if (COLOR_TAGS.includes(c.name)) {
      const col = resolveColor({ ...root, children: [c] }, theme);
      if (col) colors.push(col);
    } else if (c.name === 'variation') variations.push(c.children);
  }
  return colors.length ? { colors, variations: variations.length ? variations : [[]] } : undefined;
}

/** 线条（a:ln） */
export interface LineStyle {
  /** 没有线条（noFill） */
  none?: boolean;
  color?: string;
  /** 宽度 px */
  width?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
}

/** 形状属性（spPr）里的填充与线条 */
export interface ShapeStyle {
  /** undefined：未设置（用默认）；'none'：无填充 */
  fill?: string | 'none';
  line?: LineStyle;
}

export const EMU_PER_PX = 9525;
export const emuToPx = (emu: number) => emu / EMU_PER_PX;

/** 读取填充：solidFill、noFill、gradFill（取第一个色标）、pattFill（取前景色） */
export function readFill(node: XNode | undefined, theme: ThemeInfo, placeholder?: string): string | 'none' | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.name === 'noFill') return 'none';
    if (c.name === 'solidFill') return resolveColor(c, theme, placeholder);
    if (c.name === 'gradFill') {
      const stops = child(c, 'gsLst')?.children ?? [];
      const mid = stops[Math.floor(stops.length / 2)] ?? stops[0];
      return resolveColor(mid, theme, placeholder);
    }
    if (c.name === 'pattFill') return resolveColor(child(c, 'fgClr'), theme, placeholder);
    if (c.name === 'blipFill') return undefined;
  }
  return undefined;
}

export function readLine(ln: XNode | undefined, theme: ThemeInfo, placeholder?: string): LineStyle | undefined {
  if (!ln) return undefined;
  const out: LineStyle = {};
  const w = Number(ln.attrs.w);
  if (Number.isFinite(w) && w >= 0) out.width = Math.max(w ? 0.5 : 0, Math.round(emuToPx(w) * 100) / 100);
  for (const c of ln.children) {
    if (c.name === 'noFill') out.none = true;
    else if (c.name === 'solidFill') out.color = resolveColor(c, theme, placeholder);
    else if (c.name === 'gradFill') out.color = resolveColor(child(c, 'gsLst')?.children[0], theme, placeholder);
    else if (c.name === 'prstDash') {
      const v = c.attrs.val ?? 'solid';
      out.dash = v === 'solid' ? 'solid' : /dot/i.test(v) && !/dash/i.test(v) ? 'dotted' : 'dashed';
    }
  }
  return out;
}

export function readShapeStyle(spPr: XNode | undefined, theme: ThemeInfo, placeholder?: string): ShapeStyle {
  if (!spPr) return {};
  return { fill: readFill(spPr, theme, placeholder), line: readLine(child(spPr, 'ln'), theme, placeholder) };
}

/** 文字样式（a:defRPr / a:rPr） */
export interface TextStyle {
  /** 字号 px */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
}

/** 常见中文字体的别名，系统没有中文名字体时依次回退 */
const FONT_ALIASES: Record<string, string[]> = {
  宋体: ['SimSun', 'Songti SC', 'STSong'],
  新宋体: ['NSimSun', 'SimSun', 'Songti SC'],
  黑体: ['SimHei', 'Heiti SC', 'STHeiti'],
  楷体: ['KaiTi', 'STKaiti', 'Kaiti SC'],
  楷体_GB2312: ['KaiTi_GB2312', 'KaiTi', 'STKaiti'],
  仿宋: ['FangSong', 'STFangsong'],
  仿宋_GB2312: ['FangSong_GB2312', 'FangSong', 'STFangsong'],
  微软雅黑: ['Microsoft YaHei', 'PingFang SC'],
  等线: ['DengXian', 'PingFang SC', 'Microsoft YaHei'],
  新細明體: ['PMingLiU', 'MingLiU'],
  細明體: ['MingLiU', 'PMingLiU'],
  標楷體: ['DFKai-SB', 'BiauKai', 'KaiTi'],
};

/** 字体名 → CSS font-family（带中文别名与无衬线回退） */
export function fontFamily(...names: Array<string | undefined>): string {
  const list: string[] = [];
  for (const n of names) {
    if (!n || n.startsWith('+')) continue;
    if (!list.includes(n)) list.push(n);
    (FONT_ALIASES[n] ?? []).forEach(a => list.includes(a) || list.push(a));
  }
  return [...list.map(n => `"${n.replace(/["\\]/g, '')}"`), 'sans-serif'].join(', ');
}

/** 主题字体占位（+mn-lt / +mn-ea / +mj-lt …） */
function themeFont(name: string | undefined, theme: ThemeInfo): string | undefined {
  if (!name) return undefined;
  if (!name.startsWith('+')) return name;
  const major = name.startsWith('+mj');
  if (name.endsWith('-ea')) return major ? theme.majorEa : theme.minorEa;
  if (name.endsWith('-lt')) return major ? theme.majorLatin : theme.minorLatin;
  return undefined;
}

export function readTextStyle(rpr: XNode | undefined, theme: ThemeInfo): TextStyle {
  if (!rpr) return {};
  const out: TextStyle = {};
  const sz = Number(rpr.attrs.sz);
  if (Number.isFinite(sz) && sz > 0) out.size = Math.round((sz / 100) * (4 / 3) * 100) / 100;
  if (rpr.attrs.b !== undefined) out.bold = rpr.attrs.b === '1' || rpr.attrs.b === 'true';
  if (rpr.attrs.i !== undefined) out.italic = rpr.attrs.i === '1' || rpr.attrs.i === 'true';
  if (rpr.attrs.u !== undefined) out.underline = rpr.attrs.u !== 'none';
  const fill = readFill(rpr, theme);
  if (fill && fill !== 'none') out.color = fill;
  const ea = themeFont(child(rpr, 'ea')?.attrs.typeface, theme);
  const latin = themeFont(child(rpr, 'latin')?.attrs.typeface, theme);
  if (ea || latin) out.font = fontFamily(latin, ea);
  return out;
}

/** 合并文字样式，后面的覆盖前面的 */
export const mergeText = (...styles: Array<TextStyle | undefined>): TextStyle =>
  styles.reduce<TextStyle>((acc, s) => {
    if (!s) return acc;
    const out = { ...acc };
    (Object.keys(s) as Array<keyof TextStyle>).forEach(k => {
      if (s[k] !== undefined) (out as Record<string, unknown>)[k] = s[k];
    });
    return out;
  }, {});

/** 读取主题（xl/theme/theme1.xml）的字体 */
export function parseThemeFonts(root: XNode | null): Pick<ThemeInfo, 'minorLatin' | 'minorEa' | 'majorLatin' | 'majorEa'> {
  const scheme = root ? findFirst(root, 'fontScheme') : undefined;
  const pick = (kind: string, script: string) => {
    const f = child(scheme, kind);
    const v = child(f, script)?.attrs.typeface;
    if (v) return v;
    // 东亚字体通常为空，按简体中文脚本（Hans）取补充字体
    return script === 'ea' ? f?.children.find(c => c.name === 'font' && c.attrs.script === 'Hans')?.attrs.typeface : undefined;
  };
  return {
    minorLatin: pick('minorFont', 'latin'),
    minorEa: pick('minorFont', 'ea') || undefined,
    majorLatin: pick('majorFont', 'latin'),
    majorEa: pick('majorFont', 'ea') || undefined,
  };
}

function findFirst(node: XNode, name: string): XNode | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const hit = findFirst(c, name);
    if (hit) return hit;
  }
  return undefined;
}

/** 数字属性（EMU 等），无效时返回 fallback */
export const numAttr = (node: XNode | undefined, name: string, fallback = 0): number => {
  const n = Number(node?.attrs[name]);
  return Number.isFinite(n) ? n : fallback;
};

export { numVal };
