/**
 * 在 Worker 里解析 Excel；中止时 terminate，立即释放解析占用的内存与 CPU。
 */
import type { XsSheet } from './apply';
import { createAssembler, type BuildMessage, type BuildRequest } from './build-runner';
import type { WorkbookModel } from './model';
import { createExcelWorker } from './worker-factory';

export type WorkerBuildResult =
  | { status: 'ok'; model: WorkbookModel; sheets: XsSheet[] }
  /** 文件不能直接读取 */
  | { status: 'none' }
  | { status: 'aborted' }
  /** 没有 Worker、创建或运行失败：改在主线程解析 */
  | { status: 'unavailable' };

export function buildInWorker(
  request: BuildRequest,
  signal?: AbortSignal,
  onProgress?: (value: number) => void
): Promise<WorkerBuildResult> {
  if (signal?.aborted) return Promise.resolve({ status: 'aborted' });
  const worker = createExcelWorker();
  if (!worker) return Promise.resolve({ status: 'unavailable' });
  return new Promise<WorkerBuildResult>(resolve => {
    const assembler = createAssembler();
    let settled = false;
    const finish = (result: WorkerBuildResult) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ status: 'aborted' });
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<BuildMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        if (!settled) onProgress?.(message.value);
        return;
      }
      if (message.type === 'error') {
        finish({ status: 'unavailable' });
        return;
      }
      try {
        assembler.post(message);
      } catch {
        finish({ status: 'unavailable' });
        return;
      }
      if (message.type === 'none') finish({ status: 'none' });
      else if (message.type === 'done') {
        const result = assembler.result();
        finish(result ? { status: 'ok', ...result } : { status: 'unavailable' });
      }
    };
    worker.onerror = event => {
      event.preventDefault?.();
      finish({ status: 'unavailable' });
    };
    worker.onmessageerror = () => finish({ status: 'unavailable' });
    try {
      // 复制一份交给 Worker（原文件还要用于下载、读取图片）
      const data = request.data.slice(0);
      worker.postMessage({ ...request, data }, [data]);
    } catch {
      finish({ status: 'unavailable' });
    }
  });
}
