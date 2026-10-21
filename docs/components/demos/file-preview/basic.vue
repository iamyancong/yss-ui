<template>
  <div class="demo-file-preview-basic">
    <div class="demo-file-preview-basic__toolbar">
      <a-radio-group v-model:value="current" button-style="solid">
        <a-radio-button v-for="key in keys" :key="key" :value="key">{{ key }}</a-radio-button>
      </a-radio-group>
      <a-button @click="modalOpen = true">在弹窗中打开</a-button>
    </div>

    <YFilePreview
      class="demo-file-preview-basic__preview"
      :source="file.source"
      :file-name="file.fileName"
      :height="480"
      @loaded="onLoaded"
    />

    <YFilePreviewModal v-model:open="modalOpen" :files="[file]" />
  </div>
</template>

<script setup lang="ts">
import { YFilePreview, YFilePreviewModal, type FilePreviewLoadedPayload } from '@yss-ui/components/file-preview';
import { registerPptxRenderer } from '@yss-ui/components/file-preview/pptx';
import { Button as AButton, message, RadioButton as ARadioButton, RadioGroup as ARadioGroup } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { sampleFiles } from './samples';

// pptx 为实验性能力，需要安装 @aiden0z/pptx-renderer 并启用；业务项目在 main.ts 调用一次即可
registerPptxRenderer();

type SampleKey = keyof typeof sampleFiles;

const keys = Object.keys(sampleFiles) as SampleKey[];
const current = ref<SampleKey>('pdf');
const modalOpen = ref(false);
const file = computed(() => sampleFiles[current.value]);

const onLoaded = (payload: FilePreviewLoadedPayload) => {
  message.success(`${payload.fileName} (${payload.fileType})`);
};
</script>

<style scoped>
.demo-file-preview-basic {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-file-preview-basic__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.demo-file-preview-basic__preview {
  border: 1px solid var(--ant-border-color-split, rgb(5 5 5 / 6%));
  border-radius: 6px;
}
</style>
