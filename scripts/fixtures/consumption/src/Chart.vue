<script setup lang="ts">
import { YEcharts } from 'virtual:yss-heavy-components';
</script>
<template>
  <YEcharts
    style="height: 240px"
    :options="{ xAxis: { data: ['A', 'B'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] }"
  />
</template>
