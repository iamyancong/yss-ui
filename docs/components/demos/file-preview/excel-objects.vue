<template>
  <div class="demo-file-preview-excel-objects">
    <a-radio-group v-model:value="current" button-style="solid">
      <a-radio-button v-for="key in keys" :key="key" :value="key">{{ labels[key] }}</a-radio-button>
    </a-radio-group>

    <YFilePreview
      class="demo-file-preview-excel-objects__preview"
      :source="file.source"
      :file-name="file.fileName"
      :height="560"
    />
  </div>
</template>

<script setup lang="ts">
import { YFilePreview } from '@yss-ui/components/file-preview';
import { RadioButton as ARadioButton, RadioGroup as ARadioGroup } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { excelObjectSamples } from './samples';

type SampleKey = keyof typeof excelObjectSamples;

const labels: Record<SampleKey, string> = {
  charts: '图表',
  objects: '图片与形状',
};

const keys = Object.keys(excelObjectSamples) as SampleKey[];
const current = ref<SampleKey>('charts');
const file = computed(() => excelObjectSamples[current.value]);
</script>

<style scoped>
.demo-file-preview-excel-objects {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-file-preview-excel-objects__preview {
  border: 1px solid var(--ant-border-color-split, rgb(5 5 5 / 6%));
  border-radius: 6px;
}
</style>
