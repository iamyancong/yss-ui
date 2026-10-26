<script setup lang="ts">
import { Pagination } from 'ant-design-vue';
import { syncPaginationClasses } from '../../table/utils/syncPaginationClasses';

defineOptions({ name: 'EditTablePagination' });

defineProps<{
  /** 内部维护的分页状态 */
  pagination: {
    current: number;
    pageSize: number;
    showSizeChanger?: boolean;
    showQuickJumper?: boolean;
    pageSizeOptions?: (number | string)[];
  };
  /** 计算后的总条数 */
  total: number;
}>();

defineEmits<{
  (e: 'change', page: number, pageSize: number): void;
  (e: 'show-size-change', current: number, size: number): void;
}>();
</script>

<template>
  <div
    class="y-edit-table-pagination"
    @vue:mounted="syncPaginationClasses"
    @vue:updated="syncPaginationClasses"
  >
    <Pagination
      :current="pagination.current"
      :page-size="pagination.pageSize"
      :total="total"
      :show-size-changer="pagination.showSizeChanger"
      :show-quick-jumper="pagination.showQuickJumper"
      :page-size-options="pagination.pageSizeOptions as any"
      @change="(page, pageSize) => $emit('change', page, pageSize)"
      @show-size-change="(current, size) => $emit('show-size-change', current, size)"
    />
  </div>
</template>
