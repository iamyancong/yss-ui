import { afterEach, describe, expect, it, vi } from 'vitest';
import { SVG_WARN_BYTES } from '../constant';
import { imageRenderer } from '../renderers/image';
import type { RenderContext } from '../renderers/types';
import zhCN from '../../locale/lang/zh-CN/filePreview';
import zhTW from '../../locale/lang/zh-TW/filePreview';
import enUS from '../../locale/lang/en-US/filePreview';

const t = (key: string) => key;
const ctx = (signal: AbortSignal): RenderContext => ({
  fileName: 'a.svg',
  fileType: 'svg',
  textEncoding: 'auto',
  signal,
  t,
  appContext: null,
});
const svgOf = (bytes: number) => {
  const head = '<svg xmlns="http://www.w3.org/2000/svg"><!--';
  const tail = '--></svg>';
  return new TextEncoder().encode(head + 'x'.repeat(Math.max(0, bytes - head.length - tail.length)) + tail).buffer;
};

describe('perf-68 SVG 大文件提示', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it.each([
    [SVG_WARN_BYTES - 1, false],
    [SVG_WARN_BYTES, false],
    [SVG_WARN_BYTES + 1, true],
  ])('%i 字节 → 提示 %s；中途销毁不残留', async (size, expected) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const controller = new AbortController();
    const instance = imageRenderer.create();
    const done = instance.render(container, svgOf(size), ctx(controller.signal));
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
    const bar = container.querySelector('.yss-file-preview__notice-bar');
    expect(Boolean(bar)).toBe(expected);
    if (bar) expect(bar.textContent).toBe('imageSvgLargeNotice');
    controller.abort();
    instance.destroy?.();
    await done.catch(() => undefined);
    expect(container.querySelector('.yss-file-preview__notice-bar')).toBeNull();
    container.remove();
  });
});

describe('perf-68 i18n', () => {
  it('三种语言的键完全一致', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(zhTW)).toEqual(keys(zhCN));
    expect(keys(enUS)).toEqual(keys(zhCN));
  });
  it('中文语言包里不残留英文提示（CSV 截断提示已翻译）', () => {
    expect(zhCN.csvLimitNotice).toMatch(/[\u4e00-\u9fa5]/);
    expect(zhCN.imageSvgLargeNotice).toMatch(/[\u4e00-\u9fa5]/);
    for (const k of ['csvLimitNotice', 'imageLoading', 'imageSvgLargeNotice'] as const) {
      expect(zhTW[k]).toMatch(/[\u4e00-\u9fa5]/);
      expect(enUS[k]).not.toMatch(/[\u4e00-\u9fa5]/);
    }
  });
});
