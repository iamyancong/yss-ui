<script setup lang="ts">
import { YFormily } from '@yss-ui/components';
const schema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name', 'x-decorator': 'FormItem', 'x-component': 'Input' } },
};
</script>
<template><YFormily :schema="schema" /></template>
