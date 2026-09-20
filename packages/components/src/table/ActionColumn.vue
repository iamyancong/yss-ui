<template>
  <div class="y-table-action-list">
    <!-- 前 displayLimit 个按钮 -->
    <ActionButton
      v-for="(btn, index) in headButtons"
      :key="btn.key ?? btn.value ?? btn.label ?? index"
      :config="btn"
      :scope="scope"
      :is-last="!tailButtons.length && index === headButtons.length - 1"
    />

    <!-- 更多：收纳剩余按钮 -->
    <APopover v-if="tailButtons.length" v-model:open="moreOpen" trigger="click" placement="bottom">
      <template #content>
        <div class="y-table-action-pop-list">
          <ActionButton
            v-for="(btn, index) in tailButtons"
            :key="btn.key ?? btn.value ?? btn.label ?? index"
            :config="btn"
            :scope="scope"
            :is-last="index === tailButtons.length - 1"
            @request-close="closeMore"
          />
        </div>
      </template>
      <span class="y-table-action-btn">
        <slot v-if="isCustomMore" name="more" />
        <template v-else>
          <AButton v-if="isMoreButton" type="link" size="small">{{ moreText || t('more') }}</AButton>
          <AButton v-else type="link" size="small" class="y-action-more-icon-btn">
            <MoreOutlined />
          </AButton>
        </template>
      </span>
    </APopover>
  </div>
</template>

<script setup lang="ts">
import { hasAuth } from '@yss-ui/utils';
import { Button as AButton, Popover as APopover } from 'ant-design-vue';
import { MoreOutlined } from '@ant-design/icons-vue';
import { computed, ref, useSlots, watch } from 'vue';
import { useLocale } from '../locale/useLocale';
import ActionButton from './ActionButton.vue';
import type { ActionButtonConfig, MoreRenderType } from './type';

const { t } = useLocale('table');

const props = defineProps<{
  scope: any;
  buttons: ActionButtonConfig[];
  displayLimit?: number;
  moreRenderType?: MoreRenderType;
  moreText?: string;
}>();

/** “更多”操作浮层的受控打开状态。 */
const moreOpen = ref(false);

/**
 * 规范化直显按钮数量。
 * 负数按 0 处理，小数向下取整，NaN 回退到默认值 3。
 */
const displayLimit = computed(() => {
  const limit = props.displayLimit ?? 3;
  if (Number.isNaN(limit)) return 3;
  return Math.max(0, Math.floor(limit));
});
const moreType = computed(() => props.moreRenderType ?? 'moreButton');

const normalizedButtons = computed<ActionButtonConfig[]>(() =>
  (props.buttons || []).map(btn => ({
    ...btn,
    key: btn?.key ?? btn?.value,
    text: btn?.text ?? btn?.label,
    clickFn: btn?.clickFn ?? btn?.click,
  }))
);

const filteredButtons = computed(() =>
  normalizedButtons.value.filter(btn => {
    const byAuth = !btn?.permissionCode || hasAuth(btn.permissionCode) || btn?.fallback === 'disable';
    const byHide = !btn?.hideFn?.(props.scope);
    return byAuth && byHide;
  })
);

const headButtons = computed(() => filteredButtons.value.slice(0, displayLimit.value));
const tailButtons = computed(() => filteredButtons.value.slice(displayLimit.value));

/** 当前收纳按钮的稳定签名，用于识别菜单内容是否发生变化。 */
const tailButtonSignature = computed(() =>
  tailButtons.value
    .map((btn, index) => `${String(btn.key ?? btn.value ?? btn.label ?? index)}:${String(btn.text ?? btn.label ?? '')}`)
    .join('|')
);

const isMoreButton = computed(() => moreType.value === 'moreButton');
const slots = useSlots();
const isCustomMore = computed(() => !!slots.more);

/** 关闭“更多”操作浮层。 */
const closeMore = () => {
  moreOpen.value = false;
};

/**
 * 行复用或操作集合变化时关闭旧浮层，避免分页、虚拟滚动和权限变化后残留过期菜单。
 */
watch([tailButtonSignature, () => props.scope?.row], closeMore);
</script>

<script lang="ts">
export default { name: 'YTableActionColumn' };
</script>

<style scoped>
.y-table-action-list {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}

.y-table-action-btn {
  /* 仅用于“更多”触发器容器 */
  display: inline-block;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.y-table-action-pop-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 60px;
}

.y-action-more-icon-btn {
  padding: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.y-action-more-icon-btn:hover {
  background-color: rgb(0 0 0 / 6%);
}

.y-action-more-icon-btn .anticon {
  font-size: 14px;
  color: rgb(0 0 0 / 65%);
}

/* 暗色模式适配 */
:root[data-prefers-color='dark'] .y-action-more-icon-btn:hover {
  background-color: rgb(255 255 255 / 12%);
}

:root[data-prefers-color='dark'] .y-action-more-icon-btn .anticon {
  color: rgb(255 255 255 / 65%);
}
</style>
