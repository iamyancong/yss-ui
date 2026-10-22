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

export type { WorkbookModel } from './model';

/** 挂在预览容器上的调试数据（测试与排查用，不是公开 API） */
export const EXCEL_DATA_KEY = Symbol.for('yss.filePreview.excelData');

export interface ExcelFixupOptions {
  data: ArrayBuffer;
  /** 老版 xls（OLE 复合文档）：读取 BIFF 记录；不是 BIFF8 时改从 exceljs 读取 */
  xls: boolean;
  locale?: string;
  signal?: AbortSignal;
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
export async function prepareExcelFixup({ data, xls, locale = 'zh-CN', signal }: ExcelFixupOptions): Promise<ExcelFixup> {
  const [parsed, lib] = await Promise.all([
    xls ? Promise.resolve().then(() => parseXlsModel(data, { locale })).catch(() => null) : parseXlsxModel(data, { locale, signal }).catch(() => null),
    loadNumfmt(),
  ]);
  let model: WorkbookModel | null = parsed;
  let sheets: XsSheet[] | null = null;
  let formatter: CellFormatter | null = null;
  const measure = createMeasure();
  const source = parsed && !xls ? await prepareForExcelJs(data) : null;

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
        return sheets;
      } catch {
        return input;
      }
    },
  };
  return fixup;
}

export { loadCellFormatter, parseXlsxModel };
