/**
 * Excel 显示修正：在 @vue-office/excel 把数据交给 x-spreadsheet 之前，按文件里保存的值与格式重写单元格文字和样式。
 * 入口只被 renderers/excel.ts 动态加载。
 */
import { applyWorkbookModel, type XsSheet } from './apply';
import { modelFromExcelJs, type ExcelJsWorkbook } from './exceljs';
import { createCellFormatter, loadCellFormatter, loadNumfmt, type CellFormatter } from './format';
import type { WorkbookModel } from './model';
import { parseXlsModel } from './xls';
import { parseXlsxModel, prepareForExcelJs } from './xlsx';
import {
  axisView,
  captureAxisAnchor,
  captureSheetBase,
  geometryOf,
  scaleSheets,
  scrollForCell,
  topLeftCell,
  usedSize,
  type SheetBase,
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
  /** 交给 @vue-office/excel 的文件（xlsx 时改掉了 exceljs 读不了的部分，见 prepareForExcelJs）；null 时用原文件 */
  readonly source: ArrayBuffer | null;
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

type Measure = (text: string, fontPx: number, fontName?: string, bold?: boolean) => number;

function createMeasure(): Measure | undefined {
  if (typeof document === 'undefined') return undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return undefined;
  const c = ctx;
  return (text, px, name, bold) => {
    c.font = `${bold ? 'bold ' : ''}${px}px ${name ? `"${name}", ` : ''}sans-serif`;
    return c.measureText(text).width;
  };
}

/** 准备修正：先解析 xlsx（如果是），同时加载数字格式库 */
export async function prepareExcelFixup({
  data,
  xls,
  locale = 'zh-CN',
  signal,
  zoom,
}: ExcelFixupOptions): Promise<ExcelFixup> {
  const [parsed, lib] = await Promise.all([
    xls ? Promise.resolve().then(() => parseXlsModel(data, { locale })).catch(() => null) : parseXlsxModel(data, { locale, signal }).catch(() => null),
    loadNumfmt(),
  ]);
  let model: WorkbookModel | null = parsed;
  let sheets: XsSheet[] | null = null;
  let formatter: CellFormatter | null = null;
  const measure = createMeasure();
  const source = parsed && !xls ? await prepareForExcelJs(data) : null;
  let bases: SheetBase[] | null = null;
  let scale = typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  const fixup: ExcelFixup = {
    source,
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
      return !!(sheets && bases);
    },
    setScale(next, only) {
      if (!sheets || !bases || !(next > 0)) return;
      scale = next;
      scaleSheets(sheets, bases, next, only);
    },
    rescale(index, next, scroll) {
      if (!sheets || !bases || !(next > 0)) return null;
      const sheet = sheets[index];
      const freeze = sheet ? model?.sheets.find(s => s.name === sheet.name)?.freeze : undefined;
      const cell = sheet ? topLeftCell(geometryOf(sheet, freeze), scroll.left, scroll.top) : null;
      fixup.setScale(next);
      return sheet && cell ? scrollForCell(geometryOf(sheet, freeze), cell.row, cell.col) : null;
    },
    zoomMath: { geometryOf, captureAxisAnchor, axisView },
    live(index) {
      const sheet = sheets?.[index];
      const scroll = sheet?.scroll as XsScroll | undefined;
      if (!sheet || !scroll) return null;
      const freeze = model?.sheets.find(s => s.name === sheet.name)?.freeze;
      return { data: sheet, freeze: { rows: freeze?.rows ?? 0, cols: freeze?.cols ?? 0 }, scroll };
    },
    usedSize(index) {
      const sheet = sheets?.[index];
      const base = bases?.[index];
      return sheet && base ? usedSize(sheet, base) : null;
    },
    beforeTransformData(workbook) {
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
      if (!model || !Array.isArray(input)) return input;
      try {
        formatter = createCellFormatter(lib, { locale, date1904: model.date1904 });
        const mdw = measure ? Math.round(measure('0', (model.defaultFont.sz * 4) / 3, model.defaultFont.name)) || 7 : 7;
        sheets = applyWorkbookModel(input, model, { formatter, mdw, measure });
        for (const sheet of sheets) sheet.scroll = { x: 0, y: 0, ri: 0, ci: 0 } satisfies XsScroll;
        try {
          bases = captureSheetBase(sheets);
          if (Math.abs(scale - 1) > 1e-6) scaleSheets(sheets, bases, scale);
        } catch {
          bases = null;
          scale = 1;
        }
        return sheets;
      } catch {
        return input;
      }
    },
  };
  return fixup;
}

export { loadCellFormatter, parseXlsxModel };
