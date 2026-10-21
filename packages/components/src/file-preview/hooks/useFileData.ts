/**
 * 文件数据加载与下载。
 * 把 File / Blob / ArrayBuffer / URL / 懒加载来源统一读取成 ArrayBuffer，读取前先做大小检查。
 */
import { FileLoadError, isAbortError } from '../errors';
import type { FilePreviewTranslate } from '../renderers/types';
import type { FilePreviewItem, FileSource } from '../types';
import { guessFileNameFromUrl } from '../utils/item';

export { guessFileNameFromUrl };

/** 加载选项 */
export interface LoadFileDataOptions {
  /** 调用方指定的文件名 */
  fileName?: string;
  /** 最大允许字节数 */
  maxSize: number;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 文案翻译 */
  t: FilePreviewTranslate;
  /** 懒加载来源收到的当前文件 */
  file?: FilePreviewItem;
}

/** 加载结果 */
export type LoadFileDataResult = (
  | { kind: 'ok'; buffer: ArrayBuffer; fileName: string; mimeType?: string; size: number }
  | { kind: 'oversize'; fileName: string; size: number }
) & {
  /** 懒加载来源解析出的实际来源（用于下载时不再重复调用） */
  resolved?: Exclude<FileSource, (...args: never[]) => unknown>;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

/**
 * 读取文件数据。超过 maxSize 时不读取内容，直接返回 oversize。
 */
export async function loadFileData(source: FileSource, options: LoadFileDataOptions): Promise<LoadFileDataResult> {
  const { maxSize, signal, t } = options;
  throwIfAborted(signal);

  if (typeof source === 'function') {
    const resolved = await source({
      signal: signal ?? new AbortController().signal,
      file: options.file ?? { source, fileName: options.fileName },
    });
    throwIfAborted(signal);
    if (resolved === null || resolved === undefined || resolved === '' || typeof resolved === 'function') {
      throw new TypeError('FileSourceLoader must resolve to File, Blob, ArrayBuffer or URL string');
    }
    const result = await loadFileData(resolved, options);
    return { ...result, resolved };
  }

  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    const ownName = typeof File !== 'undefined' && source instanceof File ? source.name : '';
    const fileName = options.fileName || ownName;
    if (source.size > maxSize) return { kind: 'oversize', fileName, size: source.size };
    const buffer = await source.arrayBuffer();
    throwIfAborted(signal);
    return { kind: 'ok', buffer, fileName, mimeType: source.type || undefined, size: source.size };
  }

  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
    const view = source as ArrayBuffer | ArrayBufferView;
    const buffer =
      view instanceof ArrayBuffer
        ? view
        : (view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
    const fileName = options.fileName || '';
    if (buffer.byteLength > maxSize) return { kind: 'oversize', fileName, size: buffer.byteLength };
    return { kind: 'ok', buffer, fileName, size: buffer.byteLength };
  }

  if (typeof source === 'string') {
    const fileName = options.fileName || guessFileNameFromUrl(source);
    let res: Response;
    try {
      res = await fetch(source, { signal });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new FileLoadError(t('networkError'), undefined, err);
    }
    if (!res.ok) {
      throw new FileLoadError(t('httpError', { status: res.status }), res.status);
    }
    const declaredSize = Number(res.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxSize) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'oversize', fileName, size: declaredSize };
    }
    const buffer = await res.arrayBuffer();
    throwIfAborted(signal);
    if (buffer.byteLength > maxSize) return { kind: 'oversize', fileName, size: buffer.byteLength };
    const mimeType = res.headers.get('content-type') || undefined;
    return { kind: 'ok', buffer, fileName, mimeType, size: buffer.byteLength };
  }

  throw new TypeError('Unsupported file source');
}

function clickLink(href: string, fileName?: string): void {
  const link = document.createElement('a');
  link.href = href;
  if (fileName === undefined) {
    link.target = '_blank';
  } else {
    link.download = fileName;
  }
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** 保存 Blob；URL 会在下载触发后释放 */
export function saveBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  clickLink(url, fileName);
  // 部分浏览器在 click 后异步开始下载，延迟释放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 同源、blob:、data: 地址可以直接用 <a download> 指定文件名 */
function canDownloadDirectly(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return true;
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** 下载选项 */
export interface DownloadFileOptions {
  /** 懒加载来源收到的当前文件 */
  file?: FilePreviewItem;
  /** 跨域 URL 不先取回内容，直接打开链接（文件过大时使用） */
  preferLink?: boolean;
}

/**
 * 下载文件。
 * - File / Blob / ArrayBuffer：直接保存；
 * - 同源 URL：<a download>；
 * - 跨域 URL：浏览器会忽略 download 属性，先 fetch 成 Blob 再保存（需要服务端允许 CORS），失败时在新标签页打开链接；
 * - 懒加载来源：先调用取得实际来源。
 */
export async function downloadFile(
  source: FileSource,
  fileName = 'download',
  options: DownloadFileOptions = {}
): Promise<void> {
  if (typeof document === 'undefined') return;
  if (typeof source === 'function') {
    const resolved = await source({
      signal: new AbortController().signal,
      file: options.file ?? { source, fileName },
    });
    if (typeof resolved === 'function') return;
    await downloadFile(resolved, fileName, options);
    return;
  }
  if (typeof source === 'string') {
    if (canDownloadDirectly(source)) {
      clickLink(source, fileName);
      return;
    }
    if (options.preferLink) {
      clickLink(source);
      return;
    }
    try {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveBlob(await res.blob(), fileName);
    } catch {
      clickLink(source);
    }
    return;
  }
  saveBlob(typeof Blob !== 'undefined' && source instanceof Blob ? source : new Blob([source]), fileName);
}
