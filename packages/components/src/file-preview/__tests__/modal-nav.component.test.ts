import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGlobalLocale } from '../../locale/context';
import enUS from '../../locale/lang/en-US';
import zhCN from '../../locale/lang/zh-CN';
import FilePreviewModal from '../FilePreviewModal.vue';
import type { FilePreviewItem, UseFilePreviewReturn } from '../types';
import { useFilePreview } from '../useFilePreview';
import { textBuffer } from './helpers';

const makeFiles = (n: number): FilePreviewItem[] =>
  Array.from({ length: n }, (_, i) => ({ source: textBuffer(`content ${i + 1}`), fileName: `file-${i + 1}.txt` }));

const btn = (which: 'prev' | 'next') => document.querySelector<HTMLButtonElement>(`[data-nav="${which}"]`)!;
const counter = () => document.querySelector('.yss-file-preview-modal__counter')?.textContent?.trim();
const press = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const mountModal = (props: Record<string, unknown>) =>
  mount(FilePreviewModal, { props: { open: true, ...props }, attachTo: document.body });

describe('YFilePreviewModal 翻页按钮', () => {
  afterEach(() => {
    setGlobalLocale(zhCN);
    document.body.innerHTML = '';
  });

  it('首尾真正禁用：disabled + aria-disabled，可用按钮的 aria-label 带目标文件名', async () => {
    const wrapper = mountModal({ files: makeFiles(3) });
    await nextTick();
    expect(btn('prev').disabled).toBe(true);
    expect(btn('prev').getAttribute('aria-disabled')).toBe('true');
    expect(btn('prev').getAttribute('aria-label')).toBe('上一个文件');
    expect(btn('next').disabled).toBe(false);
    expect(btn('next').getAttribute('aria-disabled')).toBe('false');
    expect(btn('next').getAttribute('aria-label')).toBe('下一个：file-2.txt');
    expect(btn('next').hasAttribute('title')).toBe(false);

    await wrapper.setProps({ index: 2 });
    expect(btn('next').disabled).toBe(true);
    expect(btn('prev').getAttribute('aria-label')).toBe('上一个：file-2.txt');
    wrapper.unmount();
  });

  it('首尾时方向键与按钮点击都没有反应', async () => {
    const wrapper = mountModal({ files: makeFiles(3) });
    await nextTick();
    press('ArrowLeft');
    btn('prev').click();
    await nextTick();
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(counter()).toBe('1 / 3');

    press('ArrowRight');
    await nextTick();
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(1);
    await wrapper.setProps({ index: 2 });
    press('ArrowRight');
    await nextTick();
    expect(wrapper.emitted('update:index')?.every(([i]) => i !== 0)).toBe(true);
    wrapper.unmount();
  });

  it('loop=true：首尾相接，按钮始终可用', async () => {
    const wrapper = mountModal({ files: makeFiles(3), loop: true });
    await nextTick();
    expect(btn('prev').disabled).toBe(false);
    expect(btn('prev').getAttribute('aria-label')).toBe('上一个：file-3.txt');
    press('ArrowLeft');
    await nextTick();
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([2]);
    expect(counter()).toBe('3 / 3');
    btn('next').click();
    await nextTick();
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([0]);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toBe(0);
    wrapper.unmount();
  });

  it('loop=true 但只有一个文件：不显示翻页按钮', async () => {
    const wrapper = mountModal({ files: makeFiles(1), loop: true });
    await nextTick();
    expect(document.querySelector('.yss-file-preview-modal__nav')).toBeNull();
    press('ArrowRight');
    await nextTick();
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });

  it('悬停可用按钮显示目标文件名提示（英文）', async () => {
    setGlobalLocale(enUS);
    const wrapper = mountModal({ files: makeFiles(2) });
    await nextTick();
    btn('next').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.ant-tooltip-inner')?.textContent).toBe('Next: file-2.txt'), {
      timeout: 2000,
    });
    expect(btn('prev').getAttribute('aria-label')).toBe('Previous file');
    wrapper.unmount();
  });

  it('标题栏图标按钮颜色由主题 Token 注入', async () => {
    const wrapper = mountModal({ files: makeFiles(2) });
    await nextTick();
    const style = document.querySelector<HTMLElement>('.yss-file-preview-modal__header')!.style;
    for (const name of [
      'icon',
      'icon-hover',
      'icon-disabled',
      'icon-bg-hover',
      'icon-bg-active',
      'focus',
      'counter',
      'split',
    ]) {
      expect(style.getPropertyValue(`--yss-fpm-${name}`)).not.toBe('');
    }
    wrapper.unmount();
  });
});

describe('YFilePreviewModal 标题栏图标按钮与浮层', () => {
  afterEach(() => {
    setGlobalLocale(zhCN);
    document.body.innerHTML = '';
  });

  const hover = (el: Element) => el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  const visibleTip = () => document.querySelector('.ant-tooltip:not(.ant-tooltip-hidden)');

  it('全屏、下载、关闭为统一的图标按钮，关闭按钮前有分隔线，不再使用 Modal 自带的关闭按钮', async () => {
    const wrapper = mountModal({ files: makeFiles(2) });
    await nextTick();
    const tools = [...document.querySelectorAll('.yss-file-preview-modal__tools > *')];
    const kinds = tools.map(el =>
      el.classList.contains('yss-file-preview-modal__divider') ? 'divider' : el.getAttribute('data-tool')
    );
    expect(kinds).toEqual(['fullscreen', 'download', 'divider', 'close']);
    for (const el of document.querySelectorAll('[data-tool], [data-nav]')) {
      expect(el.classList.contains('yss-file-preview-modal__icon-btn')).toBe(true);
      expect(el.hasAttribute('title')).toBe(false);
    }
    expect(document.querySelector('.ant-modal-close')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-tool="close"]')!.click();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('提示挂在弹窗之上的浮层挂载层里（placement bottom），文案随语言切换', async () => {
    setGlobalLocale(enUS);
    const wrapper = mountModal({ files: makeFiles(2) });
    await nextTick();
    hover(document.querySelector('[data-tool="close"]')!);
    await vi.waitFor(() => expect(visibleTip()?.textContent).toBe('Close'), { timeout: 2000 });
    const layer = visibleTip()!.closest<HTMLElement>('.yss-file-preview-popup-layer');
    expect(layer).not.toBeNull();
    expect(layer!.parentElement).toBe(document.body);
    expect(Number(layer!.style.zIndex)).toBeGreaterThan(1000);
    hover(document.querySelector('[data-tool="fullscreen"]')!);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Fullscreen'), { timeout: 2000 });
    wrapper.unmount();
    expect(document.querySelector('.yss-file-preview-popup-layer')).toBeNull();
  });

  it('全屏时提示同样在挂载层里；设置 getContainer（如原生全屏元素）时挂载层跟随该容器', async () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const wrapper = mountModal({ files: makeFiles(2), getContainer: () => box });
    await nextTick();
    document.querySelector<HTMLButtonElement>('[data-tool="fullscreen"]')!.click();
    await nextTick();
    expect(document.querySelector('.yss-file-preview-modal--fullscreen')).not.toBeNull();
    hover(document.querySelector('[data-nav="next"]')!);
    await vi.waitFor(() => expect(visibleTip()).not.toBeNull(), { timeout: 2000 });
    const layer = visibleTip()!.closest('.yss-file-preview-popup-layer');
    expect(layer?.parentElement).toBe(box);
    wrapper.unmount();
  });

  it('文件切换下拉同样挂在浮层挂载层里', async () => {
    const wrapper = mountModal({ files: makeFiles(3) });
    await nextTick();
    document.querySelector<HTMLButtonElement>('.yss-file-preview-switcher')!.click();
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview-switcher__panel')).not.toBeNull());
    expect(
      document.querySelector('.yss-file-preview-switcher__panel')!.closest('.yss-file-preview-popup-layer')
    ).not.toBeNull();
    wrapper.unmount();
  });
});

describe('useFilePreview 的 loop 选项', () => {
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

  it('controller.next / prev 默认在首尾停住，loop 时循环', async () => {
    const { wrapper, api } = mountHost();
    const plain = api().openList(makeFiles(3), 2);
    await vi.waitFor(() => expect(counter()).toBe('3 / 3'));
    plain.next();
    await nextTick();
    expect(api().currentIndex.value).toBe(2);
    plain.prev();
    await vi.waitFor(() => expect(api().currentIndex.value).toBe(1));

    const looped = api().openList(makeFiles(3), 2, { loop: true });
    await vi.waitFor(() => expect(counter()).toBe('3 / 3'));
    looped.next();
    await vi.waitFor(() => expect(api().currentIndex.value).toBe(0));
    looped.prev();
    await vi.waitFor(() => expect(api().currentIndex.value).toBe(2));
    wrapper.unmount();
  });
});
