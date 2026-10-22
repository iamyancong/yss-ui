/**
 * 图表模型（./chart.ts）→ ECharts option。只生成配置，不依赖 ECharts，可在 Node 环境测试。
 *
 * 与 Excel 的对应关系：
 * - 柱形图 / 条形图（簇状、堆积、百分比堆积，gapWidth、overlap、invertIfNegative、varyColors）；
 * - 折线图、面积图（堆积、平滑、标记）、散点图、气泡图、饼图、圆环图、雷达图、股票图、瀑布 / 树状 / 旭日 / 直方图 / 箱线 / 漏斗，以及它们的组合（次坐标轴）；
 * - 线性 / 移动平均趋势线；
 * - 标题、图例位置、坐标轴（最小 / 最大值、主要单位、数字格式、逆序、对数、网格线、交叉位置、显示单位）、数据标签；
 * - 字号按 pt × 4/3 换算成 px；分类标签放不下时依次折行（中文按字折行）、旋转 45°、隔几个显示；
 * - 多级分类（multiLvlStrCache）：内层标签照常显示，外层分组在渲染后按坐标补画（见 MultiLevelPlan）。
 */
import { measureText } from '../shared/measure';
import type { LineStyle, ShapeStyle, TextStyle } from './dml';
import type { ChartAxis, ChartModel, ChartPlot, ChartSeries, DataLabels, PlotType } from './chart';

export type NumberFormatter = (value: number, formatCode?: string) => string;

export interface BuildOptions {
  width: number;
  height: number;
  format: NumberFormatter;
  /** 默认字体（CSS font-family） */
  fontFamily?: string;
}

/** 多级分类的外层分组：渲染后按坐标补画 */
export interface MultiLevelPlan {
  axisKey: 'xAxis' | 'yAxis';
  axisIndex: number;
  /** levels[0] 为紧贴内层标签的一层，依次向外；每层是若干分组 */
  levels: Array<Array<{ start: number; end: number; text: string }>>;
  fontSize: number;
  color: string;
  fontFamily: string;
  /** 内层标签占的高度（px，含与坐标轴的间距） */
  innerHeight: number;
  /** 每层分组的高度 */
  rowHeight: number;
  lineColor: string;
}

export interface BuiltChart {
  option: Record<string, any>;
  multiLevel?: MultiLevelPlan;
}

const FALLBACK_FONT = 'sans-serif';
const EXTENDED = new Set<PlotType>(['waterfall', 'treemap', 'sunburst', 'boxplot', 'funnel', 'stock']);
const CJK = /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
const LATIN_WORD = /[^\s\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]+/g;

const textStyle = (s: TextStyle | undefined, fallbackFont: string) => ({
  fontSize: s?.size ?? 13.33,
  color: s?.color ?? '#595959',
  fontWeight: s?.bold ? 'bold' : 'normal',
  fontStyle: s?.italic ? 'italic' : 'normal',
  fontFamily: s?.font ?? fallbackFont,
});

const lineStyle = (l: LineStyle | undefined, fallback: string, width = 1) => ({
  color: l?.color ?? fallback,
  width: l?.width ?? width,
  type: l?.dash === 'dashed' ? 'dashed' : l?.dash === 'dotted' ? 'dotted' : 'solid',
});

const fillOf = (s: ShapeStyle | undefined, fallback: string) => (s?.fill && s.fill !== 'none' ? s.fill : s?.fill === 'none' ? 'transparent' : fallback);

/** 按标签宽度规划分类标签：放得下不处理 → 折行 → 旋转 45° → 隔几个显示 */
export function planCategoryLabels(labels: string[], fontSize: number, fontFamily: string, band: number): Record<string, unknown> {
  if (!labels.length || !(band > 0)) return {};
  const widths = labels.map(l => measureText(l, fontSize, fontFamily));
  const widest = Math.max(...widths);
  if (widest <= band - Math.max(4, fontSize * 0.3)) return { interval: 0 };
  const wrap = Math.max(fontSize, Math.floor(band * 0.92));
  const longestWord = Math.max(0, ...labels.flatMap(l => (l.match(LATIN_WORD) ?? []).map(w => measureText(w, fontSize, fontFamily))));
  const cjk = labels.some(l => CJK.test(l));
  const lines = Math.max(...widths.map(w => Math.ceil(w / (wrap * 0.9))));
  // 中文可以在任意字之间折行（Excel / WPS 在分类宽度不够时会把中文标签竖着排）
  if (longestWord <= wrap && lines <= (cjk ? 8 : 2)) return { interval: 0, width: wrap, overflow: 'break', lineHeight: Math.round(fontSize * 1.2) };
  const out: Record<string, unknown> = { rotate: 45 };
  if (band * Math.SQRT1_2 >= fontSize * 1.25) out.interval = 0;
  else Object.assign(out, { interval: 'auto', hideOverlap: true });
  return out;
}

/** 估算分类标签占的高度（px） */
function labelBlockHeight(labels: string[], plan: Record<string, unknown>, fontSize: number, fontFamily: string): number {
  const lineH = (plan.lineHeight as number) ?? fontSize * 1.25;
  if (plan.rotate) {
    const widest = Math.max(0, ...labels.map(l => measureText(l, fontSize, fontFamily)));
    return Math.min(widest, 200) * Math.SQRT1_2 + fontSize;
  }
  if (plan.width) {
    const w = plan.width as number;
    return Math.max(1, ...labels.map(l => Math.ceil(measureText(l, fontSize, fontFamily) / (w * 0.9)))) * lineH;
  }
  return Math.max(1, ...labels.map(l => l.split('\n').length)) * lineH;
}

function groupsOf(level: Array<string | null>, count: number): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < count; i++) {
    const t = level[i];
    if (t !== null && t !== undefined) out.push({ start: i, end: i, text: t });
    else if (out.length) out[out.length - 1].end = i;
  }
  return out;
}

const SYMBOLS: Record<string, string> = {
  circle: 'circle',
  square: 'rect',
  diamond: 'diamond',
  triangle: 'triangle',
  dot: 'circle',
  dash: 'rect',
  x: 'pin',
  star: 'pin',
  plus: 'pin',
  picture: 'circle',
};
const AUTO_SYMBOLS = ['diamond', 'rect', 'triangle', 'circle'];

interface CategoryInfo {
  labels: string[];
  levels?: Array<Array<string | null>>;
  count: number;
}

function categoriesOf(plot: ChartPlot, axis: ChartAxis | undefined, format: NumberFormatter): CategoryInfo {
  const withCat = plot.series.find(s => s.cat && s.cat.count) ?? plot.series.find(s => s.cat);
  const count = Math.max(0, ...plot.series.map(s => s.val?.count ?? s.val?.values.length ?? 0), withCat?.cat?.count ?? 0);
  const cat = withCat?.cat;
  const code = axis?.numFmt && !axis.numFmt.linked ? axis.numFmt.code : cat?.formatCode ?? axis?.numFmt?.code;
  const labels = Array.from({ length: count }, (_, i) => {
    const t = cat?.texts?.[i];
    if (t !== undefined && t !== null) return t;
    const v = cat?.values?.[i];
    if (v !== undefined && v !== null) return format(v, code);
    return cat ? '' : String(i + 1);
  });
  return { labels, levels: cat?.levels && !axis?.noMultiLvlLbl ? cat.levels : undefined, count };
}


export function buildChartOption(model: ChartModel, options: BuildOptions): BuiltChart {
  const { width, height, format } = options;
  const font = model.text.font ?? options.fontFamily ?? FALLBACK_FONT;
  const base = textStyle(model.text, font);
  const option: Record<string, any> = {
    animation: false,
    backgroundColor: fillOf(model.style, '#FFFFFF'),
    textStyle: { fontFamily: font, fontSize: base.fontSize, color: base.color },
    tooltip: { trigger: 'item', confine: true },
    series: [],
  };
  let top = 8;
  let bottom = 8;
  let left = 10;
  let right = 14;
  if (model.title) {
    const ts = textStyle(model.title.style, font);
    option.title = {
      text: model.title.text,
      left: 'center',
      top: 6,
      textStyle: { ...ts, fontWeight: model.title.style.bold === false ? 'normal' : ts.fontWeight },
    };
    if (!model.title.overlay) top += model.title.text.split('\n').length * ts.fontSize * 1.3 + 8;
  }
  const allSeries = model.plots.flatMap(p => p.series.map(s => ({ s, p })));
  const pieLike = model.plots.length > 0 && model.plots.every(p => p.type === 'pie' || p.type === 'doughnut');
  if (model.legend) {
    const ls = textStyle(model.legend.text, font);
    const pos = model.legend.pos;
    const legend: Record<string, any> = {
      textStyle: ls,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      type: 'scroll',
      pageIconSize: 10,
    };
    const items: Array<{ name: string; icon?: string }> = [];
    if (pieLike) {
      const p = model.plots[0];
      const cats = categoriesOf(p, undefined, format);
      cats.labels.forEach((name, i) => !model.legend!.hidden.has(i) && items.push({ name, icon: 'rect' }));
    } else {
      allSeries.forEach(({ s, p }, i) => {
        if (model.legend!.hidden.has(s.index) || model.legend!.hidden.has(i)) return;
        items.push({ name: s.name || `系列${i + 1}`, icon: p.type === 'line' || (p.type === 'scatter' && !isMarkerOnly(p, s)) ? undefined : 'rect' });
      });
    }
    legend.data = items;
    const legendH = ls.fontSize * 1.4 + 6;
    if (pos === 'b') {
      Object.assign(legend, { bottom: 6, left: 'center', orient: 'horizontal' });
      if (!model.legend.overlay) bottom += legendH + 4;
    } else if (pos === 't') {
      Object.assign(legend, { top, left: 'center', orient: 'horizontal' });
      if (!model.legend.overlay) top += legendH + 2;
    } else {
      // 图例标记 25px + 文字间距 5px，再留 4px 余量
      const widest = Math.max(0, ...items.map(it => measureText(it.name, ls.fontSize, ls.fontFamily))) + 34;
      const w = Math.min(widest, width * 0.4);
      Object.assign(legend, { orient: 'vertical', top: pos === 'tr' ? top : 'middle' });
      if (pos === 'l') {
        legend.left = 8;
        if (!model.legend.overlay) left += w + 8;
      } else {
        legend.right = 8;
        if (!model.legend.overlay) right += w + 8;
      }
      legend.textStyle = { ...ls, width: Math.max(20, w - 30), overflow: 'truncate' };
    }
    option.legend = legend;
  }
  // 图例里显示的系列名必须与 series.name 一致；同名系列用不可见字符区分
  const used = new Map<string, number>();
  const seriesName = (s: ChartSeries, i: number) => {
    const name = s.name || `系列${i + 1}`;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    return n ? `${name}${'\u200b'.repeat(n)}` : name;
  };

  if (pieLike) {
    buildPie(model, option, { top, bottom, left, right, width, height, format, font });
    return { option };
  }
  if (model.plots.some(p => p.type === 'radar')) {
    buildRadar(model, option, { top, bottom, left, right, width, height, format, font });
    return { option };
  }
  if (model.plots.some(p => EXTENDED.has(p.type))) {
    buildExtended(model, option, { top, bottom, left, right, width, height, format, font });
    return { option };
  }

  // 直角坐标系：按 axPos 把坐标轴分到 xAxis（上、下）与 yAxis（左、右）
  const axisById = new Map(model.axes.map(a => [a.id, a]));
  const xAxes: ChartAxis[] = [];
  const yAxes: ChartAxis[] = [];
  const indexOf = (axis: ChartAxis) => {
    const list = axis.pos === 'b' || axis.pos === 't' ? xAxes : yAxes;
    let i = list.indexOf(axis);
    if (i < 0) {
      list.push(axis);
      i = list.length - 1;
    }
    return { key: list === xAxes ? ('xAxis' as const) : ('yAxis' as const), index: i };
  };
  const plotAxes = model.plots.map(p => {
    const ids = p.axIds.map(id => axisById.get(id)).filter((a): a is ChartAxis => !!a);
    let cat = ids.find(a => a.kind !== 'val') ?? (p.type === 'scatter' || p.type === 'bubble' ? ids[0] : undefined);
    let valA = ids.find(a => a !== cat && a.kind === 'val');
    // 缺少坐标轴定义的文件：按方向补默认坐标轴
    const horizontal = p.type === 'bar' && p.barDir === 'bar';
    if (!cat) cat = defaultAxis(p.type === 'scatter' || p.type === 'bubble' ? 'val' : 'cat', horizontal ? 'l' : 'b', model);
    if (!valA) valA = defaultAxis('val', horizontal ? 'b' : 'l', model);
    // 条形图：分类轴在左右、数值轴在上下；有些文件 axPos 与方向不一致，按方向纠正
    if (horizontal && (cat.pos === 'b' || cat.pos === 't')) cat = { ...cat, pos: cat.pos === 'b' ? 'l' : 'r' };
    if (horizontal && (valA.pos === 'l' || valA.pos === 'r')) valA = { ...valA, pos: valA.pos === 'l' ? 'b' : 't' };
    if (!horizontal && (cat.pos === 'l' || cat.pos === 'r')) cat = { ...cat, pos: cat.pos === 'l' ? 'b' : 't' };
    if (!horizontal && (valA.pos === 'b' || valA.pos === 't')) valA = { ...valA, pos: valA.pos === 'b' ? 'l' : 'r' };
    if (cat.id) axisById.set(cat.id, cat);
    if (valA.id) axisById.set(valA.id, valA);
    return { cat, val: valA, catRef: indexOf(cat), valRef: indexOf(valA) };
  });

  const echX: any[] = [];
  const echY: any[] = [];
  let multiLevel: MultiLevelPlan | undefined;
  const gridW = Math.max(40, width - left - right - 40);
  const gridH = Math.max(40, height - top - bottom - 30);

  model.plots.forEach((plot, pi) => {
    const { cat, val, catRef, valRef } = plotAxes[pi];
    const xy = plot.type === 'scatter' || plot.type === 'bubble';
    const target = (ref: { key: 'xAxis' | 'yAxis'; index: number }) => (ref.key === 'xAxis' ? echX : echY);
    const percent = plot.grouping === 'percentStacked';
    const values = plot.series.flatMap(s => s.val?.values ?? []).filter((v): v is number => v !== null);
    const valFmt = val.numFmt && !val.numFmt.linked ? val.numFmt.code : percent ? '0%' : (plot.series[0]?.val?.formatCode ?? val.numFmt?.code);
    if (!target(valRef)[valRef.index]) target(valRef)[valRef.index] = valueAxis(val, valFmt, format, font, valRef.key, axisById);
    let cats: CategoryInfo = { labels: [], count: 0 };
    if (xy) {
      if (!target(catRef)[catRef.index]) {
        const xFmt = cat.numFmt && !cat.numFmt.linked ? cat.numFmt.code : plot.series[0]?.cat?.formatCode ?? cat.numFmt?.code;
        target(catRef)[catRef.index] = valueAxis(cat, xFmt, format, font, catRef.key, axisById);
      }
    } else if (!target(catRef)[catRef.index]) {
      cats = categoriesOf(plot, cat, format);
      const ax = categoryAxis(cat, cats, font, catRef.key, axisById, plot);
      const horizontalAxis = catRef.key === 'xAxis';
      const ts = textStyle(cat.text, font);
      if (horizontalAxis && cat.rotation === undefined && !cat.vertical) {
        Object.assign(ax.axisLabel, planCategoryLabels(cats.labels, ts.fontSize, ts.fontFamily, gridW / Math.max(1, cats.count)));
      } else if (!horizontalAxis) {
        const band = gridH / Math.max(1, cats.count);
        if (ts.fontSize * 1.25 > band) Object.assign(ax.axisLabel, { interval: 'auto', hideOverlap: true });
        Object.assign(ax.axisLabel, { width: Math.floor(width * 0.3), overflow: 'truncate' });
      }
      if (cats.levels && horizontalAxis && !multiLevel && ax.axisLabel.show !== false) {
        const innerHeight = labelBlockHeight(cats.labels, ax.axisLabel, ts.fontSize, ts.fontFamily) + (ax.axisLabel.margin ?? 8);
        multiLevel = {
          axisKey: 'xAxis',
          axisIndex: catRef.index,
          levels: cats.levels.slice(1).map(l => groupsOf(l, cats.count)),
          fontSize: ts.fontSize,
          color: ts.color,
          fontFamily: ts.fontFamily,
          innerHeight,
          rowHeight: ts.fontSize * 1.5 + 4,
          lineColor: cat.line?.color ?? '#D9D9D9',
        };
        // 分类轴在图表底部时为外层分组留出空间
        if (!ax.axisLine.onZero || (values.length && Math.min(...values) >= 0)) bottom += multiLevel.levels.length * multiLevel.rowHeight;
        // 外层分组的分隔线：内层标签之间不画刻度，分组之间画长刻度
        const levels = cats.levels;
        (ax as Record<string, unknown>).axisTick = {
          show: true,
          interval: (i: number) => i === 0 || levels.slice(1).some(l => l[i] !== null && l[i] !== undefined),
          length: innerHeight + multiLevel.levels.length * multiLevel.rowHeight,
          lineStyle: { color: multiLevel.lineColor },
        };
      }
      target(catRef)[catRef.index] = ax;
    } else {
      cats = categoriesOf(plot, cat, format);
    }
    const categoryKey = catRef.key;
    const countSeries = plot.type === 'bar' && plot.grouping === 'clustered' ? plot.series.length : 1;
    const g = plot.gapWidth / 100;
    const ov = -plot.overlap / 100;
    const catGap = g / (countSeries + Math.max(0, countSeries - 1) * ov + g);
    const sums = percent
      ? Array.from({ length: cats.count }, (_, i) => plot.series.reduce((acc, s) => acc + Math.abs(s.val?.values[i] ?? 0), 0))
      : undefined;
    plot.series.forEach((s, si) => {
      const name = seriesName(s, si);
      const axisIndexes = { [`${catRef.key}Index`]: catRef.index, [`${valRef.key}Index`]: valRef.index };
      const fmtCode = s.labels?.numFmt ?? (percent ? '0%' : s.val?.formatCode);
      const raw = (s.val?.values ?? []).map(v => (v === null ? (model.dispBlanksAs === 'zero' ? 0 : null) : v));
      const data = percent && sums ? raw.map((v, i) => (v === null ? null : sums[i] ? v / sums[i] : 0)) : raw;
      const color = fillOf(s.style, s.autoColor);
      const labelOpt = dataLabel(s.labels, plot, font, format, fmtCode, categoryKey === 'yAxis');
      if (plot.type === 'bar' || plot.type === 'histogram') {
        const items = data.map((v, i) => {
          const pt = s.points.get(i);
          const vary = plot.varyColors && plot.series.length === 1;
          const c = pt?.fill && pt.fill !== 'none' ? pt.fill : vary ? pointColor(model, i) : color;
          const item: Record<string, any> = { value: v };
          const style: Record<string, any> = {};
          if (c !== color) style.color = c;
          if (s.invertIfNegative && v !== null && v < 0) Object.assign(style, { color: '#FFFFFF', borderColor: c, borderWidth: 1 });
          if (Object.keys(style).length) item.itemStyle = style;
          if (labelOpt && v !== null && v < 0 && labelOpt.position === (categoryKey === 'xAxis' ? 'top' : 'right'))
            item.label = { position: categoryKey === 'xAxis' ? 'bottom' : 'left' };
          return item;
        });
        option.series.push({
          type: 'bar',
          name,
          ...axisIndexes,
          data: items,
          stack: plot.grouping === 'stacked' || percent ? `stack${pi}` : undefined,
          barGap: `${Math.round(ov * 100)}%`,
          barCategoryGap: `${Math.round(Math.max(0, Math.min(0.95, catGap)) * 100)}%`,
          itemStyle: {
            color,
            borderColor: s.style.line && !s.style.line.none ? s.style.line.color : undefined,
            borderWidth: s.style.line && !s.style.line.none ? s.style.line.width ?? 1 : 0,
          },
          label: labelOpt,
          emphasis: { disabled: true },
        });
        pushTrendline(option.series, s, data, name, axisIndexes, font);
      } else if (plot.type === 'line' || plot.type === 'area') {
        const ln = s.style.line;
        const lineColor = ln?.color ?? (plot.type === 'area' ? color : s.autoColor);
        const marker = s.marker;
        const symbol =
          plot.type === 'area' || marker?.symbol === 'none' || (!marker && plot.showMarker === false)
            ? 'none'
            : (SYMBOLS[marker?.symbol ?? ''] ?? AUTO_SYMBOLS[s.index % AUTO_SYMBOLS.length]);
        option.series.push({
          type: 'line',
          name,
          ...axisIndexes,
          data,
          stack: plot.grouping === 'stacked' || percent ? `stack${pi}` : undefined,
          smooth: s.smooth,
          connectNulls: model.dispBlanksAs === 'span',
          symbol,
          symbolSize: marker?.size ? (marker.size * 4) / 3 : 7,
          showSymbol: symbol !== 'none',
          lineStyle: ln?.none ? { width: 0, opacity: 0 } : { ...lineStyle(ln, lineColor, plot.type === 'area' ? 0 : 3) },
          itemStyle: { color: marker?.style.fill && marker.style.fill !== 'none' ? marker.style.fill : lineColor, borderColor: marker?.style.line?.color ?? lineColor },
          areaStyle: plot.type === 'area' ? { color, opacity: 1 } : undefined,
          label: labelOpt,
          emphasis: { disabled: true },
          z: plot.type === 'area' ? 1 : 3,
        });
        pushTrendline(option.series, s, data, name, axisIndexes, font);
      } else {
        // 散点图 / 气泡图
        const xs = s.cat?.values ?? [];
        const sizes = s.size?.values ?? [];
        const maxSize = Math.max(1, ...sizes.filter((v): v is number => v !== null).map(Math.abs));
        const scale = (plot.bubbleScale ?? 100) / 100;
        const pts = data.map((y, i) => {
          const x = s.cat?.texts && !s.cat.values.some(v => v !== null) ? i + 1 : xs[i] ?? i + 1;
          return y === null || x === null ? null : plot.type === 'bubble' ? [x, y, sizes[i] ?? 0] : [x, y];
        });
        const markerOnly = isMarkerOnly(plot, s);
        const ln = s.style.line;
        const c = s.marker?.style.fill && s.marker.style.fill !== 'none' ? s.marker.style.fill : plot.type === 'bubble' ? color : s.autoColor;
        option.series.push({
          type: markerOnly || plot.type === 'bubble' ? 'scatter' : 'line',
          name,
          ...axisIndexes,
          data: pts.filter(p => p !== null),
          smooth: s.smooth || plot.scatterStyle === 'smooth' || plot.scatterStyle === 'smoothMarker',
          symbol: s.marker?.symbol === 'none' ? 'none' : SYMBOLS[s.marker?.symbol ?? ''] ?? (plot.type === 'bubble' ? 'circle' : AUTO_SYMBOLS[s.index % AUTO_SYMBOLS.length]),
          symbolSize:
            plot.type === 'bubble'
              ? (v: number[]) => Math.max(4, Math.sqrt(Math.abs(v[2] ?? 0) / maxSize) * Math.min(width, height) * 0.25 * scale)
              : s.marker?.size
                ? (s.marker.size * 4) / 3
                : 7,
          lineStyle: markerOnly ? undefined : lineStyle(ln, ln?.color ?? s.autoColor, 2),
          itemStyle: { color: c, opacity: plot.type === 'bubble' ? 0.85 : 1 },
          label: labelOpt,
          emphasis: { disabled: true },
        });
        const ys = data.map(v => v);
        pushTrendline(option.series, s, ys, name, axisIndexes, font);
      }
    });
  });

  option.xAxis = echX.length ? echX : [{ type: 'category', show: false }];
  option.yAxis = echY.length ? echY : [{ type: 'value', show: false }];
  // ECharts 6：outerBoundsMode same 等同于旧的 containLabel（坐标轴标签算在 grid 区域内）
  option.grid = { top, bottom, left, right, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel', backgroundColor: fillOf(model.plotStyle, 'transparent'), show: !!model.plotStyle.fill && model.plotStyle.fill !== 'none', borderWidth: 0 };
  return { option, multiLevel };
}

const isMarkerOnly = (plot: ChartPlot, s: ChartSeries) =>
  plot.type === 'scatter' && (plot.scatterStyle === 'marker' || !!s.style.line?.none);

const DEFAULT_PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];

/** 「依数据点着色」时每个数据点的颜色 */
const pointColor = (model: ChartModel, i: number) => {
  const palette = model.palette?.length ? model.palette : DEFAULT_PALETTE;
  return palette[i % palette.length];
};

function defaultAxis(kind: 'cat' | 'val', pos: ChartAxis['pos'], model: ChartModel): ChartAxis {
  return {
    id: '',
    kind,
    pos,
    deleted: false,
    reversed: false,
    tickLblPos: 'nextTo',
    majorTickMark: 'none',
    crosses: 'autoZero',
    crossBetween: 'between',
    text: model.text,
    noMultiLvlLbl: false,
    majorGrid: kind === 'val' ? { color: '#D9D9D9', width: 1 } : undefined,
  };
}

function axisCommon(axis: ChartAxis, font: string, key: 'xAxis' | 'yAxis', byId: Map<string, ChartAxis>) {
  const ts = textStyle(axis.text, font);
  const cross = axis.crossAx ? byId.get(axis.crossAx) : undefined;
  const horizontal = key === 'xAxis';
  // 本坐标轴放在交叉轴的哪一端：crosses=max 放在另一端；tickLblPos=high / low 只移动标签
  let position: string = horizontal ? (axis.pos === 't' ? 'top' : 'bottom') : axis.pos === 'r' ? 'right' : 'left';
  const opposite = (p: string) => ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' })[p] as string;
  const crossReversed = !!cross?.reversed;
  if (axis.crosses === 'max') position = horizontal ? (crossReversed ? 'bottom' : 'top') : crossReversed ? 'left' : 'right';
  else if (axis.crosses === 'min' || axis.crosses === 'autoZero') position = horizontal ? (crossReversed ? 'top' : 'bottom') : crossReversed ? 'right' : 'left';
  if (axis.tickLblPos === 'high') position = opposite(position);
  const line = axis.line;
  return {
    show: !axis.deleted,
    position,
    inverse: axis.reversed,
    axisLine: {
      show: !line?.none,
      onZero: axis.crosses === 'autoZero' && axis.tickLblPos === 'nextTo',
      lineStyle: lineStyle(line, '#BFBFBF', 1),
    },
    axisTick: { show: axis.majorTickMark !== 'none', inside: axis.majorTickMark === 'in', lineStyle: { color: line?.color ?? '#BFBFBF' } },
    axisLabel: {
      show: axis.tickLblPos !== 'none',
      ...ts,
      margin: 6,
      rotate: axis.rotation !== undefined ? -axis.rotation : axis.vertical ? 90 : undefined,
    },
    splitLine: { show: !!axis.majorGrid, lineStyle: lineStyle(axis.majorGrid, '#D9D9D9', 1) },
    minorSplitLine: axis.minorGrid ? { show: true, lineStyle: lineStyle(axis.minorGrid, '#F2F2F2', 1) } : undefined,
    name: axis.title?.text || undefined,
    nameLocation: 'middle',
    nameTextStyle: axis.title ? textStyle(axis.title.style, font) : undefined,
    nameGap: horizontal ? ts.fontSize * 2 + 10 : ts.fontSize * 3.5 + 10,
    nameRotate: !horizontal ? 90 : undefined,
  };
}

function valueAxis(axis: ChartAxis, code: string | undefined, format: NumberFormatter, font: string, key: 'xAxis' | 'yAxis', byId: Map<string, ChartAxis>) {
  const common = axisCommon(axis, font, key, byId);
  const unit = axis.dispUnit && axis.dispUnit > 0 ? axis.dispUnit : 1;
  const log = axis.logBase && axis.logBase > 1;
  return {
    ...common,
    type: log ? 'log' : 'value',
    logBase: log ? axis.logBase : undefined,
    min: axis.min !== undefined ? axis.min : undefined,
    max: axis.max !== undefined ? axis.max : undefined,
    interval: axis.majorUnit && axis.majorUnit > 0 && !log ? axis.majorUnit : undefined,
    scale: false,
    axisLabel: {
      ...common.axisLabel,
      formatter: (v: number) => format(Math.abs(v) < 1e-12 ? 0 : v / unit, code),
      showMinLabel: true,
      showMaxLabel: true,
    },
  };
}

function categoryAxis(
  axis: ChartAxis,
  cats: CategoryInfo,
  font: string,
  key: 'xAxis' | 'yAxis',
  byId: Map<string, ChartAxis>,
  plot: ChartPlot
) {
  const common = axisCommon(axis, font, key, byId);
  // 条形图分类轴默认从下往上（Excel 第一个分类在最下面），与 ECharts 的 y 轴方向相同
  const between = axis.crossBetween !== 'midCat' || plot.type === 'bar';
  return {
    ...common,
    type: 'category',
    data: cats.labels,
    boundaryGap: between,
    axisLabel: { ...common.axisLabel, interval: axis.lblSkip && axis.lblSkip > 1 ? axis.lblSkip - 1 : common.axisLabel.show === false ? undefined : undefined },
  };
}

function labelFormatter(labels: DataLabels, format: NumberFormatter, code: string | undefined, percentValue?: (p: any) => number) {
  const sep = labels.separator ?? (labels.showPercent && labels.showCatName ? '\n' : ', ');
  return (p: any) => {
    const parts: string[] = [];
    const raw = Array.isArray(p.value) ? p.value[1] : p.value?.value ?? p.value;
    if (labels.showSerName) parts.push(String(p.seriesName ?? '').replace(/\u200b+$/, ''));
    if (labels.showCatName) parts.push(String(p.name ?? ''));
    if (labels.showVal && typeof raw === 'number') parts.push(format(raw, code));
    if (labels.showPercent) parts.push(format((percentValue ? percentValue(p) : p.percent ?? 0) / 100, '0%'));
    return parts.join(sep);
  };
}

function dataLabel(labels: DataLabels | undefined, plot: ChartPlot, font: string, format: NumberFormatter, code: string | undefined, horizontal: boolean) {
  if (!labels || !(labels.showVal || labels.showCatName || labels.showSerName || labels.showPercent)) return undefined;
  const pos = labels.position;
  let position: string;
  if (plot.type === 'bar') {
    position =
      pos === 'ctr'
        ? 'inside'
        : pos === 'inEnd'
          ? horizontal
            ? 'insideRight'
            : 'insideTop'
          : pos === 'inBase'
            ? horizontal
              ? 'insideLeft'
              : 'insideBottom'
            : plot.grouping === 'clustered' || !pos
              ? pos === undefined && plot.grouping !== 'clustered'
                ? 'inside'
                : horizontal
                  ? 'right'
                  : 'top'
              : horizontal
                ? 'right'
                : 'top';
  } else {
    position = ({ t: 'top', b: 'bottom', l: 'left', r: 'right', ctr: 'inside' } as Record<string, string>)[pos ?? 'r'] ?? 'right';
  }
  return { show: true, position, ...textStyle(labels.text, font), formatter: labelFormatter(labels, format, code) };
}

interface Frame {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  format: NumberFormatter;
  font: string;
}

function buildPie(model: ChartModel, option: Record<string, any>, f: Frame) {
  const plots = model.plots;
  const availW = f.width - f.left - f.right;
  const availH = f.height - f.top - f.bottom;
  const size = Math.max(20, Math.min(availW, availH));
  const cx = f.left + availW / 2;
  const cy = f.top + availH / 2;
  // 圆环图可以有多个系列（同心圆环）
  const plot = plots[0];
  const series = plot.type === 'doughnut' ? plot.series : plot.series.slice(0, 1);
  const outer = (size / 2) * 0.92;
  const hole = plot.type === 'doughnut' ? Math.min(90, Math.max(10, plot.holeSize ?? 50)) / 100 : 0;
  const ring = series.length ? (outer - outer * hole) / series.length : outer;
  series.forEach((s, si) => {
    const cats = categoriesOf({ ...plot, series: [s] }, undefined, f.format);
    const labels = s.labels;
    const code = labels?.numFmt ?? s.val?.formatCode;
    const data = (s.val?.values ?? []).map((v, i) => {
      const pt = s.points.get(i);
      const c = pt?.fill && pt.fill !== 'none' ? pt.fill : plot.varyColors ? pointColor(model, i) : fillOf(s.style, s.autoColor);
      return {
        name: cats.labels[i] ?? String(i + 1),
        value: v === null ? 0 : Math.abs(v),
        itemStyle: { color: c, borderColor: pt?.line?.color ?? s.style.line?.color ?? '#FFFFFF', borderWidth: pt?.line?.width ?? s.style.line?.width ?? 1 },
      };
    });
    const r0 = outer * hole + ring * si;
    const lbl = dataLabel(labels, plot, f.font, f.format, code, false);
    option.series.push({
      type: 'pie',
      name: s.name,
      center: [cx, cy],
      radius: [r0, r0 + ring],
      startAngle: 90 - (plot.firstSliceAng ?? 0),
      clockwise: true,
      data,
      label: lbl
        ? { ...lbl, position: labels?.position === 'outEnd' || labels?.position === 'bestFit' ? 'outside' : 'inside' }
        : { show: false },
      labelLine: { show: !!lbl && (labels?.position === 'outEnd' || labels?.position === 'bestFit') },
      emphasis: { disabled: true },
      selectedOffset: s.explosion ? (outer * s.explosion) / 100 : 0,
    });
  });
}


function buildRadar(model: ChartModel, option: Record<string, any>, f: Frame) {
  const plot = model.plots.find(p => p.type === 'radar')!;
  const cats = categoriesOf(plot, undefined, f.format);
  const all = plot.series.flatMap(s => s.val?.values ?? []).filter((v): v is number => v !== null);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const availW = f.width - f.left - f.right;
  const availH = f.height - f.top - f.bottom;
  option.radar = {
    center: [f.left + availW / 2, f.top + availH / 2],
    radius: Math.max(10, Math.min(availW, availH) / 2 - 24),
    indicator: cats.labels.map(name => ({ name, max: max * 1.1, min: min < 0 ? min * 1.1 : 0 })),
    axisName: { ...textStyle(model.text, f.font) },
  };
  option.series.push({
    type: 'radar',
    data: plot.series.map(s => ({
      name: s.name,
      value: (s.val?.values ?? []).map(v => v ?? 0),
      itemStyle: { color: s.style.line?.color ?? s.autoColor },
      lineStyle: lineStyle(s.style.line, s.autoColor, 2),
      areaStyle: plot.radarStyle === 'filled' ? { color: fillOf(s.style, s.autoColor), opacity: 0.6 } : undefined,
    })),
    emphasis: { disabled: true },
  });
}

function pushTrendline(
  series: any[],
  s: ChartSeries,
  data: Array<number | null>,
  name: string,
  axisIndexes: Record<string, number>,
  font: string
) {
  const t = s.trendline;
  if (!t) return;
  const pts = data.map((v, i) => (v === null ? null : { i, v }));
  const used = pts.filter((p): p is { i: number; v: number } => p !== null);
  if (used.length < 2) return;
  const fitted: Array<number | null> = data.map(() => null);
  if (t.type === 'movingAvg') {
    const period = Math.max(2, t.period ?? 2);
    data.forEach((_, i) => {
      if (i + 1 < period) return;
      const slice = data.slice(i + 1 - period, i + 1);
      if (slice.some(x => x === null)) return;
      fitted[i] = slice.reduce<number>((a, x) => a + (x ?? 0), 0) / period;
    });
  } else {
    const n = used.length;
    const sumX = used.reduce((a, p) => a + p.i, 0);
    const sumY = used.reduce((a, p) => a + p.v, 0);
    const sumXY = used.reduce((a, p) => a + p.i * p.v, 0);
    const sumXX = used.reduce((a, p) => a + p.i * p.i, 0);
    const den = n * sumXX - sumX * sumX;
    const b = den ? (n * sumXY - sumX * sumY) / den : 0;
    const a = (sumY - b * sumX) / n;
    data.forEach((_, i) => {
      fitted[i] = a + b * i;
    });
  }
  series.push({
    type: 'line',
    name: t.name || `${name} 趋势`,
    ...axisIndexes,
    data: fitted,
    showSymbol: false,
    lineStyle: { width: 2, type: 'dashed', color: '#ED7D31' },
    itemStyle: { color: '#ED7D31' },
    emphasis: { disabled: true },
    z: 4,
    tooltip: { show: false },
    textStyle: { fontFamily: font },
  });
}

function buildExtended(model: ChartModel, option: Record<string, any>, f: Frame) {
  const plot = model.plots.find(p => EXTENDED.has(p.type)) ?? model.plots[0];
  const s = plot.series[0];
  const cats = categoriesOf(plot, undefined, f.format);
  const values = (s?.val?.values ?? []).map(v => (v === null ? 0 : v));
  const color = s ? fillOf(s.style, s.autoColor) : '#4472C4';
  option.grid = { top: f.top, bottom: f.bottom, left: f.left, right: f.right, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' };
  if (plot.type === 'waterfall') return buildWaterfall(option, plot, cats, f, color);
  if (plot.type === 'treemap' || plot.type === 'sunburst') return buildTree(option, plot, cats, f);
  if (plot.type === 'boxplot') return buildBoxplot(option, plot, cats, f);
  if (plot.type === 'funnel') {
    option.series.push({
      type: 'funnel',
      left: f.left,
      top: f.top,
      width: Math.max(20, f.width - f.left - f.right),
      height: Math.max(20, f.height - f.top - f.bottom),
      data: cats.labels.map((name, i) => ({ name, value: Math.abs(values[i] ?? 0) })),
      sort: 'descending',
      label: { show: true, ...textStyle(model.text, f.font) },
      itemStyle: { color },
      emphasis: { disabled: true },
    });
    return;
  }
  if (plot.type === 'stock') return buildStock(option, plot, cats, f);
}

function buildWaterfall(option: Record<string, any>, plot: ChartPlot, cats: CategoryInfo, f: Frame, color: string) {
  const s = plot.series[0];
  const raw = s?.val?.values ?? [];
  const totals = new Set(s?.subtotals ?? []);
  if (!totals.size && raw.length) totals.add(raw.length - 1);
  const base: number[] = [];
  const delta: Array<{ value: number; itemStyle: { color: string } }> = [];
  let acc = 0;
  raw.forEach((v, i) => {
    const n = v ?? 0;
    if (totals.has(i)) {
      base.push(0);
      delta.push({ value: n, itemStyle: { color: '#5B9BD5' } });
      acc = n;
      return;
    }
    base.push(n >= 0 ? acc : acc + n);
    delta.push({ value: Math.abs(n), itemStyle: { color: n >= 0 ? color : '#C00000' } });
    acc += n;
  });
  option.xAxis = { type: 'category', data: cats.labels, axisTick: { show: false } };
  option.yAxis = { type: 'value', splitLine: { lineStyle: { color: '#D9D9D9' } } };
  option.series = [
    { type: 'bar', stack: 'wf', data: base, itemStyle: { color: 'transparent' }, silent: true, tooltip: { show: false }, emphasis: { disabled: true } },
    { type: 'bar', stack: 'wf', name: s?.name || '', data: delta, emphasis: { disabled: true } },
  ];
  void f;
}

function treeNodes(plot: ChartPlot, cats: CategoryInfo): Array<{ name: string; value?: number; children?: any[] }> {
  const values = plot.series[0]?.val?.values ?? [];
  const levels = cats.levels && cats.levels.length > 1 ? cats.levels : [cats.labels.map(l => l as string | null)];
  const outer = levels[levels.length - 1] ?? cats.labels;
  const inner = levels[0] ?? cats.labels;
  const root = new Map<string, { name: string; children: Map<string, { name: string; value: number }> }>();
  cats.labels.forEach((_, i) => {
    const o = String(outer[i] ?? cats.labels[i] ?? i);
    const n = String(inner[i] ?? cats.labels[i] ?? i);
    let group = root.get(o);
    if (!group) {
      group = { name: o, children: new Map() };
      root.set(o, group);
    }
    const prev = group.children.get(n);
    group.children.set(n, { name: n, value: (prev?.value ?? 0) + Math.abs(values[i] ?? 0) });
  });
  const nodes = [...root.values()].map(g => ({
    name: g.name,
    children: [...g.children.values()],
  }));
  return nodes.length === 1 && nodes[0].children ? nodes[0].children : nodes;
}

function buildTree(option: Record<string, any>, plot: ChartPlot, cats: CategoryInfo, f: Frame) {
  const data = treeNodes(plot, cats);
  option.series.push({
    type: plot.type === 'sunburst' ? 'sunburst' : 'treemap',
    data,
    left: f.left,
    top: f.top,
    width: Math.max(20, f.width - f.left - f.right),
    height: Math.max(20, f.height - f.top - f.bottom),
    label: { show: true },
    roam: false,
    nodeClick: false,
    breadcrumb: { show: false },
    emphasis: { disabled: true },
  });
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const k = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

function boxOf(nums: number[]): [number, number, number, number, number] | null {
  const s = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  return [s[0], percentile(s, 0.25), percentile(s, 0.5), percentile(s, 0.75), s[s.length - 1]];
}

function buildBoxplot(option: Record<string, any>, plot: ChartPlot, cats: CategoryInfo, f: Frame) {
  const boxes = plot.series.map(s => boxOf((s.val?.values ?? []).filter((v): v is number => v !== null)));
  const names = plot.series.map((s, i) => s.name || cats.labels[i] || `系列${i + 1}`);
  option.xAxis = { type: 'category', data: names, axisTick: { show: false } };
  option.yAxis = { type: 'value', splitLine: { lineStyle: { color: '#D9D9D9' } } };
  option.series.push({
    type: 'boxplot',
    data: boxes,
    itemStyle: { color: '#4472C4', borderColor: '#2F5496' },
    emphasis: { disabled: true },
  });
  void f;
}

function seriesByHint(plot: ChartPlot, hints: string[]): ChartSeries | undefined {
  return plot.series.find(s => hints.some(h => s.name.toLowerCase().includes(h)));
}

function buildStock(option: Record<string, any>, plot: ChartPlot, cats: CategoryInfo, f: Frame) {
  const open = seriesByHint(plot, ['open', '开盘']);
  const high = seriesByHint(plot, ['high', '最高']);
  const low = seriesByHint(plot, ['low', '最低']);
  const close = seriesByHint(plot, ['close', '收盘']);
  const ordered =
    plot.series.length >= 4
      ? [open ?? plot.series[0], close ?? plot.series[3] ?? plot.series[plot.series.length - 1], low ?? plot.series[2], high ?? plot.series[1]]
      : [plot.series[2], plot.series[2], plot.series[1], plot.series[0]];
  const count = Math.max(cats.count, ...plot.series.map(s => s.val?.values.length ?? 0));
  const data = Array.from({ length: count }, (_, i) => {
    const o = ordered[0]?.val?.values[i] ?? ordered[1]?.val?.values[i] ?? 0;
    const c = ordered[1]?.val?.values[i] ?? o;
    const lo = ordered[2]?.val?.values[i] ?? Math.min(o ?? 0, c ?? 0);
    const hi = ordered[3]?.val?.values[i] ?? Math.max(o ?? 0, c ?? 0);
    return [o ?? 0, c ?? 0, lo ?? 0, hi ?? 0];
  });
  option.xAxis = { type: 'category', data: cats.labels.length ? cats.labels : data.map((_, i) => String(i + 1)), axisTick: { show: false } };
  option.yAxis = { type: 'value', scale: true, splitLine: { lineStyle: { color: '#D9D9D9' } } };
  option.series.push({
    type: 'candlestick',
    data,
    itemStyle: { color: '#70AD47', color0: '#C00000', borderColor: '#70AD47', borderColor0: '#C00000' },
    emphasis: { disabled: true },
  });
  void f;
}
