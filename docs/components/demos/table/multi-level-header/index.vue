<script setup lang="ts">
import { YTable } from '@yss-ui/components';
import { Button } from 'ant-design-vue';
import { AMOUNT_UNIT, RISK_SECTIONS } from './constant';
import { useMultiLevelHeader } from './hooks/useMultiLevelHeader';

defineOptions({ name: 'DemoTableMultiLevelHeader' });

const AButton = Button;

const { columns, tableData, visibleSchemes, mergeHeaderCells, spanMethod, toggleScheme } = useMultiLevelHeader();

/** 风险分组编码 → 分组信息 */
const sectionMap = new Map(RISK_SECTIONS.map(section => [section.code, section]));
</script>

<template>
  <div class="demo-container">
    <YTable
      :data="tableData"
      :columns="columns"
      :pageable="false"
      :max-height="520"
      :span-method="spanMethod"
      show-custom-header
      :merge-header-cells="mergeHeaderCells"
      :row-config="{ keyField: 'id', isHover: true }"
      :column-config="{ resizable: false }"
      show-overflow="tooltip"
    >
      <template #toolbar-left>
        <a-button size="small" @click="toggleScheme">
          {{ visibleSchemes.length > 2 ? '移除方案' : '追加方案' }}（当前 {{ visibleSchemes.length }} 个）
        </a-button>
      </template>
      <template #toolbar-right>
        <span class="unit">单位：{{ AMOUNT_UNIT }}</span>
      </template>
      <!-- 风险分组列：英文名 + 中文副标题，按分组纵向合并 -->
      <template #sectionCode="{ row }">
        <div class="section-cell">
          <div class="section-title">{{ sectionMap.get(row.sectionCode)?.title }}</div>
          <div class="section-sub">{{ sectionMap.get(row.sectionCode)?.subTitle }}</div>
        </div>
      </template>
    </YTable>
  </div>
</template>

<style scoped lang="less">
@import url('./style.less');
</style>
