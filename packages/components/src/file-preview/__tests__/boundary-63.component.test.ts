/**
 * #63 边界值：加载超时、下载进度、文本显示总量上限、CSV 显示行数上限、docx 页数提示、图片像素数上限与缩小版。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CSV_PAGE_SIZE,
  DEFAULT_CSV_MAX_ROWS,
  DEFAULT_LOAD_TIMEOUT,
  DOCX_WARN_PAGES,
  IMAGE_MAX_PIXELS,
  IMAGE_PREVIEW_PIXELS,
  PROGRESS_MIN_BYTES,
  resolveLoadTimeout,
  TEXT_CHUNK_SIZE,
  TEXT_MAX_DISPLAY_SIZE,
} from '../constant';
import { createStoredZip } from '../excel/zip';
import FilePreview from '../index.vue';
import { csvRenderer } from '../renderers/csv';
import { docxRenderer, readDocxPages } from '../renderers/docx';
import { imageRenderer } from '../renderers/image';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import { textRenderer } from '../renderers/text';
import type { RenderContext } from '../renderers/types';
import { readImageSize } from '../shared/image-size';
import { textBuffer } from './helpers';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);
const ctx = (fileType: string, extra: Partial<RenderContext> = {}): RenderContext => ({
  fileName: `a.${fileType}`,
  fileType,
  textEncoding: 'utf-8',
  signal: new AbortController().signal,
  t,
  appContext: null,
  ...extra,
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const statusOf = (w: ReturnType<typeof mount>) =>
  (w.classes().find(c => /^yss-file-preview--/.test(c)) ?? '').replace('yss-file-preview--', '');

/** 只有文件头的 PNG：指定宽高 */
const pngOf = (width: number, height: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b.buffer;
};

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unregisterPreviewRenderer('txt');
});

describe('timeout', () => {
  it('规范化：未传 60 秒；0 / 负数 / NaN / Infinity 不限制', () => {
    expect(resolveLoadTimeout(undefined)).toBe(DEFAULT_LOAD_TIMEOUT);
    expect(resolveLoadTimeout(1)).toBe(1);
    for (const v of [0, -1, NaN, Infinity, '5']) expect(resolveLoadTimeout(v)).toBe(Infinity);
  });

  const install = () =>
    registerPreviewRenderer({
      types: ['txt'],
      create: () => ({
        async render(c: HTMLElement) {
          c.textContent = 'content';
        },
      }),
    });

  it('懒加载来源不理会 signal、一直不返回：到时显示超时错误与「重试」，重试会重新加载', async () => {
    install();
    let calls = 0;
    const source = () => {
      calls += 1;
      return new Promise<ArrayBuffer>(() => undefined);
    };
    const w = mount(FilePreview, { props: { source, fileName: 'a.txt', timeout: 30 } });
    await sleep(60);
    await flushPromises();
    expect(statusOf(w)).toBe('error');
    expect(w.text()).toContain('超时');
    const retry = w.findAll('button').find(b => b.text().replace(/\s/g, '') === '重试')!;
    await retry.trigger('click');
    expect(calls).toBe(2);
    w.unmount();
  });

  it('在超时之前完成：正常显示，不会迟到报错', async () => {
    install();
    const source = async () => {
      await sleep(10);
      return textBuffer('x');
    };
    const onError = vi.fn();
    const w = mount(FilePreview, { props: { source, fileName: 'a.txt', timeout: 200, onError } });
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    await sleep(250);
    expect(statusOf(w)).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
    w.unmount();
  });

  it.each([0, -1, NaN, Infinity])('timeout = %s：不限制', async timeout => {
    install();
    const source = async () => {
      await sleep(40);
      return textBuffer('x');
    };
    const w = mount(FilePreview, { props: { source, fileName: 'a.txt', timeout } });
    await sleep(60);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    w.unmount();
  });

  it('超时之前切换文件：旧的计时器不再报错', async () => {
    install();
    const onError = vi.fn();
    const w = mount(FilePreview, {
      props: { source: () => new Promise<ArrayBuffer>(() => undefined), fileName: 'a.txt', timeout: 30, onError },
    });
    await sleep(5);
    await w.setProps({ source: textBuffer('y'), fileName: 'b.txt' });
    await sleep(60);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
    w.unmount();
  });
});

describe('下载进度', () => {
  /** 先送出 first 字节，然后等 release 再送剩下的 */
  const serve = (total: number, first: number, headers: Record<string, string>) => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (sent >= total) return c.close();
        if (sent >= first) await gate;
        const n = Math.min(1024 * 1024, total - sent, sent < first ? first - sent : total);
        sent += n;
        c.enqueue(new Uint8Array(n));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { headers }))
    );
    return () => release();
  };
  const install = () =>
    registerPreviewRenderer({
      types: ['txt'],
      create: () => ({
        async render(c: HTMLElement) {
          c.textContent = 'content';
        },
      }),
    });

  it.each([
    [PROGRESS_MIN_BYTES, false],
    [PROGRESS_MIN_BYTES + 1, true],
  ])('Content-Length = %i → 显示进度 %s', async (total, shown) => {
    install();
    const release = serve(total, 1024 * 1024, { 'content-length': String(total) });
    const w = mount(FilePreview, { props: { source: 'https://x/a.txt', fileName: 'a.txt', maxSize: 64 << 20 } });
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('loading');
    expect(w.text().includes('正在下载')).toBe(shown);
    if (shown) expect(w.text()).toMatch(/正在下载 1(\.0)? ?MB \/ 5(\.0)? ?MB/);
    release();
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    w.unmount();
  });

  it('没有 Content-Length：读到超过 5MB 后显示已下载的大小', async () => {
    install();
    const release = serve(8 << 20, 6 << 20, {});
    const w = mount(FilePreview, { props: { source: 'https://x/a.txt', fileName: 'a.txt', maxSize: 64 << 20 } });
    await sleep(30);
    await flushPromises();
    expect(w.text()).toMatch(/正在下载 6(\.0)? ?MB$/m);
    expect(w.text()).not.toContain(' / ');
    release();
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    w.unmount();
  });
});

describe('文本显示总量上限', () => {
  const run = async (size: number) => {
    const instance = textRenderer.create();
    await instance.render(container, new Uint8Array(size).fill(97).buffer, ctx('txt'));
    let clicks = 0;
    for (;;) {
      const button = container.querySelector<HTMLButtonElement>('.yss-file-preview-text__more-btn');
      if (!button) break;
      button.click();
      clicks += 1;
    }
    const shown = container.querySelector('pre')!.textContent!.length;
    const tip = container.querySelector('.yss-file-preview-text__more')?.textContent ?? '';
    instance.destroy?.();
    return { shown, tip, clicks };
  };

  it.each([
    [TEXT_MAX_DISPLAY_SIZE - 1, false],
    [TEXT_MAX_DISPLAY_SIZE, false],
    [TEXT_MAX_DISPLAY_SIZE + 1, true],
    [TEXT_MAX_DISPLAY_SIZE + TEXT_CHUNK_SIZE * 3, true],
  ])('%i 字节 → 达到上限 %s', async (size, limited) => {
    const r = await run(size);
    expect(r.shown).toBe(Math.min(size, TEXT_MAX_DISPLAY_SIZE));
    expect(r.tip.includes('textLimit')).toBe(limited);
  });
});

describe('CSV 显示行数上限', () => {
  const csv = (rows: number) => ['id,v', ...Array.from({ length: rows }, (_, i) => `${i},x`)].join('\n');
  const run = async (rows: number, csvMaxRows?: number) => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer(csv(rows)), ctx('csv', { csvMaxRows }));
    for (let i = 0; i < 1000; i++) {
      const button = container.querySelector<HTMLButtonElement>('.yss-file-preview-csv__more-btn');
      if (!button) break;
      button.click();
    }
    const r = {
      rows: container.querySelectorAll('tbody tr').length,
      limited: !!container.querySelector('.yss-file-preview-csv__limit'),
    };
    instance.destroy?.();
    container.innerHTML = '';
    return r;
  };

  it.each([
    [1499, false],
    [1500, false],
    [1501, true],
  ])('csvMaxRows = 1500，%i 行 → 达到上限 %s', async (rows, limited) => {
    expect(await run(rows, 1500)).toEqual({ rows: Math.min(rows, 1500), limited });
  });

  it('上限小于每页行数：第一页就停在上限，不显示「加载更多」', async () => {
    expect(await run(50, 10)).toEqual({ rows: 10, limited: true });
  });

  it.each([0, -1, NaN])('csvMaxRows = %s 无效：按默认 5 万', async csvMaxRows => {
    const r = await run(CSV_PAGE_SIZE + 1, csvMaxRows);
    expect(r).toEqual({ rows: CSV_PAGE_SIZE + 1, limited: false });
    expect(DEFAULT_CSV_MAX_ROWS).toBe(50_000);
  });

  it('Infinity 不限制', async () => {
    expect(await run(CSV_PAGE_SIZE * 3, Infinity)).toEqual({ rows: CSV_PAGE_SIZE * 3, limited: false });
  });
});

describe('docx 页数属性', () => {
  const docx = (pages?: number | string) =>
    createStoredZip([
      ['word/document.xml', '<w:document></w:document>'],
      ...(pages === undefined
        ? []
        : ([['docProps/app.xml', `<Properties><Pages>${pages}</Pages></Properties>`]] as Array<[string, string]>)),
    ]);

  it('读取页数；没有 / 无效的页数属性返回 null', async () => {
    expect(await readDocxPages(docx(DOCX_WARN_PAGES + 1))).toBe(DOCX_WARN_PAGES + 1);
    for (const p of [undefined, 'abc', 0, -3]) expect(await readDocxPages(docx(p))).toBeNull();
  });

  it('不是 zip：不抛错', async () => {
    expect(await readDocxPages(textBuffer('hello'))).toBeNull();
  });

  it('docx 渲染器不再预检（大文件直接预览，提示条见 boundary-64）', () => {
    expect(docxRenderer.preflight).toBeUndefined();
  });
});

describe('图片像素数', () => {
  it('读取 PNG / GIF / BMP / JPEG / WebP 文件头尺寸；不完整的头返回 null', () => {
    expect(readImageSize(pngOf(8000, 8000))).toEqual({ width: 8000, height: 8000 });
    expect(readImageSize(pngOf(0, 10))).toBeNull();
    expect(readImageSize(pngOf(10, 10).slice(0, 20))).toBeNull();
    const gif = new Uint8Array(16);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00]);
    expect(readImageSize(gif)).toEqual({ width: 16, height: 32 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x01, 0x00, 0x02, 0x00, 3, 0, 0, 0, 0]);
    expect(readImageSize(jpeg)).toEqual({ width: 512, height: 256 });
    const webp = new Uint8Array(30);
    webp.set(
      [...'RIFF'].map(c => c.charCodeAt(0)),
      0
    );
    webp.set(
      [...'WEBPVP8X'].map(c => c.charCodeAt(0)),
      8
    );
    webp.set([0xff, 0x0f, 0, 0x7f, 0x07, 0], 24);
    expect(readImageSize(webp)).toEqual({ width: 4096, height: 1920 });
    expect(readImageSize(textBuffer('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it.each([
    [10000, 10000, null],
    [10001, 10000, 'block'],
    [100000, 1, null],
  ])('%i × %i → %s（上限 1 亿像素，恰好等于可以预览）', async (w, h, level) => {
    expect(w * h > IMAGE_MAX_PIXELS).toBe(level === 'block');
    const r = await imageRenderer.preflight!(pngOf(w, h), {
      fileName: 'a.png',
      fileType: 'png',
      signal: new AbortController().signal,
      largeFileWarnSize: 10 << 20,
    });
    expect(r?.level ?? null).toBe(level);
    if (level) expect(r).toMatchObject({ reason: 'pixels', width: w, height: h });
  });

  it('组件：超过像素上限显示尺寸，只提供下载', async () => {
    const w = mount(FilePreview, { props: { source: pngOf(20000, 20000), fileName: 'a.png' } });
    for (let i = 0; i < 20 && statusOf(w) === 'loading'; i++) await sleep(10);
    await flushPromises();
    expect(statusOf(w)).toBe('oversize');
    expect(w.text()).toContain('20,000 × 20,000');
    w.unmount();
  });

  describe('缩小版', () => {
    const transferred: unknown[] = [];
    beforeEach(() => {
      transferred.length = 0;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async (_b: Blob, o: { resizeWidth: number; resizeHeight: number }) => ({
          width: o.resizeWidth,
          height: o.resizeHeight,
          close() {},
        }))
      );
      const original = HTMLCanvasElement.prototype.getContext;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
        id: string
      ) {
        if (id === 'bitmaprenderer') return { transferFromImageBitmap: (b: unknown) => transferred.push(b) } as never;
        return original.call(this, id as '2d') as never;
      });
    });
    const render = async (w: number, h: number) => {
      const instance = imageRenderer.create();
      const done = instance.render(container, pngOf(w, h), ctx('png'));
      const view = container.querySelector('.yss-file-preview-image__viewport')!;
      Object.defineProperty(view, 'clientWidth', { configurable: true, value: 1000 });
      Object.defineProperty(view, 'clientHeight', { configurable: true, value: 600 });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      await sleep(5);
      const img = container.querySelector('img')!;
      // 没有缩小版时模拟原图加载完成
      if (img?.isConnected) img.onload?.(new Event('load'));
      await done;
      return instance;
    };

    it.each([
      [8000, 5000, false],
      [8000, 5001, true],
    ])('%i × %i → 缩小版 %s（超过 4000 万像素）', async (w, h, preview) => {
      expect(w * h > IMAGE_PREVIEW_PIXELS).toBe(preview);
      const instance = await render(w, h);
      const shown = container.querySelector('.yss-file-preview-image__img')!;
      expect(shown.tagName).toBe(preview ? 'CANVAS' : 'IMG');
      if (preview) {
        expect((shown as HTMLCanvasElement).width).toBe(2048);
        expect(transferred).toHaveLength(1);
      }
      instance.destroy?.();
    });

    it('放大到细节不够时换成原图（只换一次）；适应窗口时不换', async () => {
      const imgs: HTMLImageElement[] = [];
      const create = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = create(tag);
        if (tag === 'img') imgs.push(el as HTMLImageElement);
        return el;
      }) as typeof document.createElement);
      const instance = await render(8000, 8000);
      const img = imgs[imgs.length - 1];
      expect(container.querySelector('canvas')).not.toBeNull();
      expect(img.getAttribute('src')).toBeNull();
      instance.zoom!.set(1);
      expect(img.getAttribute('src')).toBe('blob:x');
      img.onload?.(new Event('load'));
      await sleep(5);
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.querySelector('.yss-file-preview-image__img')!.tagName).toBe('IMG');
      expect((container.querySelector('img') as HTMLImageElement).style.width).toBe('8000px');
      instance.destroy?.();
    });
  });
});
