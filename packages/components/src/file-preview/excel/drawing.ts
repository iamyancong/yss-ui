/**
 * 读取工作表的绘图对象（图表、图片、形状、文本框、组合、OLE 对象）、批注、超链接、迷你图、工作表标签颜色。
 *
 * xlsx 里这些内容不在单元格数据中：
 * - 绘图对象在 xl/drawings/drawingN.xml（xdr:wsDr），按单元格锚点（twoCellAnchor / oneCellAnchor / absoluteAnchor）定位；
 * - 批注在 xl/commentsN.xml；超链接、OLE 对象、迷你图（x14:sparklineGroups）在工作表 XML 的 sheetData 之后。
 * @vue-office/excel（x-spreadsheet）不显示这些内容，渲染器在表格上方叠加一层显示（见 ./overlay.ts）。
 */
import { parseChart, parseChartEx, type ChartModel } from './chart';
import { mergeText, parseColorStyle, readShapeStyle, readTextStyle, resolveColor, type ShapeStyle, type TextStyle, type ThemeInfo } from './dml';
import { parseCellRef } from './model';
import { child, childrenOf, find, findAll, parseXml, unwrapAlternate, type XNode } from './xml';

/** 单元格锚点：列、行（0 起）与单元格内偏移（EMU） */
export interface Marker {
  col: number;
  colOff: number;
  row: number;
  rowOff: number;
}

export interface Anchor {
  kind: 'two' | 'one' | 'abs';
  from?: Marker;
  to?: Marker;
  /** oneCellAnchor / absoluteAnchor 的尺寸（EMU） */
  ext?: { cx: number; cy: number };
  /** absoluteAnchor 的位置（EMU，相对工作表左上角） */
  pos?: { x: number; y: number };
}

/** 形状变换（EMU）；组合里的子对象按组合的子坐标系定位 */
export interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flipH: boolean;
  flipV: boolean;
  /** 组合的子坐标系 */
  ch?: { x: number; y: number; w: number; h: number };
}

export interface TextRun {
  text: string;
  style: TextStyle;
}

export interface Paragraph {
  align: 'left' | 'center' | 'right' | 'justify';
  runs: TextRun[];
}

interface ItemBase {
  name: string;
  /** 替代文字 */
  descr?: string;
  hidden: boolean;
  xfrm?: Xfrm;
}

export type DrawingItem =
  | (ItemBase & { type: 'chart'; chart: ChartModel | null; path?: string })
  | (ItemBase & { type: 'chartex'; title?: string; chartType?: string })
  | (ItemBase & {
      type: 'picture';
      /** 图片在 zip 里的路径；外部链接图片（r:link）不加载 */
      media?: string;
      linked?: boolean;
      /** 裁剪（0~1，按边） */
      crop?: { l: number; t: number; r: number; b: number };
      style: ShapeStyle;
    })
  | (ItemBase & {
      type: 'shape';
      geom: string;
      connector: boolean;
      style: ShapeStyle;
      paragraphs: Paragraph[];
      body: { anchor: 't' | 'ctr' | 'b'; vertical: boolean; insets: [number, number, number, number]; rotation?: number };
      /** 形状里的图片填充 */
      media?: string;
    })
  | (ItemBase & { type: 'group'; children: DrawingItem[] })
  | (ItemBase & { type: 'ole'; progId?: string; media?: string });

export interface DrawingObject {
  anchor: Anchor;
  item: DrawingItem;
}

export interface SheetComment {
  row: number;
  col: number;
  author?: string;
  text: string;
}

export interface SheetLink {
  row: number;
  col: number;
  /** 两者之一：外部地址（已校验协议）或工作簿内位置（Sheet1!A1） */
  url?: string;
  location?: string;
  tooltip?: string;
  /** 区域：ref 可以是 A1:B3 */
  rows?: number;
  cols?: number;
}

export interface Sparkline {
  row: number;
  col: number;
  ref: string;
}

export interface SparklineGroup {
  type: 'line' | 'column' | 'stacked';
  color?: string;
  negativeColor?: string;
  markers: boolean;
  highColor?: string;
  lowColor?: string;
  lineWidth?: number;
  displayEmptyCellsAs?: string;
  minAxisType?: string;
  maxAxisType?: string;
  manualMin?: number;
  manualMax?: number;
  rightToLeft?: boolean;
  items: Sparkline[];
}

export interface SheetExtras {
  objects: DrawingObject[];
  comments: SheetComment[];
  links: SheetLink[];
  sparklines: SparklineGroup[];
  tabColor?: string;
  /** 解析时跳过的对象数（超出上限） */
  skipped: number;
}

/** 读取 zip 条目的接口（./xlsx.ts 提供） */
export interface PartReader {
  text(path: string): Promise<string | null>;
  has(path: string): boolean;
}

/** 每个工作表最多读取的绘图对象与图表数，防止异常文件拖慢预览 */
export const MAX_OBJECTS_PER_SHEET = 500;
export const MAX_CHARTS_PER_SHEET = 100;
export const MAX_COMMENTS_PER_SHEET = 20000;
export const MAX_PART_CHARS = 8 * 1024 * 1024;

/** 只允许打开 http、https、mailto 链接 */
export function safeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(s)) return undefined;
  try {
    const u = new URL(s);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export interface Rel {
  target: string;
  type: string;
  external: boolean;
}

/** 解析 .rels；target 已按 base 目录解析成 zip 路径（外部链接保持原样） */
export function parseRels(xml: string | null, baseDir: string): Map<string, Rel> {
  const out = new Map<string, Rel>();
  const root = parseXml(xml);
  for (const r of root?.children ?? []) {
    if (r.name !== 'Relationship') continue;
    const id = r.attrs.Id;
    const target = r.attrs.Target;
    if (!id || target === undefined) continue;
    const external = r.attrs.TargetMode === 'External';
    out.set(id, { target: external ? target : resolvePath(baseDir, target), type: (r.attrs.Type ?? '').split('/').pop() ?? '', external });
  }
  return out;
}

/** 按目录解析相对路径（../media/image1.png） */
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `${baseDir}/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
const relsOf = (p: string) => `${dirOf(p)}/_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`;

const int = (s: string | undefined, fallback = 0) => {
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : fallback;
};

function readMarker(node: XNode | undefined): Marker | undefined {
  if (!node) return undefined;
  const col = int(child(node, 'col')?.text);
  const row = int(child(node, 'row')?.text);
  return {
    col: Math.max(0, Math.min(col, 16383)),
    colOff: Math.max(0, int(child(node, 'colOff')?.text)),
    row: Math.max(0, Math.min(row, 1048575)),
    rowOff: Math.max(0, int(child(node, 'rowOff')?.text)),
  };
}

function readAnchor(node: XNode): Anchor | undefined {
  const extNode = child(node, 'ext');
  const ext = extNode ? { cx: Math.max(0, int(extNode.attrs.cx)), cy: Math.max(0, int(extNode.attrs.cy)) } : undefined;
  if (node.name === 'twoCellAnchor') {
    const from = readMarker(child(node, 'from'));
    const to = readMarker(child(node, 'to'));
    return from && to ? { kind: 'two', from, to } : undefined;
  }
  if (node.name === 'oneCellAnchor') {
    const from = readMarker(child(node, 'from'));
    return from && ext ? { kind: 'one', from, ext } : undefined;
  }
  if (node.name === 'absoluteAnchor') {
    const p = child(node, 'pos');
    return ext && p ? { kind: 'abs', pos: { x: int(p.attrs.x), y: int(p.attrs.y) }, ext } : undefined;
  }
  return undefined;
}

function readXfrm(node: XNode | undefined): Xfrm | undefined {
  if (!node) return undefined;
  const off = child(node, 'off');
  const ext = child(node, 'ext');
  const chOff = child(node, 'chOff');
  const chExt = child(node, 'chExt');
  const xf: Xfrm = {
    x: int(off?.attrs.x),
    y: int(off?.attrs.y),
    w: Math.max(0, int(ext?.attrs.cx)),
    h: Math.max(0, int(ext?.attrs.cy)),
    rot: int(node.attrs.rot) / 60000,
    flipH: node.attrs.flipH === '1' || node.attrs.flipH === 'true',
    flipV: node.attrs.flipV === '1' || node.attrs.flipV === 'true',
  };
  if (chOff && chExt) xf.ch = { x: int(chOff.attrs.x), y: int(chOff.attrs.y), w: int(chExt.attrs.cx), h: int(chExt.attrs.cy) };
  return xf;
}

/** cNvPr：名称、替代文字、是否隐藏 */
function readNv(node: XNode, nvTag: string): Pick<ItemBase, 'name' | 'descr' | 'hidden'> {
  const c = child(child(node, nvTag), 'cNvPr');
  return {
    name: c?.attrs.name ?? '',
    descr: c?.attrs.descr || c?.attrs.title || undefined,
    hidden: c?.attrs.hidden === '1' || c?.attrs.hidden === 'true',
  };
}

const ALIGN: Record<string, Paragraph['align']> = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };

function readParagraphs(txBody: XNode | undefined, theme: ThemeInfo, base: TextStyle): Paragraph[] {
  if (!txBody) return [];
  const lstDef = readTextStyle(child(child(child(txBody, 'lstStyle'), 'lvl1pPr'), 'defRPr'), theme);
  return childrenOf(txBody, 'p').map(p => {
    const pPr = child(p, 'pPr');
    const def = mergeText(base, lstDef, readTextStyle(child(pPr, 'defRPr'), theme));
    const runs: TextRun[] = [];
    for (const r of p.children) {
      if (r.name === 'r' || r.name === 'fld') runs.push({ text: child(r, 't')?.text ?? '', style: mergeText(def, readTextStyle(child(r, 'rPr'), theme)) });
      else if (r.name === 'br') runs.push({ text: '\n', style: def });
    }
    if (!runs.length) runs.push({ text: '', style: mergeText(def, readTextStyle(child(p, 'endParaRPr'), theme)) });
    return { align: ALIGN[pPr?.attrs.algn ?? 'l'] ?? 'left', runs };
  });
}

interface DrawingContext {
  theme: ThemeInfo;
  rels: Map<string, Rel>;
  reader: PartReader;
  charts: { count: number };
}

/** 形状的默认样式（xdr:style：fillRef、lnRef、fontRef 引用主题） */
function styleRefs(node: XNode | undefined, theme: ThemeInfo): { fill?: string; line?: string; font?: string } {
  if (!node) return {};
  const ref = (tag: string) => {
    const r = child(node, tag);
    if (!r || r.attrs.idx === '0') return undefined;
    return resolveColor(r, theme);
  };
  return { fill: ref('fillRef'), line: ref('lnRef'), font: resolveColor(child(node, 'fontRef'), theme) };
}

async function readItem(node: XNode, ctx: DrawingContext): Promise<DrawingItem | undefined> {
  const { theme, rels } = ctx;
  switch (node.name) {
    case 'graphicFrame': {
      const base = { ...readNv(node, 'nvGraphicFramePr'), xfrm: readXfrm(child(node, 'xfrm')) };
      const data = find(node, 'graphicData');
      const uri = data?.attrs.uri ?? '';
      const chartRef = child(data, 'chart');
      const rid = chartRef?.attrs['r:id'] ?? chartRef?.attrs.id;
      if (chartRef && /\/chart$/.test(uri)) {
        const rel = rid ? rels.get(rid) : undefined;
        if (!rel || rel.external || ctx.charts.count >= MAX_CHARTS_PER_SHEET) return { ...base, type: 'chart', chart: null };
        ctx.charts.count++;
        const xml = await ctx.reader.text(rel.target);
        // 关系写成普通图表、内容其实是 Office 2016 新图表（cx:chartSpace）
        if (xml && /^\s*(<\?xml[^>]*\?>\s*)?<cx:chartSpace\b/.test(xml)) {
          const complete = /<\/(?:\w+:)?chartSpace>\s*$/.test(xml);
          const chart = complete && xml.length <= MAX_PART_CHARS ? parseChartEx(xml, { theme }) : null;
          if (chart && (chart.plots.length || chart.unsupported.length))
            return { ...base, type: 'chart', chart, path: rel.target };
          return { ...base, type: 'chartex', title: chart?.title?.text, chartType: chart?.unsupported[0] };
        }
        let chart: ChartModel | null = null;
        try {
          const colorsRel = [...parseRels(await ctx.reader.text(relsOf(rel.target)), dirOf(rel.target)).values()].find(r => r.type === 'chartColorStyle');
          const colorStyle = colorsRel ? parseColorStyle(parseXml(await ctx.reader.text(colorsRel.target)), theme) : undefined;
          // 不完整（被截断）的图表 XML 不画，避免显示出缺数据的图表
          const complete = !!xml && /<\/(?:\w+:)?chartSpace>\s*$/.test(xml);
          chart = complete && xml.length <= MAX_PART_CHARS ? parseChart(xml, { theme, colorStyle }) : null;
        } catch {
          chart = null;
        }
        return { ...base, type: 'chart', chart, path: rel.target };
      }
      if (/chartex$/i.test(uri) || child(data, 'chart')?.prefix === 'cx') {
        const rel = rid ? rels.get(rid) : undefined;
        const xml = rel && !rel.external ? await ctx.reader.text(rel.target) : null;
        const complete = !!xml && /<\/(?:\w+:)?chartSpace>\s*$/.test(xml);
        const chart = complete && xml && xml.length <= MAX_PART_CHARS ? parseChartEx(xml, { theme }) : null;
        if (chart && (chart.plots.length || chart.unsupported.length))
          return { ...base, type: 'chart', chart, path: rel?.target };
        return { ...base, type: 'chartex', title: chart?.title?.text, chartType: chart?.unsupported[0] };
      }
      // SmartArt、表格等：按未支持的图表占位
      return { ...base, type: 'chartex', chartType: uri.split('/').pop() };
    }
    case 'pic': {
      const blipFill = child(node, 'blipFill');
      const blip = child(blipFill, 'blip');
      const embed = blip?.attrs['r:embed'];
      const link = blip?.attrs['r:link'];
      const rel = embed ? rels.get(embed) : undefined;
      const srcRect = child(blipFill, 'srcRect');
      const pct = (k: string) => Math.max(-1, Math.min(1, int(srcRect?.attrs[k]) / 100000));
      return {
        ...readNv(node, 'nvPicPr'),
        type: 'picture',
        xfrm: readXfrm(child(child(node, 'spPr'), 'xfrm')),
        media: rel && !rel.external ? rel.target : undefined,
        linked: !rel && !!link,
        crop: srcRect ? { l: pct('l'), t: pct('t'), r: pct('r'), b: pct('b') } : undefined,
        style: readShapeStyle(child(node, 'spPr'), theme),
      };
    }
    case 'sp':
    case 'cxnSp': {
      const spPr = child(node, 'spPr');
      const refs = styleRefs(child(node, 'style'), theme);
      const style = readShapeStyle(spPr, theme, refs.fill);
      if (style.fill === undefined && refs.fill) style.fill = refs.fill;
      if (!style.line && refs.line) style.line = { color: refs.line, width: 1 };
      else if (style.line && !style.line.color && !style.line.none && refs.line) style.line.color = refs.line;
      const txBody = child(node, 'txBody');
      const bodyPr = child(txBody, 'bodyPr');
      const inset = (k: string, d: number) => (bodyPr?.attrs[k] !== undefined ? int(bodyPr.attrs[k]) / 9525 : d);
      const blip = child(child(spPr, 'blipFill'), 'blip');
      const blipRel = blip?.attrs['r:embed'] ? rels.get(blip.attrs['r:embed']) : undefined;
      const rot = Number(bodyPr?.attrs.rot);
      return {
        ...readNv(node, node.name === 'sp' ? 'nvSpPr' : 'nvCxnSpPr'),
        type: 'shape',
        xfrm: readXfrm(child(spPr, 'xfrm')),
        geom: child(spPr, 'prstGeom')?.attrs.prst ?? (child(spPr, 'custGeom') ? 'custom' : 'rect'),
        connector: node.name === 'cxnSp',
        style,
        paragraphs: readParagraphs(txBody, theme, { color: refs.font, size: (11 * 4) / 3 }),
        body: {
          anchor: (bodyPr?.attrs.anchor as 't' | 'ctr' | 'b') ?? 't',
          vertical: !!bodyPr?.attrs.vert && bodyPr.attrs.vert !== 'horz',
          insets: [inset('tIns', 3.6 * 1.333), inset('rIns', 7.2 * 1.333), inset('bIns', 3.6 * 1.333), inset('lIns', 7.2 * 1.333)],
          rotation: Number.isFinite(rot) && rot ? rot / 60000 : undefined,
        },
        media: blipRel && !blipRel.external ? blipRel.target : undefined,
      };
    }
    case 'grpSp': {
      const children: DrawingItem[] = [];
      for (const c of unwrapAlternate(node.children)) {
        if (c.name === 'nvGrpSpPr' || c.name === 'grpSpPr') continue;
        const item = await readItem(c, ctx);
        if (item) children.push(item);
      }
      return { ...readNv(node, 'nvGrpSpPr'), type: 'group', xfrm: readXfrm(child(child(node, 'grpSpPr'), 'xfrm')), children };
    }
    case 'contentPart':
      return undefined;
    default:
      return undefined;
  }
}

/** 解析绘图部件（xl/drawings/drawingN.xml） */
export async function parseDrawing(path: string, reader: PartReader, theme: ThemeInfo, limit = MAX_OBJECTS_PER_SHEET): Promise<{ objects: DrawingObject[]; skipped: number }> {
  const xml = await reader.text(path);
  if (!xml || xml.length > MAX_PART_CHARS) return { objects: [], skipped: 0 };
  const root = parseXml(xml);
  if (!root) return { objects: [], skipped: 0 };
  const ctx: DrawingContext = { theme, rels: parseRels(await reader.text(relsOf(path)), dirOf(path)), reader, charts: { count: 0 } };
  const objects: DrawingObject[] = [];
  let skipped = 0;
  for (const a of unwrapAlternate(root.children)) {
    const anchor = readAnchor(a);
    if (!anchor) continue;
    if (objects.length >= limit) {
      skipped++;
      continue;
    }
    const body = unwrapAlternate(a.children).find(c => ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(c.name));
    if (!body) continue;
    try {
      const item = await readItem(body, ctx);
      if (item) objects.push({ anchor, item });
    } catch {
      skipped++;
    }
  }
  return { objects, skipped };
}

/** 解析批注（xl/commentsN.xml） */
export function parseComments(xml: string | null): SheetComment[] {
  const root = parseXml(xml);
  if (!root) return [];
  const authors = childrenOf(child(root, 'authors'), 'author').map(a => a.text);
  const out: SheetComment[] = [];
  for (const c of childrenOf(child(root, 'commentList'), 'comment')) {
    if (out.length >= MAX_COMMENTS_PER_SHEET) break;
    const pos = parseCellRef(c.attrs.ref?.split(':')[0] ?? '');
    if (!pos) continue;
    const textNode = child(c, 'text');
    const text = findAll(textNode, 't')
      .filter(t => !isPhonetic(textNode, t))
      .map(t => t.text)
      .join('');
    const author = authors[Number(c.attrs.authorId)];
    out.push({ ...pos, author: author || undefined, text: text.replace(/\r\n?/g, '\n') });
  }
  return out;
}

function isPhonetic(root: XNode | undefined, t: XNode): boolean {
  return childrenOf(root, 'rPh').some(r => findAll(r, 't').includes(t));
}

/** 从工作表 XML（sheetData 之前与之后两段）读取超链接、OLE 对象、迷你图、标签颜色 */
export function parseSheetParts(head: string, tail: string, rels: Map<string, Rel>, theme: ThemeInfo): Omit<SheetExtras, 'objects' | 'comments' | 'skipped'> & { ole: DrawingObject[]; drawing?: string; comments?: string } {
  const links: SheetLink[] = [];
  const ole: DrawingObject[] = [];
  const sparklines: SparklineGroup[] = [];
  let tabColor: string | undefined;
  const pr = parseXml(/<sheetPr\b[\s\S]*?(?:\/>|<\/sheetPr>)/.exec(head)?.[0]);
  const tab = child(pr, 'tabColor');
  if (tab) {
    if (tab.attrs.rgb && /^[0-9a-f]{8}$/i.test(tab.attrs.rgb)) tabColor = `#${tab.attrs.rgb.slice(2).toUpperCase()}`;
    else if (tab.attrs.theme !== undefined) tabColor = theme.colors[Number(tab.attrs.theme)] || undefined;
  }
  const hl = parseXml(/<hyperlinks\b[\s\S]*?<\/hyperlinks>/.exec(tail)?.[0]);
  for (const h of childrenOf(hl, 'hyperlink')) {
    if (links.length >= 20000) break;
    const [a, b] = (h.attrs.ref ?? '').split(':');
    const p = parseCellRef(a ?? '');
    if (!p) continue;
    const q = (b ? parseCellRef(b) : null) ?? p;
    const rid = h.attrs['r:id'];
    const rel = rid ? rels.get(rid) : undefined;
    const url = rel?.external ? safeUrl(rel.target) : undefined;
    // 有的程序把工作簿内的位置写成以 # 开头的外部链接
    const location = h.attrs.location || (rel?.target?.startsWith('#') ? rel.target.slice(1) : undefined) || undefined;
    if (!url && !location) continue;
    links.push({ ...p, rows: q.row - p.row + 1, cols: q.col - p.col + 1, url, location: url ? undefined : location, tooltip: h.attrs.tooltip || undefined });
  }
  const oleRoot = parseXml(/<oleObjects\b[\s\S]*?<\/oleObjects>/.exec(tail)?.[0]);
  for (const o of unwrapAlternate(oleRoot?.children ?? [])) {
    if (o.name !== 'oleObject') continue;
    const objectPr = child(o, 'objectPr');
    const anchorNode = child(objectPr, 'anchor');
    const from = readMarker(child(anchorNode, 'from'));
    const to = readMarker(child(anchorNode, 'to'));
    if (!from || !to) continue;
    const img = objectPr?.attrs['r:id'] ? rels.get(objectPr.attrs['r:id']) : undefined;
    ole.push({
      anchor: { kind: 'two', from, to },
      item: { type: 'ole', name: o.attrs.progId ?? '', hidden: false, progId: o.attrs.progId, media: img && !img.external ? img.target : undefined },
    });
  }
  for (const g of findAll(parseXml(/<x14:sparklineGroups\b[\s\S]*?<\/x14:sparklineGroups>/.exec(tail)?.[0]), 'sparklineGroup')) {
    const color = (tag: string) => {
      const c = child(g, tag);
      if (!c) return undefined;
      if (c.attrs.rgb && /^[0-9a-f]{8}$/i.test(c.attrs.rgb)) return `#${c.attrs.rgb.slice(2).toUpperCase()}`;
      if (c.attrs.theme !== undefined) return theme.colors[Number(c.attrs.theme)] || undefined;
      return undefined;
    };
    const on = (k: string) => g.attrs[k] === '1' || g.attrs[k] === 'true';
    const items: Sparkline[] = [];
    for (const s of findAll(g, 'sparkline')) {
      const ref = child(s, 'f')?.text?.trim();
      const pos = parseCellRef(child(s, 'sqref')?.text?.trim() ?? '');
      if (ref && pos) items.push({ ...pos, ref });
    }
    const type = g.attrs.type === 'column' ? 'column' : g.attrs.type === 'stacked' ? 'stacked' : 'line';
    sparklines.push({
      type,
      color: color('colorSeries'),
      negativeColor: on('negative') || type !== 'line' ? color('colorNegative') : undefined,
      markers: on('markers'),
      highColor: on('high') ? color('colorHigh') : undefined,
      lowColor: on('low') ? color('colorLow') : undefined,
      lineWidth: g.attrs.lineWeight !== undefined ? (Number(g.attrs.lineWeight) * 4) / 3 : undefined,
      displayEmptyCellsAs: g.attrs.displayEmptyCellsAs,
      minAxisType: g.attrs.minAxisType,
      maxAxisType: g.attrs.maxAxisType,
      manualMin: g.attrs.manualMin !== undefined ? Number(g.attrs.manualMin) : undefined,
      manualMax: g.attrs.manualMax !== undefined ? Number(g.attrs.manualMax) : undefined,
      rightToLeft: on('rightToLeft'),
      items,
    });
  }
  const drawingId = /<drawing\b[^>]*r:id="([^"]+)"/.exec(tail)?.[1];
  const drawingRel = drawingId ? rels.get(drawingId) : undefined;
  const commentsRel = [...rels.values()].find(r => r.type === 'comments' && !r.external);
  return {
    links,
    ole,
    sparklines,
    tabColor,
    drawing: drawingRel && !drawingRel.external ? drawingRel.target : undefined,
    comments: commentsRel?.target,
  };
}

/** 读取工作表的全部附加内容；失败的部分跳过 */
export async function parseSheetExtras(sheetPath: string, head: string, tail: string, reader: PartReader, theme: ThemeInfo): Promise<SheetExtras | undefined> {
  const relsPath = relsOf(sheetPath);
  if (!reader.has(relsPath) && !/<sheetPr\b[^>]*>[\s\S]*?tabColor/.test(head) && !tail.includes('sparkline')) return undefined;
  const rels = parseRels(await reader.text(relsPath), dirOf(sheetPath));
  const parts = parseSheetParts(head, tail, rels, theme);
  const drawing = parts.drawing ? await parseDrawing(parts.drawing, reader, theme).catch(() => ({ objects: [], skipped: 0 })) : { objects: [], skipped: 0 };
  const comments = parts.comments ? parseComments(await reader.text(parts.comments)) : [];
  // OLE 对象在绘图部件里通常还有一个隐藏的占位形状（hidden="1"），只按 oleObjects 显示
  const objects = [...drawing.objects, ...parts.ole];
  const extras: SheetExtras = {
    objects,
    comments,
    links: parts.links,
    sparklines: parts.sparklines,
    tabColor: parts.tabColor,
    skipped: drawing.skipped,
  };
  const empty = !objects.length && !comments.length && !parts.links.length && !parts.sparklines.length && !parts.tabColor;
  return empty ? undefined : extras;
}

/** 对象（含组合里的子对象）里出现的图片路径 */
export function mediaPaths(items: DrawingItem[], out = new Set<string>()): Set<string> {
  for (const it of items) {
    if ((it.type === 'picture' || it.type === 'shape' || it.type === 'ole') && it.media) out.add(it.media);
    if (it.type === 'group') mediaPaths(it.children, out);
  }
  return out;
}

