/// <reference types="vite/client" />
/** 发布包里的 createExcelWorker（见 ./inline-workers.ts）：Vite 构建时把 Worker 打包成内联代码 */
import ExcelWorker from '../src/file-preview/excel/worker?worker&inline';

export function createExcelWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new ExcelWorker({ name: 'yss-excel-preview' });
  } catch {
    return null;
  }
}
