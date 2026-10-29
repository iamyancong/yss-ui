/**
 * 只读文件头的图片尺寸（不解码）。体积很小，图片预览的主入口也会用到；完整的格式识别见 image-format.ts
 */
import type { ImageFormat } from './image-format';

/** 读取常见格式的像素尺寸（只读文件头），读不到返回 null */
export const imageDimensions = (
  bytes: Uint8Array,
  format: ImageFormat | string
): { width: number; height: number } | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (format === 'png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
    if (format === 'gif' && bytes.length >= 10)
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (format === 'bmp' && bytes.length >= 26)
      return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
    if (format === 'jpeg') {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = bytes[i + 1];
        // SOF0~SOF15（不含 DHT C4、JPG C8、DAC CC）
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
          return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        i += 2 + view.getUint16(i + 2);
      }
    }
    if (format === 'ico' && bytes.length >= 22) {
      const count = view.getUint16(4, true);
      if (count > 0) {
        let width = 0;
        let height = 0;
        for (let i = 0; i < count; i += 1) {
          const at = 6 + i * 16;
          if (at + 8 > bytes.length) break;
          width = Math.max(width, bytes[at] || 256);
          height = Math.max(height, bytes[at + 1] || 256);
        }
        if (width > 0 && height > 0) return { width, height };
      }
    }
    if (format === 'svg') {
      const source = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
      const root = source.match(/<svg\b[^>]*>/i)?.[0] || '';
      const viewBox = root.match(/\bviewBox\s*=\s*["']\s*[-+]?([\d.]+)[ ,]+[-+]?([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i);
      const width = root.match(/\bwidth\s*=\s*["']\s*([\d.]+)\s*(?:px)?\s*["']/i);
      const height = root.match(/\bheight\s*=\s*["']\s*([\d.]+)\s*(?:px)?\s*["']/i);
      const w = width ? Number(width[1]) : viewBox ? Number(viewBox[3]) : 0;
      const h = height ? Number(height[1]) : viewBox ? Number(viewBox[4]) : 0;
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
    }
    if (format === 'webp' && bytes.length >= 30) {
      const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunk === 'VP8X') {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width: w, height: h };
      }
      if (chunk === 'VP8L' && bytes[20] === 0x2f) {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8 ')
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  } catch {
    // 文件头不完整
  }
  return null;
};

/** 按文件头识别 png / jpeg / gif / bmp / webp 并读取尺寸；其他格式（svg、ico 等）返回 null */
export function readImageSize(data: ArrayBuffer | Uint8Array): { width: number; height: number } | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.length < 6) return null;
  let format = '';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) format = 'png';
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) format = 'jpeg';
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) format = 'gif';
  else if (b[0] === 0x42 && b[1] === 0x4d) format = 'bmp';
  else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45)
    format = 'webp';
  else if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) format = 'ico';
  else if (new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096))).match(/<svg\b/i)) format = 'svg';
  const size = format ? imageDimensions(b, format) : null;
  return size && size.width > 0 && size.height > 0 ? size : null;
}
