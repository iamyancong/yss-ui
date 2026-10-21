<template>
  <a-space>
    <a-button type="primary" @click="openAt(0)">预览 3 个文件</a-button>
    <span>当前第 {{ index + 1 }} 个，键盘 ← → 切换，Esc 关闭</span>
  </a-space>

  <YFilePreviewModal v-model:open="open" v-model:index="index" :files="files" @change="onChange" />
</template>

<script setup lang="ts">
import { YFilePreviewModal, type FilePreviewItem } from '@yss-ui/components/file-preview';
import { Button as AButton, message, Space as ASpace } from 'ant-design-vue';
import { ref } from 'vue';
import { sampleFiles, sampleJpg } from './samples';

const files: FilePreviewItem[] = [sampleFiles.docx, sampleFiles.xlsx, sampleJpg, sampleFiles.txt];
const open = ref(false);
const index = ref(0);

const openAt = (value: number) => {
  index.value = value;
  open.value = true;
};

const onChange = (value: number, file: FilePreviewItem) => {
  message.info(`切换到第 ${value + 1} 个：${file.fileName}`);
};
</script>
