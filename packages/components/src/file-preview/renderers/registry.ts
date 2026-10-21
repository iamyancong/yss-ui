/**
 * 渲染器注册表：内置渲染器按需动态加载，自定义渲染器优先。
 * pptx 不是内置格式，由 `@yss-ui/components/file-preview/pptx` 的 registerPptxRenderer() 显式注册。
 */
import type { PreviewRenderer } from './types';

const customRenderers = new Map<string, PreviewRenderer>();

const builtinLoaders: Record<string, () => Promise<PreviewRenderer>> = {
  docx: () => import('./docx').then(m => m.docxRenderer),
  xlsx: () => import('./excel').then(m => m.excelRenderer),
  xls: () => import('./excel').then(m => m.excelRenderer),
  pdf: () => import('./pdf').then(m => m.pdfRenderer),
  txt: () => import('./text').then(m => m.textRenderer),
  csv: () => import('./csv').then(m => m.csvRenderer),
  md: () => import('./text').then(m => m.textRenderer),
  png: () => import('./image').then(m => m.imageRenderer),
  jpg: () => import('./image').then(m => m.imageRenderer),
  gif: () => import('./image').then(m => m.imageRenderer),
  webp: () => import('./image').then(m => m.imageRenderer),
  svg: () => import('./image').then(m => m.imageRenderer),
  bmp: () => import('./image').then(m => m.imageRenderer),
  ico: () => import('./image').then(m => m.imageRenderer),
};

/**
 * 注册自定义渲染器，可覆盖内置格式或新增格式。
 * 新增格式需要同时通过 fileType 或文件后缀让组件识别到该类型。
 */
export function registerPreviewRenderer(renderer: PreviewRenderer): void {
  if (!renderer || !Array.isArray(renderer.types) || renderer.types.length === 0) {
    throw new TypeError('registerPreviewRenderer: renderer.types must be a non-empty array');
  }
  if (typeof renderer.create !== 'function') {
    throw new TypeError('registerPreviewRenderer: renderer.create must be a function');
  }
  for (const type of renderer.types) {
    customRenderers.set(type.toLowerCase(), renderer);
  }
}

/** 注销指定类型的自定义渲染器，恢复内置行为 */
export function unregisterPreviewRenderer(type: string): void {
  customRenderers.delete(type.toLowerCase());
}

/** 清空全部自定义渲染器（主要用于测试） */
export function clearCustomRenderers(): void {
  customRenderers.clear();
}

/** 是否注册了该类型的自定义渲染器 */
export function hasCustomRenderer(type: string): boolean {
  return customRenderers.has(type.toLowerCase());
}

/** 已注册的自定义渲染器类型 */
export function getCustomRendererTypes(): string[] {
  return [...customRenderers.keys()];
}

/**
 * 获取文件类型对应的渲染器。没有可用渲染器时返回 null；
 * 内置渲染器分包加载失败时抛出原始错误，不会被当成“不支持”。
 */
export async function getRenderer(fileType: string): Promise<PreviewRenderer | null> {
  const normalizedType = fileType.toLowerCase();
  const custom = customRenderers.get(normalizedType);
  if (custom) return custom;
  const loader = builtinLoaders[normalizedType];
  return loader ? loader() : null;
}
