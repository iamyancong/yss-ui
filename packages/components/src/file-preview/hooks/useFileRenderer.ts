/**
 * 文件预览渲染调度：加载数据 → 识别类型 → 加载渲染器 → 渲染。
 * 每次渲染使用独立的 AbortController、子容器和渲染实例，切换文件或卸载时整体销毁，
 * 过期的异步结果不会写入新文件的容器。
 */
import { getCurrentInstance, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { DEFAULT_MAX_FILE_SIZE, RESIZE_DEBOUNCE } from '../constant';
import { isAbortError, MissingDependencyError } from '../errors';
import { getRenderer, hasCustomRenderer } from '../renderers/registry';
import type { FilePreviewTranslate, PreviewRendererInstance, PreviewZoomController } from '../renderers/types';
import type {
  FilePreviewContext,
  FilePreviewFileType,
  FilePreviewItem,
  FilePreviewProps,
  FilePreviewStatus,
  FileSource,
} from '../types';
import { detectFileType } from '../utils/detect';
import { observeResize } from '../utils/resize';
import { downloadFile, loadFileData, saveBlob } from './useFileData';

export interface UseFileRendererOptions {
  props: FilePreviewProps;
  emit: {
    (e: 'loaded', payload: { fileName: string; fileType: FilePreviewFileType }): void;
    (e: 'error', error: Error): void;
    (e: 'unsupported', type: string): void;
  };
  containerRef: Ref<HTMLElement | null>;
  t: FilePreviewTranslate;
  /** 当前语言名，如 'zh-CN' */
  locale?: () => string;
  /** 渲染前读取缩放设置：初始比例、是否由外壳显示缩放控件 */
  zoomContext?: (fileType: string) => { zoom?: number; externalZoomControl?: boolean };
}

interface RenderSession {
  controller: AbortController;
  host: HTMLElement | null;
  instance: PreviewRendererInstance | null;
}

function disposeSession(session: RenderSession): void {
  session.controller.abort();
  try {
    session.instance?.destroy?.();
  } catch {
    // 渲染器销毁失败不应影响后续渲染
  }
  session.instance = null;
  session.host?.remove();
  session.host = null;
}

export function useFileRenderer({ props, emit, containerRef, t, locale, zoomContext }: UseFileRendererOptions) {
  const appContext = getCurrentInstance()?.appContext ?? null;

  const status = ref<FilePreviewStatus>('idle');
  const error = ref<Error | null>(null);
  /** 不支持时识别出的类型或后缀 */
  const unsupportedType = ref('');
  /** 内容不符时声明的类型 */
  const mismatchType = ref('');
  /** 缺失的依赖包名 */
  const missingPackage = ref('');
  const detectedType = ref<FilePreviewFileType | null>(null);
  /** 原始文件名（未转义） */
  const fileName = ref('');
  const fileSize = ref(0);
  /** 当前渲染器的缩放能力（渲染完成后才有） */
  const zoomController = shallowRef<PreviewZoomController | null>(null);

  let current: RenderSession | null = null;
  /** 最近一次成功读取的内容，下载时直接保存，不重复请求 */
  let loadedData: { buffer: ArrayBuffer; mimeType?: string } | null = null;
  /** 懒加载来源解析出的实际来源 */
  let resolvedSource: FileSource | null = null;

  const hasSource = () => props.source !== undefined && props.source !== null && props.source !== '';
  const currentItem = (): FilePreviewItem => ({
    source: props.source,
    fileName: props.fileName,
    fileType: props.fileType,
  });

  const teardown = () => {
    zoomController.value = null;
    if (current) {
      disposeSession(current);
      current = null;
    }
  };

  const render = async (): Promise<void> => {
    teardown();
    const session: RenderSession = { controller: new AbortController(), host: null, instance: null };
    current = session;
    const isStale = () => current !== session || session.controller.signal.aborted;

    error.value = null;
    unsupportedType.value = '';
    mismatchType.value = '';
    missingPackage.value = '';
    detectedType.value = null;
    fileName.value = props.fileName ?? '';
    fileSize.value = 0;
    loadedData = null;
    resolvedSource = null;

    if (!hasSource()) {
      status.value = 'idle';
      return;
    }

    status.value = 'loading';

    try {
      const result = await loadFileData(props.source, {
        fileName: props.fileName,
        maxSize: props.maxSize ?? DEFAULT_MAX_FILE_SIZE,
        signal: session.controller.signal,
        t,
        file: currentItem(),
      });
      if (isStale()) return;

      resolvedSource = result.resolved ?? null;
      fileName.value = result.fileName;
      fileSize.value = result.size;

      if (result.kind === 'oversize') {
        status.value = 'oversize';
        return;
      }

      const detected = detectFileType(result.fileName, result.mimeType, result.buffer, props.fileType);
      if (detected.isEmpty) {
        status.value = 'empty';
        return;
      }
      if (detected.mismatch) {
        mismatchType.value = detected.expectedType ?? '';
        status.value = 'mismatch';
        return;
      }
      // 内置识别不了、但注册了自定义渲染器的新格式（如 ofd），交给自定义渲染器
      const customType =
        !detected.type && detected.expectedType && hasCustomRenderer(detected.expectedType)
          ? detected.expectedType.toLowerCase()
          : null;
      if (!detected.type && !customType) {
        unsupportedType.value = detected.expectedType || 'unknown';
        status.value = 'unsupported';
        emit('unsupported', unsupportedType.value);
        return;
      }

      const fileType = (detected.type ?? customType) as string;
      detectedType.value = fileType;

      const renderer = await getRenderer(fileType);
      if (isStale()) return;
      if (!renderer) {
        unsupportedType.value = fileType;
        status.value = 'unsupported';
        emit('unsupported', fileType);
        return;
      }

      const container = containerRef.value;
      if (!container) throw new Error('FilePreview container is not mounted');

      const host = document.createElement('div');
      host.className = 'yss-file-preview__host';
      container.appendChild(host);
      session.host = host;
      session.instance = renderer.create();

      await session.instance.render(host, result.buffer, {
        fileName: result.fileName,
        fileType,
        textEncoding: props.textEncoding ?? 'auto',
        csvMode: props.csvMode ?? 'table',
        csvRowNumber: props.csvRowNumber ?? false,
        // 内置 PDF 查看器里的下载无法拦截：配置了 customDownload 时一并隐藏
        showDownload: (props.showDownload ?? true) && !props.customDownload,
        signal: session.controller.signal,
        t,
        locale: locale?.(),
        appContext,
        ...(zoomContext?.(fileType) ?? {}),
      });
      if (isStale()) return;

      zoomController.value = session.instance.zoom ?? null;

      loadedData = { buffer: result.buffer, mimeType: result.mimeType };
      status.value = 'ready';
      emit('loaded', { fileName: result.fileName, fileType });
    } catch (err) {
      if (isStale() || isAbortError(err)) return;
      // 渲染一半失败时先清理残留 DOM，再展示错误
      try {
        session.instance?.destroy?.();
      } catch {
        // ignore
      }
      session.instance = null;
      session.host?.remove();
      session.host = null;

      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (wrapped instanceof MissingDependencyError) {
        missingPackage.value = wrapped.packageName;
        status.value = 'missing-dependency';
      } else {
        error.value = wrapped;
        status.value = 'error';
      }
      emit('error', wrapped);
    }
  };

  /** 默认下载：优先保存已读取的内容，其次用实际来源 */
  const defaultDownload = async (source?: FileSource, name?: string): Promise<void> => {
    const target = name || fileName.value || props.fileName || 'download';
    if (source !== undefined) {
      await downloadFile(source, target, { file: currentItem() });
      return;
    }
    if (loadedData) {
      saveBlob(new Blob([loadedData.buffer], loadedData.mimeType ? { type: loadedData.mimeType } : undefined), target);
      return;
    }
    const fallback = resolvedSource ?? (hasSource() ? props.source : null);
    if (fallback === null) return;
    await downloadFile(fallback, target, { file: currentItem(), preferLink: status.value === 'oversize' });
  };

  /** 单独使用时的上下文；弹窗会用自己的上下文覆盖导航相关字段 */
  const getContext = (): FilePreviewContext => ({
    file: currentItem(),
    index: 0,
    total: 1,
    status: status.value,
    prev: () => undefined,
    next: () => undefined,
    goTo: () => undefined,
    close: () => undefined,
    download,
    reload: render,
  });

  async function download(): Promise<void> {
    if (!hasSource()) return;
    if (props.customDownload) {
      await props.customDownload({
        ...getContext(),
        data: loadedData?.buffer,
        defaultDownload,
      });
      return;
    }
    await defaultDownload();
  }

  watch(
    () => [
      props.source,
      props.fileName,
      props.fileType,
      props.maxSize,
      props.textEncoding,
      props.csvMode,
      props.csvRowNumber,
      props.showDownload,
      !!props.customDownload,
    ],
    () => {
      void render();
    }
  );

  // 预览区域尺寸变化（全屏切换、窗口缩放）时通知当前渲染器重新布局
  let stopResize: (() => void) | null = null;
  watch(
    containerRef,
    el => {
      stopResize?.();
      stopResize = el
        ? observeResize(
            el,
            () => {
              if (status.value !== 'ready' || !current?.instance?.resize) return;
              try {
                current.instance.resize();
              } catch {
                // 重新布局失败不影响已显示的内容
              }
            },
            RESIZE_DEBOUNCE
          )
        : null;
    },
    { flush: 'post', immediate: true }
  );

  onBeforeUnmount(() => {
    stopResize?.();
    stopResize = null;
    teardown();
  });

  return {
    status,
    error,
    unsupportedType,
    mismatchType,
    missingPackage,
    detectedType,
    fileName,
    fileSize,
    render,
    download,
    getContext,
    teardown,
    zoomController,
  };
}
