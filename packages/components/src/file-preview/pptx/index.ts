/**
 * `@yss-ui/components/file-preview/pptx` 子路径入口：**实验性** PPTX 预览，按需启用。
 *
 * 默认不安装、不打包：业务项目需要预览 .pptx 时才
 * 1. 安装可选依赖：`pnpm add @aiden0z/pptx-renderer@1.4.0`
 * 2. 在 main.ts 调用一次：`registerPptxRenderer()`
 *
 * 导入本模块没有副作用；不调用 registerPptxRenderer 时 .pptx 显示「暂不支持」并提示如何启用。
 */
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import { createPptxRenderer, type PptxRendererOptions } from './renderer';

export { createPptxRenderer, pptxRenderer } from './renderer';
export type { PptxRendererLibrary, PptxRendererOptions, PptxZipLimits } from './renderer';
export type { MetafileLoader } from './metafile';

/**
 * 启用 .pptx 预览（实验性）。在应用入口调用一次即可，对之后创建的全部 YFilePreview / YFilePreviewModal 生效。
 * 重复调用会以最后一次的配置为准。
 *
 * @returns 取消注册的函数，调用后 .pptx 恢复为「暂不支持」
 */
export function registerPptxRenderer(options?: PptxRendererOptions): () => void {
  registerPreviewRenderer(createPptxRenderer(options));
  return () => unregisterPreviewRenderer('pptx');
}
