<script setup lang="ts">
import { hasAuth } from '@yss-ui/utils';
import { Button, Popconfirm } from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useLocale } from '../locale/useLocale';
import type { ActionButtonConfig } from './type';

defineOptions({ name: 'YTableActionButton' });

const { t } = useLocale('table');

const props = defineProps<{
  scope: any;
  config: ActionButtonConfig;
  isLast?: boolean;
}>();

/** 通知上层操作容器关闭当前菜单。 */
const emit = defineEmits<{
  'request-close': [];
}>();

const loading = ref(false);
const visible = ref(false);

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

const hideLoading = () => {
  loading.value = false;
};
const close = () => {
  visible.value = false;
};

/** 资格失效或行/操作身份变化时清理旧确认，重新启用不会恢复过期弹层。 */
watch([canConfirm, () => props.scope?.row, () => props.config?.key ?? props.config?.value], close, { flush: 'sync' });

/** 执行已通过禁用与确认校验的操作，并通知上层菜单立即收起。 */
const handleConfirm = async () => {
  if (
    (props.config?.permissionCode && !hasAuth(props.config.permissionCode)) ||
    props.config?.disabledFn?.(props.scope) ||
    (props.config?.isConfirm && !visible.value)
  ) {
    close();
    return;
  }
  if (needLoading.value) loading.value = true;
  const clickHandler = props.config?.clickFn ?? props.config?.click;
  emit('request-close');
  await Promise.resolve(clickHandler?.(props.scope, props.config, { close, hideLoading }));
  if (!needLoading.value) {
    // 非受控 loading，直接关闭弹层
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
      <Button :type="antdType" size="small" :disabled="isDisabled" :title="actionText" class="y-table-action-link">
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
    class="y-table-action-link"
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
