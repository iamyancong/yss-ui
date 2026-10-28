import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySheetModel, type XsSheet } from '../excel/apply';
import type { CellStyleModel, WorkbookModel } from '../excel/model';
import { parseXlsModel } from '../excel/xls';

const fixture = (name: string) => {
  const buf = readFileSync(resolve(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

/** A1 → 单元格样式 */
const styleAt = (model: WorkbookModel, ref: string): CellStyleModel | undefined => {
  const col = ref.charCodeAt(0) - 65;
  const row = Number(ref.slice(1)) - 1;
  const i = model.sheets[0].cells.get(row)?.get(col)?.style;
  return i === undefined ? undefined : model.cellStyles![i];
};

const formatter = {
  format: (raw: { v: unknown }) => ({
    text: raw.v === null || raw.v === undefined ? '' : String(raw.v),
    kind: typeof raw.v === 'number' ? 'number' : 'text',
  }),
} as never;

describe('xls（BIFF8）单元格样式', () => {
  const model = parseXlsModel(fixture('xls-styles.xls'))!;

  it('读取边框线型与颜色，空白单元格的边框也保留', () => {
    expect(styleAt(model, 'A1')?.border).toEqual({
      left: ['thin', '#000000'],
      right: ['thin', '#000000'],
      top: ['thin', '#000000'],
      bottom: ['thin', '#000000'],
    });
    const blank = model.sheets[0].cells.get(2)?.get(2);
    expect(blank).toMatchObject({ t: 'z' });
    expect(styleAt(model, 'C3')?.border?.bottom).toEqual(['thin', '#000000']);
    expect(styleAt(model, 'E1')?.border).toEqual({ bottom: ['medium', '#FF0000'] });
    expect(styleAt(model, 'E2')?.border?.top?.[0]).toBe('dashed');
    expect(styleAt(model, 'E3')?.border?.bottom?.[0]).toBe('double');
  });

  it('读取填充、字体与对齐', () => {
    expect(styleAt(model, 'A5')?.bgcolor).toBe('#FFFF00');
    expect(styleAt(model, 'B5')?.bgcolor).toMatch(/^#[0-9A-F]{6}$/);
    expect(styleAt(model, 'A6')?.font).toMatchObject({ name: 'Arial', bold: true });
    expect(styleAt(model, 'B6')).toMatchObject({ font: { italic: true }, color: '#FF0000' });
    expect(styleAt(model, 'C6')).toMatchObject({ underline: true, strike: true });
    expect(styleAt(model, 'A7')).toMatchObject({ align: 'center', valign: 'top' });
    expect(styleAt(model, 'B7')?.textwrap).toBe(true);
    expect(styleAt(model, 'A1')?.color).toBeUndefined();
  });

  it('写入 x-spreadsheet 数据：按样式拆分共用样式，合并区域补上右、下边框', () => {
    // SheetJS 转换后的数据：所有单元格共用一个没有边框的样式
    const shared = { font: { name: 'Calibri', size: 11 }, border: { top: ['dotted', '#999999'] } };
    const target: XsSheet = {
      name: 'Styles',
      styles: [shared],
      rows: {
        0: { cells: { 0: { text: '11', style: 0 }, 1: { text: '12', style: 0 } } },
        8: { cells: { 0: { text: 'merged', style: 0 } } },
      },
      cols: {},
    };
    applySheetModel(target, model.sheets[0], model, { formatter });
    const rows = target.rows as Record<string, { cells: Record<string, { style: number; text: string }> }>;
    const a1 = target.styles[rows[0].cells[0].style];
    expect(a1.border).toEqual({
      left: ['thin', '#000000'],
      right: ['thin', '#000000'],
      top: ['thin', '#000000'],
      bottom: ['thin', '#000000'],
    });
    expect(a1.font).toMatchObject({ bold: false });
    expect(String(a1.font?.name)).toContain(styleAt(model, 'A1')!.font!.name!);
    // 原来的共用样式没有被改动
    expect(target.styles[0]).toEqual(shared);
    // 空白但有边框的单元格补上了
    expect(target.styles[rows[2].cells[2].style].border).toBeTruthy();
    // 合并区域左上角带上整个区域的四条边
    const merged = target.styles[rows[8].cells[0].style].border as Record<string, unknown>;
    expect(Object.keys(merged).sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });
});
