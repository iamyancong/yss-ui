import { defineComponent, h, onMounted } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docxRenderer } from '../renderers/docx';
import { excelRenderer } from '../renderers/excel';
import { pdfRenderer } from '../renderers/pdf';
import { textRenderer } from '../renderers/text';
import type { RenderContext } from '../renderers/types';
import { docxBuffer, pdfBuffer, textBuffer, trackObjectUrls, xlsxBuffer } from './helpers';

const renderAsync = vi.fn(
  async (_data: ArrayBuffer, body: HTMLElement, _styleContainer?: HTMLElement, _options?: Record<string, unknown>) => {
    body.innerHTML = '<section class="docx-page">DOCX BODY</section>';
  }
);
vi.mock('docx-preview', () => ({ renderAsync }));

const excelBehavior = { mode: 'rendered' as 'rendered' | 'error' };
const excelUnmounted = vi.fn();
vi.mock('@vue-office/excel', () => ({
  default: defineComponent({
    name: 'MockVueOfficeExcel',
    props: { src: null, options: null },
    emits: ['rendered', 'error'],
    setup(props, { emit }) {
      onMounted(() => {
        setTimeout(() => {
          if (excelBehavior.mode === 'rendered') emit('rendered');
          else emit('error', new Error('broken workbook'));
        }, 0);
      });
      return () => h('div', { class: 'mock-excel', 'data-xls': String(props.options?.xls) }, 'EXCEL');
    },
    unmounted: () => excelUnmounted(),
  }),
}));
vi.mock('@vue-office/excel/lib/index.css', () => ({}));

const createContext = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  fileName: 'sample',
  fileType: 'txt',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  appContext: null,
  ...overrides,
});

describe('file-preview 内置渲染器', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    renderAsync.mockClear();
    excelUnmounted.mockClear();
  });
  afterEach(() => container.remove());

  it('docx：样式容器与内容容器都是实例自己的 wrapper，destroy 后移除', async () => {
    const instance = docxRenderer.create();
    await instance.render(container, docxBuffer(), createContext({ fileType: 'docx' }));
    expect(container.textContent).toContain('DOCX BODY');
    const [, body, styleContainer, options] = renderAsync.mock.calls[0]!;
    expect(body).toBe(styleContainer);
    expect(options).toMatchObject({ className: 'yss-file-preview-docx-doc', useBase64URL: true });
    instance.destroy?.();
    expect(container.innerHTML).toBe('');
  });

  it('docx：渲染前已中止时不写入 DOM', async () => {
    const controller = new AbortController();
    controller.abort();
    const instance = docxRenderer.create();
    await instance.render(container, docxBuffer(), createContext({ signal: controller.signal }));
    expect(renderAsync).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('excel：等待 rendered 事件，destroy 时卸载组件', async () => {
    excelBehavior.mode = 'rendered';
    const instance = excelRenderer.create();
    await instance.render(container, xlsxBuffer(), createContext({ fileType: 'xlsx' }));
    expect(container.querySelector('.mock-excel')?.getAttribute('data-xls')).toBe('false');
    instance.destroy?.();
    expect(excelUnmounted).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('excel：resize 派发 window resize 让 x-spreadsheet 重新测量，destroy 后不再派发', async () => {
    excelBehavior.mode = 'rendered';
    const instance = excelRenderer.create();
    await instance.render(container, xlsxBuffer(), createContext({ fileType: 'xlsx' }));
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);
    try {
      instance.resize?.();
      expect(onResize).toHaveBeenCalledTimes(1);
      instance.destroy?.();
      instance.resize?.();
      expect(onResize).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('resize', onResize);
    }
  });

  it('excel：老版 xls 打开 xls 解析选项', async () => {
    excelBehavior.mode = 'rendered';
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer;
    const instance = excelRenderer.create();
    await instance.render(container, ole, createContext({ fileType: 'xls' }));
    expect(container.querySelector('.mock-excel')?.getAttribute('data-xls')).toBe('true');
    instance.destroy?.();
  });

  it('excel：组件报错时 render 抛出错误', async () => {
    excelBehavior.mode = 'error';
    const instance = excelRenderer.create();
    await expect(instance.render(container, xlsxBuffer(), createContext({ fileType: 'xlsx' }))).rejects.toThrow(
      'broken workbook'
    );
    instance.destroy?.();
  });

  it('pdf：多个实例互不影响，destroy 只释放自己的 Blob URL', async () => {
    const urls = trackObjectUrls();
    try {
      const a = pdfRenderer.create();
      const b = pdfRenderer.create();
      const boxA = document.createElement('div');
      const boxB = document.createElement('div');
      await a.render(boxA, pdfBuffer(), createContext({ fileName: 'a.pdf' }));
      await b.render(boxB, pdfBuffer(), createContext({ fileName: 'b.pdf' }));
      expect(urls.live.size).toBe(2);
      expect(boxA.querySelector('iframe')?.title).toBe('a.pdf');
      b.destroy?.();
      expect(boxA.querySelector('iframe')).not.toBeNull();
      expect(boxB.querySelector('iframe')).toBeNull();
      expect(urls.live.size).toBe(1);
      a.destroy?.();
      expect(urls.live.size).toBe(0);
    } finally {
      urls.restore();
    }
  });

  it('pdf：showDownload=false 时追加参数隐藏内置查看器工具栏', async () => {
    const urls = trackObjectUrls();
    try {
      const box = document.createElement('div');
      const shown = pdfRenderer.create();
      await shown.render(box, pdfBuffer(), createContext());
      expect(box.querySelector('iframe')!.getAttribute('src')).not.toContain('#');
      shown.destroy?.();
      const hidden = pdfRenderer.create();
      await hidden.render(box, pdfBuffer(), createContext({ showDownload: false }));
      expect(box.querySelector('iframe')!.getAttribute('src')).toMatch(/^blob:.*#toolbar=0&navpanes=0$/);
      hidden.destroy?.();
    } finally {
      urls.restore();
    }
  });

  it('text：小文件一次显示完整内容', async () => {
    const instance = textRenderer.create();
    await instance.render(container, textBuffer('a,b\n1,2'), createContext());
    expect(container.querySelector('pre')?.textContent).toBe('a,b\n1,2');
    expect(container.querySelector('.yss-file-preview-text__more')).toBeNull();
    instance.destroy?.();
    expect(container.innerHTML).toBe('');
  });

  it('text：超过 2MB 分段显示，加载更多后内容完整且不乱码', async () => {
    const line = '中文分片边界测试'.repeat(64) + '\n';
    const text = line.repeat(1500); // 约 2.2MB
    const instance = textRenderer.create();
    await instance.render(container, textBuffer(text), createContext());
    const pre = container.querySelector('pre')!;
    expect(pre.textContent!.length).toBeLessThan(text.length);
    expect(pre.textContent).not.toContain('\uFFFD');
    const button = container.querySelector<HTMLButtonElement>('.yss-file-preview-text__more-btn')!;
    expect(button.textContent).toBe('loadMore');
    while (container.querySelector('.yss-file-preview-text__more-btn')) button.click();
    expect(pre.textContent).toBe(text);
    instance.destroy?.();
  });
});
