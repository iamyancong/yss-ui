<script setup lang="ts">
import type { VNode } from 'vue';
import { Tooltip } from 'ant-design-vue';

defineOptions({ name: 'EditCellEditor' });

defineProps<{
  /** 当前列定义 */
  col: any;
  /** 行数据 */
  row: any;
  /** 解析出的编辑器组件类型 */
  editorComponent: any;
  /** 传给编辑器的 props */
  editorProps: Record<string, any>;
  /** 传给编辑器的事件监听 */
  editorEvents: Record<string, any>;
  /** 错误提示 Tooltip 的 props */
  tooltipProps: Record<string, any>;
  /** 当前单元格是否校验报错 */
  isError: boolean;
}>();

/**
 * 同步单元格编辑器边框盒语义类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncEditorClasses = (vnode: VNode) => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;
  const controlEl = root.firstElementChild;
  if (!(controlEl instanceof HTMLElement)) return;

  const selectorChild = Array.from(controlEl.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && Array.from(child.classList).some(cls => cls.endsWith('-select-selector'))
  );
  if (selectorChild) {
    selectorChild.classList.add('y-edit-table-editor__box');
  } else {
    controlEl.classList.add('y-edit-table-editor__box');
  }
};
</script>

<template>
  <div
    class="y-edit-table-editor"
    :class="{ 'is-error': isError }"
    @vue:mounted="syncEditorClasses"
    @vue:updated="syncEditorClasses"
  >
    <Tooltip v-bind="tooltipProps">
      <component :is="editorComponent" v-bind="editorProps" :value="row[col.field]" v-on="editorEvents" />
    </Tooltip>
  </div>
</template>

<style scoped lang="less">
.y-edit-table-editor.is-error {
  :deep(.y-edit-table-editor__box) {
    border-color: var(--yss-color-error-6, var(--ant-error-color, #ff4d4f)) !important;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--yss-color-error-6, var(--ant-error-color, #ff4d4f)) 20%, transparent) !important;
  }
}
</style>
