/**
 * 创建图片缩小 Worker。发布的包在构建时换成内联 Worker（见 packages/components/build/inline-workers.ts）。
 * 不支持 Worker / OffscreenCanvas 或创建失败（如 CSP 限制）时返回 null，调用方在主线程缩小
 */
export function createImagePreviewWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    return new Worker(new URL('./preview-worker.ts', import.meta.url), { type: 'module', name: 'yss-image-preview' });
  } catch {
    return null;
  }
}
