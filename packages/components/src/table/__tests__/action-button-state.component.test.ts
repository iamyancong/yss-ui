import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { Popconfirm } from 'ant-design-vue';
import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionButton from '../ActionButton.vue';
import { Y_TABLE_ACTION_SCROLL_KEY } from '../utils/actionScroll';
import { ACTION_RETRY_SIGNAL } from '../utils/actionRetry';

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

  it('head 按钮在行引用变化但主键未变时保持 Popconfirm 打开', async () => {
    const clickFn = vi.fn();
    const wrapper = createButton({ clickFn });
    const confirm = wrapper.getComponent(Popconfirm);
    confirm.vm.$emit('update:open', true);
    await nextTick();
    expect(confirm.props('open')).toBe(true);

    // 轮询重建行对象（id 不变）
    await wrapper.setProps({ scope: { row: { id: 1, status: 'polling' } } });
    expect(confirm.props('open')).toBe(true);

    // 行身份变化（换行）则关闭
    await wrapper.setProps({ scope: { row: { id: 2 } } });
    expect(confirm.props('open')).toBe(false);
  });

  it('基于 scope.rowid 保持稳定身份，rowid 变化时关闭', async () => {
    const wrapper = mount(ActionButton, {
      props: {
        scope: { rowid: 'row_101', row: { id: 1 } },
        config: { text: '删除', isConfirm: true },
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    const confirm = wrapper.getComponent(Popconfirm);
    confirm.vm.$emit('update:open', true);
    await nextTick();
    expect(confirm.props('open')).toBe(true);

    // 轮询重建行对象，保持 rowid 不变
    await wrapper.setProps({ scope: { rowid: 'row_101', row: { id: 1, status: 'polling' } } });
    expect(confirm.props('open')).toBe(true);

    // rowid 变化（换行或复用）则关闭
    await wrapper.setProps({ scope: { rowid: 'row_102', row: { id: 1, status: 'polling' } } });
    expect(confirm.props('open')).toBe(false);
  });

  it('menuOpen 变为 false 时级联关闭 Popconfirm 并清理 loading', async () => {
    const wrapper = mount(ActionButton, {
      props: {
        scope: { row: { id: 1 } },
        config: { text: '删除', isConfirm: true },
        menuOpen: true,
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);

    const confirm = wrapper.getComponent(Popconfirm);
    confirm.vm.$emit('update:open', true);
    await nextTick();
    expect(confirm.props('open')).toBe(true);

    // 更多菜单收起
    await wrapper.setProps({ menuOpen: false });
    expect(confirm.props('open')).toBe(false);
  });

  it('needLoading 确认后同行刷新保持 loading 与打开，行身份变化或 close helper 清理状态', async () => {
    let capturedHelpers: any;
    const clickFn = vi.fn((_scope, _config, helpers) => {
      capturedHelpers = helpers;
      return new Promise<void>(() => {});
    });

    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    // 点击真实确认按钮
    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到确认按钮');
    confirmButton.click();
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('open')).toBe(true);
    expect(confirm.props('okButtonProps')?.loading).toBe(true);

    // 刷新数据（同 id），保持 loading 与打开
    await wrapper.setProps({ scope: { row: { id: 1, refreshed: true } } });
    expect(confirm.props('open')).toBe(true);
    expect(confirm.props('okButtonProps')?.loading).toBe(true);

    // 业务调用 close helper，应清理 loading 并关闭弹层且发出 request-close
    capturedHelpers.close();
    await nextTick();
    expect(confirm.props('open')).toBe(false);
    expect(confirm.props('okButtonProps')?.loading).toBe(false);
    expect(wrapper.emitted('request-close')).toHaveLength(1);

    // 再次打开确认框，loading 不会有历史残留
    confirm.vm.$emit('update:open', true);
    await nextTick();
    expect(confirm.props('okButtonProps')?.loading).toBe(false);
  });

  it('needLoading 下行身份变化（换行）时主动关闭弹层并重置 loading', async () => {
    const clickFn = vi.fn(() => new Promise<void>(() => {}));
    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    confirmButton?.click();
    await flushPromises();

    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('okButtonProps')?.loading).toBe(true);

    // 行身份真正变化（换到第 2 行）
    await wrapper.setProps({ scope: { row: { id: 2 } } });
    expect(confirm.props('open')).toBe(false);
    expect(confirm.props('okButtonProps')?.loading).toBe(false);
  });

  /** 临时拦截 AntDV Popconfirm 内部重新抛出的 ACTION_RETRY_SIGNAL，用例结束后恢复原监听器。 */
  const withActionRetryRejection = async (fn: () => Promise<void>) => {
    const listeners = process.rawListeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    const handler = (reason: unknown, promise: Promise<unknown>) => {
      if (reason === ACTION_RETRY_SIGNAL || (reason instanceof Error && reason.name === 'YssActionRetry')) {
        return;
      }
      listeners.forEach(l => (l as any)(reason, promise));
    };
    process.on('unhandledRejection', handler);
    try {
      await fn();
    } finally {
      process.removeListener('unhandledRejection', handler);
      listeners.forEach(l => process.on('unhandledRejection', l as any));
    }
  };

  it('1.7.6 测试 1: finally 里调用 hideLoading 且操作成功：弹层关闭、发出 request-close 且无 loading（兼容 yuyan 写法）', async () => {
    let finallyExecuted = false;
    const clickFn = vi.fn(async (_scope, _config, { hideLoading }) => {
      try {
        await Promise.resolve('api-success');
      } finally {
        hideLoading();
        finallyExecuted = true;
      }
    });

    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    expect(finallyExecuted).toBe(true);
    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('open')).toBe(false);
    expect(confirm.props('okButtonProps')?.loading).toBe(false);
    expect(wrapper.emitted('request-close')).toHaveLength(1);
  });

  it('1.7.6 测试 2: 两个 helper 都不调用且正常 resolve：视为成功自动关闭弹层并清理 loading', async () => {
    const clickFn = vi.fn(async () => {
      await Promise.resolve('done');
    });

    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('open')).toBe(false);
    expect(confirm.props('okButtonProps')?.loading).toBe(false);
    expect(wrapper.emitted('request-close')).toHaveLength(1);
  });

  it('1.7.6 测试 3: reject 或同步抛错：弹层保留、loading 停止且可再次点击确定重试', async () => {
    await withActionRetryRejection(async () => {
      let isFirstTry = true;
      const clickFn = vi.fn((_scope, _config, helpers) => {
        if (isFirstTry) {
          // 首次同步抛错测试
          throw new Error('网络异常，请重试');
        }
        // 重试成功
        helpers.close();
        return Promise.resolve();
      });

      const wrapper = createButton({
        confirmProps: { needLoading: true },
        clickFn,
      });

      await wrapper.get('button.y-table-action-link').trigger('click');
      await flushPromises();
      const confirm = wrapper.getComponent(Popconfirm);
      expect(confirm.props('open')).toBe(true);

      const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
      if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');

      // 首次点击：同步抛错
      confirmButton.click();
      await flushPromises();

      expect(clickFn).toHaveBeenCalledTimes(1);
      // 弹层保留，loading 停止
      expect(confirm.props('open')).toBe(true);
      expect(confirmButton.classList.contains('ant-btn-loading')).toBe(false);

      // 再次点击确定重试
      isFirstTry = false;
      confirmButton.click();
      await flushPromises();

      expect(clickFn).toHaveBeenCalledTimes(2);
      expect(confirm.props('open')).toBe(false);
    });
  });

  it('1.7.6 测试 3 补充: 异步 reject 时弹层保留、loading 停止并支持重试', async () => {
    await withActionRetryRejection(async () => {
      let shouldFail = true;
      const clickFn = vi.fn((_scope, _config, helpers) => {
        if (shouldFail) {
          return Promise.reject(new Error('异步操作失败'));
        }
        helpers.close();
        return Promise.resolve();
      });

      const wrapper = createButton({
        confirmProps: { needLoading: true },
        clickFn,
      });

      await wrapper.get('button.y-table-action-link').trigger('click');
      await flushPromises();
      const confirm = wrapper.getComponent(Popconfirm);
      expect(confirm.props('open')).toBe(true);

      const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
      if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');

      confirmButton.click();
      await flushPromises();

      expect(clickFn).toHaveBeenCalledTimes(1);
      expect(confirm.props('open')).toBe(true);
      expect(confirmButton.classList.contains('ant-btn-loading')).toBe(false);

      shouldFail = false;
      confirmButton.click();
      await flushPromises();

      expect(clickFn).toHaveBeenCalledTimes(2);
      expect(confirm.props('open')).toBe(false);
    });
  });

  it('1.7.6 测试 4: 执行中调用 close()：立即关闭且后续 resolve 不重复触发', async () => {
    let resolveLate: () => void = () => {};
    const clickFn = vi.fn((_scope, _config, helpers) => {
      helpers.close();
      return new Promise<void>(resolve => {
        resolveLate = resolve;
      });
    });

    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('open')).toBe(false);
    expect(wrapper.emitted('request-close')).toHaveLength(1);

    // 晚到的 resolve，不应重复触发 request-close，状态维持关闭
    resolveLate();
    await flushPromises();
    expect(wrapper.emitted('request-close')).toHaveLength(1);
    expect(confirm.props('open')).toBe(false);
  });

  it('1.7.6 测试 5: manualClose: true 保留 1.7.5 严格受控语义（hideLoading 可重试、不调 close 不关）', async () => {
    await withActionRetryRejection(async () => {
      let capturedHelpers: any;
      const clickFn = vi.fn((_scope, _config, helpers) => {
        capturedHelpers = helpers;
        return Promise.resolve();
      });

      const wrapper = createButton({
        confirmProps: { needLoading: true, manualClose: true },
        clickFn,
      });

      await wrapper.get('button.y-table-action-link').trigger('click');
      await flushPromises();

      const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
      if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');

      // 阶段 1：点击确定，未调 close，即便 resolve 也不关弹层，loading 一直保持
      confirmButton.click();
      await flushPromises();
      expect(clickFn).toHaveBeenCalledTimes(1);
      const confirm = wrapper.getComponent(Popconfirm);
      expect(confirm.props('open')).toBe(true);
      expect(confirmButton.classList.contains('ant-btn-loading')).toBe(true);

      // 阶段 2：调 hideLoading()，loading 停止且弹层保留供重试
      capturedHelpers.hideLoading();
      await flushPromises();
      expect(confirm.props('open')).toBe(true);
      expect(confirmButton.classList.contains('ant-btn-loading')).toBe(false);

      // 阶段 3：用户再次点击确定重试
      confirmButton.click();
      await flushPromises();
      expect(clickFn).toHaveBeenCalledTimes(2);
      expect(confirm.props('open')).toBe(true);
      expect(confirmButton.classList.contains('ant-btn-loading')).toBe(true);

      // 阶段 4：调 close()，弹层关闭
      capturedHelpers.close();
      await flushPromises();
      expect(confirm.props('open')).toBe(false);
    });
  });

  it('1.7.6 测试 6: pending 期间行身份变化 / 更多菜单关闭 / 卸载后晚到的 resolve/reject 被忽略', async () => {
    let resolveOld: () => void = () => {};
    let rejectOld: (e: any) => void = () => {};
    const clickFn = vi.fn(() => {
      return new Promise<void>((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
      });
    });

    const wrapper = createButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();

    const confirm = wrapper.getComponent(Popconfirm);
    expect(confirm.props('open')).toBe(true);
    expect(confirm.props('okButtonProps')?.loading).toBe(true);

    // 行身份换到第 2 行，原弹层应关闭且清理 loading
    await wrapper.setProps({ scope: { row: { id: 2 } } });
    expect(confirm.props('open')).toBe(false);
    expect(confirm.props('okButtonProps')?.loading).toBe(false);

    // 旧行的 resolve 晚到，直接被忽略
    resolveOld();
    await flushPromises();
    expect(confirm.props('open')).toBe(false);

    // 换到第 3 行并重新打开确认层，旧行的 reject 晚到，直接被忽略且不报错
    await wrapper.setProps({ scope: { row: { id: 3 } } });
    confirm.vm.$emit('update:open', true);
    await nextTick();
    expect(confirm.props('open')).toBe(true);

    rejectOld(new Error('过期异步异常'));
    await flushPromises();
    expect(confirm.props('open')).toBe(true);
  });

  it('1.7.6 测试 6 补充: pending 期间更多菜单关闭后晚到的 resolve 被忽略且不报错', async () => {
    let resolveClick: () => void = () => {};
    const clickFn = vi.fn(() => {
      return new Promise<void>(resolve => {
        resolveClick = resolve;
      });
    });

    const wrapper = mount(ActionButton, {
      props: {
        scope: { row: { id: 1 } },
        config: { text: '删除', isConfirm: true, confirmProps: { needLoading: true }, clickFn },
        menuOpen: true,
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);

    const confirm = wrapper.getComponent(Popconfirm);
    confirm.vm.$emit('update:open', true);
    await nextTick();

    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    confirmButton?.click();
    await flushPromises();
    expect(confirm.props('open')).toBe(true);

    // 更多菜单收起
    await wrapper.setProps({ menuOpen: false });
    expect(confirm.props('open')).toBe(false);

    // 晚到的 resolve 被安全丢弃
    resolveClick();
    await flushPromises();
    expect(confirm.props('open')).toBe(false);
  });

  it('普通按钮配 needLoading，调 hideLoading 后 errorHandler 不会被调用', async () => {
    let capturedHelpers: any;
    const errorHandler = vi.fn();
    const clickFn = vi.fn((_scope, _config, helpers) => {
      capturedHelpers = helpers;
    });

    const wrapper = mount(ActionButton, {
      props: {
        scope: { row: { id: 1 } },
        config: {
          text: '导出',
          isConfirm: false,
          confirmProps: { needLoading: true },
          clickFn,
        },
      },
      global: {
        config: {
          errorHandler,
        },
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);

    const btn = wrapper.get('button.y-table-action-link');
    await btn.trigger('click');
    await flushPromises();

    expect(clickFn).toHaveBeenCalledTimes(1);
    expect(btn.classes()).toContain('ant-btn-loading');

    // 业务调用 hideLoading 结束 loading
    capturedHelpers.hideLoading();
    await flushPromises();

    // 验证 loading 停止，且未向 Vue 事件系统抛出未捕获 rejection
    expect(btn.classes()).not.toContain('ant-btn-loading');
    expect(errorHandler).not.toHaveBeenCalled();
  });
});

describe('操作按钮随表格纵向滚动关闭', () => {
  /** 挂载带滚动信号的确认按钮。 */
  const mountScrollButton = (config: Record<string, unknown> = {}, closeOnScroll = true) => {
    const scrollTick = ref(0);
    const wrapper = mount(ActionButton, {
      props: {
        scope: { row: { id: 1 } },
        closeOnScroll,
        config: { text: '删除', isConfirm: true, ...config },
      },
      global: {
        provide: {
          [Y_TABLE_ACTION_SCROLL_KEY as symbol]: { scrollTick },
        },
      },
      attachTo: document.body,
    });
    wrappers.push(wrapper);
    return { wrapper, scrollTick };
  };

  it('打开直显确认后纵向滚动关闭确认框', async () => {
    const { wrapper, scrollTick } = mountScrollButton();
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(true);

    scrollTick.value += 1;
    await nextTick();

    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(false);
  });

  it('needLoading 执行中滚动不关闭，成功后仍关闭且回调已执行', async () => {
    let resolveAction: (() => void) | undefined;
    const clickFn = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        })
    );
    const { wrapper, scrollTick } = mountScrollButton({
      confirmProps: { needLoading: true },
      clickFn,
    });

    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();
    const confirmButton = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmButton) throw new Error('未找到 AntDV 真实确认按钮');
    confirmButton.click();
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(true);

    scrollTick.value += 1;
    await nextTick();
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(true);

    resolveAction?.();
    await flushPromises();
    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(false);
  });

  it('closeOnScroll 为 false 时滚动保持确认框', async () => {
    const { wrapper, scrollTick } = mountScrollButton({}, false);
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    scrollTick.value += 1;
    await nextTick();

    expect(wrapper.getComponent(Popconfirm).props('open')).toBe(true);
  });
});
