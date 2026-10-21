import { mount } from '@vue/test-utils';
import { ConfigProvider, theme } from 'ant-design-vue';
import { defineComponent, h, inject, nextTick, provide, type Component } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import YConfigProvider from '../../locale/config-provider/index.vue';
import enUS from '../../locale/lang/en-US';
import type { FilePreviewItem, UseFilePreviewReturn } from '../types';
import { useFilePreview } from '../useFilePreview';
import { textBuffer } from './helpers';

const files = (n = 2): FilePreviewItem[] =>
  Array.from({ length: n }, (_, i) => ({ source: textBuffer(`c${i}`), fileName: `file-${i + 1}.txt` }));

const BIZ_KEY = Symbol('biz');

/** 调用 useFilePreview 的业务组件；可选在 hook 之后再 provide */
const createCaller = (onReady: (api: UseFilePreviewReturn) => void, lateProvide?: string) =>
  defineComponent({
    setup() {
      const api = useFilePreview();
      if (lateProvide) provide(BIZ_KEY, lateProvide);
      onReady(api);
      return () => h('div', { class: 'caller' });
    },
  });

/** 在任意包裹组件里挂载调用方 */
const mountWithin = (wrap: (child: Component) => ReturnType<typeof h>, lateProvide?: string) => {
  let api!: UseFilePreviewReturn;
  const Caller = createCaller(value => (api = value), lateProvide);
  const Root = defineComponent({ setup: () => () => wrap(Caller) });
  const wrapper = mount(Root, { attachTo: document.body });
  return { wrapper, api: () => api };
};

const headerVar = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLElement>('.yss-file-preview-modal__header')?.style.getPropertyValue(name);

describe('useFilePreview 继承调用方上下文', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('外层 ConfigProvider 的暗色算法作用到弹窗（Token 变量为暗色值）', async () => {
    const { wrapper, api } = mountWithin(child =>
      h(ConfigProvider, { theme: { algorithm: theme.darkAlgorithm } }, () => h(child))
    );
    api().openList(files(), 0);
    await vi.waitFor(() => expect(headerVar('--yss-fpm-icon-hover')).toBeTruthy());
    expect(headerVar('--yss-fpm-icon-hover')).toBe('rgba(255, 255, 255, 0.85)');
    wrapper.unmount();
  });

  it('局部亮色 ConfigProvider 为亮色 Token', async () => {
    const { wrapper, api } = mountWithin(child =>
      h(ConfigProvider, { theme: { algorithm: theme.defaultAlgorithm } }, () => h(child))
    );
    api().openList(files(), 0);
    await vi.waitFor(() => expect(headerVar('--yss-fpm-icon-hover')).toBeTruthy());
    expect(headerVar('--yss-fpm-icon-hover')).toBe('rgba(0, 0, 0, 0.88)');
    wrapper.unmount();
  });

  it('ConfigProvider 的 prefixCls、direction 作用到弹窗', async () => {
    const { wrapper, api } = mountWithin(child =>
      h(ConfigProvider, { prefixCls: 'biz', direction: 'rtl' }, () => h(child))
    );
    api().openList(files(), 0);
    await vi.waitFor(() => expect(document.querySelector('.biz-modal')).not.toBeNull());
    expect(document.querySelector('.biz-modal-wrap-rtl, .biz-modal-rtl')).not.toBeNull();
    expect(document.querySelector('.biz-btn')).not.toBeNull();
    wrapper.unmount();
  });

  it('YConfigProvider 的 en-US 语言包作用到弹窗文案', async () => {
    const { wrapper, api } = mountWithin(child => h(YConfigProvider, { locale: enUS }, () => h(child)));
    api().openList(files(), 0);
    await vi.waitFor(() => expect(document.querySelector('[data-tool="close"]')).not.toBeNull());
    expect(document.querySelector('[data-tool="close"]')?.getAttribute('aria-label')).toBe('Close');
    expect(document.querySelector('[data-nav="next"]')?.getAttribute('aria-label')).toBe('Next: file-2.txt');
    wrapper.unmount();
  });

  it('slots 里的组件能 inject 到调用方位置（含祖先与 hook 之后）provide 的值', async () => {
    const Probe = defineComponent({
      setup() {
        const ancestor = inject<string>('ancestor', 'none');
        const late = inject<string>(BIZ_KEY, 'none');
        return () => h('span', { class: 'probe' }, `${ancestor}|${late}`);
      },
    });
    const Ancestor = defineComponent({
      setup(_, { slots }) {
        provide('ancestor', 'from-ancestor');
        return () => slots.default?.();
      },
    });
    const { wrapper, api } = mountWithin(child => h(Ancestor, null, () => h(child)), 'from-caller');
    api().openList(files(), 0, { slots: { actions: () => h(Probe) } });
    await vi.waitFor(() => expect(document.querySelector('.probe')).not.toBeNull());
    expect(document.querySelector('.probe')?.textContent).toBe('from-ancestor|from-caller');
    wrapper.unmount();
  });

  it('调用方卸载时弹窗、挂载层一并移除', async () => {
    const { wrapper, api } = mountWithin(child => h(child));
    const controller = api().openList(files(3), 1);
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview-modal')).not.toBeNull());
    // 悬停一次翻页按钮，创建浮层挂载层
    document.querySelector('[data-nav="next"]')!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview-popup-layer')).not.toBeNull(), {
      timeout: 2000,
    });
    wrapper.unmount();
    await nextTick();
    expect(document.querySelector('.yss-file-preview-modal')).toBeNull();
    expect(document.querySelector('.yss-file-preview-popup-layer')).toBeNull();
    await expect(controller.afterClose).resolves.toBe(1);
  });

  it('多个调用方各自继承自己的上下文，互不影响', async () => {
    let zh!: UseFilePreviewReturn;
    let en!: UseFilePreviewReturn;
    const ZhCaller = createCaller(v => (zh = v));
    const EnCaller = createCaller(v => (en = v));
    const Root = defineComponent({
      setup: () => () =>
        h('div', [
          h(ConfigProvider, { theme: { algorithm: theme.darkAlgorithm } }, () => h(ZhCaller)),
          // 不包 ConfigProvider 的树会回退到 antd 全局最近一次的主题，这里显式给亮色
          h(ConfigProvider, { theme: { algorithm: theme.defaultAlgorithm } }, () =>
            h(YConfigProvider, { locale: enUS }, () => h(EnCaller))
          ),
        ]),
    });
    const wrapper = mount(Root, { attachTo: document.body });
    zh.openList(files(), 0);
    en.openList(files(), 0);
    await vi.waitFor(() => expect(document.querySelectorAll('[data-tool="close"]').length).toBe(2), { timeout: 2000 });
    const labels = [...document.querySelectorAll('[data-tool="close"]')].map(el => el.getAttribute('aria-label'));
    expect(labels.sort()).toEqual(['Close', '关闭']);
    const headers = [...document.querySelectorAll<HTMLElement>('.yss-file-preview-modal__header')];
    const hover = headers.map(el => el.style.getPropertyValue('--yss-fpm-icon-hover'));
    expect(new Set(hover).size).toBe(2);
    zh.close();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-tool="close"]').length).toBe(1), { timeout: 2000 });
    expect(document.querySelector('[data-tool="close"]')?.getAttribute('aria-label')).toBe('Close');
    wrapper.unmount();
  });

  it('在 setup 之外调用时给出开发提示，仍可打开', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = useFilePreview();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('useFilePreview() 应在组件 setup 中调用'));
    api.openList(files(), 0);
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview-modal')).not.toBeNull());
    api.close();
    await vi.waitFor(() => expect(document.querySelector('.yss-file-preview-modal')).toBeNull(), { timeout: 2000 });
  });
});
