<script setup lang="ts">
/**
 * 弹窗头部的缩放控件（内部组件）：[ − ] [ 100% ▾ ] [ + ]。
 * 下拉：50% / 75% / 100% / 125% / 150% / 200%、适应宽度、重置；窄屏时隐藏 − / +，改放到下拉里。
 */
import { CheckOutlined, DownOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Menu, Tooltip } from 'ant-design-vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useLocale } from '../../locale/useLocale';
import { formatZoom, ZOOM_PRESETS } from '../utils/zoom';

defineOptions({ name: 'YFilePreviewZoomControl' });

const props = defineProps<{
  value: number;
  min: number;
  max: number;
  canFit: boolean;
  popupContainer?: (trigger?: HTMLElement | null) => HTMLElement;
}>();

const emit = defineEmits<{
  set: [zoom: number];
  zoomIn: [];
  zoomOut: [];
  fit: [];
  reset: [];
}>();

const { t } = useLocale('filePreview');
const TOOLTIP_DELAY = 0.3;
const EPS = 1e-6;

const label = computed(() => formatZoom(props.value));
const canIn = computed(() => props.value < props.max - EPS);
const canOut = computed(() => props.value > props.min + EPS);
const presets = computed(() => ZOOM_PRESETS.filter(z => z >= props.min - EPS && z <= props.max + EPS));

// 窄屏（与头部其他按钮收缩的断点一致）
const NARROW_QUERY = '(max-width: 576px)';
const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;
const narrow = ref(!!mql?.matches);
const onMedia = (e: MediaQueryListEvent) => {
  narrow.value = e.matches;
};
mql?.addEventListener?.('change', onMedia);
onBeforeUnmount(() => mql?.removeEventListener?.('change', onMedia));

const onMenu = ({ key }: { key: string | number }) => {
  const k = String(key);
  if (k === 'in') emit('zoomIn');
  else if (k === 'out') emit('zoomOut');
  else if (k === 'fit') emit('fit');
  else if (k === 'reset') emit('reset');
  else if (k.startsWith('z:')) emit('set', Number(k.slice(2)));
};
</script>

<template>
  <div class="yss-file-preview-zoom" role="group" :aria-label="t('zoomMenu', { zoom: label })">
    <Tooltip
      v-if="!narrow"
      :title="t('zoomOut')"
      placement="bottom"
      :mouse-enter-delay="TOOLTIP_DELAY"
      :get-popup-container="popupContainer"
      destroy-tooltip-on-hide
    >
      <Button
        type="text"
        class="yss-file-preview-modal__icon-btn"
        data-tool="zoom-out"
        :disabled="!canOut"
        :aria-label="t('zoomOut')"
        @click="emit('zoomOut')"
      >
        <template #icon><MinusOutlined aria-hidden="true" /></template>
      </Button>
    </Tooltip>
    <Dropdown :trigger="['click']" placement="bottom" :get-popup-container="popupContainer">
      <Button
        type="text"
        class="yss-file-preview-zoom__level"
        data-tool="zoom-level"
        :aria-label="t('zoomMenu', { zoom: label })"
        aria-haspopup="menu"
      >
        <span class="yss-file-preview-zoom__text" aria-live="polite">{{ label }}</span>
        <DownOutlined class="yss-file-preview-zoom__arrow" aria-hidden="true" />
      </Button>
      <template #overlay>
        <Menu class="yss-file-preview-zoom__menu" :selectable="false" @click="onMenu">
          <template v-if="narrow">
            <Menu.Item key="in" :disabled="!canIn" data-zoom="in">{{ t('zoomIn') }}</Menu.Item>
            <Menu.Item key="out" :disabled="!canOut" data-zoom="out">{{ t('zoomOut') }}</Menu.Item>
            <Menu.Divider />
          </template>
          <Menu.Item v-for="z in presets" :key="`z:${z}`" :data-zoom="z">
            <span class="yss-file-preview-zoom__option">
              <span>{{ formatZoom(z) }}</span>
              <CheckOutlined v-if="Math.abs(z - value) < EPS" aria-hidden="true" />
            </span>
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item v-if="canFit" key="fit" data-zoom="fit">{{ t('zoomFitWidth') }}</Menu.Item>
          <Menu.Item key="reset" data-zoom="reset">{{ t('zoomReset') }}</Menu.Item>
        </Menu>
      </template>
    </Dropdown>
    <Tooltip
      v-if="!narrow"
      :title="t('zoomIn')"
      placement="bottom"
      :mouse-enter-delay="TOOLTIP_DELAY"
      :get-popup-container="popupContainer"
      destroy-tooltip-on-hide
    >
      <Button
        type="text"
        class="yss-file-preview-modal__icon-btn"
        data-tool="zoom-in"
        :disabled="!canIn"
        :aria-label="t('zoomIn')"
        @click="emit('zoomIn')"
      >
        <template #icon><PlusOutlined aria-hidden="true" /></template>
      </Button>
    </Tooltip>
  </div>
</template>
