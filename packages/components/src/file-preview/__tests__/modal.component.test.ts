import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilePreviewModal from '../FilePreviewModal.vue';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import { pdfBuffer, textBuffer, trackObjectUrls } from './helpers';

const files = [
  { source: textBuffer('first'), fileName: 'one.txt' },
  { source: textBuffer('second'), fileName: 'two & <b>.txt' },
  { source: textBuffer('third'), fileName: 'three.txt' },
];

const press = (key: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

describe('YFilePreviewModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('标题显示原始文件名与序号，越界索引自动收敛', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 99 }, attachTo: document.body });
    await vi.waitFor(() => expect(document.body.textContent).toContain('three.txt'));
    expect(document.body.textContent).toContain('3 / 3');
    await wrapper.setProps({ index: 1 });
    await vi.waitFor(() => expect(document.body.textContent).toContain('two & <b>.txt'));
    wrapper.unmount();
  });

  it('方向键切换文件并触发 update:index / change', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 0 }, attachTo: document.body });
    await nextTick();
    press('ArrowRight');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([1]);
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(1);
    press('ArrowLeft');
    expect(wrapper.emitted('update:index')?.[1]).toEqual([0]);
    press('ArrowLeft');
    expect(wrapper.emitted('update:index')).toHaveLength(2);
    wrapper.unmount();
  });

  it('输入框内按方向键、keyboard=false、弹窗关闭时不切换', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('ArrowRight', input);
    expect(wrapper.emitted('update:index')).toBeUndefined();
    await wrapper.setProps({ keyboard: false });
    press('ArrowRight');
    expect(wrapper.emitted('update:index')).toBeUndefined();
    await wrapper.setProps({ keyboard: true, open: false });
    press('ArrowRight');
    expect(wrapper.emitted('update:index')).toBeUndefined();
    wrapper.unmount();
  });

  it('多个弹窗同时打开时只有最上层响应方向键', async () => {
    const bottom = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    const top = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    press('ArrowRight');
    expect(top.emitted('update:index')).toHaveLength(1);
    expect(bottom.emitted('update:index')).toBeUndefined();
    await top.setProps({ open: false });
    press('ArrowRight');
    expect(bottom.emitted('update:index')).toHaveLength(1);
    top.unmount();
    bottom.unmount();
  });

  it('全屏按钮切换全屏样式和 aria 状态', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="全屏"]')!;
    expect(button).not.toBeNull();
    button.click();
    await nextTick();
    expect(document.querySelector('.yss-file-preview-modal--fullscreen')).not.toBeNull();
    expect(document.querySelector('button[aria-label="退出全屏"]')?.getAttribute('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('翻页按钮在标题栏计数旁边，不覆盖内容区，首尾禁用', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 0 }, attachTo: document.body });
    await nextTick();
    const prev = document.querySelector<HTMLButtonElement>('button[data-nav="prev"]')!;
    const next = document.querySelector<HTMLButtonElement>('button[data-nav="next"]')!;
    const nav = document.querySelector('.yss-file-preview-modal__nav')!;
    // 按钮与计数都在标题栏里，内容区里没有任何翻页按钮
    expect(nav.closest('.yss-file-preview-modal__titlebar')).not.toBeNull();
    expect(nav.contains(prev) && nav.contains(next)).toBe(true);
    expect(nav.textContent).toContain('1 / 3');
    expect(document.querySelector('.yss-file-preview-modal__main button[data-nav]')).toBeNull();
    expect(prev.getAttribute('aria-label')).toBe('上一个文件');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.click();
    expect(wrapper.emitted('update:index')?.[0]).toEqual([1]);
    await wrapper.setProps({ index: 2 });
    // 禁用状态切换时 Tooltip 会重新包裹按钮，需要重新查询
    expect(document.querySelector<HTMLButtonElement>('button[data-nav="next"]')!.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('button[data-nav="prev"]')!.click();
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([1]);
    wrapper.unmount();
  });

  it('只有一个文件时不显示翻页按钮', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files: [files[0]] }, attachTo: document.body });
    await nextTick();
    expect(document.querySelector('.yss-file-preview-modal__nav')).toBeNull();
    wrapper.unmount();
  });

  it('焦点在自己处理方向键的区域（Excel 表格等）时不切换文件', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 1 }, attachTo: document.body });
    await nextTick();
    const grid = document.createElement('div');
    grid.dataset.previewKeyboard = 'self';
    const cell = document.createElement('canvas');
    grid.appendChild(cell);
    document.body.appendChild(grid);

    // 事件目标在表格内
    press('ArrowLeft', cell);
    expect(wrapper.emitted('update:index')).toBeUndefined();

    // x-spreadsheet 的画布不可聚焦：点进表格后，即使事件目标是 body 也不切换
    cell.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    press('ArrowLeft', document.body);
    expect(wrapper.emitted('update:index')).toBeUndefined();

    // role="grid" 同样视为自己处理方向键
    const roleGrid = document.createElement('div');
    roleGrid.setAttribute('role', 'grid');
    document.body.appendChild(roleGrid);
    press('ArrowRight', roleGrid);
    expect(wrapper.emitted('update:index')).toBeUndefined();

    // 点到表格外之后恢复方向键切换；Shift+方向键留给表格扩选
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    expect(wrapper.emitted('update:index')).toBeUndefined();
    press('ArrowLeft');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([0]);
    wrapper.unmount();
  });

  it('点击关闭按钮触发 update:open(false) 与 close', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    document.querySelector<HTMLButtonElement>('[data-tool="close"]')!.click();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('Esc 关闭弹窗', async () => {
    const wrapper = mount(FilePreviewModal, { props: { open: true, files }, attachTo: document.body });
    await nextTick();
    const wrap = document.querySelector('.ant-modal-wrap')!;
    wrap.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true } as KeyboardEventInit)
    );
    await nextTick();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('下载按钮下载当前文件，文件名保持原样', async () => {
    const urls = trackObjectUrls();
    const clicks: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download);
    });
    try {
      const wrapper = mount(FilePreviewModal, { props: { open: true, files, index: 1 }, attachTo: document.body });
      await vi.waitFor(() => expect(document.querySelector('pre')).not.toBeNull());
      document.querySelector<HTMLButtonElement>('button[aria-label="下载"]')!.click();
      expect(clicks).toEqual(['two & <b>.txt']);
      wrapper.unmount();
    } finally {
      clickSpy.mockRestore();
      urls.restore();
    }
  });

  it('PDF 由浏览器内置查看器显示时，标题栏不重复显示下载按钮', async () => {
    const urls = trackObjectUrls();
    const downloadBtn = () => document.querySelector('button[aria-label="下载"]');
    try {
      const wrapper = mount(FilePreviewModal, {
        props: {
          open: true,
          files: [
            { source: pdfBuffer(), fileName: 'a.pdf' },
            { source: textBuffer('t'), fileName: 'b.txt' },
            { source: pdfBuffer(), fileName: 'no-extension' },
          ],
        },
        attachTo: document.body,
      });
      await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
      expect(downloadBtn()).toBeNull();
      // 允许下载时不隐藏内置查看器工具栏
      expect(document.querySelector('iframe')!.getAttribute('src')).not.toContain('toolbar=0');
      await wrapper.setProps({ index: 1 });
      await vi.waitFor(() => expect(document.querySelector('pre')).not.toBeNull());
      expect(downloadBtn()).not.toBeNull();
      // 无后缀文件按内容识别为 PDF 后同样隐藏
      await wrapper.setProps({ index: 2 });
      await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
      await vi.waitFor(() => expect(downloadBtn()).toBeNull());
      wrapper.unmount();
    } finally {
      urls.restore();
    }
  });

  it('showDownload=false 时 PDF 追加 #toolbar=0&navpanes=0', async () => {
    const urls = trackObjectUrls();
    try {
      const wrapper = mount(FilePreviewModal, {
        props: { open: true, showDownload: false, files: [{ source: pdfBuffer(), fileName: 'a.pdf' }] },
        attachTo: document.body,
      });
      await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
      expect(document.querySelector('iframe')!.getAttribute('src')).toMatch(/#toolbar=0&navpanes=0$/);
      wrapper.unmount();
    } finally {
      urls.restore();
    }
  });

  it('注册了自定义 pdf 渲染器时保留标题栏下载按钮', async () => {
    registerPreviewRenderer({
      types: ['pdf'],
      create: () => ({
        async render(container) {
          container.textContent = 'custom pdf';
        },
      }),
    });
    try {
      const wrapper = mount(FilePreviewModal, {
        props: { open: true, files: [{ source: pdfBuffer(), fileName: 'a.pdf' }] },
        attachTo: document.body,
      });
      await vi.waitFor(() => expect(document.body.textContent).toContain('custom pdf'));
      expect(document.querySelector('button[aria-label="下载"]')).not.toBeNull();
      wrapper.unmount();
    } finally {
      unregisterPreviewRenderer('pdf');
    }
  });

  it('关闭后销毁预览内容并释放 PDF 的 Blob URL', async () => {
    const urls = trackObjectUrls();
    try {
      const wrapper = mount(FilePreviewModal, {
        props: { open: true, files: [{ source: pdfBuffer(), fileName: 'a.pdf' }] },
        attachTo: document.body,
      });
      await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).not.toBeNull());
      expect(urls.live.size).toBe(1);
      await wrapper.setProps({ open: false });
      await vi.waitFor(() => expect(document.querySelector('iframe.yss-file-preview-pdf')).toBeNull());
      wrapper.unmount();
      expect(urls.live.size).toBe(0);
      expect(urls.revoke).toHaveBeenCalledTimes(1);
    } finally {
      urls.restore();
    }
  });
});
