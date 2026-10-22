/**
 * 图表 / 迷你图单元格引用：拒绝外部工作簿、隐藏行、引用上限。
 */
import { describe, expect, it } from 'vitest';
import { createSheetModel, setCell, type WorkbookModel } from '../excel/model';
import { createRefResolver, parseRefs } from '../excel/refs';

const model = (): WorkbookModel => {
  const sheet = createSheetModel('Sheet1');
  setCell(sheet, 0, 0, { t: 'n', v: 1, fmt: 'General' });
  setCell(sheet, 1, 0, { t: 'n', v: 2, fmt: 'General' });
  setCell(sheet, 2, 0, { t: 's', v: 'A', fmt: 'General' });
  sheet.hiddenRows.add(1);
  const other = createSheetModel('工作表 1');
  setCell(other, 0, 0, { t: 'n', v: 9, fmt: 'General' });
  return {
    date1904: false,
    activeTab: 0,
    fullCalcOnLoad: false,
    sheets: [sheet, other],
    themeColors: [],
    defaultFont: { sz: 11 },
  };
};

describe('parseRefs', () => {
  it('读取带表名、引号、多区域的引用', () => {
    expect(parseRefs("Sheet1!$A$1:$A$3")).toEqual([{ sheet: 'Sheet1', r0: 0, c0: 0, r1: 2, c1: 0 }]);
    expect(parseRefs("'工作表 1'!B2")).toEqual([{ sheet: '工作表 1', r0: 1, c0: 1, r1: 1, c1: 1 }]);
    expect(parseRefs('(A1,C3:D4)')).toHaveLength(2);
  });

  it('外部工作簿引用返回 null', () => {
    expect(parseRefs('[1]Sheet1!A1')).toBeNull();
    expect(parseRefs("'[Book.xlsx]Sheet1'!A1")).toBeNull();
  });
});

describe('createRefResolver', () => {
  it('隐藏行不读取；带引号的表名能找到', () => {
    const resolve = createRefResolver(model(), null, () => 'Sheet1');
    const grid = resolve('Sheet1!$A$1:$A$3');
    expect(grid?.map(row => row[0]?.num ?? row[0]?.text)).toEqual([1, 'A']);
    expect(resolve("'工作表 1'!A1")?.[0][0].num).toBe(9);
  });

  it('超过单元格上限时放弃', () => {
    const resolve = createRefResolver(model(), null, () => 'Sheet1');
    expect(resolve('A1:XFD3')).toBeUndefined();
  });
});
