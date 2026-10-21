import { describe, expect, it } from 'vitest';
import { createChunkedTextReader, decodeTextBuffer, detectTextEncoding, isEncodingSupported } from '../renderers/text';

const enc = new TextEncoder();
const gbkSupported = isEncodingSupported('gbk');

/** 中文 GBK 编码字节（「中文」） */
const GBK_ZHONGWEN = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]);

describe('file-preview/renderers/text 编码', () => {
  it('UTF-8 文本识别为 utf-8', () => {
    expect(detectTextEncoding(enc.encode('你好 world'))).toBe('utf-8');
  });

  it('非法 UTF-8 序列回退为 GBK', () => {
    expect(detectTextEncoding(GBK_ZHONGWEN)).toBe(gbkSupported ? 'gbk' : 'utf-8');
    if (gbkSupported) expect(decodeTextBuffer(GBK_ZHONGWEN)).toBe('中文');
  });

  it('采样末尾截断的多字节字符不会误判为 GBK', () => {
    const text = '中'.repeat(30000); // 90000 字节，采样 64KB 时会切断字符
    expect(detectTextEncoding(enc.encode(text))).toBe('utf-8');
  });

  it('识别 BOM', () => {
    expect(detectTextEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8');
    expect(detectTextEncoding(Uint8Array.from([0xff, 0xfe, 0x41, 0x00]))).toBe('utf-16le');
    expect(detectTextEncoding(Uint8Array.from([0xfe, 0xff, 0x00, 0x41]))).toBe('utf-16be');
  });

  it('没有 BOM 的 UTF-16（以西文为主）按 0 字节的位置识别', () => {
    const text = 'Hello, world\r\nline 2 中文';
    const le = new Uint8Array(text.length * 2);
    const be = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      le[i * 2] = c & 0xff;
      le[i * 2 + 1] = c >> 8;
      be[i * 2] = c >> 8;
      be[i * 2 + 1] = c & 0xff;
    }
    expect(detectTextEncoding(le)).toBe('utf-16le');
    expect(decodeTextBuffer(le)).toBe(text);
    expect(detectTextEncoding(be)).toBe('utf-16be');
    expect(detectTextEncoding(new TextEncoder().encode('plain ascii text'))).toBe('utf-8');
  });

  it('显式编码直接使用', () => {
    expect(detectTextEncoding(GBK_ZHONGWEN, 'utf-8')).toBe('utf-8');
    expect(detectTextEncoding(enc.encode('abc'), 'gbk')).toBe(gbkSupported ? 'gbk' : 'utf-8');
  });

  it('分段读取 UTF-8 时跨段字符不乱码', () => {
    const text = '中文分片边界测试abc'.repeat(5000);
    // 7 字节一段，必然切断 3 字节的中文字符
    const reader = createChunkedTextReader(enc.encode(text), 'auto', 7);
    let out = '';
    while (!reader.done) out += reader.next();
    expect(reader.encoding).toBe('utf-8');
    expect(out).toBe(text);
    expect(reader.next()).toBe('');
  });

  it.runIf(gbkSupported)('分段读取 GBK 时跨段字符不乱码', () => {
    const repeated = new Uint8Array(GBK_ZHONGWEN.length * 1000);
    for (let i = 0; i < 1000; i++) repeated.set(GBK_ZHONGWEN, i * 4);
    const reader = createChunkedTextReader(repeated, 'auto', 3);
    let out = '';
    while (!reader.done) out += reader.next();
    expect(out).toBe('中文'.repeat(1000));
  });
});
