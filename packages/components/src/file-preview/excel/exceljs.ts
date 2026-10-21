/**
 * 从 exceljs 工作簿（@vue-office/excel 的 beforeTransformData 回调参数）读取 WorkbookModel。
 *
 * 用于老版 .xls（@vue-office/excel 先用内置的 SheetJS 转成 xlsx 再交给 exceljs，原始 XML 拿不到），
 * 以及浏览器不支持 DecompressionStream 时的 xlsx。必须在 @vue-office/excel 改写样式之前调用。
 * 只用到 exceljs 的公开字段；日期已被 exceljs 转成 Date，这里换回序列号再按格式显示。
 */
import { builtinFormat } from './builtin-formats';
import { createSheetModel, setCell, type RawCell, type WorkbookModel } from './model';

/** exceljs 的最小结构（只列出用到的字段） */
export interface ExcelJsCell {
  value: unknown;
  numFmt?: string;
  style?: { font?: { size?: number }; numFmt?: string };
  isMerged?: boolean;
  master?: { address: string };
  address?: string;
}
export interface ExcelJsRow {
  number: number;
  height?: number;
  hidden?: boolean;
  eachCell(cb: (cell: ExcelJsCell, col: number) => void): void;
}
export interface ExcelJsWorksheet {
  id: number;
  name: string;
  state?: string;
  views?: Array<{ state?: string; xSplit?: number; ySplit?: number; showGridLines?: boolean }>;
  columnCount?: number;
  properties?: { defaultColWidth?: number; defaultRowHeight?: number };
  getColumn(index: number): { width?: number; hidden?: boolean };
  eachRow(cb: (row: ExcelJsRow, rowNumber: number) => void): void;
}
export interface ExcelJsWorkbook {
  worksheets?: ExcelJsWorksheet[];
  eachSheet(cb: (ws: ExcelJsWorksheet, id: number) => void): void;
  removeWorksheet?(id: number): void;
  properties?: { date1904?: boolean };
  views?: Array<{ activeTab?: number }>;
}

const MS_PER_DAY = 86400000;

/** exceljs 的 Date（UTC）→ Excel 序列号 */
export const dateToSerial = (d: Date, date1904 = false) => d.getTime() / MS_PER_DAY + 25569 - (date1904 ? 1462 : 0);

export function rawFromExcelJs(value: unknown, fmt: string, date1904: boolean): RawCell {
  const cell: RawCell = { t: 'z', v: null, fmt };
  let v = value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o || 'result' in o) {
      cell.f = true;
      v = o.result;
      if (v === undefined) {
        cell.missing = true;
        return cell;
      }
      if (v && typeof v === 'object' && !(v instanceof Date) && 'error' in (v as object)) {
        return { ...cell, t: 'e', v: String((v as { error: unknown }).error) };
      }
    } else if ('richText' in o && Array.isArray(o.richText)) {
      v = (o.richText as Array<{ text?: string }>).map(r => r.text ?? '').join('');
    } else if ('text' in o) {
      const t = o.text;
      v = typeof t === 'object' && t && 'richText' in t ? (t as { richText: Array<{ text?: string }> }).richText.map(r => r.text ?? '').join('') : t;
    } else if ('error' in o) {
      return { ...cell, t: 'e', v: String(o.error) };
    }
  }
  if (v instanceof Date) {
    const serial = dateToSerial(v, date1904);
    return Number.isFinite(serial) ? { ...cell, t: 'n', v: serial } : cell;
  }
  if (typeof v === 'number') return { ...cell, t: 'n', v };
  if (typeof v === 'boolean') return { ...cell, t: 'b', v };
  if (typeof v === 'string') return { ...cell, t: 's', v };
  return cell;
}

/** exceljs 把内置编号 14、22 写成美式代码，按当前语言换回 Excel 的显示 */
const EXCELJS_BUILTIN: Record<string, number> = { 'mm-dd-yy': 14, 'm/d/yy h:mm': 22 };

/** 读取 exceljs 工作簿 */
export function modelFromExcelJs(wb: ExcelJsWorkbook, locale = 'zh-CN'): WorkbookModel {
  const date1904 = !!wb.properties?.date1904;
  const model: WorkbookModel = {
    date1904,
    activeTab: wb.views?.[0]?.activeTab ?? 0,
    fullCalcOnLoad: false,
    sheets: [],
    themeColors: [],
    defaultFont: { sz: 11 },
  };
  wb.eachSheet(ws => {
    const state = ws.state === 'hidden' || ws.state === 'veryHidden' ? ws.state : 'visible';
    const sheet = createSheetModel(ws.name, state);
    const view = ws.views?.[0];
    if (view?.state === 'frozen' && (view.xSplit || view.ySplit)) sheet.freeze = { cols: view.xSplit ?? 0, rows: view.ySplit ?? 0 };
    if (view?.showGridLines === false) sheet.showGridLines = false;
    if (ws.properties?.defaultColWidth) sheet.defaultColWidth = ws.properties.defaultColWidth;
    if (ws.properties?.defaultRowHeight) sheet.defaultRowHeight = ws.properties.defaultRowHeight;
    for (let c = 1; c <= (ws.columnCount ?? 0); c++) {
      const col = ws.getColumn(c);
      if (col.width) sheet.colWidths.set(c - 1, col.width);
      if (col.hidden) sheet.hiddenCols.add(c - 1);
    }
    ws.eachRow(row => {
      const r = row.number - 1;
      if (row.height) sheet.rowHeights.set(r, row.height);
      if (row.hidden) sheet.hiddenRows.add(r);
      row.eachCell((cell, col) => {
        if (cell.isMerged && cell.master && cell.address && cell.master.address !== cell.address) {
          setCell(sheet, r, col - 1, { t: 'z', v: null, fmt: 'General', covered: true });
          return;
        }
        const code = cell.numFmt ?? cell.style?.numFmt ?? 'General';
        const builtin = EXCELJS_BUILTIN[code];
        const raw = rawFromExcelJs(cell.value, builtin === undefined ? code : builtinFormat(builtin, locale), date1904);
        const sz = cell.style?.font?.size;
        if (typeof sz === 'number') raw.sz = sz;
        if (raw.f) sheet.formulaCells++;
        if (raw.missing) sheet.missingFormulas++;
        setCell(sheet, r, col - 1, raw);
      });
    });
    model.sheets.push(sheet);
  });
  return model;
}
