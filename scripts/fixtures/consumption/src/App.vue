<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue';
import { YButton, YCard } from '@yss-ui/components';
const current = ref('');
const pages = {
  table: defineAsyncComponent(() => import('./Table.vue')),
  form: defineAsyncComponent(() => import('./Form.vue')),
  chart: defineAsyncComponent(() => import('./Chart.vue')),
};
</script>
<template>
  <YCard
    ><YButton @click="current = 'table'">Table</YButton><YButton @click="current = 'form'">Form</YButton
    ><YButton @click="current = 'chart'">Chart</YButton>
    <p id="ready">Button ready</p>
    <component v-if="current" :is="pages[current]"
  /></YCard>
</template>
