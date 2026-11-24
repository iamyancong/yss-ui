/**
 * Office Agile 加密校验与解密 Worker：
 * 在独立后台线程中执行 10 万次 PBKDF、Verifier 校验、HMAC 完整性校验与分段 AES-CBC 解密，
 * 避免阻塞主线程 UI，并在明文 HTTP（无 WebCrypto subtle）与 HTTPS 环境下统一正常工作。
 */
import {
  AgileDecryptError,
  decryptAgileStreams,
  verifyAgileKeySync,
  type AgileDecryptErrorCode,
  type AgilePasswordKey,
} from '../crypto/agile-decrypt';

/** Worker 请求消息：轻量验密或整包解密 */
export type OfficeCryptoWorkerRequest =
  | {
      id: number;
      type: 'verify';
      key: AgilePasswordKey;
      password: string;
    }
  | {
      id: number;
      type: 'decrypt';
      encryptionInfo: Uint8Array;
      encryptedPackage: Uint8Array;
      password: string;
    };

/** Worker 响应消息 */
export interface OfficeCryptoWorkerResponse {
  id: number;
  ok: boolean;
  valid?: boolean;
  buffer?: ArrayBuffer;
  errorCode?: AgileDecryptErrorCode;
  error?: string;
}

const scope = self as unknown as {
  postMessage(message: OfficeCryptoWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<OfficeCryptoWorkerRequest>) => void) | null;
};

scope.onmessage = event => {
  const data = event.data;
  if (data.type === 'verify') {
    try {
      const valid = verifyAgileKeySync(data.key, data.password);
      scope.postMessage({ id: data.id, ok: true, valid });
    } catch (err: unknown) {
      scope.postMessage({
        id: data.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  decryptAgileStreams(data.encryptionInfo, data.encryptedPackage, data.password)
    .then(buffer => {
      // 明文结果通过 Transferable 零拷贝传回主线程
      scope.postMessage({ id: data.id, ok: true, buffer }, [buffer]);
    })
    .catch((err: unknown) => {
      if (err instanceof AgileDecryptError) {
        scope.postMessage({
          id: data.id,
          ok: false,
          errorCode: err.code,
          error: err.message,
        });
        return;
      }
      scope.postMessage({
        id: data.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
