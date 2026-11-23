/**
 * Office Agile 加密校验 Worker：在独立线程中执行 10 万次 PBKDF 与 Verifier 验证，避免阻塞主线程 UI。
 */
import { verifyAgileKey, type AgilePasswordKey, type VerifierWorkerResponse } from './agile-verifier';

interface VerifyRequest {
  id: number;
  key: AgilePasswordKey;
  password: string;
}

const scope = self as unknown as {
  postMessage(message: VerifierWorkerResponse): void;
  onmessage: ((event: MessageEvent<VerifyRequest>) => void) | null;
};

scope.onmessage = event => {
  const { id, key, password } = event.data;
  verifyAgileKey(key, password)
    .then(valid => {
      scope.postMessage({ id, ok: true, valid });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      scope.postMessage({
        id,
        ok: false,
        unavailable: /subtle|WebCrypto/i.test(message),
        error: message,
      });
    });
};
