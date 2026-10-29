/**
 * 超大图片的缩小版（优先在 Worker 里缩小）。按需加载，不进入主入口
 */
import { IMAGE_PREVIEW_SIDE } from '../../constant';
import { createImagePreviewWorker } from './preview-worker-factory';

/** 在 Worker 里解码并缩小；Worker 不可用或失败时返回 null */
function previewInWorker(blob: Blob, width: number, height: number, signal: AbortSignal): Promise<ImageBitmap | null> {
  const worker = createImagePreviewWorker();
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const finish = (bitmap: ImageBitmap | null) => {
      worker.terminate();
      signal.removeEventListener('abort', onAbort);
      resolve(bitmap);
    };
    const onAbort = () => finish(null);
    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ bitmap?: ImageBitmap }>) => finish(event.data?.bitmap ?? null);
    worker.onerror = event => {
      event.preventDefault?.();
      finish(null);
    };
    worker.onmessageerror = () => finish(null);
    try {
      worker.postMessage({ blob, width, height });
    } catch {
      finish(null);
    }
  });
}

/**
 * 缩小版：长边不超过 IMAGE_PREVIEW_SIDE。优先在 Worker 里缩小（主线程不阻塞），
 * 否则用 createImageBitmap 的缩放；都不支持时返回 null（按原图显示）
 */
export async function createPreview(
  blob: Blob,
  width: number,
  height: number,
  signal: AbortSignal
): Promise<HTMLCanvasElement | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const ratio = IMAGE_PREVIEW_SIDE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  try {
    const bitmap =
      (await previewInWorker(blob, w, h, signal)) ??
      (signal.aborted
        ? null
        : await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }));
    if (!bitmap) return null;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('bitmaprenderer') as ImageBitmapRenderingContext | null;
    if (ctx) ctx.transferFromImageBitmap(bitmap);
    else {
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
    }
    return canvas;
  } catch {
    return null;
  }
}
