/**
 * 超大图片的缩小版：在 Worker 里解码、缩小（OffscreenCanvas），主线程只接收缩小后的 ImageBitmap
 */
interface PreviewRequest {
  blob: Blob;
  width: number;
  height: number;
}

self.onmessage = async (event: MessageEvent<PreviewRequest>) => {
  const { blob, width, height } = event.data;
  try {
    const full = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, width, height);
    full.close();
    const bitmap = canvas.transferToImageBitmap();
    (self as unknown as Worker).postMessage({ bitmap }, [bitmap]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: String(err) });
  }
};
