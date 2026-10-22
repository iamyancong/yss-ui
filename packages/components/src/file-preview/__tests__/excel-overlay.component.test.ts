/**
 * 叠加层：挂到假的 x-spreadsheet DOM，切换工作表 / 关闭时释放图表实例与 Blob URL。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSheetModel, setCell, type WorkbookModel } from '../excel/model';
import { ExcelOverlay } from '../excel/overlay';
import { parseChart } from '../excel/chart';
import { DEFAULT_THEME_COLORS, EMU_PER_PX, type ThemeInfo } from '../excel/dml';
import type { DrawingItem, DrawingObject } from '../excel/drawing';
import type { XsSheet } from '../excel/apply';
import { trackObjectUrls } from './helpers';

const chartState = vi.hoisted(() => ({
  fail: false,
  instances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('../excel/chart-render', () => ({
  renderChart: vi.fn(async () => {
    if (chartState.fail) {
      const err = new Error('no echarts');
      err.name = 'MissingDependencyError';
      throw err;
    }
    const inst = { dispose: vi.fn() };
    chartState.instances.push(inst);
    return inst;
  }),
}));

const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0)
);
const theme: ThemeInfo = { colors: DEFAULT_THEME_COLORS };
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

const barXml = `<?xml version="1.0"?><c:chartSpace xmlns:c="c"><c:chart><c:title><c:tx><c:rich><a:p xmlns:a="a"><a:r><a:t>Clustered</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Alpha</c:v></c:tx><c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>-5</c:v></c:pt></c:numLit></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:axPos val="l"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`;

const chartItem = (title = 'Clustered'): DrawingItem => ({
  type: 'chart',
  name: title,
  hidden: false,
  chart: parseChart(barXml.replace('Clustered', title), { theme }),
});

const obj = (item: DrawingItem, row = 0, col = 0, rows = 8, cols = 6): DrawingObject => ({
  item,
  anchor: {
    kind: 'two',
    from: { col, row, colOff: 0, rowOff: 0 },
    to: { col: col + cols, row: row + rows, colOff: 0, rowOff: 0 },
  },
});

const xs = (name: string): XsSheet => ({
  name,
  styles: [{}],
  rows: { len: 80 },
  cols: { len: 20 },
});

function workbook(sheets: Array<{ name: string; objects?: DrawingObject[] }>): WorkbookModel {
  return {
    date1904: false,
    activeTab: 0,
    fullCalcOnLoad: false,
    themeColors: DEFAULT_THEME_COLORS,
    defaultFont: { sz: 11 },
    sheets: sheets.map(s => {
      const sheet = createSheetModel(s.name);
      setCell(sheet, 0, 0, { t: 's', v: 'x', fmt: 'General' });
      sheet.extras = {
        objects: s.objects ?? [],
        comments: [],
        links: [],
        sparklines: [],
        skipped: 0,
      };
      return sheet;
    }),
    assets: {
      bytes: async path => (path.includes('missing') ? null : path.endsWith('.png') ? TINY_PNG : null),
      size: path => (path.includes('missing') ? undefined : path.endsWith('.png') ? TINY_PNG.length : undefined),
    },
  };
}

function spreadsheetDom() {
  const root = document.createElement('div');
  root.className = 'yss-file-preview-excel';
  const overlayer = document.createElement('div');
  overlayer.className = 'x-spreadsheet-overlayer';
  const content = document.createElement('div');
  content.className = 'x-spreadsheet-overlayer-content';
  Object.defineProperty(content, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(content, 'clientHeight', { configurable: true, value: 600 });
  overlayer.appendChild(content);
  const vbar = document.createElement('div');
  vbar.className = 'x-spreadsheet-scrollbar vertical';
  const hbar = document.createElement('div');
  hbar.className = 'x-spreadsheet-scrollbar horizontal';
  const menu = document.createElement('ul');
  menu.className = 'x-spreadsheet-menu';
  menu.appendChild(Object.assign(document.createElement('li'), { textContent: 'One' }));
  menu.appendChild(Object.assign(document.createElement('li'), { textContent: 'Two' }));
  root.append(overlayer, vbar, hbar, menu);
  document.body.appendChild(root);
  return { root, content, overlayer, vbar, hbar };
}

function createOverlay(model: WorkbookModel, names: string[]) {
  const { root } = spreadsheetDom();
  const overlay = new ExcelOverlay({
    root,
    model,
    sheets: names.map(xs),
    t,
    format: v => String(v),
    resolveRef: () => [[{ text: '1', num: 1 }]],
  });
  expect(overlay.attach()).toBe(true);
  return { root, overlay };
}

let urls: ReturnType<typeof trackObjectUrls>;
const overlays: ExcelOverlay[] = [];

beforeEach(() => {
  urls = trackObjectUrls();
  chartState.fail = false;
  chartState.instances = [];
});
afterEach(() => {
  overlays.splice(0).forEach(o => o.destroy());
  urls.restore();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ExcelOverlay', () => {
  it('挂载图表；切换工作表和销毁时 dispose echarts 实例', async () => {
    const model = workbook([
      { name: 'One', objects: [obj(chartItem('A'))] },
      { name: 'Two', objects: [obj(chartItem('B'))] },
    ]);
    const { overlay, root } = createOverlay(model, ['One', 'Two']);
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(chartState.instances.length).toBe(1));
    const chartEl = root.querySelector('.yss-file-preview-excel__object--chart') as HTMLElement;
    expect(chartEl).not.toBeNull();
    expect(overlay.stats()).toMatchObject({ sheet: 0, charts: 1, mounted: 1 });
    overlay.setSheet(1);
    await vi.waitFor(() => expect(chartState.instances[0].dispose).toHaveBeenCalled());
    await vi.waitFor(() => expect(chartState.instances.length).toBe(2));
    overlay.destroy();
    await vi.waitFor(() => expect(chartState.instances[1].dispose).toHaveBeenCalled());
    expect(root.querySelector('.yss-file-preview-excel__layer')).toBeNull();
  });

  it('图表外框只在文件写了可见线条时出现', async () => {
    const bordered = chartItem('Border');
    if (bordered.type === 'chart' && bordered.chart) bordered.chart.style = { line: { color: '#ED7D31', width: 2 } };
    const plain = chartItem('Plain');
    if (plain.type === 'chart' && plain.chart) plain.chart.style = { line: { none: true } };
    const { overlay, root } = createOverlay(
      workbook([
        { name: 'One', objects: [obj(bordered)] },
        { name: 'Two', objects: [obj(plain)] },
      ]),
      ['One', 'Two']
    );
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(root.querySelector('.yss-file-preview-excel__object--chart')).not.toBeNull());
    const withBorder = root.querySelector('.yss-file-preview-excel__object--chart') as HTMLElement;
    expect(withBorder.style.border).toContain('2px');
    expect(withBorder.style.border.toLowerCase()).toContain('ed7d31');
    overlay.setSheet(1);
    await vi.waitFor(() => {
      const el = root.querySelector('.yss-file-preview-excel__object--chart') as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el?.style.border).toBe('');
    });
  });

  it('没有 echarts 时显示安装提示占位', async () => {
    chartState.fail = true;
    const { overlay, root } = createOverlay(workbook([{ name: 'One', objects: [obj(chartItem())] }]), ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(root.textContent).toContain('excelChartNeedsEcharts'));
  });

  it('chartex 与损坏图表显示占位；冻结窗格分成 4 个 pane', async () => {
    const model = workbook([
      {
        name: 'One',
        objects: [
          obj({ type: 'chartex', name: 'Waterfall', hidden: false, title: 'Waterfall (chartex)', chartType: 'waterfall' }),
          obj({ type: 'chart', name: 'Broken', hidden: false, chart: null }),
        ],
      },
    ]);
    model.sheets[0].freeze = { rows: 2, cols: 1 };
    const { overlay, root } = createOverlay(model, ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(root.textContent).toContain('excelChartUnsupported'));
    expect(root.textContent).toContain('excelChartError');
    expect(root.querySelectorAll('.yss-file-preview-excel__pane')).toHaveLength(4);
  });

  it('图片缺失显示占位；成功加载后 destroy 释放 Blob URL', async () => {
    const model = workbook([
      {
        name: 'One',
        objects: [
          obj({ type: 'picture', name: 'ok', hidden: false, media: 'xl/media/image1.png', style: {} }),
          obj({ type: 'picture', name: 'gone', hidden: false, media: 'xl/media/missing.png', style: {} }, 0, 8),
        ],
      },
    ]);
    const { overlay, root } = createOverlay(model, ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(root.querySelector('img')).not.toBeNull());
    expect(urls.live.size).toBeGreaterThan(0);
    await vi.waitFor(() => expect(root.textContent).toContain('pptxImageMissing'));
    overlay.destroy();
    expect(urls.live.size).toBe(0);
  });

  it('批注红三角；https 用 window.open 打开；javascript 不会进入链接', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const sheet = createSheetModel('One');
    sheet.extras = {
      objects: [],
      comments: [{ row: 0, col: 0, author: 'Tester', text: 'Synthetic note' }],
      links: [{ row: 2, col: 0, url: 'https://example.com/' }],
      sparklines: [],
      skipped: 0,
    };
    const model: WorkbookModel = {
      date1904: false,
      activeTab: 0,
      fullCalcOnLoad: false,
      sheets: [sheet],
      themeColors: [],
      defaultFont: { sz: 11 },
    };
    const { overlay, root } = createOverlay(model, ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    expect(root.querySelector('.yss-file-preview-excel__comment-mark')).not.toBeNull();
    const overlayer = root.querySelector('.x-spreadsheet-overlayer') as HTMLElement;
    const content = root.querySelector('.x-spreadsheet-overlayer-content') as HTMLElement;
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} });
    overlayer.dispatchEvent(new MouseEvent('click', { clientX: 20, clientY: 50, bubbles: true }));
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
  });

  it('javascript 协议即使出现在 extras 也不会调用 window.open', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const sheet = createSheetModel('One');
    sheet.extras = {
      objects: [],
      comments: [],
      links: [{ row: 2, col: 0, url: 'javascript:alert(1)' }],
      sparklines: [],
      skipped: 0,
    };
    const model: WorkbookModel = {
      date1904: false,
      activeTab: 0,
      fullCalcOnLoad: false,
      sheets: [sheet],
      themeColors: [],
      defaultFont: { sz: 11 },
    };
    const { overlay, root } = createOverlay(model, ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    const overlayer = root.querySelector('.x-spreadsheet-overlayer') as HTMLElement;
    const content = root.querySelector('.x-spreadsheet-overlayer-content') as HTMLElement;
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} });
    overlayer.dispatchEvent(new MouseEvent('click', { clientX: 20, clientY: 50, bubbles: true }));
    expect(open).not.toHaveBeenCalled();
  });

  it('面板扣掉滚动条占的宽高，图表不会从半透明滚动条下面透出来', () => {
    const model = workbook([{ name: 'One', objects: [obj(chartItem())] }]);
    model.sheets[0].freeze = { rows: 2, cols: 1 };
    const { overlay, root } = createOverlay(model, ['One']);
    overlays.push(overlay);
    const vbar = root.querySelector<HTMLElement>('.x-spreadsheet-scrollbar.vertical')!;
    const hbar = root.querySelector<HTMLElement>('.x-spreadsheet-scrollbar.horizontal')!;
    Object.defineProperty(vbar, 'offsetWidth', { configurable: true, value: 15 });
    Object.defineProperty(hbar, 'offsetHeight', { configurable: true, value: 15 });
    overlay.setSheet(0);
    const panes = [...root.querySelectorAll<HTMLElement>('.yss-file-preview-excel__pane')];
    const fw = parseFloat(panes[2].style.width);
    const fh = parseFloat(panes[1].style.height);
    expect(fw).toBeGreaterThan(0);
    expect(fh).toBeGreaterThan(0);
    // 主面板右边、下边止于滚动条之前（内容区 800×600）
    expect(parseFloat(panes[0].style.left) + parseFloat(panes[0].style.width)).toBe(785);
    expect(parseFloat(panes[0].style.top) + parseFloat(panes[0].style.height)).toBe(585);
    expect(parseFloat(panes[1].style.left) + parseFloat(panes[1].style.width)).toBe(785);
    expect(parseFloat(panes[2].style.top) + parseFloat(panes[2].style.height)).toBe(585);
    // 滚动条隐藏（offset 为 0）时铺满内容区
    Object.defineProperty(vbar, 'offsetWidth', { configurable: true, value: 0 });
    Object.defineProperty(hbar, 'offsetHeight', { configurable: true, value: 0 });
    overlay.update();
    expect(parseFloat(panes[0].style.left) + parseFloat(panes[0].style.width)).toBe(800);
    expect(parseFloat(panes[0].style.top) + parseFloat(panes[0].style.height)).toBe(600);
  });

  it('视野外的图表不挂载；绝对锚点对象能挂上', async () => {
    const far = obj(chartItem('Far'), 40, 0);
    const abs: DrawingObject = {
      item: { type: 'shape', name: 'box', hidden: false, geom: 'rect', connector: false, style: { fill: '#ED7D31' }, paragraphs: [], body: { anchor: 't', vertical: false, insets: [0, 0, 0, 0] } },
      anchor: { kind: 'abs', pos: { x: EMU_PER_PX * 10, y: EMU_PER_PX * 10 }, ext: { cx: EMU_PER_PX * 80, cy: EMU_PER_PX * 40 } },
    };
    const { overlay, root } = createOverlay(workbook([{ name: 'One', objects: [obj(chartItem('Near')), far, abs] }]), ['One']);
    overlays.push(overlay);
    overlay.setSheet(0);
    await vi.waitFor(() => expect(root.querySelector('.yss-file-preview-excel__object--chart')).not.toBeNull());
    expect(overlay.stats().mounted).toBeLessThan(overlay.stats().objects);
    expect(root.querySelector('.yss-file-preview-excel__object--shape')).not.toBeNull();
  });
});
