/**
 * #63 边界值补充：超时恰好到达、URL 超时、进度阈值（无 Content-Length）、csvMaxRows 非法值、
 * 图片像素阈值 ±1、缩小版失败 / 中止、懒加载缓存只保留相邻文件、快速切换无未处理的 rejection。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  DEFAULT_CSV_MAX_ROWS,
  IMAGE_MAX_PIXELS,
  IMAGE_PREVIEW_PIXELS,
  PROGRESS_MIN_BYTES,
  resolveCsvMaxRows,
} from '../constant';
import { FileLoadError } from '../errors';
import FilePreview from '../index.vue';
import FilePreviewModal from '../FilePreviewModal.vue';
import { imageRenderer } from '../renderers/image';
import { createPreview } from '../renderers/image/large';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import type { RenderContext } from '../renderers/types';
import { readImageSize } from '../shared/image-size';
import { textBuffer } from './helpers';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const statusOf = (w: ReturnType<typeof mount>) =>
  (w.classes().find(c => /^yss-file-preview--/.test(c)) ?? '').replace('yss-file-preview--', '');
const pngOf = (width: number, height: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b.buffer;
};
const preflight = (data: ArrayBuffer) =>
  imageRenderer.preflight!(data, {
    fileName: 'a.png',
    fileType: 'png',
    signal: new AbortController().signal,
    largeFileWarnSize: 10 << 20,
  });
const installTxt = () =>
  registerPreviewRenderer({
    types: ['txt'],
    create: () => ({
      async render(c: HTMLElement, data: ArrayBuffer) {
        c.textContent = new TextDecoder().decode(data);
      },
    }),
  });

const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);
beforeEach(() => {
  rejections.length = 0;
  process.on('unhandledRejection', onRejection);
});
afterEach(() => {
  process.off('unhandledRejection', onRejection);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unregisterPreviewRenderer('txt');
  document.body.innerHTML = '';
});

describe('timeout 恰好到达', () => {
  it('timeout - 1 毫秒仍在加载，恰好到达时超时（FileLoadError，cause 为 TimeoutError）', async () => {
    vi.useFakeTimers();
    installTxt();
    const onError = vi.fn();
    const w = mount(FilePreview, {
      props: { source: () => new Promise<ArrayBuffer>(() => undefined), fileName: 'a.txt', timeout: 1000, onError },
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(statusOf(w)).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(statusOf(w)).toBe('error');
    const err = onError.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(FileLoadError);
    expect((err as Error & { cause?: Error }).cause?.name).toBe('TimeoutError');
    expect(w.text()).toContain('1 秒');
    w.unmount();
  });

  it('在 timeout - 1 毫秒读完：正常显示', async () => {
    vi.useFakeTimers();
    installTxt();
    const source = () => new Promise<ArrayBuffer>(r => setTimeout(() => r(textBuffer('ok')), 999));
    const w = mount(FilePreview, { props: { source, fileName: 'a.txt', timeout: 1000 } });
    await vi.advanceTimersByTimeAsync(999);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10);
    expect(statusOf(w)).toBe('ready');
    w.unmount();
  });

  it('timeout = 1（最小正数）：立即超时，不抛出未处理的 rejection', async () => {
    installTxt();
    const w = mount(FilePreview, {
      props: { source: () => new Promise<ArrayBuffer>(() => undefined), fileName: 'a.txt', timeout: 1 },
    });
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('error');
    w.unmount();
    await sleep(5);
    expect(rejections).toEqual([]);
  });

  it('URL 下载超时：fetch 收到中止信号，显示超时而不是「网络错误」', async () => {
    installTxt();
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          })
      )
    );
    const w = mount(FilePreview, { props: { source: 'https://x/a.txt', fileName: 'a.txt', timeout: 20 } });
    await sleep(50);
    await flushPromises();
    expect(aborted).toBe(true);
    expect(statusOf(w)).toBe('error');
    expect(w.text()).toContain('超时');
    w.unmount();
  });

  it('timeout 改变会重新加载并按新值计时', async () => {
    installTxt();
    let calls = 0;
    const source = () => {
      calls += 1;
      return new Promise<ArrayBuffer>(() => undefined);
    };
    const w = mount(FilePreview, { props: { source, fileName: 'a.txt', timeout: 10_000 } });
    await sleep(5);
    await w.setProps({ timeout: 20 });
    await sleep(50);
    await flushPromises();
    expect(calls).toBe(2);
    expect(statusOf(w)).toBe('error');
    w.unmount();
  });
});

describe('下载进度：没有 Content-Length', () => {
  /** 送完 total 字节后先不结束，等 release */
  const serve = (total: number) => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (sent >= total) {
          await gate;
          return c.close();
        }
        const n = Math.min(1 << 20, total - sent);
        sent += n;
        c.enqueue(new Uint8Array(n));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body))
    );
    return () => release();
  };
  it.each([
    [PROGRESS_MIN_BYTES, false],
    [PROGRESS_MIN_BYTES + 1, true],
  ])('已读 %i 字节 → 显示进度 %s；读完后进度消失', async (total, shown) => {
    installTxt();
    const release = serve(total);
    const w = mount(FilePreview, { props: { source: 'https://x/a.txt', fileName: 'a.txt', maxSize: 64 << 20 } });
    await sleep(30);
    await flushPromises();
    expect(statusOf(w)).toBe('loading');
    expect(w.text().includes('正在下载')).toBe(shown);
    release();
    await sleep(20);
    await flushPromises();
    expect(statusOf(w)).toBe('ready');
    expect(w.text()).not.toContain('正在下载');
    w.unmount();
  });
});

describe('csvMaxRows 规范化', () => {
  it.each([
    [undefined, DEFAULT_CSV_MAX_ROWS],
    [0, DEFAULT_CSV_MAX_ROWS],
    [-1, DEFAULT_CSV_MAX_ROWS],
    [0.5, DEFAULT_CSV_MAX_ROWS],
    [NaN, DEFAULT_CSV_MAX_ROWS],
    ['100', DEFAULT_CSV_MAX_ROWS],
    [1, 1],
    [1.9, 1],
    [1500.5, 1500],
    [Infinity, Infinity],
    [-Infinity, DEFAULT_CSV_MAX_ROWS],
  ])('%s → %s', (input, expected) => {
    expect(resolveCsvMaxRows(input)).toBe(expected);
  });
});

describe('图片像素阈值 ±1', () => {
  it.each([
    [3, 33_333_333, null], // 99,999,999
    [10_000, 10_000, null], // 恰好 1 亿
    [17, 5_882_353, 'block'], // 100,000,001
  ])('%i × %i → %s', async (w, h, level) => {
    const r = await preflight(pngOf(w, h));
    expect(r?.level ?? null).toBe(level);
  });

  it.each([
    [3, 13_333_333, false], // 39,999,999
    [8000, 5000, false], // 恰好 4000 万
    [53, 754_717, true], // 40,000,001
  ])('%i × %i 超过缩小版阈值：%s', (w, h, over) => {
    expect(w * h > IMAGE_PREVIEW_PIXELS).toBe(over);
    expect(w * h > IMAGE_MAX_PIXELS).toBe(false);
  });

  it('文件头异常：宽或高为 0、截断、BMP 负高度、未知格式 → 读不到尺寸则不拦截', async () => {
    expect(readImageSize(pngOf(0, 0))).toBeNull();
    expect(readImageSize(pngOf(100, 100).slice(0, 23))).toBeNull();
    expect(readImageSize(new Uint8Array(4))).toBeNull();
    const bmp = new Uint8Array(30);
    bmp.set([0x42, 0x4d]);
    const v = new DataView(bmp.buffer);
    v.setInt32(18, 20000, true);
    v.setInt32(22, -20000, true);
    expect(readImageSize(bmp)).toEqual({ width: 20000, height: 20000 });
    expect((await preflight(bmp.buffer))?.level).toBe('block');
    expect(await preflight(textBuffer('not an image at all'))).toBeNull();
  });
});

describe('缩小版：失败与中止', () => {
  it('createImageBitmap 不存在 / 解码失败（损坏图片）→ 返回 null，回退原图', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await createPreview(new Blob([new Uint8Array(10)]), 9000, 9000, new AbortController().signal)).toBeNull();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('bad', 'InvalidStateError');
      })
    );
    expect(await createPreview(new Blob([new Uint8Array(10)]), 9000, 9000, new AbortController().signal)).toBeNull();
  });

  it('已中止：不再在主线程缩小', async () => {
    const spy = vi.fn();
    vi.stubGlobal('createImageBitmap', spy);
    const c = new AbortController();
    c.abort();
    expect(await createPreview(new Blob([new Uint8Array(10)]), 9000, 9000, c.signal)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Worker 出错 / 返回错误消息 / 中止：都 terminate 并回退', async () => {
    const workers: Array<{
      terminate: ReturnType<typeof vi.fn>;
      onmessage?: (e: unknown) => void;
      onerror?: (e: unknown) => void;
    }> = [];
    class FakeWorker {
      terminate = vi.fn();
      onmessage?: (e: unknown) => void;
      onerror?: (e: unknown) => void;
      onmessageerror?: () => void;
      constructor() {
        workers.push(this);
      }
      postMessage() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close() {} }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      transferFromImageBitmap() {},
    } as never);
    const blob = new Blob([new Uint8Array(10)]);
    // 1. onerror → 主线程缩小
    let p = createPreview(blob, 9000, 9000, new AbortController().signal);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    workers[0].onerror?.({ preventDefault() {} });
    expect(await p).not.toBeNull();
    expect(workers[0].terminate).toHaveBeenCalled();
    // 2. 错误消息 → 主线程缩小
    p = createPreview(blob, 9000, 9000, new AbortController().signal);
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    workers[1].onmessage?.({ data: { error: 'x' } });
    expect(await p).not.toBeNull();
    expect(workers[1].terminate).toHaveBeenCalled();
    // 3. 中止 → null，不在主线程缩小
    const c = new AbortController();
    p = createPreview(blob, 9000, 9000, c.signal);
    await vi.waitFor(() => expect(workers).toHaveLength(3));
    c.abort();
    expect(await p).toBeNull();
    expect(workers[2].terminate).toHaveBeenCalled();
  });

  it('销毁时清空缩小版画布并释放 Blob URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:big');
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (_b: Blob, o: { resizeWidth: number; resizeHeight: number }) => ({
        width: o.resizeWidth,
        height: o.resizeHeight,
        close() {},
      }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ transferFromImageBitmap() {} } as never);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = imageRenderer.create();
    const ctx: RenderContext = {
      fileName: 'a.png',
      fileType: 'png',
      textEncoding: 'auto',
      signal: new AbortController().signal,
      t: (k: string) => k,
      appContext: null,
    };
    await instance.render(container, pngOf(9000, 9000), ctx);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(2048);
    instance.destroy?.();
    expect(canvas.width).toBe(0);
    expect(container.querySelector('canvas')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:big');
  });
});

describe('懒加载缓存只保留当前与相邻文件', () => {
  it('依次打开 5 个文件后回到第 1 个：重新调用 loader；回到上一个：用缓存', async () => {
    installTxt();
    const calls: number[] = [];
    const files = [0, 1, 2, 3, 4].map(i => ({
      fileName: `f${i}.txt`,
      source: async () => {
        calls.push(i);
        return textBuffer(`file ${i}`);
      },
    }));
    const w = mount(FilePreviewModal, { props: { open: true, files, index: 0 }, attachTo: document.body });
    for (let i = 1; i < 5; i++) {
      await vi.waitFor(() => expect(document.body.textContent).toContain(`file ${i - 1}`));
      await w.setProps({ index: i });
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain('file 4'));
    expect(calls).toEqual([0, 1, 2, 3, 4]);
    await w.setProps({ index: 3 });
    await vi.waitFor(() => expect(document.body.textContent).toContain('file 3'));
    expect(calls).toEqual([0, 1, 2, 3, 4]);
    await w.setProps({ index: 0 });
    await vi.waitFor(() => expect(document.body.textContent).toContain('file 0'));
    expect(calls).toEqual([0, 1, 2, 3, 4, 0]);
    w.unmount();
  });
});

describe('快速切换', () => {
  it('30 次在超时来源、超大图片、文本、CSV 之间切换：只显示最后一个，无未处理的 rejection', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        await sleep(3);
        return { width: 10, height: 10, close() {} };
      })
    );
    const csv = textBuffer('a,b\n1,2\n');
    const sources: Array<{ source: unknown; fileName: string }> = [
      { source: () => new Promise<ArrayBuffer>(() => undefined), fileName: 'hang.txt' },
      { source: pngOf(20000, 20000), fileName: 'huge.png' },
      { source: pngOf(9000, 9000), fileName: 'big.png' },
      { source: textBuffer('plain'), fileName: 'p.txt' },
      { source: csv, fileName: 'c.csv' },
    ];
    const w = mount(FilePreview, { props: { ...sources[0], timeout: 5 } as never });
    for (let i = 1; i <= 30; i++) {
      await w.setProps(sources[i % sources.length] as never);
      await sleep(i % 3);
    }
    await w.setProps({ source: textBuffer('last one'), fileName: 'last.txt' });
    for (let i = 0; i < 50 && statusOf(w) !== 'ready'; i++) await sleep(5);
    await flushPromises();
    await nextTick();
    expect(statusOf(w)).toBe('ready');
    expect(w.text()).toContain('last one');
    expect(w.findAll('.yss-file-preview-image').length).toBe(0);
    await sleep(20);
    expect(rejections).toEqual([]);
    w.unmount();
  });
});
