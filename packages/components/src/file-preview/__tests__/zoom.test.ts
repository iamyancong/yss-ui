import { describe, expect, it } from 'vitest';
import { SheetGeometry } from '../excel/geometry';
import { EMU_PER_PX } from '../excel/dml';
import {
  captureSheetBase,
  geometryOf,
  pxToXsFont,
  scaleSheets,
  scrollForCell,
  topLeftCell,
  usedSize,
  xsFontPx,
} from '../excel/zoom';
import type { XsSheet } from '../excel/apply';
import {
  clampZoom,
  isZoomableType,
  resolveZoomRange,
  stepZoom,
  wheelZoomFactor,
  ZoomMemory,
  zoomShortcut,
} from '../utils/zoom';

const key = (k: string, opts: Partial<KeyboardEvent> = {}) =>
  ({ key: k, code: '', ctrlKey: true, metaKey: false, altKey: false, ...opts }) as KeyboardEvent;

describe('缩放比例', () => {
  it('范围：props 优先，其次渲染器建议，默认 50%–200%；min > max 时交换', () => {
    expect(resolveZoomRange({})).toEqual({ min: 0.5, max: 2 });
    expect(resolveZoomRange({}, { min: 0.05, max: 8 })).toEqual({ min: 0.05, max: 8 });
    expect(resolveZoomRange({ zoomMin: 0.25 }, { min: 0.05, max: 8 })).toEqual({ min: 0.25, max: 8 });
    expect(resolveZoomRange({ zoomMin: 3, zoomMax: 1 })).toEqual({ min: 1, max: 3 });
    expect(resolveZoomRange({ zoomMin: 0, zoomMax: Number.NaN })).toEqual({ min: 0.5, max: 2 });
  });

  it('收敛与步进：对齐步长，不越界，没有浮点尾数', () => {
    const r = { min: 0.5, max: 2 };
    expect(clampZoom(3, r)).toBe(2);
    expect(clampZoom(0.1, r)).toBe(0.5);
    expect(clampZoom(Number.NaN, r)).toBe(1);
    expect(stepZoom(1, 1, 0.1, r)).toBe(1.1);
    expect(stepZoom(0.83, 1, 0.1, r)).toBe(0.9);
    expect(stepZoom(0.83, -1, 0.1, r)).toBe(0.8);
    expect(stepZoom(0.7, 1, 0.1, r)).toBe(0.8);
    expect(stepZoom(2, 1, 0.1, r)).toBe(2);
    expect(stepZoom(0.5, -1, 0.1, r)).toBe(0.5);
    expect(stepZoom(1, 1, 0, r)).toBe(1.1);
    expect(stepZoom(1, 1, 0.25, r)).toBe(1.25);
  });

  it('滚轮倍数：向上放大、向下缩小，按行滚动换算，单次不超过 2 倍', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48));
    expect(wheelZoomFactor(-100000)).toBe(2);
    expect(wheelZoomFactor(100000)).toBe(0.5);
  });

  it('快捷键：Ctrl / ⌘ + = + - _ 0，按 code 兜底；没有 Ctrl / ⌘ 或带 Alt 时不处理', () => {
    expect(zoomShortcut(key('='))).toBe('in');
    expect(zoomShortcut(key('+'))).toBe('in');
    expect(zoomShortcut(key('-'))).toBe('out');
    expect(zoomShortcut(key('_'))).toBe('out');
    expect(zoomShortcut(key('0'))).toBe('reset');
    expect(zoomShortcut(key('=', { ctrlKey: false, metaKey: true }))).toBe('in');
    expect(zoomShortcut(key('Unidentified', { code: 'NumpadAdd' }))).toBe('in');
    expect(zoomShortcut(key('Unidentified', { code: 'Minus' }))).toBe('out');
    expect(zoomShortcut(key('=', { ctrlKey: false }))).toBeNull();
    expect(zoomShortcut(key('=', { altKey: true }))).toBeNull();
    expect(zoomShortcut(key('a'))).toBeNull();
  });

  it('zoomable：布尔或类型列表（不区分大小写）', () => {
    expect(isZoomableType(undefined, 'xlsx')).toBe(true);
    expect(isZoomableType(false, 'xlsx')).toBe(false);
    expect(isZoomableType(['XLSX', 'xls'], 'xlsx')).toBe(true);
    expect(isZoomableType(['xlsx'], 'png')).toBe(false);
    expect(isZoomableType(['xlsx'], null)).toBe(false);
  });

  it('按来源记住比例：字符串按值，对象按引用', () => {
    const m = new ZoomMemory();
    const file = new Blob(['a']);
    m.set('a.xlsx', 1.5);
    m.set(file, 0.75);
    expect(m.get('a.xlsx')).toBe(1.5);
    expect(m.get(file)).toBe(0.75);
    expect(m.get(new Blob(['a']))).toBeUndefined();
    m.clear();
    expect(m.get('a.xlsx')).toBeUndefined();
  });
});

const sheet = (): XsSheet => ({
  name: 'S',
  styles: [{ font: { size: 11 } }, { font: { size: 13.33, bold: true } }, { align: 'right' }],
  rows: {
    0: { height: 20, cells: { 0: { text: 'a', style: 0 }, 2: { text: 'b', style: 1 } } },
    1: { height: 30 },
    2: { height: 20, hide: true },
  },
  cols: { 0: { width: 64 }, 1: { width: 100 }, 2: { width: 64 } },
});

describe('表格缩放数据', () => {
  it('字号：pt 表内的值换算成 px，写回时避开表内的值', () => {
    expect(xsFontPx(11)).toBe(15);
    expect(xsFontPx(13.33)).toBe(13.33);
    expect(xsFontPx(undefined)).toBe(13);
    expect(pxToXsFont(15 * 2)).toBe(30);
    // 12 在字号表里（会被当作 12pt = 16px），改成 12.01
    expect(pxToXsFont(12)).toBe(12.01);
  });

  it('按 100% 的原始值换算，来回缩放不累积误差，恢复 100% 时还原原始数据', () => {
    const s = sheet();
    // captureSheetBase 会给没写尺寸的行列补上默认尺寸，之后的数据才是 100% 的原始值
    const bases = captureSheetBase([s]);
    const original = JSON.parse(JSON.stringify(s));
    scaleSheets([s], bases, 2);
    expect((s.rows[1] as { height: number }).height).toBe(60);
    expect((s.cols[1] as { width: number }).width).toBe(200);
    expect(s.styles[0].font?.size).toBe(30);
    expect(s.styles[1].font).toMatchObject({ size: 26.66, bold: true });
    // 没有字号的样式按默认 13px，26 在字号表里，写成 26.01
    expect(s.styles[2].font?.size).toBe(26.01);
    scaleSheets([s], bases, 0.5);
    scaleSheets([s], bases, 1.37);
    scaleSheets([s], bases, 1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(original);
  });

  it('已用区域按 100% 计算', () => {
    const s = sheet();
    const bases = captureSheetBase([s]);
    scaleSheets([s], bases, 2);
    expect(usedSize(s, bases[0])).toEqual({ w: 64 + 100 + 64, h: 20 });
  });

  it('滚动位置：缩放前后左上角是同一个单元格；隐藏行按 0 计算', () => {
    const s = sheet();
    const rows = s.rows as Record<string, unknown>;
    for (let r = 3; r < 50; r++) rows[r] = { height: 20 };
    const bases = captureSheetBase([s]);
    const before = geometryOf(s);
    expect(before.rows.start(3)).toBeCloseTo(50, 2);
    const cell = topLeftCell(before, 0, 215);
    scaleSheets([s], bases, 2);
    const after = geometryOf(s);
    const pos = scrollForCell(after, cell.row, cell.col);
    expect(topLeftCell(after, pos.left, pos.top)).toEqual(cell);
  });
});

describe('叠加层锚点换算', () => {
  const geo = (scale: number) =>
    new SheetGeometry({ colCount: 10, rowCount: 10, colWidth: () => 64 * scale, rowHeight: () => 20 * scale, scale });

  it('单元格内偏移、单元格锚点的宽高、绝对锚点都乘同一比例', () => {
    const marker = { row: 2, col: 1, rowOff: 10 * EMU_PER_PX, colOff: 30 * EMU_PER_PX };
    const ext = { cx: 100 * EMU_PER_PX, cy: 50 * EMU_PER_PX };
    for (const s of [0.5, 1, 2]) {
      const g = geo(s);
      expect(g.anchorRect({ kind: 'one', from: marker, ext } as never)).toEqual({
        x: (64 + 30) * s,
        y: (40 + 10) * s,
        w: 100 * s,
        h: 50 * s,
      });
      const two = g.anchorRect({ kind: 'two', from: marker, to: { row: 4, col: 3, rowOff: 0, colOff: 0 } } as never);
      expect(two.w).toBeCloseTo((192 - 94) * s);
      expect(two.h).toBeCloseTo((80 - 50) * s);
      const abs = g.anchorRect({ kind: 'abs', pos: { x: 10 * EMU_PER_PX, y: 20 * EMU_PER_PX }, ext } as never);
      expect(abs).toEqual({ x: 10 * s, y: 20 * s, w: 100 * s, h: 50 * s });
    }
  });
});
