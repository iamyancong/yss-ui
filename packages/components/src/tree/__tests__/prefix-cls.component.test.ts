import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider } from 'ant-design-vue';
import { defineComponent, h, nextTick } from 'vue';
import YTree from '../index.vue';

const wrappers: VueWrapper[] = [];

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

describe('YTree 自定义 prefixCls', () => {
  it('在 ConfigProvider prefixCls="custom" 下同步树节点与选中态语义类名', async () => {
    const treeData = [
      {
        key: 'node-1',
        title: '节点一',
        children: [{ key: 'node-1-1', title: '子节点一' }],
      },
      {
        key: 'node-2',
        title: '节点二',
      },
    ];

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YTree, {
              treeData,
              defaultExpandAll: true,
              selectedKeys: ['node-1'],
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();
    await nextTick();

    expect(wrapper.find('.y-tree__spin.custom-spin-nested-loading').exists()).toBe(true);
    expect(wrapper.find('.y-tree__spin-container.custom-spin-container').exists()).toBe(true);
    expect(wrapper.find('.y-tree__tree.custom-tree').exists()).toBe(true);
    expect(wrapper.find('.y-tree__node-content.custom-tree-node-content-wrapper').exists()).toBe(true);
    expect(wrapper.find('.y-tree__node-selected.custom-tree-node-selected').exists()).toBe(true);
    expect(wrapper.find('.y-tree__node-title.custom-tree-title').exists()).toBe(true);
    expect(wrapper.find('.y-tree__switcher.custom-tree-switcher').exists()).toBe(true);
  });

  it('当业务传入 rootClassName="org-tree"（以 -tree 结尾）时，通过校验子节点避免误判前缀', async () => {
    const treeData = [{ key: 'node-1', title: '组织一' }];

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () =>
            h(YTree, {
              treeData,
              rootClassName: 'org-tree',
              selectedKeys: ['node-1'],
            })
          );
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);
    await nextTick();
    await nextTick();

    expect(wrapper.find('.y-tree__tree.custom-tree.org-tree').exists()).toBe(true);
    expect(wrapper.find('.y-tree__node-content.custom-tree-node-content-wrapper').exists()).toBe(true);
    expect(wrapper.find('.y-tree__node-selected.custom-tree-node-selected').exists()).toBe(true);
  });
});
