/**
 * #66：
 * 1. 缩放前后用户拖动过的行高 / 列宽：视为当时比例下的尺寸，换算回 100% 基准，之后缩放保留拖动结果；
 *    稀疏数据只补到最后一项之后 FILL_TAIL 个，新建对象最多 MAX_FILL 个。
 * 2. 回退到 @vue-office/excel 流程时按单元格上限截断（truncateXsInput），与 CellBudget 规则一致。
 */
import { describe, expect, it, vi } from 'vitest';
import type { XsSheet } from '../excel/apply';
import { truncateXsInput } from '../excel/index';
import type { SheetModel, WorkbookModel } from '../excel/model';
import { captureSheet, FILL_TAIL, MAX_FILL, scaleSheet, scaleSheets } from '../excel/zoom';
import { loadFixture } from './helpers';

type Rows = Record<string, { height?: number; hide?: boolean; cells?: Record<string, { text?: string }> } | number>;
type Cols = Record<string, { width?: number }>;
const row = (s: XsSheet, i: number) => (s.rows as unknown as Rows)[i] as { height?: number; cells?: object };
const col = (s: XsSheet, i: number) => (s.cols as unknown as Cols)[i]!;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const sheet = (rows = 10, cols = 4): XsSheet => {
  const r: Record<string, unknown> = { len: rows };
  for (let i = 0; i < rows; i++) r[i] = { height: 20, cells: { 0: { text: String(i) } } };
  const c: Record<string, unknown> = { len: cols };
  for (let i = 0; i < cols; i++) c[i] = { width: 64 };
  return { name: 's', styles: [{ font: { size: 10 } }], rows: r, cols: c, merges: [] } as unknown as XsSheet;
};

describe('#66-1 用户拖动过的行高 / 列宽', () => {
  it('第一次缩放前（100%）拖动：拖动后的值就是 100% 基准', () => {
    const s = sheet();
    row(s, 3).height = 55;
    col(s, 1).width = 120;
    const base = captureSheet(s);
    scaleSheet(s, base, 2);
    expect(row(s, 3).height).toBe(110);
    expect(col(s, 1).width).toBe(240);
    scaleSheet(s, base, 1);
    expect(row(s, 3).height).toBe(55);
    expect(col(s, 1).width).toBe(120);
  });

  it('记录基准之后、仍在 100% 时拖动：同样按 100% 的值', () => {
    const s = sheet();
    const base = captureSheet(s);
    scaleSheet(s, base, 2);
    scaleSheet(s, base, 1);
    row(s, 2).height = 33;
    scaleSheet(s, base, 1.5);
    expect(row(s, 2).height).toBe(49.5);
    expect(row(s, 1).height).toBe(30);
  });

  it('200% 时拖动：换算回 100%（拖到 100 → 100% 时 50、50% 时 25），列同理', () => {
    const s = sheet();
    const base = captureSheet(s);
    scaleSheet(s, base, 2);
    row(s, 4).height = 100;
    col(s, 2).width = 300;
    scaleSheet(s, base, 1);
    expect(row(s, 4).height).toBe(50);
    expect(col(s, 2).width).toBe(150);
    scaleSheet(s, base, 0.5);
    expect(row(s, 4).height).toBe(25);
    expect(col(s, 2).width).toBe(75);
    // 没拖动的不受影响
    expect(row(s, 5).height).toBe(10);
    expect(col(s, 3).width).toBe(32);
  });

  it('捏合中（每帧只改当前表）拖动：下一帧起保留；其他表不受影响', () => {
    const a = sheet();
    const b = sheet();
    const bases = [captureSheet(a), captureSheet(b)];
    scaleSheets([a, b], bases, 1.3, 0);
    row(a, 0).height = 80;
    for (const z of [1.31, 1.5, 1.77, 2]) scaleSheets([a, b], bases, z, 0);
    expect(row(a, 0).height).toBe(Math.round((80 / 1.3) * 2 * 100) / 100);
    expect(row(b, 0).height).toBe(20);
    scaleSheets([a, b], bases, 2);
    expect(row(b, 0).height).toBe(40);
  });

  it('拖成和当前比例下相同的值：等同没拖；往返缩放无漂移', () => {
    const s = sheet();
    const base = captureSheet(s);
    const original = clone(s);
    scaleSheet(s, base, 1.37);
    row(s, 1).height = Math.round(20 * 1.37 * 100) / 100;
    for (let i = 0; i < 30; i++) for (const z of [0.1, 0.33, 1.37, 2.5, 10]) scaleSheet(s, base, z);
    scaleSheet(s, base, 1);
    expect(clone(s)).toEqual(original);
  });

  it('拖动后的值异常（0、负数、NaN、字符串）不进基准，按原尺寸写回', () => {
    for (const bad of [0, -5, Number.NaN, '30' as unknown as number]) {
      const s = sheet();
      const base = captureSheet(s);
      scaleSheet(s, base, 2);
      row(s, 1).height = bad;
      col(s, 1).width = bad;
      scaleSheet(s, base, 1);
      expect(row(s, 1).height).toBe(20);
      expect(col(s, 1).width).toBe(64);
    }
  });

  it('极端比例下拖动（10%、1000%）换算一致', () => {
    const s = sheet();
    const base = captureSheet(s);
    scaleSheet(s, base, 0.1);
    row(s, 1).height = 5;
    scaleSheet(s, base, 10);
    expect(row(s, 1).height).toBe(500);
    scaleSheet(s, base, 1);
    expect(row(s, 1).height).toBe(50);
  });

  it('拖动时整行对象被替换 / 删除：替换的按新值、删除的跳过，不抛异常', () => {
    const s = sheet();
    const base = captureSheet(s);
    scaleSheet(s, base, 2);
    (s.rows as unknown as Rows)[1] = { height: 60 };
    delete (s.rows as unknown as Rows)[2];
    expect(() => scaleSheet(s, base, 1)).not.toThrow();
    expect(row(s, 1).height).toBe(30);
    expect(row(s, 2)).toBeUndefined();
  });

  it('被裁短（亚格滚动）的行在写入前必须恢复：否则裁短的值会被当成拖动（渲染器 finish 先 restoreTrim）', () => {
    const s = sheet();
    const base = captureSheet(s);
    scaleSheet(s, base, 2);
    // 恢复后再缩放：基准不变
    const trimmed = row(s, 0).height!;
    row(s, 0).height = trimmed - 13.5;
    row(s, 0).height = trimmed;
    scaleSheet(s, base, 1);
    expect(row(s, 0).height).toBe(20);
  });
});

describe('#66-1 稀疏数据补齐的范围', () => {
  const sparse = (len: number, keys: number[]): XsSheet =>
    ({
      name: 'sp',
      styles: [],
      rows: Object.fromEntries([['len', len], ...keys.map(k => [String(k), { height: 30 }])]),
      cols: { len: 2 },
    }) as unknown as XsSheet;
  const own = (s: XsSheet) => Object.keys(s.rows).filter(k => /^\d+$/.test(k)).length;

  it('len = 1048576、只有第 0 行：只补到 1 + FILL_TAIL 行，不是 100 万行', () => {
    const s = sparse(1048576, [0]);
    const base = captureSheet(s);
    expect(base.rows.length).toBe(1 + FILL_TAIL);
    expect(own(s)).toBe(1 + FILL_TAIL);
  });

  it('尾部补齐边界：len = 最后一项 + FILL_TAIL ± 1', () => {
    const last = 50;
    for (const [len, expected] of [
      [last + FILL_TAIL, last + FILL_TAIL],
      [last + 1 + FILL_TAIL, last + 1 + FILL_TAIL],
      [last + 2 + FILL_TAIL, last + 1 + FILL_TAIL],
    ] as const) {
      const base = captureSheet(sparse(len, [last]));
      expect(base.rows.length).toBe(expected);
    }
  });

  it('空表（没有 len 也没有行）：补到默认 100 行；len = 0 / 1', () => {
    expect(captureSheet(sparse(0, [])).rows.length).toBe(100);
    expect(captureSheet(sparse(1, [])).rows.length).toBe(1);
  });

  it('中间的空洞：新建对象最多 MAX_FILL 个（恰好 / +1），之后的空洞不补、不随缩放，已有的行照常缩放', () => {
    // 空洞恰好 MAX_FILL 个：全部补上
    const a = sparse(MAX_FILL + 2, [0, MAX_FILL + 1]);
    const ba = captureSheet(a);
    expect(own(a)).toBe(MAX_FILL + 2);
    expect(ba.rows.length).toBe(MAX_FILL + 2);
    // 空洞 MAX_FILL + 1 个：最后一个不补
    const b = sparse(MAX_FILL + 3, [0, MAX_FILL + 2]);
    const bb = captureSheet(b);
    expect(own(b)).toBe(MAX_FILL + 2);
    expect(Number.isNaN(bb.rows[MAX_FILL + 1]!)).toBe(true);
    scaleSheet(b, bb, 2);
    expect(row(b, MAX_FILL + 2).height).toBe(60);
    expect(row(b, MAX_FILL + 1)).toBeUndefined();
    expect(row(b, 5).height).toBe(48);
  });

  it('第 1048575 行（最后一行）有数据：记录这一项，新建不超过 MAX_FILL', () => {
    const s = sparse(1048576, [1048575]);
    const base = captureSheet(s);
    expect(base.rows.length).toBe(1048576);
    expect(own(s)).toBe(MAX_FILL + 1);
    scaleSheet(s, base, 2);
    expect(row(s, 1048575).height).toBe(60);
  });

  it('行高为 0 的行按默认尺寸记录（x-spreadsheet 也把 0 当作默认）', () => {
    const s = { name: 'z', styles: [], rows: { len: 2, 0: { height: 0 } }, cols: {} } as unknown as XsSheet;
    const base = captureSheet(s);
    expect(base.rows[0]).toBe(24);
  });
});

const ms = (name: string, extra: Partial<SheetModel> = {}): SheetModel =>
  ({
    name,
    state: 'visible',
    cells: new Map(),
    rowHeights: new Map(),
    hiddenRows: new Set(),
    colWidths: new Map(),
    hiddenCols: new Set(),
    merges: [],
    ...extra,
  }) as unknown as SheetModel;
const wb = (...sheets: SheetModel[]) => ({ sheets }) as unknown as WorkbookModel;
/** n 行、每行 c 个单元格的 x-spreadsheet 数据 */
const xs = (name: string, n: number, c: number): XsSheet => {
  const rows: Record<string, unknown> = { len: n };
  for (let r = 0; r < n; r++) rows[r] = { cells: Object.fromEntries(Array.from({ length: c }, (_, i) => [i, { text: 'v' }])) };
  return { name, styles: [], rows, cols: {} } as unknown as XsSheet;
};
const rowCount = (s: XsSheet) => Object.keys(s.rows).filter(k => /^\d+$/.test(k)).length;

describe('#66-2 回退流程按单元格上限截断', () => {
  it('恰好等于上限不截断；少 1 截在整行；多 1 不截断', () => {
    for (const [max, cut] of [
      [30, undefined],
      [29, 9],
      [31, undefined],
    ] as const) {
      const input = [xs('a', 10, 3)];
      const model = wb(ms('a'));
      truncateXsInput(input, model, max);
      expect(model.sheets[0]!.truncatedRows).toBe(cut);
      expect(rowCount(input[0]!)).toBe(cut ?? 10);
      if (cut !== undefined) expect((input[0]!.rows as { len?: number }).len).toBe(cut);
    }
  });

  it('上限为 1、第一行就放不下：一行都不显示（len 保持 1）', () => {
    const input = [xs('a', 3, 2)];
    const model = wb(ms('a'));
    truncateXsInput(input, model, 1);
    expect(model.sheets[0]!.truncatedRows).toBe(0);
    expect(rowCount(input[0]!)).toBe(0);
    expect((input[0]!.rows as { len?: number }).len).toBe(1);
  });

  it('多个工作表共用上限；前一个表截断后，后面的表能放下的行照常显示（与 CellBudget 一致）', () => {
    const input = [xs('a', 10, 3), xs('b', 5, 1)];
    const model = wb(ms('a'), ms('b'));
    truncateXsInput(input, model, 28);
    expect(model.sheets[0]!.truncatedRows).toBe(9);
    // a 用了 27 个，剩 1 个：b 的第 0 行放得下，第 1 行放不下
    expect(model.sheets[1]!.truncatedRows).toBe(1);
  });

  it('模型里已经截断的表按模型的行截断（取较小值），并去掉截断行之后的行高、合并区域', () => {
    const input = [xs('a', 10, 1)];
    const sheetModel = ms('a', {
      truncatedRows: 4,
      rowHeights: new Map([
        [2, 30],
        [6, 30],
      ]),
      merges: [{ r0: 3, c0: 0, r1: 7, c1: 1 }],
    } as Partial<SheetModel>);
    const model = wb(sheetModel);
    truncateXsInput(input, model, 1000);
    expect(sheetModel.truncatedRows).toBe(4);
    expect(rowCount(input[0]!)).toBe(4);
    expect([...sheetModel.rowHeights.keys()]).toEqual([2]);
    expect(sheetModel.merges).toEqual([{ r0: 3, c0: 0, r1: 3, c1: 1 }]);
  });

  it('上限为 Infinity / 0 / 负数 / NaN：不截断', () => {
    for (const max of [Infinity, 0, -1, Number.NaN]) {
      const input = [xs('a', 10, 3)];
      const model = wb(ms('a'));
      truncateXsInput(input, model, max);
      expect(rowCount(input[0]!)).toBe(10);
      expect(model.sheets[0]!.truncatedRows).toBeUndefined();
    }
  });

  it('异常输入：没有 rows、rows 是数字、行是数字 / 没有 cells、名字对不上模型、序号乱序、非数字键', () => {
    const odd = {
      name: 'x',
      styles: [],
      rows: { len: 5, 3: { cells: { 0: {}, 1: {} } }, 1: 7, 0: { cells: { 0: {} } }, 2: {}, foo: { cells: { 0: {} } } },
    } as unknown as XsSheet;
    const input = [{ name: 'n' } as unknown as XsSheet, { name: 'm', rows: 5 } as unknown as XsSheet, odd];
    const model = wb(ms('other'));
    expect(() => truncateXsInput(input, model, 2)).not.toThrow();
    // 第 0 行 1 个、第 3 行 2 个：放到第 3 行时超过 → 截在第 3 行
    expect(Object.keys(odd.rows)).toEqual(expect.arrayContaining(['0', '1', '2', 'foo']));
    expect((odd.rows as Record<string, unknown>)[3]).toBeUndefined();
    expect(model.sheets[0]!.truncatedRows).toBeUndefined();
  });

  it('空工作簿 / 空表：不变', () => {
    expect(() => truncateXsInput([], wb(), 10)).not.toThrow();
    const input = [{ name: 'e', styles: [], rows: {}, cols: {} } as unknown as XsSheet];
    const model = wb(ms('e'));
    truncateXsInput(input, model, 10);
    expect(model.sheets[0]!.truncatedRows).toBeUndefined();
  });
});

describe('#66-2 回退流程端到端（直接生成不可用时）', () => {
  it('maxCells 生效：模型截断、transformData 后的数据只到截断行', async () => {
    vi.resetModules();
    vi.doMock('../excel/build-runner', async importOriginal => {
      const mod = await importOriginal<typeof import('../excel/build-runner')>();
      // 直接生成失败（如 BIFF5）：runBuild 什么都不送出，结果为 null
      return { ...mod, runBuild: async () => undefined };
    });
    const { prepareExcelFixup } = await import('../excel/index');
    const fixup = await prepareExcelFixup({ data: loadFixture('xlsx-display.xlsx'), xls: false, worker: false, maxCells: 3 });
    expect(fixup.direct).toBe(false);
    const model = fixup.model!;
    const first = model.sheets.find(s => s.state === 'visible')!;
    // 模型按 CellBudget 截断
    expect(model.sheets.some(s => s.truncatedRows !== undefined)).toBe(true);
    const input = [xs(first.name, 50, 2)];
    const out = fixup.transformData(input);
    const cut = first.truncatedRows!;
    expect(cut).toBeLessThanOrEqual(3);
    const rows = out[0]!.rows as unknown as Record<string, { cells?: Record<string, unknown> } | number>;
    const withCells = Object.keys(rows).filter(k => {
      const r = rows[k];
      return /^\d+$/.test(k) && typeof r === 'object' && !!r.cells && Object.keys(r.cells).length > 0;
    });
    expect(withCells.every(k => Number(k) < cut)).toBe(true);
    vi.doUnmock('../excel/build-runner');
  });

  it('没有 maxCells（不限制）：回退流程不截断', async () => {
    vi.resetModules();
    vi.doMock('../excel/build-runner', async importOriginal => {
      const mod = await importOriginal<typeof import('../excel/build-runner')>();
      return { ...mod, runBuild: async () => undefined };
    });
    const { prepareExcelFixup } = await import('../excel/index');
    const fixup = await prepareExcelFixup({ data: loadFixture('xlsx-display.xlsx'), xls: false, worker: false });
    expect(fixup.model!.sheets.every(s => s.truncatedRows === undefined)).toBe(true);
    vi.doUnmock('../excel/build-runner');
  });
});
