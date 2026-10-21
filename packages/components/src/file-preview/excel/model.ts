/**
 * 表格预览用的工作簿模型：每个单元格的原始值（文件里保存的计算结果）、数字格式、字号，
 * 以及列宽、行高、合并、冻结、隐藏等显示信息。
 *
 * xlsx 由 parseXlsxModel 直接读取文件里的 XML 得到（见 ./xlsx.ts）；
 * 老版 xls 只能从 @vue-office/excel 转换后的 exceljs 工作簿里读取（见 ./exceljs.ts），信息少一些。
 */

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

export const setCell = (sheet: SheetModel, row: number, col: number, cell: RawCell) => {
  let cells = sheet.cells.get(row);
  if (!cells) sheet.cells.set(row, (cells = new Map()));
  cells.set(col, cell);
};

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
