/**
 * 表格显示审计：把预览实际要显示的文字与参考文字（LibreOffice 按「显示的文字」导出的 CSV）逐格比较。
 *
 * - gridFromModel：用 WorkbookModel + 格式化器得到每格文字（不经过 x-spreadsheet，node 环境可用）；
 * - gridFromSheets：从交给 x-spreadsheet 的数据读取每格文字（浏览器里从预览容器取，见 EXCEL_DATA_KEY）；
 * - compareGrids：逐格比较，返回不一致的单元格；可忽略工作表、单元格或按已知差异放行。
 *
 * 也可以在浏览器控制台或 puppeteer 里使用：读取 `container.querySelector('.yss-file-preview-excel')[Symbol.for('yss.filePreview.excelData')]`。
 */
import type { XsSheet } from '../excel/apply';
import type { CellFormatter } from '../excel/format';
import { columnName, type WorkbookModel } from '../excel/model';

export type TextGrid = Record<string, string[][]>;

export interface GridProblem {
  sheet: string;
  cell: string;
  expected: string;
  actual: string;
}

export function gridFromModel(model: WorkbookModel, formatter: CellFormatter, { visibleOnly = false } = {}): TextGrid {
  const out: TextGrid = {};
  for (const sheet of model.sheets) {
    if (visibleOnly && sheet.state !== 'visible') continue;
    const rows: string[][] = [];
    for (const [r, cells] of sheet.cells) {
      for (const [c, raw] of cells) {
        const row = (rows[r] ??= []);
        row[c] = formatter.format(raw).text;
      }
    }
    out[sheet.name] = Array.from(rows, row => Array.from(row ?? [], v => v ?? ''));
  }
  return out;
}

export function gridFromSheets(sheets: XsSheet[]): TextGrid {
  const out: TextGrid = {};
  for (const sheet of sheets) {
    const rows: string[][] = [];
    for (const [key, row] of Object.entries(sheet.rows)) {
      if (!/^\d+$/.test(key) || typeof row !== 'object' || !row.cells) continue;
      for (const [ck, cell] of Object.entries(row.cells)) {
        if (!/^\d+$/.test(ck)) continue;
        const text = cell?.text;
        (rows[Number(key)] ??= [])[Number(ck)] = text === undefined || text === null ? '' : String(text);
      }
    }
    out[sheet.name] = Array.from(rows, row => Array.from(row ?? [], v => v ?? ''));
  }
  return out;
}

export interface CompareOptions {
  /** 不比较的工作表 */
  ignoreSheets?: string[];
  /** 不比较的单元格，如 { layout: ['C3'] } */
  ignoreCells?: Record<string, string[]>;
  /** 已知差异：参考值 → 预览允许的值（如 LibreOffice 与 Excel 的常规格式位数不同） */
  accept?: (expected: string, actual: string, sheet: string, cell: string) => boolean;
}

export function compareGrids(actual: TextGrid, expected: TextGrid, options: CompareOptions = {}): GridProblem[] {
  const problems: GridProblem[] = [];
  for (const [sheet, rows] of Object.entries(expected)) {
    if (options.ignoreSheets?.includes(sheet)) continue;
    const ignore = new Set(options.ignoreCells?.[sheet] ?? []);
    const got = actual[sheet];
    if (!got) {
      problems.push({ sheet, cell: '-', expected: 'sheet', actual: 'missing' });
      continue;
    }
    const height = Math.max(rows.length, got.length);
    for (let r = 0; r < height; r++) {
      const width = Math.max(rows[r]?.length ?? 0, got[r]?.length ?? 0);
      for (let c = 0; c < width; c++) {
        const ref = `${columnName(c)}${r + 1}`;
        if (ignore.has(ref)) continue;
        const e = rows[r]?.[c] ?? '';
        const a = got[r]?.[c] ?? '';
        if (e !== a && !options.accept?.(e, a, sheet, ref)) problems.push({ sheet, cell: ref, expected: e, actual: a });
      }
    }
  }
  return problems;
}
