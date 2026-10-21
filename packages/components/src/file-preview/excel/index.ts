/**
 * Excel 显示修正：在 @vue-office/excel 把数据交给 x-spreadsheet 之前，按文件里保存的值与格式重写单元格文字和样式。
 * 入口只被 renderers/excel.ts 动态加载。
 */
import { applyWorkbookModel, type XsSheet } from './apply';
import { modelFromExcelJs, type ExcelJsWorkbook } from './exceljs';
import { createCellFormatter, loadCellFormatter, loadNumfmt } from './format';
import type { WorkbookModel } from './model';
import { parseXlsModel } from './xls';
import { parseXlsxModel } from './xlsx';

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
  const measure = createMeasure();

  const fixup: ExcelFixup = {
    get model() {
      return model;
    },
    get sheets() {
      return sheets;
    },
    beforeTransformData(workbook) {
      try {
        if (!model) model = modelFromExcelJs(workbook, locale);
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
        const formatter = createCellFormatter(lib, { locale, date1904: model.date1904 });
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
