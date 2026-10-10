<script setup lang="ts">
import ActionColumn from '../../table/ActionColumn.vue';

defineOptions({ name: 'EditTableCell' });

defineProps<{
  /** 当前列定义 */
  col: any;
  /** vxe-table 单元格 scope 参数 */
  scope: any;
  /** 操作列配置（当 type 为 action 时传入） */
  actionConfig?: any;
  /** 是否存在自定义 formatter */
  hasFormatter?: boolean;
  /** 格式化后的内容 */
  formattedValue?: any;
  /** 是否需要做文本翻译 */
  shouldTransform?: boolean;
  /** 翻译后的内容 */
  transformedValue?: any;
  /** 单元格错误信息 */
  cellError?: string;
}>();
</script>

<template>
  <ActionColumn
    v-if="col.type === 'action'"
    :buttons="actionConfig?.buttons"
    :display-limit="actionConfig?.displayLimit"
    :more-render-type="actionConfig?.moreRenderType"
    :close-on-scroll="actionConfig?.closeOnScroll !== false"
    :scope="scope"
  >
    <template v-if="$slots['action-more-icon']" #more>
      <slot name="action-more-icon" />
    </template>
    <template v-else-if="$slots.actionMoreIcon" #more>
      <slot name="actionMoreIcon" />
    </template>
  </ActionColumn>
  <template v-else-if="col.type !== 'expand'">
    <slot
      v-if="$slots['custom-cell']"
      name="custom-cell"
      :row="scope.row"
      :column="scope.column"
      :row-index="scope.rowIndex"
    />
    <template v-else-if="hasFormatter">
      {{ formattedValue }}
    </template>
    <template v-else-if="shouldTransform">
      {{ transformedValue }}
    </template>
    <template v-else>
      {{ scope.row[col.field] }}
    </template>
    <div v-if="cellError" class="y-edit-table-cell-error" :title="cellError">
      {{ cellError }}
    </div>
  </template>
</template>

<style scoped lang="less">
.y-edit-table-cell-error {
  color: var(--yss-color-error-6, var(--ant-error-color, #ff4d4f)) !important;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
