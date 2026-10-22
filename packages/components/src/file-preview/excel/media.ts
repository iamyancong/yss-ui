/**
 * 表格里图片的加载：从 xlsx 读出字节，按文件头识别格式，转成 <img> 能显示的 Blob URL。
 *
 * - PNG / JPEG / GIF / BMP / WebP / SVG / ICO：直接显示（SVG 用 <img> 显示，不执行其中的脚本）；
 * - TIFF：本地解码后转 PNG（../shared/tiff）；
 * - EMF：内嵌位图的（常见于粘贴的截图、OLE 对象图标）取出位图显示；纯矢量的 EMF 与 WMF 显示占位；
 * - 外部链接图片不加载；缺失、损坏、像素数超过上限的图片显示占位。
 */
import { classifyEmf } from '../shared/metafile';
import { DEFAULT_MAX_IMAGE_PIXELS, detectImageFormat, imageDimensions, NATIVE_IMAGE_FORMATS } from '../shared/image-format';
import { decodeTiff } from '../shared/tiff';
import type { WorkbookAssets } from './model';

export type ImageIssue = 'missing' | 'external' | 'unsupported' | 'tooLarge' | 'broken';

export type LoadedImage = { url: string; width?: number; height?: number } | { issue: ImageIssue; format?: string };

/** 单张图片解压后的字节上限 */
export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

/** 取出 EMF 里的位图（EMR_STRETCHDIBITS），拼成 BMP 文件；没有时返回 null */
export function emfBitmap(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let best: Uint8Array | null = null;
  let bestArea = 0;
  while (offset + 8 <= bytes.length) {
    const type = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > bytes.length || type === 14) break;
    if (type === 81 && size > 80) {
      const offBmi = view.getUint32(offset + 48, true);
      const cbBmi = view.getUint32(offset + 52, true);
      const offBits = view.getUint32(offset + 56, true);
      const cbBits = view.getUint32(offset + 60, true);
      if (cbBmi >= 40 && cbBits && offBmi + cbBmi <= size && offBits + cbBits <= size) {
        const header = offset + offBmi;
        const area = Math.abs(view.getInt32(header + 4, true) * view.getInt32(header + 8, true));
        if (area > bestArea) {
          const out = new Uint8Array(14 + cbBmi + cbBits);
          const ov = new DataView(out.buffer);
          out[0] = 0x42;
          out[1] = 0x4d;
          ov.setUint32(2, out.length, true);
          ov.setUint32(10, 14 + cbBmi, true);
          out.set(bytes.subarray(header, header + cbBmi), 14);
          out.set(bytes.subarray(offset + offBits, offset + offBits + cbBits), 14 + cbBmi);
          best = out;
          bestArea = area;
        }
      }
    }
    offset += size;
  }
  return best;
}

async function encodePng(width: number, height: number, data: Uint8ClampedArray | Uint8Array): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d not available');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength), width, height), 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png encode failed');
  return blob;
}

export interface ImageLoaderOptions {
  maxImagePixels?: number;
}

/** 每个工作簿一个加载器：同一图片只解码一次，destroy 时统一释放 Blob URL */
export class ImageLoader {
  private readonly cache = new Map<string, Promise<LoadedImage>>();
  private readonly urls: string[] = [];
  private disposed = false;

  constructor(
    private readonly assets: WorkbookAssets,
    private readonly options: ImageLoaderOptions = {}
  ) {}

  load(path: string | undefined): Promise<LoadedImage> {
    if (!path) return Promise.resolve({ issue: 'missing' });
    let p = this.cache.get(path);
    if (!p) {
      p = this.decode(path).catch(() => ({ issue: 'broken' as const }));
      this.cache.set(path, p);
    }
    return p;
  }

  private url(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    if (this.disposed) URL.revokeObjectURL(url);
    else this.urls.push(url);
    return url;
  }

  private async decode(path: string): Promise<LoadedImage> {
    const size = this.assets.size(path);
    if (size === undefined) return { issue: 'missing' };
    if (size > MAX_IMAGE_BYTES) return { issue: 'tooLarge' };
    const bytes = await this.assets.bytes(path);
    if (!bytes || !bytes.length) return { issue: bytes ? 'broken' : 'missing' };
    const maxPixels = this.options.maxImagePixels ?? DEFAULT_MAX_IMAGE_PIXELS;
    const format = detectImageFormat(bytes);
    if (NATIVE_IMAGE_FORMATS.has(format)) {
      const dim = imageDimensions(bytes, format);
      if (dim && dim.width * dim.height > maxPixels) return { issue: 'tooLarge' };
      return { url: this.url(new Blob([bytes as BlobPart], { type: MIME[format] })), ...dim };
    }
    if (format === 'tiff') {
      try {
        const img = await decodeTiff(bytes, { maxPixels });
        return { url: this.url(await encodePng(img.width, img.height, img.data)), width: img.width, height: img.height };
      } catch (err) {
        return { issue: (err as Error)?.name === 'TiffTooLargeError' ? 'tooLarge' : 'unsupported', format: 'TIFF' };
      }
    }
    if (format === 'emf') {
      const bmp = classifyEmf(bytes) === 'bitmap' ? emfBitmap(bytes) : null;
      const dim = bmp ? imageDimensions(bmp, 'bmp') : null;
      if (bmp && dim && dim.width * dim.height <= maxPixels) return { url: this.url(new Blob([bmp as BlobPart], { type: 'image/bmp' })), ...dim };
      return { issue: 'unsupported', format: 'EMF' };
    }
    if (format === 'wmf') return { issue: 'unsupported', format: 'WMF' };
    const ext = path.split('.').pop()?.toUpperCase();
    return { issue: 'unsupported', format: ext && ext.length <= 5 ? ext : undefined };
  }

  destroy() {
    this.disposed = true;
    this.urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    this.cache.clear();
  }
}
