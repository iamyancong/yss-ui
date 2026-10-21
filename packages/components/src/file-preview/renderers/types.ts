/**
 * 渲染器接口定义。
 */
import type { AppContext } from 'vue';
import type { YssFilePreviewLocale } from '../../locale/types';
import type { CsvMode, TextEncoding } from '../types';

/** 文案翻译函数 */
export type FilePreviewTranslate = (
  key: keyof YssFilePreviewLocale,
  params?: Record<string, string | number>
) => string;

/** 渲染上下文 */
export interface RenderContext {
  /** 原始文件名（未转义，只能作为文本使用） */
  fileName: string;
  /** 识别出的文件类型 */
  fileType: string;
  /** 文本解码策略 */
  textEncoding: TextEncoding;
  /** CSV 初始显示方式 */
  csvMode?: CsvMode;
  /** CSV 表格是否显示行号列 */
  csvRowNumber?: boolean;
  /**
   * 是否允许下载。为 false 时内置 PDF 渲染器会尽量隐藏浏览器 PDF 查看器的工具栏
   * （仅 Chromium 内核支持，不是下载防护）。
   */
  showDownload?: boolean;
  /** 切换文件或组件卸载时触发中止，渲染器应在 await 之后检查 signal.aborted */
  signal: AbortSignal;
  /** 当前语言的文案翻译函数 */
  t: FilePreviewTranslate;
  /** 当前语言（如 'zh-CN'），用于日期、数字等按地区显示；自定义渲染器可忽略 */
  locale?: string;
  /** 宿主应用上下文，渲染器内部挂载 Vue 组件时使用 */
  appContext: AppContext | null;
}

/** 一次渲染对应的渲染实例，每个 YFilePreview 实例、每个文件独立创建 */
export interface PreviewRendererInstance {
  /**
   * 把文件渲染到容器里。容器是本次渲染专用的空节点。
   * 缺少依赖时抛出 MissingDependencyError。
   */
  render(container: HTMLElement, data: ArrayBuffer, context: RenderContext): Promise<void>;
  /**
   * 预览区域尺寸变化后调用（全屏切换、窗口缩放、父容器变化，已防抖，只在渲染完成后调用）。
   * 内容随容器自适应（iframe、流式布局）的渲染器不需要实现；按初始化尺寸绘制的（如 canvas）在这里重新布局。
   */
  resize?(): void;
  /** 释放本实例创建的 DOM、事件监听、Blob URL 等资源 */
  destroy?(): void;
}

/** 渲染器：声明支持的类型，并为每次渲染创建独立实例 */
export interface PreviewRenderer {
  /** 支持的文件类型，例如 ['docx'] 或 ['txt', 'csv', 'md'] */
  types: string[];
  /** 创建渲染实例 */
  create(): PreviewRendererInstance;
}
