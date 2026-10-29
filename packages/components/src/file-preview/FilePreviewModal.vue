<script setup lang="ts">
import {
  CloseOutlined,
  DownloadOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import { Button, Modal, theme, Tooltip } from 'ant-design-vue';
import { computed, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue';
import { useLocale } from '../locale/useLocale';
import {
  DEFAULT_CSV_MAX_ROWS,
  DEFAULT_LARGE_FILE_WARN_SIZE,
  DEFAULT_LOAD_TIMEOUT,
  DEFAULT_MAX_FILE_SIZE,
  EXTENSION_TYPE_MAP,
} from './constant';
import FileSwitcher from './components/FileSwitcher.vue';
import ZoomControl from './components/ZoomControl.vue';
import { FILE_PREVIEW_ZOOM_HOST } from './hooks/usePreviewZoom';
import FilePreview from './index.vue';
import { hasCustomRenderer } from './renderers/registry';
import type {
  FilePreviewContext,
  FilePreviewCustomDownload,
  FilePreviewExpose,
  FilePreviewItem,
  FilePreviewLoadedPayload,
  FilePreviewModalEmits,
  FilePreviewModalExpose,
  FilePreviewModalProps,
  FilePreviewModalSlots,
  FileSource,
  FileSourceLoader,
  FilePreviewZoomInfo,
} from './types';
import { extractExtension } from './utils/detect';
import { MODAL_CLASSES, renderModalWithOwnClasses } from './utils/modalClasses';
import { createPopupLayer } from './utils/popupLayer';
import { isPreviewItem, resolveItemName } from './utils/item';
import { isTopmostModal, popModal, pushModal } from './utils/modalStack';
import { zoomShortcut } from './utils/zoom';

defineOptions({ name: 'YFilePreviewModal' });

const props = withDefaults(defineProps<FilePreviewModalProps>(), {
  open: false,
  files: () => [],
  index: 0,
  width: '85vw',
  title: undefined,
  showDownload: true,
  keyboard: true,
  maxSize: DEFAULT_MAX_FILE_SIZE,
  largeFileWarnSize: DEFAULT_LARGE_FILE_WARN_SIZE,
  excelMaxCells: undefined,
  textEncoding: 'auto',
  csvMode: 'table',
  csvRowNumber: false,
  csvMaxRows: DEFAULT_CSV_MAX_ROWS,
  timeout: DEFAULT_LOAD_TIMEOUT,
  getContainer: undefined,
  customDownload: undefined,
  fileSwitcher: true,
  loop: false,
  zoomable: true,
  zoom: undefined,
  zoomMin: undefined,
  zoomMax: undefined,
  zoomStep: 0.1,
  zoomFit: 'none',
});

const emit = defineEmits<FilePreviewModalEmits>();
defineSlots<FilePreviewModalSlots>();

const { t } = useLocale('filePreview');

const modalId = Symbol('YFilePreviewModal');
// 缩放控件显示在头部：内置渲染器不再显示自己的放大 / 缩小按钮
provide(FILE_PREVIEW_ZOOM_HOST, true);
const isFullscreen = ref(false);
const previewRef = ref<FilePreviewExpose | null>(null);

/**
 * 直接传入 File / URL / 函数时包一层 FilePreviewItem，并按来源复用，
 * 列表重新赋值时同一个文件仍是同一个对象（change 事件和懒加载缓存依赖对象引用）。
 */
let wrappedItems = new Map<unknown, FilePreviewItem>();
const items = computed(() => {
  const next = new Map<unknown, FilePreviewItem>();
  const list = props.files.map(file => {
    if (isPreviewItem(file)) return file;
    const item = wrappedItems.get(file) ?? { source: file };
    next.set(file, item);
    return item;
  });
  wrappedItems = next;
  return list;
});
const total = computed(() => items.value.length);

const innerIndex = ref(props.index);
watch(
  () => props.index,
  value => {
    innerIndex.value = value;
  }
);

/** 收敛到有效范围内的当前索引 */
const activeIndex = computed(() => {
  if (total.value === 0) return 0;
  const index = Number.isFinite(innerIndex.value) ? Math.trunc(innerIndex.value) : 0;
  return Math.min(Math.max(index, 0), total.value - 1);
});

const currentFile = computed<FilePreviewItem | undefined>(() => items.value[activeIndex.value]);
/** 上一个 / 下一个文件的下标；没有时为 -1。loop 开启且多于一个文件时首尾相接 */
const prevIndex = computed(() => {
  if (total.value < 2) return -1;
  if (activeIndex.value > 0) return activeIndex.value - 1;
  return props.loop ? total.value - 1 : -1;
});
const nextIndex = computed(() => {
  if (total.value < 2) return -1;
  if (activeIndex.value < total.value - 1) return activeIndex.value + 1;
  return props.loop ? 0 : -1;
});
const hasPrev = computed(() => prevIndex.value >= 0);
const hasNext = computed(() => nextIndex.value >= 0);

/** 最近一次渲染完成的文件及其识别结果（处理无后缀 PDF、懒加载来源的文件名） */
const loaded = shallowRef<{ file: FilePreviewItem; fileType: string; fileName: string } | null>(null);

const displayName = computed(() => {
  const file = currentFile.value;
  const name = resolveItemName(file) || (loaded.value && loaded.value.file === file ? loaded.value.fileName : '');
  return name || t('untitled');
});
const titleText = computed(() => props.title ?? (currentFile.value ? displayName.value : t('title')));
/** 多个文件且没有自定义 title 时，标题显示为文件切换下拉 */
const showSwitcher = computed(() => props.fileSwitcher && props.title === undefined && total.value > 1);

/* ---------------- 懒加载来源：同一次打开内缓存已解析的结果 ---------------- */

type ResolvedSource = Awaited<ReturnType<FileSourceLoader>>;
let loaderWrappers = new WeakMap<FilePreviewItem, FileSourceLoader>();
/** 只保留当前文件与相邻文件的结果：逐个翻看很多大文件时内存不会一直增长 */
const loaderResults = new Map<FilePreviewItem, ResolvedSource>();

/** 丢掉当前、上一个、下一个之外的懒加载结果 */
const pruneLoaderCache = () => {
  if (loaderResults.size === 0) return;
  const keep = new Set<FilePreviewItem | undefined>([
    currentFile.value,
    items.value[prevIndex.value],
    items.value[nextIndex.value],
  ]);
  for (const item of [...loaderResults.keys()]) if (!keep.has(item)) loaderResults.delete(item);
};

const sourceOf = (item: FilePreviewItem): FileSource => {
  const { source } = item;
  if (typeof source !== 'function') return source;
  let wrapper = loaderWrappers.get(item);
  if (!wrapper) {
    wrapper = async ({ signal }) => {
      const cached = loaderResults.get(item);
      if (cached !== undefined) return cached;
      // 业务 loader 收到的是调用方传入的原对象，可读取 id 等字段
      const result = await source({ signal, file: item });
      if (!signal.aborted) {
        loaderResults.set(item, result);
        pruneLoaderCache();
      }
      return result;
    };
    loaderWrappers.set(item, wrapper);
  }
  return wrapper;
};

const resetLoaderCache = () => {
  loaderWrappers = new WeakMap();
  loaderResults.clear();
};

watch(activeIndex, pruneLoaderCache);

/* ---------------- 导航与上下文 ---------------- */

/** 最近一次通知过 change 的文件 */
let lastFile: FilePreviewItem | undefined;

const goTo = (index: number) => {
  if (!Number.isFinite(index)) return;
  const target = Math.trunc(index);
  if (target < 0 || target >= total.value || target === activeIndex.value) return;
  keyboardOwnedByContent.value = false;
  innerIndex.value = target;
  emit('update:index', target);
  const file = items.value[target];
  if (file) {
    lastFile = file;
    emit('change', target, file, buildContext(file, target));
  }
};

const handlePrev = () => {
  if (hasPrev.value) goTo(prevIndex.value);
};
const handleNext = () => {
  if (hasNext.value) goTo(nextIndex.value);
};

/** 翻页按钮提示里显示的目标文件名 */
const nameAt = (index: number) => resolveItemName(items.value[index]) || t('untitled');
const prevLabel = computed(() => (hasPrev.value ? t('prevTo', { name: nameAt(prevIndex.value) }) : t('prev')));
const nextLabel = computed(() => (hasNext.value ? t('nextTo', { name: nameAt(nextIndex.value) }) : t('next')));

/**
 * 标题栏图标按钮（翻页、全屏、下载、关闭）统一的颜色与尺寸，取自主题 Token，暗色主题下同样适用。
 * 常态用次要文字色（与禁用色 colorTextDisabled 拉开差距），悬停用 colorIconHover + 填充背景
 */
const { token } = theme.useToken();
const headerStyle = computed(() => {
  const tk = token.value;
  return {
    '--yss-fpm-icon': tk.colorTextSecondary,
    '--yss-fpm-icon-hover': tk.colorIconHover,
    '--yss-fpm-icon-disabled': tk.colorTextDisabled,
    '--yss-fpm-icon-bg-hover': tk.colorFillTertiary,
    '--yss-fpm-icon-bg-active': tk.colorFill,
    '--yss-fpm-focus': tk.colorPrimaryBorder,
    '--yss-fpm-counter': tk.colorTextSecondary,
    '--yss-fpm-split': tk.colorSplit,
    '--yss-fpm-radius': `${tk.borderRadius}px`,
  };
});

/** 弹窗内 Tooltip / 下拉的挂载层：全屏、页面滚动时也按视口正确定位（见 utils/popupLayer） */
const resolveModalContainer = (): HTMLElement | null => {
  const target = props.getContainer;
  if (typeof target === 'function') return target();
  if (typeof target === 'string') return document.querySelector<HTMLElement>(target);
  if (target instanceof HTMLElement) return target;
  // 未设置或 false（就地渲染）时挂到 body
  return null;
};
const popupLayer = createPopupLayer(resolveModalContainer);
const getPopupContainer = (trigger?: HTMLElement | null) => popupLayer.getContainer(trigger);
const TOOLTIP_DELAY = 0.3;

const handleClose = () => {
  isFullscreen.value = false;
  emit('update:open', false);
  emit('close');
};

const download = async () => {
  await previewRef.value?.download();
};

const reload = async () => {
  const file = currentFile.value;
  if (file) loaderResults.delete(file);
  await previewRef.value?.reload();
};

function buildContext(file: FilePreviewItem, index: number): FilePreviewContext {
  return {
    file,
    index,
    total: total.value,
    status: previewRef.value?.getStatus() ?? 'idle',
    prev: handlePrev,
    next: handleNext,
    goTo,
    close: handleClose,
    download,
    reload,
  };
}

/** 插槽用的上下文（响应式：切换文件、状态变化时更新） */
const slotContext = computed(() => (currentFile.value ? buildContext(currentFile.value, activeIndex.value) : null));

const currentContext = () => buildContext(currentFile.value as FilePreviewItem, activeIndex.value);

/** customDownload 收到弹窗的上下文（原对象、下标、导航方法） */
const previewCustomDownload = computed<FilePreviewCustomDownload | undefined>(() => {
  const custom = props.customDownload;
  if (!custom) return undefined;
  return ctx => custom({ ...ctx, ...currentContext() });
});

const handleLoaded = (payload: FilePreviewLoadedPayload) => {
  const file = currentFile.value;
  if (!file) return;
  loaded.value = { file, fileType: String(payload.fileType), fileName: payload.fileName };
  emit('loaded', payload, currentContext());
};
const handleError = (error: Error) => {
  if (currentFile.value) emit('error', error, currentContext());
};
const handleUnsupported = (type: string) => {
  if (currentFile.value) emit('unsupported', type, currentContext());
};

/* ---------------- 缩放 ---------------- */

const zoomState = computed(() => previewRef.value?.zoomState ?? null);
const showZoom = computed(() => !!zoomState.value?.available);
const handleZoomUpdate = (zoom: number) => emit('update:zoom', zoom);
const handleZoomChange = (zoom: number, info: FilePreviewZoomInfo) => {
  if (currentFile.value) emit('zoom-change', zoom, info, currentContext());
};

/**
 * 列表变化时：下标越界自动收敛并通知 update:index；当前文件变了通知 change；列表清空时关闭弹窗。
 * 打开弹窗时只记录当前文件，不触发 change。
 */
watch(
  [() => props.open, currentFile],
  ([open, file], previous) => {
    const wasOpen = previous?.[0];
    if (!open) {
      lastFile = undefined;
      return;
    }
    if (!wasOpen) {
      lastFile = file;
      return;
    }
    if (total.value === 0) {
      handleClose();
      return;
    }
    if (innerIndex.value !== activeIndex.value) {
      innerIndex.value = activeIndex.value;
      emit('update:index', activeIndex.value);
    }
    if (file && file !== lastFile) {
      lastFile = file;
      emit('change', activeIndex.value, file, currentContext());
    }
  },
  { immediate: true }
);

/**
 * 当前文件是否由浏览器内置 PDF 查看器显示：查看器自带下载、打印、缩放，
 * 标题栏不再重复显示下载按钮。注册了自定义 pdf 渲染器、或配置了 customDownload
 * （内置查看器的下载无法拦截，会被隐藏）时不适用。
 */
const usesNativePdfViewer = computed(() => {
  const file = currentFile.value;
  if (!file || props.customDownload || hasCustomRenderer('pdf')) return false;
  if (loaded.value?.file === file) return loaded.value.fileType === 'pdf';
  const declared = file.fileType ?? EXTENSION_TYPE_MAP[extractExtension(resolveItemName(file))];
  return String(declared ?? '').toLowerCase() === 'pdf';
});

const showHeaderDownload = computed(() => props.showDownload && !!currentFile.value && !usesNativePdfViewer.value);

const wrapClassName = computed(
  () => `yss-file-preview-modal${isFullscreen.value ? ' yss-file-preview-modal--fullscreen' : ''}`
);

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

const handleDownload = () => download();

defineExpose<FilePreviewModalExpose>({
  prev: handlePrev,
  next: handleNext,
  goTo,
  download,
  reload,
});

/** 输入框、可编辑区域：方向键属于它们自己 */
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
/**
 * 自己处理方向键的区域：表格类控件，以及声明了 data-preview-keyboard="self" 的渲染器容器
 * （内置 Excel 渲染器会声明，x-spreadsheet 在 window 上监听方向键移动选区）。
 */
const KEYBOARD_OWNER_SELECTOR = '[data-preview-keyboard="self"], [role="grid"], [role="treegrid"]';

const closestFrom = (target: EventTarget | null, selector: string) => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest(selector));
};

/**
 * 最近一次点击是否落在自己处理方向键的区域里。
 * x-spreadsheet 的画布不可聚焦，键盘事件的 target 是 body，只能根据点击位置判断焦点在表格内。
 */
const keyboardOwnedByContent = ref(false);
const handlePointerDown = (event: PointerEvent) => {
  keyboardOwnedByContent.value = closestFrom(event.target, KEYBOARD_OWNER_SELECTOR);
};

/** 方向键切换文件：只有最上层的预览弹窗响应 */
const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.open || !isTopmostModal(modalId)) return;
  // Ctrl / ⌘ + = / - / 0 缩放（焦点在预览内容里时 YFilePreview 已处理并 preventDefault）
  const zoomKey = zoomShortcut(event);
  if (zoomKey) {
    if (event.defaultPrevented || !showZoom.value || closestFrom(event.target, EDITABLE_SELECTOR)) return;
    event.preventDefault();
    if (zoomKey === 'in') previewRef.value?.zoomIn();
    else if (zoomKey === 'out') previewRef.value?.zoomOut();
    else previewRef.value?.resetZoom();
    return;
  }
  if (!props.keyboard) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // 全屏时 Esc 先退出全屏（与浏览器原生全屏一致），再按一次才关闭弹窗。
  // 全屏期间 Modal 的 keyboard 关掉，Esc 会冒泡到这里；不看 defaultPrevented：
  // 页面上的全局快捷键（如文档站搜索框）常对 Esc 调用 preventDefault，Modal 自己关闭时也不看它
  if (event.key === 'Escape') {
    if (isFullscreen.value) {
      event.preventDefault();
      isFullscreen.value = false;
    }
    return;
  }
  if (event.defaultPrevented) return;
  if (closestFrom(event.target, EDITABLE_SELECTOR) || closestFrom(event.target, KEYBOARD_OWNER_SELECTOR)) return;
  if (keyboardOwnedByContent.value) return;
  if (event.key === 'ArrowLeft' && hasPrev.value) {
    event.preventDefault();
    handlePrev();
  } else if (event.key === 'ArrowRight' && hasNext.value) {
    event.preventDefault();
    handleNext();
  }
};

const activate = () => {
  pushModal(modalId);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('pointerdown', handlePointerDown, true);
};

const deactivate = () => {
  popModal(modalId);
  keyboardOwnedByContent.value = false;
  if (typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('pointerdown', handlePointerDown, true);
};

watch(
  () => props.open,
  open => {
    if (typeof window === 'undefined') return;
    if (open) {
      activate();
    } else {
      deactivate();
      isFullscreen.value = false;
      resetLoaderCache();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  deactivate();
  popupLayer.dispose();
});
</script>

<template>
  <Modal
    :open="open"
    :width="isFullscreen ? '100vw' : width"
    :footer="null"
    :destroy-on-close="true"
    :get-container="getContainer"
    :wrap-class-name="wrapClassName"
    :class="MODAL_CLASSES.dialog"
    :style="headerStyle"
    :modal-render="renderModalWithOwnClasses"
    :keyboard="keyboard && !isFullscreen"
    :closable="false"
    centered
    @cancel="handleClose"
    @after-close="popupLayer.dispose"
  >
    <template #title>
      <div class="yss-file-preview-modal__header" :style="headerStyle">
        <div class="yss-file-preview-modal__title">
          <FileSwitcher
            v-if="showSwitcher"
            :items="items"
            :active-index="activeIndex"
            :current-name="displayName"
            :popup-container="getPopupContainer"
            @select="goTo"
          />
          <span v-else class="yss-file-preview-modal__name" :title="titleText">{{ titleText }}</span>
          <div v-if="total > 1" class="yss-file-preview-modal__nav" role="group">
            <Tooltip
              :title="hasPrev ? prevLabel : undefined"
              placement="bottom"
              :mouse-enter-delay="TOOLTIP_DELAY"
              :get-popup-container="getPopupContainer"
              destroy-tooltip-on-hide
            >
              <Button
                type="text"
                class="yss-file-preview-modal__icon-btn"
                data-nav="prev"
                :disabled="!hasPrev"
                :aria-disabled="!hasPrev"
                :aria-label="prevLabel"
                @click="handlePrev"
              >
                <template #icon><LeftOutlined aria-hidden="true" /></template>
              </Button>
            </Tooltip>
            <span class="yss-file-preview-modal__counter" aria-live="polite">
              {{ t('counter', { current: activeIndex + 1, total }) }}
            </span>
            <Tooltip
              :title="hasNext ? nextLabel : undefined"
              placement="bottom"
              :mouse-enter-delay="TOOLTIP_DELAY"
              :get-popup-container="getPopupContainer"
              destroy-tooltip-on-hide
            >
              <Button
                type="text"
                class="yss-file-preview-modal__icon-btn"
                data-nav="next"
                :disabled="!hasNext"
                :aria-disabled="!hasNext"
                :aria-label="nextLabel"
                @click="handleNext"
              >
                <template #icon><RightOutlined aria-hidden="true" /></template>
              </Button>
            </Tooltip>
          </div>
        </div>
        <div class="yss-file-preview-modal__tools">
          <div v-if="$slots.actions && slotContext" class="yss-file-preview-modal__actions">
            <slot name="actions" v-bind="slotContext" />
          </div>
          <ZoomControl
            v-if="showZoom && zoomState"
            :value="zoomState.value"
            :min="zoomState.min"
            :max="zoomState.max"
            :can-fit="zoomState.canFit"
            :popup-container="getPopupContainer"
            @set="z => previewRef?.setZoom(z)"
            @zoom-in="previewRef?.zoomIn()"
            @zoom-out="previewRef?.zoomOut()"
            @fit="previewRef?.fitZoom('width')"
            @reset="previewRef?.resetZoom()"
          />
          <Tooltip
            :title="isFullscreen ? t('exitFullscreen') : t('fullscreen')"
            placement="bottom"
            :mouse-enter-delay="TOOLTIP_DELAY"
            :get-popup-container="getPopupContainer"
            destroy-tooltip-on-hide
          >
            <Button
              type="text"
              class="yss-file-preview-modal__icon-btn"
              data-tool="fullscreen"
              :aria-label="isFullscreen ? t('exitFullscreen') : t('fullscreen')"
              :aria-pressed="isFullscreen"
              @click="toggleFullscreen"
            >
              <template #icon>
                <FullscreenExitOutlined v-if="isFullscreen" aria-hidden="true" />
                <FullscreenOutlined v-else aria-hidden="true" />
              </template>
            </Button>
          </Tooltip>
          <Tooltip
            v-if="showHeaderDownload"
            :title="t('download')"
            placement="bottom"
            :mouse-enter-delay="TOOLTIP_DELAY"
            :get-popup-container="getPopupContainer"
            destroy-tooltip-on-hide
          >
            <Button
              type="text"
              class="yss-file-preview-modal__icon-btn"
              data-tool="download"
              :aria-label="t('download')"
              @click="handleDownload"
            >
              <template #icon><DownloadOutlined aria-hidden="true" /></template>
            </Button>
          </Tooltip>
          <span class="yss-file-preview-modal__divider" aria-hidden="true" />
          <Tooltip
            :title="t('close')"
            placement="bottomRight"
            :mouse-enter-delay="TOOLTIP_DELAY"
            :get-popup-container="getPopupContainer"
            destroy-tooltip-on-hide
          >
            <Button
              type="text"
              class="yss-file-preview-modal__icon-btn"
              data-tool="close"
              :aria-label="t('close')"
              @click="handleClose"
            >
              <template #icon><CloseOutlined aria-hidden="true" /></template>
            </Button>
          </Tooltip>
        </div>
      </div>
    </template>

    <div class="yss-file-preview-modal__body">
      <FilePreview
        v-if="currentFile"
        ref="previewRef"
        :source="sourceOf(currentFile)"
        :file-name="currentFile.fileName"
        :file-type="currentFile.fileType"
        :max-size="maxSize"
        :large-file-warn-size="largeFileWarnSize"
        :excel-max-cells="excelMaxCells"
        :text-encoding="textEncoding"
        :csv-mode="csvMode"
        :csv-row-number="csvRowNumber"
        :csv-max-rows="csvMaxRows"
        :timeout="timeout"
        :show-download="showDownload"
        :custom-download="previewCustomDownload"
        :zoomable="zoomable"
        :zoom="zoom"
        :zoom-min="zoomMin"
        :zoom-max="zoomMax"
        :zoom-step="zoomStep"
        :zoom-fit="zoomFit"
        height="100%"
        @update:zoom="handleZoomUpdate"
        @zoom-change="handleZoomChange"
        @loaded="handleLoaded"
        @error="handleError"
        @unsupported="handleUnsupported"
      />
    </div>
  </Modal>
</template>
