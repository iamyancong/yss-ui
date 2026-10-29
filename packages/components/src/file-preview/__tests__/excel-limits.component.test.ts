/**
 * #62 / #64 Excel 大文件：直接预览，按实际单元格数显示提示条 / 截断提示（恰好等于 / ±1）、解析进度；
 * 自定义渲染器的提示确认 / 只能下载；x-spreadsheet window 监听的移除与数据释放。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobalLocale } from '../../locale/context';
import zhCN from '../../locale/lang/zh-CN';
import type { XsSheet } from '../excel/apply';
import { parseWorkbook } from '../excel/build';
import { resolveExcelLimits } from '../excel/limits';
import FilePreview from '../index.vue';
import { excelRenderer } from '../renderers/excel';
import { clearCustomRenderers, registerPreviewRenderer } from '../renderers/registry';
import type { PreviewPreflightResult, PreviewRenderer, RenderContext } from '../renderers/types';
import { loadFixture, textBuffer } from './helpers';

const state = vi.hoisted(() => ({ sheets: null as XsSheet[] | null }));

/** 替身：像 x-spreadsheet 一样在 onMounted 的 nextTick 里往 window 上挂 5 个监听 */
vi.mock('@vue-office/excel', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      props: { src: null, options: { type: Object, default: () => ({}) } },
      emits: ['rendered'],
      setup(props, { emit }) {
        vue.onMounted(() => {
          vue.nextTick(() => {
            for (const type of ['resize', 'click', 'paste', 'copy', 'keydown'])
              window.addEventListener(type, () => undefined);
            const input: XsSheet[] = [
              {
                name: 'Sheet1',
                styles: [{}],
                rows: { 0: { cells: { 0: { text: 1, style: 0 } } }, len: 1 },
                cols: { len: 1 },
              },
            ];
            const opts = props.options as { transformData?: (s: XsSheet[]) => XsSheet[] };
            state.sheets = opts.transformData?.(input) ?? input;
            setTimeout(() => emit('rendered'), 0);
          });
        });
        return () => vue.h('div');
      },
    }),
  };
});
vi.mock('@vue-office/excel/lib/index.css', () => ({}));

describe('大表格：直接预览，上方显示提示条', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  const context = (extra: Partial<RenderContext> = {}): RenderContext => ({
    fileName: 'book.xlsx',
    fileType: 'xlsx',
    textEncoding: 'auto',
    signal: new AbortController().signal,
    t: (key, params) => `${key}${params ? JSON.stringify(params) : ''}`,
    appContext: null,
    locale: 'en-US',
    ...extra,
  });
  const bars = () => [...container.querySelectorAll('.yss-file-preview__notice-bar')].map(b => b.textContent ?? '');
  const renderWith = async (extra: Partial<RenderContext>, data = loadFixture('xlsx-display.xlsx')) => {
    container.textContent = '';
    const instance = excelRenderer.create();
    await instance.render(container, data, context(extra));
    const result = bars();
    instance.destroy?.();
    return result;
  };

  it('默认阈值：提示 30 万格、截断 500 万格、按大小提示 10MB', () => {
    expect(resolveExcelLimits()).toEqual({ warnCells: 300000, maxCells: 5000000, warnSize: 10 * 1024 * 1024 });
    expect(resolveExcelLimits(100000)).toMatchObject({ warnCells: 100000, maxCells: 100000 });
    expect(resolveExcelLimits({ warn: 50 })).toMatchObject({ warnCells: 50, maxCells: 5000000 });
  });

  it('单元格数：恰好等于 warn 不提示，少 1 时提示（带单元格数）', async () => {
    const data = loadFixture('xlsx-display.xlsx');
    const n = (await parseWorkbook(data, { xls: false }))!.sheets.reduce(
      (k, s) => k + [...s.cells.values()].reduce((m, r) => m + r.size, 0),
      0
    );
    expect(n).toBeGreaterThan(2);
    expect((await renderWith({ excelMaxCells: { warn: n } })).some(b => b.startsWith('excelLargeNotice'))).toBe(false);
    expect((await renderWith({ excelMaxCells: { warn: n + 1 } })).some(b => b.startsWith('excelLargeNotice'))).toBe(
      false
    );
    const warned = await renderWith({ excelMaxCells: { warn: n - 1 } });
    expect(warned.find(b => b.startsWith('excelLargeNotice'))).toContain(`"cells":"${n.toLocaleString('en-US')}"`);
    // 截断：上限恰好等于时完整显示，少 1 时只显示前面的行
    expect((await renderWith({ excelMaxCells: { max: n } })).some(b => b.startsWith('excelTruncatedNotice'))).toBe(
      false
    );
    // 夹具最后一格在隐藏的工作表里：只截断隐藏的工作表时，显示的内容是完整的，不提示
    expect((await renderWith({ excelMaxCells: { max: n - 1 } })).some(b => b.startsWith('excelTruncatedNotice'))).toBe(
      false
    );
    const cut = await renderWith({ excelMaxCells: { max: n - 2 } });
    const text = cut.find(b => b.startsWith('excelTruncatedNotice'));
    expect(text).toContain(`"limit":"${(n - 2).toLocaleString('en-US')}"`);
    expect(text).toContain('"sheet":"layout"');
    // 截断时不再重复显示「文件较大」
    expect(cut.some(b => b.startsWith('excelLarge'))).toBe(false);
  });

  it('文件大小：恰好等于 largeFileWarnSize 不提示，+1 / 少 1 字节时提示；Infinity 不提示', async () => {
    const data = loadFixture('xlsx-display.xlsx');
    const size = data.byteLength;
    expect((await renderWith({ largeFileWarnSize: size })).some(b => b.startsWith('excelLargeSizeNotice'))).toBe(false);
    expect((await renderWith({ largeFileWarnSize: size + 1 })).some(b => b.startsWith('excelLarge'))).toBe(false);
    expect((await renderWith({ largeFileWarnSize: size - 1 })).some(b => b.startsWith('excelLargeSizeNotice'))).toBe(
      true
    );
    expect((await renderWith({ largeFileWarnSize: Infinity })).some(b => b.startsWith('excelLarge'))).toBe(false);
  });

  it('没有超过阈值：不显示大文件提示条；报告解析进度，最后为 1', async () => {
    const values: number[] = [];
    const result = await renderWith({ onProgress: v => values.push(v) });
    expect(result.some(b => /^excel(Large|Truncated)/.test(b))).toBe(false);
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[values.length - 1]).toBe(1);
  });
});

describe('x-spreadsheet 的 window 监听与数据释放', () => {
  let container: HTMLElement;
  let live: Set<unknown>;
  let addSpy: { mockRestore(): void };
  let removeSpy: { mockRestore(): void };
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    live = new Set();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, l: EventListener, o?: unknown) => {
      live.add(l);
      add(type, l, o as boolean);
    }) as typeof window.addEventListener);
    removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(((
      type: string,
      l: EventListener,
      o?: unknown
    ) => {
      live.delete(l);
      remove(type, l, o as boolean);
    }) as typeof window.removeEventListener);
  });
  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
    container.remove();
  });

  const context = (): RenderContext => ({
    fileName: 'book.xlsx',
    fileType: 'xlsx',
    textEncoding: 'auto',
    signal: new AbortController().signal,
    t: key => key,
    appContext: null,
    locale: 'en-US',
  });

  it('打开 / 关闭 3 次后 window 监听数回到原值，表格数据被原地清空，window.addEventListener 恢复原样', async () => {
    const before = live.size;
    const spied = window.addEventListener;
    for (let i = 0; i < 3; i++) {
      const instance = excelRenderer.create();
      await instance.render(container, loadFixture('xlsx-display.xlsx'), context());
      expect(live.size - before).toBe(5);
      const sheets = state.sheets!;
      expect(Object.keys(sheets[0].rows).length).toBeGreaterThan(0);
      instance.destroy?.();
      expect(live.size).toBe(before);
      // x-spreadsheet 直接引用的行、列、样式对象被原地清空，漏掉的引用也只剩空对象
      expect(Object.keys(sheets[0].rows)).toHaveLength(0);
      expect(sheets[0].styles).toHaveLength(0);
    }
    expect(window.addEventListener).toBe(spied);
  });

  it('dispose 之后 @vue-office/excel 迟到的回调不再修正，也不把整张表交给已卸载的表格', async () => {
    const { prepareExcelFixup } = await import('../excel/index');
    const fixup = await prepareExcelFixup({ data: loadFixture('xlsx-display.xlsx'), xls: false });
    fixup.dispose();
    const input: XsSheet[] = [{ name: 'formats', styles: [], rows: {}, cols: {} }];
    expect(fixup.transformData(input)).toEqual([]);
    expect(fixup.model).toBeNull();
  });
});

describe('自定义渲染器的 preflight：提示确认与只能下载', () => {
  afterEach(() => {
    clearCustomRenderers();
    setGlobalLocale(zhCN);
  });

  const register = (verdict: PreviewPreflightResult | null, rendered: string[]) => {
    const renderer: PreviewRenderer = {
      types: ['big'],
      preflight: async () => verdict,
      create: () => ({
        async render(container) {
          rendered.push('render');
          container.textContent = 'content';
        },
      }),
    };
    registerPreviewRenderer(renderer);
  };

  it('warn：显示提示与「下载」「继续预览」，点继续后渲染', async () => {
    setGlobalLocale(zhCN);
    const rendered: string[] = [];
    register({ level: 'warn', reason: 'cells', cells: 1500000 }, rendered);
    const wrapper = mount(FilePreview, { props: { source: textBuffer('x'), fileName: 'a.big' } });
    await flushPromises();
    expect(wrapper.classes()).toContain('yss-file-preview--large-file');
    expect(wrapper.text()).toContain('文件较大，预览可能卡顿');
    expect(wrapper.text()).toContain('1,500,000');
    const buttons = wrapper.findAll('.yss-file-preview__state button');
    expect(buttons.map(b => b.text().replace(/\s/g, ''))).toEqual(['下载', '继续预览']);
    expect(rendered).toEqual([]);
    await buttons[1].trigger('click');
    await flushPromises();
    expect(rendered).toEqual(['render']);
    expect(wrapper.classes()).toContain('yss-file-preview--ready');
    wrapper.unmount();
  });

  it('block：按 oversize 显示单元格数与上限，只提供下载', async () => {
    setGlobalLocale(zhCN);
    const rendered: string[] = [];
    register({ level: 'block', reason: 'cells', cells: 3000000 }, rendered);
    const wrapper = mount(FilePreview, { props: { source: textBuffer('x'), fileName: 'a.big' } });
    await flushPromises();
    expect(wrapper.classes()).toContain('yss-file-preview--oversize');
    expect(wrapper.text()).toContain('3,000,000');
    expect(wrapper.text()).toContain('5,000,000');
    expect(wrapper.findAll('.yss-file-preview__state button')).toHaveLength(1);
    expect(rendered).toEqual([]);
    wrapper.unmount();
  });

  it('excelMaxCells 写成字面量对象时，父组件重新渲染不会重新加载', async () => {
    let calls = 0;
    registerPreviewRenderer({
      types: ['big'],
      preflight: async () => {
        calls++;
        return null;
      },
      create: () => ({ render: async () => undefined }),
    });
    const source = textBuffer('x');
    const Parent = defineComponent({
      data: () => ({ n: 0 }),
      render() {
        return h('div', [
          h('span', this.n),
          h(FilePreview, { source, fileName: 'a.big', excelMaxCells: { warn: 10, max: 20 } }),
        ]);
      },
    });
    const wrapper = mount(Parent);
    await flushPromises();
    (wrapper.vm as unknown as { n: number }).n++;
    await nextTick();
    await flushPromises();
    expect(calls).toBe(1);
    wrapper.unmount();
  });
});
