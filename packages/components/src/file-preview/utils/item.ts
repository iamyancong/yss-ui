/**
 * 文件列表项工具函数。
 */
import type { FilePreviewFileType, FilePreviewItem, FileSource } from '../types';

/** 从 URL 中猜测文件名，无法识别时返回空字符串 */
export function guessFileNameFromUrl(url: string): string {
  if (/^(blob|data):/i.test(url)) return '';
  try {
    const clean = url.split(/[?#]/)[0] ?? '';
    const name = clean.split('/').pop() ?? '';
    return name ? decodeURIComponent(name) : '';
  } catch {
    return '';
  }
}

/** 是否为 FilePreviewItem 对象 */
export function isPreviewItem(value: unknown): value is FilePreviewItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(typeof Blob !== 'undefined' && value instanceof Blob) &&
    !(value instanceof ArrayBuffer) &&
    'source' in value
  );
}

/**
 * 把 File / Blob / URL / 懒加载函数 / FilePreviewItem 统一成 FilePreviewItem。
 * 传入 FilePreviewItem 且没有覆盖字段时原样返回，回调和事件里拿到的就是调用方的原对象。
 */
export function normalizePreviewItem(
  file: FileSource | FilePreviewItem,
  overrides?: { fileName?: string; fileType?: FilePreviewFileType }
): FilePreviewItem {
  if (isPreviewItem(file) && !overrides?.fileName && !overrides?.fileType) return file;
  const item: FilePreviewItem = isPreviewItem(file) ? { ...file } : { source: file };
  if (overrides?.fileName) item.fileName = overrides.fileName;
  if (overrides?.fileType) item.fileType = overrides.fileType;
  return item;
}

/** 解析文件项的原始文件名，无法识别时返回空字符串 */
export function resolveItemName(item: FilePreviewItem | undefined): string {
  if (!item) return '';
  if (item.fileName) return item.fileName;
  const { source } = item;
  if (typeof File !== 'undefined' && source instanceof File) return source.name;
  if (typeof source === 'string') return guessFileNameFromUrl(source);
  return '';
}

/** 文件大小（字节）：优先 item.fileSize，其次 File / Blob 自身的大小；未知时返回 undefined */
export function resolveItemSize(item: FilePreviewItem | undefined): number | undefined {
  if (!item) return undefined;
  const { fileSize, source } = item;
  if (typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize >= 0) return fileSize;
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source.size;
  if (source instanceof ArrayBuffer) return source.byteLength;
  return undefined;
}

/**
 * 拆分文件名为主体与后缀（含点），用于「中间省略、保留后缀」的显示。
 * 没有后缀、以点开头（如 .env）或后缀过长（大于 8 个字符）时整个视为主体。
 */
export function splitFileName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1 || name.length - dot - 1 > 8) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}
