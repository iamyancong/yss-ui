import { describe, expect, it } from 'vitest';
import { detectFileType, extractExtension, sniffZipKind, verifyMagicHeader } from '../utils/detect';

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
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const docxBytes = bytes(ZIP, '\0\0[Content_Types].xml...word/document.xml');
const xlsxBytes = bytes(ZIP, '\0\0[Content_Types].xml...xl/workbook.xml');
const pdfBytes = bytes('%PDF-1.7\n...');

describe('file-preview/utils/detect', () => {
  it('提取后缀时忽略 URL 查询参数、哈希与目录', () => {
    expect(extractExtension('a/b/report.DOCX?x=1#top')).toBe('docx');
    expect(extractExtension('C:\\docs\\x.pdf')).toBe('pdf');
    expect(extractExtension('.gitignore')).toBe('');
    expect(extractExtension('noext')).toBe('');
    expect(extractExtension('trailing.')).toBe('');
    expect(extractExtension()).toBe('');
  });

  it('按后缀识别内置类型并校验文件头', () => {
    expect(detectFileType('a.docx', undefined, docxBytes).type).toBe('docx');
    expect(detectFileType('a.xlsx', undefined, xlsxBytes).type).toBe('xlsx');
    expect(detectFileType('a.xls', undefined, bytes(OLE)).type).toBe('xls');
    expect(detectFileType('a.pdf', undefined, pdfBytes).type).toBe('pdf');
    expect(detectFileType('a.markdown', undefined, enc.encode('# hi')).type).toBe('md');
  });

  it('doc / ppt / wps 等格式返回不支持并保留原后缀', () => {
    for (const ext of ['doc', 'ppt', 'wps', 'rtf', 'zip']) {
      const result = detectFileType(`legacy.${ext}`, undefined, bytes(OLE));
      expect(result.type).toBeNull();
      expect(result.expectedType).toBe(ext);
      expect(result.reason).toBe('UNSUPPORTED_TYPE');
    }
  });

  it('0 字节文件优先返回空文件', () => {
    const result = detectFileType('empty.csv', undefined, new Uint8Array());
    expect(result.isEmpty).toBe(true);
    expect(result.reason).toBe('EMPTY_FILE');
  });

  it('改了后缀的文件识别为内容不符', () => {
    expect(detectFileType('fake.docx', undefined, enc.encode('plain text')).mismatch).toBe(true);
    expect(detectFileType('fake.pdf', undefined, docxBytes).mismatch).toBe(true);
    expect(detectFileType('tiny.docx', undefined, enc.encode('P')).mismatch).toBe(true);
    // docx 和 xlsx 都是 zip，靠 zip 条目名区分
    expect(detectFileType('sheet.docx', undefined, xlsxBytes).mismatch).toBe(true);
    expect(detectFileType('doc.xlsx', undefined, docxBytes).mismatch).toBe(true);
    // 文本后缀但内容是二进制容器
    expect(detectFileType('notes.txt', undefined, pdfBytes).mismatch).toBe(true);
  });

  it('内容其实是 xlsx 的 .xls 仍可预览，docx 改成 .xls 则不符', () => {
    expect(detectFileType('export.xls', undefined, xlsxBytes).type).toBe('xls');
    expect(detectFileType('export.xls', undefined, docxBytes).mismatch).toBe(true);
  });

  it('显式 fileType 优先于后缀，但仍校验内容', () => {
    expect(detectFileType('download', undefined, pdfBytes, 'pdf').type).toBe('pdf');
    expect(detectFileType('a.bin', undefined, enc.encode('a,b'), 'csv').type).toBe('csv');
    expect(detectFileType('a.txt', undefined, enc.encode('x'), 'docx').mismatch).toBe(true);
  });

  it('没有后缀时按文件内容和 MIME 识别', () => {
    expect(detectFileType('', undefined, docxBytes).type).toBe('docx');
    expect(detectFileType('', undefined, xlsxBytes).type).toBe('xlsx');
    expect(detectFileType(undefined, undefined, pdfBytes).type).toBe('pdf');
    expect(detectFileType('', 'text/csv; charset=utf-8', enc.encode('a,b')).type).toBe('csv');
    expect(detectFileType('', 'application/pdf', enc.encode('not pdf')).mismatch).toBe(true);
    expect(detectFileType('', undefined, enc.encode('???')).reason).toBe('UNSUPPORTED_TYPE');
  });

  it('不传内容时只按后缀和 MIME 识别', () => {
    expect(detectFileType('a.docx').type).toBe('docx');
    expect(detectFileType('', 'application/vnd.ms-excel').type).toBe('xls');
  });

  it('sniffZipKind 只认 word/ 与 xl/ 条目', () => {
    expect(sniffZipKind(docxBytes)).toBe('docx');
    expect(sniffZipKind(xlsxBytes)).toBe('xlsx');
    expect(sniffZipKind(bytes(ZIP, 'other/file.txt'))).toBeNull();
  });

  it('verifyMagicHeader 对文本类型不做校验', () => {
    expect(verifyMagicHeader(enc.encode('x'), 'txt')).toEqual({ matched: true, verifiable: false });
    expect(verifyMagicHeader(pdfBytes, 'pdf')).toEqual({ matched: true, verifiable: true });
    expect(verifyMagicHeader(enc.encode('x'), 'docx')).toEqual({ matched: false, verifiable: true });
  });
});
