/// <reference types="vite/client" />
/** 发布包里的 createImagePreviewWorker（见 ./inline-workers.ts）：Vite 构建时把 Worker 打包成内联代码 */
import ImagePreviewWorker from '../src/file-preview/renderers/image/preview-worker?worker&inline';

export function createImagePreviewWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    return new ImagePreviewWorker({ name: 'yss-image-preview' });
  } catch {
    return null;
  }
}
