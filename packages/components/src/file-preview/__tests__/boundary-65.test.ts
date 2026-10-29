/**
 * #64 Excel 缩放的两处大表问题：
 * 1. 2 万行 / 列之后没写尺寸的行列也随缩放（不再只补前 2 万行）；
 * 2. 打开时不记录缩放基准（不遍历行列、不复制样式 font），第一次缩放到非 100% 时才记录。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { XsSheet } from '../excel/apply';
import * as zoom from '../excel/zoom';
import { captureSheet, captureSheetBase, geometryOf, scaleSheets, sheetCounts, usedSize } from '../excel/zoom';
import { loadFixture } from './helpers';

vi.mock('../excel/zoom', async importOriginal => {
  const mod = await importOriginal<typeof import('../excel/zoom')>();
  return { ...mod, captureSheet: vi.fn(mod.captureSheet) };
});

/** 未替换的 captureSheet（替身在单个用例里改成抛错后恢复） */
const captureReal = (await vi.importActual<typeof import('../excel/zoom')>('../excel/zoom')).captureSheet;

type Rows = Record<string, { height?: number; hide?: boolean; cells?: Record<string, { text?: string }> }>;
type Cols = Record<string, { width?: number; hide?: boolean }>;
const rowsOf = (s: XsSheet) => s.rows as unknown as Rows;
const colsOf = (s: XsSheet) => s.cols as unknown as Cols;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** 稀疏的大表：只写了少数行列，len 超过 2 万 */
const sparse = (rowLen = 30000, colLen = 16384): XsSheet =>
  ({
    name: 'big',
    styles: [{ font: { size: 11 } }, {}],
    rows: { len: rowLen, 0: { height: 30, cells: { 0: { text: 'a' } } }, 25000: { cells: { 1: { text: 'x', style: 0 } } } },
    cols: { len: colLen, 0: { width: 100 }, 16000: { width: 50 } },
    merges: [],
  }) as unknown as XsSheet;

describe('#64-1 超过 2 万行 / 列', () => {
  it('没写尺寸的行列（第 2 万之后）补上默认尺寸并随缩放：50% / 200%', () => {
    const s = sparse();
    const base = captureSheet(s);
    // #66：缺尺寸的项只补到最后一项（第 25000 行）之后 FILL_TAIL（1000）个
    expect(base.rows.length).toBe(26001);
    // 列最多 16384（Excel 上限）
    expect(base.cols.length).toBe(16384);
    scaleSheets([s], [base], 2);
    expect(rowsOf(s)[25000]!.height).toBe(48);
    expect(rowsOf(s)[26000]!.height).toBe(48);
    expect(rowsOf(s)[20000]!.height).toBe(48);
    expect(colsOf(s)[16383]!.width).toBe(160);
    expect(colsOf(s)[15999]!.width).toBe(160);
    // 文字所在行的字号与行高同比例
    expect(s.styles[0]!.font!.size).toBe(30);
    scaleSheets([s], [base], 0.5);
    expect(rowsOf(s)[25000]!.height).toBe(12);
    expect(colsOf(s)[16383]!.width).toBe(40);
    expect(s.styles[0]!.font!.size).toBe(7.51);
  });

  it('写了尺寸的行列（第 2 万之后）按自己的尺寸缩放；隐藏行保持隐藏', () => {
    const s = sparse();
    rowsOf(s)[25001] = { height: 33.33 };
    rowsOf(s)[25002] = { height: 20, hide: true };
    const base = captureSheet(s);
    scaleSheets([s], [base], 2);
    expect(rowsOf(s)[0]!.height).toBe(60);
    expect(rowsOf(s)[25001]!.height).toBe(66.66);
    expect(rowsOf(s)[25002]).toEqual({ height: 40, hide: true });
    expect(colsOf(s)[0]!.width).toBe(200);
    expect(colsOf(s)[16000]!.width).toBe(100);
    // 坐标：2 万行之后的行起点也是 2 倍
    const geo = geometryOf(s);
    expect(geo.rows.start(25000)).toBeCloseTo(2 * (30 + 24 * 24999 - 0), 1);
  });

  it('来回缩放回 100% 没有漂移（多次、不同比例），数据与记录时一致', () => {
    const s = sparse(25000, 16384);
    rowsOf(s)[22222] = { height: 17.77 };
    const base = captureSheet(s);
    const original = clone(s);
    for (let i = 0; i < 50; i++) {
      for (const z of [0.1, 0.37, 1.73, 2, 3.33, 10, 0.5]) scaleSheets([s], [base], z);
    }
    scaleSheets([s], [base], 1);
    expect(clone(s)).toEqual(original);
    // 任意比例都从 100% 换算，不按上一次的值累积
    scaleSheets([s], [base], 1.73);
    expect(rowsOf(s)[22222]!.height).toBe(Math.round(17.77 * 1.73 * 100) / 100);
  });

  it('len 被 x-spreadsheet 删掉后按记下的行列数补齐；没有 len 时按它的默认 100 行 / 26 列', () => {
    const s = sparse(30000, 16384);
    const counts = sheetCounts(s);
    expect(counts).toEqual({ rows: 30000, cols: 16384 });
    delete (s.rows as { len?: number }).len;
    delete (s.cols as { len?: number }).len;
    const base = captureSheet(s, counts);
    expect(base.rows.length).toBe(26001);
    expect(base.cols.length).toBe(16384);
    const t = { name: 't', styles: [], rows: {}, cols: {} } as unknown as XsSheet;
    const tb = captureSheet(t);
    expect(tb.rows.length).toBe(100);
    expect(tb.cols.length).toBe(26);
  });

  it('序号超过 len 的项也记录；超过 Excel 上限（1048576 行 / 16384 列）的序号忽略，不分配巨大的数组', () => {
    const s = sparse(10, 5);
    rowsOf(s)[40] = { height: 10 };
    rowsOf(s)[99999999] = { height: 10 };
    colsOf(s)[20000] = { width: 10 };
    const base = captureSheet(s);
    // sparse 里有第 25000 行、第 16000 列
    expect(base.rows.length).toBe(25001);
    expect(base.cols.length).toBe(16001);
    scaleSheets([s], [base], 2);
    expect(rowsOf(s)[40]!.height).toBe(20);
    expect(rowsOf(s)[99999999]!.height).toBe(10);
    expect(colsOf(s)[20000]!.width).toBe(10);
    const t = { name: 't', styles: [], rows: { len: 5_000_000 }, cols: { len: 1e9 } } as unknown as XsSheet;
    const tb = captureSheet(t);
    expect(tb.rows.length).toBe(1000);
    expect(tb.cols.length).toBe(1000);
  });

  it('len 是异常值（负数 / NaN / 小数 / 字符串）时按默认处理', () => {
    for (const len of [-1, Number.NaN, 'abc', Infinity]) {
      const s = { name: 's', styles: [], rows: { len }, cols: { len } } as unknown as XsSheet;
      expect(sheetCounts(s)).toEqual({ rows: 0, cols: 0 });
    }
    expect(sheetCounts({ name: 's', styles: [], rows: { len: 12.7 }, cols: { len: '3' } } as unknown as XsSheet)).toEqual({
      rows: 12,
      cols: 3,
    });
  });

  it('行列项是 null / 数字时：null 补上默认尺寸，数字保持不动', () => {
    const s = {
      name: 's',
      styles: [],
      rows: { len: 3, 0: null, 1: 5 },
      cols: { len: 2, 0: null },
    } as unknown as XsSheet;
    const base = captureSheet(s);
    scaleSheets([s], [base], 2);
    expect(rowsOf(s)[0]).toEqual({ height: 48 });
    expect((s.rows as unknown as Record<string, unknown>)[1]).toBe(5);
    expect(colsOf(s)[0]).toEqual({ width: 160 });
  });

  it('空表、单格表、合并单元格', () => {
    const empty = { name: 'e', styles: [], rows: {}, cols: {}, merges: [] } as unknown as XsSheet;
    const one = {
      name: 'o',
      styles: [{ font: { size: 10 } }],
      rows: { len: 1, 0: { height: 20, cells: { 0: { text: '1', style: 0 } } } },
      cols: { len: 1, 0: { width: 64 } },
      merges: [],
    } as unknown as XsSheet;
    const merged = {
      name: 'm',
      styles: [],
      rows: { len: 3, 0: { height: 20, cells: { 0: { text: 'm', merge: [1, 1] } } }, 1: { height: 30 } },
      cols: { len: 2, 0: { width: 64 }, 1: { width: 36 } },
      merges: ['A1:B2'],
    } as unknown as XsSheet;
    const bases = captureSheetBase([empty, one, merged]);
    const before = clone([empty, one, merged]);
    scaleSheets([empty, one, merged], bases, 2);
    expect(rowsOf(empty)[99]!.height).toBe(48);
    expect(rowsOf(one)[0]!.height).toBe(40);
    expect(one.styles[0]!.font!.size).toBe(26.01);
    expect(colsOf(one)[0]!.width).toBe(128);
    // 合并区域：每一行列都按比例，合并信息不变
    expect(merged.merges).toEqual(['A1:B2']);
    expect(rowsOf(merged)[0]!.cells![0]).toEqual({ text: 'm', merge: [1, 1] });
    const g = geometryOf(merged);
    expect(g.rows.start(2) - g.rows.start(0)).toBe(100);
    expect(g.cols.start(2) - g.cols.start(0)).toBe(200);
    expect(usedSize(merged, bases[2]!)).toEqual({ w: 64, h: 20 });
    expect(usedSize(empty, bases[0]!)).toEqual({ w: 80, h: 24 });
    scaleSheets([empty, one, merged], bases, 1);
    expect(clone([empty, one, merged])).toEqual(before);
  });

  it('没有记录过的工作表跳过（数据仍是 100%）', () => {
    const a = sparse(10, 3);
    const b = sparse(10, 3);
    const snapshot = clone(b);
    scaleSheets([a, b], [captureSheet(a), null], 2);
    expect(rowsOf(a)[0]!.height).toBe(60);
    expect(clone(b)).toEqual(snapshot);
  });
});

describe('#64-2 第一次缩放时才记录基准', () => {
  beforeEach(() => {
    vi.mocked(zoom.captureSheet).mockClear();
  });
  afterEach(() => {
    vi.mocked(zoom.captureSheet).mockReset();
    vi.mocked(zoom.captureSheet).mockImplementation(captureReal);
  });

  const open = async (zoomAt?: number) => {
    const { prepareExcelFixup } = await import('../excel/index');
    const fixup = await prepareExcelFixup({ data: loadFixture('xlsx-display.xlsx'), xls: false, worker: false, zoom: zoomAt });
    const sheets = fixup.transformData([{ name: 'x', styles: [], rows: {}, cols: {} } as unknown as XsSheet]);
    return { fixup, sheets };
  };
  const fontsOf = (sheets: XsSheet[]) => sheets.map(s => (s.styles ?? []).map(st => st?.font));

  it('打开后不调用 captureSheet、不复制样式的 font、不新建行列对象', async () => {
    const { fixup, sheets } = await open();
    expect(fixup.zoomable).toBe(true);
    const fonts = fontsOf(sheets);
    const rowKeys = sheets.map(s => Object.keys(s.rows).length);
    expect(zoom.captureSheet).not.toHaveBeenCalled();
    // 设成 100%：已经是 100%，什么都不用做
    fixup.setScale(1);
    expect(zoom.captureSheet).not.toHaveBeenCalled();
    expect(fontsOf(sheets)).toEqual(fonts);
    sheets.forEach((s, i) => (s.styles ?? []).forEach((st, j) => expect(st?.font).toBe(fonts[i]![j])));
    expect(sheets.map(s => Object.keys(s.rows).length)).toEqual(rowKeys);
  });

  it('捏合中只记录当前表；结束时其余表再记录；之后不再重复记录', async () => {
    const { fixup, sheets } = await open();
    expect(sheets.length).toBeGreaterThan(1);
    fixup.setScale(1.2, 0);
    expect(zoom.captureSheet).toHaveBeenCalledTimes(1);
    fixup.setScale(1.5, 0);
    expect(zoom.captureSheet).toHaveBeenCalledTimes(1);
    fixup.setScale(1.5);
    expect(zoom.captureSheet).toHaveBeenCalledTimes(sheets.length);
    fixup.setScale(0.5);
    fixup.setScale(1);
    expect(zoom.captureSheet).toHaveBeenCalledTimes(sheets.length);
    expect(fixup.scale).toBe(1);
  });

  it('惰性记录与打开时记录结果一致：缩放到 200% 再回 100%，数据与打开时相同', async () => {
    const { fixup, sheets } = await open();
    const original = clone(sheets);
    fixup.setScale(2);
    const at200 = clone(sheets);
    fixup.setScale(1);
    expect(clone(sheets)).toEqual(original);
    // 与旧做法（打开时立即记录）对比
    const { sheets: eager } = await open();
    const bases = captureSheetBase(eager);
    scaleSheets(eager, bases, 2);
    expect(clone(eager)).toEqual(at200);
  });

  it('只切到另一个表缩放：未缩放过的表保持原样', async () => {
    const { fixup, sheets } = await open();
    const first = clone(sheets[0]);
    fixup.setScale(2, 1);
    expect(clone(sheets[0])).toEqual(first);
    fixup.setScale(1, 1);
    expect(fixup.scale).toBe(1);
  });

  it('初始比例不是 100%：交给 x-spreadsheet 之前就按比例写入', async () => {
    const { fixup, sheets } = await open(2);
    expect(zoom.captureSheet).toHaveBeenCalledTimes(sheets.length);
    expect(fixup.scale).toBe(2);
    expect(fixup.usedSize(0)!.w).toBeGreaterThan(0);
    const h = (sheets[0]!.rows as unknown as Rows)[0]!.height!;
    fixup.setScale(1);
    expect((sheets[0]!.rows as unknown as Rows)[0]!.height).toBeCloseTo(h / 2, 1);
  });

  it('适应宽度（usedSize）在没缩放过时按 100% 计算，不改变数据', async () => {
    const { fixup, sheets } = await open();
    const original = clone(sheets);
    const used = fixup.usedSize(0);
    expect(used && used.w > 0 && used.h > 0).toBe(true);
    expect(clone(sheets)).toEqual(original);
    expect(fixup.usedSize(99)).toBeNull();
  });

  it('记录失败（数据异常）：不缩放、已改写的表恢复 100%，不抛异常', async () => {
    const { fixup, sheets } = await open();
    const original = clone(sheets[0]);
    // 第二个表记录时抛错
    let n = 0;
    vi.mocked(zoom.captureSheet).mockImplementation((s, c) => {
      n += 1;
      if (n === 2) throw new Error('bad');
      return captureReal(s, c);
    });
    expect(() => fixup.setScale(2)).not.toThrow();
    expect(fixup.scale).toBe(1);
    expect(fixup.zoomable).toBe(false);
    expect(clone(sheets[0])).toEqual(original);
    fixup.setScale(3);
    expect(fixup.scale).toBe(1);
  });

  it('释放之后不再记录、不再缩放', async () => {
    const { fixup } = await open();
    fixup.dispose();
    fixup.setScale(2);
    expect(zoom.captureSheet).not.toHaveBeenCalled();
    expect(fixup.usedSize(0)).toBeNull();
  });
});
