/**
 * OOXML Agile Encryption 轻量级密码校验与 Worker 调度器。
 *
 * 核心设计：
 * 1. 全环境兼容：底层使用自研零分配纯 JS 密码学内核（{@link verifyAgileKeySync} / {@link decryptAgileStreams}），
 *    不再受限于浏览器安全上下文（`crypto.subtle`），在明文 HTTP 内网/测试环境与 HTTPS 均可正常工作。
 * 2. 极速性能：10 万次加盐哈希迭代走单块原地压缩路径（仅数十毫秒），正文解密采用预展开轮密钥 + 原地写入预分配缓冲。
 * 3. 线程隔离与双向零拷贝：通过按需加载的后台 Web Worker 执行验密与整包解密，结果通过 Transferable 零拷贝回传；
 *    在不支持 Worker（如 Node/SSR/CSP 受限）或 Worker 异常环境下，自动平滑降级回主线程，永不丢失原始字节或悬空 Promise。
 */
import {
  AgileDecryptError,
  decryptAgileStreams,
  extractOleStreams,
  parseAgileEncryptionInfo,
  verifyAgileKeySync,
  type AgileDecryptErrorCode,
  type AgileEncryptionInfo,
  type AgileParseResult,
  type AgilePasswordKey,
} from '../crypto/agile-decrypt';
import type { OfficeCryptoWorkerRequest, OfficeCryptoWorkerResponse } from './verifier-worker';

export type { AgileDecryptErrorCode, AgileEncryptionInfo, AgileParseResult, AgilePasswordKey };
export { AgileDecryptError, decryptAgileStreams, extractOleStreams, parseAgileEncryptionInfo };

/** 兼容旧类型导出名 */
export type VerifierWorkerResponse = OfficeCryptoWorkerResponse;

/**
 * 从 OLE 复合文档中提取 `EncryptionInfo` 流内容。
 * 仅定位 `EncryptionInfo`，不触碰大体积的 `EncryptedPackage` 流。
 */
export function extractEncryptionInfo(input: Uint8Array): Uint8Array | null {
  const streams = extractOleStreams(input, ['EncryptionInfo']);
  return streams?.get('EncryptionInfo') ?? null;
}

/**
 * 解析并严格校验 Agile Encryption XML 的 passwordKey 参数。
 * 非 Agile（如旧版 Standard 加密）或不支持的参数组合返回 `null`。
 */
export function parseAgileEncryptionXml(encInfo: Uint8Array): AgilePasswordKey | null {
  const parsed = parseAgileEncryptionInfo(encInfo);
  return parsed.kind === 'agile' ? parsed.info.passwordKey : null;
}

/**
 * 基于已解析的 {@link AgilePasswordKey} 执行轻量 Verifier 校验。
 * 不依赖 `crypto.subtle`，在明文 HTTP 与 HTTPS 环境下均可正常工作。
 */
export async function verifyAgileKey(key: AgilePasswordKey, password: string): Promise<boolean> {
  return verifyAgileKeySync(key, password);
}

/** 轻量校验 EncryptionInfo 流与密码是否匹配（用于主线程或测试直调） */
export async function verifyAgilePassword(encInfoBytes: Uint8Array, password: string): Promise<boolean> {
  const key = parseAgileEncryptionXml(encInfoBytes);
  if (!key) return false;
  return verifyAgileKey(key, password);
}

// --- 按需加载 Web Worker 调度（非加密文件 0 字节开销；异常自动平滑降级主线程） ---

type PendingTask =
  | {
      kind: 'verify';
      key: AgilePasswordKey;
      password: string;
      resolve: (valid: boolean) => void;
      reject: (err: unknown) => void;
    }
  | {
      kind: 'decrypt';
      originalBytes: Uint8Array;
      password: string;
      resolve: (buffer: ArrayBuffer) => void;
      reject: (err: unknown) => void;
    };

let workerInstance: Worker | null = null;
let workerLoader: Promise<Worker | null> | null = null;
let workerFailed = false;
let reqSequence = 0;
const pendingMap = new Map<number, PendingTask>();

/** 在主线程执行单次整包解密（用于 Worker 不可用或异常回退） */
async function runDecryptOnMainThread(originalBytes: Uint8Array, password: string): Promise<ArrayBuffer> {
  const streams = extractOleStreams(originalBytes, ['EncryptionInfo', 'EncryptedPackage']);
  if (!streams) {
    throw new AgileDecryptError('unsupportedEncryption', 'Invalid OLE container or missing encrypted streams');
  }
  return decryptAgileStreams(streams.get('EncryptionInfo')!, streams.get('EncryptedPackage')!, password);
}

/** Worker 异常或不可用时，立即中止并把全部在途任务降级回主线程，避免任何 Promise 悬空 */
function flushPendingToMainThread(): void {
  workerFailed = true;
  const worker = workerInstance;
  workerInstance = null;
  workerLoader = null;
  if (worker) {
    try {
      worker.terminate();
    } catch {
      // ignore terminate error
    }
  }
  const tasks = Array.from(pendingMap.values());
  pendingMap.clear();
  for (const task of tasks) {
    if (task.kind === 'verify') {
      verifyAgileKey(task.key, task.password).then(task.resolve, task.reject);
    } else {
      runDecryptOnMainThread(task.originalBytes, task.password).then(task.resolve, task.reject);
    }
  }
}

/** 按需动态加载内联 Worker 工厂，避免非加密预览场景加载 Worker 代码 */
async function getCryptoWorker(): Promise<Worker | null> {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  if (!workerLoader) {
    workerLoader = import('./verifier-worker-factory')
      .then(({ createOfficeVerifierWorker }) => {
        const worker = createOfficeVerifierWorker();
        if (!worker) {
          workerFailed = true;
          return null;
        }
        worker.onmessage = (event: MessageEvent<OfficeCryptoWorkerResponse>) => {
          const { id, ok, valid, buffer, errorCode, error } = event.data;
          const task = pendingMap.get(id);
          if (!task) return;
          pendingMap.delete(id);

          if (task.kind === 'verify') {
            if (ok) {
              task.resolve(Boolean(valid));
            } else {
              verifyAgileKey(task.key, task.password).then(task.resolve, task.reject);
            }
            return;
          }

          if (ok && buffer) {
            task.resolve(buffer);
          } else if (errorCode) {
            task.reject(new AgileDecryptError(errorCode, error || errorCode));
          } else {
            runDecryptOnMainThread(task.originalBytes, task.password).then(task.resolve, task.reject);
          }
        };
        worker.onerror = event => {
          event.preventDefault?.();
          flushPendingToMainThread();
        };
        worker.onmessageerror = () => {
          flushPendingToMainThread();
        };
        workerInstance = worker;
        return worker;
      })
      .catch(() => {
        workerFailed = true;
        workerLoader = null;
        return null;
      });
  }
  return workerLoader;
}

/**
 * 优先在独立 Web Worker 中执行轻量密码验证；Worker 不可用或异常时自动平滑降级到当前线程。
 */
export async function verifyAgilePasswordWithWorker(key: AgilePasswordKey, password: string): Promise<boolean> {
  const worker = await getCryptoWorker();
  if (!worker) {
    return verifyAgileKey(key, password);
  }
  const id = ++reqSequence;
  return new Promise<boolean>((resolve, reject) => {
    pendingMap.set(id, { kind: 'verify', key, password, resolve, reject });
    try {
      const msg: OfficeCryptoWorkerRequest = { id, type: 'verify', key, password };
      worker.postMessage(msg);
    } catch {
      pendingMap.delete(id);
      verifyAgileKey(key, password).then(resolve, reject);
    }
  });
}

/**
 * 优先在独立 Web Worker 中执行完整 Agile 解密（提取流后以 Transferable 双向零拷贝传输，不破坏原加密字节）。
 *
 * @param originalBytes - 原始 OLE 加密文件字节（不会被修改或 neuter）
 * @param encryptionInfo - 已提取的 `EncryptionInfo` 流（独立缓冲区，将移交 Worker）
 * @param encryptedPackage - 已提取的 `EncryptedPackage` 流（独立缓冲区，将移交 Worker）
 * @param password - 打开密码
 */
export async function decryptAgileWithWorker(
  originalBytes: Uint8Array,
  encryptionInfo: Uint8Array,
  encryptedPackage: Uint8Array,
  password: string
): Promise<ArrayBuffer> {
  const worker = await getCryptoWorker();
  if (!worker) {
    return decryptAgileStreams(encryptionInfo, encryptedPackage, password);
  }
  const id = ++reqSequence;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    pendingMap.set(id, { kind: 'decrypt', originalBytes, password, resolve, reject });
    try {
      const msg: OfficeCryptoWorkerRequest = {
        id,
        type: 'decrypt',
        encryptionInfo,
        encryptedPackage,
        password,
      };
      // 提取出的两个流均为独立预分配缓冲，直接 Transferable 零拷贝送入 Worker，originalBytes 完好保留供回退或下载使用
      const transfers: Transferable[] = [];
      if (encryptionInfo.byteOffset === 0 && encryptionInfo.byteLength === encryptionInfo.buffer.byteLength) {
        transfers.push(encryptionInfo.buffer);
      }
      if (
        encryptedPackage.byteOffset === 0 &&
        encryptedPackage.byteLength === encryptedPackage.buffer.byteLength &&
        encryptedPackage.buffer !== encryptionInfo.buffer
      ) {
        transfers.push(encryptedPackage.buffer);
      }
      worker.postMessage(msg, transfers);
    } catch {
      pendingMap.delete(id);
      runDecryptOnMainThread(originalBytes, password).then(resolve, reject);
    }
  });
}
