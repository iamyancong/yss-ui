/**
 * #66：pptx 大文稿提示条（页数 > PPTX_WARN_SLIDES 或文件 > largeFileWarnSize），不拦截预览
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PPTX_WARN_SLIDES } from '../constant';
import { createPptxRenderer } from '../pptx';
import { pptxNoticeOf } from '../pptx/renderer';
import type { RenderContext } from '../renderers/types';

const state = vi.hoisted(() => ({ count: 2, hold: null as null | (() => void) }));

vi.mock('@aiden0z/pptx-renderer', () => ({
  RECOMMENDED_ZIP_LIMITS: {},
  parseZip: vi.fn(
    () =>
      new Promise(resolve => {
        const done = () => resolve({ presentation: '<p:presentation/>' });
        if (state.hold === null) done();
        else state.hold = done;
      })
  ),
  buildPresentation: vi.fn(() => ({
    width: 960,
    height: 540,
    slides: Array.from({ length: state.count }, (_, index) => ({ index })),
  })),
  renderSlide: vi.fn(() => ({ element: document.createElement('div'), ready: Promise.resolve(), dispose: () => undefined })),
}));

const t: RenderContext['t'] = (key, params) => (params ? `${key}:${Object.values(params).join('/')}` : key);
const zip = (size = 16) => {
  const out = new Uint8Array(size);
  out.set([0x50, 0x4b, 0x03, 0x04]);
  return out.buffer;
};
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  fileName: 'deck.pptx',
  fileType: 'pptx',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t,
  appContext: null,
  ...over,
});
const bars = (el: HTMLElement) => [...el.querySelectorAll('.yss-file-preview__notice-bar')].map(b => b.textContent);

describe('pptxNoticeOf', () => {
  it('页数：阈值 −1 / = 不提示，+1 提示（带千分位）', () => {
    expect(pptxNoticeOf(PPTX_WARN_SLIDES - 1, 0, undefined, t)).toBe('');
    expect(pptxNoticeOf(PPTX_WARN_SLIDES, 0, undefined, t)).toBe('');
    expect(pptxNoticeOf(PPTX_WARN_SLIDES + 1, 0, undefined, t)).toBe(`pptxLargeSlidesNotice:${PPTX_WARN_SLIDES + 1}`);
    expect(pptxNoticeOf(1234, 0, undefined, t, 'en-US')).toBe('pptxLargeSlidesNotice:1,234');
  });

  it('大小：恰好等于不提示，+1 提示；页数优先', () => {
    expect(pptxNoticeOf(1, 100, 100, t)).toBe('');
    expect(pptxNoticeOf(1, 101, 100, t)).toBe('pptxLargeSizeNotice:101 B');
    expect(pptxNoticeOf(PPTX_WARN_SLIDES + 1, 101, 100, t)).toMatch(/^pptxLargeSlidesNotice/);
  });

  it('异常值：页数 0 / 负数 / NaN / Infinity，阈值 0 / 负数 / NaN / Infinity / undefined 不按大小提示', () => {
    for (const n of [0, -1, Number.NaN, Infinity]) expect(pptxNoticeOf(n, 0, undefined, t)).toBe('');
    for (const w of [0, -1, Number.NaN, Infinity, undefined]) expect(pptxNoticeOf(1, 1e9, w, t)).toBe('');
  });
});

describe('pptx 渲染器：提示条', () => {
  afterEach(() => {
    state.count = 2;
    state.hold = null;
    document.body.innerHTML = '';
  });

  const render = async (over: Partial<RenderContext> = {}, size?: number) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const inst = createPptxRenderer().create();
    await inst.render(host, zip(size), ctx(over));
    return { host, inst };
  };

  it('页数超过阈值：列表上方一个提示条（role=status、固定在顶部），幻灯片照常显示', async () => {
    state.count = PPTX_WARN_SLIDES + 1;
    const { host, inst } = await render();
    const bar = host.querySelector('.yss-file-preview-pptx > .yss-file-preview__notice-bar')!;
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.classList.contains('yss-file-preview__notice-bar--sticky')).toBe(true);
    expect(bar.nextElementSibling?.classList.contains('yss-file-preview-pptx__list')).toBe(true);
    expect(host.querySelectorAll('.yss-file-preview-pptx__item')).toHaveLength(PPTX_WARN_SLIDES + 1);
    inst.destroy?.();
    expect(host.querySelector('.yss-file-preview__notice-bar')).toBeNull();
  });

  it('页数恰好等于阈值、文件不大：没有提示条', async () => {
    state.count = PPTX_WARN_SLIDES;
    const { host } = await render({ largeFileWarnSize: 1024 }, 1024);
    expect(bars(host)).toEqual([]);
  });

  it('文件超过 largeFileWarnSize：提示文件较大', async () => {
    const { host } = await render({ largeFileWarnSize: 1024 }, 1025);
    expect(bars(host)).toEqual(['pptxLargeSizeNotice:1.0 KB']);
  });

  it('没有幻灯片：显示空状态，不显示提示条（即使文件很大）', async () => {
    state.count = 0;
    const { host } = await render({ largeFileWarnSize: 1 }, 64);
    expect(bars(host)).toEqual([]);
    expect(host.querySelector('.yss-file-preview-pptx__empty')).not.toBeNull();
  });

  it('解析中切换 / 关闭（中止）：不插入提示条，不抛异常', async () => {
    state.count = PPTX_WARN_SLIDES + 5;
    state.hold = () => undefined;
    const host = document.createElement('div');
    const controller = new AbortController();
    const inst = createPptxRenderer().create();
    const p = inst.render(host, zip(), ctx({ signal: controller.signal }));
    await vi.waitFor(() => expect(state.hold).not.toBeNull());
    controller.abort();
    await expect(p).resolves.toBeUndefined();
    inst.destroy?.();
    expect(bars(host)).toEqual([]);
  });
});
