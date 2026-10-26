<script setup lang="ts">
import { hasAuth } from '@yss-ui/utils';
import { Button, Popconfirm } from 'ant-design-vue';
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useLocale } from '../locale/useLocale';
import type { ActionButtonConfig } from './type';
import { ACTION_RETRY_SIGNAL, ensureRetrySignalFilter } from './utils/actionRetry';
import { Y_TABLE_ACTION_SCROLL_KEY } from './utils/actionScroll';
import { resolveRowIdentity } from './utils/rowIdentity';

defineOptions({ name: 'YTableActionButton' });

const { t } = useLocale('table');

const props = defineProps<{
  scope: any;
  config: ActionButtonConfig;
  isLast?: boolean;
  menuOpen?: boolean;
  /** 为 false 时，表格内部滚动不关闭当前确认浮层 */
  closeOnScroll?: boolean;
}>();

/** 通知上层操作容器关闭当前菜单，或声明异步操作仍在进行。 */
const emit = defineEmits<{
  'request-close': [];
  'busy-change': [busy: boolean];
}>();

const loading = ref(false);
const visible = ref(false);
/** needLoading 的受控确认尚未结束。滚动时用来避免中途收起浮层。 */
const actionPending = ref(false);

const allowed = computed(() => !props.config?.permissionCode || hasAuth(props.config.permissionCode));
const isDisabled = computed(() => !allowed.value || !!props.config?.disabledFn?.(props.scope));
/** 只有仍有权限且未禁用的操作才创建确认触发器。 */
const canConfirm = computed(() => !!props.config?.isConfirm && !isDisabled.value);
const needLoading = computed(() => !!props.config?.confirmProps?.needLoading);
const actionText = computed(() => props.config?.text ?? props.config?.label ?? '');

const titleText = computed(() => {
  const { confirmProps } = props.config || {};
  return confirmProps?.title || t('confirmTitle', { action: actionText.value });
});
const okText = computed(() => props.config?.confirmProps?.okText || t('confirm'));
const cancelText = computed(() => props.config?.confirmProps?.cancelText || t('cancel'));

const antdType = computed(() => {
  const t = props.config?.type || 'link';
  // text/link 在 antd 中都可用，默认使用 link 更贴近旧视觉
  if (t === 'text' || t === 'link') return 'link';
  return t as any;
});

interface ConfirmPending {
  manualClose: boolean;
  settled: boolean;
  resolve: () => void;
  reject: (e?: unknown) => void;
}

let pending: ConfirmPending | null = null;

/** 清理并失效当前 pending 受控 Promise，防止晚到的异步结果污染新状态。 */
const abortPending = () => {
  if (pending) {
    const p = pending;
    pending = null;
    actionPending.value = false;
    p.settled = true;
    p.resolve();
  }
};

const hideLoading = () => {
  loading.value = false;
};

const close = () => {
  visible.value = false;
  abortPending();
};

const rowIdentity = computed(() => resolveRowIdentity(props.scope));
const actionBusy = computed(() => loading.value || actionPending.value);
const actionScroll = inject(Y_TABLE_ACTION_SCROLL_KEY, null);

/** 异步确认开始或结束时通知操作列，避免滚动把进行中的「更多」菜单收掉。 */
watch(
  actionBusy,
  (busy, previous) => {
    if (previous === undefined || busy === previous) return;
    emit('busy-change', busy);
  },
  { flush: 'sync' }
);

if (actionScroll) {
  watch(actionScroll.scrollTick, () => {
    if (props.closeOnScroll === false || actionBusy.value || !visible.value) return;
    close();
  });
}

/** 提供给操作回调的关闭辅助函数，确保清理 loading、关闭弹层并通知上层菜单收起。 */
const handleHelperClose = () => {
  close();
  loading.value = false;
  emit('request-close');
};

/** 资格失效或操作身份变化时清理旧确认，重新启用不会恢复过期弹层。 */
watch([canConfirm, () => props.config?.key ?? props.config?.value], close, { flush: 'sync' });

/** 行身份变化（换行/复用）时清理旧确认与 loading，避免把旧行状态带入新行。 */
watch(
  rowIdentity,
  () => {
    close();
    hideLoading();
  },
  { flush: 'sync' }
);

/** 所在上层菜单关闭时，级联收起 Popconfirm 并清理 loading。 */
watch(
  () => props.menuOpen,
  open => {
    if (open === false) {
      close();
      hideLoading();
    }
  }
);

onBeforeUnmount(() => {
  loading.value = false;
  abortPending();
});

/** 执行已通过禁用与确认校验的操作。 */
const handleConfirm = () => {
  if (
    (props.config?.permissionCode && !hasAuth(props.config.permissionCode)) ||
    props.config?.disabledFn?.(props.scope) ||
    (props.config?.isConfirm && !visible.value)
  ) {
    close();
    return;
  }
  if (needLoading.value) {
    loading.value = true;
  } else {
    emit('request-close');
  }
  const clickHandler = props.config?.clickFn ?? props.config?.click;

  if (needLoading.value) {
    if (canConfirm.value) {
      // 仅二次确认的 Popconfirm 需要返回受控 Promise，并在按需注册全局 filter 后
      // 允许通过 reject(ACTION_RETRY_SIGNAL) 驱动 AntDV ActionButton 停止 loading 并解锁重试
      ensureRetrySignalFilter();
      const manualClose = !!props.config?.confirmProps?.manualClose;

      return new Promise<void>((resolve, reject) => {
        const currentPending: ConfirmPending = {
          manualClose,
          settled: false,
          resolve,
          reject,
        };
        pending = currentPending;
        actionPending.value = true;

        const finishSuccess = () => {
          if (currentPending.settled) return;
          currentPending.settled = true;
          loading.value = false;
          visible.value = false;
          actionPending.value = false;
          emit('request-close');
          currentPending.resolve();
          if (pending === currentPending) {
            pending = null;
          }
        };

        const finishRetry = () => {
          if (currentPending.settled) return;
          currentPending.settled = true;
          loading.value = false;
          actionPending.value = false;
          currentPending.reject(ACTION_RETRY_SIGNAL);
          if (pending === currentPending) {
            pending = null;
          }
        };

        const helpers = {
          close: () => {
            if (pending !== currentPending || currentPending.settled) return;
            finishSuccess();
          },
          hideLoading: () => {
            loading.value = false;
            if (pending !== currentPending || currentPending.settled) return;
            if (manualClose) {
              finishRetry();
            }
          },
        };

        try {
          Promise.resolve(clickHandler?.(props.scope, props.config, helpers))
            .then(() => {
              if (pending !== currentPending || currentPending.settled) return;
              if (manualClose) return;
              finishSuccess();
            })
            .catch(() => {
              if (pending !== currentPending || currentPending.settled) return;
              finishRetry();
            });
        } catch {
          if (pending !== currentPending || currentPending.settled) return;
          finishRetry();
        }
      });
    }

    // 普通无确认按钮：直接触发操作，无需向 Vue 事件系统返回受控 Promise，
    // 避免 hideLoading() 或内部抛错触发 Vue 的 errorHandler 或控制台未捕获报错。
    try {
      Promise.resolve(clickHandler?.(props.scope, props.config, { close: handleHelperClose, hideLoading })).catch(
        () => {
          hideLoading();
        }
      );
    } catch {
      hideLoading();
    }
    return;
  }

  try {
    Promise.resolve(clickHandler?.(props.scope, props.config, { close: handleHelperClose, hideLoading }))
      .finally(() => {
        close();
      })
      .catch(() => {
        // 静默吸收业务 clickHandler 抛出的 rejection，避免未捕获异常泄露至控制台或 Node 进程；业务层异常应由其自身处理
      });
  } catch {
    close();
  }
};

/** 取消二次确认并通知上层菜单收起。 */
const handleCancel = () => {
  hideLoading();
  close();
  emit('request-close');
};
</script>

<template>
  <!-- 需要二次确认时，用 Popconfirm 包裹 -->
  <Popconfirm
    v-if="canConfirm"
    v-bind="config?.confirmProps?.popProps"
    v-model:open="visible"
    :disabled="isDisabled"
    :title="titleText"
    :ok-text="okText"
    :cancel-text="cancelText"
    :placement="isLast ? 'topLeft' : undefined"
    overlay-class-name="y-table-action-popconfirm"
    :ok-button-props="{ loading: needLoading && loading }"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <template #default>
      <Button
        :type="antdType"
        size="small"
        :disabled="isDisabled"
        :title="actionText"
        :class="['y-table-action-link', { 'y-table-action-link--disabled': isDisabled }]"
      >
        <span class="y-table-action-link__text">{{ actionText }}</span>
      </Button>
    </template>
  </Popconfirm>
  <!-- 无确认时，直接按钮 -->
  <Button
    v-else-if="allowed || config?.fallback === 'disable'"
    :type="antdType"
    size="small"
    :disabled="isDisabled"
    :loading="needLoading && loading"
    :title="actionText"
    :class="['y-table-action-link', { 'y-table-action-link--disabled': isDisabled }]"
    @click="handleConfirm"
  >
    <span class="y-table-action-link__text">{{ actionText }}</span>
  </Button>
</template>

<style scoped lang="less">
@import url('./action-button.less');
</style>

<style lang="less">
@import url('./action-popconfirm.less');
</style>
