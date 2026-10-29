import { describe, expect, it } from 'vitest';
import { DEFAULT_CSV_MAX_ROWS, resolveCsvMaxRows, resolveLoadTimeout } from '../constant';
import { createChunkedTextReader } from '../renderers/text';
import { readImageSize } from '../shared/image-size';

describe('perf-67 non-Excel boundaries', () => {
  it('uses the 50k CSV default and preserves invalid-value fallback', () => {
    expect(DEFAULT_CSV_MAX_ROWS).toBe(50_000);
    expect(resolveCsvMaxRows(0)).toBe(50_000);
    expect(resolveCsvMaxRows(-1)).toBe(50_000);
    expect(resolveCsvMaxRows(Number.NaN)).toBe(50_000);
    expect(resolveCsvMaxRows(1)).toBe(1);
    expect(resolveCsvMaxRows(50_000.9)).toBe(50_000);
    expect(resolveCsvMaxRows(Infinity)).toBe(Infinity);
  });

  it('cuts text at CRLF boundaries and never emits a partial UTF-8 code point', () => {
    const bytes = new TextEncoder().encode('\uFEFF中文😀\r\n第二行\n第三行');
    const reader = createChunkedTextReader(bytes, 'utf-8', 20);
    expect(reader.next(20, true)).toBe('中文😀\r\n');
    expect(reader.next(10, true)).toBe('第二行\n');
    expect(reader.next(20, true)).toBe('第三行');
  });

  it('makes progress on a single very long line without splitting emoji', () => {
    const text = '中文😀'.repeat(20);
    const reader = createChunkedTextReader(new TextEncoder().encode(text), 'utf-8');
    const first = reader.next(9, true);
    expect(first).not.toContain('\uFFFD');
    expect(first.length).toBeGreaterThan(0);
    expect(first + reader.next(1000, true)).toBe(text);
  });

  it('reads SVG viewBox and ICO 256-byte dimensions before decode', () => {
    const svg = new TextEncoder().encode('<svg viewBox="0 0 20000 10000"></svg>');
    expect(readImageSize(svg)).toEqual({ width: 20_000, height: 10_000 });
    const ico = new Uint8Array(22);
    ico[2] = 1; ico[4] = 1; ico[6] = 0; ico[7] = 0;
    expect(readImageSize(ico)).toEqual({ width: 256, height: 256 });
  });

  it('keeps timeout disabled only for explicit non-positive/invalid values', () => {
    expect(resolveLoadTimeout(0)).toBe(Infinity);
    expect(resolveLoadTimeout(-1)).toBe(Infinity);
    expect(resolveLoadTimeout(Number.NaN)).toBe(Infinity);
    expect(resolveLoadTimeout(1)).toBe(1);
  });
});
