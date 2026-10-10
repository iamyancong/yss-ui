<template>
  <div class="y-table-action-list">
    <!-- 前 displayLimit 个按钮 -->
    <ActionButton
      v-for="(btn, index) in headButtons"
      :key="btn.key ?? btn.value ?? btn.label ?? index"
      :config="btn"
      :scope="scope"
      :is-last="!tailButtons.length && index === headButtons.length - 1"
      :close-on-scroll="closeOnScroll"
      @busy-change="handleBusyChange"
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
            :menu-open="moreOpen"
            :close-on-scroll="closeOnScroll"
            @request-close="closeMore"
            @busy-change="handleBusyChange"
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
import { computed, inject, ref, useSlots, watch } from 'vue';
import { useLocale } from '../locale/useLocale';
import ActionButton from './ActionButton.vue';
import type { ActionButtonConfig, MoreRenderType } from './type';
import { Y_TABLE_ACTION_SCROLL_KEY } from './utils/actionScroll';
import { resolveRowIdentity } from './utils/rowIdentity';

const { t } = useLocale('table');

const props = defineProps<{
  scope: any;
  buttons: ActionButtonConfig[];
  displayLimit?: number;
  moreRenderType?: MoreRenderType;
  moreText?: string;
  /** 为 false 时，表格内部滚动不关闭「更多」和确认浮层 */
  closeOnScroll?: boolean;
}>();

/** “更多”操作浮层的受控打开状态。 */
const moreOpen = ref(false);
/** 仍在执行 needLoading 的按钮数量。大于 0 时滚动不关闭菜单。 */
const busyCount = ref(0);
const actionScroll = inject(Y_TABLE_ACTION_SCROLL_KEY, null);

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
 * 记录子按钮是否处于 needLoading。
 * 进行中的确认被菜单收起时会中断浮层生命周期，所以滚动期间先保持菜单。
 *
 * @param busy 该按钮是否进入或离开异步确认
 */
const handleBusyChange = (busy: boolean) => {
  busyCount.value += busy ? 1 : -1;
  if (busyCount.value < 0) busyCount.value = 0;
};

const rowIdentity = computed(() => resolveRowIdentity(props.scope));

if (actionScroll) {
  watch(actionScroll.scrollTick, () => {
    if (props.closeOnScroll === false || busyCount.value > 0) return;
    closeMore();
  });
}

/**
 * 行身份变化或操作集合变化时关闭旧浮层，避免分页、虚拟滚动和权限变化后残留过期菜单。
 * 轮询刷新等仅行对象引用变化但主键未变场景下保持菜单稳定。
 */
watch([tailButtonSignature, rowIdentity], closeMore);
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
