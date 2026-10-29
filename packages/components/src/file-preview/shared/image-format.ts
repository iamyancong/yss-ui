/**
 * 按文件头识别图片格式、读取像素尺寸（pptx 子路径与 Excel 渲染器共用）。
 */
import { isEmf, isWmf } from './metafile';
import { isTiff } from './tiff';

export type ImageFormat =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'bmp'
  | 'webp'
  | 'svg'
  | 'ico'
  | 'tiff'
  | 'emf'
  | 'wmf'
  | 'unknown';

/** 浏览器 <img> 能直接显示的格式 */
export const NATIVE_IMAGE_FORMATS: ReadonlySet<ImageFormat> = new Set(['png', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico']);

/** 默认像素上限：1 亿像素（约 12000 × 8300），再大浏览器解码会占用数百 MB 内存 */
export const DEFAULT_MAX_IMAGE_PIXELS = 100_000_000;

const textHead = (bytes: Uint8Array, length = 2048) => {
  let s = '';
  const end = Math.min(bytes.length, length);
  for (let i = 0; i < end; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
};

/** 按文件头判断图片格式（不看扩展名） */
export const detectImageFormat = (bytes: Uint8Array): ImageFormat => {
  const b = bytes;
  if (b.length < 4) return 'unknown';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b[0] === 0x42 && b[1] === 0x4d && b.length > 26) return 'bmp';
  if (b.length > 12 && textHead(b, 4) === 'RIFF' && textHead(b.subarray(8), 4) === 'WEBP') return 'webp';
  if (isTiff(b)) return 'tiff';
  if (isEmf(b)) return 'emf';
  if (isWmf(b)) return 'wmf';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  const head = textHead(b).replace(/^\uFEFF|^\xEF\xBB\xBF/, '').trimStart();
  if (/^(?:<\?xml|<!--|<!DOCTYPE\s+svg|<svg)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return 'unknown';
};

export { imageDimensions } from './image-size';

