// 轻量入口：仅导出组件与类型，不做全量安装，不注入全局样式副作用

// 命名导出
export { default as AuthorityDropdown } from './authority/AuthorityDropdown.vue';
export { default as YButton } from './button/index.vue';
export { YEcharts } from './echarts/main-exports';
export { default as YEditTable } from './edit-table/index.vue';
export { default as YFileImport } from './file-import/index.vue';
export { default as YFormily } from './formily/index.vue';
export { default as YssFormily } from './formily/index.vue'; // 历史兼容别名
export { YMonaco, YMonacoDiff } from './monaco/main-exports';
export { default as YCard } from './card/index.vue';
export { default as YTable } from './table/index.vue';
export { default as YConditionBuilder } from './condition-builder/index.vue';
export { default as YTree } from './tree/index.vue';
export { default as YSplitPane } from './split-pane/index.vue';
export { default as YCron } from './cron/index.vue';
export { default as YMonthCalendar } from './month-calendar/index.vue';
export {
  YConfigProvider,
  useLocale,
  setGlobalLocale,
  getGlobalLocale,
  zhCN,
  formatTemplate,
  syncVxeLanguage,
} from './locale';
export { YSheet, LocaleType } from './sheet/main-exports';
export type {
  IUniverSheetsCorePresetConfig,
  IWorkbookData,
  LocaleTypeString,
  YSheetEmits,
  YSheetExpose,
  YSheetExtraLocales,
  YSheetExtraPlugin,
  YSheetProps,
} from './sheet/main-exports';

// 类型导出
export type * from './button/types';
export type * from './authority/types';
export type * from './echarts/types';
export type * from './edit-table/types';
export type * from './card/types';
export type * from './table/types';
export type * from './condition-builder/types';
export type * from './tree/types';
export type * from './split-pane/types';
export type * from './formily/types';
export type * from './cron/types';
export type * from './monaco/types';
export type * from './month-calendar/types';
export type * from './file-import/types';
export type * from './locale/types';
