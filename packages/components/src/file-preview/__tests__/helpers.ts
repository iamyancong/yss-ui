import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

/** 统计 createObjectURL / revokeObjectURL，返回仍未释放的 URL 集合 */
export function trackObjectUrls() {
  const live = new Set<string>();
  let seq = 0;
  const create = vi.fn((_blob: Blob) => {
    const url = `blob:test/${++seq}`;
    live.add(url);
    return url;
  });
  const revoke = vi.fn((url: string) => {
    live.delete(url);
  });
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  return {
    live,
    create,
    revoke,
    restore() {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    },
  };
}

export const textBuffer = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

/** 读取 file-preview 测试夹具为独立的 ArrayBuffer */
export const loadFixture = (name: string): ArrayBuffer => {
  const buf = readFileSync(resolve(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

/** 最小可识别的 docx / xlsx / pdf 字节 */
export const docxBuffer = () => textBuffer('PK\u0003\u0004..word/document.xml');
export const xlsxBuffer = () => textBuffer('PK\u0003\u0004..xl/workbook.xml');
export const pdfBuffer = () => textBuffer('%PDF-1.4\n%%EOF');
