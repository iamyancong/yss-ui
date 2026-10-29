/**
 * #62 边界值：文本分段阈值、CSV 每页行数恰好等于 / ±1；0 字节文本与 CSV。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CSV_PAGE_SIZE, TEXT_CHUNK_SIZE, TEXT_LARGE_FILE_THRESHOLD } from '../constant';
import { csvRenderer } from '../renderers/csv';
import { textRenderer } from '../renderers/text';
import type { RenderContext } from '../renderers/types';
import { textBuffer } from './helpers';

const ctx = (fileType: string): RenderContext => ({
  fileName: `a.${fileType}`,
  fileType,
  textEncoding: 'utf-8',
  signal: new AbortController().signal,
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  appContext: null,
});

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('文本分段阈值', () => {
  it.each([
    [TEXT_LARGE_FILE_THRESHOLD - 1, false],
    [TEXT_LARGE_FILE_THRESHOLD, false],
    [TEXT_LARGE_FILE_THRESHOLD + 1, true],
  ])('%i 字节 → 分段 %s（恰好等于时一次显示全部）', async (size, large) => {
    const instance = textRenderer.create();
    await instance.render(container, new Uint8Array(size).fill(97).buffer, ctx('txt'));
    const more = container.querySelector('.yss-file-preview-text__more-btn');
    expect(!!more).toBe(large);
    const shown = container.querySelector('pre')!.textContent!.length;
    expect(shown).toBe(large ? TEXT_CHUNK_SIZE : size);
    instance.destroy?.();
  });

  it('0 字节文本：空内容，不报错', async () => {
    const instance = textRenderer.create();
    await instance.render(container, new ArrayBuffer(0), ctx('txt'));
    expect(container.querySelector('pre')!.textContent).toBe('');
    instance.destroy?.();
  });
});

describe('CSV 每页行数', () => {
  const csv = (rows: number) => ['id,v', ...Array.from({ length: rows }, (_, i) => `${i},x`)].join('\n');
  it.each([
    [CSV_PAGE_SIZE - 1, false],
    [CSV_PAGE_SIZE, false],
    [CSV_PAGE_SIZE + 1, true],
  ])('%i 行数据 → 「加载更多」%s', async (rows, more) => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer(csv(rows)), ctx('csv'));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(Math.min(rows, CSV_PAGE_SIZE));
    expect(!!container.querySelector('.yss-file-preview-csv__more-btn')).toBe(more);
    instance.destroy?.();
  });

  it('只有表头、0 字节：不报错', async () => {
    for (const data of [textBuffer('id,v'), new ArrayBuffer(0)]) {
      const instance = csvRenderer.create();
      await expect(instance.render(container, data, ctx('csv'))).resolves.toBeUndefined();
      instance.destroy?.();
      container.innerHTML = '';
    }
  });
});
