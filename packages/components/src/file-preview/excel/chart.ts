/**
 * 读取 xlsx 图表部件（xl/charts/chartN.xml，DrawingML c:chartSpace），得到与渲染库无关的图表模型。
 *
 * 数据优先用图表里保存的缓存（c:numCache / c:strCache / c:multiLvlStrCache），
 * 没有缓存（部分程序生成的文件）时记录引用公式，渲染时再从工作表单元格读取（见 fillSeriesFromCells）。
 */
import {
  accentColor,
  applyColorMods,
  hexToRgba,
  rgbaToCss,
  mergeText,
  readLine,
  readShapeStyle,
  readTextStyle,
  type LineStyle,
  type ShapeStyle,
  type TextStyle,
  type ThemeInfo,
} from './dml';
import { boolVal, child, childrenOf, numVal, parseXml, textContent, unwrapAlternate, val, type XNode } from './xml';

export type PlotType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'bubble'
  | 'radar'
  | 'waterfall'
  | 'treemap'
  | 'sunburst'
  | 'histogram'
  | 'boxplot'
  | 'funnel'
  | 'stock';

export interface DataLabels {
  showVal: boolean;
  showPercent: boolean;
  showCatName: boolean;
  showSerName: boolean;
  position?: string;
  numFmt?: string;
  separator?: string;
  text: TextStyle;
}

export interface SeriesData {
  /** 数值（缺失为 null） */
  values: Array<number | null>;
  formatCode?: string;
  /** 文字（分类）；multiLvl 时为最内层 */
  texts?: Array<string | null>;
  /** 多级分类：levels[0] 为最内层（紧贴坐标轴），之后依次向外；稀疏位置为 null */
  levels?: Array<Array<string | null>>;
  /** 引用公式（没有缓存时用于从单元格读取） */
  ref?: string;
  count: number;
}

export interface ChartSeries {
  index: number;
  order: number;
  name: string;
  nameRef?: string;
  cat?: SeriesData;
  val?: SeriesData;
  /** 散点图 / 气泡图的 x 与气泡大小 */
  x?: SeriesData;
  size?: SeriesData;
  style: ShapeStyle;
  /** 数据点单独设置的样式 */
  points: Map<number, ShapeStyle>;
  marker?: { symbol: string; size?: number; style: ShapeStyle };
  smooth: boolean;
  invertIfNegative: boolean;
  labels?: DataLabels;
  explosion?: number;
  /** 默认颜色（主题强调色轮换） */
  autoColor: string;
  /** 瀑布图合计点下标（cx:subtotals） */
  subtotals?: number[];
  /** 趋势线（线性 / 移动平均） */
  trendline?: { type: string; period?: number; name?: string };
}

export interface ChartPlot {
  type: PlotType;
  /** 条形图方向：col 柱形（竖直）、bar 条形（水平） */
  barDir: 'col' | 'bar';
  grouping: 'clustered' | 'stacked' | 'percentStacked' | 'standard';
  varyColors: boolean;
  gapWidth: number;
  overlap: number;
  holeSize?: number;
  firstSliceAng?: number;
  /** 散点图样式：lineMarker、line、marker、smooth… */
  scatterStyle?: string;
  radarStyle?: string;
  axIds: string[];
  series: ChartSeries[];
  labels?: DataLabels;
  /** 3D 图表按 2D 显示 */
  is3D: boolean;
  /** 折线图是否显示标记（c:marker，没有时为 undefined） */
  showMarker?: boolean;
  bubbleScale?: number;
  showNegBubbles?: boolean;
}

export interface ChartAxis {
  id: string;
  kind: 'cat' | 'val' | 'date' | 'ser';
  pos: 'b' | 'l' | 't' | 'r';
  deleted: boolean;
  reversed: boolean;
  min?: number;
  max?: number;
  majorUnit?: number;
  logBase?: number;
  numFmt?: { code: string; linked: boolean };
  majorGrid?: LineStyle;
  minorGrid?: LineStyle;
  tickLblPos: 'nextTo' | 'low' | 'high' | 'none';
  majorTickMark: string;
  crosses: 'autoZero' | 'min' | 'max' | 'value';
  crossesAt?: number;
  crossAx?: string;
  crossBetween: 'between' | 'midCat';
  title?: { text: string; style: TextStyle };
  text: TextStyle;
  line?: LineStyle;
  /** 标签旋转角度（度），未设置时自动 */
  rotation?: number;
  /** 竖排文字（vert="wordArtVert" 等） */
  vertical?: boolean;
  noMultiLvlLbl: boolean;
  lblSkip?: number;
  /** 显示单位（千、百万…）的除数 */
  dispUnit?: number;
}

export interface ChartModel {
  title?: { text: string; style: TextStyle; overlay: boolean };
  plots: ChartPlot[];
  axes: ChartAxis[];
  legend?: { pos: 'b' | 't' | 'l' | 'r' | 'tr'; overlay: boolean; text: TextStyle; hidden: Set<number> };
  /** 整张图表的背景与边框 */
  style: ShapeStyle;
  plotStyle: ShapeStyle;
  /** 默认文字样式（chartSpace txPr，合并了 Office 默认值） */
  text: TextStyle;
  roundedCorners: boolean;
  dispBlanksAs: 'gap' | 'zero' | 'span';
  date1904: boolean;
  /** 不支持的图表类型（如曲面图），用于占位提示 */
  unsupported: string[];
  /** 「依数据点着色」用的颜色序列 */
  palette: string[];
}

const PLOT_TAGS: Record<string, { type: PlotType; is3D?: boolean }> = {
  barChart: { type: 'bar' },
  bar3DChart: { type: 'bar', is3D: true },
  lineChart: { type: 'line' },
  line3DChart: { type: 'line', is3D: true },
  stockChart: { type: 'stock' },
  areaChart: { type: 'area' },
  area3DChart: { type: 'area', is3D: true },
  pieChart: { type: 'pie' },
  pie3DChart: { type: 'pie', is3D: true },
  ofPieChart: { type: 'pie' },
  doughnutChart: { type: 'doughnut' },
  scatterChart: { type: 'scatter' },
  bubbleChart: { type: 'bubble' },
  radarChart: { type: 'radar' },
};

const UNSUPPORTED_PLOTS = ['surfaceChart', 'surface3DChart'];

/** Office 图表的默认字号（pt）：正文 10、标题 14 */
const DEFAULT_TEXT_PT = 10;

const pt = (n: number) => Math.round(n * (4 / 3) * 100) / 100;

const DISP_UNITS: Record<string, number> = {
  hundreds: 1e2,
  thousands: 1e3,
  tenThousands: 1e4,
  hundredThousands: 1e5,
  millions: 1e6,
  tenMillions: 1e7,
  hundredMillions: 1e8,
  billions: 1e9,
  trillions: 1e12,
};

/** txPr / rich 里第一段的默认文字样式，以及 bodyPr 的旋转、竖排 */
function readTxPr(
  tx: XNode | undefined,
  theme: ThemeInfo
): { style: TextStyle; rotation?: number; vertical?: boolean } {
  if (!tx) return { style: {} };
  const body = child(tx, 'bodyPr');
  const p = child(tx, 'p');
  const def = readTextStyle(child(child(p, 'pPr'), 'defRPr'), theme);
  const run = readTextStyle(child(child(p, 'r'), 'rPr'), theme);
  const rot = Number(body?.attrs.rot);
  const vert = body?.attrs.vert;
  return {
    style: mergeText(def, run),
    // -60000000 表示「自动」
    rotation: Number.isFinite(rot) && rot !== -60000000 && Math.abs(rot) <= 5400000 ? rot / 60000 : undefined,
    vertical: !!vert && vert !== 'horz',
  };
}

function readStrCache(node: XNode | undefined): { texts: Array<string | null>; count: number } | undefined {
  if (!node) return undefined;
  const count = numVal(node, 'ptCount') ?? 0;
  const pts = childrenOf(node, 'pt');
  const n = Math.min(
    Math.max(
      count,
      pts.reduce((m, p) => Math.max(m, Number(p.attrs.idx) + 1 || 0), 0)
    ),
    100000
  );
  const texts: Array<string | null> = new Array(n).fill(null);
  pts.forEach(p => {
    const i = Number(p.attrs.idx);
    if (Number.isInteger(i) && i >= 0 && i < n) texts[i] = child(p, 'v')?.text ?? '';
  });
  return { texts, count: n };
}

function readNumCache(
  node: XNode | undefined
): { values: Array<number | null>; count: number; formatCode?: string } | undefined {
  if (!node) return undefined;
  const count = numVal(node, 'ptCount') ?? 0;
  const pts = childrenOf(node, 'pt');
  const n = Math.min(
    Math.max(
      count,
      pts.reduce((m, p) => Math.max(m, Number(p.attrs.idx) + 1 || 0), 0)
    ),
    100000
  );
  const values: Array<number | null> = new Array(n).fill(null);
  pts.forEach(p => {
    const i = Number(p.attrs.idx);
    const v = Number(child(p, 'v')?.text);
    if (Number.isInteger(i) && i >= 0 && i < n && Number.isFinite(v)) values[i] = v;
  });
  const formatCode = child(node, 'formatCode')?.text;
  return { values, count: n, formatCode: formatCode || undefined };
}

/** 读取 c:cat / c:val / c:xVal / c:yVal / c:bubbleSize */
export function readData(node: XNode | undefined): SeriesData | undefined {
  if (!node) return undefined;
  const ref = node.children[0];
  if (!ref) return undefined;
  const f = child(ref, 'f')?.text?.trim() || undefined;
  switch (ref.name) {
    case 'numRef':
    case 'numLit': {
      const cache = readNumCache(ref.name === 'numLit' ? ref : child(ref, 'numCache'));
      return { values: cache?.values ?? [], formatCode: cache?.formatCode, ref: f, count: cache?.count ?? 0 };
    }
    case 'strRef':
    case 'strLit': {
      const cache = readStrCache(ref.name === 'strLit' ? ref : child(ref, 'strCache'));
      const texts = cache?.texts ?? [];
      return {
        values: texts.map(t => (t !== null && t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : null)),
        texts,
        ref: f,
        count: cache?.count ?? 0,
      };
    }
    case 'multiLvlStrRef': {
      const cache = child(ref, 'multiLvlStrCache');
      const count = Math.min(numVal(cache, 'ptCount') ?? 0, 100000);
      const levels = childrenOf(cache, 'lvl').map(lvl => {
        const out: Array<string | null> = new Array(count).fill(null);
        childrenOf(lvl, 'pt').forEach(p => {
          const i = Number(p.attrs.idx);
          if (Number.isInteger(i) && i >= 0 && i < count) out[i] = child(p, 'v')?.text ?? '';
        });
        return out;
      });
      return { values: [], texts: levels[0] ?? [], levels: levels.length > 1 ? levels : undefined, ref: f, count };
    }
    default:
      return undefined;
  }
}

function readLabels(node: XNode | undefined, theme: ThemeInfo, base?: DataLabels): DataLabels | undefined {
  if (!node) return base;
  if (boolVal(node, 'delete')) return undefined;
  const has = (name: string) => child(node, name) !== undefined;
  const flag = (name: keyof DataLabels, tag: string) =>
    has(tag) ? boolVal(node, tag) : ((base?.[name] as boolean | undefined) ?? false);
  const nf = child(node, 'numFmt');
  return {
    showVal: flag('showVal', 'showVal'),
    showPercent: flag('showPercent', 'showPercent'),
    showCatName: flag('showCatName', 'showCatName'),
    showSerName: flag('showSerName', 'showSerName'),
    position: val(node, 'dLblPos') ?? base?.position,
    numFmt: nf && nf.attrs.sourceLinked !== '1' ? nf.attrs.formatCode : base?.numFmt,
    separator: child(node, 'separator')?.text ?? base?.separator,
    text: mergeText(base?.text, readTxPr(child(node, 'txPr'), theme).style),
  };
}

function paletteColor(index: number, theme: ThemeInfo, palette?: { colors: string[]; variations: XNode[][] }): string {
  if (!palette) return accentColor(index, theme);
  const base = palette.colors[index % palette.colors.length];
  const round = Math.floor(index / palette.colors.length);
  return round ? accentColorFrom(base, palette.variations[round % palette.variations.length]) : base;
}

function readSeries(
  node: XNode,
  plot: Pick<ChartPlot, 'type'>,
  theme: ThemeInfo,
  ordinal: number,
  palette?: { colors: string[]; variations: XNode[][] }
): ChartSeries {
  const index = numVal(node, 'idx') ?? ordinal;
  const tx = child(node, 'tx');
  const strRef = child(tx, 'strRef');
  const name =
    (strRef
      ? readStrCache(child(strRef, 'strCache'))
          ?.texts.filter(t => t !== null)
          .join(' ')
      : undefined) ??
    child(tx, 'v')?.text ??
    '';
  const autoColor = paletteColor(index, theme, palette);
  const style = readShapeStyle(child(node, 'spPr'), theme, autoColor);
  const points = new Map<number, ShapeStyle>();
  childrenOf(node, 'dPt').forEach(p => {
    const i = numVal(p, 'idx');
    if (i !== undefined) points.set(i, readShapeStyle(child(p, 'spPr'), theme, autoColor));
  });
  const markerNode = child(node, 'marker');
  const marker = markerNode
    ? {
        symbol: val(markerNode, 'symbol') ?? 'auto',
        size: numVal(markerNode, 'size'),
        style: readShapeStyle(child(markerNode, 'spPr'), theme, autoColor),
      }
    : undefined;
  const isXY = plot.type === 'scatter' || plot.type === 'bubble';
  return {
    index,
    order: numVal(node, 'order') ?? ordinal,
    name,
    nameRef: child(strRef, 'f')?.text,
    cat: readData(child(node, isXY ? 'xVal' : 'cat')),
    val: readData(child(node, isXY ? 'yVal' : 'val')),
    size: readData(child(node, 'bubbleSize')),
    style,
    points,
    marker,
    smooth: boolVal(node, 'smooth'),
    invertIfNegative: boolVal(node, 'invertIfNegative'),
    labels: undefined,
    explosion: numVal(node, 'explosion'),
    autoColor,
    trendline: readTrendline(node),
  };
}

function readTrendline(ser: XNode): ChartSeries['trendline'] | undefined {
  const n = child(ser, 'trendline');
  if (!n) return undefined;
  const type = val(n, 'trendlineType') ?? 'linear';
  return {
    type,
    period: numVal(n, 'period'),
    name: child(child(n, 'name'), 'v')?.text || child(n, 'name')?.text || undefined,
  };
}

function accentColorFrom(base: string, mods: XNode[]): string {
  const rgba = hexToRgba(base);
  return rgba ? rgbaToCss(applyColorMods(rgba, mods)) : base;
}

function readAxis(node: XNode, theme: ThemeInfo, base: TextStyle): ChartAxis {
  const kind = node.name === 'catAx' ? 'cat' : node.name === 'dateAx' ? 'date' : node.name === 'serAx' ? 'ser' : 'val';
  const scaling = child(node, 'scaling');
  const nf = child(node, 'numFmt');
  const grid = (tag: string) => {
    const g = child(node, tag);
    return g ? (readLine(child(child(g, 'spPr'), 'ln'), theme) ?? {}) : undefined;
  };
  const titleNode = child(node, 'title');
  const tx = readTxPr(child(node, 'txPr'), theme);
  const dispUnits = child(node, 'dispUnits');
  const pos = (val(node, 'axPos') ?? (kind === 'val' ? 'l' : 'b')) as ChartAxis['pos'];
  return {
    id: val(node, 'axId') ?? '',
    kind,
    pos: ['b', 'l', 't', 'r'].includes(pos) ? pos : 'b',
    deleted: boolVal(node, 'delete'),
    reversed: val(scaling, 'orientation') === 'maxMin',
    min: numVal(scaling, 'min'),
    max: numVal(scaling, 'max'),
    logBase: numVal(scaling, 'logBase'),
    majorUnit: numVal(node, 'majorUnit'),
    numFmt:
      nf?.attrs.formatCode !== undefined
        ? { code: nf.attrs.formatCode, linked: nf.attrs.sourceLinked === '1' }
        : undefined,
    majorGrid: grid('majorGridlines'),
    minorGrid: grid('minorGridlines'),
    tickLblPos: (val(node, 'tickLblPos') ?? 'nextTo') as ChartAxis['tickLblPos'],
    majorTickMark: val(node, 'majorTickMark') ?? 'out',
    crosses: child(node, 'crossesAt') ? 'value' : ((val(node, 'crosses') ?? 'autoZero') as ChartAxis['crosses']),
    crossesAt: numVal(node, 'crossesAt'),
    crossAx: val(node, 'crossAx'),
    crossBetween: val(node, 'crossBetween') === 'midCat' ? 'midCat' : 'between',
    title: titleNode
      ? readTitle(titleNode, theme, mergeText(base, { size: pt(DEFAULT_TEXT_PT), bold: true }))
      : undefined,
    text: mergeText(base, tx.style),
    line: readLine(child(child(node, 'spPr'), 'ln'), theme),
    rotation: tx.rotation,
    vertical: tx.vertical,
    noMultiLvlLbl: boolVal(node, 'noMultiLvlLbl'),
    lblSkip: numVal(node, 'tickLblSkip'),
    dispUnit: dispUnits
      ? (DISP_UNITS[val(dispUnits, 'builtInUnit') ?? ''] ?? numVal(dispUnits, 'custUnit'))
      : undefined,
  };
}

function readTitle(
  node: XNode,
  theme: ThemeInfo,
  base: TextStyle
): { text: string; style: TextStyle; overlay: boolean } {
  const rich = child(child(node, 'tx'), 'rich');
  const strRef = child(child(node, 'tx'), 'strRef');
  const text = rich
    ? textContent(rich)
    : strRef
      ? (readStrCache(child(strRef, 'strCache'))
          ?.texts.filter(t => t !== null)
          .join(' ') ?? '')
      : '';
  const own = readTxPr(rich ?? child(node, 'txPr'), theme).style;
  return { text, style: mergeText(base, own), overlay: boolVal(node, 'overlay') };
}

export interface ParseChartOptions {
  theme: ThemeInfo;
  /** 对应的 colors 部件（xl/charts/colorsN.xml） */
  colorStyle?: { colors: string[]; variations: XNode[][] };
}

/** 解析图表 XML；不是图表或无法识别时返回 null */
export function parseChart(xml: string | null, options: ParseChartOptions): ChartModel | null {
  const root = parseXml(xml);
  if (!root || root.name !== 'chartSpace') return null;
  const { theme } = options;
  const chart = child(root, 'chart');
  if (!chart) return null;
  const baseTx = readTxPr(child(root, 'txPr'), theme).style;
  const text = mergeText({ size: pt(DEFAULT_TEXT_PT), color: '#595959', font: undefined }, baseTx);
  const plotArea = child(chart, 'plotArea');
  const plots: ChartPlot[] = [];
  const unsupported: string[] = [];
  let ordinal = 0;
  for (const node of unwrapAlternate(plotArea?.children ?? [])) {
    if (UNSUPPORTED_PLOTS.includes(node.name)) {
      unsupported.push(node.name);
      continue;
    }
    const def = PLOT_TAGS[node.name];
    if (!def) continue;
    const plot: ChartPlot = {
      type: node.name === 'doughnutChart' ? 'doughnut' : def.type,
      barDir: val(node, 'barDir') === 'bar' ? 'bar' : 'col',
      grouping: (val(node, 'grouping') ?? (def.type === 'bar' ? 'clustered' : 'standard')) as ChartPlot['grouping'],
      varyColors: boolVal(node, 'varyColors', def.type === 'pie' || node.name === 'doughnutChart'),
      gapWidth: numVal(node, 'gapWidth') ?? 150,
      overlap: numVal(node, 'overlap') ?? (/stacked/i.test(val(node, 'grouping') ?? '') ? 100 : 0),
      holeSize: numVal(node, 'holeSize'),
      firstSliceAng: numVal(node, 'firstSliceAng'),
      scatterStyle: val(node, 'scatterStyle'),
      radarStyle: val(node, 'radarStyle'),
      axIds: childrenOf(node, 'axId').map(a => a.attrs.val ?? ''),
      series: [],
      is3D: !!def.is3D,
      showMarker: child(node, 'marker') ? boolVal(node, 'marker') : undefined,
      bubbleScale: numVal(node, 'bubbleScale'),
      showNegBubbles: boolVal(node, 'showNegBubbles'),
    };
    plot.labels = readLabels(child(node, 'dLbls'), theme, {
      showVal: false,
      showPercent: false,
      showCatName: false,
      showSerName: false,
      text,
    });
    for (const s of childrenOf(node, 'ser')) {
      const ser = readSeries(s, plot, theme, ordinal++, options.colorStyle);
      ser.labels = readLabels(child(s, 'dLbls'), theme, plot.labels);
      plot.series.push(ser);
    }
    plot.series.sort((a, b) => a.order - b.order);
    plots.push(plot);
  }
  const axes = (plotArea?.children ?? [])
    .filter(n => ['catAx', 'valAx', 'dateAx', 'serAx'].includes(n.name))
    .map(n => readAxis(n, theme, text));
  const titleNode = child(chart, 'title');
  const autoDeleted = boolVal(chart, 'autoTitleDeleted');
  const allSeries = plots.flatMap(p => p.series);
  let title: ChartModel['title'];
  if (titleNode) {
    const t = readTitle(titleNode, theme, mergeText(text, { size: pt(14) }));
    // 没有文字的标题：只有一个系列时 Office 显示系列名
    if (!t.text && allSeries.length === 1) t.text = allSeries[0].name;
    if (t.text) title = t;
  } else if (
    !autoDeleted &&
    allSeries.length === 1 &&
    plots.length === 1 &&
    (plots[0].type === 'pie' || plots[0].type === 'doughnut')
  ) {
    title = { text: allSeries[0].name, style: mergeText(text, { size: pt(14) }), overlay: false };
  }
  const legendNode = child(chart, 'legend');
  const legend = legendNode
    ? {
        pos: (val(legendNode, 'legendPos') ?? 'r') as 'b' | 't' | 'l' | 'r' | 'tr',
        overlay: boolVal(legendNode, 'overlay'),
        text: mergeText(text, readTxPr(child(legendNode, 'txPr'), theme).style),
        hidden: new Set(
          childrenOf(legendNode, 'legendEntry')
            .filter(e => boolVal(e, 'delete'))
            .map(e => numVal(e, 'idx') ?? -1)
        ),
      }
    : undefined;
  return {
    title,
    plots,
    axes,
    legend,
    style: readShapeStyle(child(root, 'spPr'), theme),
    plotStyle: readShapeStyle(child(plotArea, 'spPr'), theme),
    text,
    roundedCorners: boolVal(root, 'roundedCorners'),
    dispBlanksAs: (val(chart, 'dispBlanksAs') ?? 'gap') as ChartModel['dispBlanksAs'],
    date1904: boolVal(root, 'date1904'),
    unsupported,
    palette: Array.from({ length: 24 }, (_, i) => paletteColor(i, theme, options.colorStyle)),
  };
}

export { parseChartEx } from './chart-ex';

/** 一个单元格读取结果（渲染时提供） */
export interface RefCell {
  text: string;
  num?: number;
}

/**
 * 没有缓存的系列：用引用公式从工作表单元格读取。
 * resolve 返回按行排列的二维单元格（多个区域按顺序拼接）；无法解析时返回 undefined。
 */
export function fillSeriesFromCells(model: ChartModel, resolve: (ref: string) => RefCell[][] | undefined): void {
  const flat = (ref: string | undefined) => {
    if (!ref) return undefined;
    const grid = resolve(ref);
    if (!grid || !grid.length) return undefined;
    return grid;
  };
  for (const plot of model.plots) {
    for (const s of plot.series) {
      if (!s.name && s.nameRef) {
        const g = flat(s.nameRef);
        if (g)
          s.name = g
            .flat()
            .map(c => c.text)
            .join(' ');
      }
      for (const key of ['val', 'cat', 'size'] as const) {
        const d = s[key];
        if (!d || d.count || !d.ref) continue;
        const g = flat(d.ref);
        if (!g) continue;
        const rows = g.length;
        const cols = Math.max(...g.map(r => r.length));
        const vertical = rows >= cols;
        const points = vertical ? rows : cols;
        const levelsCount = vertical ? cols : rows;
        const at = (p: number, l: number) => (vertical ? g[p]?.[l] : g[l]?.[p]);
        d.count = points;
        d.values = Array.from({ length: points }, (_, p) => {
          const c = at(p, levelsCount - 1);
          return c && c.num !== undefined ? c.num : null;
        });
        d.texts = Array.from({ length: points }, (_, p) => at(p, levelsCount - 1)?.text ?? null);
        if (key === 'cat' && levelsCount > 1) {
          // 区域里最右（或最下）的一列（行）是最内层分类
          d.levels = Array.from({ length: levelsCount }, (_, l) =>
            Array.from({ length: points }, (_, p) => {
              const t = at(p, levelsCount - 1 - l)?.text;
              return t ? t : null;
            })
          );
        }
      }
    }
  }
}
