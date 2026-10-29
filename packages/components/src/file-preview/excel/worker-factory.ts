/**
 * 创建 Excel 解析 Worker。源码（文档站、测试、直接引用源码的项目）由打包工具处理 new URL(…, import.meta.url)；
 * 发布的包在构建时换成内联 Worker（见 packages/components/build/inline-workers.ts），消费项目不需要额外配置。
 * 不支持 Worker 或创建失败（如 CSP 限制）时返回 null，调用方在主线程解析
 */
export function createExcelWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'yss-excel-preview' });
  } catch {
    return null;
  }
}
