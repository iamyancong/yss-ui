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
import { computed, onMounted, ref, type Component } from 'vue';
import { useLocale } from '../locale/useLocale';
import { DEFAULT_MAX_FILE_SIZE, formatFileSize, LEGACY_OFFICE_TYPES, SUPPORTED_FILE_TYPES } from './constant';
import { useFileRenderer } from './hooks/useFileRenderer';
import { getCustomRendererTypes } from './renderers/registry';
import type { FilePreviewTranslate } from './renderers/types';
import type { FilePreviewEmits, FilePreviewExpose, FilePreviewProps } from './types';

defineOptions({ name: 'YFilePreview' });

const props = withDefaults(defineProps<FilePreviewProps>(), {
  fileName: undefined,
  fileType: undefined,
  maxSize: DEFAULT_MAX_FILE_SIZE,
  textEncoding: 'auto',
  csvMode: 'table',
  csvRowNumber: false,
  height: '100%',
  showDownload: true,
  customDownload: undefined,
});

const emit = defineEmits<FilePreviewEmits>();

const { t: translate, localeName } = useLocale('filePreview');
const t: FilePreviewTranslate = (key, params) => translate(key, params);

const containerRef = ref<HTMLElement | null>(null);

const {
  status,
  error,
  unsupportedType,
  mismatchType,
  missingPackage,
  detectedType,
  fileName,
  fileSize,
  render,
  download,
} = useFileRenderer({ props, emit, containerRef, t, locale: () => localeName.value });

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
}

/** 超限、空文件、内容不符、缺依赖四种提示 */
const notice = computed<Notice | null>(() => {
  switch (status.value) {
    case 'oversize':
      return {
        icon: WarningOutlined,
        tone: 'warning',
        title: t('oversizeTitle'),
        desc: t('oversizeDesc', { size: formatFileSize(fileSize.value), limit: formatFileSize(props.maxSize) }),
        downloadText: t('download'),
        primary: true,
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
});
</script>

<template>
  <div class="yss-file-preview" :class="`yss-file-preview--${status}`" :style="rootStyle">
    <slot
      name="toolbar"
      :file-name="fileName"
      :file-type="detectedType"
      :status="status"
      :download="download"
      :reload="render"
    />

    <div class="yss-file-preview__body">
      <!-- 渲染容器始终可见，保证 canvas / iframe 渲染时能拿到真实尺寸 -->
      <div ref="containerRef" class="yss-file-preview__content" />

      <div v-if="status === 'loading'" class="yss-file-preview__overlay" role="status" aria-live="polite">
        <slot name="loading">
          <Spin :tip="t('loading')" />
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
        <Button v-if="showDownload" :type="notice.primary ? 'primary' : 'default'" @click="download">
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
