<template>
  <div
    class="y-table-wrapper"
    :class="{
      'y-table-wrapper--no-data': loadingEmpty,
      'y-table-wrapper--loading-compact': loadingCompact,
      'y-table-wrapper--loading-tiny': loadingTiny,
    }"
    :style="[wrapperStyleVars, loadingStyleVars]"
  >
    <vxe-toolbar
      v-if="hasToolbar"
      ref="toolbarRef"
      :custom="toolbarCustomComputed"
      :tools="toolbarToolsComputed"
      :size="toolbarSizeComputed"
    >
      <template #buttons>
        <slot v-if="$slots['toolbar-left']" name="toolbar-left" />
        <slot v-else name="toolbarLeft" />
      </template>
      <template #tools>
        <slot v-if="$slots['toolbar-right']" name="toolbar-right" />
        <slot v-else name="toolbarRight" />
      </template>
    </vxe-toolbar>
    <vxe-table
      v-bind="mergedTableProps"
      ref="tableRef"
      :data="displayData"
      :loading="props.loading"
      :min-height="getMinimumTableHeight()"
      class="yss-custom-vxe-table"
      @current-row-change="handleCurrentRowChange"
      @cell-click="handleCellClick"
      @edit-closed="handleEditClosed"
      @edit-activated="handleEditActivated"
      @filter-change="handleFilterChange"
      @row-dragend="handleRowDragend"
      @checkbox-change="handleCheckboxChange"
      @checkbox-all="handleCheckboxAll"
      @scroll="handleActionScroll"
    >
      <!-- 行拖拽把手（可选；使用 vxe 内置 drag-sort 展示拖拽图标） -->
      <vxe-column
        v-if="rowDragable && showDragHandle"
        :width="dragHandleWidth"
        align="center"
        :resizable="false"
        :show-overflow="false"
        drag-sort
      />
      <!-- 业务列：递归渲染，children 存在时为 vxe-colgroup，支持任意层级分组表头 -->
      <TableColumnNode
        v-for="(column, index) in normalizedColumns"
        :key="getColumnNodeKey(column, index)"
        :column="column"
        :slot-keys="getSlotKeys($slots)"
      />
      <!-- 追加操作列（顶层 actionConfig 生效且列中未声明） -->
      <vxe-column
        v-if="appendActionColumn"
        field="__yss_action__"
        :title="resolveActionConfig().title"
        :width="resolveActionConfig().width"
        :align="resolveActionConfig().align || 'center'"
        :fixed="resolveActionConfig().fixed || 'right'"
      >
        <template #default="scope">
          <ActionColumn
            :buttons="resolveActionConfig().buttons"
            :display-limit="resolveActionConfig().displayLimit"
            :more-render-type="resolveActionConfig().moreRenderType"
            :more-text="resolveActionConfig().moreText"
            :close-on-scroll="resolveActionConfig().closeOnScroll !== false"
            :scope="scope"
          >
            <template v-if="$slots['action-more-icon']" #more>
              <slot name="action-more-icon" />
            </template>
            <template v-else-if="$slots.actionMoreIcon" #more>
              <slot name="actionMoreIcon" />
            </template>
          </ActionColumn>
        </template>
      </vxe-column>
    </vxe-table>

    <div
      v-if="pageable"
      class="y-table-pagination"
      @vue:mounted="syncPaginationClasses"
      @vue:updated="syncPaginationClasses"
    >
      <Pagination ref="paginationRef" v-bind="resolvedPagination" :total="computedTotal" @change="handleAntdChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVxeLocale } from '../locale/useVxeLocale';
useVxeLocale();
import { Pagination } from 'ant-design-vue';
import { computed, nextTick, onBeforeUpdate, onMounted, provide, ref, watch, useAttrs, useSlots } from 'vue';
import type { VxeTablePropTypes } from 'vxe-table';
import { VxeColumn, VxeTable, VxeToolbar } from 'vxe-table';
import ActionColumn from './ActionColumn.vue';
import TableColumnNode, { getColumnNodeKey, getSlotKeys, Y_TABLE_COLUMN_NODE_CONTEXT } from './TableColumnNode';
import { syncPaginationClasses } from './utils/syncPaginationClasses';
import { useActionColumn, useColumnProps, useNormalizedColumns } from './hooks/useColumns';
import { useTableEvents } from './hooks/useEvents';
import { useTableSelection } from './hooks/useTableSelection';
import { usePagination as usePaginationHook } from './hooks/usePagination';
import { useActionScrollClose } from './hooks/useActionScrollClose';
import { resolveTreeChildrenField, useSafeData } from './hooks/useSafeData';
import { useStableConfig } from './hooks/useStableConfig';
import { useStyleVars } from './hooks/useStyleVars';
import { useActionConfig as useActionConfigHook, useTableProps as useTablePropsHook } from './hooks/useTableProps';
import { useVxeInstall } from './hooks/useVxeInstall';
import { useTableDragScroll } from './hooks/useTableDragScroll';
import { useLoadingLayout } from './hooks/useLoadingLayout';
import { useTableMinHeight } from './hooks/useTableMinHeight';
import { makeProxyTableInstance } from './utils';
import { yTableProps, type YTableEmits } from './type';

/**
 * Y-Table 组件 - 基于 vxe-table 4.19.10 的 Vue3 表格组件
 *
 * @author YSS UI Team
 * @version 1.0.0
 */

// 定义组件名称
defineOptions({
  name: 'YTable',
  inheritAttrs: false,
});

// Props 定义
const props = defineProps(yTableProps);

// Emits 定义
const emit = defineEmits<YTableEmits>();

let resizeTimer: any = null;
/**
 * 处理展开行尺寸变化
 * 增加 60ms 防抖，避免在内容动态加载或折叠动画中高频触发重算
 */
const handleExpandResize = () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    tableRef.value?.recalculate();
  }, 60);
};

// 为动态插槽提供显式类型，避免 Volar 将 `#<field>` 误推断为筛选/表头作用域
defineSlots<Record<string, (props: any) => any>>();

// 模板引用
const tableRef = ref<InstanceType<typeof VxeTable>>();
const toolbarRef = ref<InstanceType<typeof VxeToolbar>>();
const paginationRef = ref<InstanceType<typeof Pagination>>();

// 安装 vxe-pc-ui
useVxeInstall();
const { handleActionScroll } = useActionScrollClose();

// 分页（先进行分页处理）
const {
  resolvedPagination,
  computedTotal,
  displayData: rawDisplayData,
  handleAntdChange,
} = usePaginationHook(props as any, emit);

// 可写纯对象保持原引用；类实例等不可直接挂行键的对象转成稳定复用的普通副本。
// useAttrs() 返回的不是响应式对象，运行中更换 tree-config 时下面的 computed 不会重算。
// 树配置一般随表格创建，不在运行中切换。
const attrs = useAttrs();
const displayData = useSafeData(
  rawDisplayData,
  computed(() => resolveTreeChildrenField((attrs as any).treeConfig ?? (attrs as any)['tree-config']))
);

// vxe 表格透传配置
const { tableProps } = useTablePropsHook(props as any);
/** 受限高度默认保留完整一行，显式 minHeight（含 0）仍按调用方配置。 */
// useAttrs() 在 Vue 3.3+ 返回会收集依赖的代理，业务方后续增删 min-height 时 enabled 会重新求值。
const minimumTableHeight = useTableMinHeight(
  tableRef,
  () =>
    [props.height, props.maxHeight].some(value => value !== null && value !== undefined) &&
    [attrs.minHeight, attrs['min-height']].every(value => value === null || value === undefined),
  () => props.cellConfig?.height ?? 36
);
/** 渲染时优先读取业务透传的 min-height。 */
const getMinimumTableHeight = (): VxeTablePropTypes.MinHeight | undefined =>
  (attrs.minHeight ?? attrs['min-height'] ?? minimumTableHeight.value) as VxeTablePropTypes.MinHeight | undefined;

// 工具栏插槽检测
const slots = useSlots();
const hasToolbarSlotsComputed = computed(() => {
  return !!slots['toolbar-left'] || !!slots.toolbarLeft || !!slots['toolbar-right'] || !!slots.toolbarRight;
});

// 工具栏：仅判断是否开启 custom
const toolbarCustomComputed = computed(() => (props.toolbarConfig as any)?.custom === true);
// 工具栏工具：支持通过 props.toolbarTools 追加工具；当 custom 开启且未显式包含 custom 时，自动补齐
const toolbarToolsComputed = computed(() => {
  const tools = ((props as any).toolbarTools || []) as any[];
  const hasCustom = tools.some((t: any) => t && t.code === 'custom');
  if (toolbarCustomComputed.value && !hasCustom) {
    return [...tools, { code: 'custom' }];
  }
  return tools;
});

// 是否展示工具栏：只要存在工具栏插槽，或者开启了 custom，或者传入了自定义工具项即渲染
const hasToolbar = computed(() => {
  return (
    hasToolbarSlotsComputed.value ||
    toolbarCustomComputed.value ||
    (toolbarToolsComputed.value && toolbarToolsComputed.value.length > 0)
  );
});

// 工具栏尺寸：默认跟随表格 size，可单独通过 toolbarSize 覆盖
const toolbarSizeComputed = computed<VxeTablePropTypes.Size | undefined>(
  () => ((props as any).toolbarSize ?? (props as any).size) as VxeTablePropTypes.Size
);

// 自定义列设置（若未显式传入且提供了 id，则自动开启 storage 持久化）
// immediate: false 用于优化列设置面板拖拽性能，仅在确认时同步列配置
const customConfigComputed = computed(() => {
  const passed = (props as any).customConfig || {};
  if (Object.keys(passed).length) {
    // 若外部未显式传入 immediate，则默认设置为 false 以避免拖拽卡顿
    return { immediate: false, ...passed };
  }
  const tableId = (props as any).id as string | undefined;
  if (tableId) {
    return {
      immediate: false,
      storage: {
        enabled: true,
        key: `yss-ui:table:${tableId}:columns`,
      },
    } as Record<string, any>;
  }
  // 即使没有 id，也返回基础配置以确保列设置面板拖拽流畅
  return { immediate: false };
});

const rawTableProps = computed(() => ({
  ...tableProps.value,
  ...(attrs as any),
  id: props.id,
  spanMethod: props.spanMethod,
  customConfig: customConfigComputed.value,
  expandConfig: props.expandConfig,
  checkboxConfig: props.checkboxConfig,
  radioConfig: props.radioConfig,
}));
const mergedTableProps = useStableConfig(() => rawTableProps.value as Record<string, any>);

// 工具栏工具项已由 vxe 内部根据 custom 渲染，无需手动注入

// 列归一化
const { normalizedColumns } = useNormalizedColumns({
  columns: computed(() => props.columns),
  autoFlexColumn: computed(() => props.autoFlexColumn),
} as any);

// 操作列：是否追加顶层配置
const { appendActionColumn } = useActionColumn({
  actionConfig: computed(() => props.actionConfig),
  columns: computed(() => props.columns),
  showActionColumn: computed(() => props.showActionColumn),
} as any);

// 操作列配置合并
const { resolveActionConfig } = useActionConfigHook(props as any);

// 获取列配置属性
const { getColumnProps, getColgroupProps } = useColumnProps(props as any, resolveActionConfig);

// 向递归列节点提供渲染上下文（插槽、列属性解析、操作列配置、展开行重算）
provide(Y_TABLE_COLUMN_NODE_CONTEXT, {
  slots,
  getColumnProps,
  getColgroupProps,
  resolveActionConfig,
  onExpandResize: handleExpandResize,
});

// 业务方用 v-if 增删插槽后，列节点已拿到新插槽，但 VXE 表头/表体不会自行重绘；
// 这里只在插槽集合真的变化时刷新一次列渲染（复用原列对象，列宽、筛选等状态不丢）。
let lastSlotKeys = getSlotKeys(slots);
onBeforeUpdate(() => {
  const nextSlotKeys = getSlotKeys(slots);
  if (nextSlotKeys === lastSlotKeys) return;
  lastSlotKeys = nextSlotKeys;
  void nextTick(() => tableRef.value?.refreshColumn?.());
});

// 事件处理器
const {
  handleCurrentRowChange,
  handleCellClick,
  handleEditClosed,
  handleEditActivated,
  handleFilterChange,
  handleRowDragend,
} = useTableEvents(emit, tableRef);

// 多选与受控状态管理
const {
  handleCheckboxChange,
  handleCheckboxAll,
  clearSelection,
  getSelectedRows,
  getSelectedRowKeys,
  setSelection,
  syncSelection,
} = useTableSelection(props as any, emit, tableRef);

// 行拖拽自动滚动支持
useTableDragScroll(tableRef, {
  enabled: computed(() => props.rowDragable === true),
  threshold: 50,
  maxSpeed: 15,
});

// 连接 toolbar 与 table（显示列设置按钮）
if (typeof window !== 'undefined') {
  const tryConnect = () => {
    try {
      if (!toolbarCustomComputed.value) return;
      const toolbar = toolbarRef.value as any;
      const table = tableRef.value as any;
      if (toolbar && table && typeof table.connect === 'function') {
        table.connect(toolbar);
      }
    } catch {
      // 忽略
    }
  };
  onMounted(() => nextTick(tryConnect));
  watch([toolbarCustomComputed, toolbarToolsComputed, () => tableRef.value, () => toolbarRef.value], () =>
    nextTick(tryConnect)
  );
}

// 包裹容器样式变量
const { wrapperStyleVars } = useStyleVars(props as any);

// 加载中提示定位：居中于表体而非整表，避免表体较矮时浮到表头上
const { loadingStyleVars, loadingCompact, loadingTiny } = useLoadingLayout(
  tableRef,
  computed(() => !!props.loading)
);
/** 按 VXE 筛选后的实际渲染结果保留空态占位，兼容源数据非空但筛选无结果。 */
// getTableData() 读取的是 VXE 的 reactive reactData.tableData，加载中用户改筛选时也会重新计算。
const loadingEmpty = computed(
  () => props.loading && !(tableRef.value?.getTableData().tableData ?? displayData.value).length
);

// 暴露组件实例方法
defineExpose({
  /** 获取表格实例 */
  getTableInstance: () => makeProxyTableInstance(tableRef.value),
  /** 刷新表格 */
  refresh: () => tableRef.value?.updateData(),
  /** 重新计算表格 */
  recalculate: () => tableRef.value?.recalculate(),
  /** 清除多选选中状态（同时同步受控绑定） */
  clearSelection,
  /** 获取当前选中的行数据列表 */
  getSelectedRows,
  /** 获取当前选中的行 Key 列表 */
  getSelectedRowKeys,
  /** 设置选中行 */
  setSelection,
  /** 手动触发选中状态同步 */
  syncSelection,
  /** 获取分页组件实例（Ant Design Vue Pagination） */
  getPaginationInstance: () => paginationRef.value,
});
</script>

<style scoped lang="less">
@import url('./style.less');
</style>
