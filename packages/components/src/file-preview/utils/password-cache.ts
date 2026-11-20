/**
 * 加密文档打开密码的会话级缓存。
 * 默认记住本页已成功解锁过的文件密码，切换文件再切回来无需重输；刷新页面后清空。
 * 不落盘、不跨标签页。
 */

const passwordByFingerprint = new Map<string, string>();

/**
 * 用文件体积与头尾采样生成指纹，用于同一加密文件的会话内识别。
 * @param data - 加密文件字节
 * @param fileName - 可选文件名，参与指纹避免极端碰撞
 */
export function fingerprintEncryptedFile(data: ArrayBuffer | Uint8Array, fileName?: string): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const size = bytes.byteLength;
  const hashRange = (start: number, length: number): string => {
    let hash = 2166136261;
    const end = Math.min(size, start + length);
    for (let i = start; i < end; i++) {
      hash ^= bytes[i]!;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  };
  const head = hashRange(0, 256);
  const tail = hashRange(Math.max(0, size - 256), 256);
  return `${fileName ?? ''}|${size}|${head}|${tail}`;
}

/**
 * 读取会话内已缓存的打开密码。
 * @param fingerprint - {@link fingerprintEncryptedFile} 的结果
 */
export function getCachedPassword(fingerprint: string): string | undefined {
  return passwordByFingerprint.get(fingerprint);
}

/**
 * 写入会话内打开密码（仅内存）。
 * @param fingerprint - 文件指纹
 * @param password - 已验证成功的密码
 */
export function setCachedPassword(fingerprint: string, password: string): void {
  if (!fingerprint || !password) return;
  passwordByFingerprint.set(fingerprint, password);
}

/** 清空本页全部已缓存的打开密码 */
export function clearPasswordCache(): void {
  passwordByFingerprint.clear();
}
