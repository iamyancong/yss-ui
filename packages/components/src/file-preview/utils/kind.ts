/**
 * 文件类别与预览支持情况：文件切换列表的图标、提示使用。
 * 只根据声明的类型和后缀判断，不读取文件内容；无法判断时返回 unknown，由实际加载结果为准。
 */
import { EXTENSION_TYPE_MAP, LEGACY_OFFICE_TYPES, SUPPORTED_FILE_TYPES } from '../constant';
import { hasCustomRenderer } from '../renderers/registry';
import type { FilePreviewItem } from '../types';
import { extractExtension } from './detect';
import { resolveItemName } from './item';

/** 图标类别 */
export type FileKind = 'pdf' | 'word' | 'excel' | 'ppt' | 'image' | 'csv' | 'markdown' | 'text' | 'archive' | 'unknown';

/** 预览支持情况：legacy 为需要后端转换的旧版办公格式 */
export type FileSupport = 'supported' | 'unsupported' | 'legacy' | 'unknown';

const KIND_BY_TYPE: Record<string, FileKind> = {
  pdf: 'pdf',
  docx: 'word',
  doc: 'word',
  wps: 'word',
  rtf: 'word',
  xlsx: 'excel',
  xls: 'excel',
  et: 'excel',
  pptx: 'ppt',
  ppt: 'ppt',
  pps: 'ppt',
  dps: 'ppt',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  csv: 'csv',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  log: 'text',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
};

/** 文件的类型标识：显式 fileType 优先，其次后缀（统一为小写，.jpeg 归为 jpg） */
export function resolveItemType(item: FilePreviewItem | undefined, fallbackName = ''): string {
  if (!item) return '';
  if (item.fileType) return String(item.fileType).toLowerCase();
  const ext = extractExtension(resolveItemName(item) || fallbackName);
  return EXTENSION_TYPE_MAP[ext] ?? ext;
}

/** 图标类别 */
export function fileKindOf(type: string): FileKind {
  return KIND_BY_TYPE[type.toLowerCase()] ?? 'unknown';
}

/** 是否能预览（自定义渲染器优先；pptx 需要注册后才算支持） */
export function fileSupportOf(type: string): FileSupport {
  const normalized = type.toLowerCase();
  if (!normalized) return 'unknown';
  if (hasCustomRenderer(normalized)) return 'supported';
  if ((SUPPORTED_FILE_TYPES as readonly string[]).includes(normalized)) return 'supported';
  if (LEGACY_OFFICE_TYPES.includes(normalized)) return 'legacy';
  return 'unsupported';
}
