/**
 * 合成 xlsx 夹具：图表类型、锚点、冻结、隐藏行列、损坏 XML、缺失图片、不安全链接、OLE。
 * 夹具由 fixtures/make-xlsx-objects.py 生成。
 */
import { describe, expect, it } from 'vitest';
import { applySheetModel, type XsSheet } from '../excel/apply';
import { fillSeriesFromCells } from '../excel/chart';
import { createCellFormatter } from '../excel/format';
import { createRefResolver } from '../excel/refs';
import { parseXlsxModel } from '../excel/xlsx';
import { loadFixture } from './helpers';

const emptyXs = (name: string): XsSheet => ({
  name,
  styles: [{}],
  rows: { len: 1 },
  cols: { len: 1 },
});

describe('xlsx-charts.xlsx', () => {
  it('解析簇状 / 堆积 / 条形 / 折线 / 面积 / 饼 / 圆环 / 散点 / 组合 / 雷达，以及多级分类、负值、日期轴、空系列', async () => {
    const model = (await parseXlsxModel(loadFixture('xlsx-charts.xlsx'), { locale: 'en-US' }))!;
    const charts = model.sheets[0];
    const types = (charts.extras?.objects ?? [])
      .map(o => (o.item.type === 'chart' ? o.item.chart?.plots.map(p => p.type) : o.item.type))
      .flat();
    expect(types).toEqual(expect.arrayContaining(['bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar']));
    const titles = (charts.extras?.objects ?? [])
      .filter(o => o.item.type === 'chart')
      .map(o => (o.item.type === 'chart' ? o.item.chart?.title?.text : undefined));
    expect(titles).toEqual(
      expect.arrayContaining([
        'Clustered column',
        'Stacked column',
        'Percent stacked',
        'Horizontal bar',
        'Multi-level categories',
        'Line',
        'Area',
        'Pie',
        'Doughnut',
        'Scatter',
        'Radar',
      ])
    );
    const resolve = createRefResolver(model, null, () => 'Charts');
    const fill = (title: string) => {
      const hit = charts.extras?.objects.find(o => o.item.type === 'chart' && o.item.chart?.title?.text === title);
      if (hit?.item.type === 'chart' && hit.item.chart) fillSeriesFromCells(hit.item.chart, ref => resolve(ref));
      return hit;
    };
    const multi = fill('Multi-level categories');
    expect(multi?.item.type === 'chart' && (multi.item.chart?.plots[0].series[0].cat?.levels?.length ?? 0) > 1).toBe(true);
    const clustered = fill('Clustered column');
    const vals = clustered?.item.type === 'chart' ? clustered.item.chart?.plots[0].series.flatMap(s => s.val?.values ?? []) : [];
    expect(vals?.some(v => typeof v === 'number' && v < 0)).toBe(true);

    const dates = model.sheets.find(s => s.name === 'Dates')!;
    const dateChart = dates.extras?.objects.find(o => o.item.type === 'chart');
    expect(dateChart && dateChart.item.type === 'chart' && dateChart.item.chart?.axes.some(a => a.kind === 'date' || a.numFmt?.code?.includes('yy'))).toBe(true);
    const empty = dates.extras?.objects.find(o => o.item.type === 'chart' && o.item.chart?.title?.text === 'Empty series');
    expect(empty && empty.item.type === 'chart' && empty.item.chart?.plots[0].series.every(s => !s.val?.count)).toBe(true);
  });
});

describe('xlsx-objects.xlsx', () => {
  it('三种锚点、冻结区内图片、跨隐藏行、超出已用区域、形状、批注、安全链接、条件格式、迷你图、标签颜色', async () => {
    const model = (await parseXlsxModel(loadFixture('xlsx-objects.xlsx'), { locale: 'en-US' }))!;
    const pictures = model.sheets.find(s => s.name === 'Pictures')!;
    expect(pictures.freeze).toEqual({ rows: 2, cols: 1 });
    expect(pictures.hiddenRows.has(9)).toBe(true);
    expect(pictures.extras?.tabColor).toMatch(/^#/);
    const kinds = (pictures.extras?.objects ?? []).map(o => o.anchor.kind);
    expect(kinds).toEqual(expect.arrayContaining(['one', 'two', 'abs']));
    const far = pictures.extras?.objects.find(o => o.anchor.from?.col === 15 && o.anchor.from?.row === 59);
    expect(far).toBeTruthy();
    expect(pictures.extras?.objects.some(o => o.item.type === 'shape')).toBe(true);
    expect(pictures.extras?.objects.some(o => o.item.type === 'picture')).toBe(true);

    const target = emptyXs('Pictures');
    applySheetModel(target, pictures, model, { formatter: createCellFormatter(null, { locale: 'en-US' }), mdw: 7 });
    expect((target.rows as { len?: number }).len).toBeGreaterThan(60);
    expect((target.cols as { len?: number }).len).toBeGreaterThan(15);

    const notes = model.sheets.find(s => s.name === 'Notes & links')!;
    expect(notes.extras?.comments[0]).toMatchObject({ row: 0, col: 0, text: expect.stringContaining('Synthetic note') });
    expect(notes.extras?.links.some(l => l.url?.startsWith('https://'))).toBe(true);
    expect(notes.extras?.links.some(l => l.url?.startsWith('mailto:'))).toBe(true);
    expect(notes.extras?.links.some(l => l.location)).toBe(true);
    expect(notes.extras?.links.some(l => l.url?.startsWith('javascript:'))).toBe(false);
    expect(notes.cf?.bars.length).toBeGreaterThan(0);
    expect(notes.cf?.styles.size).toBeGreaterThan(0);
    expect(notes.cf?.unsupported).toBeGreaterThan(0);
    expect(notes.extras?.sparklines.map(g => g.type)).toEqual(expect.arrayContaining(['line', 'column']));
  });
});

describe('xlsx-broken.xlsx', () => {
  it('截断 XML、不支持的类型、chartex 显示为占位；缺失图片；大量图表', async () => {
    const model = (await parseXlsxModel(loadFixture('xlsx-broken.xlsx'), { locale: 'en-US' }))!;
    const broken = model.sheets[0];
    const charts = (broken.extras?.objects ?? []).filter(o => o.item.type === 'chart' || o.item.type === 'chartex');
    expect(charts.length).toBeGreaterThanOrEqual(3);
    expect(charts.some(o => o.item.type === 'chart' && o.item.chart === null)).toBe(true);
    expect(charts.some(o => o.item.type === 'chart' && o.item.chart?.unsupported.includes('surfaceChart'))).toBe(true);
    expect(charts.some(o => o.item.type === 'chart' && o.item.chart?.plots.some(p => p.type === 'waterfall'))).toBe(true);
    expect(broken.extras?.objects.some(o => o.item.type === 'picture' && o.item.type === 'picture' && !o.item.media)).toBe(false);
    const pictures = broken.extras?.objects.filter(o => o.item.type === 'picture');
    expect(pictures?.some(o => o.item.type === 'picture' && o.item.media && model.assets?.size(o.item.media) === undefined)).toBe(true);

    const many = model.sheets.find(s => s.name === 'Many charts')!;
    const n = (many.extras?.objects ?? []).filter(o => o.item.type === 'chart').length;
    expect(n).toBeGreaterThanOrEqual(60);
    expect(n).toBeLessThanOrEqual(100);
  });
});

describe('xlsx-ole.xlsx', () => {
  it('没有位图的 EMF 预览记为嵌入对象', async () => {
    const model = (await parseXlsxModel(loadFixture('xlsx-ole.xlsx'), { locale: 'en-US' }))!;
    const ole = model.sheets[0].extras?.objects.find(o => o.item.type === 'ole');
    expect(ole?.item).toMatchObject({ type: 'ole', progId: 'Package' });
    expect(ole && ole.item.type === 'ole' && ole.item.media?.endsWith('.emf')).toBe(true);
  });
});
