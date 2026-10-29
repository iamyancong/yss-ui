<script setup lang="ts">
import {
  ApiOutlined,
  CloseCircleOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import { Button, Spin } from 'ant-design-vue';
import { computed, inject, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import { useLocale } from '../locale/useLocale';
import {
  DEFAULT_EXCEL_MAX_CELLS,
  DEFAULT_LARGE_FILE_WARN_SIZE,
  DEFAULT_CSV_MAX_ROWS,
  DEFAULT_LOAD_TIMEOUT,
  DEFAULT_MAX_FILE_SIZE,
  formatFileSize,
  IMAGE_MAX_PIXELS,
  LEGACY_OFFICE_TYPES,
  resolveMaxSize,
  SUPPORTED_FILE_TYPES,
} from './constant';
import { useFileRenderer } from './hooks/useFileRenderer';
import { FILE_PREVIEW_ZOOM_HOST, usePreviewZoom } from './hooks/usePreviewZoom';
import { getCustomRendererTypes } from './renderers/registry';
import type { FilePreviewTranslate } from './renderers/types';
import type { FilePreviewEmits, FilePreviewExpose, FilePreviewProps } from './types';

defineOptions({ name: 'YFilePreview' });

const props = withDefaults(defineProps<FilePreviewProps>(), {
  fileName: undefined,
  fileType: undefined,
  maxSize: DEFAULT_MAX_FILE_SIZE,
  largeFileWarnSize: DEFAULT_LARGE_FILE_WARN_SIZE,
  excelMaxCells: undefined,
  textEncoding: 'auto',
  csvMode: 'table',
  csvRowNumber: false,
  csvMaxRows: DEFAULT_CSV_MAX_ROWS,
  timeout: DEFAULT_LOAD_TIMEOUT,
  height: '100%',
  showDownload: true,
  customDownload: undefined,
  zoomable: true,
  zoom: undefined,
  zoomMin: undefined,
  zoomMax: undefined,
  zoomStep: 0.1,
  zoomFit: 'none',
});

const emit = defineEmits<FilePreviewEmits>();

const { t: translate, localeName } = useLocale('filePreview');
const t: FilePreviewTranslate = (key, params) => translate(key, params);

const containerRef = ref<HTMLElement | null>(null);

const {
  status,
  error,
  progress,
  parseProgress,
  unsupportedType,
  mismatchType,
  missingPackage,
  detectedType,
  fileName,
  fileSize,
  largeFile,
  continuePreview,
  render,
  download,
  zoomController,
} = useFileRenderer({
  props,
  emit,
  containerRef,
  t,
  locale: () => localeName.value,
  zoomContext: type => zoom.zoomContext(type),
});

const zoom = usePreviewZoom({
  props,
  emit,
  controller: zoomController,
  status,
  detectedType,
  externalControl: inject(FILE_PREVIEW_ZOOM_HOST, false),
});
onBeforeUnmount(zoom.dispose);

onMounted(() => {
  void render();
});

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

const supportedTypesText = computed(() =>
  [...new Set([...SUPPORTED_FILE_TYPES, ...getCustomRendererTypes()])].join(', ')
);

/**
 * 未启用的 pptx 提示如何启用；旧版办公格式（doc / ppt 等）提示改由后端转换；其他格式列出支持的类型
 */
const unsupportedDescText = computed(() => {
  const type = unsupportedType.value.toLowerCase();
  if (type === 'pptx') return t('pptxOptInDesc');
  if (LEGACY_OFFICE_TYPES.includes(type)) return t('legacyDesc', { type: unsupportedType.value });
  return t('unsupportedDesc', { types: supportedTypesText.value });
});

interface Notice {
  icon: Component;
  tone: 'warning' | 'error' | 'info';
  title: string;
  desc: string;
  downloadText: string;
  primary: boolean;
  /** 大文件提示：显示「继续预览」 */
  continueText?: string;
}

/** 单元格数按当前语言加千分位 */
const formatCount = (n: number | undefined) => {
  try {
    return Math.round(n ?? 0).toLocaleString(localeName.value || undefined);
  } catch {
    return String(Math.round(n ?? 0));
  }
};

/** 按单元格数超限时的说明 */
const oversizeDescText = () => {
  const info = largeFile.value;
  if (info?.reason === 'dimension') return t('oversizeDimensionDesc');
  if (info?.reason === 'pixels') {
    return t('oversizeImageDesc', {
      width: formatCount(info.width),
      height: formatCount(info.height),
      limit: formatCount(IMAGE_MAX_PIXELS),
    });
  }
  if (info?.reason === 'cells') {
    const limit = props.excelMaxCells;
    const max = typeof limit === 'object' && limit ? limit.max : limit;
    return t('oversizeCellsDesc', {
      cells: formatCount(info.cells),
      limit: formatCount(typeof max === 'number' && max > 0 ? max : DEFAULT_EXCEL_MAX_CELLS),
    });
  }
  return t('oversizeDesc', {
    size: formatFileSize(fileSize.value),
    limit: formatFileSize(resolveMaxSize(props.maxSize)),
  });
};

/** 大文件提示的说明：单元格数、页数或文件大小 */
const largeFileDescText = () => {
  const info = largeFile.value;
  const size = formatFileSize(fileSize.value);
  if (info?.reason === 'cells') return t('largeFileCellsDesc', { cells: formatCount(info.cells), size });
  if (info?.reason === 'pages') return t('largeFilePagesDesc', { pages: formatCount(info.pages), size });
  return t('largeFileSizeDesc', { size });
};

/** 下载进度（超过 5MB 时显示）；下载完成后显示渲染器报告的解析进度 */
const loadingText = computed(() => {
  const p = progress.value;
  const parsed = parseProgress.value;
  if (!p && parsed !== null) return t('parsingProgress', { percent: Math.floor(parsed * 100) });
  if (!p) return t('loading');
  return p.total
    ? t('loadingProgress', { loaded: formatFileSize(p.loaded), total: formatFileSize(p.total) })
    : t('loadingProgressUnknown', { loaded: formatFileSize(p.loaded) });
});

/** 超限、空文件、内容不符、缺依赖四种提示 */
const notice = computed<Notice | null>(() => {
  switch (status.value) {
    case 'oversize':
      return {
        icon: WarningOutlined,
        tone: 'warning',
        title: t('oversizeTitle'),
        desc: oversizeDescText(),
        downloadText: t('download'),
        primary: true,
      };
    case 'large-file':
      return {
        icon: WarningOutlined,
        tone: 'warning',
        title: t('largeFileTitle'),
        desc: largeFileDescText(),
        downloadText: t('download'),
        primary: false,
        continueText: t('continuePreview'),
      };
    case 'empty':
      return {
        icon: FileOutlined,
        tone: 'info',
        title: t('emptyTitle'),
        desc: t('emptyDesc'),
        downloadText: t('downloadAnyway'),
        primary: false,
      };
    case 'mismatch':
      return {
        icon: StopOutlined,
        tone: 'error',
        title: t('mismatchTitle'),
        desc: t('mismatchDesc', { type: mismatchType.value }),
        downloadText: t('download'),
        primary: false,
      };
    case 'missing-dependency':
      return {
        icon: ApiOutlined,
        tone: 'warning',
        title: t('missingDepTitle'),
        desc: t('missingDepDesc', { pkg: missingPackage.value }),
        downloadText: t('download'),
        primary: false,
      };
    default:
      return null;
  }
});

defineExpose<FilePreviewExpose>({
  reload: render,
  getFileName: () => fileName.value,
  getFileType: () => detectedType.value,
  getStatus: () => status.value,
  download,
  zoomState: zoom.state,
  setZoom: zoom.setZoom,
  zoomIn: zoom.zoomIn,
  zoomOut: zoom.zoomOut,
  resetZoom: zoom.resetZoom,
  fitZoom: zoom.fitZoom,
});
</script>

<template>
  <div
    class="yss-file-preview"
    :class="`yss-file-preview--${status}`"
    :style="rootStyle"
    @keydown="zoom.handleKeydown"
    @wheel.capture="zoom.handleWheel"
    @gesturestart="zoom.handleGestureStart"
    @gesturechange="zoom.handleGestureChange"
    @gestureend="zoom.handleGestureEnd"
    @touchstart.passive="zoom.handleTouchStart"
    @touchmove="zoom.handleTouchMove"
    @touchend.passive="zoom.handleTouchEnd"
    @touchcancel.passive="zoom.handleTouchEnd"
  >
    <slot
      name="toolbar"
      :file-name="fileName"
      :file-type="detectedType"
      :status="status"
      :download="download"
      :reload="render"
      :zoom="zoom.state"
      :set-zoom="zoom.setZoom"
      :zoom-in="zoom.zoomIn"
      :zoom-out="zoom.zoomOut"
      :reset-zoom="zoom.resetZoom"
      :fit-zoom="zoom.fitZoom"
    />

    <div class="yss-file-preview__body">
      <!-- 渲染容器始终可见，保证 canvas / iframe 渲染时能拿到真实尺寸 -->
      <div ref="containerRef" class="yss-file-preview__content" />

      <div v-if="status === 'loading'" class="yss-file-preview__overlay" role="status" aria-live="polite">
        <slot name="loading">
          <Spin :tip="loadingText" />
        </slot>
      </div>

      <div v-else-if="notice" class="yss-file-preview__overlay yss-file-preview__state" role="status">
        <component
          :is="notice.icon"
          class="yss-file-preview__icon"
          :class="`yss-file-preview__icon--${notice.tone}`"
          aria-hidden="true"
        />
        <div class="yss-file-preview__title">{{ notice.title }}</div>
        <div class="yss-file-preview__desc">
          <template v-if="status === 'missing-dependency'">
            {{ notice.desc }}
            <code class="yss-file-preview__code">pnpm add {{ missingPackage }}</code>
          </template>
          <template v-else>{{ notice.desc }}</template>
        </div>
        <div v-if="notice.continueText" class="yss-file-preview__actions">
          <Button v-if="showDownload" @click="download">{{ notice.downloadText }}</Button>
          <Button type="primary" @click="continuePreview">{{ notice.continueText }}</Button>
        </div>
        <Button v-else-if="showDownload" :type="notice.primary ? 'primary' : 'default'" @click="download">
          {{ notice.downloadText }}
        </Button>
      </div>

      <div v-else-if="status === 'unsupported'" class="yss-file-preview__overlay yss-file-preview__state" role="status">
        <slot name="unsupported" :type="unsupportedType" :download="download">
          <QuestionCircleOutlined class="yss-file-preview__icon" aria-hidden="true" />
          <div class="yss-file-preview__title">{{ t('unsupportedTitle', { type: unsupportedType }) }}</div>
          <div class="yss-file-preview__desc">{{ unsupportedDescText }}</div>
          <Button v-if="showDownload" type="primary" @click="download">{{ t('download') }}</Button>
        </slot>
      </div>

      <div v-else-if="status === 'error'" class="yss-file-preview__overlay yss-file-preview__state" role="alert">
        <slot name="error" :error="error" :retry="render" :download="download">
          <CloseCircleOutlined class="yss-file-preview__icon yss-file-preview__icon--error" aria-hidden="true" />
          <div class="yss-file-preview__title">{{ t('errorTitle') }}</div>
          <div class="yss-file-preview__desc">{{ error?.message }}</div>
          <div class="yss-file-preview__actions">
            <Button @click="render">{{ t('retry') }}</Button>
            <Button v-if="showDownload" type="primary" @click="download">{{ t('download') }}</Button>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style lang="less">
@import url('./style.less');
</style>
