/// <reference types="vite/client" />
/** 发布包里的 createOfficeVerifierWorker（见 ./inline-workers.ts）：Vite 构建时把 Worker 打包成内联代码 */
import OfficeVerifierWorker from '../src/file-preview/utils/verifier-worker?worker&inline';

export function createOfficeVerifierWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    return new OfficeVerifierWorker({ name: 'yss-office-verifier' });
  } catch {
    return null;
  }
}
