/**
 * @yss-ui/components/file-preview 子路径入口。
 * 不进入主入口和 lite 入口，按需引入文件预览能力（docx、xlsx、xls、pdf、txt、csv、md、常见图片）。
 * pptx 为实验性可选能力，在 `@yss-ui/components/file-preview/pptx` 子路径单独启用，本入口不引用 @aiden0z/pptx-renderer。
 */
export { default as YFilePreview } from './index.vue';
export { default as YFilePreviewModal } from './FilePreviewModal.vue';
export { useFilePreview } from './useFilePreview';
export {
  clearCustomRenderers,
  getRenderer,
  registerPreviewRenderer,
  unregisterPreviewRenderer,
} from './renderers/registry';
export { FileLoadError, MissingDependencyError } from './errors';
export { DEFAULT_MAX_FILE_SIZE, SUPPORTED_FILE_TYPES } from './constant';
export type {
  FilePreviewTranslate,
  PreviewRenderer,
  PreviewRendererInstance,
  PreviewZoomController,
  RenderContext,
} from './renderers/types';
export type { YssFilePreviewLocale } from '../locale/types';
export * from './types';
