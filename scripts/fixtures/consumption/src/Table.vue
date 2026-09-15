<script setup lang="ts">
import { YTable, YEditTable, YConfigProvider, setGlobalLocale } from '@yss-ui/components';
import { YTable as SubTable } from '@yss-ui/components/table';
import { getGlobalLocale } from '@yss-ui/components/locale';
if (YTable !== SubTable) throw new Error('Table identity mismatch');
setGlobalLocale('en-US');
if (getGlobalLocale().name !== 'en-US') throw new Error('Locale identity mismatch');
</script>
<template>
  <YConfigProvider
    ><YTable :data="[{ id: '123', name: 'Alice' }]" :columns="[{ field: 'name', title: 'Name' }]" /><YEditTable
      :data="[{ name: 'Bob' }]"
      :columns="[{ field: 'name', title: 'Edit', component: 'form-item-input' }]"
  /></YConfigProvider>
</template>
