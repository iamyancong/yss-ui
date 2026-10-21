<template>
  <a-space wrap>
    <a-button @click="openSingle">open() 预览单个文件</a-button>
    <a-button @click="openMany">openList() 从第 2 个开始</a-button>
  </a-space>
</template>

<script setup lang="ts">
import { useFilePreview } from '@yss-ui/components/file-preview';
import { Button as AButton, Space as ASpace } from 'ant-design-vue';
import { sampleFiles } from './samples';

const { open, openList } = useFilePreview();

const openSingle = () => {
  open(sampleFiles.pdf.source, { fileName: sampleFiles.pdf.fileName });
};

const openMany = () => {
  openList([sampleFiles.csv, sampleFiles.xlsx, sampleFiles.docx], 1, { width: '70vw' });
};
</script>
