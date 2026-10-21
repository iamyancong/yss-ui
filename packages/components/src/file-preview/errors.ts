/**
 * 文件预览错误类型。
 */

/** 缺少可选渲染依赖（如 docx-preview、@vue-office/excel） */
export class MissingDependencyError extends Error {
  /** 缺失的 npm 包名 */
  readonly packageName: string;

  constructor(packageName: string, cause?: unknown) {
    super(`Missing optional preview dependency: ${packageName}`);
    this.name = 'MissingDependencyError';
    this.packageName = packageName;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/** 文件数据加载失败（网络、跨域或 HTTP 状态码异常） */
export class FileLoadError extends Error {
  /** HTTP 状态码，网络或跨域失败时为 undefined */
  readonly status?: number;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'FileLoadError';
    this.status = status;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/** 是否为 AbortController 中止产生的错误 */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}
