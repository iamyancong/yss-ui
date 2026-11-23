import { flushPromises, mount } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '../index.vue';
import { clearPasswordCache } from '../utils/password-cache';
import { loadFixture } from './helpers';

vi.mock('../renderers/registry', async () => {
  const actual = await vi.importActual<typeof import('../renderers/registry')>('../renderers/registry');
  return {
    ...actual,
    getRenderer: vi.fn(async (type: string) => {
      if (type !== 'xlsx') return actual.getRenderer(type);
      return {
        types: ['xlsx'],
        create: () => ({
          render: vi.fn(async () => undefined),
          destroy: vi.fn(),
        }),
      };
    }),
  };
});

describe('YFilePreview 加密文档密码', { timeout: 25_000 }, () => {
  afterEach(() => {
    clearPasswordCache();
    vi.clearAllMocks();
  });

  it('加密 xlsx 显示密码输入而不是内容不符', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
      },
    });
    await flushPromises();
    expect(wrapper.classes()).toContain('yss-file-preview--password-required');
    expect(wrapper.text()).toContain('文档已加密');
    expect(wrapper.text()).toContain('请输入密码打开文档');
    expect(wrapper.text()).not.toContain('文件内容与类型不符');
    // 标题栏已有下载，密码卡内不再重复下载入口
    expect(wrapper.find('.yss-file-preview__password-download').exists()).toBe(false);
    wrapper.unmount();
  }, 15_000);

  it('密码错误时提示并保持输入态', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
      },
    });
    await flushPromises();
    const exposed = wrapper.vm as unknown as { submitPassword: (password: string) => Promise<boolean> };
    const ok = await exposed.submitPassword('wrong');
    await flushPromises();
    expect(ok).toBe(false);
    expect(wrapper.classes()).toContain('yss-file-preview--password-required');
    expect(wrapper.text()).toContain('密码错误');
    wrapper.unmount();
  }, 20_000);

  it('正确密码后进入预览', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
      },
    });
    await flushPromises();
    expect(wrapper.classes()).toContain('yss-file-preview--password-required');

    const exposed = wrapper.vm as unknown as { submitPassword: (password: string) => Promise<boolean> };
    const ok = await exposed.submitPassword('yss-test');
    await flushPromises();

    expect(ok).toBe(true);
    expect(wrapper.classes()).toContain('yss-file-preview--ready');
    expect(wrapper.emitted('loaded')?.[0]?.[0]).toMatchObject({ fileType: 'xlsx' });
    wrapper.unmount();
  }, 15_000);

  it('传入 password 时直接解锁，不展示密码框', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
        password: 'yss-test',
      },
    });
    await vi.waitFor(
      () => {
        expect(wrapper.classes()).toContain('yss-file-preview--ready');
      },
      { timeout: 15_000 }
    );
    expect(wrapper.text()).not.toContain('文档已加密');
    expect(wrapper.emitted('loaded')?.[0]?.[0]).toMatchObject({ fileType: 'xlsx' });
    wrapper.unmount();
  }, 20_000);

  it('传入的 password 错误时落到输入态并提示', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
        password: 'wrong-password',
      },
    });
    await vi.waitFor(
      () => {
        expect(wrapper.classes()).toContain('yss-file-preview--password-required');
      },
      { timeout: 15_000 }
    );
    expect(wrapper.text()).toContain('密码错误');
    wrapper.unmount();
  }, 20_000);

  it('默认记住密码：卸载后再打开同一文件自动解锁', async () => {
    const source = loadFixture('xlsx-encrypted.xlsx');
    const first = mount(FilePreview, { props: { source, fileName: 'secret.xlsx' } });
    await flushPromises();
    const exposed = first.vm as unknown as { submitPassword: (password: string) => Promise<boolean> };
    expect(await exposed.submitPassword('yss-test')).toBe(true);
    await flushPromises();
    first.unmount();

    const second = mount(FilePreview, { props: { source, fileName: 'secret.xlsx' } });
    await vi.waitFor(
      () => {
        expect(second.classes()).toContain('yss-file-preview--ready');
      },
      { timeout: 15_000 }
    );
    second.unmount();
  }, 25_000);

  it('rememberPassword=false 时每次都要重新输入', async () => {
    const source = loadFixture('xlsx-encrypted.xlsx');
    const first = mount(FilePreview, {
      props: { source, fileName: 'secret.xlsx', rememberPassword: false },
    });
    await flushPromises();
    const exposed = first.vm as unknown as { submitPassword: (password: string) => Promise<boolean> };
    expect(await exposed.submitPassword('yss-test')).toBe(true);
    await flushPromises();
    first.unmount();

    const second = mount(FilePreview, {
      props: { source, fileName: 'secret.xlsx', rememberPassword: false },
    });
    await flushPromises();
    expect(second.classes()).toContain('yss-file-preview--password-required');
    second.unmount();
  }, 20_000);

  it('密码卡无顶部装饰条，主色跟随 ConfigProvider colorPrimary', async () => {
    const Host = defineComponent({
      setup: () => () =>
        h(ConfigProvider, { theme: { token: { colorPrimary: '#f5222d' } } }, () =>
          h(FilePreview, {
            source: loadFixture('xlsx-encrypted.xlsx'),
            fileName: 'secret.xlsx',
          })
        ),
    });
    const wrapper = mount(Host);
    await flushPromises();

    const root = wrapper.find('.yss-file-preview');
    expect(root.classes()).toContain('yss-file-preview--password-required');
    expect((root.element as HTMLElement).style.getPropertyValue('--yss-file-preview-primary').toLowerCase()).toBe(
      '#f5222d'
    );

    const card = wrapper.find('.yss-file-preview__password-card').element;
    expect(getComputedStyle(card, '::before').content).toMatch(/^(none)?$/);

    wrapper.unmount();
  });

  it('密码框禁用浏览器密码管理器嗅探并支持点击眼睛切换掩码', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        source: loadFixture('xlsx-encrypted.xlsx'),
        fileName: 'secret.xlsx',
      },
    });
    await flushPromises();

    const inputWrap = wrapper.find('.yss-file-preview__password-input');
    const input = inputWrap.find('input');
    expect(input.attributes('type')).toBe('text');
    expect(input.attributes('autocomplete')).toBe('off');
    expect(inputWrap.classes()).toContain('yss-file-preview__password-input--masked');

    await wrapper.find('.yss-file-preview__password-toggle').trigger('click');
    expect(inputWrap.classes()).not.toContain('yss-file-preview__password-input--masked');

    await wrapper.find('.yss-file-preview__password-toggle').trigger('click');
    expect(inputWrap.classes()).toContain('yss-file-preview__password-input--masked');

    wrapper.unmount();
  });
});
