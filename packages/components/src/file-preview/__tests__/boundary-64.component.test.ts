/**
 * #64 大文件直接预览：Word 的页数 / 大小提示条（恰好等于 / ±1）、外壳显示渲染器报告的解析进度、
 * 进度在切换文件 / 渲染完成后不再生效。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGlobalLocale } from '../../locale/context';
import zhCN from '../../locale/lang/zh-CN';
import { DOCX_WARN_PAGES } from '../constant';
import { createStoredZip } from '../excel/zip';
import FilePreview from '../index.vue';
import { docxRenderer } from '../renderers/docx';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import type { RenderContext } from '../renderers/types';
import { textBuffer } from './helpers';

vi.mock('docx-preview', () => ({
  renderAsync: async (_data: ArrayBuffer, host: HTMLElement) => {
    const section = document.createElement('section');
    section.className = 'yss-file-preview-docx-doc';
    section.textContent = 'page';
    host.appendChild(section);
  },
}));

const docx = (pages?: number, pad = 0) =>
  createStoredZip([
    ['word/document.xml', `<w:document>${' '.repeat(pad)}</w:document>`],
    ...(pages === undefined
      ? []
      : ([['docProps/app.xml', `<Properties><Pages>${pages}</Pages></Properties>`]] as Array<[string, string]>)),
  ]);

describe('Word：直接预览，页数较多 / 文件较大时上方显示提示条', () => {
  const ctx = (extra: Partial<RenderContext> = {}): RenderContext => ({
    fileName: 'a.docx',
    fileType: 'docx',
    textEncoding: 'auto',
    signal: new AbortController().signal,
    t: (key, params) => `${key}${params ? JSON.stringify(params) : ''}`,
    appContext: null,
    locale: 'en-US',
    largeFileWarnSize: 10 << 20,
    ...extra,
  });
  const barsOf = async (data: ArrayBuffer, extra: Partial<RenderContext> = {}) => {
    const container = document.createElement('div');
    const instance = docxRenderer.create();
    await instance.render(container, data, ctx(extra));
    const bars = [...container.querySelectorAll('.yss-file-preview__notice-bar')];
    expect(container.querySelector('section')).not.toBeNull();
    instance.destroy?.();
    return bars;
  };

  it.each([
    [DOCX_WARN_PAGES - 1, false],
    [DOCX_WARN_PAGES, false],
    [DOCX_WARN_PAGES + 1, true],
  ])('%i 页 → 提示 %s（恰好等于不提示）', async (pages, expected) => {
    const bars = await barsOf(docx(pages));
    expect(bars.length).toBe(expected ? 1 : 0);
    if (expected) {
      expect(bars[0].textContent).toBe(`docxLargePagesNotice{"pages":"${pages}"}`);
      // 滚动时固定在顶部，放在页面前面
      expect(bars[0].classList.contains('yss-file-preview__notice-bar--sticky')).toBe(true);
      expect(bars[0].parentElement!.firstElementChild).toBe(bars[0]);
      expect(bars[0].getAttribute('role')).toBe('status');
    }
  });

  it('文件大小：恰好等于 largeFileWarnSize 不提示，少 1 字节提示；Infinity / 未传不提示', async () => {
    const data = docx(undefined, 2000);
    expect(await barsOf(data, { largeFileWarnSize: data.byteLength })).toHaveLength(0);
    expect(await barsOf(data, { largeFileWarnSize: data.byteLength + 1 })).toHaveLength(0);
    const bars = await barsOf(data, { largeFileWarnSize: data.byteLength - 1 });
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toMatch(/^docxLargeSizeNotice/);
    expect(await barsOf(data, { largeFileWarnSize: Infinity })).toHaveLength(0);
    expect(await barsOf(data, { largeFileWarnSize: undefined })).toHaveLength(0);
  });

  it('页数与大小都超过：只显示页数提示', async () => {
    const data = docx(DOCX_WARN_PAGES + 50, 2000);
    const bars = await barsOf(data, { largeFileWarnSize: 1 });
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toMatch(/^docxLargePagesNotice/);
  });

  it('组件：301 页直接显示（ready），提示条为中文', async () => {
    setGlobalLocale(zhCN);
    const w = mount(FilePreview, { props: { source: docx(DOCX_WARN_PAGES + 1), fileName: 'a.docx' } });
    for (let i = 0; i < 50 && !w.classes().includes('yss-file-preview--ready'); i++) {
      await new Promise(r => setTimeout(r, 10));
      await flushPromises();
    }
    expect(w.classes()).toContain('yss-file-preview--ready');
    expect(w.find('.yss-file-preview__notice-bar').text()).toBe(
      `文档较长（约 ${DOCX_WARN_PAGES + 1} 页），滚动可能略慢`
    );
    w.unmount();
  });
});

describe('解析进度', () => {
  afterEach(() => {
    unregisterPreviewRenderer('slow');
    setGlobalLocale(zhCN);
  });

  /** 渲染时先报告进度，等 release 后完成；返回的 report 可在之后继续报告 */
  const install = () => {
    const sessions: Array<{ report: (v: number) => void; release: () => void }> = [];
    registerPreviewRenderer({
      types: ['slow'],
      create: () => ({
        render: (container, _data, context) =>
          new Promise<void>(resolve => {
            sessions.push({
              report: v => context.onProgress?.(v),
              release: () => {
                container.textContent = 'done';
                resolve();
              },
            });
          }),
      }),
    });
    return sessions;
  };

  it('加载中显示「正在解析 N%」（向下取整），完成后不再显示；完成后再报告不生效', async () => {
    setGlobalLocale(zhCN);
    const sessions = install();
    const w = mount(FilePreview, { props: { source: textBuffer('x'), fileName: 'a.slow' } });
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--loading');
    sessions[0].report(0.456);
    await flushPromises();
    expect(w.text()).toContain('正在解析 45%');
    // 无效值忽略，超过 1 按 100%
    sessions[0].report(NaN);
    await flushPromises();
    expect(w.text()).toContain('正在解析 45%');
    sessions[0].report(7);
    await flushPromises();
    expect(w.text()).toContain('正在解析 100%');
    sessions[0].release();
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--ready');
    sessions[0].report(0.5);
    await flushPromises();
    expect(w.text()).not.toContain('正在解析');
    w.unmount();
  });

  it('切换文件后，旧文件的进度不影响新文件的加载提示；卸载后报告不抛错', async () => {
    setGlobalLocale(zhCN);
    const sessions = install();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = mount(FilePreview, { props: { source: textBuffer('a'), fileName: 'a.slow' } });
    await flushPromises();
    sessions[0].report(0.9);
    await w.setProps({ source: textBuffer('b'), fileName: 'b.slow' });
    await flushPromises();
    expect(sessions).toHaveLength(2);
    expect(w.text()).not.toContain('正在解析');
    sessions[0].report(0.95);
    await flushPromises();
    expect(w.text()).not.toContain('正在解析 95%');
    sessions[1].report(0.1);
    await flushPromises();
    expect(w.text()).toContain('正在解析 10%');
    w.unmount();
    sessions[1].report(0.2);
    sessions[1].release();
    sessions[0].release();
    await flushPromises();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
