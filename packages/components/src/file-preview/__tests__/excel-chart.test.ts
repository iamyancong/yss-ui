/**
 * 图表 XML → ChartModel → ECharts option：类型、多级分类、负值、空系列、日期轴。
 */
import { describe, expect, it } from 'vitest';
import { fillSeriesFromCells, parseChart, parseChartEx, type ChartModel } from '../excel/chart';
import { buildChartOption } from '../excel/chart-option';
import { DEFAULT_THEME_COLORS, type ThemeInfo } from '../excel/dml';

const theme: ThemeInfo = { colors: DEFAULT_THEME_COLORS };
const format = (v: number) => String(v);

const ser = (name: string, cats: string[], vals: Array<number | null>, extra = '') =>
  `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${name}</c:v></c:tx>
    <c:cat><c:strLit><c:ptCount val="${cats.length}"/>${cats.map((c, i) => `<c:pt idx="${i}"><c:v>${c}</c:v></c:pt>`).join('')}</c:strLit></c:cat>
    <c:val><c:numLit><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numLit></c:val>${extra}</c:ser>`;

const space = (
  plot: string,
  axes = `<c:catAx><c:axId val="1"/><c:delete val="0"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:delete val="0"/><c:axPos val="l"/></c:valAx>`
) =>
  `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Title</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea>${plot}${axes}</c:plotArea><c:legend><c:legendPos val="r"/></c:legend></c:chart></c:chartSpace>`;

const parse = (xml: string | null) => parseChart(xml, { theme });

const chartExXml = (layout: string, extra = '') =>
  `<?xml version="1.0"?><cx:chartSpace xmlns:cx="cx"><cx:chart><cx:title><cx:tx><cx:txData><cx:v>${layout}</cx:v></cx:txData></cx:tx></cx:title><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="${layout}"><cx:dataId val="0"/>${extra}</cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart><cx:chartData><cx:data id="0"><cx:strDim type="cat"><cx:lvl ptCount="3"><cx:pt idx="0">A</cx:pt><cx:pt idx="1">B</cx:pt><cx:pt idx="2">C</cx:pt></cx:lvl></cx:strDim><cx:numDim type="val"><cx:lvl ptCount="3"><cx:pt idx="0">10</cx:pt><cx:pt idx="1">-4</cx:pt><cx:pt idx="2">6</cx:pt></cx:lvl></cx:numDim></cx:data></cx:chartData></cx:chartSpace>`;

describe('parseChart', () => {
  it.each([
    ['barChart', 'bar'],
    ['lineChart', 'line'],
    ['areaChart', 'area'],
    ['pieChart', 'pie'],
    ['doughnutChart', 'doughnut'],
    ['radarChart', 'radar'],
  ] as const)('%s 识别为 %s', (tag, type) => {
    const dir = tag === 'barChart' ? '<c:barDir val="col"/>' : '';
    const model = parse(
      space(`<c:${tag}>${dir}${ser('Alpha', ['A', 'B'], [12, -5])}<c:axId val="1"/><c:axId val="2"/></c:${tag}>`)
    );
    expect(model?.plots[0].type).toBe(type);
    expect(model?.plots[0].series[0].val?.values).toEqual([12, -5]);
    expect(model?.title?.text).toBe('Title');
  });

  it('散点图读 xVal / yVal', () => {
    const model = parse(
      space(
        `<c:scatterChart><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>P</c:v></c:tx>
          <c:xVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit></c:xVal>
          <c:yVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>-5</c:v></c:pt></c:numLit></c:yVal>
        </c:ser><c:axId val="1"/><c:axId val="2"/></c:scatterChart>`
      )
    );
    expect(model?.plots[0].type).toBe('scatter');
    expect(model?.plots[0].series[0].cat?.values).toEqual([1, 2]);
    expect(model?.plots[0].series[0].val?.values).toEqual([12, -5]);
  });

  it('簇状 / 堆积 / 百分比堆积 / 条形', () => {
    const bar = (grouping: string, dir: string) =>
      parse(
        space(
          `<c:barChart><c:barDir val="${dir}"/><c:grouping val="${grouping}"/>${ser('A', ['X'], [1])}<c:axId val="1"/><c:axId val="2"/></c:barChart>`
        )
      )!;
    expect(bar('clustered', 'col').plots[0]).toMatchObject({ grouping: 'clustered', barDir: 'col' });
    expect(bar('stacked', 'col').plots[0].grouping).toBe('stacked');
    expect(bar('percentStacked', 'col').plots[0].grouping).toBe('percentStacked');
    expect(bar('clustered', 'bar').plots[0].barDir).toBe('bar');
  });

  it('多级分类读取 levels；空系列 count 为 0；3D 按 2D 解析', () => {
    const multi = parse(
      space(`<c:barChart><c:barDir val="col"/>
        <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Alpha</c:v></c:tx>
          <c:cat><c:multiLvlStrRef><c:f>Sheet1!$A$2:$B$4</c:f><c:multiLvlStrCache><c:ptCount val="3"/>
            <c:lvl><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt><c:pt idx="2"><c:v>C</c:v></c:pt></c:lvl>
            <c:lvl><c:pt idx="0"><c:v>North</c:v></c:pt><c:pt idx="2"><c:v>South</c:v></c:pt></c:lvl>
          </c:multiLvlStrCache></c:multiLvlStrRef></c:cat>
          <c:val><c:numLit><c:ptCount val="3"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt></c:numLit></c:val>
        </c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>`)
    );
    expect(multi?.plots[0].series[0].cat?.levels?.[1]).toEqual(['North', null, 'South']);
    const empty = parse(
      space(
        `<c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Empty</c:v></c:tx><c:val><c:numLit><c:ptCount val="0"/></c:numLit></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>`
      )
    );
    expect(empty?.plots[0].series[0].val?.count).toBe(0);
    const d3 = parse(
      space(
        `<c:bar3DChart><c:barDir val="col"/>${ser('A', ['X'], [1])}<c:axId val="1"/><c:axId val="2"/></c:bar3DChart>`
      )
    );
    expect(d3?.plots[0]).toMatchObject({ type: 'bar', is3D: true });
  });

  it('日期轴、曲面图记为未支持、不是图表时返回 null', () => {
    const date = parse(
      space(
        `<c:lineChart>${ser('Value', [], [3, 10])}<c:axId val="1"/><c:axId val="2"/></c:lineChart>`,
        `<c:dateAx><c:axId val="1"/><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="yyyy-mm" sourceLinked="0"/></c:dateAx><c:valAx><c:axId val="2"/><c:axPos val="l"/></c:valAx>`
      )
    );
    expect(date?.axes.find(a => a.kind === 'date')?.numFmt?.code).toBe('yyyy-mm');
    const surface = parse(space(`<c:surfaceChart><c:wireframe val="0"/></c:surfaceChart>`));
    expect(surface?.plots).toEqual([]);
    expect(surface?.unsupported).toContain('surfaceChart');
    expect(parse('<not-a-chart/>')).toBeNull();
    expect(parse(null)).toBeNull();
  });
});

describe('parseChartEx', () => {
  it('瀑布 / 树状 / 旭日 / 直方图 / 箱线 / 漏斗能解析成可画的模型', () => {
    expect(parseChartEx(chartExXml('waterfall'))?.plots[0].type).toBe('waterfall');
    expect(parseChartEx(chartExXml('treemap'))?.plots[0].type).toBe('treemap');
    expect(parseChartEx(chartExXml('sunburst'))?.plots[0].type).toBe('sunburst');
    expect(parseChartEx(chartExXml('histogram'))?.plots[0].type).toBe('histogram');
    expect(parseChartEx(chartExXml('boxWhisker'))?.plots[0].type).toBe('boxplot');
    expect(parseChartEx(chartExXml('funnel'))?.plots[0].type).toBe('funnel');
    expect(parseChartEx(chartExXml('waterfall'))?.plots[0].series[0].val?.values).toEqual([10, -4, 6]);
  });

  it('地图图表仍记为不支持', () => {
    const model = parseChartEx(chartExXml('regionMap'));
    expect(model?.plots).toEqual([]);
    expect(model?.unsupported).toContain('regionMap');
  });
});

describe('fillSeriesFromCells', () => {
  it('没有缓存时从单元格补数', () => {
    const model = parse(
      space(
        `<c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$C$1</c:f></c:strRef></c:tx><c:val><c:numRef><c:f>Sheet1!$C$2:$C$3</c:f></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>`
      )
    )!;
    expect(model.plots[0].series[0].val?.count).toBe(0);
    fillSeriesFromCells(model, ref => {
      if (ref.includes('$C$1')) return [[{ text: 'Alpha' }]];
      if (ref.includes('$C$2')) return [[{ text: '12', num: 12 }], [{ text: '8', num: 8 }]];
      return undefined;
    });
    expect(model.plots[0].series[0].name).toBe('Alpha');
    expect(model.plots[0].series[0].val?.values).toEqual([12, 8]);
  });
});

describe('buildChartOption', () => {
  const optionOf = (model: ChartModel) => buildChartOption(model, { width: 400, height: 240, format });

  it('柱形、饼图、散点、雷达都能生成 series；负值保留', () => {
    const bar = optionOf(
      parse(
        space(
          `<c:barChart><c:barDir val="col"/>${ser('Alpha', ['A', 'B'], [12, -5])}<c:axId val="1"/><c:axId val="2"/></c:barChart>`
        )
      )!
    );
    expect(bar.option.series[0].type).toBe('bar');
    expect(bar.option.series[0].data.map((d: { value: number }) => d.value ?? d)).toEqual(
      expect.arrayContaining([12, -5])
    );
    const pie = optionOf(parse(space(`<c:pieChart>${ser('S', ['A', 'B'], [1, 2])}</c:pieChart>`, ''))!);
    expect(pie.option.series[0].type).toBe('pie');
    const scatter = optionOf(
      parse(
        space(
          `<c:scatterChart><c:scatterStyle val="marker"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>P</c:v></c:tx><c:xVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit></c:xVal><c:yVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v>4</c:v></c:pt></c:numLit></c:yVal><c:spPr><a:ln xmlns:a="a"><a:noFill/></a:ln></c:spPr></c:ser><c:axId val="1"/><c:axId val="2"/></c:scatterChart>`
        )
      )!
    );
    expect(scatter.option.series[0].type).toBe('scatter');
    const radar = optionOf(
      parse(space(`<c:radarChart>${ser('R', ['A', 'B'], [1, 2])}<c:axId val="1"/><c:axId val="2"/></c:radarChart>`))!
    );
    expect(radar.option.series[0].type).toBe('radar');
  });

  it('图表 spPr 无填充/无线条时不发明外框；roundedCorners 跟文件走', () => {
    const none = parse(
      `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:chart><c:plotArea><c:barChart><c:barDir val="col"/>${ser('A', ['X'], [1])}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:axPos val="l"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`
    );
    expect(none?.style.fill).toBe('none');
    expect(none?.style.line?.none).toBe(true);
    expect(none?.roundedCorners).toBe(false);

    const lined = parse(
      `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:roundedCorners val="1"/><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="ED7D31"/></a:solidFill></a:ln></c:spPr><c:chart><c:plotArea><c:barChart><c:barDir val="col"/>${ser('A', ['X'], [1])}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:axPos val="l"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`
    );
    expect(lined?.style.line?.none).toBeFalsy();
    expect(lined?.style.line?.color?.toLowerCase()).toContain('ed7d31');
    expect(lined?.roundedCorners).toBe(true);
  });

  it('瀑布、漏斗、股票图生成对应 series；趋势线补一条虚线', () => {
    const wf = optionOf(parseChartEx(chartExXml('waterfall'))!);
    expect(wf.option.series.some((s: { stack?: string }) => s.stack === 'wf')).toBe(true);
    const funnel = optionOf(parseChartEx(chartExXml('funnel'))!);
    expect(funnel.option.series[0].type).toBe('funnel');
    const stock = optionOf(
      parse(
        space(
          `<c:stockChart>
            <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>High</c:v></c:tx><c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>14</c:v></c:pt></c:numLit></c:val></c:ser>
            <c:ser><c:idx val="1"/><c:order val="1"/><c:tx><c:v>Low</c:v></c:tx><c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>8</c:v></c:pt><c:pt idx="1"><c:v>9</c:v></c:pt></c:numLit></c:val></c:ser>
            <c:ser><c:idx val="2"/><c:order val="2"/><c:tx><c:v>Close</c:v></c:tx><c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>11</c:v></c:pt></c:numLit></c:val></c:ser>
            <c:axId val="1"/><c:axId val="2"/>
          </c:stockChart>`
        )
      )!
    );
    expect(stock.option.series[0].type).toBe('candlestick');
    const trend = optionOf(
      parse(
        space(
          `<c:lineChart>${ser('A', ['X', 'Y'], [1, 3])}<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>A</c:v></c:tx>
            <c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>X</c:v></c:pt><c:pt idx="1"><c:v>Y</c:v></c:pt></c:strLit></c:cat>
            <c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>3</c:v></c:pt></c:numLit></c:val>
            <c:trendline><c:trendlineType val="linear"/></c:trendline>
          </c:ser><c:axId val="1"/><c:axId val="2"/></c:lineChart>`
        )
      )!
    );
    expect(trend.option.series.some((s: { lineStyle?: { type?: string } }) => s.lineStyle?.type === 'dashed')).toBe(true);
  });

  it('百分比堆积用 percent 轴；多级分类给出 multiLevel；空系列不抛错', () => {
    const pct = optionOf(
      parse(
        space(
          `<c:barChart><c:barDir val="col"/><c:grouping val="percentStacked"/>${ser('A', ['X', 'Y'], [1, 2])}<c:axId val="1"/><c:axId val="2"/></c:barChart>`
        )
      )!
    );
    expect(JSON.stringify(pct.option)).toMatch(/percent|%/);
    const multi = parse(
      space(`<c:barChart><c:barDir val="col"/>
        <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Alpha</c:v></c:tx>
          <c:cat><c:multiLvlStrRef><c:multiLvlStrCache><c:ptCount val="2"/>
            <c:lvl><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt></c:lvl>
            <c:lvl><c:pt idx="0"><c:v>North</c:v></c:pt><c:pt idx="1"><c:v>North</c:v></c:pt></c:lvl>
          </c:multiLvlStrCache></c:multiLvlStrRef></c:cat>
          <c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit></c:val>
        </c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>`)
    )!;
    expect(optionOf(multi).multiLevel?.levels.length).toBeGreaterThan(0);
    expect(() =>
      optionOf(
        parse(
          space(
            `<c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>E</c:v></c:tx><c:val><c:numLit><c:ptCount val="0"/></c:numLit></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart>`
          )
        )!
      )
    ).not.toThrow();
  });
});
