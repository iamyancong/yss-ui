/**
 * 文件预览渲染调度：加载数据 → 识别类型 → 加载渲染器 → 渲染。
 * 每次渲染使用独立的 AbortController、子容器和渲染实例，切换文件或卸载时整体销毁，
 * 过期的异步结果不会写入新文件的容器。
 */
import { getCurrentInstance, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import {
  DEFAULT_CSV_MAX_ROWS,
  PROGRESS_MIN_BYTES,
  resolveLargeFileWarnSize,
  resolveLoadTimeout,
  resolveMaxSize,
  RESIZE_DEBOUNCE,
} from '../constant';
import { FileLoadError, isAbortError, MissingDependencyError } from '../errors';
import { getRenderer, hasCustomRenderer } from '../renderers/registry';
import type {
  FilePreviewTranslate,
  PreviewPreflightResult,
  PreviewRenderer,
  PreviewRendererInstance,
  PreviewZoomController,
} from '../renderers/types';
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
  /** 大文件检查结果（large-file 状态，或按单元格数超限的 oversize 状态） */
  const largeFile = ref<PreviewPreflightResult | null>(null);
  /** URL 下载进度（超过 5MB 时才有） */
  const progress = ref<{ loaded: number; total?: number } | null>(null);
  /** 渲染器报告的解析进度（0~1，如 Excel 在 Worker 里解析） */
  const parseProgress = ref<number | null>(null);
  /** 当前渲染器的缩放能力（渲染完成后才有） */
  const zoomController = shallowRef<PreviewZoomController | null>(null);

  let current: RenderSession | null = null;
  /** large-file 状态下「继续预览」要做的事 */
  let pendingContinue: (() => Promise<void>) | null = null;
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
    largeFile.value = null;
    pendingContinue = null;
    unsupportedType.value = '';
    mismatchType.value = '';
    missingPackage.value = '';
    detectedType.value = null;
    fileName.value = props.fileName ?? '';
    fileSize.value = 0;
    progress.value = null;
    parseProgress.value = null;
    loadedData = null;
    resolvedSource = null;

    if (!hasSource()) {
      status.value = 'idle';
      return;
    }

    status.value = 'loading';

    try {
      const result = await loadWithTimeout(session);
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

      // 渲染前的大文件检查（如 Excel 估算单元格数）：超过阈值先提示确认，或只提供下载
      const verdict = await preflightOf(renderer, result.buffer, result.fileName, fileType, session.controller.signal);
      if (isStale()) return;
      if (verdict) {
        // 下载时直接保存已读取的内容
        loadedData = { buffer: result.buffer, mimeType: result.mimeType };
        largeFile.value = verdict;
        if (verdict.level === 'block') {
          status.value = 'oversize';
          return;
        }
        pendingContinue = () => mountTimed(session, renderer, result, fileType);
        status.value = 'large-file';
        return;
      }

      await mountTimed(session, renderer, result, fileType);
    } catch (err) {
      fail(session, err);
    }
  };

  /**
   * 读取文件，超过 timeout 中止并抛出超时错误。
   * 下载超过 PROGRESS_MIN_BYTES 时更新 progress
   */
  const loadWithTimeout = async (session: RenderSession) => {
    const ms = resolveLoadTimeout(props.timeout);
    const controller = new AbortController();
    const forward = () => controller.abort();
    session.controller.signal.addEventListener('abort', forward, { once: true });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 懒加载来源不理会 signal 时也能按时结束
    const timeout = new Promise<never>((_, reject) => {
      if (!Number.isFinite(ms)) return;
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new DOMException('Timeout', 'TimeoutError'));
      }, ms);
    });
    try {
      const loading = loadFileData(props.source, {
        fileName: props.fileName,
        maxSize: resolveMaxSize(props.maxSize),
        signal: controller.signal,
        t,
        file: currentItem(),
        onProgress: (loaded, total) => {
          if (current !== session) return;
          if (loaded > PROGRESS_MIN_BYTES || (total ?? 0) > PROGRESS_MIN_BYTES) progress.value = { loaded, total };
        },
      });
      // 超时后 loading 再失败（AbortError）不算未处理的异常
      loading.catch(() => undefined);
      return await Promise.race([loading, timeout]);
    } catch (err) {
      if (timedOut && !session.controller.signal.aborted) {
        throw new FileLoadError(t('loadTimeout', { seconds: Math.round(ms / 1000) }), undefined, err);
      }
      throw err;
    } finally {
      if (timer !== null) clearTimeout(timer);
      session.controller.signal.removeEventListener('abort', forward);
      if (current === session) progress.value = null;
    }
  };

  /** 渲染失败：清理残留 DOM，再展示错误 */
  const fail = (session: RenderSession, err: unknown) => {
    const isStale = () => current !== session || session.controller.signal.aborted;
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
  };

  const preflightOf = async (
    renderer: PreviewRenderer,
    data: ArrayBuffer,
    name: string,
    fileType: string,
    signal: AbortSignal
  ): Promise<PreviewPreflightResult | null> => {
    // 内置渲染器不拦截大文件（在预览上方显示提示条）；自定义渲染器可以用 preflight 先提示确认或只提供下载
    if (!renderer.preflight) return null;
    const warnSize = resolveLargeFileWarnSize(props.largeFileWarnSize);
    try {
      return await renderer.preflight(data, {
        fileName: name,
        fileType,
        signal,
        largeFileWarnSize: warnSize,
        excelMaxCells: props.excelMaxCells,
      });
    } catch {
      return null;
    }
  };

  /** 创建容器与渲染实例并渲染 */
  const mount = async (
    session: RenderSession,
    renderer: PreviewRenderer,
    result: { buffer: ArrayBuffer; fileName: string; mimeType?: string },
    fileType: string
  ): Promise<void> => {
    const isStale = () => current !== session || session.controller.signal.aborted;
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
      csvMaxRows: props.csvMaxRows ?? DEFAULT_CSV_MAX_ROWS,
      // 内置 PDF 查看器里的下载无法拦截：配置了 customDownload 时一并隐藏
      showDownload: (props.showDownload ?? true) && !props.customDownload,
      signal: session.controller.signal,
      t,
      locale: locale?.(),
      appContext,
      largeFileWarnSize: resolveLargeFileWarnSize(props.largeFileWarnSize),
      excelMaxCells: props.excelMaxCells,
      onProgress: value => {
        if (isStale() || status.value !== 'loading' || !(value >= 0)) return;
        parseProgress.value = Math.min(1, value);
      },
      ...(zoomContext?.(fileType) ?? {}),
    });
    if (current === session) parseProgress.value = null;
    if (isStale()) return;

    zoomController.value = session.instance.zoom ?? null;

    loadedData = { buffer: result.buffer, mimeType: result.mimeType };
    status.value = 'ready';
    emit('loaded', { fileName: result.fileName, fileType });
  };

  /** 渲染/解析阶段超时：终止当前会话（包括 Excel Worker），展示可重试的错误态。 */
  const mountTimed = async (
    session: RenderSession,
    renderer: PreviewRenderer,
    result: { buffer: ArrayBuffer; fileName: string; mimeType?: string },
    fileType: string
  ): Promise<void> => {
    const ms = resolveLoadTimeout(props.timeout);
    if (!Number.isFinite(ms)) return mount(session, renderer, result, fileType);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, ms);
    });
    const work = mount(session, renderer, result, fileType);
    work.catch(() => undefined);
    try {
      await Promise.race([work, timeout]);
      if (!timedOut) return;
      // abort 后 renderer 的 await 必须仍被吸收，避免切换文件时出现未处理 rejection
      session.controller.abort();
      try {
        session.instance?.destroy?.();
      } catch {
        // ignore cleanup errors
      }
      session.instance = null;
      session.host?.remove();
      session.host = null;
      if (current === session) {
        const err = new FileLoadError(t('loadTimeout', { seconds: Math.round(ms / 1000) }));
        error.value = err;
        status.value = 'error';
        emit('error', err);
      }
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  /** large-file 状态下继续预览 */
  const continuePreview = async (): Promise<void> => {
    const run = pendingContinue;
    const session = current;
    if (status.value !== 'large-file' || !run || !session) return;
    pendingContinue = null;
    largeFile.value = null;
    status.value = 'loading';
    try {
      await run();
    } catch (err) {
      fail(session, err);
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
      props.largeFileWarnSize,
      // 对象形式按取值比较，模板里写字面量对象时不会每次重新加载
      typeof props.excelMaxCells === 'object' && props.excelMaxCells
        ? `${props.excelMaxCells.warn}|${props.excelMaxCells.max}`
        : props.excelMaxCells,
      props.textEncoding,
      props.csvMode,
      props.csvRowNumber,
      props.csvMaxRows,
      props.timeout,
      props.showDownload,
      !!props.customDownload,
    ],
    (next, prev) => {
      // getter 每次返回新数组：逐项比较，只有取值真的变化才重新加载
      if (prev && next.length === prev.length && next.every((v, i) => Object.is(v, prev[i]))) return;
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
    progress,
    parseProgress,
    unsupportedType,
    mismatchType,
    missingPackage,
    detectedType,
    fileName,
    fileSize,
    largeFile,
    continuePreview,
    render,
    download,
    getContext,
    teardown,
    zoomController,
  };
}
