import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import YFileImport from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('YFileImport 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下为拖拽上传区域挂载 y-file-import__dragger 类名', async () => {
    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YFileImport, {
              modelValue: true,
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();
    await nextTick();

    const dragger = document.body.querySelector('div.y-file-import__dragger');
    expect(dragger).not.toBeNull();
    expect(dragger?.classList.contains('custom-upload')).toBe(true);
    expect(dragger?.classList.contains('custom-upload-drag')).toBe(true);
  });
});
