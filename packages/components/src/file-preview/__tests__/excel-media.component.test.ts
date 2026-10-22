/**
 * 表格图片加载：缺失、外链、无位图 EMF、destroy 释放 Blob URL。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImageLoader, emfBitmap } from '../excel/media';
import { trackObjectUrls } from './helpers';

const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0)
);

let urls: ReturnType<typeof trackObjectUrls>;
beforeEach(() => {
  urls = trackObjectUrls();
});
afterEach(() => urls.restore());

describe('ImageLoader', () => {
  it('PNG 生成 Blob URL，destroy 时全部释放', async () => {
    const loader = new ImageLoader({
      bytes: async () => TINY_PNG,
      size: () => TINY_PNG.length,
    });
    const img = await loader.load('xl/media/image1.png');
    expect(img).toMatchObject({ url: expect.stringMatching(/^blob:/) });
    expect(urls.live.size).toBe(1);
    loader.destroy();
    expect(urls.live.size).toBe(0);
  });

  it('缺失、路径为空、超过字节上限', async () => {
    const loader = new ImageLoader({
      bytes: async () => TINY_PNG,
      size: path => (path.includes('missing') ? undefined : TINY_PNG.length),
    });
    expect(await loader.load(undefined)).toEqual({ issue: 'missing' });
    expect(await loader.load('xl/media/missing.png')).toEqual({ issue: 'missing' });
    const huge = new ImageLoader({
      bytes: async () => TINY_PNG,
      size: () => 65 * 1024 * 1024,
    });
    expect(await huge.load('xl/media/big.png')).toEqual({ issue: 'tooLarge' });
  });

  it('没有位图的 EMF 显示不支持占位', async () => {
    const emf = new Uint8Array(108);
    new DataView(emf.buffer).setUint32(0, 1, true);
    new DataView(emf.buffer).setUint32(4, 108, true);
    expect(emfBitmap(emf)).toBeNull();
    const loader = new ImageLoader({
      bytes: async () => emf,
      size: () => emf.length,
    });
    expect(await loader.load('xl/media/image1.emf')).toEqual({ issue: 'unsupported', format: 'EMF' });
  });
});
