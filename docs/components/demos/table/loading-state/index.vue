<script setup lang="ts">
import { YButton, YTable } from '@yss-ui/components';
import { ref } from 'vue';
import { columns, footerData, rows } from './constant';

defineOptions({ name: 'DemoTableLoadingState' });

const loading = ref(false);
const tableHeight = ref(320);
const filteredTable = ref<InstanceType<typeof YTable>>();

/** 在数据源非空的情况下，通过 VXE 本地筛选切换真实空态。 */
const toggleFilter = async () => {
  const table = filteredTable.value?.getTableInstance();
  if (!table) return;
  if (table.getCheckedFilters().length) {
    await table.clearFilter();
  } else {
    await table.setFilter('date', [{ label: '无匹配结果', value: 'none', checked: true }], true);
  }
};
</script>

<template>
  <div class="loading-state-demo">
    <div class="loading-state-demo__actions">
      <YButton type="primary" @click="loading = !loading">{{ loading ? '结束加载' : '开始加载' }}</YButton>
      <YButton :disabled="loading" @click="toggleFilter">切换本地筛选空态</YButton>
      <YButton @click="tableHeight = tableHeight === 320 ? 480 : 320">切换高度（320 / 480px）</YButton>
    </div>
    <section data-case="one-row">
      <h4>一行数据：提示留在表体内</h4>
      <YTable :data="rows" :columns="columns" :loading="loading" />
    </section>
    <section data-case="empty">
      <h4>空数据：原位显示加载中，保持占位高度</h4>
      <YTable :data="[]" :columns="columns" :loading="loading" />
    </section>
    <section data-case="filtered-empty">
      <h4>本地筛选无结果：源数据仍非空</h4>
      <YTable ref="filteredTable" :data="rows" :columns="columns" :loading="loading" />
    </section>
    <section id="loading-fixed-height" data-case="fixed-height">
      <h4>固定高度 {{ tableHeight }}px：一条数据也在可视表体垂直居中</h4>
      <YTable :data="rows" :columns="columns" :loading="loading" :height="tableHeight" />
    </section>
    <section data-case="fixed-empty">
      <h4>固定高度 {{ tableHeight }}px：空数据与单行数据的加载位置一致</h4>
      <YTable :data="[]" :columns="columns" :loading="loading" :height="tableHeight" />
    </section>
    <section data-case="footer">
      <h4>固定高度 {{ tableHeight }}px 与汇总表尾：排除表头、表尾后垂直居中</h4>
      <YTable
        :data="rows"
        :columns="columns"
        :loading="loading"
        :height="tableHeight"
        show-footer
        :footer-data="footerData"
      />
    </section>
    <section data-case="min-height">
      <h4>高度不足：至少保留完整一行，不出现纵向滚动</h4>
      <YTable :data="rows" :columns="columns" :loading="loading" :height="60" />
    </section>
  </div>
</template>

<style scoped lang="less">
@import url('./style.less');
</style>
