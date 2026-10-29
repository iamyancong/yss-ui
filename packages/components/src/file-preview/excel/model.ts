/**
 * 表格预览用的工作簿模型：每个单元格的原始值（文件里保存的计算结果）、数字格式、字号，
 * 以及列宽、行高、合并、冻结、隐藏等显示信息。
 *
 * xlsx 由 parseXlsxModel 直接读取文件里的 XML 得到（见 ./xlsx.ts）；
 * 老版 xls 只能从 @vue-office/excel 转换后的 exceljs 工作簿里读取（见 ./exceljs.ts），信息少一些。
 */

import type { CfResult } from './cf';
import type { ThemeInfo } from './dml';
import type { SheetExtras } from './drawing';

/** 单元格原始值类型：数字（含日期序列号）、文本、布尔、错误值、空 */
export type RawCellType = 'n' | 's' | 'b' | 'e' | 'z';

export interface RawCell {
  t: RawCellType;
  v: number | string | boolean | null;
  /** 数字格式代码（已把内置编号换成代码） */
  fmt: string;
  /** 字号（pt） */
  sz?: number;
  /** 是否公式单元格 */
  f?: boolean;
  /** 公式没有保存计算结果（程序生成的文件常见，Excel / WPS 打开时会重新计算） */
  missing?: boolean;
  /** 被合并区域覆盖（不是左上角），不显示内容 */
  covered?: boolean;
  /** 单元格样式（WorkbookModel.cellStyles 的序号）；只有老版 xls 读取，xlsx 的样式由 exceljs 读取 */
  style?: number;
}

export type BorderSide = 'top' | 'right' | 'bottom' | 'left';

/** 单元格样式，字段与 x-spreadsheet 的样式一致（边框为 [线型, 颜色]） */
export interface CellStyleModel {
  font?: { name?: string; bold?: boolean; italic?: boolean };
  color?: string;
  underline?: boolean;
  strike?: boolean;
  bgcolor?: string;
  align?: string;
  valign?: string;
  textwrap?: boolean;
  border?: Partial<Record<BorderSide, [string, string]>>;
}

export interface SheetModel {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  /** rowIndex(0 起) → colIndex(0 起) → 单元格 */
  cells: Map<number, Map<number, RawCell>>;
  /** 合并区域（0 起，含首尾） */
  merges: Array<{ r0: number; c0: number; r1: number; c1: number }>;
  /** 列宽（字符数，0 起的列号） */
  colWidths: Map<number, number>;
  hiddenCols: Set<number>;
  /** 行高（pt） */
  rowHeights: Map<number, number>;
  hiddenRows: Set<number>;
  /** 文件记录的默认列宽（字符数，含边距，与 <col width> 同单位） */
  defaultColWidth?: number;
  /** 基础列宽（字符数，不含边距）；没有 defaultColWidth 时按它计算，Excel 默认 8 */
  baseColWidth?: number;
  defaultRowHeight?: number;
  /** 冻结的列数、行数 */
  freeze?: { cols: number; rows: number };
  showGridLines: boolean;
  /** 没有保存计算结果的公式单元格数 */
  missingFormulas: number;
  /** 公式单元格数 */
  formulaCells: number;
  /** 绘图对象、批注、超链接、迷你图等（只有 xlsx 有，见 ./drawing.ts） */
  extras?: SheetExtras;
  /** 条件格式的计算结果（见 ./cf.ts） */
  cf?: CfResult;
  /** 单元格总数上限（所有工作表共用，见 CellBudget）；没有时不限制 */
  budget?: CellBudget;
  /** 超过单元格上限被截断：只保留前 truncatedRows 行（0 起的行号小于它的行） */
  truncatedRows?: number;
}

/**
 * 读取时的单元格计数与上限：所有工作表共用。超过 max 时当前工作表从这一行起截断，之后的工作表不再读取单元格。
 * 内容异常多（解压后体积巨大）的文件不会把页面拖垮，仍能显示前面的部分
 */
export interface CellBudget {
  max: number;
  /** 已读取的单元格数 */
  count: number;
}

export const createCellBudget = (max = Infinity): CellBudget => ({ max, count: 0 });

/** 读取 xlsx 里图片等二进制部件 */
export interface WorkbookAssets {
  bytes(path: string): Promise<Uint8Array | null>;
  /** 条目解压后的大小（字节），不存在时为 undefined */
  size(path: string): number | undefined;
}

export interface WorkbookModel {
  date1904: boolean;
  /** 打开时显示的工作表（按文件中的顺序，含隐藏表） */
  activeTab: number;
  /**
   * Excel / WPS 打开时会重新计算公式：文件要求打开时重算（fullCalcOnLoad，如 xlsxwriter、openpyxl 生成的文件），
   * 或没有记录计算引擎版本（calcId，如 LibreOffice 保存的文件）。预览显示的是文件里保存的结果，个别单元格可能不同。
   */
  fullCalcOnLoad: boolean;
  sheets: SheetModel[];
  /** 主题颜色，按 Excel 的 theme 序号（0 lt1、1 dk1、2 lt2、3 dk2、4~9 accent、10 hlink、11 folHlink） */
  themeColors: string[];
  /** 默认字体（Normal 样式），用于换算列宽 */
  defaultFont: { name?: string; sz: number };
  /** 主题（颜色与字体），图表与形状使用 */
  theme?: ThemeInfo;
  /** 读取图片等二进制部件 */
  assets?: WorkbookAssets;
  /** 单元格样式表（RawCell.style 指向这里）；老版 xls 转换时 SheetJS 丢掉了全部样式，从 BIFF 的 XF 记录读取 */
  cellStyles?: CellStyleModel[];
  /** 读取到的单元格总数（截断时为保留的数量） */
  cellCount?: number;
}

export const createSheetModel = (name: string, state: SheetModel['state'] = 'visible'): SheetModel => ({
  name,
  state,
  cells: new Map(),
  merges: [],
  colWidths: new Map(),
  hiddenCols: new Set(),
  rowHeights: new Map(),
  hiddenRows: new Set(),
  showGridLines: true,
  missingFormulas: 0,
  formulaCells: 0,
});

/** Excel 的行列上限（0 起的行号、列号不能达到） */
const MAX_ROW = 1_048_576;
const MAX_COL = 16_384;

export const setCell = (sheet: SheetModel, row: number, col: number, cell: RawCell) => {
  // 超出 Excel 行列范围的单元格（文件异常）不显示
  if (!(row >= 0 && row < MAX_ROW && col >= 0 && col < MAX_COL)) return;
  if (sheet.truncatedRows !== undefined && row >= sheet.truncatedRows) return;
  const budget = sheet.budget;
  if (budget) {
    if (budget.count >= budget.max) {
      // 达到上限：这一行（可能已读了一部分）及之后都不显示，保证显示的行是完整的
      sheet.truncatedRows = row;
      const partial = sheet.cells.get(row);
      if (partial) {
        budget.count -= partial.size;
        sheet.cells.delete(row);
      }
      return;
    }
    if (!sheet.cells.get(row)?.has(col)) budget.count++;
  }
  let cells = sheet.cells.get(row);
  if (!cells) sheet.cells.set(row, (cells = new Map()));
  cells.set(col, cell);
};

/** 截断的工作表去掉截断行及之后的行高、隐藏行、合并区域（合并区域跨过截断行时截到最后一行） */
export function trimTruncatedSheet(sheet: SheetModel) {
  const cut = sheet.truncatedRows;
  if (cut === undefined) return;
  for (const r of [...sheet.cells.keys()]) if (r >= cut) sheet.cells.delete(r);
  for (const r of [...sheet.rowHeights.keys()]) if (r >= cut) sheet.rowHeights.delete(r);
  for (const r of [...sheet.hiddenRows]) if (r >= cut) sheet.hiddenRows.delete(r);
  sheet.merges = sheet.merges
    .filter(m => m.r0 < cut)
    .map(m => (m.r1 >= cut ? { ...m, r1: cut - 1 } : m))
    .filter(m => m.r1 > m.r0 || m.c1 > m.c0);
}

/** A1 → { row, col }（0 起）；无效时返回 null */
export function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

/** 0 起的列号 → 列名 */
export function columnName(col: number): string {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
