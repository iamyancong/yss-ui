/**
 * YSS UI 国际化语言包强类型定义
 */

export type YssLocaleName = 'zh-CN' | 'en-US' | 'zh-TW';

export interface YssCommonLocale {
  confirm: string;
  cancel: string;
  operation: string;
  more: string;
  collapse: string;
  expand: string;
  empty: string;
  search: string;
  reset: string;
  loading: string;
}

export interface YssTableLocale {
  actionTitle: string;
  more: string;
  confirmTitle: string;
  total: string;
}

export interface YssFormilyLocale {
  yes: string;
  no: string;
  arraySeparator: string;

  collapse: string;
  expand: string;
}

export interface YssFileImportLocale {
  title: string;
  downloadTemplate: string;
  cancel: string;
  nextStep: string;
  lastStep: string;
  confirmImport: string;
  exportErrorData: string;
  emptyFileMessage: string;
  singleFileMessage: string;
  uploadTip: string;
  invalidFileTypeMessage: string;
  invalidFileType: string;
  draggerText: string;
  draggerClick: string;
  resultSummary: string;
}

export interface YssCronLocale {
  dimensions: {
    second: string;
    minute: string;
    hour: string;
    day: string;
    month: string;
    year: string;
  };
  modes: {
    every: string;
    interval: string;
    specific: string;
    range: string;
  };
  weeks: string[];
  controls: {
    everyPrefix: string;
    everyDay: string;
    everyInterval: string;
    from: string;
    start: string;
    specificPrefix: string;
    rangePrefix: string;
    to: string;
    week: string;
    day: string;
    daySuffix: string;
    dayStartSuffix: string;
    specificWeek: string;
    specificDay: string;
    lastDayOfMonth: string;
    lastWeekdayOfMonth: string;
    lastWeekOfMonthPrefix: string;
    beforeEndOfMonth: string;
    nearestWeekdayDistance: string;
    nearestWeekdaySuffix: string;
    nthWeekdayPrefix: string;
    nthWeekdayUnit: string;
    expression: string;
    reset: string;
    selectPlaceholder: string;
  };
}

export interface YssConditionBuilderLocale {
  removeGroup: string;

  and: string;
  or: string;
  operators: Record<string, string>;
  fieldPlaceholder: string;
  operatorPlaceholder: string;
  startPlaceholder: string;
  endPlaceholder: string;
  betweenSeparator: string;
  selectPlaceholder: string;
  inputPlaceholder: string;
  addSibling: string;
  remove: string;
  addChild: string;
  childGroup: string;
  addCondition?: string;
}

export interface YssTreeLocale {
  searchPlaceholder: string;
  loadingTip: string;
}

export interface YssMonthCalendarLocale {
  today: string;
  loadingTip: string;
  previousMonth: string;
  nextMonth: string;
  backToToday: string;
  weekdays: string[];
}

export interface YssMonacoLocale {
  comment: string;
  upper: string;
  lower: string;
  singleQuote: string;
  doubleQuote: string;
  backticks: string;
  parentheses: string;
  copyLine: string;
  find: string;
  replace: string;
  commands: string;
  format: string;

  copy: string;
  copied: string;
  enterFullscreen: string;
  exitFullscreen: string;
  download: string;
  diffCopy: string;
  diffDownload: string;
  exitFullscreenHint: string;
}

export interface YssSplitPaneLocale {
  hideTop: string;
  hideBottom: string;
  resetHeight: string;
  expandTop: string;
  collapseTop: string;
  expandLeft: string;
  collapseLeft: string;
}

export interface YssSheetLocale {
  newWorkbook: string;
  loading: string;
  loadFailed: string;
}

export interface YssFilePreviewLocale {
  title: string;
  /** 文件切换下拉触发器的无障碍名称，参数 name / current / total */
  switcherLabel: string;
  /** 文件列表的无障碍名称，参数 total */
  switcherList: string;
  switcherSearch: string;
  switcherNoMatch: string;
  switcherUnsupported: string;
  switcherLegacy: string;
  untitled: string;
  loading: string;
  download: string;
  downloadAnyway: string;
  retry: string;
  fullscreen: string;
  exitFullscreen: string;
  /** 标题栏关闭按钮 */
  close: string;
  prev: string;
  next: string;
  /** 翻页按钮提示，{name} 为目标文件名 */
  prevTo: string;
  nextTo: string;
  counter: string;
  oversizeTitle: string;
  oversizeDesc: string;
  emptyTitle: string;
  emptyDesc: string;
  mismatchTitle: string;
  mismatchDesc: string;
  missingDepTitle: string;
  missingDepDesc: string;
  unsupportedTitle: string;
  unsupportedDesc: string;
  errorTitle: string;
  httpError: string;
  networkError: string;
  textPartial: string;
  loadMore: string;
  /** CSV：切换到表格视图 */
  csvViewTable: string;
  /** CSV：切换到源文本视图 */
  csvViewSource: string;
  /** CSV：已全部显示，参数 rows、cols */
  csvSummary: string;
  /** CSV：还有未显示的行，参数 rows、cols */
  csvPartial: string;
  /** CSV：没有数据行 */
  csvNoData: string;
  /** 不支持预览时：旧版办公格式（doc / ppt 等）的转换建议 */
  legacyDesc: string;
  /** 未启用 pptx 预览时的提示（pptx 为实验性可选能力） */
  pptxOptInDesc: string;
  /** PPTX：演示文稿里没有幻灯片 */
  pptxNoSlides: string;
  /** PPTX：文件损坏或不是有效的 PPTX */
  pptxInvalid: string;
  /** PPTX：隐藏页（放映时跳过）的标记 */
  pptxHidden: string;
  /** PPTX：单页渲染失败 */
  pptxSlideError: string;
  /** PPTX：页码，参数 current、total */
  pptxPage: string;
  /** PPTX：图片格式浏览器无法显示（如 EMF / WMF / 损坏的 TIFF），参数 type 为格式名 */
  pptxImageUnsupported: string;
  /** PPTX：图片引用的文件在压缩包里不存在 */
  pptxImageMissing: string;
  /** PPTX：图片来自外部链接，为安全起见不自动加载 */
  pptxImageExternal: string;
  /** PPTX：图片尺寸过大，未显示 */
  pptxImageTooLarge: string;
  /** PPTX：图片数据损坏，浏览器无法显示 */
  pptxImageBroken: string;
  /** PPTX：文件内容超出安全上限（条目过多或解压后过大） */
  pptxTooLarge: string;
  /** Word：图片格式浏览器无法显示（TIFF / EMF / WMF），参数 type 为格式名 */
  docxImageUnsupported: string;
  /** 表格中有公式没有保存计算结果，{count} 为单元格数 */
  excelFormulaMissing: string;
  /** 表格打开时会被 Excel 重新计算（文件要求重算，或不是 Excel 保存的），预览显示的是保存的结果 */
  excelRecalcOnLoad: string;
  /** 图片：预览区域的无障碍名称 */
  imageViewer: string;
  /** 图片：工具栏的无障碍名称 */
  imageToolbar: string;
  /** 图片：放大 */
  imageZoomIn: string;
  /** 图片：缩小 */
  imageZoomOut: string;
  /** 图片：按原始尺寸显示 */
  imageActualSize: string;
  /** 图片：适应窗口 */
  imageFit: string;
  /** 图片：向左旋转 */
  imageRotateLeft: string;
  /** 图片：向右旋转 */
  imageRotateRight: string;
  /** 图片：重置缩放与旋转 */
  imageReset: string;
  /** 图片：浏览器无法解码 */
  imageLoadFailed: string;
}

export interface YssLocale {
  name: YssLocaleName;
  common: YssCommonLocale;
  table: YssTableLocale;
  formily: YssFormilyLocale;
  fileImport: YssFileImportLocale;
  cron: YssCronLocale;
  conditionBuilder: YssConditionBuilderLocale;
  tree: YssTreeLocale;
  monthCalendar: YssMonthCalendarLocale;
  monaco: YssMonacoLocale;
  splitPane: YssSplitPaneLocale;
  sheet: YssSheetLocale;
  filePreview: YssFilePreviewLocale;
}
