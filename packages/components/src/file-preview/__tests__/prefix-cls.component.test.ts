/**
 * 自定义 prefixCls：ConfigProvider 把 antd 前缀改成 custom 后，弹窗布局（标题栏、主体满高、全屏、翻页）照常。
 * 样式只依赖本组件自己的类名（见 utils/modalClasses.ts），这里确认这些类名在任意前缀下都在正确的节点上，
 * 并确认样式文件里没有写死 .ant- 选择器。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import YConfigProvider from '../../locale/config-provider/index.vue';
import FilePreviewModal from '../FilePreviewModal.vue';
import { useFilePreview } from '../useFilePreview';
import { defineComponent } from 'vue';
import { textBuffer } from './helpers';

const files = [
  { source: textBuffer('one'), fileName: 'a.txt' },
  { source: textBuffer('two'), fileName: 'b.txt' },
];

const mountModal = (prefixCls?: string) =>
  mount(
    {
      render: () =>
        h(ConfigProvider, prefixCls ? { prefixCls } : {}, () =>
          h(YConfigProvider, null, () => h(FilePreviewModal, { open: true, files }))
        ),
    },
    { attachTo: document.body }
  );

const wrap = () => document.querySelector<HTMLElement>('.yss-file-preview-modal')!;

/** 弹窗关键节点：本组件类名 + 当前前缀的 antd 类名同时存在 */
const expectLayout = (prefix: string) => {
  const dialog = wrap().querySelector<HTMLElement>('.yss-file-preview-modal__dialog')!;
  expect(dialog.classList.contains(`${prefix}-modal`)).toBe(true);
  const content = dialog.querySelector<HTMLElement>('.yss-file-preview-modal__content')!;
  expect(content.classList.contains(`${prefix}-modal-content`)).toBe(true);
  // happy-dom 不支持 :scope，按直接子节点查找
  const child = (parent: Element, cls: string) => [...parent.children].find(el => el.classList.contains(cls)) as HTMLElement;
  const titlebar = child(content, 'yss-file-preview-modal__titlebar');
  expect(titlebar.classList.contains(`${prefix}-modal-header`)).toBe(true);
  expect(titlebar.querySelector('.yss-file-preview-modal__header [data-nav="next"]')).not.toBeNull();
  const main = child(content, 'yss-file-preview-modal__main');
  expect(main.classList.contains(`${prefix}-modal-body`)).toBe(true);
  expect(child(child(main, 'yss-file-preview-modal__body'), 'yss-file-preview')).toBeTruthy();
  // 标题栏分隔线等颜色变量写在弹窗节点上，标题栏与主体都能继承
  expect(dialog.style.getPropertyValue('--yss-fpm-split')).not.toBe('');
};

describe('自定义 prefixCls', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prefixCls="custom"：标题栏 / 主体 / 内容节点都带本组件类名，没有残留 ant- 类名', async () => {
    const wrapper = mountModal('custom');
    await nextTick();
    expectLayout('custom');
    const leftovers = [...wrap().querySelectorAll('[class]')].flatMap(el =>
      [...el.classList].filter(name => /^ant-/.test(name))
    );
    expect(leftovers).toEqual([]);
    // 图标按钮：本组件类名 + custom 前缀的按钮
    const next = wrap().querySelector<HTMLButtonElement>('[data-nav="next"]')!;
    expect(next.classList.contains('yss-file-preview-modal__icon-btn')).toBe(true);
    expect(next.classList.contains('custom-btn')).toBe(true);
    wrapper.unmount();
  });

  it('prefixCls="custom"：翻页、全屏照常', async () => {
    const wrapper = mountModal('custom');
    await nextTick();
    const counter = () => wrap().querySelector('.yss-file-preview-modal__counter')!.textContent?.replace(/\s/g, '');
    expect(counter()).toBe('1/2');
    wrap().querySelector<HTMLButtonElement>('[data-nav="next"]')!.click();
    await nextTick();
    expect(counter()).toBe('2/2');
    expect(wrap().querySelector<HTMLButtonElement>('[data-nav="next"]')!.disabled).toBe(true);
    wrap().querySelector<HTMLButtonElement>('[data-tool="fullscreen"]')!.click();
    await nextTick();
    expect(wrap().classList.contains('yss-file-preview-modal--fullscreen')).toBe(true);
    expectLayout('custom');
    wrapper.unmount();
  });

  it('默认前缀与 useFilePreview 打开的弹窗结构一致', async () => {
    const wrapper = mountModal();
    await nextTick();
    expectLayout('ant');
    wrapper.unmount();

    const Caller = defineComponent({
      setup() {
        const preview = useFilePreview();
        return () => h('button', { class: 'open', onClick: () => preview.openList(files) });
      },
    });
    const host = mount({ render: () => h(ConfigProvider, { prefixCls: 'custom' }, () => h(Caller)) }, { attachTo: document.body });
    host.find('.open').trigger('click');
    await nextTick();
    await nextTick();
    expectLayout('custom');
    host.unmount();
  });

  it('样式文件不写死 antd 前缀（.ant-xxx 选择器）', () => {
    const less = readFileSync(resolve(__dirname, '../style.less'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(less.match(/\.ant-[\w-]+/g) ?? []).toEqual([]);
    expect(less).not.toMatch(/\.anticon\b/);
  });
});
