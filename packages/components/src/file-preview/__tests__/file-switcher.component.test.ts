import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, toRaw } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGlobalLocale } from '../../locale/context';
import enUS from '../../locale/lang/en-US';
import zhCN from '../../locale/lang/zh-CN';
import FilePreviewModal from '../FilePreviewModal.vue';
import { clearCustomRenderers, registerPreviewRenderer } from '../renderers/registry';
import type { FilePreviewItem, UseFilePreviewReturn } from '../types';
import { useFilePreview } from '../useFilePreview';
import { resolveItemSize, splitFileName } from '../utils/item';
import { fileKindOf, fileSupportOf, resolveItemType } from '../utils/kind';
import { textBuffer } from './helpers';

const makeFiles = (n: number, name = (i: number) => `file-${i + 1}.txt`): FilePreviewItem[] =>
  Array.from({ length: n }, (_, i) => ({ source: textBuffer(`content ${i + 1}`), fileName: name(i) }));

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const trigger = () => $<HTMLButtonElement>('.yss-file-preview-switcher');
const options = () => $$('.yss-file-preview-switcher__option');
const panel = () => $('.yss-file-preview-switcher__panel');
const key = (target: EventTarget, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const openPanel = async () => {
  trigger()!.click();
  await vi.waitFor(() => expect(panel()).not.toBeNull());
  await nextTick();
};

const mountModal = (props: Record<string, unknown>) =>
  mount(FilePreviewModal, { props: { open: true, ...props }, attachTo: document.body });

describe('文件名与类型工具', () => {
  it('splitFileName 保留后缀，异常名称整体作为主体', () => {
    expect(splitFileName('季度报告.final.pptx')).toEqual({ stem: '季度报告.final', ext: '.pptx' });
    expect(splitFileName('README')).toEqual({ stem: 'README', ext: '' });
    expect(splitFileName('.env')).toEqual({ stem: '.env', ext: '' });
    expect(splitFileName('a.')).toEqual({ stem: 'a.', ext: '' });
    expect(splitFileName('x.verylongextension')).toEqual({ stem: 'x.verylongextension', ext: '' });
  });

  it('resolveItemSize：fileSize 优先，其次 Blob / ArrayBuffer，URL 与懒加载未知', () => {
    expect(resolveItemSize({ source: 'https://x/a.pdf', fileSize: 2048 })).toBe(2048);
    expect(resolveItemSize({ source: new Blob(['abc']) })).toBe(3);
    expect(resolveItemSize({ source: new ArrayBuffer(5) })).toBe(5);
    expect(resolveItemSize({ source: 'https://x/a.pdf' })).toBeUndefined();
    expect(resolveItemSize({ source: async () => 'u', fileSize: -1 })).toBeUndefined();
    expect(resolveItemSize(undefined)).toBeUndefined();
  });

  it('类别与支持情况：自定义渲染器、pptx 需注册、旧格式、未知', () => {
    expect(resolveItemType({ source: 'a', fileName: 'A.JPEG' })).toBe('jpg');
    expect(resolveItemType({ source: 'a', fileName: 'a.bin', fileType: 'PDF' })).toBe('pdf');
    expect(resolveItemType({ source: async () => 'u' })).toBe('');
    expect(fileKindOf('xlsx')).toBe('excel');
    expect(fileKindOf('weird')).toBe('unknown');
    expect(fileSupportOf('docx')).toBe('supported');
    expect(fileSupportOf('pptx')).toBe('unsupported');
    expect(fileSupportOf('doc')).toBe('legacy');
    expect(fileSupportOf('')).toBe('unknown');
    registerPreviewRenderer({ types: ['pptx'], create: () => ({ render: async () => undefined }) });
    expect(fileSupportOf('pptx')).toBe('supported');
    clearCustomRenderers();
  });
});

describe('YFilePreviewModal 文件切换下拉', () => {
  afterEach(() => {
    clearCustomRenderers();
    setGlobalLocale(zhCN);
    document.body.innerHTML = '';
  });

  it('一个文件、设置 title、fileSwitcher=false 时显示普通标题', async () => {
    const one = mountModal({ files: makeFiles(1) });
    await nextTick();
    expect(trigger()).toBeNull();
    expect($('.yss-file-preview-modal__name')?.textContent).toBe('file-1.txt');
    one.unmount();

    const titled = mountModal({ files: makeFiles(3), title: '附件' });
    await nextTick();
    expect(trigger()).toBeNull();
    expect($('.yss-file-preview-modal__name')?.textContent).toBe('附件');
    titled.unmount();

    const off = mountModal({ files: makeFiles(3), fileSwitcher: false });
    await nextTick();
    expect(trigger()).toBeNull();
    expect(document.body.textContent).toContain('1 / 3');
    off.unmount();
  });

  it('两个及以上文件：无边框触发器显示图标、文件名（保留后缀）和箭头，保留翻页', async () => {
    const wrapper = mountModal({ files: makeFiles(2, i => `很长的文件名-${i}.docx`), index: 1 });
    await nextTick();
    const btn = trigger()!;
    expect(btn.getAttribute('aria-haspopup')).toBe('listbox');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('当前文件：很长的文件名-1.docx（第 2 个，共 2 个），点击切换文件');
    expect(btn.querySelector('.yss-file-preview-switcher__stem')?.textContent).toBe('很长的文件名-1');
    expect(btn.querySelector('.yss-file-preview-switcher__ext')?.textContent).toBe('.docx');
    expect(btn.querySelector('[data-kind="word"]')).not.toBeNull();
    expect(btn.querySelector('.yss-file-preview-switcher__chevron')).not.toBeNull();
    expect(document.body.textContent).toContain('2 / 2');
    expect($('button[data-nav="prev"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('下拉列出全部文件：当前项选中打勾，显示大小与不支持 / 需转换标记', async () => {
    const files: FilePreviewItem[] = [
      { source: textBuffer('12345'), fileName: 'a.txt' },
      { source: 'https://example.com/b.pdf', fileName: 'b.pdf', fileSize: 1536 },
      { source: 'https://example.com/c.pptx' },
      { source: 'https://example.com/d.doc' },
      { source: async () => textBuffer('x') },
    ];
    const wrapper = mountModal({ files, index: 1 });
    await openPanel();
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
    const rows = options();
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(rows[1].querySelector('.yss-file-preview-switcher__check')).not.toBeNull();
    expect(rows[0].textContent).toContain('5 B');
    expect(rows[1].textContent).toContain('1.5 KB');
    expect(rows[2].textContent).toContain('c.pptx');
    expect(rows[2].textContent).toContain('不支持预览');
    expect(rows[2].classList.contains('is-muted')).toBe(true);
    expect(rows[3].textContent).toContain('需转换后预览');
    // 懒加载且没有文件名：显示「未命名文件」，不标记
    expect(rows[4].textContent).toContain('未命名文件');
    expect(rows[4].querySelector('.yss-file-preview-switcher__meta')).toBeNull();
    expect(rows[1].getAttribute('aria-label')).toBe('b.pdf, 1.5 KB, 2 / 5');
    // 少于 10 个文件不显示搜索框，列表获得焦点
    expect($('.yss-file-preview-switcher__search')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('listbox'));
    wrapper.unmount();
  });

  it('注册 pptx 渲染器后不再标记不支持', async () => {
    registerPreviewRenderer({ types: ['pptx'], create: () => ({ render: async () => undefined }) });
    const wrapper = mountModal({ files: [...makeFiles(1), { source: 'https://example.com/c.pptx' }] });
    await openPanel();
    expect(options()[1].textContent).not.toContain('不支持预览');
    wrapper.unmount();
  });

  it('点击文件切换，触发 update:index / change 并关闭下拉；点当前文件只关闭', async () => {
    const wrapper = mountModal({ files: makeFiles(4), index: 0 });
    await openPanel();
    options()[0].click();
    await nextTick();
    expect(wrapper.emitted('update:index')).toBeUndefined();
    await openPanel();
    options()[2].click();
    expect(wrapper.emitted('update:index')?.[0]).toEqual([2]);
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(2);
    await vi.waitFor(() => expect(trigger()!.getAttribute('aria-expanded')).toBe('false'));
    wrapper.unmount();
  });

  it('键盘：↓ 打开，↑ ↓ Home End 移动，Enter / 空格选择，焦点回到触发器', async () => {
    const wrapper = mountModal({ files: makeFiles(5), index: 1 });
    await nextTick();
    key(trigger()!, 'ArrowDown');
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    const list = () => $('.yss-file-preview-switcher__list')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(list()));
    const focused = () => $('.yss-file-preview-switcher__option.is-focused')?.getAttribute('title');
    expect(focused()).toBe('file-2.txt');
    expect(list().getAttribute('aria-activedescendant')).toBe($('.is-focused')!.id);
    key(list(), 'ArrowDown');
    await nextTick();
    expect(focused()).toBe('file-3.txt');
    key(list(), 'End');
    await nextTick();
    expect(focused()).toBe('file-5.txt');
    key(list(), 'ArrowDown');
    await nextTick();
    expect(focused()).toBe('file-5.txt');
    key(list(), 'Home');
    await nextTick();
    expect(focused()).toBe('file-1.txt');
    key(list(), 'ArrowUp');
    key(list(), 'PageDown');
    await nextTick();
    expect(focused()).toBe('file-5.txt');
    key(list(), 'PageUp');
    await nextTick();
    expect(focused()).toBe('file-1.txt');
    key(list(), 'Enter');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([0]);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));

    key(trigger()!, 'ArrowUp');
    await vi.waitFor(() => expect(document.activeElement).toBe(list()));
    key(list(), 'ArrowDown');
    key(list(), ' ');
    expect(wrapper.emitted('update:index')?.[1]).toEqual([1]);
    wrapper.unmount();
  });

  it('下拉内 Esc 只关闭下拉，不关闭弹窗、不退出全屏；左右键不切换文件', async () => {
    const wrapper = mountModal({ files: makeFiles(3), index: 1 });
    await nextTick();
    $<HTMLButtonElement>('button[aria-label="全屏"]')!.click();
    await nextTick();
    await openPanel();
    const list = $('.yss-file-preview-switcher__list')!;
    key(list, 'ArrowLeft');
    key(list, 'ArrowRight');
    expect(wrapper.emitted('update:index')).toBeUndefined();
    key(list, 'Escape');
    await vi.waitFor(() => expect(trigger()!.getAttribute('aria-expanded')).toBe('false'));
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect($('.yss-file-preview-modal--fullscreen')).not.toBeNull();
    // 下拉已关闭：Esc 回到原有顺序（先退出全屏）
    key(window, 'Escape');
    await nextTick();
    expect($('.yss-file-preview-modal--fullscreen')).toBeNull();
    // 触发器上的左右键仍按弹窗规则切换文件
    key(trigger()!, 'ArrowRight');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([2]);
    wrapper.unmount();
  });

  it('keyboard=false 时下拉仍可用键盘操作，Tab 关闭下拉', async () => {
    const wrapper = mountModal({ files: makeFiles(3), keyboard: false });
    await nextTick();
    key(trigger()!, 'ArrowDown');
    const list = () => $('.yss-file-preview-switcher__list')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(list()));
    key(list(), 'Tab');
    await vi.waitFor(() => expect(trigger()!.getAttribute('aria-expanded')).toBe('false'));
    key(trigger()!, 'ArrowDown');
    await vi.waitFor(() => expect(document.activeElement).toBe(list()));
    key(list(), 'ArrowDown');
    key(list(), 'Enter');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([1]);
    wrapper.unmount();
  });

  it('10 个及以上文件显示搜索框：过滤、无结果提示、Enter 选择第一个匹配项', async () => {
    const wrapper = mountModal({ files: makeFiles(100), index: 57 });
    await openPanel();
    const input = () => $<HTMLInputElement>('.yss-file-preview-switcher__search input')!;
    expect(input()).not.toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(input()));
    expect(options()).toHaveLength(100);
    expect($('.is-focused')?.getAttribute('title')).toBe('file-58.txt');
    expect(input().getAttribute('aria-activedescendant')).toBe($('.is-focused')!.id);

    input().value = 'file-9';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(options().map(o => o.getAttribute('title'))).toEqual(
      ['file-9.txt', ...Array.from({ length: 10 }, (_, i) => `file-${90 + i}.txt`)]
    );
    expect($('.is-focused')?.getAttribute('title')).toBe('file-9.txt');
    // 输入框里的 Home / End / 空格属于输入框
    key(input(), 'End');
    key(input(), ' ');
    expect(wrapper.emitted('update:index')).toBeUndefined();

    input().value = 'zzz';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(options()).toHaveLength(0);
    expect($('.yss-file-preview-switcher__empty')?.textContent?.trim()).toBe('没有匹配的文件');
    key(input(), 'Enter');
    expect(wrapper.emitted('update:index')).toBeUndefined();

    input().value = 'FILE-12';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    key(input(), 'Enter');
    expect(wrapper.emitted('update:index')?.[0]).toEqual([11]);
    wrapper.unmount();
  });

  it('重复文件名分别列出，按位置选择', async () => {
    const files = makeFiles(3, () => 'report.txt');
    const wrapper = mountModal({ files, index: 0 });
    await openPanel();
    expect(options().map(o => o.getAttribute('title'))).toEqual(['report.txt', 'report.txt', 'report.txt']);
    expect(options()[2].getAttribute('aria-label')).toBe('report.txt, 9 B, 3 / 3');
    options()[2].click();
    expect(toRaw(wrapper.emitted('change')?.[0]?.[1])).toBe(files[2]);
    wrapper.unmount();
  });

  it('加载中切换文件：中止上一个文件的懒加载', async () => {
    const signals: AbortSignal[] = [];
    const pending = ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise<ArrayBuffer>(() => undefined);
    };
    const files: FilePreviewItem[] = [
      { source: pending, fileName: 'slow.txt' },
      { source: textBuffer('fast'), fileName: 'fast.txt' },
    ];
    const wrapper = mountModal({ files, index: 0 });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    await openPanel();
    options()[1].click();
    await vi.waitFor(() => expect(signals[0].aborted).toBe(true));
    await vi.waitFor(() => expect(document.body.textContent).toContain('fast'));
    wrapper.unmount();
  });

  it('英文界面的无障碍名称与搜索提示', async () => {
    setGlobalLocale(enUS);
    const wrapper = mountModal({ files: makeFiles(12), index: 0 });
    await nextTick();
    expect(trigger()!.getAttribute('aria-label')).toBe('Current file: file-1.txt (1 of 12). Click to switch files');
    await openPanel();
    expect($('.yss-file-preview-switcher__list')!.getAttribute('aria-label')).toBe('File list, 12 files');
    expect($('.yss-file-preview-switcher__search input')!.getAttribute('placeholder')).toBe('Search file names');
    wrapper.unmount();
  });

  it('列表变化（删除文件）后下拉内容同步，剩一个文件时恢复普通标题', async () => {
    const files = makeFiles(3);
    const wrapper = mountModal({ files, index: 2 });
    await nextTick();
    await wrapper.setProps({ files: files.slice(0, 2) });
    await nextTick();
    expect(trigger()!.getAttribute('aria-label')).toContain('第 2 个，共 2 个');
    await wrapper.setProps({ files: files.slice(0, 1) });
    await nextTick();
    expect(trigger()).toBeNull();
    wrapper.unmount();
  });
});

describe('useFilePreview 与文件切换', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mountHost = () => {
    let api!: UseFilePreviewReturn;
    const Host = defineComponent({
      setup() {
        api = useFilePreview();
        return () => h('div');
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });
    return { wrapper, api: () => api };
  };

  it('openList 默认显示文件切换下拉，切换时触发 onChange；fileSwitcher=false 关闭', async () => {
    const { wrapper, api } = mountHost();
    const onChange = vi.fn();
    api().openList(makeFiles(3), 0, { onChange });
    await vi.waitFor(() => expect(trigger()).not.toBeNull());
    await openPanel();
    options()[2].click();
    await vi.waitFor(() => expect(api().currentIndex.value).toBe(2));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }));

    api().openList(makeFiles(3), 0, { fileSwitcher: false });
    await vi.waitFor(() => expect(trigger()).toBeNull());
    expect(document.body.textContent).toContain('1 / 3');
    wrapper.unmount();
  });
});
