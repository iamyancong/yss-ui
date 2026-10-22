/**
 * Office 2016 新图表（xl/charts/chartExN.xml，cx:chartSpace）：瀑布、树状、旭日、直方图、箱线、漏斗。
 * 解析成与经典 c:chartSpace 相同的 ChartModel，交给 ./chart-option.ts 画。
 */
import { DEFAULT_THEME_COLORS, type ThemeInfo } from './dml';
import { child, childrenOf, find, parseXml, textContent, val, type XNode } from './xml';
import type { ChartModel, ChartPlot, ChartSeries, ParseChartOptions, PlotType, SeriesData } from './chart';

const FALLBACK_THEME: ThemeInfo = { colors: DEFAULT_THEME_COLORS };

/** layoutId → 预览用的图种；地图等没有对应画法的记入 unsupported */
const LAYOUT: Record<string, PlotType | 'unsupported'> = {
  waterfall: 'waterfall',
  treemap: 'treemap',
  sunburst: 'sunburst',
  histogram: 'histogram',
  boxWhisker: 'boxplot',
  funnel: 'funnel',
  clusteredColumn: 'bar',
  stackedColumn: 'bar',
  regionMap: 'unsupported',
};

const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];

function dimPts(lvl: XNode | undefined, numeric: boolean): { texts: Array<string | null>; values: Array<number | null>; count: number } {
  if (!lvl) return { texts: [], values: [], count: 0 };
  const pts = childrenOf(lvl, 'pt');
  const declared = Number(lvl.attrs.ptCount ?? child(lvl, 'ptCount')?.attrs.val) || 0;
  const n = Math.min(Math.max(declared, pts.reduce((m, p) => Math.max(m, Number(p.attrs.idx) + 1 || 0), 0)), 100000);
  const texts: Array<string | null> = new Array(n).fill(null);
  const values: Array<number | null> = new Array(n).fill(null);
  pts.forEach(p => {
    const i = Number(p.attrs.idx);
    if (!Number.isInteger(i) || i < 0 || i >= n) return;
    const raw = (child(p, 'v')?.text ?? p.text ?? '').trim();
    texts[i] = raw;
    if (numeric) {
      const v = Number(raw);
      if (Number.isFinite(v)) values[i] = v;
    }
  });
  return { texts, values, count: n };
}

function readDataId(node: XNode | undefined): string | undefined {
  return node?.attrs.val ?? val(node, 'dataId') ?? child(node, 'dataId')?.attrs.val;
}

function seriesName(node: XNode): string {
  const tx = child(node, 'tx');
  if (!tx) return '';
  const v = find(tx, 'v');
  if (v?.text) return v.text;
  return textContent(tx).trim();
}

function readCache(data: XNode | undefined): { cat?: SeriesData; val?: SeriesData; levels?: Array<Array<string | null>> } {
  if (!data) return {};
  const strDims = childrenOf(data, 'strDim');
  const numDims = childrenOf(data, 'numDim');
  const catDim = strDims.find(d => (d.attrs.type ?? 'cat') === 'cat') ?? strDims[0];
  const valDim = numDims.find(d => (d.attrs.type ?? 'val') === 'val') ?? numDims[0];
  const catLvls = catDim ? childrenOf(catDim, 'lvl') : [];
  const valLvl = valDim ? childrenOf(valDim, 'lvl')[0] : undefined;
  const cat = catLvls[0] ? dimPts(catLvls[0], false) : undefined;
  const num = valLvl ? dimPts(valLvl, true) : undefined;
  const levels =
    catLvls.length > 1
      ? catLvls.map(l => dimPts(l, false).texts)
      : undefined;
  const f = (node: XNode | undefined) => child(node, 'f')?.text?.trim() || undefined;
  return {
    cat: cat
      ? { values: cat.values, texts: cat.texts, levels, ref: f(catDim), count: cat.count }
      : undefined,
    val: num ? { values: num.values, formatCode: undefined, ref: f(valDim), count: num.count } : undefined,
    levels,
  };
}

function emptySeries(index: number, name: string, color: string): ChartSeries {
  return {
    index,
    order: index,
    name,
    style: {},
    points: new Map(),
    smooth: false,
    invertIfNegative: false,
    autoColor: color,
  };
}

/**
 * 解析 cx:chartSpace。能识别的 layoutId 生成可画的 ChartModel；地图等无法画的类型 plots 为空并写入 unsupported。
 */
export function parseChartEx(xml: string | null, options?: ParseChartOptions): ChartModel | null {
  const root = parseXml(xml);
  if (!root || root.name !== 'chartSpace') return null;
  const theme = options?.theme ?? FALLBACK_THEME;
  const palette = theme.colors.slice(4, 10).filter(Boolean);
  const colors = palette.length >= 3 ? palette : PALETTE;
  const chart = child(root, 'chart');
  if (!chart) return null;
  const titleNode = child(chart, 'title') ?? find(chart, 'title');
  const titleText = titleNode ? textContent(titleNode).trim() : '';
  const dataNodes = childrenOf(child(root, 'chartData') ?? find(root, 'chartData'), 'data');
  const dataById = new Map<string, XNode>();
  dataNodes.forEach((d, i) => dataById.set(d.attrs.id ?? String(i), d));
  const seriesNodes = childrenOf(find(chart, 'plotAreaRegion') ?? find(chart, 'plotArea'), 'series');
  const unsupported: string[] = [];
  const plots: ChartPlot[] = [];
  seriesNodes.forEach((node, ordinal) => {
    const layout = node.attrs.layoutId ?? val(node, 'layoutId') ?? '';
    const mapped = LAYOUT[layout] ?? 'unsupported';
    if (mapped === 'unsupported') {
      if (layout) unsupported.push(layout);
      return;
    }
    const color = colors[ordinal % colors.length];
    const id = readDataId(child(node, 'dataId')) ?? dataNodes[ordinal]?.attrs.id ?? '0';
    const cache = readCache(dataById.get(id) ?? dataNodes[ordinal]);
    const subtotals = childrenOf(child(child(node, 'layoutPr'), 'subtotals'), 'idx')
      .map(n => Number(n.attrs.val))
      .filter(n => Number.isInteger(n) && n >= 0);
    const series = emptySeries(ordinal, seriesName(node) || titleText, color);
    series.cat = cache.cat;
    series.val = cache.val;
    if (subtotals.length) series.subtotals = subtotals;
    let plot = plots.find(p => p.type === mapped);
    if (!plot) {
      plot = {
        type: mapped,
        barDir: 'col',
        grouping: layout === 'stackedColumn' ? 'stacked' : 'clustered',
        varyColors: mapped === 'treemap' || mapped === 'sunburst' || mapped === 'funnel',
        gapWidth: 150,
        overlap: 0,
        axIds: [],
        series: [],
        is3D: false,
      };
      plots.push(plot);
    }
    plot.series.push(series);
  });
  const legendNode = child(chart, 'legend') ?? find(chart, 'legend');
  const text = { size: 13.33, color: '#595959', font: theme.minorLatin };
  return {
    title: titleText ? { text: titleText, style: { ...text, size: 18.67 }, overlay: false } : undefined,
    plots,
    axes: [],
    legend: legendNode ? { pos: 'r', overlay: false, text, hidden: new Set() } : undefined,
    style: {},
    plotStyle: {},
    text,
    roundedCorners: false,
    dispBlanksAs: 'gap',
    date1904: false,
    unsupported,
    palette: colors,
  };
}
