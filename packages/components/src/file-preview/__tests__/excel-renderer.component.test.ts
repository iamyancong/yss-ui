/**
 * Excel 渲染器与显示修正的接线：@vue-office/excel 用替身，按它的方式调用 beforeTransformData / transformData。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcelJsWorkbook, ExcelJsWorksheet } from '../excel/exceljs';
import type { XsSheet } from '../excel/apply';
import { excelRenderer } from '../renderers/excel';
import type { RenderContext } from '../renderers/types';
import { xlsxBuffer } from './helpers';

interface MockOptions {
  xls?: boolean;
  beforeTransformData?: (wb: ExcelJsWorkbook) => ExcelJsWorkbook;
  transformData?: (sheets: XsSheet[]) => XsSheet[];
}

const state = vi.hoisted(() => ({
  names: [] as string[],
  removed: [] as number[],
  shown: [] as string[],
  clicked: [] as string[],
  received: null as MockOptions | null,
  src: null as unknown,
  onSwitchSheet: null as ((index: number) => void) | null,
}));

const fakeWorkbook = (): ExcelJsWorkbook => {
  const sheets: ExcelJsWorksheet[] = state.names.map((name, i) => ({
    id: i + 1,
    name,
    getColumn: () => ({}),
    eachRow: cb => {
      cb({ number: 1, eachCell: ccb => ccb({ value: { formula: 'A1', result: 0.45 }, numFmt: '0%', address: 'A1' }, 1) }, 1);
    },
  }));
  return {
    get worksheets() {
      return sheets;
    },
    eachSheet: cb => sheets.forEach(ws => cb(ws, ws.id)),
    removeWorksheet: id => {
      state.removed.push(id);
      sheets.splice(
        sheets.findIndex(s => s.id === id),
        1
      );
    },
  };
};

vi.mock('@vue-office/excel', () => ({
  default: defineComponent({
    props: {
      src: null,
      options: { type: Object as PropType<MockOptions>, default: () => ({}) },
      onSwitchSheet: { type: Function, default: undefined },
    },
    emits: ['rendered'],
    setup(props, { emit }) {
      onMounted(() => {
        state.received = props.options;
        state.src = props.src;
        state.onSwitchSheet = (props.onSwitchSheet as ((index: number) => void) | undefined) ?? null;
        const wb = props.options.beforeTransformData?.(fakeWorkbook()) ?? fakeWorkbook();
        const input: XsSheet[] = (wb.worksheets ?? []).map(ws => ({
          name: ws.name,
          styles: [{}],
          rows: { 0: { cells: { 0: { text: 0.45, style: 0 } } }, len: 1 },
          cols: { len: 1 },
        }));
        const out = props.options.transformData?.(input) ?? input;
        state.shown = out.map(s => String((s.rows[0] as { cells: Record<string, { text: unknown }> }).cells[0].text));
        setTimeout(() => emit('rendered'), 0);
      });
      return () =>
        h(
          'ul',
          { class: 'x-spreadsheet-menu' },
          state.names.map(name =>
            h('li', { onClick: () => state.clicked.push(name) }, name)
          )
        );
    },
  }),
}));
vi.mock('@vue-office/excel/lib/index.css', () => ({}));

const fixture = (name: string) => {
  const buf = readFileSync(resolve(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

const context = (): RenderContext => ({
  fileName: 'book',
  fileType: 'xlsx',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  appContext: null,
  locale: 'en-US',
});

describe('excel 渲染器的显示修正', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    Object.assign(state, { names: [], removed: [], shown: [], clicked: [], received: null, src: null, onSwitchSheet: null });
  });
  afterEach(() => container.remove());

  it('传入两个回调；隐藏工作表不显示；打开文件保存时的当前工作表；按格式显示', async () => {
    state.names = ['formats', 'formulas', 'layout', 'hidden sheet'];
    const instance = excelRenderer.create();
    await instance.render(container, fixture('xlsx-display.xlsx'), context());
    expect(typeof state.received?.beforeTransformData).toBe('function');
    expect(typeof state.received?.transformData).toBe('function');
    expect(state.received?.xls).toBe(false);
    expect(state.removed).toEqual([4]);
    expect(state.clicked).toEqual(['formulas']);
    const root = container.querySelector('.yss-file-preview-excel')!;
    expect(root.querySelector('.yss-file-preview-excel__sheet')).not.toBeNull();
    expect(root.querySelector('.yss-file-preview-excel__notice')).toBeNull();
    expect((root as unknown as Record<symbol, XsSheet[]>)[Symbol.for('yss.filePreview.excelData')]).toHaveLength(3);
    instance.destroy?.();
    expect(container.innerHTML).toBe('');
  });

  it('公式没有保存结果时显示提示', async () => {
    state.names = ['formulas', 'theme'];
    const instance = excelRenderer.create();
    await instance.render(container, fixture('xlsx-no-cache.xlsx'), context());
    const notice = container.querySelector('.yss-file-preview-excel__notice');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.textContent).toBe('excelFormulaMissing:{"count":2}');
    instance.destroy?.();
  });

  it('文件要求打开时重算时显示提示', async () => {
    state.names = ['Sheet1'];
    const instance = excelRenderer.create();
    await instance.render(container, fixture('xlsx-recalc.xlsx'), context());
    expect(container.querySelector('.yss-file-preview-excel__notice')?.textContent).toBe('excelRecalcOnLoad');
    instance.destroy?.();
  });

  it('有绘图的 xlsx 交给 vue-office 的是去掉绘图的副本，并接上切换工作表', async () => {
    state.names = ['Pictures', 'Notes & links', 'Formulas'];
    const data = fixture('xlsx-objects.xlsx');
    const instance = excelRenderer.create();
    await instance.render(container, data, context());
    expect(state.src).toBeInstanceOf(ArrayBuffer);
    expect(state.src).not.toBe(data);
    expect(typeof state.onSwitchSheet).toBe('function');
    instance.destroy?.();
  });

  it('文件读取失败时改从 exceljs 的数据修正，不报错', async () => {
    state.names = ['only'];
    const instance = excelRenderer.create();
    await instance.render(container, xlsxBuffer(), context());
    expect(state.shown).toEqual(['45%']);
    expect(container.querySelector('.yss-file-preview-excel__notice')).toBeNull();
    instance.destroy?.();
  });
});
