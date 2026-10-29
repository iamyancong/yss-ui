/**
 * Excel 大表格的阈值：不拦截预览，只决定显示什么提示条。
 *
 * - 单元格数（实际读到的数量）或文件大小超过提示阈值：表格上方显示「文件较大，滚动和缩放可能略慢」；
 * - 单元格数超过上限：只读取前面的行（见 ./model.ts 的 CellBudget），提示下载查看完整内容。
 *
 * 不再按文件里写的范围（`<dimension>`、DIMENSIONS 记录）估算：范围可能不可信，读到多少算多少。
 */
import { DEFAULT_EXCEL_MAX_CELLS, DEFAULT_EXCEL_WARN_CELLS, DEFAULT_LARGE_FILE_WARN_SIZE } from '../constant';

/** excelMaxCells 属性：数字为上限（超过时截断）；对象可分别设置提示阈值 warn 与上限 max。Infinity 表示不限制 */
export type ExcelMaxCellsOption = number | { warn?: number; max?: number };

export interface ExcelLimits {
  /** 单元格数超过时显示提示条 */
  warnCells: number;
  /** 最多读取的单元格数，超过时截断 */
  maxCells: number;
  /** 文件大小超过时显示提示条（字节） */
  warnSize: number;
}

const positive = (v: unknown, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) && v > 0 ? v : fallback);

/** 0、负数、NaN 等无效值按默认值；warn 大于 max 时按 max（截断时显示截断提示，不再显示较大提示） */
export function resolveExcelLimits(maxCells?: ExcelMaxCellsOption, largeFileWarnSize?: number): ExcelLimits {
  const obj = typeof maxCells === 'object' && maxCells ? maxCells : null;
  const max = positive(obj ? obj.max : maxCells, DEFAULT_EXCEL_MAX_CELLS);
  const warn = Math.min(positive(obj?.warn, DEFAULT_EXCEL_WARN_CELLS), max);
  // largeFileWarnSize 为 0 / 负数 / NaN / Infinity 时不按文件大小提示
  const size =
    largeFileWarnSize === undefined || largeFileWarnSize === null ? DEFAULT_LARGE_FILE_WARN_SIZE : largeFileWarnSize;
  return { warnCells: warn, maxCells: max, warnSize: typeof size === 'number' && size > 0 ? size : Infinity };
}

export type ExcelNotice =
  | { kind: 'truncated'; sheet: string; rows: number; more: number }
  | { kind: 'cells'; cells: number }
  | { kind: 'size' };

/**
 * 读取结果对应的提示条；null 表示不提示。恰好等于阈值时不提示。
 * cells 为实际读到的单元格数（读不到时为 undefined，只按文件大小判断）
 */
export function excelNoticeOf(
  result: { cells?: number; truncated?: Array<{ sheet: string; rows: number }> },
  byteLength: number,
  limits: ExcelLimits
): ExcelNotice | null {
  const cut = result.truncated ?? [];
  if (cut.length) return { kind: 'truncated', sheet: cut[0].sheet, rows: cut[0].rows, more: cut.length - 1 };
  if (result.cells !== undefined && result.cells > limits.warnCells) return { kind: 'cells', cells: result.cells };
  if (byteLength > limits.warnSize) return { kind: 'size' };
  return null;
}
