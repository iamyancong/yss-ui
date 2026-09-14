/**
 * @yss-ui/components/table 独立入口
 * 提供 YTable, YEditTable 及其专属类型与工具函数
 */
export { default as YTable } from './index.vue';
export { default as YEditTable } from '../edit-table/index.vue';
export { default as ActionButton } from './ActionButton.vue';
export { default as ActionColumn } from './ActionColumn.vue';
export { default as EditTableColumn } from '../edit-table/components/EditTableColumn.vue';
export { default as EditTableCell } from '../edit-table/components/EditTableCell.vue';
export {
  calcActionColumnWidth,
  measureTextWidth,
  measureButtonWidth,
  resolveAdaptiveDisplayLimit,
} from './utils/calcActionWidth';

export type * from './types';
export type * from '../edit-table/types';
