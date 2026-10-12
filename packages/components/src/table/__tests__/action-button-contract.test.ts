// @vitest-environment happy-dom

/**
 * 契约测试警告：修改本文件中的任何断言即代表组件公开行为发生变化，
 * 必须触发发版门禁 G1 的 minor 升级或在发版时显式提供 override_reason。
 *
 * 背景回顾：1.7.5（#35）曾破坏 needLoading 默认自动关闭行为，1.7.6（#37）通过恢复默认兼容语义修复。
 * 本测试作为核心行为契约防线，锁定 Popconfirm + needLoading 的交互规范。
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { Popconfirm } from 'ant-design-vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionButton from '../ActionButton.vue';
import { ACTION_RETRY_SIGNAL } from '../utils/actionRetry';

const wrappers: VueWrapper[] = [];

/** 挂载 ActionButton 并记录以便清理真实 DOM。 */
const createButton = (config: any = {}, scope: any = { row: { id: 1 } }) => {
  const { confirmProps, ...restConfig } = config;
  const wrapper = mount(ActionButton, {
    props: {
      scope,
      config: {
        text: '删除',
        isConfirm: true,
        confirmProps: {
          needLoading: true,
          ...confirmProps,
        },
        ...restConfig,
      },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
};

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

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('ActionButton 核心行为契约规范', () => {
  it('契约1：带确认 + needLoading，clickFn 中在 finally 调 hideLoading() 且 Promise 正常 resolve → 弹层关闭（#37 兼容语义）', async () => {
    let finished = false;
    const clickFn = vi.fn(async (_scope, _config, { hideLoading }) => {
      try {
        await new Promise(resolve => setTimeout(resolve, 20));
      } finally {
        hideLoading();
        finished = true;
      }
    });

    const wrapper = createButton({ clickFn });
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const popconfirm = wrapper.getComponent(Popconfirm);
    expect(popconfirm.props('open')).toBe(true);

    const confirmBtn = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmBtn) throw new Error('未找到确认按钮');
    confirmBtn.click();
    await flushPromises();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 30));
    await flushPromises();

    expect(finished).toBe(true);
    expect(clickFn).toHaveBeenCalledOnce();
    // 弹层必须自动关闭
    expect(popconfirm.props('open')).toBe(false);
  });

  it('契约2：clickFn resolve 且不调用任何控制函数 → 自动关闭、loading 结束', async () => {
    const clickFn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const wrapper = createButton({ clickFn });
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const popconfirm = wrapper.getComponent(Popconfirm);
    expect(popconfirm.props('open')).toBe(true);

    const confirmBtn = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    if (!confirmBtn) throw new Error('未找到确认按钮');
    confirmBtn.click();
    await flushPromises();

    await new Promise(resolve => setTimeout(resolve, 30));
    await flushPromises();

    expect(clickFn).toHaveBeenCalledOnce();
    expect(popconfirm.props('open')).toBe(false);
  });

  it('契约3：clickFn reject / throw → loading 结束，弹层保留可重试，控制台无未处理拒绝', async () => {
    await withActionRetryRejection(async () => {
      const clickFn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('网络异常');
      });

      const wrapper = createButton({ clickFn });
      await wrapper.get('button.y-table-action-link').trigger('click');
      await flushPromises();

      const popconfirm = wrapper.getComponent(Popconfirm);
      expect(popconfirm.props('open')).toBe(true);

      const confirmBtn = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
      if (!confirmBtn) throw new Error('未找到确认按钮');
      confirmBtn.click();
      await flushPromises();

      await new Promise(resolve => setTimeout(resolve, 30));
      await flushPromises();

      expect(clickFn).toHaveBeenCalledOnce();
      // 失败时弹层保留，允许用户重试
      expect(popconfirm.props('open')).toBe(true);
      expect(confirmBtn.classList.contains('ant-btn-loading')).toBe(false);
    });
  });

  it('契约4：manualClose 模式下在 Promise 结束前调用 hideLoading() → 视为失败可重试', async () => {
    await withActionRetryRejection(async () => {
      const clickFn = vi.fn(async (_scope, _config, { hideLoading }) => {
        hideLoading();
        // 在 manualClose 下，提前调 hideLoading() 会终止 loading 并保持弹层可重试
      });

      const wrapper = createButton({
        confirmProps: { manualClose: true },
        clickFn,
      });
      await wrapper.get('button.y-table-action-link').trigger('click');
      await flushPromises();

      const popconfirm = wrapper.getComponent(Popconfirm);
      expect(popconfirm.props('open')).toBe(true);

      const confirmBtn = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
      if (!confirmBtn) throw new Error('未找到确认按钮');
      confirmBtn.click();
      await flushPromises();

      expect(clickFn).toHaveBeenCalledOnce();
      // 弹层保留
      expect(popconfirm.props('open')).toBe(true);
      expect(confirmBtn.classList.contains('ant-btn-loading')).toBe(false);
    });
  });

  it('契约5：manualClose: true → 只有显式 close() 才关闭', async () => {
    // 场景 A：不调 close()，即使 resolve 也不关闭
    let capturedHelpers: any;
    const clickWithoutClose = vi.fn(async (_scope, _config, helpers) => {
      capturedHelpers = helpers;
      return Promise.resolve();
    });

    const wrapper = createButton({
      confirmProps: { manualClose: true },
      clickFn: clickWithoutClose,
    });
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const popconfirm = wrapper.getComponent(Popconfirm);
    const confirmBtn = document.body.querySelector<HTMLButtonElement>('.ant-popconfirm-buttons .ant-btn-primary');
    confirmBtn?.click();
    await flushPromises();

    expect(clickWithoutClose).toHaveBeenCalledOnce();
    // 弹层保持打开
    expect(popconfirm.props('open')).toBe(true);

    // 场景 B：显式调用 close()，成功关闭
    capturedHelpers.close();
    await flushPromises();
    expect(popconfirm.props('open')).toBe(false);
  });

  it('契约6：轮询导致 row 引用变化但 rowIdentity 不变 → 弹层不关闭（#35）', async () => {
    const wrapper = createButton({}, { row: { id: 100, name: 'Alice' } });
    await wrapper.get('button.y-table-action-link').trigger('click');
    await flushPromises();

    const popconfirm = wrapper.getComponent(Popconfirm);
    expect(popconfirm.props('open')).toBe(true);

    // 轮询返回全新的 row 对象引用，但 id 不变
    await wrapper.setProps({
      scope: { row: { id: 100, name: 'Alice Updated' } },
    });
    await nextTick();
    await flushPromises();

    // 弹层保持打开状态，不会因为轮询而意外闪退
    expect(popconfirm.props('open')).toBe(true);

    // 当切换为另一个真实不同的行（id 变化）时，旧弹层立即关闭
    await wrapper.setProps({
      scope: { row: { id: 200, name: 'Bob' } },
    });
    await nextTick();
    await flushPromises();

    expect(popconfirm.props('open')).toBe(false);
  });
});
