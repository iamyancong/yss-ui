/**
 * OOXML Agile Encryption 轻量级密码校验器。
 *
 * 核心设计：
 * 1. 轻量校验：只解析 OLE 复合文档头部的 EncryptionInfo 流（通常 1~2KB），
 *    仅校验 VerifierHash，无需读取或解密包含正文的 EncryptedPackage 流（省去几 MB~几十 MB 的 HMAC 校验与 AES 整包解密）。
 * 2. 线程隔离（Web Worker）：将 10 万次加盐哈希（spinCount = 100,000）移入后台 Web Worker 异步计算，
 *    避免 10 万次 WebCrypto 微任务占满浏览器主线程，彻底消除 UI 冻结与卡顿（1~2 秒）。
 * 3. 优雅降级：在不支持 Worker（如 Node/SSR/CSP 受限）或 Worker 异常环境下，自动平滑退回主线程执行。
 */
import { createOfficeVerifierWorker } from './verifier-worker-factory';

// --- 基础字节操作 ---

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function readUInt64LE(bytes: Uint8Array, offset: number): number {
  const lo = readUInt32LE(bytes, offset);
  const hi = readUInt32LE(bytes, offset + 4);
  return hi * 0x100000000 + lo;
}

function utf16leDecode(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes);
}

function utf16leEncode(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function uint32LE(val: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = val & 0xff;
  b[1] = (val >> 8) & 0xff;
  b[2] = (val >> 16) & 0xff;
  b[3] = (val >> 24) & 0xff;
  return b;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// --- OLE CFB 目录流轻量读取 ---

/**
 * 从 OLE 复合文档中提取 EncryptionInfo 流内容。
 * 仅遍历 FAT 链定位 EncryptionInfo，不触碰大体积的 EncryptedPackage 流。
 */
export function extractEncryptionInfo(input: Uint8Array): Uint8Array | null {
  try {
    if (input.length < 512) return null;
    // 校验 OLE 魔数与小端字节序，非标准 CFB 容器直接返回 null 走兜底路径
    if (readUInt16LE(input, 0x1c) !== 0xfffe) return null;
    const sectorShift = readUInt16LE(input, 0x1e);
    const miniSectorShift = readUInt16LE(input, 0x20);
    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniSectorShift;
    if (sectorSize !== 512 || miniSectorSize !== 64) return null;

    const fatSectorCount = readUInt32LE(input, 0x2c);
    const firstDirectorySector = readUInt32LE(input, 0x30);
    const miniStreamCutoff = readUInt32LE(input, 0x38);
    const firstMiniFatSector = readUInt32LE(input, 0x3c);
    const miniFatSectorCount = readUInt32LE(input, 0x40);
    const firstDifatSector = readUInt32LE(input, 0x44);
    const difatSectorCount = readUInt32LE(input, 0x48);

    const difat: number[] = [];
    for (let i = 0; i < 109; i++) {
      const s = readUInt32LE(input, 0x4c + i * 4);
      if (s !== 0xffffffff && s !== 0xfffffffe) difat.push(s);
    }
    let nextDifat = firstDifatSector;
    for (let i = 0; i < difatSectorCount; i++) {
      if (nextDifat === 0xfffffffe || nextDifat === 0xffffffff) break;
      const off = 512 + nextDifat * sectorSize;
      if (off + sectorSize > input.length) return null;
      const sec = input.slice(off, off + sectorSize);
      for (let o = 0; o < sectorSize - 4; o += 4) {
        const v = readUInt32LE(sec, o);
        if (v !== 0xffffffff && v !== 0xfffffffe) difat.push(v);
      }
      nextDifat = readUInt32LE(sec, sectorSize - 4);
    }
    if (difat.length < fatSectorCount) return null;

    const fatChunks = difat.slice(0, fatSectorCount).map(s => {
      const off = 512 + s * sectorSize;
      if (off + sectorSize > input.length) throw new Error('sector out of bounds');
      return input.slice(off, off + sectorSize);
    });
    const fatBytes = concatBytes(fatChunks);
    const fat: number[] = [];
    for (let o = 0; o + 4 <= fatBytes.length; o += 4) {
      fat.push(readUInt32LE(fatBytes, o));
    }

    const readChain = (start: number, maxLen = Infinity): Uint8Array => {
      if (start === 0xfffffffe || start === 0xffffffff) return new Uint8Array();
      const chunks: Uint8Array[] = [];
      let cur = start;
      let readLen = 0;
      const seen = new Set<number>();
      while (cur !== 0xfffffffe && cur !== 0xffffffff && cur < fat.length) {
        if (seen.has(cur)) return new Uint8Array();
        seen.add(cur);
        const off = 512 + cur * sectorSize;
        if (off + sectorSize > input.length) return new Uint8Array();
        const sec = input.slice(off, off + sectorSize);
        chunks.push(sec);
        readLen += sec.length;
        if (readLen >= maxLen) break;
        cur = fat[cur]!;
      }
      return concatBytes(chunks);
    };

    const dirBytes = readChain(firstDirectorySector);
    const entries: Array<{ name: string; type: number; startSector: number; size: number }> = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const type = dirBytes[o + 66]!;
      if (type === 0) continue;
      const nameLen = readUInt16LE(dirBytes, o + 64);
      if (nameLen < 2 || nameLen > 64 || nameLen % 2 !== 0) continue;
      const nameBytes = dirBytes.slice(o, o + nameLen - 2);
      entries.push({
        name: utf16leDecode(nameBytes),
        type,
        startSector: readUInt32LE(dirBytes, o + 116),
        size: readUInt64LE(dirBytes, o + 120),
      });
    }

    const root = entries.find(e => e.type === 5);
    const target = entries.find(e => e.name === 'EncryptionInfo' && e.type === 2);
    if (!target) return null;

    const targetSize = target.size;
    if (targetSize < miniStreamCutoff && root) {
      const miniFatBytes =
        firstMiniFatSector === 0xfffffffe || miniFatSectorCount === 0
          ? new Uint8Array()
          : readChain(firstMiniFatSector, miniFatSectorCount * sectorSize);
      const miniFat: number[] = [];
      for (let o = 0; o + 4 <= miniFatBytes.length; o += 4) {
        miniFat.push(readUInt32LE(miniFatBytes, o));
      }
      const miniStream = readChain(root.startSector, root.size).slice(0, root.size);

      const chunks: Uint8Array[] = [];
      let cur = target.startSector;
      let readLen = 0;
      const seen = new Set<number>();
      while (cur !== 0xfffffffe && cur !== 0xffffffff && cur < miniFat.length) {
        if (seen.has(cur)) return null;
        seen.add(cur);
        const off = cur * miniSectorSize;
        if (off + miniSectorSize > miniStream.length) return null;
        chunks.push(miniStream.slice(off, off + miniSectorSize));
        readLen += miniSectorSize;
        if (readLen >= targetSize) break;
        cur = miniFat[cur]!;
      }
      return concatBytes(chunks).slice(0, targetSize);
    }
    return readChain(target.startSector, targetSize).slice(0, targetSize);
  } catch {
    return null;
  }
}

// --- Agile Encryption 算法核心 ---

const BLOCK_KEYS = {
  encryptedVerifierHashInput: Uint8Array.from([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]),
  encryptedVerifierHashValue: Uint8Array.from([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]),
};

const HASH_SIZE_MAP: Record<string, { web: string; size: number }> = {
  SHA1: { web: 'SHA-1', size: 20 },
  SHA256: { web: 'SHA-256', size: 32 },
  SHA384: { web: 'SHA-384', size: 48 },
  SHA512: { web: 'SHA-512', size: 64 },
};

/** 解析后的 Agile passwordKey 参数（用于主线程与 Worker 间传输） */
export interface AgilePasswordKey {
  spinCount: number;
  saltSize: number;
  blockSize: number;
  keyBits: number;
  hashSize: number;
  hashAlgorithm: string;
  saltValue: Uint8Array;
  encryptedVerifierHashInput: Uint8Array;
  encryptedVerifierHashValue: Uint8Array;
}

/**
 * 解析并严格校验 Agile Encryption XML 的 passwordKey 参数。
 * 非 Agile（如旧版 Standard 加密）或不支持的参数组合返回 null，交由调用方走兜底路径抛出 UnsupportedEncryptionError。
 */
export function parseAgileEncryptionXml(encInfo: Uint8Array): AgilePasswordKey | null {
  if (encInfo.length < 8) return null;
  const major = readUInt16LE(encInfo, 0);
  const minor = readUInt16LE(encInfo, 2);
  const flags = readUInt32LE(encInfo, 4);
  // Agile: version 4.4, flags 0x40
  if (major !== 4 || minor !== 4 || flags !== 0x40) return null;

  let start = 8;
  let len = encInfo.length - 8;
  if (encInfo.length >= 12) {
    const declared = readUInt32LE(encInfo, 8);
    if (declared > 0 && 12 + declared <= encInfo.length && encInfo[12] === 0x3c) {
      start = 12;
      len = declared;
    }
  }

  let xml = new TextDecoder().decode(encInfo.slice(start, start + len));
  const end = xml.lastIndexOf('>');
  if (end >= 0) xml = xml.slice(0, end + 1);

  const match = /<(?:[A-Za-z_][\w.-]*:)?encryptedKey\b([^>]*)>/u.exec(xml);
  if (!match) return null;

  const attrs = new Map<string, string>();
  const attrRegex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/gu;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(match[1]!)) !== null) {
    attrs.set(m[1]!, unescapeXml(m[2]!));
  }

  const cipherAlgorithm = attrs.get('cipherAlgorithm');
  const cipherChaining = attrs.get('cipherChaining');
  if (cipherAlgorithm !== 'AES' || cipherChaining !== 'ChainingModeCBC') return null;

  const spinCount = Number(attrs.get('spinCount'));
  const saltSize = Number(attrs.get('saltSize'));
  const blockSize = Number(attrs.get('blockSize'));
  const keyBits = Number(attrs.get('keyBits'));
  const hashSize = Number(attrs.get('hashSize'));
  const hashAlgorithm = (attrs.get('hashAlgorithm') ?? '').toUpperCase();

  if (
    !Number.isInteger(spinCount) ||
    spinCount < 0 ||
    !Number.isInteger(saltSize) ||
    saltSize <= 0 ||
    blockSize !== 16 ||
    (keyBits !== 128 && keyBits !== 192 && keyBits !== 256)
  ) {
    return null;
  }

  const hashSpec = HASH_SIZE_MAP[hashAlgorithm];
  if (!hashSpec || hashSize !== hashSpec.size) return null;

  const saltB64 = attrs.get('saltValue');
  const verifierInputB64 = attrs.get('encryptedVerifierHashInput');
  const verifierValueB64 = attrs.get('encryptedVerifierHashValue');
  if (!saltB64 || !verifierInputB64 || !verifierValueB64) return null;

  try {
    const saltValue = decodeBase64(saltB64);
    const encryptedVerifierHashInput = decodeBase64(verifierInputB64);
    const encryptedVerifierHashValue = decodeBase64(verifierValueB64);
    if (saltValue.length !== saltSize) return null;
    if (
      encryptedVerifierHashInput.length === 0 ||
      encryptedVerifierHashInput.length % 16 !== 0 ||
      encryptedVerifierHashValue.length === 0 ||
      encryptedVerifierHashValue.length % 16 !== 0
    ) {
      return null;
    }

    return {
      spinCount,
      saltSize,
      blockSize,
      keyBits,
      hashSize,
      hashAlgorithm,
      saltValue,
      encryptedVerifierHashInput,
      encryptedVerifierHashValue,
    };
  } catch {
    return null;
  }
}

/**
 * 基于已解析的 AgilePasswordKey 执行轻量 Verifier 校验。
 * WebCrypto subtle 不可用时显式抛错（与 ooxml-encryption 保持一致），避免非 HTTPS 环境误判为「密码错误」。
 */
export async function verifyAgileKey(key: AgilePasswordKey, password: string): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle API is unavailable');
  }

  const hashAlg = HASH_SIZE_MAP[key.hashAlgorithm]?.web ?? 'SHA-512';

  try {
    // 1. 10 万次 PBKDF 迭代
    let hash = new Uint8Array(
      await subtle.digest(hashAlg, concatBytes([key.saltValue, utf16leEncode(password)]) as unknown as BufferSource)
    );
    for (let i = 0; i < key.spinCount; i++) {
      hash = new Uint8Array(await subtle.digest(hashAlg, concatBytes([uint32LE(i), hash]) as unknown as BufferSource));
    }

    const deriveBlockKey = async (blockKey: Uint8Array, keyBytes: number): Promise<Uint8Array> => {
      const h = new Uint8Array(await subtle.digest(hashAlg, concatBytes([hash, blockKey]) as unknown as BufferSource));
      if (h.length >= keyBytes) return h.slice(0, keyBytes);
      const out = new Uint8Array(keyBytes);
      out.set(h);
      out.fill(0x36, h.length);
      return out;
    };

    const aesCbcDecryptBlockPadded = async (
      keyBytes: Uint8Array,
      iv: Uint8Array,
      bytes: Uint8Array
    ): Promise<Uint8Array> => {
      const aesBlockSize = 16;
      const keyObj = await subtle.importKey('raw', keyBytes as unknown as BufferSource, { name: 'AES-CBC' }, false, [
        'encrypt',
        'decrypt',
      ]);
      const lastCipherBlock = bytes.slice(bytes.length - aesBlockSize);
      const syntheticPlainBlock = new Uint8Array(aesBlockSize);
      syntheticPlainBlock.fill(aesBlockSize);
      for (let i = 0; i < syntheticPlainBlock.length; i++) {
        syntheticPlainBlock[i]! ^= lastCipherBlock[i]!;
      }
      const syntheticEncrypted = new Uint8Array(
        await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(aesBlockSize) }, keyObj, syntheticPlainBlock)
      );
      const combined = concatBytes([bytes, syntheticEncrypted.slice(0, aesBlockSize)]);
      const decrypted = await subtle.decrypt(
        { name: 'AES-CBC', iv: iv as unknown as BufferSource },
        keyObj,
        combined as unknown as BufferSource
      );
      return new Uint8Array(decrypted);
    };

    const keyBytes = key.keyBits / 8;
    const passwordIv = key.saltValue.slice(0, key.blockSize);

    // 2. 解密 VerifierInput
    const verifierKey = await deriveBlockKey(BLOCK_KEYS.encryptedVerifierHashInput, keyBytes);
    const verifierInputPadded = await aesCbcDecryptBlockPadded(verifierKey, passwordIv, key.encryptedVerifierHashInput);
    const verifierInput = verifierInputPadded.slice(0, key.saltSize);

    // 3. 解密 VerifierHash
    const verifierHashKey = await deriveBlockKey(BLOCK_KEYS.encryptedVerifierHashValue, keyBytes);
    const verifierHashPadded = await aesCbcDecryptBlockPadded(
      verifierHashKey,
      passwordIv,
      key.encryptedVerifierHashValue
    );
    const decryptedVerifierHash = verifierHashPadded.slice(0, key.hashSize);

    // 4. 对比哈希
    const actualHash = new Uint8Array(await subtle.digest(hashAlg, verifierInput as unknown as BufferSource));
    return constantTimeEqual(decryptedVerifierHash, actualHash.slice(0, key.hashSize));
  } catch {
    return false;
  }
}

/** 轻量校验 EncryptionInfo 流与密码是否匹配（用于主线程或测试直调） */
export async function verifyAgilePassword(encInfoBytes: Uint8Array, password: string): Promise<boolean> {
  const key = parseAgileEncryptionXml(encInfoBytes);
  if (!key) return false;
  return verifyAgileKey(key, password);
}

// --- Web Worker 调度（彻底避免主线程 1~2s 卡顿） ---

export interface VerifierWorkerResponse {
  id: number;
  ok: boolean;
  valid?: boolean;
  unavailable?: boolean;
  error?: string;
}

interface PendingTask {
  key: AgilePasswordKey;
  password: string;
  resolve: (valid: boolean) => void;
  reject: (err: unknown) => void;
}

let workerInstance: Worker | null = null;
let reqSequence = 0;
const pendingMap = new Map<number, PendingTask>();

/** Worker 异常或不可用时，立即中止并把全部在途任务降级回主线程，避免任何 Promise 悬空 */
function flushPendingToMainThread(): void {
  const worker = workerInstance;
  workerInstance = null;
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
    verifyAgileKey(task.key, task.password).then(task.resolve, task.reject);
  }
}

function getVerifierWorker(): Worker | null {
  if (!workerInstance) {
    const worker = createOfficeVerifierWorker();
    if (!worker) return null;
    worker.onmessage = (event: MessageEvent<VerifierWorkerResponse>) => {
      const { id, ok, valid, unavailable, error } = event.data;
      const task = pendingMap.get(id);
      if (!task) return;
      pendingMap.delete(id);
      if (ok) {
        task.resolve(Boolean(valid));
      } else if (unavailable) {
        task.reject(new Error(error || 'WebCrypto subtle API is unavailable'));
      } else {
        // Worker 内部遇到意外错误时兜底回主线程执行一次
        verifyAgileKey(task.key, task.password).then(task.resolve, task.reject);
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
  }
  return workerInstance;
}

/**
 * 优先在独立 Web Worker 中执行轻量密码验证；Worker 不可用或异常时自动平滑降级到当前线程。
 */
export async function verifyAgilePasswordWithWorker(key: AgilePasswordKey, password: string): Promise<boolean> {
  const worker = getVerifierWorker();
  if (!worker) {
    return verifyAgileKey(key, password);
  }
  const id = ++reqSequence;
  return new Promise<boolean>((resolve, reject) => {
    pendingMap.set(id, { key, password, resolve, reject });
    try {
      worker.postMessage({ id, key, password });
    } catch {
      pendingMap.delete(id);
      verifyAgileKey(key, password).then(resolve, reject);
    }
  });
}
