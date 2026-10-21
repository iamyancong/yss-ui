<script setup lang="ts">
/**
 * 按文件类别显示的彩色图标（内部组件）。
 * 颜色取自 ant-design-vue 主题 Token 的预设色板（随 ConfigProvider 主题变化），用于区分文件类别，与主色无关。
 */
import {
  FileExcelOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FileZipOutlined,
} from '@ant-design/icons-vue';
import { theme } from 'ant-design-vue';
import { computed, type Component } from 'vue';
import type { FileKind } from '../utils/kind';

defineOptions({ name: 'YFilePreviewTypeIcon' });

const props = defineProps<{ kind: FileKind }>();

const { token } = theme.useToken();

const ICONS: Record<FileKind, Component> = {
  pdf: FilePdfOutlined,
  word: FileWordOutlined,
  excel: FileExcelOutlined,
  ppt: FilePptOutlined,
  image: FileImageOutlined,
  csv: FileExcelOutlined,
  markdown: FileMarkdownOutlined,
  text: FileTextOutlined,
  archive: FileZipOutlined,
  unknown: FileOutlined,
};

const color = computed(() => {
  const t = token.value as unknown as Record<string, string>;
  const map: Record<FileKind, string | undefined> = {
    pdf: t.red,
    word: t.blue,
    excel: t.green,
    ppt: t.orange,
    image: t.purple,
    csv: t.cyan,
    markdown: t.geekblue,
    text: t.colorTextSecondary,
    archive: t.gold,
    unknown: t.colorTextTertiary,
  };
  return map[props.kind] ?? t.colorTextTertiary;
});
</script>

<template>
  <component
    :is="ICONS[kind] ?? FileOutlined"
    class="yss-file-preview-type-icon"
    :data-kind="kind"
    :style="{ color }"
    aria-hidden="true"
  />
</template>
