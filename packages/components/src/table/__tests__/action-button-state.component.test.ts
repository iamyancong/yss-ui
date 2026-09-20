import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { Popconfirm } from 'ant-design-vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionButton from '../ActionButton.vue';

/** 模拟外部权限存储变化，不依赖 Vue 的响应式更新。 */
const authorization = vi.hoisted(() => ({ granted: true }));
vi.mock('@yss-ui/utils', () => ({ hasAuth: (code: string) => authorization.granted && code !== 'denied' }));

/** 记录组件，确保真实 Ant Design Vue 浮层随测试清理。 */
const wrappers: VueWrapper[] = [];
/** 挂载真实确认组件。 */
const createButton = (config = {}) => {
  const wrapper = mount(ActionButton, {
    props: { scope: { row: { id: 1 } }, config: { text: '删除', isConfirm: true, ...config } },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
  authorization.granted = true;
});

describe('操作按钮的确认资格与真实禁用触发器', () => {
  it('真实 AntDV 确认按钮执行一次回调，再关闭确认框', async () => {
    const clickFn = vi.fn();
    const wrapper = createButton({ clickFn });
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(true);
    expect(clickFn).not.toHaveBeenCalled();

    /** 点击 Teleport 到 body 的真实确定按钮，覆盖 AntDV 的确认与关闭时序。 */
    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();
    expect(clickFn).toHaveBeenCalledOnce();
    expect(clickFn).toHaveBeenCalledWith(wrapper.props('scope'), wrapper.props('config'), {
      close: expect.any(Function),
      hideLoading: expect.any(Function),
    });
    expect(wrapper.emitted('request-close')).toHaveLength(1);
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(false);
  });
  it('执行前重新读取权限，外部权限变化不能使用缓存的允许状态', async () => {
    const clickFn = vi.fn();
    const wrapper = createButton({ permissionCode: 'delete', clickFn });
    const confirm = wrapper.getComponent(Popconfirm);
    confirm.vm.$emit('update:open', true);
    await nextTick();
    authorization.granted = false;
    confirm.vm.$emit('confirm');
    await nextTick();
    expect(clickFn).not.toHaveBeenCalled();
    expect(confirm.props('open')).toBe(false);
  });
  it('透传确认配置不会强制打开受控确认层', async () => {
    const wrapper = createButton({ confirmProps: { popProps: { open: true } } });
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(false);
  });
  it('禁用确认项与普通禁用项都直接渲染按钮', () => {
    for (const isConfirm of [false, true]) {
      const wrapper = createButton({ isConfirm, disabledFn: () => true });
      expect(wrapper.find('[class$="disabled-compatible-wrapper"]').exists()).toBe(false);
      expect(wrapper.findComponent(Popconfirm).exists()).toBe(false);
      expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    }
  });
  it('无权限 fallback disable 不创建确认层且不会执行', async () => {
    const clickFn = vi.fn();
    const wrapper = createButton({ permissionCode: 'denied', fallback: 'disable', clickFn });
    expect(wrapper.find('[class$="disabled-compatible-wrapper"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(clickFn).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'permission', 'row', 'identity', 'confirm'])(
    '%s 变化清理已打开确认，恢复后不会重开',
    async reason => {
      const clickFn = vi.fn();
      const config = { key: 'delete', text: '删除', isConfirm: true, clickFn };
      const wrapper = createButton(config);
      const oldConfirm = wrapper.getComponent(Popconfirm);
      oldConfirm.vm.$emit('update:open', true);
      await nextTick();
      expect(oldConfirm.props('open')).toBe(true);
      if (reason === 'row') await wrapper.setProps({ scope: { row: { id: 2 } } });
      else
        await wrapper.setProps({
          config: {
            ...config,
            ...(reason === 'disabled' ? { disabledFn: () => true } : {}),
            ...(reason === 'permission' ? { permissionCode: 'denied', fallback: 'hide' as const } : {}),
            ...(reason === 'identity' ? { key: 'other' } : {}),
            ...(reason === 'confirm' ? { isConfirm: false } : {}),
          },
        });
      if (reason === 'disabled' || reason === 'permission') {
        oldConfirm.vm.$emit('confirm');
        await nextTick();
        expect(clickFn).not.toHaveBeenCalled();
      }
      await wrapper.setProps({ config });
      expect(wrapper.getComponent(Popconfirm).props('open')).toBe(false);
    }
  );
});
