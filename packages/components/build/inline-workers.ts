import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * 发布的包里把 Worker 内联进按需加载的 chunk（Blob URL，失败时退回 data URL）：
 * 源码里的 new Worker(new URL('./worker.ts', import.meta.url)) 依赖消费项目的打包工具处理 node_modules 里的
 * import.meta.url（Vite 预构建、webpack 4、CJS 产物都处理不了），内联后不需要任何配置。
 * - Excel 解析 Worker：自带 numfmt 等依赖，只在打开 Excel 时加载；
 * - 图片缩小 Worker：只在打开超大图片时加载。
 */
export const inlineWorkers = (root: string): Plugin => {
  const swaps = new Map([
    [resolve(root, 'src/file-preview/excel/worker-factory.ts'), resolve(root, 'build/excel-worker-factory.ts')],
    [
      resolve(root, 'src/file-preview/renderers/image/preview-worker-factory.ts'),
      resolve(root, 'build/image-preview-worker-factory.ts'),
    ],
  ]);
  const inline = new Set(swaps.values());
  return {
    name: 'yss-inline-workers',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || inline.has(importer) || !source.endsWith('worker-factory')) return;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved ? swaps.get(resolved.id.split('?')[0]) : undefined;
    },
  };
};
