<script setup lang="ts">
/**
 * 弹窗标题里的文件切换下拉（内部组件）。
 * 触发器：类型图标 + 文件名（中间省略、保留后缀）+ 箭头，无边框，悬停时显示浅底色。
 * 下拉列表：全部文件（图标、名称、大小、不支持 / 需转换标记），当前文件高亮并打勾，打开时滚动到当前文件；
 * 文件较多时显示搜索框。键盘：↑ ↓ Home End PageUp PageDown 移动，Enter / 空格选择，Esc 只关闭下拉（不关闭弹窗），
 * 下拉内的按键不会触发弹窗的左右切换。
 */
import { CheckOutlined, DownOutlined, SearchOutlined } from '@ant-design/icons-vue';
import { Dropdown, Input, theme } from 'ant-design-vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useLocale } from '../../locale/useLocale';
import { formatFileSize } from '../constant';
import type { FilePreviewItem } from '../types';
import { resolveItemName, resolveItemSize, splitFileName } from '../utils/item';
import { fileKindOf, fileSupportOf, resolveItemType, type FileKind, type FileSupport } from '../utils/kind';
import FileTypeIcon from './FileTypeIcon.vue';

defineOptions({ name: 'YFilePreviewSwitcher' });

/** 文件数达到该值时显示搜索框 */
const SEARCH_THRESHOLD = 10;

const props = defineProps<{
  items: FilePreviewItem[];
  activeIndex: number;
  /** 当前文件的显示名（懒加载来源加载后才知道文件名） */
  currentName: string;
  /** 下拉挂载节点，弹窗传入它的浮层挂载层 */
  popupContainer?: (trigger: HTMLElement) => HTMLElement;
}>();

const emit = defineEmits<{ select: [index: number] }>();

const { t } = useLocale('filePreview');
const { token } = theme.useToken();

const id = `yss-fps-${Math.random().toString(36).slice(2, 10)}`;

const open = ref(false);
const query = ref('');
/** 键盘高亮的文件下标（原列表中的下标） */
const focusIndex = ref(props.activeIndex);
const triggerRef = ref<HTMLButtonElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const searchRef = ref<{ focus: () => void } | null>(null);

interface Row {
  index: number;
  name: string;
  stem: string;
  ext: string;
  kind: FileKind;
  support: FileSupport;
  size: string;
}

const nameOf = (item: FilePreviewItem, index: number) =>
  resolveItemName(item) || (index === props.activeIndex ? props.currentName : '') || t('untitled');

const allRows = computed<Row[]>(() =>
  props.items.map((item, index) => {
    const name = nameOf(item, index);
    const type = resolveItemType(item, name);
    const bytes = resolveItemSize(item);
    return {
      index,
      name,
      ...splitFileName(name),
      kind: fileKindOf(type),
      support: fileSupportOf(type),
      size: bytes === undefined ? '' : formatFileSize(bytes),
    };
  })
);

const searchable = computed(() => props.items.length >= SEARCH_THRESHOLD);

const rows = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return allRows.value;
  return allRows.value.filter(row => row.name.toLowerCase().includes(keyword));
});

const current = computed(() => allRows.value[props.activeIndex]);

const optionId = (index: number) => `${id}-opt-${index}`;
const activeDescendant = computed(() =>
  rows.value.some(row => row.index === focusIndex.value) ? optionId(focusIndex.value) : undefined
);

const tagOf = (support: FileSupport) =>
  support === 'legacy' ? t('switcherLegacy') : support === 'unsupported' ? t('switcherUnsupported') : '';

const optionLabel = (row: Row) =>
  [row.name, row.size, tagOf(row.support), t('counter', { current: row.index + 1, total: props.items.length })]
    .filter(Boolean)
    .join(', ');

/** 主题 Token：随 ConfigProvider（含暗色算法）变化 */
const vars = computed(() => {
  const tk = token.value;
  return {
    '--yss-fps-bg': tk.colorBgElevated,
    '--yss-fps-shadow': tk.boxShadowSecondary,
    '--yss-fps-radius': `${tk.borderRadiusLG}px`,
    '--yss-fps-radius-sm': `${tk.borderRadius}px`,
    '--yss-fps-hover': tk.colorFillTertiary,
    '--yss-fps-item-hover': tk.controlItemBgHover,
    '--yss-fps-item-active': tk.controlItemBgActive,
    '--yss-fps-item-active-hover': tk.controlItemBgActiveHover,
    '--yss-fps-primary': tk.colorPrimary,
    '--yss-fps-focus': tk.colorPrimaryBorder,
    '--yss-fps-text': tk.colorText,
    '--yss-fps-text-secondary': tk.colorTextSecondary,
    '--yss-fps-text-tertiary': tk.colorTextTertiary,
    '--yss-fps-split': tk.colorSplit,
    '--yss-fps-warning': tk.colorWarningText,
    '--yss-fps-warning-bg': tk.colorWarningBg,
    '--yss-fps-muted-bg': tk.colorFillQuaternary,
  } as Record<string, string>;
});

/** 下拉的挂载节点：弹窗传入它的浮层挂载层（全屏、页面滚动时按视口定位），否则挂到 body */
const popupContainer = (trigger: HTMLElement) => props.popupContainer?.(trigger) ?? document.body;

/** 让高亮项出现在列表可见范围内；center 为 true 时居中（打开下拉时定位当前文件） */
const scrollToFocus = (center = false) => {
  const list = listRef.value;
  const el = list?.querySelector<HTMLElement>(`#${optionId(focusIndex.value)}`);
  if (!list || !el) return;
  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;
  if (center) list.scrollTop = Math.max(0, top - (list.clientHeight - el.offsetHeight) / 2);
  else if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
};

/** 下拉是异步渲染并带动画的：等列表真正显示后再聚焦并滚动到当前文件 */
let focusTimer = 0;
const focusPanel = (tries = 30) => {
  cancelAnimationFrame(focusTimer);
  const list = listRef.value;
  const visible = !!list && list.isConnected && (list.offsetParent !== null || list.getClientRects().length > 0);
  if (!open.value) return;
  if (!visible && tries > 0) {
    focusTimer = requestAnimationFrame(() => focusPanel(tries - 1));
    return;
  }
  if (searchable.value && searchRef.value) searchRef.value.focus();
  else list?.focus({ preventScroll: true });
  scrollToFocus(true);
};

watch(open, value => {
  if (!value) {
    cancelAnimationFrame(focusTimer);
    return;
  }
  query.value = '';
  focusIndex.value = props.activeIndex;
  nextTick(() => focusPanel());
});

watch(rows, list => {
  if (!list.length) return;
  if (!list.some(row => row.index === focusIndex.value)) focusIndex.value = list[0].index;
});

const close = (restoreFocus = true) => {
  open.value = false;
  if (restoreFocus) nextTick(() => triggerRef.value?.focus());
};

const pick = (index: number) => {
  close();
  if (index !== props.activeIndex) emit('select', index);
};

const move = (offset: number | 'first' | 'last') => {
  const list = rows.value;
  if (!list.length) return;
  const at = list.findIndex(row => row.index === focusIndex.value);
  let next: number;
  if (offset === 'first') next = 0;
  else if (offset === 'last') next = list.length - 1;
  else next = Math.min(Math.max((at < 0 ? 0 : at) + offset, 0), list.length - 1);
  focusIndex.value = list[next].index;
  nextTick(() => scrollToFocus());
};

const PAGE = 8;

/** 下拉内的按键全部在这里处理并阻止冒泡：Esc 不关闭弹窗，左右键不切换文件 */
const handlePanelKeydown = (event: KeyboardEvent) => {
  const inInput = (event.target as HTMLElement | null)?.tagName === 'INPUT';
  const handled = () => {
    event.preventDefault();
  };
  switch (event.key) {
    case 'ArrowDown':
      handled();
      move(1);
      break;
    case 'ArrowUp':
      handled();
      move(-1);
      break;
    case 'PageDown':
      handled();
      move(PAGE);
      break;
    case 'PageUp':
      handled();
      move(-PAGE);
      break;
    case 'Home':
      if (inInput) break;
      handled();
      move('first');
      break;
    case 'End':
      if (inInput) break;
      handled();
      move('last');
      break;
    case 'Enter':
      handled();
      if (rows.value.some(row => row.index === focusIndex.value)) pick(focusIndex.value);
      break;
    case ' ':
      if (inInput) break;
      handled();
      pick(focusIndex.value);
      break;
    case 'Escape':
      handled();
      close();
      break;
    case 'Tab':
      handled();
      close();
      break;
    default:
      break;
  }
  event.stopPropagation();
};

const handleTriggerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    open.value = true;
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

onBeforeUnmount(() => cancelAnimationFrame(focusTimer));

defineExpose({ open: () => (open.value = true), close: () => close(false) });
</script>

<template>
  <Dropdown
    v-model:open="open"
    :trigger="['click']"
    placement="bottomLeft"
    :get-popup-container="popupContainer"
    overlay-class-name="yss-file-preview-switcher-popup"
    destroy-popup-on-hide
  >
    <button
      ref="triggerRef"
      type="button"
      class="yss-file-preview-switcher"
      :class="{ 'is-open': open }"
      :style="vars"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? `${id}-list` : undefined"
      :aria-label="t('switcherLabel', { name: current?.name ?? '', current: activeIndex + 1, total: items.length })"
      :title="current?.name"
      @keydown="handleTriggerKeydown"
    >
      <FileTypeIcon class="yss-file-preview-switcher__icon" :kind="current?.kind ?? 'unknown'" />
      <span class="yss-file-preview-switcher__name">
        <span class="yss-file-preview-switcher__stem">{{ current?.stem }}</span>
        <span v-if="current?.ext" class="yss-file-preview-switcher__ext">{{ current.ext }}</span>
      </span>
      <DownOutlined class="yss-file-preview-switcher__chevron" aria-hidden="true" />
    </button>
    <template #overlay>
      <div class="yss-file-preview-switcher__panel" :style="vars" @keydown="handlePanelKeydown">
        <div v-if="searchable" class="yss-file-preview-switcher__search">
          <Input
            ref="searchRef"
            v-model:value="query"
            size="small"
            allow-clear
            role="combobox"
            :placeholder="t('switcherSearch')"
            :aria-label="t('switcherSearch')"
            aria-expanded="true"
            :aria-controls="`${id}-list`"
            :aria-activedescendant="activeDescendant"
            aria-autocomplete="list"
          >
            <template #prefix><SearchOutlined aria-hidden="true" /></template>
          </Input>
        </div>
        <ul
          :id="`${id}-list`"
          ref="listRef"
          class="yss-file-preview-switcher__list"
          role="listbox"
          :tabindex="searchable ? -1 : 0"
          :aria-label="t('switcherList', { total: items.length })"
          :aria-activedescendant="searchable ? undefined : activeDescendant"
        >
          <li
            v-for="row in rows"
            :id="optionId(row.index)"
            :key="row.index"
            role="option"
            class="yss-file-preview-switcher__option"
            :class="{
              'is-current': row.index === activeIndex,
              'is-focused': row.index === focusIndex,
              'is-muted': row.support === 'unsupported' || row.support === 'legacy',
            }"
            :aria-selected="row.index === activeIndex"
            :aria-label="optionLabel(row)"
            :title="row.name"
            @click="pick(row.index)"
            @mousemove="focusIndex = row.index"
          >
            <FileTypeIcon class="yss-file-preview-switcher__option-icon" :kind="row.kind" />
            <span class="yss-file-preview-switcher__option-main">
              <span class="yss-file-preview-switcher__name">
                <span class="yss-file-preview-switcher__stem">{{ row.stem }}</span>
                <span v-if="row.ext" class="yss-file-preview-switcher__ext">{{ row.ext }}</span>
              </span>
              <span v-if="row.size || tagOf(row.support)" class="yss-file-preview-switcher__meta">
                <span v-if="row.size">{{ row.size }}</span>
                <span v-if="tagOf(row.support)" class="yss-file-preview-switcher__tag">{{ tagOf(row.support) }}</span>
              </span>
            </span>
            <CheckOutlined
              v-if="row.index === activeIndex"
              class="yss-file-preview-switcher__check"
              aria-hidden="true"
            />
          </li>
        </ul>
        <div v-if="!rows.length" class="yss-file-preview-switcher__empty" role="status">
          {{ t('switcherNoMatch') }}
        </div>
      </div>
    </template>
  </Dropdown>
</template>
