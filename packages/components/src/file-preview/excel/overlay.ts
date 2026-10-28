/**
 * 表格叠加层：在 x-spreadsheet 画布上方显示图表、图片、形状、OLE 对象、批注、超链接、数据条、图标集与迷你图。
 *
 * x-spreadsheet 只画单元格，且 @vue-office/excel 没有暴露实例，这里只通过它的 DOM 同步：
 * - 叠加层放在 .x-spreadsheet-overlayer-content（单元格区域，不含行号列标）里，按冻结窗格分成四块分别裁剪；
 * - 滚动偏移按 x-spreadsheet 的规则从滚动条位置换算（整行整列滚动，见 ./geometry.ts）；
 * - 切换工作表时记录并恢复每个工作表的滚动条位置（x-spreadsheet 切换后不会同步滚动条）；
 * - 对象滚动到可见范围附近才创建；图表最多同时保留 MAX_LIVE_CHARTS 个，离开视野的先释放。
 */
import type { FilePreviewTranslate } from '../renderers/types';
import type { XsSheet } from './apply';
import { fillSeriesFromCells, type ChartModel } from './chart';
import type { NumberFormatter } from './chart-option';
import type { CfIcon, DataBar } from './cf';
import {
  safeUrl,
  type DrawingItem,
  type DrawingObject,
  type SheetComment,
  type SheetLink,
  type SparklineGroup,
} from './drawing';
import { HIDDEN_SIZE, SheetGeometry, type Rect } from './geometry';
import { ImageLoader, type ImageIssue } from './media';
import type { SheetModel, WorkbookModel } from './model';
import { applyChartFrame, CLS, groupChartItems, place, placeholderCard, renderItem, type ShapeContext } from './shapes';

export const MAX_LIVE_CHARTS = 24;
const MOUNT_MARGIN = 240;

type ChartModule = typeof import('./chart-render');
let chartModule: Promise<ChartModule> | null = null;
const loadChartModule = () => (chartModule ??= import('./chart-render'));

export interface OverlayOptions {
  root: HTMLElement;
  model: WorkbookModel;
  /** x-spreadsheet 显示的工作表数据（按显示顺序，已去掉隐藏表） */
  sheets: XsSheet[];
  t: FilePreviewTranslate;
  format: NumberFormatter;
  resolveRef: (ref: string, sheet: string) => import('./chart').RefCell[][] | undefined;
  maxImagePixels?: number;
  /** 打开工作簿内位置（Sheet1!A1） */
  navigate?: (sheet: string, row: number, col: number) => void;
  fontFamily?: string;
  /** 初始缩放比例（行高、列宽已按比例写入数据） */
  scale?: number;
}

interface LiveObject {
  obj: DrawingObject;
  rect: Rect;
  pane: number;
  el?: HTMLElement;
  charts: Array<{ dispose(): void }>;
  chart: boolean;
}

interface CellDeco {
  row: number;
  col: number;
  comment?: SheetComment;
  link?: SheetLink;
  bar?: DataBar;
  icon?: CfIcon;
  spark?: { group: SparklineGroup; ref: string };
}

/** 面板序号：0 主区域，1 冻结行（上），2 冻结列（左），3 左上角 */
const paneOf = (row: number, col: number, freeze: { rows: number; cols: number }) =>
  (row < freeze.rows ? 1 : 0) + (col < freeze.cols ? 2 : 0);

const svgEl = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
};

function axisCount(axis: Record<string, unknown> & { len?: number }, fallback: number): number {
  let n = Number(axis.len) || 0;
  if (!n) {
    n = fallback;
    for (const k of Object.keys(axis)) if (/^\d+$/.test(k)) n = Math.max(n, Number(k) + 1);
  }
  return n;
}

export class ExcelOverlay {
  private readonly loader: ImageLoader;
  private layer: HTMLElement | null = null;
  private panes: HTMLElement[] = [];
  private planes: HTMLElement[] = [];
  private decoPlanes: HTMLElement[] = [];
  private content: HTMLElement | null = null;
  private overlayer: HTMLElement | null = null;
  private vbar: HTMLElement | null = null;
  private hbar: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private notice: HTMLElement | null = null;
  private sheetIndex = -1;
  private geometry: SheetGeometry | null = null;
  private objects: LiveObject[] = [];
  private decoByRow = new Map<number, CellDeco[]>();
  private decoCells = new Map<string, CellDeco>();
  private readonly scrollBySheet = new Map<number, { top: number; left: number }>();
  private scroll = { x: 0, y: 0 };
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private disposed = false;
  private readonly cleanups: Array<() => void> = [];
  private liveCharts = 0;
  private scale = 1;

  constructor(private readonly options: OverlayOptions) {
    if (options.scale && options.scale > 0) this.scale = options.scale;
    this.loader = new ImageLoader(options.model.assets ?? { bytes: async () => null, size: () => undefined }, {
      maxImagePixels: options.maxImagePixels,
    });
  }

  private get shapeContext(): ShapeContext {
    const { t } = this.options;
    const labels: Record<ImageIssue, string> = {
      missing: t('pptxImageMissing'),
      external: t('pptxImageExternal'),
      tooLarge: t('pptxImageTooLarge'),
      broken: t('pptxImageBroken'),
      unsupported: '',
    };
    return {
      loader: this.loader,
      imageLabel: (issue, format) =>
        issue === 'unsupported' ? t('pptxImageUnsupported', { type: format ?? '?' }) : labels[issue],
      oleLabel: type => t('excelEmbeddedObject', { type }),
    };
  }

  /** 挂到 x-spreadsheet 的 DOM 上；找不到时返回 false（不显示叠加层） */
  attach(): boolean {
    const { root } = this.options;
    this.content = root.querySelector<HTMLElement>('.x-spreadsheet-overlayer-content');
    this.overlayer = root.querySelector<HTMLElement>('.x-spreadsheet-overlayer');
    this.vbar = root.querySelector<HTMLElement>('.x-spreadsheet-scrollbar.vertical');
    this.hbar = root.querySelector<HTMLElement>('.x-spreadsheet-scrollbar.horizontal');
    if (!this.content || !this.overlayer) return false;
    const layer = document.createElement('div');
    layer.className = `${CLS}__layer`;
    for (let i = 0; i < 4; i++) {
      const pane = document.createElement('div');
      pane.className = `${CLS}__pane`;
      const plane = document.createElement('div');
      plane.className = `${CLS}__plane`;
      const deco = document.createElement('div');
      deco.className = `${CLS}__plane ${CLS}__plane--deco`;
      pane.append(deco, plane);
      layer.appendChild(pane);
      this.panes.push(pane);
      this.planes.push(plane);
      this.decoPlanes.push(deco);
    }
    this.content.appendChild(layer);
    this.layer = layer;

    const onScroll = () => {
      if (this.sheetIndex >= 0)
        this.scrollBySheet.set(this.sheetIndex, { top: this.vbar?.scrollTop ?? 0, left: this.hbar?.scrollLeft ?? 0 });
      this.schedule();
    };
    this.vbar?.addEventListener('scroll', onScroll, { passive: true });
    this.hbar?.addEventListener('scroll', onScroll, { passive: true });
    this.cleanups.push(() => {
      this.vbar?.removeEventListener('scroll', onScroll);
      this.hbar?.removeEventListener('scroll', onScroll);
    });
    const onMove = (e: MouseEvent) => this.hover(e);
    const onLeave = () => this.hideTip();
    const onClick = (e: MouseEvent) => this.click(e);
    this.overlayer.addEventListener('mousemove', onMove);
    this.overlayer.addEventListener('mouseleave', onLeave);
    this.overlayer.addEventListener('click', onClick);
    this.cleanups.push(() => {
      this.overlayer?.removeEventListener('mousemove', onMove);
      this.overlayer?.removeEventListener('mouseleave', onLeave);
      this.overlayer?.removeEventListener('click', onClick);
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.schedule());
      this.ro.observe(this.content);
    }
    this.paintTabs();
    return true;
  }

  private modelOf(index: number): SheetModel | undefined {
    const name = this.options.sheets[index]?.name;
    return this.options.model.sheets.find(s => s.name === name);
  }

  /** 工作表标签颜色 */
  private paintTabs() {
    const colors = new Map(
      this.options.model.sheets.filter(s => s.extras?.tabColor).map(s => [s.name, s.extras!.tabColor!])
    );
    if (!colors.size) return;
    this.options.root.querySelectorAll<HTMLElement>('.x-spreadsheet-menu > li').forEach(li => {
      const c = colors.get(li.textContent?.trim() ?? '');
      if (c) {
        li.style.boxShadow = `inset 0 -3px 0 ${c}`;
        li.dataset.tabColor = c;
      }
    });
  }

  private geometryFor(index: number): SheetGeometry | null {
    const data = this.options.sheets[index];
    if (!data) return null;
    const rows = data.rows as Record<string, { height?: number; hide?: boolean } | number> & { len?: number };
    const cols = data.cols as Record<string, { width?: number; hide?: boolean } | number> & { len?: number };
    const freeze = this.modelOf(index)?.freeze;
    return new SheetGeometry({
      // x-spreadsheet 未给 len 时默认 100 行、26 列
      rowCount: axisCount(rows, 100),
      colCount: axisCount(cols, 26),
      rowHeight: r => {
        const v = rows[r];
        if (!v || typeof v !== 'object') return undefined;
        return v.hide ? HIDDEN_SIZE : v.height;
      },
      colWidth: c => {
        const v = cols[c];
        if (!v || typeof v !== 'object') return undefined;
        return v.hide ? HIDDEN_SIZE : v.width;
      },
      freeze: freeze ? { rows: freeze.rows, cols: freeze.cols } : undefined,
      scale: this.scale,
    });
  }

  /** 表格缩放后（数据里的行高、列宽已改写）按新比例重算锚点、移动对象 */
  setScale(scale: number) {
    if (!(scale > 0)) return;
    this.scale = scale;
    this.relayout();
  }

  /**
   * 行高、列宽变了（缩放、捏合中每帧、左上角裁剪变化）：重算锚点并移动已挂载的对象。
   * 对象按 100% 的尺寸绘制后整体缩放（transform），不重建、不重画图表，每帧调用也很轻
   */
  relayout() {
    if (this.disposed || this.sheetIndex < 0) return;
    const geo = this.geometryFor(this.sheetIndex);
    if (!geo) return;
    this.geometry = geo;
    const s = this.scale;
    for (const o of this.objects) {
      const rect = geo.anchorRect(o.obj.anchor);
      if (!(rect.w >= 1 && rect.h >= 1) || !Number.isFinite(rect.x + rect.y)) continue;
      o.rect = rect;
      if (!o.el) continue;
      const wrap = this.zoomWrap(o);
      wrap.style.left = `${rect.x}px`;
      wrap.style.top = `${rect.y}px`;
      wrap.style.transform = Math.abs(s - 1) > 1e-6 ? `scale(${s})` : '';
    }
    this.update();
  }

  /** 按 100% 挂载的对象外面补一层缩放容器（对象自身可能有旋转等 transform，不能直接改） */
  private zoomWrap(o: LiveObject): HTMLElement {
    const el = o.el!;
    if (el.classList.contains(`${CLS}__zoom`)) return el;
    const wrap = document.createElement('div');
    wrap.className = `${CLS}__zoom`;
    place(wrap, { x: 0, y: 0, w: parseFloat(el.style.width) || 0, h: parseFloat(el.style.height) || 0 });
    el.parentElement?.replaceChild(wrap, el);
    el.style.left = '0px';
    el.style.top = '0px';
    wrap.appendChild(el);
    o.el = wrap;
    return wrap;
  }

  /** 隐藏行/列被展开后，按新的行列尺寸重算锚点 */
  reloadSheet() {
    if (this.sheetIndex < 0) return;
    const index = this.sheetIndex;
    this.sheetIndex = -1;
    this.setSheet(index);
  }

  /** 切换到第 index 个显示的工作表（x-spreadsheet 的 switchSheet 事件） */
  setSheet(index: number) {
    if (this.disposed || !this.layer) return;
    if (index === this.sheetIndex) return this.schedule();
    this.clear();
    this.sheetIndex = index;
    const sheet = this.modelOf(index);
    this.geometry = this.geometryFor(index);
    // x-spreadsheet 切换工作表后不同步滚动条：恢复该工作表上次的位置，使滚动条与表格一致
    const saved = this.scrollBySheet.get(index) ?? { top: 0, left: 0 };
    if (this.vbar && this.vbar.scrollTop !== saved.top) this.vbar.scrollTop = saved.top;
    if (this.hbar && this.hbar.scrollLeft !== saved.left) this.hbar.scrollLeft = saved.left;
    const extras = sheet?.extras;
    const geo = this.geometry;
    if (!sheet || !geo) return;
    for (const obj of extras?.objects ?? []) {
      if (obj.item.hidden) continue;
      const rect = geo.anchorRect(obj.anchor);
      if (!(rect.w >= 1 && rect.h >= 1) || !Number.isFinite(rect.x + rect.y)) continue;
      const from = obj.anchor.from ?? { row: geo.rows.indexAt(rect.y), col: geo.cols.indexAt(rect.x) };
      this.objects.push({
        obj,
        rect,
        pane: paneOf(from.row, from.col, geo.freeze),
        charts: [],
        chart: obj.item.type === 'chart' || obj.item.type === 'chartex',
      });
    }
    const add = (row: number, col: number, patch: Partial<CellDeco>) => {
      const key = `${row},${col}`;
      let d = this.decoCells.get(key);
      if (!d) {
        d = { row, col };
        this.decoCells.set(key, d);
        const list = this.decoByRow.get(row) ?? [];
        list.push(d);
        this.decoByRow.set(row, list);
      }
      Object.assign(d, patch);
    };
    extras?.comments.forEach(c => add(c.row, c.col, { comment: c }));
    extras?.links.forEach(l => {
      // 区域链接：每个单元格都可点击（区域很大时只取左上角一块）
      const rows = Math.min(l.rows ?? 1, 200);
      const cols = Math.min(l.cols ?? 1, 50);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(l.row + r, l.col + c, { link: l });
    });
    sheet.cf?.bars.forEach(b => add(b.row, b.col, { bar: b }));
    sheet.cf?.icons.forEach(i => add(i.row, i.col, { icon: i }));
    extras?.sparklines.forEach(g => g.items.forEach(s => add(s.row, s.col, { spark: { group: g, ref: s.ref } })));
    if (extras?.skipped) this.showNotice(this.options.t('excelObjectsLimited', { count: extras.objects.length }));
    this.update();
  }

  private showNotice(text: string) {
    if (this.notice) this.notice.remove();
    const bar = document.createElement('div');
    bar.className = `${CLS}__notice ${CLS}__notice--objects`;
    bar.setAttribute('role', 'status');
    bar.textContent = text;
    this.options.root.appendChild(bar);
    this.notice = bar;
  }

  private clear() {
    for (const o of this.objects) this.unmount(o);
    this.objects = [];
    this.decoByRow.clear();
    this.decoCells.clear();
    this.planes.forEach(p => p.replaceChildren());
    this.decoPlanes.forEach(p => p.replaceChildren());
    this.notice?.remove();
    this.notice = null;
    this.hideTip();
  }

  private unmount(o: LiveObject) {
    o.charts.forEach(c => c.dispose());
    if (o.charts.length) this.liveCharts -= o.charts.length;
    o.charts = [];
    o.el?.remove();
    o.el = undefined;
  }

  private schedule() {
    if (this.disposed || this.raf) return;
    const run = () => {
      this.raf = 0;
      this.update();
    };
    this.raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(run)
        : (setTimeout(run, 16) as unknown as number);
  }

  /**
   * 叠加层可见区域的宽高：x-spreadsheet 的滚动条（半透明、z-index 更高）压在内容区右侧和底部，
   * 不扣掉的话图表会从滚动条下面透出来（macOS「始终显示滚动条」、Windows 下约 15px）。
   */
  private viewSize(): { W: number; H: number } {
    const W = (this.content?.clientWidth ?? 0) - (this.vbar?.offsetWidth ?? 0);
    const H = (this.content?.clientHeight ?? 0) - (this.hbar?.offsetHeight ?? 0);
    return { W: Math.max(0, W), H: Math.max(0, H) };
  }

  /** 面板在工作表坐标里的可见范围 */
  private paneRects(): Rect[] {
    const geo = this.geometry!;
    const { W, H } = this.viewSize();
    const f = geo.frozen;
    const { x: sx, y: sy } = this.scroll;
    return [
      { x: f.w + sx, y: f.h + sy, w: Math.max(0, W - f.w), h: Math.max(0, H - f.h) },
      { x: f.w + sx, y: 0, w: Math.max(0, W - f.w), h: Math.min(f.h, H) },
      { x: 0, y: f.h + sy, w: Math.min(f.w, W), h: Math.max(0, H - f.h) },
      { x: 0, y: 0, w: Math.min(f.w, W), h: Math.min(f.h, H) },
    ];
  }

  update() {
    if (this.disposed || !this.geometry || !this.content) return;
    const geo = this.geometry;
    this.scroll = geo.scrollOffset(this.hbar?.scrollLeft ?? 0, this.vbar?.scrollTop ?? 0);
    const f = geo.frozen;
    const rects = this.paneRects();
    const { W, H } = this.viewSize();
    const boxes = [
      { left: f.w, top: f.h, width: W - f.w, height: H - f.h },
      { left: f.w, top: 0, width: W - f.w, height: f.h },
      { left: 0, top: f.h, width: f.w, height: H - f.h },
      { left: 0, top: 0, width: f.w, height: f.h },
    ];
    boxes.forEach((b, i) => {
      const pane = this.panes[i];
      pane.style.left = `${b.left}px`;
      pane.style.top = `${b.top}px`;
      pane.style.width = `${Math.max(0, b.width)}px`;
      pane.style.height = `${Math.max(0, b.height)}px`;
      pane.style.display = b.width > 0 && b.height > 0 ? '' : 'none';
      const tf = `translate(${-rects[i].x}px, ${-rects[i].y}px)`;
      this.planes[i].style.transform = tf;
      this.decoPlanes[i].style.transform = tf;
    });
    const near = (r: Rect, v: Rect) =>
      r.x < v.x + v.w + MOUNT_MARGIN &&
      r.x + r.w > v.x - MOUNT_MARGIN &&
      r.y < v.y + v.h + MOUNT_MARGIN &&
      r.y + r.h > v.y - MOUNT_MARGIN;
    for (const o of this.objects) {
      const visible = near(o.rect, rects[o.pane]);
      if (visible && !o.el) this.mount(o);
    }
    // 图表太多时释放不在视野里的
    if (this.liveCharts > MAX_LIVE_CHARTS) {
      for (const o of this.objects) {
        if (this.liveCharts <= MAX_LIVE_CHARTS) break;
        if (o.charts.length && !near(o.rect, rects[o.pane])) this.unmount(o);
      }
    }
    this.paintDecorations(rects);
  }

  private mount(o: LiveObject) {
    const { item } = o.obj;
    let el: HTMLElement;
    // 缩放时对象按 100% 的尺寸绘制，再整体按比例变换（文字、线宽、图片与表格同比例）；
    // 位置仍用缩放后的锚点，与画布逐像素对齐
    const s = this.scale;
    const zoomed = Math.abs(s - 1) > 1e-6;
    const rect = zoomed ? { x: 0, y: 0, w: o.rect.w / s, h: o.rect.h / s } : o.rect;
    if (item.type === 'chart' || item.type === 'chartex') {
      el = document.createElement('div');
      el.className = `${CLS}__object ${CLS}__object--chart`;
      place(el, rect);
      if (item.type === 'chart') applyChartFrame(el, item.chart?.style, item.chart?.roundedCorners);
    } else {
      el = renderItem(item, rect, this.shapeContext);
    }
    if (zoomed) {
      const wrap = document.createElement('div');
      wrap.className = `${CLS}__zoom`;
      place(wrap, { x: o.rect.x, y: o.rect.y, w: rect.w, h: rect.h });
      wrap.style.transform = `scale(${s})`;
      wrap.appendChild(el);
      el = wrap;
    }
    // 先挂到页面再画图表（图表按容器尺寸初始化）
    this.planes[o.pane].appendChild(el);
    if (item.type === 'chart' || item.type === 'chartex') {
      this.mountChart(o, (zoomed ? el.firstElementChild : el) as HTMLElement, item);
    } else {
      el.querySelectorAll<HTMLElement>('[data-group-chart]').forEach(c => {
        const it = groupChartItems.get(c);
        if (it && (it.type === 'chart' || it.type === 'chartex')) this.mountChart(o, c, it);
      });
    }
    // 图表上的鼠标操作不传给表格（x-spreadsheet 按事件坐标选中单元格，会选错位置）；滚轮照常滚动表格
    if (o.chart) {
      const stop = (e: Event) => e.stopPropagation();
      ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'mousemove'].forEach(t =>
        el.addEventListener(t, stop)
      );
    }
    o.el = el;
  }

  private chartTitle(item: DrawingItem): string | undefined {
    if (item.type === 'chart') return item.chart?.title?.text || item.name || undefined;
    if (item.type === 'chartex') return item.title || item.name || undefined;
    return undefined;
  }

  private mountChart(
    o: LiveObject,
    el: HTMLElement,
    item: Extract<DrawingItem, { type: 'chart' } | { type: 'chartex' }>
  ) {
    const { t } = this.options;
    const rect = { w: el.offsetWidth || o.rect.w, h: el.offsetHeight || o.rect.h };
    const card = (hint: string) => {
      el.replaceChildren(placeholderCard(rect, this.chartTitle(item), hint, 'chart'));
    };
    if (item.type === 'chartex') return card(t('excelChartUnsupported'));
    const model: ChartModel | null = item.chart;
    if (!model) return card(t('excelChartError'));
    if (!model.plots.length || !model.plots.some(p => p.series.length))
      return card(model.unsupported.length ? t('excelChartUnsupported') : t('excelChartError'));
    const sheetName = this.options.sheets[this.sheetIndex]?.name ?? '';
    try {
      fillSeriesFromCells(model, ref => this.options.resolveRef(ref, sheetName));
    } catch {
      // 读取失败时只用缓存
    }
    const host = document.createElement('div');
    host.className = `${CLS}__chart`;
    el.appendChild(host);
    const sheet = this.sheetIndex;
    let disposed = false;
    const holder = {
      dispose: () => {
        disposed = true;
        inner?.dispose();
      },
    };
    let inner: { dispose(): void } | undefined;
    o.charts.push(holder);
    this.liveCharts++;
    loadChartModule()
      .then(mod =>
        disposed || this.disposed || sheet !== this.sheetIndex
          ? undefined
          : mod.renderChart(
              host,
              model,
              this.options.format,
              this.options.fontFamily,
              Math.abs(this.scale - 1) > 1e-6 ? (window.devicePixelRatio || 1) * this.scale : undefined
            )
      )
      .then(chart => {
        if (!chart) return;
        if (disposed || this.disposed) chart.dispose();
        else inner = chart;
      })
      .catch((err: unknown) => {
        if (disposed) return;
        host.remove();
        card((err as Error)?.name === 'MissingDependencyError' ? t('excelChartNeedsEcharts') : t('excelChartError'));
      });
  }

  /** 批注标记、数据条、迷你图：只画可见行列里的 */
  private paintDecorations(rects: Rect[]) {
    const geo = this.geometry!;
    this.decoPlanes.forEach(p => p.replaceChildren());
    if (!this.decoCells.size) return;
    rects.forEach((v, pane) => {
      if (v.w <= 0 || v.h <= 0) return;
      const r0 = geo.rows.indexAt(v.y);
      const r1 = geo.rows.indexAt(v.y + v.h);
      const c0 = geo.cols.indexAt(v.x);
      const c1 = geo.cols.indexAt(v.x + v.w);
      const frag = document.createDocumentFragment();
      let count = 0;
      for (let r = r0; r <= r1 && count < 4000; r++) {
        const list = this.decoByRow.get(r);
        if (!list) continue;
        for (const d of list) {
          if (d.col < c0 || d.col > c1 || paneOf(d.row, d.col, geo.freeze) !== pane) continue;
          const merge = this.mergeAt(d.row, d.col);
          const cell = geo.cellRect(d.row, d.col, merge?.rows ?? 1, merge?.cols ?? 1);
          if (cell.w < 1 || cell.h < 1) continue;
          count++;
          if (d.bar) frag.appendChild(this.dataBar(cell, d.bar));
          if (d.icon) frag.appendChild(this.cfIcon(cell, d.icon));
          if (d.spark) {
            const s = this.sparkline(cell, d.spark.group, d.spark.ref);
            if (s) frag.appendChild(s);
          }
          if (d.comment) {
            const mark = document.createElement('div');
            mark.className = `${CLS}__comment-mark`;
            mark.style.left = `${cell.x + cell.w - 7}px`;
            mark.style.top = `${cell.y}px`;
            frag.appendChild(mark);
          }
        }
      }
      this.decoPlanes[pane].appendChild(frag);
    });
  }

  private mergeAt(row: number, col: number): { rows: number; cols: number } | undefined {
    const m = this.modelOf(this.sheetIndex)?.merges.find(x => x.r0 === row && x.c0 === col);
    return m ? { rows: m.r1 - m.r0 + 1, cols: m.c1 - m.c0 + 1 } : undefined;
  }

  private cfIcon(cell: Rect, icon: CfIcon): HTMLElement {
    const el = document.createElement('div');
    el.className = `${CLS}__cf-icon`;
    el.textContent = icon.glyph;
    el.style.left = `${cell.x + 2}px`;
    el.style.top = `${cell.y}px`;
    el.style.height = `${cell.h}px`;
    el.style.color = icon.color;
    return el;
  }

  private dataBar(cell: Rect, bar: DataBar): HTMLElement {
    const el = document.createElement('div');
    el.className = `${CLS}__databar`;
    const pad = 2;
    const w = Math.max(0, cell.w - pad * 2);
    el.style.left = `${cell.x + pad + bar.start * w}px`;
    el.style.top = `${cell.y + pad}px`;
    el.style.width = `${Math.max(0, (bar.end - bar.start) * w)}px`;
    el.style.height = `${Math.max(0, cell.h - pad * 2)}px`;
    el.style.setProperty('--bar-color', bar.color);
    return el;
  }

  private sparkline(cell: Rect, group: SparklineGroup, ref: string): SVGElement | null {
    const sheetName = this.options.sheets[this.sheetIndex]?.name ?? '';
    const grid = this.options.resolveRef(ref, sheetName);
    if (!grid) return null;
    let values = grid.flat().map(c => (c.num === undefined ? null : c.num));
    if (group.rightToLeft) values = values.reverse();
    const nums = values.filter((v): v is number => v !== null);
    if (!nums.length) return null;
    const pad = 3;
    const w = Math.max(1, cell.w - pad * 2);
    const h = Math.max(1, cell.h - pad * 2);
    const min =
      group.minAxisType === 'custom' && group.manualMin !== undefined
        ? group.manualMin
        : Math.min(...nums, group.type === 'line' ? Infinity : 0);
    const max =
      group.maxAxisType === 'custom' && group.manualMax !== undefined
        ? group.manualMax
        : Math.max(...nums, group.type === 'line' ? -Infinity : 0);
    const span = max - min || 1;
    const y = (v: number) => pad + h - ((v - min) / span) * h;
    const svg = svgEl('svg', { class: `${CLS}__sparkline`, width: cell.w, height: cell.h });
    (svg as unknown as HTMLElement).style.left = `${cell.x}px`;
    (svg as unknown as HTMLElement).style.top = `${cell.y}px`;
    const color = group.color ?? '#376092';
    const n = values.length;
    const hi = Math.max(...nums);
    const lo = Math.min(...nums);
    if (group.type === 'line') {
      const step = n > 1 ? w / (n - 1) : 0;
      let d = '';
      let pen = false;
      values.forEach((raw, i) => {
        const v = raw === null && group.displayEmptyCellsAs === 'zero' ? 0 : raw;
        if (v === null) {
          // 空单元格：默认断开，「用直线连接」时跳过
          if (group.displayEmptyCellsAs !== 'span') pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${(pad + i * step).toFixed(1)} ${y(v).toFixed(1)}`;
        pen = true;
      });
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': group.lineWidth ?? 1 }));
      values.forEach((v, i) => {
        if (v === null) return;
        const mark = (v === hi && group.highColor) || (v === lo && group.lowColor) || (group.markers ? color : '');
        if (mark) svg.appendChild(svgEl('circle', { cx: pad + i * step, cy: y(v), r: 2, fill: mark }));
      });
    } else {
      const bw = w / Math.max(1, n);
      const zero = group.type === 'stacked' ? pad + h / 2 : y(Math.min(Math.max(0, min), max));
      values.forEach((v, i) => {
        if (v === null) return;
        const top = group.type === 'stacked' ? (v >= 0 ? pad : zero) : Math.min(y(v), zero);
        const height = group.type === 'stacked' ? h / 2 : Math.max(1, Math.abs(y(v) - zero));
        const fill =
          (v < 0 && group.negativeColor) || (v === hi && group.highColor) || (v === lo && group.lowColor) || color;
        svg.appendChild(
          svgEl('rect', { x: pad + i * bw + bw * 0.1, y: top, width: Math.max(1, bw * 0.8), height, fill })
        );
      });
    }
    return svg;
  }

  /** 鼠标位置 → 单元格 */
  private cellFromEvent(e: MouseEvent): { row: number; col: number } | null {
    if (!this.content || !this.geometry) return null;
    const box = this.content.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    if (px < 0 || py < 0 || px > box.width || py > box.height) return null;
    return this.geometry.cellAt(px, py, this.scroll);
  }

  private decoAt(e: MouseEvent): CellDeco | undefined {
    const cell = this.cellFromEvent(e);
    if (!cell) return undefined;
    const direct = this.decoCells.get(`${cell.row},${cell.col}`);
    if (direct) return direct;
    // 合并单元格：批注、链接记在左上角
    const m = this.modelOf(this.sheetIndex)?.merges.find(
      x => cell.row >= x.r0 && cell.row <= x.r1 && cell.col >= x.c0 && cell.col <= x.c1
    );
    return m ? this.decoCells.get(`${m.r0},${m.c0}`) : undefined;
  }

  private hover(e: MouseEvent) {
    const d = this.decoAt(e);
    if (this.overlayer) this.overlayer.style.cursor = d?.link ? 'pointer' : '';
    if (d?.comment) this.showTip(e, d.comment);
    else this.hideTip();
    if (this.overlayer) {
      const tip = d?.link
        ? (d.link.tooltip ?? this.options.t('excelLinkTip', { target: d.link.url ?? d.link.location ?? '' }))
        : '';
      if (tip) this.overlayer.title = tip;
      else this.overlayer.removeAttribute('title');
    }
  }

  private click(e: MouseEvent) {
    const link = this.decoAt(e)?.link;
    if (!link) return;
    if (link.url) {
      const url = safeUrl(link.url);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (link.location && this.options.navigate) {
      const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Za-z]{1,3})\$?(\d+)/.exec(link.location.trim());
      if (!m) return;
      const sheet = (m[1] ?? m[2] ?? '').replace(/''/g, "'");
      let col = 0;
      for (const ch of m[3].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
      this.options.navigate(sheet, Number(m[4]) - 1, col - 1);
    }
  }

  /** 跳到工作表里的某个单元格（滚动到该行列） */
  scrollToCell(row: number, col: number) {
    const geo = this.geometry;
    if (!geo) return;
    const f = geo.frozen;
    if (this.vbar) this.vbar.scrollTop = Math.max(0, geo.rows.start(row) - f.h - 1);
    if (this.hbar) this.hbar.scrollLeft = Math.max(0, geo.cols.start(col) - f.w - 1);
  }

  private showTip(_e: MouseEvent, comment: SheetComment) {
    const root = this.options.root;
    if (!this.tip) {
      this.tip = document.createElement('div');
      this.tip.className = `${CLS}__comment`;
      this.tip.setAttribute('role', 'tooltip');
      root.appendChild(this.tip);
    }
    const tip = this.tip;
    if (tip.dataset.key !== `${comment.row},${comment.col}`) {
      tip.dataset.key = `${comment.row},${comment.col}`;
      tip.replaceChildren();
      if (comment.author) {
        const a = document.createElement('div');
        a.className = `${CLS}__comment-author`;
        a.textContent = comment.author;
        tip.appendChild(a);
      }
      const body = document.createElement('div');
      body.className = `${CLS}__comment-text`;
      // 批注正文里常以「作者:」开头（Excel 自动插入），作者已单独显示时去掉
      body.textContent =
        comment.author && comment.text.startsWith(`${comment.author}:`)
          ? comment.text.slice(comment.author.length + 1).replace(/^\s*\n?/, '')
          : comment.text;
      tip.appendChild(body);
    }
    const box = root.getBoundingClientRect();
    const geo = this.geometry!;
    const content = this.content!.getBoundingClientRect();
    const cell = geo.cellRect(comment.row, comment.col);
    const pane = paneOf(comment.row, comment.col, geo.freeze);
    const v = this.paneRects()[pane];
    const paneBox = [
      { left: geo.frozen.w, top: geo.frozen.h },
      { left: geo.frozen.w, top: 0 },
      { left: 0, top: geo.frozen.h },
      { left: 0, top: 0 },
    ][pane];
    let left = content.left - box.left + paneBox.left + (cell.x + cell.w - v.x) + 8;
    let top = content.top - box.top + paneBox.top + (cell.y - v.y);
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (left + tw > box.width - 4) left = Math.max(4, left - tw - cell.w - 16);
    if (top + th > box.height - 4) top = Math.max(4, box.height - th - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  private hideTip() {
    if (this.tip) {
      this.tip.style.display = 'none';
      delete this.tip.dataset.key;
    }
  }

  /** 调试与测试用：当前工作表的对象统计 */
  stats() {
    const mounted = this.objects.filter(o => o.el);
    return {
      sheet: this.sheetIndex,
      objects: this.objects.length,
      mounted: mounted.length,
      charts: this.liveCharts,
      decorations: this.decoCells.size,
    };
  }

  destroy() {
    this.disposed = true;
    if (this.raf) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
      clearTimeout(this.raf);
    }
    this.clear();
    this.cleanups.splice(0).forEach(fn => fn());
    this.ro?.disconnect();
    this.layer?.remove();
    this.tip?.remove();
    this.notice?.remove();
    this.loader.destroy();
  }
}
