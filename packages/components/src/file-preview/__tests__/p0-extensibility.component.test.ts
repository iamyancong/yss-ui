import { mount } from '@vue/test-utils';
import { defineComponent, h, inject, isReadonly, nextTick, toRaw } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '../index.vue';
import FilePreviewModal from '../FilePreviewModal.vue';
import { downloadFile } from '../hooks/useFileData';
import type {
  FilePreviewContext,
  FilePreviewController,
  FilePreviewDownloadContext,
  FilePreviewItem,
  FileSourceLoaderContext,
  UseFilePreviewReturn,
} from '../types';
import { useFilePreview } from '../useFilePreview';
import { pdfBuffer, textBuffer, trackObjectUrls } from './helpers';

const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const content = () => document.querySelector('.yss-file-preview-text__content')?.textContent ?? '';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 记录 <a> 点击：download 属性与 target */
function spyLinks() {
  const clicks: Array<{ href: string; download: string; target: string }> = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download, target: this.target });
  });
  return { clicks, restore: () => spy.mockRestore() };
}

function mountHost(provide: Record<string, unknown> = {}) {
  let api!: UseFilePreviewReturn;
  const Host = defineComponent({
    setup() {
      api = useFilePreview();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { attachTo: document.body, global: { provide } });
  return { wrapper, api: () => api };
}

let urls: ReturnType<typeof trackObjectUrls>;
beforeEach(() => {
  urls = trackObjectUrls();
});
afterEach(() => {
  urls.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('懒加载来源 FileSourceLoader', () => {
  it('只在显示时调用，收到原对象，切回时使用缓存，reload 重新调用', async () => {
    const loader = vi.fn(async ({ file }: FileSourceLoaderContext) => textBuffer(`content-${file.id as string}`));
    const files: FilePreviewItem[] = [
      { source: loader, fileName: 'a.txt', id: 'a' },
      { source: loader, fileName: 'b.txt', id: 'b' },
    ];
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await vi.waitFor(() => expect(content()).toBe('content-a'));
    expect(loader).toHaveBeenCalledTimes(1);
    // mount 的 props 是响应式的，元素是原对象的代理
    expect(toRaw(loader.mock.calls[0][0].file)).toBe(files[0]);
    expect(loader.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);

    press('ArrowRight');
    await vi.waitFor(() => expect(content()).toBe('content-b'));
    press('ArrowLeft');
    await vi.waitFor(() => expect(content()).toBe('content-a'));
    expect(loader).toHaveBeenCalledTimes(2);

    await (wrapper.vm as unknown as { reload: () => Promise<void> }).reload();
    expect(loader).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('快速切换时中止上一个请求，迟到的结果不会显示', async () => {
    const slow = deferred<ArrayBuffer>();
    let slowSignal: AbortSignal | undefined;
    const files = [
      {
        fileName: 'slow.txt',
        source: ({ signal }: FileSourceLoaderContext) => {
          slowSignal = signal;
          return slow.promise;
        },
      },
      { fileName: 'fast.txt', source: async () => textBuffer('fast') },
    ];
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await vi.waitFor(() => expect(slowSignal).toBeDefined());
    press('ArrowRight');
    await vi.waitFor(() => expect(content()).toBe('fast'));
    expect(slowSignal!.aborted).toBe(true);
    slow.resolve(textBuffer('slow'));
    await new Promise(r => setTimeout(r, 20));
    expect(content()).toBe('fast');
    wrapper.unmount();
  });

  it('关闭弹窗时中止进行中的请求', async () => {
    let signal: AbortSignal | undefined;
    const files = [
      {
        fileName: 'a.txt',
        source: (ctx: FileSourceLoaderContext) => {
          signal = ctx.signal;
          return new Promise<ArrayBuffer>(() => undefined);
        },
      },
    ];
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await vi.waitFor(() => expect(signal).toBeDefined());
    await wrapper.setProps({ open: false });
    await vi.waitFor(() => expect(signal!.aborted).toBe(true));
    wrapper.unmount();
  });

  it('loader 抛错进入错误状态并触发 error(err, ctx)；返回内容超限时提示过大', async () => {
    const files = [
      { fileName: 'bad.txt', source: async () => Promise.reject(new Error('无权限')) },
      { fileName: 'big.txt', source: async () => new ArrayBuffer(2048) },
    ];
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, maxSize: 1024 }, attachTo: document.body });
    await vi.waitFor(() => expect(wrapper.emitted('error')).toBeDefined());
    const [error, ctx] = wrapper.emitted('error')![0] as [Error, FilePreviewContext];
    expect(error.message).toBe('无权限');
    expect(toRaw(ctx.file)).toBe(files[0]);
    expect(ctx.index).toBe(0);
    expect(document.body.textContent).toContain('无权限');
    press('ArrowRight');
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview--oversize')).not.toBeNull());
    wrapper.unmount();
  });

  it('YFilePreview 单独使用：loader 返回字符串按 URL 加载', async () => {
    const fetchMock = vi.fn(async () => new Response('from-url', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(FilePreview, {
      props: { source: async () => 'https://files.example.com/signed/a.txt?token=1', fileName: 'a.txt' },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(content()).toBe('from-url'));
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.com/signed/a.txt?token=1', expect.anything());
    wrapper.unmount();
  });
});

describe('customDownload 与默认下载', () => {
  it('不调用 defaultDownload 就不下载；调用后保存已读取的内容；可传入新来源', async () => {
    const links = spyLinks();
    const calls: FilePreviewDownloadContext[] = [];
    let allow = false;
    const files = [{ source: textBuffer('hello'), fileName: 'a.txt', id: 1 }];
    const wrapper = mount(FilePreviewModal, {
      props: {
        open: true,
        files,
        customDownload: async ctx => {
          calls.push(ctx);
          if (allow) await ctx.defaultDownload();
        },
      },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(content()).toBe('hello'));
    const button = () => document.querySelector<HTMLButtonElement>('button[aria-label="下载"]')!;
    button().click();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(links.clicks).toHaveLength(0);
    expect(toRaw(calls[0].file)).toBe(files[0]);
    expect(calls[0].index).toBe(0);
    expect(calls[0].total).toBe(1);
    expect(new TextDecoder().decode(calls[0].data!)).toBe('hello');

    allow = true;
    button().click();
    await vi.waitFor(() => expect(links.clicks).toHaveLength(1));
    expect(links.clicks[0]).toMatchObject({ download: 'a.txt' });
    expect(links.clicks[0].href).toMatch(/^blob:/);

    await calls[1].defaultDownload('/signed/a.txt?sig=1', 'renamed.txt');
    expect(links.clicks[1].href).toContain('/signed/a.txt?sig=1');
    expect(links.clicks[1].download).toBe('renamed.txt');
    links.restore();
    wrapper.unmount();
  });

  it('配置 customDownload 时 PDF 隐藏内置工具栏，标题栏显示下载按钮', async () => {
    const wrapper = mount(FilePreviewModal, {
      props: { open: true, files: [{ source: pdfBuffer(), fileName: 'a.pdf' }], customDownload: () => undefined },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
    expect(document.querySelector('iframe')!.getAttribute('src')).toMatch(/#toolbar=0&navpanes=0$/);
    expect(document.querySelector('button[aria-label="下载"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('默认下载：跨域 URL 先 fetch 成 Blob，失败时新标签页打开；同源直接下载', async () => {
    const links = spyLinks();
    const fetchMock = vi.fn(async () => new Response('x', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await downloadFile('https://cdn.example.com/a.txt', 'a.txt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(links.clicks[0].href).toMatch(/^blob:/);
    expect(links.clicks[0].download).toBe('a.txt');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await downloadFile('https://cdn.example.com/b.txt', 'b.txt');
    expect(links.clicks[1]).toMatchObject({ href: 'https://cdn.example.com/b.txt', download: '', target: '_blank' });

    await downloadFile('/files/c.txt', 'c.txt');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(links.clicks[2].download).toBe('c.txt');

    await downloadFile('https://cdn.example.com/huge.zip', 'huge.zip', { preferLink: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(links.clicks[3].target).toBe('_blank');

    await downloadFile(async () => new Blob(['lazy']), 'lazy.txt');
    expect(links.clicks[4].download).toBe('lazy.txt');
    links.restore();
  });

  it('YFilePreview 单独使用时 customDownload 收到单文件上下文', async () => {
    const custom = vi.fn();
    const wrapper = mount(FilePreview, {
      props: { source: textBuffer('a'), fileName: 'a.txt', customDownload: custom },
      attachTo: document.body,
    });
    await vi.waitFor(() => expect(content()).toBe('a'));
    await (wrapper.vm as unknown as { download: () => Promise<void> }).download();
    const ctx = custom.mock.calls[0][0] as FilePreviewDownloadContext;
    expect(ctx).toMatchObject({ index: 0, total: 1, status: 'ready' });
    expect(ctx.file.fileName).toBe('a.txt');
    wrapper.unmount();
  });
});

describe('YFilePreviewModal 事件、插槽、列表变化', () => {
  const makeFiles = () => [
    { source: textBuffer('one'), fileName: 'one.txt', id: 1 },
    { source: textBuffer('two'), fileName: 'two.txt', id: 2 },
    { source: textBuffer('three'), fileName: 'three.txt', id: 3 },
  ];

  it('转发 loaded / unsupported，change 给出原对象和上下文', async () => {
    const files = [...makeFiles(), { source: textBuffer('x'), fileName: 'x.ppt' }];
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await vi.waitFor(() => expect(wrapper.emitted('loaded')).toBeDefined());
    const [payload, ctx] = wrapper.emitted('loaded')![0] as [unknown, FilePreviewContext];
    expect(payload).toEqual({ fileName: 'one.txt', fileType: 'txt' });
    expect(toRaw(ctx.file)).toBe(files[0]);
    expect(ctx.status).toBe('ready');

    press('ArrowRight');
    const [index, file, changeCtx] = wrapper.emitted('change')![0] as [number, FilePreviewItem, FilePreviewContext];
    expect(index).toBe(1);
    expect(toRaw(file)).toBe(files[1]);
    expect(changeCtx.index).toBe(1);

    await wrapper.setProps({ index: 3 });
    await vi.waitFor(() => expect(wrapper.emitted('unsupported')).toBeDefined());
    expect(toRaw((wrapper.emitted('unsupported')![0] as [string, FilePreviewContext])[1].file)).toBe(files[3]);
    wrapper.unmount();
  });

  it('#actions 插槽拿到上下文，可以翻页、关闭', async () => {
    const files = makeFiles();
    const wrapper = mount(FilePreviewModal, {
      props: { open: true, files },
      slots: {
        actions: (ctx: FilePreviewContext) =>
          h('button', { class: 'biz-next', onClick: ctx.next }, `${ctx.file.id as number}/${ctx.total}`),
      },
      attachTo: document.body,
    });
    await nextTick();
    const btn = () => document.querySelector<HTMLButtonElement>('.biz-next')!;
    expect(btn().textContent).toBe('1/3');
    btn().click();
    await nextTick();
    expect(wrapper.emitted('update:index')?.[0]).toEqual([1]);
    expect(btn().textContent).toBe('2/3');
    wrapper.unmount();
  });

  it('删除当前文件：停在原下标并触发 change；删最后一个时收敛下标；删光后关闭', async () => {
    const files = makeFiles();
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 1 }, attachTo: document.body });
    await nextTick();
    await wrapper.setProps({ files: files.filter(f => f.id !== 2) });
    expect(wrapper.emitted('update:index')).toBeUndefined();
    expect(toRaw(wrapper.emitted('change')?.[0]?.[1])).toBe(files[2]);

    await wrapper.setProps({ files: [files[0]] });
    expect(wrapper.emitted('update:index')?.[0]).toEqual([0]);
    expect(toRaw(wrapper.emitted('change')?.[1]?.[1])).toBe(files[0]);

    await wrapper.setProps({ files: [] });
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('打开时不触发 change；重新赋值同样内容的列表也不触发', async () => {
    const files = makeFiles();
    const wrapper = mount(FilePreviewModal, { props: { open: false, files }, attachTo: document.body });
    await wrapper.setProps({ open: true });
    await wrapper.setProps({ files: [...files] });
    const raw = [textBuffer('r')];
    await wrapper.setProps({ files: raw });
    await wrapper.setProps({ files: [...raw] });
    expect(wrapper.emitted('change')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('useFilePreview 控制句柄与回调', () => {
  it('返回只读状态；回调 onChange / onLoaded / onError / onClose', async () => {
    const { wrapper, api } = mountHost();
    expect(isReadonly(api().visible)).toBe(true);
    expect(isReadonly(api().fileList)).toBe(true);
    expect(isReadonly(api().currentIndex)).toBe(true);
    const onChange = vi.fn();
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    const files = [
      { source: textBuffer('a'), fileName: 'a.txt' },
      { source: async () => Promise.reject(new Error('boom')), fileName: 'b.txt' },
    ];
    const ctrl = api().openList(files, 0, { onChange, onLoaded, onError, onClose });
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect((onLoaded.mock.calls[0][1] as FilePreviewContext).file).toBe(files[0]);
    ctrl.next();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect((onChange.mock.calls[0][0] as FilePreviewContext).index).toBe(1);
    expect(ctrl.index).toBe(1);
    ctrl.close();
    expect(onClose).toHaveBeenCalledWith(1);
    await expect(ctrl.afterClose).resolves.toBe(1);
    wrapper.unmount();
  });

  it('controller.update 删除当前文件后切到下一个，删光自动关闭并 resolve afterClose', async () => {
    const { wrapper, api } = mountHost();
    const onChange = vi.fn();
    let files: FilePreviewItem[] = [
      { source: textBuffer('a'), fileName: 'a.txt' },
      { source: textBuffer('b'), fileName: 'b.txt' },
    ];
    const ctrl: FilePreviewController = api().openList(files, 0, { onChange });
    await vi.waitFor(() => expect(content()).toBe('a'));

    files = files.slice(1);
    ctrl.update(files);
    await vi.waitFor(() => expect(content()).toBe('b'));
    expect((onChange.mock.calls[0][0] as FilePreviewContext).file).toBe(files[0]);
    expect(api().fileList.value).toHaveLength(1);

    ctrl.update([]);
    await expect(ctrl.afterClose).resolves.toBe(0);
    expect(api().visible.value).toBe(false);
    wrapper.unmount();
  });

  it('update 指定下标；再次 open 替换时上一次的 afterClose 结束，旧句柄失效', async () => {
    const { wrapper, api } = mountHost();
    const first = api().openList([textBuffer('a'), textBuffer('b'), textBuffer('c')], 0);
    first.update([textBuffer('x'), textBuffer('y')], 5);
    expect(api().currentIndex.value).toBe(1);
    const second = api().open(textBuffer('z'), { fileName: 'z.txt' });
    await expect(first.afterClose).resolves.toBe(1);
    first.close();
    expect(api().visible.value).toBe(true);
    second.close();
    await expect(second.afterClose).resolves.toBe(0);
    wrapper.unmount();
  });

  it('slots.actions 在调用方 appContext 中渲染（可以 inject app.provide 的值）', async () => {
    const Injected = defineComponent({
      setup() {
        const value = inject<string>('biz-token', 'none');
        return () => h('span', { class: 'biz-injected' }, value);
      },
    });
    const { wrapper, api } = mountHost({ 'biz-token': 'from-app' });
    const ctrl = api().openList([textBuffer('a'), textBuffer('b')], 0, {
      slots: { actions: ctx => [h(Injected), h('em', { class: 'biz-index' }, String(ctx.index))] },
    });
    await vi.waitFor(() => expect(document.querySelector('.biz-injected')?.textContent).toBe('from-app'));
    expect(document.querySelector('.biz-index')?.textContent).toBe('0');
    ctrl.goTo(1);
    await nextTick();
    expect(document.querySelector('.biz-index')?.textContent).toBe('1');
    wrapper.unmount();
  });
});
