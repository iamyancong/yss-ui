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
  /** 初始缩放比例（1 = 100%）。实现了 zoom 的渲染器可直接按该比例渲染，避免先按 100% 渲染再重绘 */
  zoom?: number;
  /**
   * 缩放控件由外壳显示（如弹窗头部）。为 true 时渲染器不要再显示自己的放大 / 缩小按钮，
   * 其他工具（如图片旋转）照常显示
   */
  externalZoomControl?: boolean;
}

/** 渲染器的缩放能力：外壳只负责 UI 与快捷键，实际怎么缩放由渲染器决定 */
export interface PreviewZoomController {
  /** 当前比例（1 = 100%）；有待应用的比例时返回待应用的值 */
  get(): number;
  /**
   * 设置比例（外壳已收敛到范围内）。可以异步、防抖应用。
   * anchor 为视口坐标（clientX / clientY）：锚点下的内容保持不动；没有时由渲染器决定（如保持左上角）
   */
  set(zoom: number, options?: { anchor?: { x: number; y: number } }): void;
  /**
   * 连续缩放（触控板捏合）过程中每帧最多调用一次，应立即按该比例显示（如表格每帧真正重绘）；
   * 手势结束后外壳再调用一次 set 收尾。没有实现时外壳在手势中直接调用 set
   */
  preview?(zoom: number, anchor?: { x: number; y: number }): void;
  /** 按模式计算并应用适应比例，返回应用后的比例；不支持的模式返回 undefined */
  fit?(mode: 'width' | 'page'): number | undefined;
  /** 建议的缩放范围；没有设置 zoomMin / zoomMax 时使用，缺省为 50%–200% */
  range?: { min?: number; max?: number };
  /**
   * 渲染器自己改变了比例（如图片内的 Ctrl + 滚轮、双击）时通知外壳；返回取消订阅函数。
   * info.live 为 true 表示手势进行中（外壳只更新显示的百分比），结束时会再通知一次不带 live 的最终比例
   */
  onChange?(listener: (zoom: number, info?: { live?: boolean }) => void): () => void;
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
  /**
   * 缩放能力（可选）。在 render 完成后读取；没有实现时外壳不显示缩放控件（如 pdf，浏览器查看器自带缩放）
   */
  zoom?: PreviewZoomController;
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
