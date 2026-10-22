/**
 * Excel 显示修正：解析 xlsx / xls 的值与格式，按 Excel 规则显示文字，并与 LibreOffice 导出的「显示文字」逐格比较。
 * 夹具由 fixtures/make-xlsx-display.py 生成（xlsxwriter / openpyxl / LibreOffice）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySheetModel, applyTint, columnWidthPx, defaultColumnPx, xsFontSize, type XsSheet } from '../excel/apply';
import { builtinFormat } from '../excel/builtin-formats';
import { modelFromExcelJs, type ExcelJsWorkbook } from '../excel/exceljs';
import { createCellFormatter, loadCellFormatter, looksLikeDate, normalizeFormatCode } from '../excel/format';
import { createSheetModel, setCell, type RawCell, type WorkbookModel } from '../excel/model';
import { parseXlsModel } from '../excel/xls';
import { parseXlsxModel } from '../excel/xlsx';
import { compareGrids, gridFromModel, type TextGrid } from './excel-audit';

const fixture = (name: string) => {
  const buf = readFileSync(resolve(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const expected = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/xlsx-display.expected.json'), 'utf8')) as TextGrid;

/** LibreOffice 与 Excel 的已知差异：常规格式的有效位数不同 */
const knownGeneral = (e: string, a: string) =>
  (e === '1.23457E+11' && a === '123456789012') ||
  (e === '123456789012' && a === '1.23457E+11') ||
  (/^0\.3{9,}$/.test(e) && /^0\.3{9,}$/.test(a));

const enFormatter = (model: WorkbookModel) => loadCellFormatter({ locale: 'en-US', date1904: model.date1904 });

describe('xlsx 解析', () => {
  it('xlsxwriter 文件：工作表状态、活动工作表、冻结、合并、隐藏行列', async () => {
    const model = (await parseXlsxModel(fixture('xlsx-display.xlsx'), { locale: 'en-US' }))!;
    expect(model.sheets.map(s => [s.name, s.state])).toEqual([
      ['formats', 'visible'],
      ['formulas', 'visible'],
      ['layout', 'visible'],
      ['hidden sheet', 'hidden'],
    ]);
    expect(model.activeTab).toBe(1);
    expect(model.fullCalcOnLoad).toBe(false);
    const layout = model.sheets[2];
    expect(layout.merges).toContainEqual({ r0: 0, c0: 0, r1: 0, c1: 5 });
    expect(layout.hiddenCols.has(2)).toBe(true);
    expect(layout.hiddenRows.has(5)).toBe(true);
    expect(layout.freeze).toEqual({ rows: 2, cols: 1 });
    expect(model.sheets.reduce((n, s) => n + s.missingFormulas, 0)).toBe(0);
    expect(model.sheets[1].formulaCells).toBeGreaterThan(5);
  });

  it.each(['xlsx-display.xlsx', 'xlsx-display-lo.xlsx'])('%s 显示文字与 LibreOffice 导出一致', async name => {
    const model = (await parseXlsxModel(fixture(name), { locale: 'en-US' }))!;
    const grid = gridFromModel(model, await enFormatter(model));
    expect(compareGrids(grid, expected, { accept: knownGeneral })).toEqual([]);
  });

  it('LibreOffice 保存的文件没有 calcId：Excel 打开会重算，提示保存的结果可能不同', async () => {
    const model = (await parseXlsxModel(fixture('xlsx-display-lo.xlsx'), { locale: 'en-US' }))!;
    expect(model.fullCalcOnLoad).toBe(true);
  });

  it('xlsxwriter 默认要求打开时重算；openpyxl 写的公式没有缓存结果', async () => {
    const recalc = (await parseXlsxModel(fixture('xlsx-recalc.xlsx')))!;
    expect(recalc.fullCalcOnLoad).toBe(true);
    const noCache = (await parseXlsxModel(fixture('xlsx-no-cache.xlsx')))!;
    expect(noCache.sheets.reduce((n, s) => n + s.missingFormulas, 0)).toBe(2);
  });

  it('主题颜色与 tint 按 Excel 的算法换算', async () => {
    const model = (await parseXlsxModel(fixture('xlsx-no-cache.xlsx')))!;
    // openpyxl 写入的是 Office 2007 主题
    expect(model.themeColors[4].toUpperCase()).toBe('#4F81BD');
    expect(applyTint('4472C4', 0.4).toUpperCase()).toBe('#8FAADC');
    expect(applyTint('4472C4', 0.8).toUpperCase()).toBe('#DAE3F3');
    expect(applyTint('4472C4', -0.25).toUpperCase()).toBe('#2F5597');
    expect(applyTint('4472C4', -0.5).toUpperCase()).toBe('#203864');
  });

  it('不是 zip 的数据返回 null', async () => {
    expect(await parseXlsxModel(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
  });
});

describe('xls（BIFF8）解析', () => {
  it('读取格式与公式缓存结果，与 LibreOffice 导出一致', async () => {
    const model = parseXlsModel(fixture('xlsx-display.xls'), { locale: 'en-US' })!;
    expect(model).not.toBeNull();
    expect(model.sheets.map(s => s.state)).toEqual(['visible', 'visible', 'visible', 'hidden']);
    expect(model.sheets[2].merges).toContainEqual({ r0: 0, c0: 0, r1: 0, c1: 5 });
    const grid = gridFromModel(model, await enFormatter(model));
    // LibreOffice 导出 xls 时把公式的文字结果「—」写成数字 0（夹具限制，不是解析问题）
    expect(compareGrids(grid, expected, { accept: knownGeneral, ignoreCells: { formulas: ['B6'] } })).toEqual([]);
  });

  it('不是 OLE 复合文档时返回 null', () => {
    expect(parseXlsModel(fixture('xlsx-display.xlsx'))).toBeNull();
  });
});

describe('数字格式', () => {
  const n = (v: number, fmt: string): RawCell => ({ t: 'n', v, fmt });
  const cases: Array<[number, string, string]> = [
    [0.45, '0%', '45%'],
    [3, '0.0', '3.0'],
    [0, '0.0', '0.0'],
    [1234567.891, '#,##0.00', '1,234,567.89'],
    [-1.005, '0.00', '-1.01'],
    [-5, '#,##0;[Red]-#,##0', '-5'],
    [-5, '0.00;(0.00)', '(5.00)'],
    [0, '0;-0;"—"', '—'],
    [1234.5, '0.00E+00', '1.23E+03'],
    [0.5, '# ?/?', ' 1/2'],
    [46287, 'yyyy-mm-dd', '2026-09-22'],
    [46287, 'yyyy"年"m"月"d"日"', '2026年9月22日'],
    [1.5, '[h]:mm', '36:00'],
    [0.5, 'h:mm AM/PM', '12:00 PM'],
    [0.5, '上午/下午h"时"mm"分"', '下午12时00分'],
    [12, '¥#,##0.00', '¥12.00'],
  ];
  it.each(cases)('%s 按 %s 显示为 %s', async (v, fmt, text) => {
    const f = await loadCellFormatter({ locale: 'zh-CN' });
    expect(f.full).toBe(true);
    expect(f.format(n(v, fmt)).text).toBe(text);
  });

  it('负数红色格式给出颜色；文字、布尔、错误、空值', async () => {
    const f = await loadCellFormatter();
    expect(f.format(n(-5, '0;[Red]-0')).color).toMatch(/^#/);
    expect(f.format({ t: 's', v: 'abc', fmt: '"[" @ "]"' }).text).toBe('[ abc ]');
    expect(f.format({ t: 'b', v: true, fmt: 'General' })).toMatchObject({ text: 'TRUE', kind: 'bool' });
    expect(f.format({ t: 'e', v: '#DIV/0!', fmt: 'General' })).toMatchObject({ text: '#DIV/0!', kind: 'error' });
    expect(f.format({ t: 'z', v: null, fmt: '0.0' })).toMatchObject({ text: '', kind: 'empty' });
  });

  it('1904 日期系统只影响日期', async () => {
    const f = await loadCellFormatter({ date1904: true });
    expect(f.format(n(44825, 'yyyy-mm-dd')).text).toBe('2026-09-22');
    expect(f.format(n(3, '0.0')).text).toBe('3.0');
  });

  it('上午/下午与系统日期格式', () => {
    expect(normalizeFormatCode('上午/下午h"时"mm"分"')).toBe('AM/PMh"时"mm"分"');
    expect(looksLikeDate(normalizeFormatCode('[$-F800]dddd, mmmm dd, yyyy', 'en-US'))).toBe(true);
    expect(looksLikeDate('0.00"d"')).toBe(false);
    expect(looksLikeDate('#,##0;[Red]-#,##0')).toBe(false);
  });

  it('没有 numfmt 时退回简化实现，日期不会显示成 GMT / Invalid Date', () => {
    const f = createCellFormatter(null);
    expect(f.full).toBe(false);
    for (const fmt of ['yyyy-mm-dd', 'yyyy"年"m"月"d"日"', 'h:mm', '[h]:mm', 'm/d/yyyy h:mm']) {
      const text = f.format(n(46287.5, fmt)).text;
      expect(text).not.toMatch(/GMT|Invalid|NaN|undefined/);
      expect(text).not.toBe('');
    }
    expect(f.format(n(0.45, '0%')).text).toBe('45%');
    expect(f.format(n(3, '0.0')).text).toBe('3.0');
  });

  it('内置格式编号随语言变化', () => {
    expect(builtinFormat(9)).toBe('0%');
    expect(builtinFormat(14, 'en-US')).toBe('m/d/yyyy');
    expect(builtinFormat(14, 'zh-CN')).toBe('yyyy/m/d');
    expect(builtinFormat(31, 'zh-CN')).toBe('yyyy"年"m"月"d"日"');
    expect(builtinFormat(49)).toBe('@');
    expect(builtinFormat(999)).toBe('General');
  });
});

describe('写入 x-spreadsheet 数据', () => {
  const makeModel = (): WorkbookModel => {
    const sheet = createSheetModel('s');
    setCell(sheet, 0, 0, { t: 's', v: 'Title', fmt: 'General' });
    setCell(sheet, 0, 1, { t: 'z', v: null, fmt: 'General', covered: true });
    setCell(sheet, 1, 0, { t: 'n', v: 0.45, fmt: '0%', f: true });
    setCell(sheet, 1, 1, { t: 'n', v: 0, fmt: '0.0', f: true, sz: 14 });
    sheet.merges.push({ r0: 0, c0: 0, r1: 0, c1: 1 });
    sheet.colWidths.set(0, 20);
    sheet.rowHeights.set(1, 30);
    sheet.hiddenRows.add(2);
    sheet.freeze = { rows: 1, cols: 1 };
    return {
      date1904: false,
      activeTab: 0,
      fullCalcOnLoad: false,
      sheets: [sheet],
      themeColors: [],
      defaultFont: { name: 'Calibri', sz: 11 },
    };
  };
  const xs = (): XsSheet => ({
    name: 's',
    styles: [{ align: 'left' }, {}],
    rows: {
      0: { cells: { 0: { text: 'Title', style: 0, merge: [0, 1] }, 1: { text: 'Title', style: 0 } } },
      1: { cells: { 0: { text: 0.45, style: 1 }, 1: { text: '', style: 1 } } },
      len: 3,
    },
    cols: { len: 2 },
  });

  it('覆盖格清空、按格式显示、数字右对齐、字号、列宽、行高、冻结', async () => {
    const target = xs();
    const formatter = await loadCellFormatter();
    applySheetModel(target, makeModel().sheets[0], makeModel(), { formatter, mdw: 7 });
    const rows = target.rows as Record<string, { cells: Record<string, { text?: unknown; style?: number }>; height?: number }>;
    expect(rows[0].cells[1].text).toBe('');
    expect(rows[1].cells[0].text).toBe('45%');
    expect(rows[1].cells[1].text).toBe('0.0');
    const style = target.styles[rows[1].cells[1].style!];
    expect(style.align).toBe('right');
    expect(style.font?.size).toBe(xsFontSize(14));
    expect((target.cols as Record<string, { width: number }>)[0].width).toBe(columnWidthPx(20, 7));
    expect(rows[1].height).toBe(40);
    expect(target.freeze).toBe('B2');
  });

  it('字号换算：表内 pt 原样，表外换成 px 并避开表内值', () => {
    expect(xsFontSize(11)).toBe(11);
    expect(xsFontSize(13)).toBeCloseTo(17.33, 2);
    expect(xsFontSize(12) === 12).toBe(true);
    // 文件里的列宽含边距：显示为 8.43 的列保存为 9.140625，即 64px
    expect(columnWidthPx(9.140625, 7)).toBe(64);
    expect(defaultColumnPx(8, 7)).toBe(64);
  });

  it('隐藏列上的换行不撑高未写行高的行，隐藏行列写入 hide', async () => {
    const sheet = createSheetModel('s');
    sheet.colWidths.set(0, 20);
    sheet.hiddenCols.add(1);
    sheet.hiddenRows.add(2);
    setCell(sheet, 0, 0, { t: 's', v: '可见', fmt: 'General' });
    setCell(sheet, 0, 1, { t: 's', v: 'IMA中约定的投资收益率用于说明隐藏列换行', fmt: 'General' });
    setCell(sheet, 2, 0, { t: 's', v: 'EWN81 + FCW43', fmt: 'General' });
    const target: XsSheet = {
      name: 's',
      styles: [{ textwrap: true }, { textwrap: true }],
      rows: {
        0: {
          cells: {
            0: { text: '可见', style: 0 },
            1: { text: 'IMA中约定的投资收益率用于说明隐藏列换行', style: 1 },
          },
        },
        len: 3,
      },
      cols: { 0: { width: 80 }, 1: { width: 80 }, len: 2 },
    };
    const formatter = await loadCellFormatter();
    applySheetModel(
      target,
      sheet,
      {
        date1904: false,
        activeTab: 0,
        fullCalcOnLoad: false,
        sheets: [sheet],
        themeColors: [],
        defaultFont: { name: 'Calibri', sz: 11 },
      },
      { formatter, mdw: 7, measure: text => text.length * 12 }
    );
    const rows = target.rows as Record<string, { height?: number; hide?: boolean; cells?: Record<string, { text?: unknown }> }>;
    const cols = target.cols as Record<string, { width?: number; hide?: boolean }>;
    expect(rows[0].height).toBe(20);
    expect(cols[1].hide).toBe(true);
    expect(cols[1].width).toBeGreaterThan(1);
    expect(rows[2].hide).toBe(true);
    expect(rows[2].height).toBe(20);
    expect(rows[2].cells?.[0]?.text).toBe('EWN81 + FCW43');
  });

  it('可见列换行仍按文字估算行高', async () => {
    const sheet = createSheetModel('s');
    sheet.colWidths.set(0, 9.140625);
    setCell(sheet, 0, 0, { t: 's', v: '一行\n二行\n三行\n四行', fmt: 'General' });
    const target: XsSheet = {
      name: 's',
      styles: [{ textwrap: true }],
      rows: { 0: { cells: { 0: { text: '一行\n二行\n三行\n四行', style: 0 } } }, len: 1 },
      cols: { 0: { width: 64 }, len: 1 },
    };
    const formatter = await loadCellFormatter();
    applySheetModel(
      target,
      sheet,
      {
        date1904: false,
        activeTab: 0,
        fullCalcOnLoad: false,
        sheets: [sheet],
        themeColors: [],
        defaultFont: { name: 'Calibri', sz: 11 },
      },
      { formatter, mdw: 7, measure: text => text.length * 8 }
    );
    const rows = target.rows as Record<string, { height?: number }>;
    expect(rows[0].height).toBeGreaterThan(40);
    expect(rows[0].height).toBeLessThan(120);
  });
});

describe('exceljs 回退', () => {
  it('Date 换回序列号、公式结果、富文本、超链接、合并覆盖格', async () => {
    const cells = [
      { value: new Date(Date.UTC(2026, 8, 22)), numFmt: 'yyyy-mm-dd', address: 'A1' },
      { value: { formula: 'A1', result: 0.45 }, numFmt: '0%', address: 'B1' },
      { value: { richText: [{ text: 'a' }, { text: 'b' }] }, address: 'C1' },
      { value: { text: 'link', hyperlink: 'https://example.com' }, address: 'D1' },
      { value: { formula: 'X', result: { error: '#N/A' } }, address: 'E1' },
      { value: 'Title', isMerged: true, master: { address: 'E1' }, address: 'F1' },
    ];
    const wb: ExcelJsWorkbook = {
      properties: { date1904: false },
      views: [{ activeTab: 0 }],
      eachSheet(cb) {
        cb(
          {
            id: 1,
            name: 's',
            state: 'visible',
            views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
            getColumn: () => ({}),
            eachRow(rcb) {
              rcb({ number: 1, eachCell: ccb => cells.forEach((c, i) => ccb(c, i + 1)) }, 1);
            },
          },
          1
        );
      },
    };
    const model = modelFromExcelJs(wb, 'en-US');
    const grid = gridFromModel(model, await loadCellFormatter({ locale: 'en-US' }));
    expect(grid.s[0]).toEqual(['2026-09-22', '45%', 'ab', 'link', '#N/A', '']);
    expect(model.sheets[0].freeze).toEqual({ rows: 1, cols: 1 });
  });
});
