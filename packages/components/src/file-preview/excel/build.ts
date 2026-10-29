/**
 * 不经过 @vue-office/excel 的 exceljs / SheetJS，直接从 WorkbookModel 生成交给 x-spreadsheet 的数据。
 *
 * 读取（./xlsx.ts、./xls.ts）与生成都不依赖 DOM，可以放在 Web Worker 里运行（见 ./worker.ts）：
 * 大表格的解析不再阻塞页面，切换文件 / 关闭时直接结束 Worker。
 * 生成的数据与原来「exceljs 读取 → @vue-office/excel 转换 → ./apply.ts 修正」的结果一致。
 */
import { applySheetModel, type ApplyOptions, type XsSheet } from './apply';
import { columnName, createCellBudget, type SheetModel, type WorkbookModel } from './model';
import { parseXlsModel } from './xls';
import { parseXlsxModel } from './xlsx';
import { createStoredZip } from './zip';

/** @vue-office/excel 交给 x-spreadsheet 的最少行列数（minRowLength 默认 100、minColLength 20） */
const MIN_ROWS = 100;
const MIN_COLS = 20;

/** 显示的工作表：隐藏的不显示（Excel / WPS 默认也不显示）；全部隐藏时都显示 */
export function visibleSheetModels(model: WorkbookModel): SheetModel[] {
  const visible = model.sheets.filter(s => s.state === 'visible');
  return visible.length ? visible : model.sheets;
}

/** 合并区域写成 x-spreadsheet 的格式：merges 列表 + 左上角单元格的 merge: [跨行数, 跨列数] */
function writeMerges(target: XsSheet, sheet: SheetModel) {
  const rows = target.rows as Record<string, { cells?: Record<string, { merge?: [number, number] }> }>;
  const merges: string[] = [];
  for (const m of sheet.merges) {
    merges.push(`${columnName(m.c0)}${m.r0 + 1}:${columnName(m.c1)}${m.r1 + 1}`);
    const row = rows[m.r0] ?? (rows[m.r0] = { cells: {} });
    const cells = row.cells ?? (row.cells = {});
    const cell = cells[m.c0] ?? (cells[m.c0] = {});
    cell.merge = [m.r1 - m.r0, m.c1 - m.c0];
  }
  target.merges = merges;
}

export function buildSheet(sheet: SheetModel, model: WorkbookModel, options: ApplyOptions): XsSheet {
  const target: XsSheet = { name: sheet.name, styles: [], rows: { len: MIN_ROWS }, cols: { len: MIN_COLS } };
  writeMerges(target, sheet);
  applySheetModel(target, sheet, model, { ...options, shareStyles: true });
  return target;
}

/** 生成全部显示的工作表 */
export function buildSheets(model: WorkbookModel, options: ApplyOptions): XsSheet[] {
  return visibleSheetModels(model).map(s => buildSheet(s, model, options));
}

export interface ParseWorkbookOptions {
  xls: boolean;
  locale?: string;
  signal?: AbortSignal;
  /** 解析中让出线程（主线程上为 true） */
  yieldRows?: boolean;
  /** 单元格总数上限（超过时截断，见 CellBudget），默认不限制 */
  maxCells?: number;
  /** 解析进度（0~1） */
  onProgress?: (fraction: number) => void;
}

/**
 * 读取能直接生成数据的模型：xlsx 带单元格样式；xls 为 BIFF8（样式来自 XF 记录）。
 * 读不了时返回 null，调用方改用 @vue-office/excel 自己的读取
 */
export async function parseWorkbook(data: ArrayBuffer, options: ParseWorkbookOptions): Promise<WorkbookModel | null> {
  const locale = options.locale ?? 'zh-CN';
  const budget = createCellBudget(options.maxCells);
  if (options.xls) {
    const model = parseXlsModel(data, { locale, budget, onProgress: options.onProgress });
    return model?.cellStyles ? model : null;
  }
  const model = await parseXlsxModel(data, {
    locale,
    signal: options.signal,
    cellStyles: true,
    yieldRows: options.yieldRows,
    budget,
    onProgress: options.onProgress,
  });
  return model?.cellStyles ? model : null;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

let placeholder: ArrayBuffer | null = null;

/**
 * 只有一个空工作表的 xlsx：交给 @vue-office/excel 走完它的流程（创建 x-spreadsheet、事件），
 * 它几毫秒就能读完；真正的数据在 transformData 里换成已经生成好的数据
 */
export function placeholderXlsx(): ArrayBuffer {
  if (!placeholder) {
    placeholder = createStoredZip([
      [
        '[Content_Types].xml',
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ],
      [
        '_rels/.rels',
        `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ],
      [
        'xl/workbook.xml',
        `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ],
      [
        'xl/_rels/workbook.xml.rels',
        `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ],
      ['xl/worksheets/sheet1.xml', `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><sheetData/></worksheet>`],
    ]);
  }
  return placeholder.slice(0);
}
