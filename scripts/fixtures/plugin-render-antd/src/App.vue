<script setup lang="ts">
import { reactive } from 'vue';
import { Input, Select } from 'ant-design-vue';
import { VxeUI } from 'vxe-pc-ui';
import { VxeTable, VxeColumn } from 'vxe-table';
import { YEditTable } from '@yss-ui/components';
import Plugin from '@vxe-ui/plugin-render-antd';
import '@vxe-ui/plugin-render-antd/dist/style.css';
import '@yss-ui/components/dist/style.css';
Plugin.component(Input);
Plugin.component(Select);
VxeUI.use(Plugin);
const stats = { pluginCalls: 0, yssUpdates: 0, checkboxRenderer: !!VxeUI.renderer.get('ACheckbox')?.renderTableEdit };
const renderer = VxeUI.renderer.get('AInput');
const original = renderer.renderTableEdit;
VxeUI.renderer.add('AInput', {
  ...renderer,
  renderTableEdit(...args) {
    stats.pluginCalls++;
    return original(...args);
  },
});
const nativeRows = reactive([{ name: 'Native', bool: true }]);
const yssRows = reactive([{ name: 'YSS', bool: true }]);
const columns = [
  { field: 'name', title: 'Name', editRender: { name: 'AInput' } },
  {
    field: 'bool',
    title: 'Boolean',
    component: 'form-item-select',
    props: {
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
  },
];
window.spike = { stats, nativeRows, yssRows };
</script>
<template>
  <h2>Native</h2>
  <VxeTable :data="nativeRows" :edit-config="{ trigger: 'click', mode: 'cell' }"
    ><VxeColumn field="name" title="Name" :edit-render="{ name: 'AInput' }" /><VxeColumn
      field="bool"
      title="Boolean"
      :edit-render="{
        name: 'ASelect',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      }"
  /></VxeTable>
  <h2>YSS</h2>
  <YEditTable
    :data="yssRows"
    :columns="columns"
    :edit-config="{ trigger: 'click', mode: 'cell' }"
    @update-row="stats.yssUpdates++"
  />
  <pre>{{ stats }}</pre>
</template>
