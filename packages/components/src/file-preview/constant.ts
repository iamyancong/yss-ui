/**
 * 文件预览常量与默认配置。
 */
import type { FileType, ImageFileType } from './types';

/** 默认最大允许预览的文件大小：20MB */
export const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 默认的「大文件」提示阈值：10MB。超过时在预览上方显示提示条（滚动、缩放可能略慢），不拦截预览（作用于 xlsx / xls / docx / pptx） */
export const DEFAULT_LARGE_FILE_WARN_SIZE = 10 * 1024 * 1024;

/** Excel 单元格数超过该值时在表格上方显示提示条（滚动、缩放可能略慢），不拦截预览 */
export const DEFAULT_EXCEL_WARN_CELLS = 300_000;

/**
 * Excel 最多读取的单元格数（实际读到的数量，不看文件里写的范围）：超过时只显示前面的行，并提示下载查看完整内容。
 * 300 万个单元格约 4.5 秒、占用约 190MB；内容异常多（如解压后几百 MB 的文件）时不会把页面拖垮
 */
export const DEFAULT_EXCEL_MAX_CELLS = 5_000_000;

/** Excel 的行列上限（超出范围的单元格不显示） */
export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLS = 16_384;

/** 文本超过该大小时分段显示：2MB */
export const TEXT_LARGE_FILE_THRESHOLD = 2 * 1024 * 1024;

/** 大文本每次追加显示的字节数：512KB */
export const TEXT_CHUNK_SIZE = 512 * 1024;

/** CSV 表格每次渲染的行数 */
export const CSV_PAGE_SIZE = 1000;

/** 自动识别文本编码时采样的字节数：64KB */
export const TEXT_ENCODING_PROBE_SIZE = 64 * 1024;

/** zip 文件头/尾部用于识别 docx、xlsx 的扫描范围：256KB */
export const ZIP_SNIFF_RANGE = 256 * 1024;

/** 内置支持的图片类型 */
export const IMAGE_FILE_TYPES: readonly ImageFileType[] = ['png', 'jpg', 'gif', 'webp', 'svg', 'bmp', 'ico'];

/**
 * 内置支持的全部文件类型。
 * pptx 不在其中：需要从 `@yss-ui/components/file-preview/pptx` 调用 registerPptxRenderer() 启用（实验性）。
 */
export const SUPPORTED_FILE_TYPES: readonly FileType[] = [
  'docx',
  'xlsx',
  'xls',
  'pdf',
  'txt',
  'csv',
  'md',
  ...IMAGE_FILE_TYPES,
];

/** 文本类文件类型 */
export const TEXT_FILE_TYPES: readonly FileType[] = ['txt', 'csv', 'md'];

/**
 * 浏览器无法直接解析的旧版 / 国产办公格式。
 * 仍显示「暂不支持」，但提示改由后端转换为 PDF 后预览。
 */
export const LEGACY_OFFICE_TYPES: readonly string[] = ['doc', 'ppt', 'pps', 'rtf', 'wps', 'dps', 'et'];

/** 文件后缀名与文件类型对应表 */
export const EXTENSION_TYPE_MAP: Record<string, FileType> = {
  docx: 'docx',
  xlsx: 'xlsx',
  xls: 'xls',
  pptx: 'pptx',
  pdf: 'pdf',
  txt: 'txt',
  csv: 'csv',
  md: 'md',
  markdown: 'md',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  svg: 'svg',
  bmp: 'bmp',
  ico: 'ico',
};

/** 常见 MIME 类型与文件类型对应表 */
export const MIME_TYPE_MAP: Record<string, FileType> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

/** 图片类型对应的 MIME，用于生成 Blob URL */
export const IMAGE_MIME_MAP: Record<ImageFileType, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

/**
 * 文件头特征字节。
 * - docx / xlsx / pptx 是 zip 容器：`PK\x03\x04`，空 zip 为 `PK\x05\x06`
 * - pdf 以 `%PDF` 开头
 * - xls（以及 doc / ppt）是 OLE 复合文档：`D0 CF 11 E0`
 * - 图片：PNG `89 50 4E 47`、JPEG `FF D8 FF`、GIF `GIF8`、WebP `RIFF....WEBP`、BMP `BM`、ICO `00 00 01 00`
 */
export const MAGIC_NUMBER_MAP = {
  zip: [0x50, 0x4b, 0x03, 0x04],
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  pdf: [0x25, 0x50, 0x44, 0x46],
  oleCompound: [0xd0, 0xcf, 0x11, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  riff: [0x52, 0x49, 0x46, 0x46],
  webp: [0x57, 0x45, 0x42, 0x50],
  bmp: [0x42, 0x4d],
  ico: [0x00, 0x00, 0x01, 0x00],
} as const;

/** 识别 SVG 时检查的文本长度：前 4KB */
export const SVG_SNIFF_RANGE = 4 * 1024;

/** 图片缩放范围（相对原始尺寸）与每次缩放倍数 */
export const IMAGE_MIN_SCALE = 0.05;
export const IMAGE_MAX_SCALE = 8;
export const IMAGE_ZOOM_STEP = 1.25;
/** 图片放大后显示尺寸的上限（像素），避免超大图放大后元素尺寸失控 */
export const IMAGE_MAX_DISPLAY_SIZE = 32768;

/** 数量按语言加千分位（如 1,500,000） */
export function formatCount(n: number, locale?: string): string {
  try {
    return Math.round(n).toLocaleString(locale || undefined);
  } catch {
    return String(Math.round(n));
  }
}

/** 格式化文件字节大小 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${size} ${units[i]}`;
}

/** 预览容器尺寸变化后通知渲染器重新布局的防抖时间（毫秒） */
export const RESIZE_DEBOUNCE = 100;

/** maxSize：正数为上限，Infinity 不限制；0、负数、NaN 等无效值按默认值 */
export function resolveMaxSize(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : DEFAULT_MAX_FILE_SIZE;
}

/** largeFileWarnSize：正的有限数为阈值；0、负数、NaN、Infinity 不按大小提示；未传时按默认值 */
export function resolveLargeFileWarnSize(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_LARGE_FILE_WARN_SIZE;
  return typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : Infinity;
}

/** 默认加载超时：60 秒（从开始读取到读完，包括懒加载来源与下载） */
export const DEFAULT_LOAD_TIMEOUT = 60_000;

/** timeout：正的有限数为毫秒数；0、负数、NaN、Infinity 不限制；未传时按默认值 */
export function resolveLoadTimeout(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_LOAD_TIMEOUT;
  return typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : Infinity;
}

/** URL 下载超过该字节数时显示下载进度 */
export const PROGRESS_MIN_BYTES = 5 * 1024 * 1024;

/** 文本「加载更多」累计显示的上限：8MB，之后只提示下载 */
export const TEXT_MAX_DISPLAY_SIZE = 8 * 1024 * 1024;

/** CSV 默认最多显示的数据行数，之后只提示下载 */
export const DEFAULT_CSV_MAX_ROWS = 50_000;

/** csvMaxRows：不小于 1 的数向下取整，Infinity 不限制；0、负数、小于 1、NaN、非数字按默认值 */
export function resolveCsvMaxRows(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 1) return DEFAULT_CSV_MAX_ROWS;
  return Number.isFinite(value) ? Math.floor(value) : Infinity;
}

/** SVG 超过该字节数时在图片上方显示非阻塞提示（矢量内容复杂度无法从文件头估算） */
export const SVG_WARN_BYTES = 5 * 1024 * 1024;

/** 图片预览的像素数上限：1 亿像素，超过时只提供下载（与 pptx / Excel 内嵌图片的上限一致） */
export const IMAGE_MAX_PIXELS = 100_000_000;

/** 图片超过该像素数时先显示缩小版（解码与绘制都更快），放大到需要更多细节时再换成原图 */
export const IMAGE_PREVIEW_PIXELS = 40_000_000;

/** 缩小版的长边像素数 */
export const IMAGE_PREVIEW_SIDE = 2048;

/** docx 页数超过该值时在文档上方显示提示条（滚动可能略慢），不拦截预览（页数取自文档属性 docProps/app.xml） */
export const DOCX_WARN_PAGES = 300;

/** pptx 页数超过该值时在上方显示提示条（按页懒绘制，阈值比 docx 低：每页都是一整块绘图） */
export const PPTX_WARN_SLIDES = 200;
