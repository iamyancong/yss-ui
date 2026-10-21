import { describe, expect, it, vi } from 'vitest';
import {
  adjustChart,
  findChartPath,
  measureText,
  parseChartFonts,
  planHorizontalLabels,
  planVerticalLabels,
  wrapWords,
  type ChartLike,
} from '../pptx/charts';

const txPr = (sz: number) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

/** 与 python-pptx 默认生成的图表相同：chartSpace 18pt，图例单独 10pt，坐标轴未设置 */
const DEFAULT_DECK_XML = `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:autoTitleDeleted val="1"/>
<c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/></c:ser><c:ser><c:idx val="1"/></c:ser></c:barChart>
<c:catAx><c:axId val="1"/><c:delete val="0"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:delete val="0"/><c:axPos val="l"/></c:valAx></c:plotArea>
<c:legend><c:legendPos val="t"/><c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="Microsoft YaHei"/></a:defRPr></a:pPr></a:p></c:txPr></c:legend>
</c:chart>${txPr(1800)}</c:chartSpace>`;

const EXPLICIT_XML = `<c:chartSpace><c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>Explicit</a:t></a:r></a:p></c:rich></c:tx></c:title>
<c:plotArea><c:barChart><c:ser><c:dLbls>${txPr(1100)}<c:showVal val="1"/></c:dLbls></c:ser><c:ser/><c:dLbls>${txPr(900)}</c:dLbls></c:barChart>
<c:lineChart><c:ser/></c:lineChart>
<c:catAx><c:delete val="0"/><c:axPos val="b"/>${txPr(1400)}</c:catAx>
<c:valAx><c:delete val="0"/><c:axPos val="l"/><c:title><c:tx><c:rich><a:p><a:pPr><a:defRPr sz="3000"/></a:pPr></a:p></c:rich></c:tx></c:title>${txPr(1200)}</c:valAx>
<c:valAx><c:delete val="1"/><c:axPos val="r"/></c:valAx></c:plotArea>
<c:legend><c:legendEntry><c:idx val="0"/>${txPr(4000)}</c:legendEntry>${txPr(1600)}</c:legend></c:chart></c:chartSpace>`;

describe('parseChartFonts', () => {
  it('reads chart-level and legend sizes and converts pt to px', () => {
    const fonts = parseChartFonts(DEFAULT_DECK_XML);
    expect(fonts.base).toBe(24);
    expect(fonts.legend).toBe(13.33);
    expect(fonts.title).toEqual([]);
    expect(fonts.axes).toEqual([
      { kind: 'category', pos: 'b', px: undefined, deleted: false },
      { kind: 'value', pos: 'l', px: undefined, deleted: false },
    ]);
    expect(fonts.labels).toEqual([undefined, undefined]);
  });

  it('reads element sizes and ignores nested titles / legend entries', () => {
    const fonts = parseChartFonts(EXPLICIT_XML);
    expect(fonts.base).toBeUndefined();
    expect(fonts.title).toEqual([{ raw: 24, px: 32 }]);
    expect(fonts.legend).toBe(21.33);
    expect(fonts.axes).toEqual([
      { kind: 'category', pos: 'b', px: 18.67, deleted: false },
      { kind: 'value', pos: 'l', px: 16, deleted: false },
      { kind: 'value', pos: 'r', px: undefined, deleted: true },
    ]);
    // 系列自己的 dLbls 优先，其次是图表组的 dLbls，其他组没有设置
    expect(fonts.labels).toEqual([14.67, 12, undefined]);
  });

  it('tolerates empty or broken xml', () => {
    expect(parseChartFonts('')).toEqual({ title: [], axes: [], labels: [] });
    expect(parseChartFonts('<c:chartSpace><c:chart><c:plotArea><c:catAx>')).toMatchObject({ axes: [] });
  });
});

describe('measureText / wrapWords', () => {
  it('estimates width without canvas (CJK 1em, latin 0.55em)', () => {
    expect(measureText('第一季度', 20)).toBe(80);
    expect(measureText('ab', 10)).toBeCloseTo(11);
  });

  it('wraps at spaces only', () => {
    expect(wrapWords('Q1 第一季度', 100, 20)).toEqual(['Q1', '第一季度']);
    expect(wrapWords('Q4 预测', 100, 20)).toEqual(['Q4 预测']);
    expect(wrapWords('第一季度', 50, 20)).toBeUndefined();
  });
});

describe('planHorizontalLabels', () => {
  it('keeps labels that fit', () => {
    expect(planHorizontalLabels(['A', 'B'], 12, undefined, 100, 200)).toBeUndefined();
    expect(planHorizontalLabels([], 12, undefined, 100, 200)).toBeUndefined();
    expect(planHorizontalLabels(['A'], 12, undefined, 0, 200)).toBeUndefined();
  });

  it('wraps at the space first (Q1 第一季度 → two lines)', () => {
    const plan = planHorizontalLabels(['Q1 第一季度', 'Q4 预测'], 24, undefined, 124, 300);
    expect(plan?.interval).toBe(0);
    expect(plan?.rotate).toBeUndefined();
    expect(plan?.formatter?.('Q1 第一季度')).toBe('Q1\n第一季度');
    expect(plan?.formatter?.('Q4 预测')).toBe('Q4 预测');
    expect(plan?.formatter?.('other')).toBe('other');
  });

  it('breaks CJK labels without spaces into two lines', () => {
    expect(planHorizontalLabels(['华东区域销售', '华南区域销售'], 24, undefined, 100, 300)).toEqual({
      interval: 0,
      width: 92,
      overflow: 'break',
    });
  });

  it('rotates when a latin word does not fit, and truncates very long labels', () => {
    expect(planHorizontalLabels(['September 2026'], 20, undefined, 80, 300)).toEqual({ rotate: 45, interval: 0 });
    expect(planHorizontalLabels(['September 2026'], 20, undefined, 80, 60)).toEqual({
      rotate: 45,
      interval: 0,
      width: 60,
      overflow: 'truncate',
    });
  });

  it('skips labels when even rotated labels would collide', () => {
    expect(planHorizontalLabels(['Alpha Beta Gamma Delta'], 20, undefined, 20, 300)).toEqual({
      rotate: 45,
      interval: 'auto',
      hideOverlap: true,
    });
  });

  it('does not rotate when labels are positioned outside the grid', () => {
    expect(planHorizontalLabels(['Alpha Beta Gamma Delta Epsilon'], 20, undefined, 60, 300, false)).toEqual({
      interval: 'auto',
      hideOverlap: true,
    });
  });
});

describe('planVerticalLabels', () => {
  it('hides every other label when rows are too short and limits width', () => {
    expect(planVerticalLabels(['A', 'B'], 12, undefined, 30, 100)).toBeUndefined();
    expect(planVerticalLabels(['A', 'B'], 20, undefined, 10, 100)).toEqual({ interval: 'auto', hideOverlap: true });
    expect(planVerticalLabels(['西南区域销售十一'], 20, undefined, 60, 100)).toEqual({ width: 100, overflow: 'break' });
    expect(planVerticalLabels(['西南区域销售十一'], 20, undefined, 30, 100)).toEqual({
      width: 100,
      overflow: 'truncate',
    });
  });
});

/** 只实现 adjustChart 用到的部分；setOption 合并到 option 上，便于检查结果 */
const fakeChart = (option: any, size = { w: 560, h: 380 }) => {
  const host = document.createElement('div');
  const dom = document.createElement('div');
  host.appendChild(dom);
  const merge = (target: any, patch: any) => {
    Object.entries(patch).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        target[k] = target[k] ?? [];
        v.forEach((item, i) => {
          target[k][i] = target[k][i] ?? {};
          merge(target[k][i], item);
        });
      } else if (v && typeof v === 'object' && typeof v !== 'function') {
        target[k] = target[k] ?? {};
        merge(target[k], v);
      } else target[k] = v;
    });
  };
  const chart = {
    option,
    getDom: () => dom,
    getOption: () => option,
    getWidth: () => size.w,
    getHeight: () => size.h,
    setOption: vi.fn((patch: any) => merge(option, patch)),
    isDisposed: () => false,
  };
  return { chart: chart as typeof chart & ChartLike, host, dom };
};

const quarterOption = () => ({
  title: [],
  legend: [{ show: false, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 }],
  grid: [{ containLabel: true, left: 14, right: 15, top: 21, bottom: 23 }],
  xAxis: [
    {
      type: 'category',
      data: ['Q1 第一季度', 'Q2 第二季度', 'Q3 第三季度', 'Q4 预测'],
      axisLabel: { fontSize: 24, interval: 0, rotate: 0 },
    },
  ],
  yAxis: [{ type: 'value', axisLabel: { fontSize: 24 } }],
  series: [
    { type: 'bar', label: {} },
    { type: 'bar', label: {} },
  ],
});

describe('adjustChart', () => {
  it('fixes legend size (html legend too) and wraps overlapping category labels', () => {
    const { chart, host } = fakeChart(quarterOption());
    host.insertAdjacentHTML(
      'beforeend',
      '<div class="pptx-chart-custom-legend"><div><svg width="10" height="10"></svg><span style="font-size:10px">目标</span></div></div>'
    );
    adjustChart(chart, parseChartFonts(DEFAULT_DECK_XML));
    expect(chart.option.legend[0]).toMatchObject({ textStyle: { fontSize: 13.33 }, itemWidth: 13.33 });
    expect(host.querySelector('span')!.style.fontSize).toBe('13.33px');
    expect(host.querySelector('svg')!.getAttribute('width')).toBe('13.33');
    // 坐标轴字号与文件一致（18pt = 24px），不重复设置
    expect(chart.option.xAxis[0].axisLabel.fontSize).toBe(24);
    // 每个分类约 140px（无法换算坐标时按图表宽度估算），「Q1 第一季度」放不下 → 在空格处折行
    expect(chart.option.xAxis[0].axisLabel.formatter('Q2 第二季度')).toBe('Q2\n第二季度');
  });

  it('applies explicit title / axis / label sizes', () => {
    const { chart } = fakeChart({
      title: [{ textStyle: { fontSize: 24, rich: { r0: { fontSize: 24 } } } }],
      xAxis: [{ type: 'category', data: ['A', 'B'], axisLabel: { fontSize: 14 } }],
      yAxis: [
        { type: 'value', axisLabel: { fontSize: 12 } },
        { type: 'value', axisLabel: { show: false } },
      ],
      series: [{ label: { show: true, fontSize: 11 } }, { label: { show: false } }, { label: { show: true } }],
    });
    adjustChart(chart, parseChartFonts(EXPLICIT_XML));
    expect(chart.option.title[0].textStyle).toEqual({ fontSize: 32, rich: { r0: { fontSize: 32 } } });
    expect(chart.option.xAxis[0].axisLabel.fontSize).toBe(18.67);
    expect(chart.option.yAxis[0].axisLabel.fontSize).toBe(16);
    expect(chart.option.yAxis[1].axisLabel.fontSize).toBeUndefined();
    expect(chart.option.series.map((s: any) => s.label.fontSize)).toEqual([14.67, undefined, undefined]);
  });

  it('handles horizontal bars and missing fonts', () => {
    const data = Array.from({ length: 20 }, (_, i) => `西南区域销售${i}`);
    const { chart } = fakeChart({
      xAxis: [{ type: 'value', axisLabel: { fontSize: 12 } }],
      yAxis: [{ type: 'category', data, axisLabel: { fontSize: 24 } }],
    });
    adjustChart(chart, undefined);
    expect(chart.option.yAxis[0].axisLabel).toMatchObject({
      interval: 'auto',
      hideOverlap: true,
      overflow: 'truncate',
    });
  });

  it('does nothing for disposed charts or charts without option', () => {
    const { chart } = fakeChart(quarterOption());
    adjustChart({ ...chart, isDisposed: () => true }, undefined);
    adjustChart({ ...chart, getOption: () => undefined }, undefined);
    expect(chart.setOption).not.toHaveBeenCalled();
  });

  it('uses convertToPixel for the category width when available', () => {
    const { chart } = fakeChart(quarterOption());
    (chart as any).convertToPixel = (_: unknown, i: number) => i * 400;
    adjustChart(chart, undefined);
    // 每个分类 400px：放得下，不修改
    expect(chart.option.xAxis[0].axisLabel.formatter).toBeUndefined();
  });
});

describe('findChartPath', () => {
  const slide = (boxes: Array<[number, number, number, number]>) => {
    const root = document.createElement('div');
    const doms = boxes.map(([x, y, w, h]) => {
      const host = document.createElement('div');
      Object.assign(host.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const dom = document.createElement('div');
      dom.setAttribute('_echarts_instance_', 'ec');
      host.appendChild(dom);
      root.appendChild(host);
      return dom;
    });
    return { root, doms };
  };
  const node = (chartPath: string, x: number, y: number, w = 100, h = 80) => ({
    nodeType: 'chart',
    chartPath,
    position: { x, y },
    size: { w, h },
  });

  it('matches by position and size, including charts inside groups', () => {
    const { root, doms } = slide([
      [10, 20, 100, 80],
      [200, 20.2, 100, 80],
    ]);
    const nodes = [
      { nodeType: 'shape' },
      node('ppt/charts/chart1.xml', 10, 20),
      { nodeType: 'group', children: [node('ppt/charts/chart2.xml', 200, 20)] },
    ];
    expect(findChartPath(doms[1], root, nodes)).toBe('ppt/charts/chart2.xml');
    expect(findChartPath(doms[0], root, nodes)).toBe('ppt/charts/chart1.xml');
  });

  it('falls back to order when positions do not match', () => {
    const { root, doms } = slide([
      [0, 0, 1, 1],
      [5, 5, 1, 1],
    ]);
    const nodes = [node('a.xml', 50, 50), node('b.xml', 60, 60)];
    expect(findChartPath(doms[1], root, nodes)).toBe('b.xml');
    expect(findChartPath(doms[0], root, [node('a.xml', 50, 50)])).toBeUndefined();
    expect(findChartPath(doms[0], root, undefined)).toBeUndefined();
  });

  it('uses order among identical boxes', () => {
    const { root, doms } = slide([
      [10, 10, 100, 80],
      [10, 10, 100, 80],
    ]);
    const nodes = [node('a.xml', 10, 10), node('b.xml', 10, 10)];
    expect(findChartPath(doms[1], root, nodes)).toBe('b.xml');
  });
});
