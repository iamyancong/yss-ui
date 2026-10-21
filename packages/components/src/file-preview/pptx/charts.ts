/**
 * 图表排版修正（只被 pptx 渲染器使用）。
 *
 * @aiden0z/pptx-renderer 1.4.0 用 ECharts 画图表，有两处与 PowerPoint 不一致，这里在图表初始化后逐个修正：
 * 1. 字号单位：图表、图例、坐标轴、数据标签上单独设置的字号（`a:defRPr sz` / `a:rPr sz`，单位 1/100 pt）
 *    被直接当作 px 使用，比 PowerPoint 小 25%（例如图例 10pt 显示成 10px）。整张图表的默认字号
 *    （chartSpace 上的 txPr）库已经按 pt → px 换算，不需要处理。这里按文件里的字号重新换算（px = pt × 4/3）。
 * 2. 分类轴标签：库固定「每个标签都显示、不旋转」，标签多或文字长时互相重叠。这里按可用宽度依次尝试：
 *    原样显示 → 折成两行 → 旋转 45° → 旋转 45° 并自动隔几个显示（与 PowerPoint 的自动处理接近）。
 *
 * 修正只读取图表 XML 与 ECharts 实例，不修改库，失败时保持库的原始效果。
 */

/** ECharts 实例（只声明用到的部分） */
export interface ChartLike {
  getDom(): HTMLElement;
  getOption(): any;
  setOption(option: any): void;
  getWidth?(): number;
  getHeight?(): number;
  convertToPixel?(finder: any, value: any): any;
  isDisposed?(): boolean;
}

/** 从图表 XML 读出的字号（px），未设置的项为 undefined */
export interface ChartFontSizes {
  /** 整张图表的默认字号（chartSpace txPr），库已正确换算，仅作为其他项的回退 */
  base?: number;
  /** 图表标题里出现的显式字号（库误按 px 使用的值 → 正确 px） */
  title: Array<{ raw: number; px: number }>;
  legend?: number;
  /** 坐标轴，按 XML 顺序 */
  axes: Array<{ kind: 'category' | 'value'; pos: string; px?: number; deleted: boolean }>;
  /** 每个系列的数据标签字号，按 XML 顺序 */
  labels: Array<number | undefined>;
}

const PT_TO_PX = 96 / 72;

const toPx = (sz: number) => Math.round((sz / 100) * PT_TO_PX * 100) / 100;

const ns = '(?:[\\w-]+:)?';

/** 取第一个 `<tag ...>...</tag>` 的完整文本（tag 不嵌套同名元素时可用） */
const section = (xml: string, tag: string, from = 0): { text: string; end: number } | undefined => {
  const open = new RegExp(`<${ns}${tag}(?:\\s[^>]*)?(/?)>`, 'g');
  open.lastIndex = from;
  const m = open.exec(xml);
  if (!m) return undefined;
  if (m[1] === '/') return { text: m[0], end: m.index + m[0].length };
  const close = new RegExp(`</${ns}${tag}>`, 'g');
  close.lastIndex = m.index + m[0].length;
  const c = close.exec(xml);
  if (!c) return undefined;
  return { text: xml.slice(m.index, c.index + c[0].length), end: c.index + c[0].length };
};

const sections = (xml: string, tag: string): string[] => {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const s = section(xml, tag, from);
    if (!s) return out;
    out.push(s.text);
    from = s.end;
  }
};

/** 去掉某类子元素（例如坐标轴里的轴标题、系列里的数据点），避免读到其中的字号 */
const strip = (xml: string, tag: string) => sections(xml, tag).reduce((acc, s) => acc.replace(s, ''), xml);

const szOf = (xml: string | undefined, rpr = 'defRPr'): number | undefined => {
  if (!xml) return undefined;
  const m = new RegExp(`<${ns}${rpr}\\b[^>]*\\ssz\\s*=\\s*["'](\\d+)["']`).exec(xml);
  const sz = m ? Number(m[1]) : NaN;
  return sz > 0 ? sz : undefined;
};

/** txPr 里的默认字号（1/100 pt） */
const txPrSz = (xml: string | undefined) => szOf(section(xml ?? '', 'txPr')?.text);

/** 解析图表 XML 中的字号设置（正则解析，不依赖 DOMParser） */
export function parseChartFonts(xml: string): ChartFontSizes {
  const result: ChartFontSizes = { title: [], axes: [], labels: [] };
  const chart = section(xml, 'chart')?.text ?? '';
  // chartSpace 的 txPr 在 <c:chart> 之后
  const outside = xml.replace(chart, '');
  const baseSz = txPrSz(outside);
  if (baseSz) result.base = toPx(baseSz);

  const plotStart = chart.search(new RegExp(`<${ns}plotArea\\b`));
  const head = plotStart >= 0 ? chart.slice(0, plotStart) : chart;
  const title = section(head, 'title')?.text;
  if (title) {
    const seen = new Set<number>();
    const re = new RegExp(`<${ns}(?:defRPr|rPr)\\b[^>]*\\ssz\\s*=\\s*["'](\\d+)["']`, 'g');
    for (let m = re.exec(title); m; m = re.exec(title)) {
      const sz = Number(m[1]);
      const raw = Math.round(sz / 100);
      if (sz > 0 && !seen.has(raw)) {
        seen.add(raw);
        result.title.push({ raw, px: toPx(sz) });
      }
    }
  }

  const legend = section(chart, 'legend')?.text;
  const legendSz = txPrSz(legend ? strip(legend, 'legendEntry') : undefined);
  if (legendSz) result.legend = toPx(legendSz);

  const plot = section(chart, 'plotArea')?.text ?? '';
  const axisRe = new RegExp(`<${ns}(catAx|dateAx|serAx|valAx)\\b`, 'g');
  for (let m = axisRe.exec(plot); m; m = axisRe.exec(plot)) {
    const ax = section(plot, m[1], m.index);
    if (!ax) break;
    const body = strip(ax.text, 'title');
    if (m[1] !== 'serAx') {
      const sz = txPrSz(body);
      result.axes.push({
        kind: m[1] === 'valAx' ? 'value' : 'category',
        pos: /<(?:[\w-]+:)?axPos\b[^>]*val\s*=\s*["'](\w)["']/.exec(body)?.[1] ?? '',
        px: sz ? toPx(sz) : undefined,
        deleted: /<(?:[\w-]+:)?delete\b[^>]*val\s*=\s*["'](?:1|true)["']/.test(body),
      });
    }
    axisRe.lastIndex = ax.end;
  }

  // 数据标签：系列上的 dLbls 优先，其次是图表组（barChart 等）上的 dLbls
  const groupRe = new RegExp(`<${ns}(\\w+Chart)\\b`, 'g');
  for (let m = groupRe.exec(plot); m; m = groupRe.exec(plot)) {
    const group = section(plot, m[1], m.index);
    if (!group) break;
    const sers = sections(group.text, 'ser');
    const groupLbls = section(
      sers.reduce((acc, s) => acc.replace(s, ''), group.text),
      'dLbls'
    )?.text;
    const groupSz = txPrSz(groupLbls ? strip(groupLbls, 'dLbl') : undefined);
    sers.forEach(ser => {
      const lbls = section(ser, 'dLbls')?.text;
      const sz = txPrSz(lbls ? strip(lbls, 'dLbl') : undefined) ?? groupSz;
      result.labels.push(sz ? toPx(sz) : undefined);
    });
    groupRe.lastIndex = group.end;
  }
  return result;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** 文字宽度（px）。没有 canvas 时按字符估算：中日韩等全角字符 1em，其余 0.55em */
export function measureText(text: string, fontSize: number, fontFamily = 'sans-serif'): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx && typeof measureCtx.measureText === 'function') {
    measureCtx.font = `${fontSize}px ${fontFamily}`;
    const w = measureCtx.measureText(text).width;
    if (Number.isFinite(w) && w > 0) return w;
  }
  let units = 0;
  for (const ch of text)
    units += /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  return units * fontSize;
}

const asArray = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** 分类轴标签的排版方案 */
export interface LabelPlan {
  rotate?: number;
  interval?: number | 'auto';
  hideOverlap?: boolean;
  width?: number;
  overflow?: 'break' | 'truncate';
  /** 按空格折行（例如「Q1 第一季度」折成「Q1」「第一季度」，不把词拆开） */
  formatter?: (value: string) => string;
}

/** 按空格把文字折成多行，每行不超过 width；单个词超过 width 时返回 undefined */
export function wrapWords(text: string, width: number, fontSize: number, fontFamily?: string): string[] | undefined {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    if (measureText(word, fontSize, fontFamily) > width) return undefined;
    const last = lines[lines.length - 1];
    if (last !== undefined && measureText(`${last} ${word}`, fontSize, fontFamily) <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

const LINE = 1.25;
/** 不含空格与中日韩文字的连续字符（英文单词、数字） */
const LATIN_WORD = /[^\s\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]+/g;

/**
 * 横向分类轴（柱形图、折线图的 X 轴）：按每个分类的宽度决定标签怎么放。
 * @param band 每个分类占的宽度（px）
 * @param maxLength 标签旋转后允许的最大长度（px），超过截断
 * @param canRotate 坐标轴标签不在图表内（containLabel=false）时不旋转，避免被裁掉
 */
export function planHorizontalLabels(
  labels: string[],
  fontSize: number,
  fontFamily: string | undefined,
  band: number,
  maxLength: number,
  canRotate = true
): LabelPlan | undefined {
  if (!labels.length || !(band > 0) || !(fontSize > 0)) return undefined;
  const widths = labels.map(l => measureText(String(l ?? ''), fontSize, fontFamily));
  const widest = Math.max(...widths);
  // 留一点间距：放得下就保持库的效果
  if (widest <= band - Math.max(4, fontSize * 0.3)) return undefined;

  // 两行能放下：折行（PowerPoint 也会先折行）
  const wrap = Math.floor(band * 0.92);
  if (wrap >= fontSize * 2) {
    const byWords = labels.map(label => wrapWords(String(label ?? ''), wrap, fontSize, fontFamily));
    if (byWords.every(lines => lines && lines.length <= 2)) {
      const fitted = new Map(labels.map((label, i) => [String(label ?? ''), (byWords[i] as string[]).join('\n')]));
      return { interval: 0, formatter: (value: string) => fitted.get(String(value)) ?? String(value) };
    }
    let lines = 0;
    let longestWord = 0;
    labels.forEach((label, i) => {
      // 折行后每行会有空余，按 85% 利用率估算
      lines = Math.max(lines, Math.ceil(widths[i] / (wrap * 0.85)));
      // 中日韩文字可以在任意字之间折行；英文、数字只能在词之间折行
      (String(label ?? '').match(LATIN_WORD) ?? []).forEach(word => {
        longestWord = Math.max(longestWord, measureText(word, fontSize, fontFamily));
      });
    });
    if (lines <= 2 && longestWord <= wrap) return { interval: 0, width: wrap, overflow: 'break' };
  }

  if (!canRotate) return { interval: 'auto', hideOverlap: true };
  const plan: LabelPlan = { rotate: 45 };
  if (widest > maxLength) Object.assign(plan, { width: Math.floor(maxLength), overflow: 'truncate' });
  // 45° 时相邻标签在垂直方向上的间距是 band × sin45°，小于一行高度就会重叠，改为自动隔几个显示
  if (band * Math.SQRT1_2 >= fontSize * LINE) plan.interval = 0;
  else Object.assign(plan, { interval: 'auto', hideOverlap: true });
  return plan;
}

/**
 * 纵向分类轴（条形图的 Y 轴）：行高放不下时自动隔几个显示，标签过长时折行 / 截断。
 * @param band 每个分类占的高度（px）
 * @param maxWidth 标签允许的最大宽度（px）
 */
export function planVerticalLabels(
  labels: string[],
  fontSize: number,
  fontFamily: string | undefined,
  band: number,
  maxWidth: number
): LabelPlan | undefined {
  if (!labels.length || !(band > 0) || !(fontSize > 0)) return undefined;
  const plan: LabelPlan = {};
  const widest = Math.max(...labels.map(l => measureText(String(l ?? ''), fontSize, fontFamily)));
  const lineH = fontSize * LINE;
  if (widest > maxWidth) {
    const lines = Math.ceil(widest / (maxWidth * 0.85));
    Object.assign(plan, {
      width: Math.floor(maxWidth),
      overflow: lines >= 2 && band >= lineH * 2 ? 'break' : 'truncate',
    });
  }
  if (lineH > band) Object.assign(plan, { interval: 'auto', hideOverlap: true });
  return Object.keys(plan).length ? plan : undefined;
}

const num = (v: unknown, total: number): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().endsWith('%')) {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? (n / 100) * total : undefined;
  }
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/** 每个分类占的长度：用 ECharts 坐标换算，失败时按图表尺寸估算 */
const bandOf = (chart: ChartLike, key: 'xAxisIndex' | 'yAxisIndex', index: number, count: number, fallback: number) => {
  try {
    if (count >= 2 && chart.convertToPixel) {
      const a = chart.convertToPixel({ [key]: index }, 0);
      const b = chart.convertToPixel({ [key]: index }, 1);
      const d = Math.abs(Number(b) - Number(a));
      if (Number.isFinite(d) && d > 0) return d;
    }
  } catch {
    // 估算
  }
  return fallback / Math.max(1, count);
};

/** 更新图表外层的 HTML 图例（库把图例画成 DOM，不是 ECharts 图例） */
const resizeHtmlLegend = (legend: HTMLElement, fontSize: number) => {
  legend.querySelectorAll<HTMLElement>('span').forEach(span => {
    span.style.fontSize = `${fontSize}px`;
  });
  legend.querySelectorAll<SVGElement>('svg').forEach(svg => {
    const w = Number(svg.getAttribute('width'));
    const h = Number(svg.getAttribute('height'));
    // 图标大小与字号相同（库的规则）；折线图例的图标更宽，按比例放大
    if (w > 0 && h > 0) {
      const ratio = fontSize / Math.min(w, h);
      if (ratio > 1) {
        svg.setAttribute('width', String(Math.round(w * ratio * 100) / 100));
        svg.setAttribute('height', String(Math.round(h * ratio * 100) / 100));
      }
    }
  });
};

/**
 * 修正一个已初始化的图表。
 * @param fonts 图表 XML 中的字号；找不到对应图表时传 undefined，只调整分类轴标签
 */
export function adjustChart(chart: ChartLike, fonts: ChartFontSizes | undefined): void {
  if (chart.isDisposed?.()) return;
  const option = chart.getOption?.();
  if (!option) return;
  const dom = chart.getDom();
  const host = dom.parentElement;
  const width = chart.getWidth?.() || dom.offsetWidth || 0;
  const height = chart.getHeight?.() || dom.offsetHeight || 0;
  const patch: Record<string, any> = {};

  // 1. 字号
  if (fonts) {
    const titles = asArray<any>(option.title);
    if (titles.length && fonts.title.length) {
      const fix = (v: unknown) => fonts.title.find(t => t.raw === v)?.px;
      patch.title = titles.map(t => {
        const style = t?.textStyle ?? {};
        const rich: Record<string, any> = {};
        Object.entries<any>(style.rich ?? {}).forEach(([k, r]) => {
          const px = fix(r?.fontSize);
          if (px) rich[k] = { ...r, fontSize: px };
        });
        const px = fix(style.fontSize);
        return { textStyle: { ...(px ? { fontSize: px } : {}), ...(Object.keys(rich).length ? { rich } : {}) } };
      });
    }

    const legendPx = fonts.legend;
    if (legendPx) {
      patch.legend = asArray<any>(option.legend).map(() => ({
        textStyle: { fontSize: legendPx },
        itemWidth: legendPx,
        itemHeight: legendPx,
      }));
      const html = host?.querySelector<HTMLElement>('.pptx-chart-custom-legend');
      if (html) resizeHtmlLegend(html, legendPx);
    }

    // 坐标轴：ECharts 的 X / Y 轴分别对应 XML 中位于下 / 上（b、t）与左 / 右（l、r）的坐标轴，同类型按顺序对应
    const pool = fonts.axes.slice();
    const take = (type: string, horizontal: boolean) => {
      const kind = type === 'value' ? 'value' : 'category';
      const sideOk = (pos: string) => (horizontal ? pos === 'b' || pos === 't' : pos === 'l' || pos === 'r');
      let i = pool.findIndex(a => a.kind === kind && sideOk(a.pos));
      if (i < 0) i = pool.findIndex(a => a.kind === kind);
      return i >= 0 ? pool.splice(i, 1)[0] : undefined;
    };
    (['xAxis', 'yAxis'] as const).forEach(key => {
      const axes = asArray<any>(option[key]);
      if (!axes.length) return;
      let changed = false;
      const list = axes.map(axis => {
        const xml = take(axis?.type, key === 'xAxis');
        const px = xml?.px ?? fonts.base;
        if (!px || axis?.axisLabel?.show === false || axis?.axisLabel?.fontSize === px) return {};
        changed = true;
        return { axisLabel: { fontSize: px } };
      });
      if (changed) patch[key] = list;
    });

    const series = asArray<any>(option.series);
    if (series.length && fonts.labels.some(Boolean)) {
      let changed = false;
      const list = series.map((s, i) => {
        const px = fonts.labels[i];
        if (!px || !s?.label?.show) return {};
        changed = true;
        return { label: { fontSize: px } };
      });
      if (changed) patch.series = list;
    }
  }
  if (Object.keys(patch).length) chart.setOption(patch);

  // 2. HTML 图例变大后不能压住绘图区
  const grid = asArray<any>(chart.getOption().grid)[0];
  const legendEl = host?.querySelector<HTMLElement>('.pptx-chart-custom-legend');
  const gridPatch: Record<string, number> = {};
  if (grid && legendEl && width && height) {
    // 图例可能用 transform 居中，按实际显示位置计算；幻灯片整体缩放时换算回图表自身的像素
    const box = dom.getBoundingClientRect();
    const rect = legendEl.getBoundingClientRect();
    const scale = box.width && dom.offsetWidth ? box.width / dom.offsetWidth : 1;
    const top = (rect.top - box.top) / scale;
    const left = (rect.left - box.left) / scale;
    const lw = rect.width / scale;
    const lh = rect.height / scale;
    const gap = 6;
    if (lw > 0 && lh > 0) {
      const gTop = num(grid.top, height);
      const gBottom = num(grid.bottom, height);
      const gLeft = num(grid.left, width);
      const gRight = num(grid.right, width);
      const vertical = legendEl.style.flexDirection === 'column';
      const center = vertical ? left + lw / 2 : top + lh / 2;
      if (!vertical && center < height / 2 && gTop !== undefined && gTop < top + lh + gap)
        gridPatch.top = Math.ceil(top + lh + gap);
      if (!vertical && center >= height / 2 && gBottom !== undefined && height - gBottom > top - gap)
        gridPatch.bottom = Math.ceil(height - top + gap);
      if (vertical && center >= width / 2 && gRight !== undefined && width - gRight > left - gap)
        gridPatch.right = Math.ceil(width - left + gap);
      if (vertical && center < width / 2 && gLeft !== undefined && gLeft < left + lw + gap)
        gridPatch.left = Math.ceil(left + lw + gap);
    }
  }
  if (Object.keys(gridPatch).length) chart.setOption({ grid: [gridPatch] });

  // 3. 分类轴标签
  const current = chart.getOption();
  const containLabel = asArray<any>(current.grid)[0]?.containLabel !== false;
  (['xAxis', 'yAxis'] as const).forEach(key => {
    const axes = asArray<any>(current[key]);
    let changed = false;
    const list = axes.map((axis, index) => {
      const label = axis?.axisLabel ?? {};
      const data = asArray<any>(axis?.data).map(d => (d && typeof d === 'object' ? d.value : d));
      if (axis?.type !== 'category' || label.show === false || !data.length) return {};
      const fontSize = Number(label.fontSize) || 12;
      const horizontal = key === 'xAxis';
      const indexKey = horizontal ? 'xAxisIndex' : 'yAxisIndex';
      const band = bandOf(chart, indexKey, index, data.length, horizontal ? width : height);
      const plan = horizontal
        ? planHorizontalLabels(
            data,
            fontSize,
            label.fontFamily,
            band,
            Math.max(fontSize * 3, (height * 0.3) / Math.SQRT1_2),
            containLabel
          )
        : planVerticalLabels(data, fontSize, label.fontFamily, band, Math.max(fontSize * 4, width * 0.3));
      if (!plan) return {};
      changed = true;
      return { axisLabel: plan };
    });
    if (changed) chart.setOption({ [key]: list });
  });
}

/** 图表节点（只声明用到的部分） */
interface ChartNode {
  nodeType?: string;
  chartPath?: string;
  position?: { x: number; y: number };
  size?: { w: number; h: number };
  children?: ChartNode[];
}

const collectCharts = (nodes: ChartNode[] | undefined, out: ChartNode[] = []) => {
  (nodes ?? []).forEach(node => {
    if (node?.nodeType === 'chart' && node.chartPath) out.push(node);
    if (Array.isArray(node?.children)) collectCharts(node.children, out);
  });
  return out;
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * 找到图表 DOM 对应的图表文件路径：库把图表画在一个与形状位置、尺寸相同的绝对定位容器里，
 * 按位置和尺寸匹配；匹配不到时按出现顺序对应。
 */
export function findChartPath(dom: HTMLElement, slideRoot: HTMLElement, nodes: unknown): string | undefined {
  const charts = collectCharts(nodes as ChartNode[]);
  if (!charts.length) return undefined;
  const host = dom.parentElement;
  if (!host) return undefined;
  const px = (v: string) => Number.parseFloat(v);
  const box = { x: px(host.style.left), y: px(host.style.top), w: px(host.style.width), h: px(host.style.height) };
  const hit = charts.filter(
    n =>
      n.position &&
      n.size &&
      near(n.position.x, box.x) &&
      near(n.position.y, box.y) &&
      near(n.size.w, box.w) &&
      near(n.size.h, box.h)
  );
  if (hit.length === 1) return hit[0].chartPath;
  const hosts = Array.from(slideRoot.querySelectorAll<HTMLElement>('[_echarts_instance_]')).map(el => el.parentElement);
  const order = hosts.indexOf(host);
  if (hit.length > 1) return hit[Math.min(Math.max(order, 0), hit.length - 1)].chartPath;
  return order >= 0 && hosts.length === charts.length ? charts[order].chartPath : undefined;
}
