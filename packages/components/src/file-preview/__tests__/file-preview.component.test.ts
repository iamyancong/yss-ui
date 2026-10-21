import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGlobalLocale } from '../../locale/context';
import enUS from '../../locale/lang/en-US';
import zhCN from '../../locale/lang/zh-CN';
import FilePreview from '../index.vue';
import { clearCustomRenderers, registerPreviewRenderer } from '../renderers/registry';
import type { PreviewRenderer, RenderContext } from '../renderers/types';
import { pdfBuffer, textBuffer, trackObjectUrls } from './helpers';

/** 可控的自定义渲染器：render 在 release 被调用前一直挂起 */
function createDeferredRenderer(type: string) {
  const pending: Array<{ release: () => void; container: HTMLElement; ctx: RenderContext }> = [];
  const destroyed: string[] = [];
  const renderer: PreviewRenderer = {
    types: [type],
    create() {
      let name = '';
      return {
        render(container, data, ctx) {
          name = ctx.fileName;
          return new Promise<void>(resolve => {
            pending.push({
              container,
              ctx,
              release: () => {
                container.textContent = `${ctx.fileName}:${new TextDecoder().decode(data)}`;
                resolve();
              },
            });
          });
        },
        destroy() {
          destroyed.push(name);
        },
      };
    },
  };
  return { renderer, pending, destroyed };
}

describe('YFilePreview', () => {
  afterEach(() => {
    clearCustomRenderers();
    setGlobalLocale(zhCN);
  });

  it('0 字节文件显示空文件提示', async () => {
    const wrapper = mount(FilePreview, { props: { source: new Blob([]), fileName: 'empty.pdf' } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('文件内容为空'));
    expect(wrapper.text()).toContain('仍要下载');
  });

  it('改了后缀的文件显示内容不符', async () => {
    const wrapper = mount(FilePreview, { props: { source: textBuffer('plain'), fileName: 'fake.docx' } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('文件内容与类型不符'));
    expect(wrapper.text()).toContain('docx');
  });

  it('超过 maxSize 时不读取文件内容', async () => {
    const blob = new Blob([new Uint8Array(100)]);
    const spy = vi.spyOn(blob, 'arrayBuffer');
    const wrapper = mount(FilePreview, { props: { source: blob, fileName: 'big.txt', maxSize: 10 } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('文件过大'));
    expect(wrapper.text()).toContain('100 B');
    expect(spy).not.toHaveBeenCalled();
  });

  it('doc 文件提示不支持并触发 unsupported', async () => {
    const wrapper = mount(FilePreview, {
      props: { source: Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]).buffer, fileName: 'old.doc' },
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain('暂不支持预览 doc 格式'));
    expect(wrapper.emitted('unsupported')?.[0]).toEqual(['doc']);
    // 旧版办公格式给出“后端转 PDF”的建议
    expect(wrapper.text()).toContain('doc 是旧版办公格式');
    expect(wrapper.text()).toContain('转换为 PDF');
  });

  it('未启用的 pptx 显示「暂不支持」并提示如何启用', async () => {
    const pptx = textBuffer('PK\u0003\u0004..ppt/presentation.xml');
    const wrapper = mount(FilePreview, { props: { source: pptx, fileName: 'deck.pptx' } });
    await vi.waitFor(() => expect(wrapper.emitted('unsupported')?.[0]).toEqual(['pptx']));
    expect(wrapper.text()).toContain('暂不支持预览 pptx 格式');
    expect(wrapper.text()).toContain('需安装 @aiden0z/pptx-renderer 并调用 registerPptxRenderer() 启用（实验性）');
    expect(wrapper.emitted('error')).toBeUndefined();
  });

  it('ppt 同样提示转换，非办公格式保持通用提示', async () => {
    const ppt = mount(FilePreview, {
      props: { source: Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]).buffer, fileName: 'deck.ppt' },
    });
    await vi.waitFor(() => expect(ppt.text()).toContain('ppt 是旧版办公格式'));
    const zip = mount(FilePreview, { props: { source: textBuffer('hello'), fileName: 'a.zip' } });
    await vi.waitFor(() => expect(zip.emitted('unsupported')?.[0]).toEqual(['zip']));
    expect(zip.text()).not.toContain('旧版办公格式');
  });

  it('URL 加载失败时显示 HTTP 状态并可重试', async () => {
    const fetchMock = vi.fn(async () => new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = mount(FilePreview, { props: { source: 'https://example.com/a.pdf' } });
      await vi.waitFor(() => expect(wrapper.text()).toContain('HTTP 404'));
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      await wrapper.findAll('button')[0]!.trigger('click');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('URL 的 Content-Length 超限时不读取内容', async () => {
    const response = new Response('x', { headers: { 'content-length': String(50 * 1024 * 1024) } });
    const readSpy = vi.spyOn(response, 'arrayBuffer');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response)
    );
    try {
      const wrapper = mount(FilePreview, { props: { source: 'https://example.com/big.pdf' } });
      await vi.waitFor(() => expect(wrapper.text()).toContain('文件过大'));
      expect(readSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('渲染文本并触发 loaded，文件名不做二次转义', async () => {
    const wrapper = mount(FilePreview, { props: { source: textBuffer('hello'), fileName: 'a&b <1>.txt' } });
    await vi.waitFor(() => expect(wrapper.emitted('loaded')).toBeTruthy());
    expect(wrapper.emitted('loaded')![0]).toEqual([{ fileName: 'a&b <1>.txt', fileType: 'txt' }]);
    expect(wrapper.find('pre').text()).toBe('hello');
    expect((wrapper.vm as unknown as { getFileName: () => string }).getFileName()).toBe('a&b <1>.txt');
  });

  it('快速切换文件时，旧文件的渲染结果不会覆盖新文件', async () => {
    const { renderer, pending, destroyed } = createDeferredRenderer('slow');
    registerPreviewRenderer(renderer);
    // 自定义格式：后缀 .slow 由注册的渲染器处理
    const wrapper = mount(FilePreview, { props: { source: textBuffer('A'), fileName: 'a.slow' } });
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const first = pending[pending.length - 1]!;

    await wrapper.setProps({ source: textBuffer('B'), fileName: 'b.slow' });
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(1));
    const second = pending[pending.length - 1]!;

    expect(first.ctx.signal.aborted).toBe(true);
    expect(destroyed).toContain('a.slow');
    second.release();
    first.release();
    await vi.waitFor(() => expect(wrapper.emitted('loaded')).toBeTruthy());

    const content = wrapper.find('.yss-file-preview__content');
    expect(content.findAll('.yss-file-preview__host')).toHaveLength(1);
    expect(content.text()).toBe('b.slow:B');
    expect(wrapper.emitted('loaded')).toHaveLength(1);
  });

  it('加载中卸载组件：中止渲染并清理 DOM', async () => {
    const { renderer, pending, destroyed } = createDeferredRenderer('slow');
    registerPreviewRenderer(renderer);
    const wrapper = mount(FilePreview, {
      props: { source: textBuffer('A'), fileName: 'a.slow', fileType: 'slow' },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    wrapper.unmount();
    expect(pending[0]!.ctx.signal.aborted).toBe(true);
    expect(destroyed).toEqual(['a.slow']);
    expect(document.querySelector('.yss-file-preview__host')).toBeNull();
  });

  it('同时存在多个 PDF 预览时互不影响，卸载后释放全部 Blob URL', async () => {
    const urls = trackObjectUrls();
    try {
      const a = mount(FilePreview, { props: { source: pdfBuffer(), fileName: 'a.pdf' } });
      const b = mount(FilePreview, { props: { source: pdfBuffer(), fileName: 'b.pdf' } });
      await vi.waitFor(() => expect(a.find('iframe').exists() && b.find('iframe').exists()).toBe(true));
      b.unmount();
      expect(a.find('iframe').exists()).toBe(true);
      expect(urls.live.size).toBe(1);
      a.unmount();
      expect(urls.live.size).toBe(0);
    } finally {
      urls.restore();
    }
  });

  it('修改 textEncoding 会重新渲染', async () => {
    const gbk = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]).buffer;
    const wrapper = mount(FilePreview, { props: { source: gbk, fileName: 'a.txt', textEncoding: 'utf-8' } });
    await vi.waitFor(() => expect(wrapper.find('pre').exists()).toBe(true));
    expect(wrapper.find('pre').text()).toContain('\uFFFD');
    await wrapper.setProps({ textEncoding: 'gbk' });
    await vi.waitFor(() => expect(wrapper.find('pre').text()).toBe('中文'));
  });

  it('跟随全局语言切换为英文', async () => {
    setGlobalLocale(enUS);
    const wrapper = mount(FilePreview, { props: { source: new Blob([]), fileName: 'empty.txt' } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Empty file'));
    expect(wrapper.text()).toContain('Download anyway');
  });

  it('height 支持数字', () => {
    const wrapper = mount(FilePreview, { props: { source: '', height: 320 } });
    expect(wrapper.attributes('style')).toContain('height: 320px');
  });
});
