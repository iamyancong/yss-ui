/**
 * 解析图表、迷你图里的单元格引用（Sheet1!$A$1:$B$5、'工作表 1'!A1:A3、(区域1,区域2)），从工作簿模型读取单元格。
 */
import type { CellFormatter } from './format';
import { parseCellRef, type RawCell, type SheetModel, type WorkbookModel } from './model';
import type { RefCell } from './chart';

export interface RefRange {
  sheet?: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** 单个引用里最多读取的单元格数 */
export const MAX_REF_CELLS = 20000;

/** 按顶层逗号拆分（引号里的逗号不拆） */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

export function parseRefs(formula: string): RefRange[] | null {
  let f = formula.trim().replace(/^=/, '');
  if (f.startsWith('(') && f.endsWith(')')) f = f.slice(1, -1);
  const out: RefRange[] = [];
  for (const part of splitTop(f)) {
    const bang = part.lastIndexOf('!');
    let sheet: string | undefined;
    let area = part;
    if (bang >= 0) {
      sheet = part.slice(0, bang).trim();
      area = part.slice(bang + 1);
      if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
      // 外部工作簿引用（[1]Sheet1!A1）不读取
      if (/^\[.*\]/.test(sheet)) return null;
    }
    const [a, b] = area.split(':');
    const p = parseCellRef(a ?? '');
    const q = b ? parseCellRef(b) : p;
    if (!p || !q) return null;
    out.push({ sheet, r0: Math.min(p.row, q.row), c0: Math.min(p.col, q.col), r1: Math.max(p.row, q.row), c1: Math.max(p.col, q.col) });
  }
  return out.length ? out : null;
}

export function createRefResolver(model: WorkbookModel, formatter: CellFormatter | null, currentSheet?: () => string | undefined) {
  const byName = new Map<string, SheetModel>(model.sheets.map(s => [s.name.toLowerCase(), s]));
  const toCell = (raw: RawCell | undefined): RefCell => {
    if (!raw || raw.t === 'z') return { text: '' };
    const num = raw.t === 'n' ? (raw.v as number) : raw.t === 'b' ? (raw.v ? 1 : 0) : undefined;
    let text = '';
    try {
      text = formatter ? formatter.format(raw).text : String(raw.v ?? '');
    } catch {
      text = String(raw.v ?? '');
    }
    return { text, num };
  };
  return (formula: string): RefCell[][] | undefined => {
    const ranges = parseRefs(formula);
    if (!ranges) return undefined;
    const grids: RefCell[][][] = [];
    let total = 0;
    for (const r of ranges) {
      const sheet = byName.get((r.sheet ?? currentSheet?.() ?? '').toLowerCase());
      if (!sheet) return undefined;
      const grid: RefCell[][] = [];
      for (let row = r.r0; row <= r.r1; row++) {
        // 隐藏行不画（Excel 默认「只绘制可见单元格」）
        if (sheet.hiddenRows.has(row)) continue;
        const line: RefCell[] = [];
        for (let col = r.c0; col <= r.c1; col++) {
          if (sheet.hiddenCols.has(col) && r.c0 !== r.c1) continue;
          if (++total > MAX_REF_CELLS) return undefined;
          line.push(toCell(sheet.cells.get(row)?.get(col)));
        }
        grid.push(line);
      }
      grids.push(grid);
    }
    if (grids.length === 1) return grids[0];
    // 多个区域：都是一列时上下拼接，都是一行时左右拼接
    if (grids.every(g => g.every(row => row.length === 1))) return grids.flat();
    if (grids.every(g => g.length === 1)) return [grids.flatMap(g => g[0])];
    return grids.flat();
  };
}
