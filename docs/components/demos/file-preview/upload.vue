<template>
  <!-- 跟随文档站的明暗主题；业务项目通常在应用根部配置一次 ConfigProvider -->
  <a-config-provider :theme="{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }">
    <UploadPanel />
  </a-config-provider>
</template>

<script setup lang="ts">
import { ConfigProvider as AConfigProvider, theme } from 'ant-design-vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import UploadPanel from './upload-panel.vue';

const isDarkSite = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-prefers-color') === 'dark';

const dark = ref(isDarkSite());
let observer: MutationObserver | null = null;

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(() => {
    dark.value = isDarkSite();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-prefers-color'] });
});

onBeforeUnmount(() => observer?.disconnect());
</script>
