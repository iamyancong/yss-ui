/**
 * 文件预览组件公开类型。
 */
import type { Ref, VNodeChild } from 'vue';

/** 懒加载来源的调用参数 */
export interface FileSourceLoaderContext {
  /** 切换文件、关闭弹窗或组件卸载时触发，可直接传给 fetch / axios */
  signal: AbortSignal;
  /** 当前文件（弹窗中为调用方传入的原对象，可读取业务字段） */
  file: FilePreviewItem;
}

/**
 * 懒加载来源：轮到这个文件显示时才调用。返回字符串时按 URL 处理（如签名 URL）。
 * 抛出的错误进入加载失败状态，可点击重试。
 */
export type FileSourceLoader = (ctx: FileSourceLoaderContext) => Promise<File | Blob | ArrayBuffer | string>;

/** 文件数据来源：File / Blob / ArrayBuffer，字符串视为 URL，函数视为懒加载来源 */
export type FileSource = File | Blob | ArrayBuffer | string | FileSourceLoader;

/** 内置支持的图片类型（.jpeg 归为 jpg） */
export type ImageFileType = 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'bmp' | 'ico';

/**
 * 内置支持的文件类型。
 * `pptx` 为实验性支持，默认不启用：业务项目安装 @aiden0z/pptx-renderer 并从 `@yss-ui/components/file-preview/pptx`
 * 调用 registerPptxRenderer() 后才能预览；不支持动画与切换效果，字体取决于系统，少数复杂效果与 PowerPoint 显示不一致。
 */
export type FileType = 'docx' | 'xlsx' | 'xls' | 'pptx' | 'pdf' | 'txt' | 'csv' | 'md' | ImageFileType;

/** 文件类型：内置类型，或通过 registerPreviewRenderer 注册的自定义类型 */
export type FilePreviewFileType = FileType | (string & {});

/** 文本解码策略：auto 先按 UTF-8 严格解码，失败时改用 GBK */
export type TextEncoding = 'auto' | 'utf-8' | 'gbk';

/** CSV 显示方式：table 表格，text 源文本 */
export type CsvMode = 'table' | 'text';

/**
 * Excel 单元格数阈值（按实际读到的单元格数）：数字表示上限 max；对象可分别设置提示阈值 warn 与上限 max。
 * 超过 warn 时表格上方显示提示条，超过 max 时只显示前面的行并提示下载查看。
 * 默认 { warn: 300000, max: 5000000 }，Infinity 表示不限制
 */
export type FilePreviewExcelMaxCells = number | { warn?: number; max?: number };

/** 预览状态 */
export type FilePreviewStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'oversize'
  | 'large-file'
  | 'empty'
  | 'mismatch'
  | 'missing-dependency'
  | 'unsupported'
  | 'error';

/** 文件列表中的单个文件 */
export interface FilePreviewItem {
  /** 文件数据来源 */
  source: FileSource;
  /** 文件名；source 为 ArrayBuffer、Blob 或不带文件名的 URL 时建议提供 */
  fileName?: string;
  /** 显式指定文件类型，优先于后缀和 MIME 推断，但仍会校验文件头 */
  fileType?: FilePreviewFileType;
  /**
   * 文件大小（字节），用于弹窗文件切换列表显示；source 为 File / Blob / ArrayBuffer 时可省略（自动读取）。
   * 不参与大小上限判断（上限以实际读取的内容为准）
   */
  fileSize?: number;
  /** 业务自定义字段，组件不会读取 */
  [key: string]: unknown;
}

/**
 * 当前文件的上下文：插槽、回调、事件共用。
 * 单独使用 YFilePreview 时 index 为 0、total 为 1，prev / next / goTo / close 不做任何事。
 */
export interface FilePreviewContext {
  /** 当前文件（弹窗中为调用方传入的原对象） */
  file: FilePreviewItem;
  /** 当前下标 */
  index: number;
  /** 文件总数 */
  total: number;
  /** 当前预览状态 */
  status: FilePreviewStatus;
  /** 上一个文件 */
  prev: () => void;
  /** 下一个文件 */
  next: () => void;
  /** 切换到指定下标 */
  goTo: (index: number) => void;
  /** 关闭弹窗 */
  close: () => void;
  /** 下载当前文件（配置了 customDownload 时调用它） */
  download: () => Promise<void>;
  /** 重新加载当前文件（懒加载来源会重新调用） */
  reload: () => Promise<void>;
}

/** customDownload 的参数 */
export interface FilePreviewDownloadContext extends FilePreviewContext {
  /** 已读取的文件内容（预览成功后才有），可直接保存 */
  data?: ArrayBuffer;
  /**
   * 执行默认下载。不传参数时下载当前文件；可传入新的来源（如签名 URL、Blob）或文件名
   */
  defaultDownload: (source?: FileSource, fileName?: string) => Promise<void>;
}

/** 自定义下载：不调用 ctx.defaultDownload() 就不会下载（可用于权限拦截） */
export type FilePreviewCustomDownload = (ctx: FilePreviewDownloadContext) => void | Promise<void>;

/** YFilePreview Props */
export interface FilePreviewProps {
  /** 文件数据来源：File / Blob / ArrayBuffer，字符串视为 URL */
  source: FileSource;
  /** 文件名，用于识别类型、标题展示和下载 */
  fileName?: string;
  /** 显式指定文件类型，优先于后缀和 MIME 推断，但仍会校验文件头 */
  fileType?: FilePreviewFileType;
  /** 允许预览的最大字节数，默认 20MB；超过时不读取内容，直接提示下载。恰好等于时可以预览；Infinity 不限制；0、负数、NaN 按默认值 */
  maxSize?: number;
  /**
   * 大文件提示阈值（字节），默认 10MB。超过时直接预览，并在上方显示提示条「文件较大，滚动可能略慢」（作用于 xlsx / xls / docx / pptx，恰好等于时不提示）；
   * 0、负数、NaN 或 Infinity 表示不按大小提示
   */
  largeFileWarnSize?: number;
  /**
   * Excel 单元格数阈值，默认 { warn: 300000, max: 5000000 }，都不拦截预览：超过 warn 在表格上方显示提示条，
   * 超过 max 只读取前面的行（显示「仅显示前 N 行」提示条）。按实际读到的单元格数，不看文件里写的范围
   */
  excelMaxCells?: FilePreviewExcelMaxCells;
  /** 文本解码策略，默认 'auto' */
  textEncoding?: TextEncoding;
  /** CSV 初始显示方式，默认 'table'；预览中也可以随时切换 */
  csvMode?: CsvMode;
  /** CSV 表格是否显示行号列，默认 false（数据通常自带 id） */
  csvRowNumber?: boolean;
  /** CSV 表格最多显示的数据行数，默认 200000；达到后不再「加载更多」，提示下载。小于 1、NaN 按默认值，小数向下取整，Infinity 不限制 */
  csvMaxRows?: number;
  /**
   * 加载超时（毫秒），默认 60000：从开始读取到读完（包括懒加载来源与 URL 下载）超过该时间时中止，显示超时错误与「重试」。
   * 0、负数、NaN 或 Infinity 不限制
   */
  timeout?: number;
  /** 预览区域高度，数字按 px 处理，默认 '100%'（最小 240px） */
  height?: string | number;
  /**
   * 各类提示状态里是否显示下载按钮，默认 true。
   * 为 false 时 PDF 还会追加 `#toolbar=0&navpanes=0` 尽量隐藏浏览器内置查看器的工具栏（仅 Chromium 内核生效，不是下载防护）
   */
  showDownload?: boolean;
  /**
   * 自定义下载（权限校验、审计、签名 URL 等）。
   * 设置后 PDF 会隐藏内置查看器工具栏（其中的下载无法拦截），统一走这里
   */
  customDownload?: FilePreviewCustomDownload;
  /**
   * 是否允许缩放，默认 true；也可以传文件类型列表（如 ['xlsx', 'xls']）只对这些类型开启。
   * 只有实现了缩放的渲染器才显示控件（第一期：xlsx / xls / 图片；pdf 由浏览器查看器缩放，不显示）
   */
  zoomable?: boolean | FilePreviewFileType[];
  /** 缩放比例（1 = 100%），支持 v-model:zoom。每个文件单独记住比例，切换文件时恢复该文件上次的比例 */
  zoom?: number;
  /** 最小比例，默认 0.5（图片默认可缩小到适应窗口以下） */
  zoomMin?: number;
  /** 最大比例，默认 2（图片默认 8） */
  zoomMax?: number;
  /** 放大 / 缩小按钮与快捷键的步长，默认 0.1 */
  zoomStep?: number;
  /** 首次打开某个文件时的比例：'width' 适应宽度、'page' 适应整页、'none' 用 zoom（默认 'none'；图片始终先适应窗口） */
  zoomFit?: FilePreviewZoomFit;
}

/** 首次打开文件时的适应方式 */
export type FilePreviewZoomFit = 'width' | 'page' | 'none';

/** zoom-change 事件的附加信息 */
export interface FilePreviewZoomInfo {
  /** 当前文件类型 */
  fileType: FilePreviewFileType | null;
}

/** 缩放状态（toolbar 插槽与 expose 使用） */
export interface FilePreviewZoomState {
  /** 当前文件是否可以缩放（渲染器实现了缩放且 zoomable 允许） */
  available: boolean;
  /** 当前比例 */
  value: number;
  min: number;
  max: number;
  /** 是否支持适应宽度 */
  canFit: boolean;
}

/** loaded 事件参数 */
export interface FilePreviewLoadedPayload {
  /** 文件名 */
  fileName: string;
  /** 识别出的文件类型 */
  fileType: FilePreviewFileType;
}

/** YFilePreview Emits */
export type FilePreviewEmits = {
  /** 渲染完成 */
  loaded: [payload: FilePreviewLoadedPayload];
  /** 加载或解析失败；缺少可选依赖时参数为 MissingDependencyError */
  error: [error: Error];
  /** 文件类型不支持预览，参数为识别出的类型或后缀 */
  unsupported: [type: string];
  /** 缩放比例变化（v-model:zoom） */
  'update:zoom': [zoom: number];
  /** 缩放比例变化（按钮、快捷键、滚轮、切换文件恢复比例） */
  'zoom-change': [zoom: number, info: FilePreviewZoomInfo];
};

/** YFilePreview Expose */
export interface FilePreviewExpose {
  /** 重新加载并渲染当前文件 */
  reload: () => Promise<void>;
  /** 当前文件名（原始文件名，未转义） */
  getFileName: () => string;
  /** 当前识别出的文件类型 */
  getFileType: () => FilePreviewFileType | null;
  /** 当前预览状态 */
  getStatus: () => FilePreviewStatus;
  /** 下载当前文件（配置了 customDownload 时调用它） */
  download: () => Promise<void>;
  /** 缩放状态（响应式） */
  zoomState: FilePreviewZoomState;
  /** 设置比例（收敛到范围内） */
  setZoom: (zoom: number) => void;
  /** 按 zoomStep 放大 */
  zoomIn: () => void;
  /** 按 zoomStep 缩小 */
  zoomOut: () => void;
  /** 恢复 100% */
  resetZoom: () => void;
  /** 适应宽度（或整页） */
  fitZoom: (mode?: 'width' | 'page') => void;
}

/** YFilePreviewModal Props */
export interface FilePreviewModalProps {
  /** 是否显示弹窗，支持 v-model:open */
  open?: boolean;
  /** 待预览文件列表，可以是 FilePreviewItem 或直接传 File / Blob / URL */
  files?: Array<FilePreviewItem | FileSource>;
  /** 当前文件索引，支持 v-model:index，越界时自动收敛到有效范围 */
  index?: number;
  /** 弹窗宽度，默认 '85vw' */
  width?: string | number;
  /**
   * 弹窗标题，默认显示当前文件名。设置后标题固定显示该文本，不再显示文件切换下拉
   */
  title?: string;
  /**
   * 多个文件时标题显示为文件切换下拉（类型图标 + 文件名 + 箭头，点击列出全部文件，10 个及以上可搜索），默认 true。
   * 只有一个文件或设置了 title 时显示普通标题；切换文件与左右翻页一样触发 update:index / change
   */
  fileSwitcher?: boolean;
  /**
   * 是否循环翻页，默认 false：第一个 / 最后一个文件时对应的翻页按钮禁用，方向键无反应。
   * 为 true 且多于一个文件时首尾相接，翻页按钮始终可用
   */
  loop?: boolean;
  /**
   * 是否显示下载按钮，默认 true。PDF 由浏览器内置查看器显示时标题栏不显示下载按钮（查看器工具栏自带下载）；
   * 为 false 时还会尽量隐藏内置查看器的工具栏（仅 Chromium 内核生效，不是下载防护）
   */
  showDownload?: boolean;
  /** 是否允许左右方向键切换文件，默认 true（Esc 关闭始终可用） */
  keyboard?: boolean;
  /** 允许预览的最大字节数，默认 20MB */
  maxSize?: number;
  /** 大文件提示阈值（字节），默认 10MB，同 YFilePreview */
  largeFileWarnSize?: number;
  /** Excel 单元格数阈值，同 YFilePreview */
  excelMaxCells?: FilePreviewExcelMaxCells;
  /** 文本解码策略，默认 'auto' */
  textEncoding?: TextEncoding;
  /** CSV 初始显示方式，默认 'table' */
  csvMode?: CsvMode;
  /** CSV 表格是否显示行号列，默认 false */
  csvRowNumber?: boolean;
  /** CSV 表格最多显示的数据行数，默认 200000，同 YFilePreview */
  csvMaxRows?: number;
  /** 加载超时（毫秒），默认 60000，同 YFilePreview */
  timeout?: number;
  /** 弹窗挂载节点，同 ant-design-vue Modal 的 getContainer */
  getContainer?: string | HTMLElement | (() => HTMLElement) | false;
  /** 自定义下载，同 YFilePreview；设置后 PDF 也显示标题栏下载按钮 */
  customDownload?: FilePreviewCustomDownload;
  /**
   * 是否允许缩放，默认 true；也可以传文件类型列表（如 ['xlsx', 'xls']）只对这些类型开启。
   * 只有实现了缩放的渲染器才显示控件（第一期：xlsx / xls / 图片；pdf 由浏览器查看器缩放，不显示）
   */
  zoomable?: boolean | FilePreviewFileType[];
  /** 缩放比例（1 = 100%），支持 v-model:zoom。每个文件单独记住比例，切换文件时恢复该文件上次的比例 */
  zoom?: number;
  /** 最小比例，默认 0.5（图片默认可缩小到适应窗口以下） */
  zoomMin?: number;
  /** 最大比例，默认 2（图片默认 8） */
  zoomMax?: number;
  /** 放大 / 缩小按钮与快捷键的步长，默认 0.1 */
  zoomStep?: number;
  /** 首次打开某个文件时的比例：'width' 适应宽度、'page' 适应整页、'none' 用 zoom（默认 'none'；图片始终先适应窗口） */
  zoomFit?: FilePreviewZoomFit;
}

/** YFilePreviewModal Slots */
export interface FilePreviewModalSlots {
  /** 标题栏右侧的业务操作区（全屏、下载按钮之前） */
  actions?: (ctx: FilePreviewContext) => VNodeChild;
}

/** YFilePreviewModal Expose */
export interface FilePreviewModalExpose {
  /** 上一个文件 */
  prev: () => void;
  /** 下一个文件 */
  next: () => void;
  /** 切换到指定下标 */
  goTo: (index: number) => void;
  /** 下载当前文件 */
  download: () => Promise<void>;
  /** 重新加载当前文件 */
  reload: () => Promise<void>;
}

/** YFilePreviewModal Emits */
export type FilePreviewModalEmits = {
  /** 弹窗显示状态变化 */
  'update:open': [open: boolean];
  /** 当前文件索引变化 */
  'update:index': [index: number];
  /** 当前文件变化（翻页、列表变化、外部修改 index），file 为调用方传入的原对象 */
  change: [index: number, file: FilePreviewItem, ctx: FilePreviewContext];
  /** 弹窗关闭 */
  close: [];
  /** 当前文件渲染完成 */
  loaded: [payload: FilePreviewLoadedPayload, ctx: FilePreviewContext];
  /** 当前文件加载或解析失败 */
  error: [error: Error, ctx: FilePreviewContext];
  /** 当前文件类型不支持预览 */
  unsupported: [type: string, ctx: FilePreviewContext];
  /** 缩放比例变化（v-model:zoom） */
  'update:zoom': [zoom: number];
  /** 缩放比例变化 */
  'zoom-change': [zoom: number, info: FilePreviewZoomInfo, ctx: FilePreviewContext];
};

/** useFilePreview 打开选项 */
export interface UseFilePreviewOptions {
  /** 文件名（仅 open 单个文件时生效） */
  fileName?: string;
  /** 显式指定文件类型（仅 open 单个文件时生效） */
  fileType?: FilePreviewFileType;
  /** 弹窗宽度 */
  width?: string | number;
  /** 弹窗标题；设置后不显示文件切换下拉 */
  title?: string;
  /** 多个文件时标题是否显示为文件切换下拉，默认 true（规则同 YFilePreviewModal） */
  fileSwitcher?: boolean;
  /** 是否循环翻页，默认 false（规则同 YFilePreviewModal，也作用于返回句柄的 next / prev） */
  loop?: boolean;
  /** 允许预览的最大字节数 */
  maxSize?: number;
  /** 大文件提示阈值（字节） */
  largeFileWarnSize?: number;
  /** Excel 单元格数阈值 */
  excelMaxCells?: FilePreviewExcelMaxCells;
  /** 文本解码策略 */
  textEncoding?: TextEncoding;
  /** CSV 初始显示方式 */
  csvMode?: CsvMode;
  /** CSV 表格是否显示行号列 */
  csvRowNumber?: boolean;
  /** CSV 表格最多显示的数据行数 */
  csvMaxRows?: number;
  /** 加载超时（毫秒） */
  timeout?: number;
  /** 是否显示下载按钮，规则同 YFilePreviewModal */
  showDownload?: boolean;
  /** 是否允许方向键切换 */
  keyboard?: boolean;
  /** 自定义下载 */
  customDownload?: FilePreviewCustomDownload;
  /** 是否允许缩放，规则同 YFilePreviewModal */
  zoomable?: boolean | FilePreviewFileType[];
  /** 初始缩放比例 */
  zoom?: number;
  zoomMin?: number;
  zoomMax?: number;
  zoomStep?: number;
  zoomFit?: FilePreviewZoomFit;
  /** 缩放比例变化 */
  onZoomChange?: (zoom: number, info: FilePreviewZoomInfo, ctx: FilePreviewContext) => void;
  /** 当前文件变化（翻页、列表更新） */
  onChange?: (ctx: FilePreviewContext) => void;
  /** 当前文件渲染完成 */
  onLoaded?: (payload: FilePreviewLoadedPayload, ctx: FilePreviewContext) => void;
  /** 当前文件加载或解析失败 */
  onError?: (error: Error, ctx: FilePreviewContext) => void;
  /** 弹窗关闭，参数为关闭时的下标 */
  onClose?: (lastIndex: number) => void;
  /** 插槽（render 函数），在调用方的 appContext 中渲染 */
  slots?: FilePreviewModalSlots;
}

/** open / openList 返回的控制句柄，只对本次打开有效 */
export interface FilePreviewController {
  /** 关闭弹窗 */
  close: () => void;
  /** 切换到指定下标 */
  goTo: (index: number) => void;
  /** 下一个文件 */
  next: () => void;
  /** 上一个文件 */
  prev: () => void;
  /**
   * 替换文件列表（如删除当前文件）。不传 index 时停在原下标，越界自动收敛并触发 onChange；
   * 列表为空时自动关闭
   */
  update: (files: Array<FileSource | FilePreviewItem>, index?: number) => void;
  /** 当前下标 */
  readonly index: number;
  /** 本次打开结束（关闭或被下一次 open 替换）时 resolve，值为最后的下标 */
  afterClose: Promise<number>;
}

/** useFilePreview 返回值 */
export interface UseFilePreviewReturn {
  /** 弹窗是否显示（只读） */
  visible: Readonly<Ref<boolean>>;
  /** 当前文件列表（只读，修改请用 controller.update） */
  fileList: Readonly<Ref<readonly FilePreviewItem[]>>;
  /** 当前文件索引（只读） */
  currentIndex: Readonly<Ref<number>>;
  /** 预览单个文件 */
  open: (file: FileSource | FilePreviewItem, options?: UseFilePreviewOptions) => FilePreviewController;
  /** 预览多个文件，从 startIndex 开始 */
  openList: (
    files: Array<FileSource | FilePreviewItem>,
    startIndex?: number,
    options?: Omit<UseFilePreviewOptions, 'fileName' | 'fileType'>
  ) => FilePreviewController;
  /** 关闭弹窗 */
  close: () => void;
}
