/**
 * Excel 显示修正：在 @vue-office/excel 把数据交给 x-spreadsheet 之前，按文件里保存的值与格式重写单元格文字和样式。
 * 入口只被 renderers/excel.ts 动态加载。
 */
import { applyWorkbookModel, type XsSheet } from './apply';
import { placeholderXlsx } from './build';
import { createAssembler, createTextMeasure, runBuild, type BuildRequest } from './build-runner';
import { modelFromExcelJs, type ExcelJsWorkbook } from './exceljs';
import { createCellFormatter, loadCellFormatter, loadNumfmt, type CellFormatter, type NumfmtLike } from './format';
import { createCellBudget, trimTruncatedSheet, type WorkbookModel } from './model';
import { buildInWorker } from './worker-client';
import { parseXlsModel } from './xls';
import { attachXlsxAssets, parseXlsxModel, prepareForExcelJs } from './xlsx';
import {
  axisView,
  captureAxisAnchor,
  captureSheet,
  geometryOf,
  scaleSheet,
  scrollForCell,
  sheetCounts,
  topLeftCell,
  usedSize,
  type SheetBase,
  type SheetCounts,
} from './zoom';

export type { WorkbookModel } from './model';

/** 挂在预览容器上的调试数据（测试与排查用，不是公开 API） */
export const EXCEL_DATA_KEY = Symbol.for('yss.filePreview.excelData');

export interface ExcelFixupOptions {
  data: ArrayBuffer;
  /** 老版 xls（OLE 复合文档）：读取 BIFF 记录；不是 BIFF8 时改从 exceljs 读取 */
  xls: boolean;
  locale?: string;
  signal?: AbortSignal;
  /** 初始缩放比例：在交给 x-spreadsheet 之前按比例写入，不用先按 100% 绘制 */
  zoom?: number;
  /** 是否用 Worker 解析（默认 true；不支持时自动在主线程解析） */
  worker?: boolean;
  /** 单元格总数上限，超过时只显示前面的行（见 CellBudget）；默认不限制 */
  maxCells?: number;
  /** 解析进度（0~1） */
  onProgress?: (value: number) => void;
}

export interface ExcelFixup {
  /** @vue-office/excel options.beforeTransformData */
  beforeTransformData(workbook: ExcelJsWorkbook): ExcelJsWorkbook;
  /** @vue-office/excel options.transformData */
  transformData(sheets: XsSheet[]): XsSheet[];
  /** 读取到的模型（beforeTransformData 之后才有 xls 的模型） */
  readonly model: WorkbookModel | null;
  /** 修正后的数据 */
  readonly sheets: XsSheet[] | null;
  /**
   * 交给 @vue-office/excel 的文件；null 时用原文件。
   * 已经直接生成数据时是只有一个空表的 xlsx（见 placeholderXlsx），否则是改掉了 exceljs 读不了的部分的 xlsx（见 prepareForExcelJs）
   */
  readonly source: ArrayBuffer | null;
  /** 数据是否已经直接生成（不经过 exceljs / SheetJS）；'worker' 为在 Worker 里生成 */
  readonly direct: false | 'worker' | 'main';
  /** 单元格格式化（transformData 之后才有），图表、迷你图使用 */
  readonly formatter: CellFormatter | null;
  /** 当前缩放比例 */
  readonly scale: number;
  /** 是否可以缩放（transformData 成功之后） */
  readonly zoomable: boolean;
  /** 按比例改写行高、列宽、字号（需要随后让 x-spreadsheet 重绘）；only 为只改写的工作表（捏合中每帧只改当前表） */
  setScale(scale: number, only?: number): void;
  /** 第 index 个工作表已用区域在 100% 时的宽高 */
  usedSize(index: number): { w: number; h: number } | null;
  /**
   * 缩放并保持左上角的单元格不变：返回缩放后应设置的滚动条位置（index 为显示的第几个工作表）
   */
  rescale(index: number, scale: number, scroll: { left: number; top: number }): { left: number; top: number } | null;
  /**
   * 第 index 个工作表的 x-spreadsheet 数据、冻结行列和滚动状态对象。
   * 滚动状态对象在 transformData 时放进数据里，x-spreadsheet 的 setData 会直接使用它（不复制），
   * 缩放时可以按像素设置滚动位置，只重绘一次
   */
  live(index: number): { data: XsSheet; freeze: { rows: number; cols: number }; scroll: XsScroll } | null;
  /**
   * 释放：之后 beforeTransformData / transformData 不再修正（@vue-office/excel 在卸载后仍可能回调），
   * 并清空修正后的表格数据与模型，即使 x-spreadsheet 还被别处引用也只剩空对象
   */
  dispose(): void;
  /** 缩放锚点换算（放在按需加载的模块里，渲染器入口不直接依赖） */
  readonly zoomMath: {
    geometryOf: typeof geometryOf;
    captureAxisAnchor: typeof captureAxisAnchor;
    axisView: typeof axisView;
  };
}

/** x-spreadsheet 的滚动状态（DataProxy.scroll）：x / y 为滚过的像素，ri / ci 为左上角第一个非冻结的行列 */
export interface XsScroll {
  x: number;
  y: number;
  ri: number;
  ci: number;
}

type Built = { model: WorkbookModel; sheets: XsSheet[]; via: 'worker' | 'main' };

/**
 * 直接从文件生成 x-spreadsheet 数据：优先在 Worker 里（主线程不阻塞，中止时 terminate），
 * 没有 Worker 时在主线程分段生成。文件不能直接读取时返回 null（改用 @vue-office/excel 读取）
 */
async function buildDirect(
  request: BuildRequest,
  signal: AbortSignal | undefined,
  useWorker: boolean,
  onProgress?: (value: number) => void
) {
  if (useWorker) {
    const result = await buildInWorker(request, signal, onProgress);
    if (result.status === 'ok') return { model: result.model, sheets: result.sheets, via: 'worker' } as Built;
    if (result.status !== 'unavailable') return null;
  }
  if (signal?.aborted) return null;
  const assembler = createAssembler();
  const post: typeof assembler.post = message => {
    if (message.type === 'progress') {
      if (!signal?.aborted) onProgress?.(message.value);
    } else assembler.post(message);
  };
  await runBuild(request, post, { measure: createTextMeasure(), yieldToMain: true, signal });
  const result = assembler.result();
  return result ? ({ ...result, via: 'main' } as Built) : null;
}

/** 准备修正：先解析文件，同时加载数字格式库 */
export async function prepareExcelFixup({
  data,
  xls,
  locale = 'zh-CN',
  signal,
  zoom,
  worker = true,
  maxCells,
  onProgress,
}: ExcelFixupOptions): Promise<ExcelFixup> {
  const [built, numfmt] = await Promise.all([
    buildDirect({ data, xls, locale, maxCells }, signal, worker, onProgress).catch(() => null),
    loadNumfmt(),
  ]);
  if (built || signal?.aborted) {
    if (built && !xls) attachXlsxAssets(built.model, data);
    return directFixup(built, numfmt, { locale, signal, zoom });
  }
  return legacyFixup({ data, xls, locale, signal, zoom, maxCells }, numfmt);
}

/** 公共部分：缩放、释放 */
function createScaleState(zoom: number | undefined) {
  return typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * 缩放用的 100% 基准：第一次缩放到非 100% 时才逐个工作表记录（补齐行列尺寸、给样式复制 font），
 * 打开文件时不遍历行列、不复制样式。没记录过的工作表数据一直是 100%，恢复 100% 时不用处理
 */
function createZoomBases() {
  let sheets: XsSheet[] | null = null;
  let counts: SheetCounts[] = [];
  let bases: Array<SheetBase | null> = [];
  /** 记录失败（数据异常）后不再缩放 */
  let broken = false;
  const ensure = (i: number): SheetBase | null => {
    if (!sheets || broken) return null;
    const sheet = sheets[i];
    if (!sheet) return null;
    let base = bases[i];
    if (!base) {
      try {
        base = bases[i] = captureSheet(sheet, counts[i]);
      } catch {
        broken = true;
        return null;
      }
    }
    return base;
  };
  return {
    /** 数据交给 x-spreadsheet 之前调用：只记下 len（x-spreadsheet 读取时会删掉） */
    attach(list: XsSheet[]) {
      sheets = list;
      counts = list.map(sheetCounts);
      bases = list.map(() => null);
      broken = false;
    },
    get ready() {
      return !!sheets && !broken;
    },
    base: ensure,
    /** 按比例改写；scale 为 100% 时只还原已经记录过的工作表 */
    scale(next: number, only?: number) {
      if (!sheets || broken) return false;
      const one = Math.abs(next - 1) < 1e-6;
      for (let i = 0; i < sheets.length; i++) {
        if (only !== undefined && i !== only) continue;
        const base = one ? bases[i] : ensure(i);
        if (broken) {
          // 数据异常：已经改写过的工作表恢复 100%，之后不再缩放
          bases.forEach((b, j) => b && sheets?.[j] && scaleSheet(sheets[j]!, b, 1));
          return false;
        }
        if (base) scaleSheet(sheets[i]!, base, next);
      }
      return true;
    },
    clear() {
      sheets = null;
      counts = [];
      bases = [];
    },
  };
}

/** 数据已经生成：@vue-office/excel 只读取一个空表，transformData 时换成生成好的数据 */
function directFixup(
  built: Built | null,
  lib: NumfmtLike | null,
  { locale, signal, zoom }: Pick<ExcelFixupOptions, 'locale' | 'signal' | 'zoom'>
): ExcelFixup {
  let model: WorkbookModel | null = built?.model ?? null;
  let sheets: XsSheet[] | null = null;
  let pending: XsSheet[] | null = built?.sheets ?? null;
  let formatter: CellFormatter | null = model
    ? createCellFormatter(lib, { locale: locale ?? 'zh-CN', date1904: model.date1904 })
    : null;
  let disposed = false;
  const stopped = () => disposed || !!signal?.aborted;
  const bases = createZoomBases();
  let scale = createScaleState(zoom);
  const fixup: ExcelFixup = {
    source: placeholderXlsx(),
    direct: built?.via ?? false,
    get model() {
      return model;
    },
    get sheets() {
      return sheets;
    },
    get formatter() {
      return formatter;
    },
    get scale() {
      return scale;
    },
    get zoomable() {
      return !!sheets && bases.ready;
    },
    setScale(next, only) {
      if (!sheets || !(next > 0)) return;
      if (bases.scale(next, only)) scale = next;
    },
    rescale(index, next, scroll) {
      return rescaleSheet(fixup, sheets, model, index, next, scroll);
    },
    zoomMath: { geometryOf, captureAxisAnchor, axisView },
    dispose() {
      disposed = true;
      for (const list of [sheets, pending]) if (list) for (const sheet of list) clearSheet(sheet);
      sheets = null;
      pending = null;
      bases.clear();
      model = null;
      formatter = null;
    },
    live(index) {
      return liveSheet(sheets, model, index);
    },
    usedSize(index) {
      const sheet = sheets?.[index];
      const base = sheet ? bases.base(index) : null;
      return sheet && base ? usedSize(sheet, base) : null;
    },
    beforeTransformData: workbook => workbook,
    transformData(input) {
      if (stopped() || !pending) return stopped() ? [] : input;
      sheets = pending;
      pending = null;
      for (const sheet of sheets) sheet.scroll = { x: 0, y: 0, ri: 0, ci: 0 } satisfies XsScroll;
      attachBases(bases, sheets, scale, s => (scale = s));
      return sheets;
    },
  };
  return fixup;
}

/** transformData：记下行列数；初始比例不是 100% 时在交给 x-spreadsheet 之前就按比例写入（此时需要记录基准） */
function attachBases(
  bases: ReturnType<typeof createZoomBases>,
  sheets: XsSheet[],
  scale: number,
  setScale: (scale: number) => void
) {
  bases.attach(sheets);
  if (Math.abs(scale - 1) > 1e-6 && !bases.scale(scale)) setScale(1);
}

function rescaleSheet(
  fixup: ExcelFixup,
  sheets: XsSheet[] | null,
  model: WorkbookModel | null,
  index: number,
  next: number,
  scroll: { left: number; top: number }
) {
  if (!sheets || !(next > 0)) return null;
  const sheet = sheets[index];
  const freeze = sheet ? model?.sheets.find(s => s.name === sheet.name)?.freeze : undefined;
  const cell = sheet ? topLeftCell(geometryOf(sheet, freeze), scroll.left, scroll.top) : null;
  fixup.setScale(next);
  return sheet && cell ? scrollForCell(geometryOf(sheet, freeze), cell.row, cell.col) : null;
}

function liveSheet(sheets: XsSheet[] | null, model: WorkbookModel | null, index: number) {
  const sheet = sheets?.[index];
  const scroll = sheet?.scroll as XsScroll | undefined;
  if (!sheet || !scroll) return null;
  const freeze = model?.sheets.find(s => s.name === sheet.name)?.freeze;
  return { data: sheet, freeze: { rows: freeze?.rows ?? 0, cols: freeze?.cols ?? 0 }, scroll };
}

/** 直接生成失败（文件不能直接读取）：交给 @vue-office/excel 读取，在 beforeTransformData / transformData 里修正 */
async function legacyFixup(
  { data, xls, locale = 'zh-CN', signal, zoom, maxCells }: ExcelFixupOptions,
  lib: NumfmtLike | null
): Promise<ExcelFixup> {
  // 单元格上限与直接生成时一致：模型按 CellBudget 截断，@vue-office/excel 读出的数据在 transformData 时按同样的行截断
  const limit = typeof maxCells === 'number' && maxCells > 0 ? maxCells : Infinity;
  const [parsed] = await Promise.all([
    xls
      ? yieldToMain()
          .then(() => (signal?.aborted ? null : parseXlsModel(data, { locale, budget: createCellBudget(limit) })))
          .catch(() => null)
      : parseXlsxModel(data, { locale, signal, budget: createCellBudget(limit) }).catch(() => null),
  ]);
  await yieldToMain();
  let model: WorkbookModel | null = parsed;
  let sheets: XsSheet[] | null = null;
  let formatter: CellFormatter | null = null;
  const measure = createTextMeasure();
  const source = parsed && !xls && !signal?.aborted ? await prepareForExcelJs(data) : null;
  let disposed = false;
  const stopped = () => disposed || !!signal?.aborted;
  const bases = createZoomBases();
  let scale = createScaleState(zoom);

  const fixup: ExcelFixup = {
    source,
    direct: false,
    get model() {
      return model;
    },
    get sheets() {
      return sheets;
    },
    get formatter() {
      return formatter;
    },
    get scale() {
      return scale;
    },
    get zoomable() {
      return !!sheets && bases.ready;
    },
    setScale(next, only) {
      if (!sheets || !(next > 0)) return;
      if (bases.scale(next, only)) scale = next;
    },
    rescale(index, next, scroll) {
      return bases.ready ? rescaleSheet(fixup, sheets, model, index, next, scroll) : null;
    },
    zoomMath: { geometryOf, captureAxisAnchor, axisView },
    dispose() {
      disposed = true;
      if (sheets) for (const sheet of sheets) clearSheet(sheet);
      sheets = null;
      bases.clear();
      model = null;
      formatter = null;
    },
    live(index) {
      return liveSheet(sheets, model, index);
    },
    usedSize(index) {
      const sheet = sheets?.[index];
      const base = sheet ? bases.base(index) : null;
      return sheet && base ? usedSize(sheet, base) : null;
    },
    beforeTransformData(workbook) {
      if (stopped()) return workbook;
      try {
        if (!model) model = modelFromExcelJs(workbook, locale);
        // 图片由叠加层按锚点显示（./overlay.ts）；@vue-office/excel 自己画在画布上的图片位置不准、不随滚动裁剪，
        // 只在读到 xlsx 的绘图信息时关掉，读取失败时保留它的效果
        if (parsed && typeof workbook.eachSheet === 'function') {
          workbook.eachSheet(ws => {
            const w = ws as unknown as { _media?: unknown[] };
            if (Array.isArray(w._media)) w._media = [];
          });
        }
        // 隐藏的工作表不显示（Excel / WPS 默认也不显示），至少保留一个
        const hidden = new Set(model.sheets.filter(s => s.state !== 'visible').map(s => s.name));
        if (hidden.size && hidden.size < model.sheets.length && typeof workbook.removeWorksheet === 'function') {
          const remove: number[] = [];
          workbook.eachSheet(ws => {
            if (hidden.has(ws.name)) remove.push(ws.id);
          });
          remove.forEach(id => workbook.removeWorksheet!(id));
        }
      } catch {
        // 读取失败时按 @vue-office/excel 原样显示
      }
      return workbook;
    },
    transformData(input) {
      // 已切换文件 / 关闭：不再修正，也不把整张表交给已卸载的 x-spreadsheet
      if (stopped()) return [];
      if (!model || !Array.isArray(input)) return input;
      try {
        formatter = createCellFormatter(lib, { locale, date1904: model.date1904 });
        const mdw = measure ? Math.round(measure('0', (model.defaultFont.sz * 4) / 3, model.defaultFont.name)) || 7 : 7;
        truncateXsInput(input, model, limit);
        sheets = applyWorkbookModel(input, model, { formatter, mdw, measure });
        for (const sheet of sheets) sheet.scroll = { x: 0, y: 0, ri: 0, ci: 0 } satisfies XsScroll;
        attachBases(bases, sheets, scale, s => (scale = s));
        return sheets;
      } catch {
        return input;
      }
    },
  };
  return fixup;
}

export { loadCellFormatter, parseXlsxModel };
export { excelNoticeOf, resolveExcelLimits } from './limits';

/**
 * @vue-office/excel 读出的数据（回退流程）按单元格上限截断：与 CellBudget 规则一致，
 * 放不下的那一行及之后的行都不显示（显示的行是完整的），所有工作表共用上限；模型里已经截断的表按模型的行截断。
 * 截断的工作表在模型上记下 truncatedRows，表格上方显示截断提示
 */
export function truncateXsInput(input: XsSheet[], model: WorkbookModel, maxCells: number): void {
  if (!(maxCells > 0)) return;
  let left = Number.isFinite(maxCells) ? maxCells : Infinity;
  for (const sheet of input) {
    const rows = sheet?.rows as Record<string, { cells?: Record<string, unknown> } | number> | undefined;
    if (!rows || typeof rows !== 'object') continue;
    const ms = model.sheets.find(s => s.name === sheet.name);
    let cut: number | undefined = ms?.truncatedRows;
    const keys: number[] = [];
    for (const k of Object.keys(rows)) if (/^\d+$/.test(k)) keys.push(Number(k));
    keys.sort((a, b) => a - b);
    for (const r of keys) {
      if (cut !== undefined && r >= cut) break;
      const row = rows[r];
      const n = row && typeof row === 'object' && row.cells && typeof row.cells === 'object' ? Object.keys(row.cells).length : 0;
      if (!n) continue;
      if (n > left) {
        cut = r;
        break;
      }
      left -= n;
    }
    if (cut === undefined) continue;
    for (const r of keys) if (r >= cut) delete rows[r];
    (rows as { len?: number }).len = Math.max(1, cut);
    if (ms) {
      ms.truncatedRows = ms.truncatedRows === undefined ? cut : Math.min(ms.truncatedRows, cut);
      trimTruncatedSheet(ms);
    }
  }
}

/** 清空 x-spreadsheet 数据：原地删除（x-spreadsheet 的 DataProxy 直接引用这些对象，换成新对象释放不了） */
function clearSheet(sheet: XsSheet) {
  for (const axis of [sheet.rows, sheet.cols] as Array<Record<string, unknown> | undefined>) {
    if (!axis || typeof axis !== 'object') continue;
    for (const key of Object.keys(axis)) delete axis[key];
  }
  if (Array.isArray(sheet.styles)) sheet.styles.length = 0;
  if (Array.isArray(sheet.merges)) sheet.merges.length = 0;
}

/** 让出主线程一次：切换文件 / 关闭时 abort 能及时生效 */
const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));
