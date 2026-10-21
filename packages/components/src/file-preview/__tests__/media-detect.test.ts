import { describe, expect, it } from 'vitest';
import { detectFileType, sniffImageKind, sniffSvg, sniffZipKind } from '../utils/detect';

const enc = new TextEncoder();
const bytes = (...parts: Array<number[] | string>) => {
  const chunks = parts.map(p => (typeof p === 'string' ? enc.encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = bytes('GIF89a', [1, 0, 1, 0]);
const WEBP = bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');
// BM + 文件大小 + 保留字 0 + 像素偏移 + DIB 头长度 40
const BMP = bytes('BM', [0x46, 0, 0, 0], [0, 0, 0, 0], [0x36, 0, 0, 0], [40, 0, 0, 0]);
const ICO = bytes([0, 0, 1, 0, 1, 0, 32, 32]);
const SVG = bytes('<?xml version="1.0"?>\n<!-- comment -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const pptxBytes = bytes(ZIP, '\0\0[Content_Types].xml...ppt/presentation.xml');
const docxBytes = bytes(ZIP, '\0\0word/document.xml');

describe('file-preview 图片与 pptx 识别', () => {
  it.each([
    ['png', PNG],
    ['jpg', JPG],
    ['gif', GIF],
    ['webp', WEBP],
    ['bmp', BMP],
    ['ico', ICO],
    ['svg', SVG],
  ] as const)('文件头识别 %s', (kind, data) => {
    expect(sniffImageKind(data)).toBe(kind);
    // 没有后缀时按内容识别
    expect(detectFileType('noext', undefined, data).type).toBe(kind);
    // 后缀与内容一致
    expect(detectFileType(`a.${kind}`, undefined, data).type).toBe(kind);
  });

  it('.jpeg 归为 jpg，MIME 也能识别', () => {
    expect(detectFileType('a.JPEG', undefined, JPG).type).toBe('jpg');
    expect(detectFileType(undefined, 'image/webp', WEBP).type).toBe('webp');
    expect(detectFileType(undefined, 'image/svg+xml; charset=utf-8', SVG).type).toBe('svg');
  });

  it('图片之间改后缀不算不一致，非图片内容算不一致', () => {
    expect(detectFileType('photo.jpg', undefined, PNG)).toMatchObject({ type: 'jpg', mismatch: false });
    expect(detectFileType('fake.png', undefined, enc.encode('plain text')).mismatch).toBe(true);
    expect(detectFileType('fake.png', undefined, docxBytes).mismatch).toBe(true);
  });

  it('SVG 按根元素识别：允许 BOM、XML 声明、注释，普通文本或 HTML 不算', () => {
    expect(sniffSvg(bytes([0xef, 0xbb, 0xbf], '<svg width="1"/>'))).toBe(true);
    expect(sniffSvg(enc.encode('  <SVG>'))).toBe(true);
    expect(sniffSvg(enc.encode('<html><svg></svg></html>'))).toBe(false);
    expect(sniffSvg(enc.encode('text mentioning <svg> later'))).toBe(false);
    // SVG 是文本，按 .txt 打开时照常显示源码
    expect(detectFileType('icon.txt', undefined, SVG).type).toBe('txt');
  });

  it('弱签名不误判：以 BM / GIF8 开头的文本仍是文本', () => {
    expect(detectFileType('notes.txt', undefined, enc.encode('BMW and Benz, a list of cars...')).type).toBe('txt');
    expect(detectFileType('notes.txt', undefined, enc.encode('GIF8 is a word here')).type).toBe('txt');
    expect(sniffImageKind(enc.encode('BM short'))).toBeNull();
  });

  it('二进制图片按文本打开时识别为内容不符', () => {
    expect(detectFileType('a.txt', undefined, PNG).mismatch).toBe(true);
    expect(detectFileType('a.csv', undefined, JPG).mismatch).toBe(true);
  });

  it('zip 内有 ppt/ 目录识别为 pptx，并与 docx / xlsx 区分', () => {
    expect(sniffZipKind(pptxBytes)).toBe('pptx');
    expect(detectFileType('slides.pptx', undefined, pptxBytes).type).toBe('pptx');
    expect(detectFileType('noext', undefined, pptxBytes).type).toBe('pptx');
    expect(detectFileType(undefined, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pptxBytes).type).toBe('pptx');
    expect(detectFileType('slides.pptx', undefined, docxBytes).mismatch).toBe(true);
    expect(detectFileType('doc.docx', undefined, pptxBytes).mismatch).toBe(true);
    expect(detectFileType('sheet.xls', undefined, pptxBytes).mismatch).toBe(true);
  });
});
