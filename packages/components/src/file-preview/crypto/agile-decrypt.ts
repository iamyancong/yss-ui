/**
 * OOXML Agile Encryption 高性能零依赖解析、验密与整包解密引擎。
 *
 * 核心特性：
 * 1. 全环境可用：不依赖浏览器的安全上下文（`crypto.subtle`），在明文 HTTP 内网/测试环境与 HTTPS 均可正常验密与解密。
 * 2. 高性能 OLE 流读取：支持 CFB v3（512B 扇区）与 v4（4096B 扇区），按目标流大小一次预分配缓冲，消除数万次小切片 GC。
 * 3. 极速密钥派生：100,000 次加盐迭代走 {@link spinHashAgile} 零分配单块直算路径，比 10 万次跨边界 `subtle.digest` 快一个数量级。
 * 4. 零二次拼接解密：预展开单份 AES 解密轮密钥并预分配输出 `Uint8Array`，4KB 分段原地解密写入；HTTPS 大包可选 WebCrypto 硬件 HMAC 校验。
 */
import { aesCbcDecryptRaw, aesCbcDecryptRawInto, expandAesDecryptKey } from './aes-cbc';
import { HASH_META, hashSync, hmacSync, spinHashAgile, type AgileHashAlgorithm } from './hash';

const AGILE_PACKAGE_SEGMENT_SIZE = 4096;
const WEBCRYPTO_HMAC_THRESHOLD = 256 * 1024;

const BLOCK_KEYS = {
  encryptedVerifierHashInput: Uint8Array.from([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]),
  encryptedVerifierHashValue: Uint8Array.from([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]),
  encryptedKeyValue: Uint8Array.from([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]),
  encryptedHmacKey: Uint8Array.from([0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6]),
  encryptedHmacValue: Uint8Array.from([0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33]),
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
  encryptedKeyValue?: Uint8Array;
}

/** 完整 Agile EncryptionInfo 描述（含 keyData / dataIntegrity / passwordKey） */
export interface AgileEncryptionInfo {
  keyData: {
    saltSize: number;
    blockSize: number;
    keyBits: number;
    hashSize: number;
    hashAlgorithm: AgileHashAlgorithm;
    saltValue: Uint8Array;
  };
  dataIntegrity: {
    encryptedHmacKey: Uint8Array;
    encryptedHmacValue: Uint8Array;
  };
  passwordKey: AgilePasswordKey & {
    hashAlgorithm: AgileHashAlgorithm;
    encryptedKeyValue: Uint8Array;
  };
}

/** EncryptionInfo 解析判定结果 */
export type AgileParseResult = { kind: 'agile'; info: AgileEncryptionInfo } | { kind: 'unsupported'; reason: string };

/** 解密失败错误码（便于在 Worker 边界无损回传错误语义） */
export type AgileDecryptErrorCode = 'invalidPassword' | 'unsupportedEncryption';

/** Agile 内部结构化错误 */
export class AgileDecryptError extends Error {
  readonly code: AgileDecryptErrorCode;
  constructor(code: AgileDecryptErrorCode, message: string) {
    super(message);
    this.name = 'AgileDecryptError';
    this.code = code;
  }
}

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

function writeUInt32LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
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

function resizeHash(hash: Uint8Array, length: number): Uint8Array {
  if (hash.length >= length) return hash.subarray(0, length);
  const out = new Uint8Array(length);
  out.set(hash);
  out.fill(0x36, hash.length);
  return out;
}

function normalizeHashAlgorithm(name: string | undefined): AgileHashAlgorithm | null {
  const upper = (name ?? '').toUpperCase();
  if (upper === 'SHA1' || upper === 'SHA256' || upper === 'SHA384' || upper === 'SHA512') {
    return upper;
  }
  return null;
}

// --- 高性能 OLE CFB 流提取（支持 v3 512B 与 v4 4096B，按目标长度单次预分配） ---

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECT = 0xffffffff;

/**
 * 从 OLE 复合文档中按需提取指定名称的流。
 * 只读取请求的流，不触碰其他大流；每个目标流按其声明字节长度一次预分配缓冲，避免扇区级碎片拷贝。
 *
 * @param input - OLE 复合文档完整字节
 * @param streamNames - 要提取的流名（如 `['EncryptionInfo']` 或 `['EncryptionInfo', 'EncryptedPackage']`）
 */
export function extractOleStreams(input: Uint8Array, streamNames: readonly string[]): Map<string, Uint8Array> | null {
  try {
    if (input.length < 512) return null;
    if (readUInt16LE(input, 0x1c) !== 0xfffe) return null;
    const majorVer = readUInt16LE(input, 0x1a);
    const sectorShift = readUInt16LE(input, 0x1e);
    const miniSectorShift = readUInt16LE(input, 0x20);
    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniSectorShift;
    if ((sectorSize !== 512 && sectorSize !== 4096) || miniSectorSize !== 64) return null;
    if (input.length < sectorSize) return null;

    const fatSectorCount = readUInt32LE(input, 0x2c);
    const firstDirectorySector = readUInt32LE(input, 0x30);
    const miniStreamCutoff = readUInt32LE(input, 0x38);
    const firstMiniFatSector = readUInt32LE(input, 0x3c);
    const miniFatSectorCount = readUInt32LE(input, 0x40);
    const firstDifatSector = readUInt32LE(input, 0x44);
    const difatSectorCount = readUInt32LE(input, 0x48);

    // 1. 读取 DIFAT
    const difat: number[] = [];
    for (let i = 0; i < 109; i++) {
      const s = readUInt32LE(input, 0x4c + i * 4);
      if (s !== FREE_SECT && s !== END_OF_CHAIN) difat.push(s);
    }
    let nextDifat = firstDifatSector;
    for (let i = 0; i < difatSectorCount; i++) {
      if (nextDifat === END_OF_CHAIN || nextDifat === FREE_SECT) break;
      const off = (nextDifat + 1) * sectorSize;
      if (off + sectorSize > input.length) return null;
      for (let o = 0; o < sectorSize - 4; o += 4) {
        const v = readUInt32LE(input, off + o);
        if (v !== FREE_SECT && v !== END_OF_CHAIN) difat.push(v);
      }
      nextDifat = readUInt32LE(input, off + sectorSize - 4);
    }
    if (difat.length < fatSectorCount) return null;

    // 2. 构建扁平 Uint32Array FAT 表
    const entriesPerSector = sectorSize >>> 2;
    const fat = new Uint32Array(fatSectorCount * entriesPerSector);
    let fatIdx = 0;
    for (let i = 0; i < fatSectorCount; i++) {
      const s = difat[i]!;
      const off = (s + 1) * sectorSize;
      if (off + sectorSize > input.length) return null;
      for (let o = 0; o < sectorSize; o += 4) {
        fat[fatIdx++] = readUInt32LE(input, off + o);
      }
    }

    const readRegularExact = (start: number, exactSize: number): Uint8Array | null => {
      if (exactSize === 0) return new Uint8Array(0);
      if (start === END_OF_CHAIN || start === FREE_SECT) return null;
      const out = new Uint8Array(exactSize);
      let written = 0;
      let cur = start;
      const seen = new Set<number>();
      while (cur !== END_OF_CHAIN && cur !== FREE_SECT && cur < fat.length && written < exactSize) {
        if (seen.has(cur)) return null;
        seen.add(cur);
        const off = (cur + 1) * sectorSize;
        if (off + sectorSize > input.length) return null;
        const copyLen = Math.min(sectorSize, exactSize - written);
        out.set(input.subarray(off, off + copyLen), written);
        written += copyLen;
        cur = fat[cur]!;
      }
      return written === exactSize ? out : null;
    };

    const readDirectoryChain = (start: number): Uint8Array | null => {
      if (start === END_OF_CHAIN || start === FREE_SECT) return new Uint8Array(0);
      const sectors: number[] = [];
      const seen = new Set<number>();
      let cur = start;
      while (cur !== END_OF_CHAIN && cur !== FREE_SECT && cur < fat.length) {
        if (seen.has(cur)) return null;
        seen.add(cur);
        const off = (cur + 1) * sectorSize;
        if (off + sectorSize > input.length) return null;
        sectors.push(cur);
        cur = fat[cur]!;
      }
      const out = new Uint8Array(sectors.length * sectorSize);
      for (let i = 0; i < sectors.length; i++) {
        const off = (sectors[i]! + 1) * sectorSize;
        out.set(input.subarray(off, off + sectorSize), i * sectorSize);
      }
      return out;
    };

    const dirBytes = readDirectoryChain(firstDirectorySector);
    if (!dirBytes) return null;

    const entries = new Map<string, { type: number; startSector: number; size: number }>();
    let root: { startSector: number; size: number } | null = null;
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const type = dirBytes[o + 66]!;
      if (type === 0) continue;
      const nameLen = readUInt16LE(dirBytes, o + 64);
      if (nameLen < 2 || nameLen > 64 || nameLen % 2 !== 0) continue;
      const startSector = readUInt32LE(dirBytes, o + 116);
      // CFB v3 规范要求目录项 size 仅低 32 位有效；v4 使用 64 位
      const size = majorVer <= 3 ? readUInt32LE(dirBytes, o + 120) : readUInt64LE(dirBytes, o + 120);
      if (type === 5 && !root) {
        root = { startSector, size };
      } else if (type === 2) {
        const name = utf16leDecode(dirBytes.subarray(o, o + nameLen - 2));
        entries.set(name, { type, startSector, size });
      }
    }

    let miniFat: Uint32Array | null = null;
    let miniStream: Uint8Array | null = null;

    const ensureMiniStream = (): boolean => {
      if (miniFat && miniStream) return true;
      if (!root) return false;
      const miniFatBytes =
        firstMiniFatSector === END_OF_CHAIN || miniFatSectorCount === 0
          ? new Uint8Array(0)
          : readRegularExact(firstMiniFatSector, miniFatSectorCount * sectorSize);
      if (!miniFatBytes) return false;
      const count = miniFatBytes.length >>> 2;
      miniFat = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        miniFat[i] = readUInt32LE(miniFatBytes, i * 4);
      }
      miniStream = readRegularExact(root.startSector, root.size);
      return miniStream !== null;
    };

    const readMiniExact = (start: number, exactSize: number): Uint8Array | null => {
      if (exactSize === 0) return new Uint8Array(0);
      if (!ensureMiniStream() || !miniFat || !miniStream) return null;
      const out = new Uint8Array(exactSize);
      let written = 0;
      let cur = start;
      const seen = new Set<number>();
      while (cur !== END_OF_CHAIN && cur !== FREE_SECT && cur < miniFat.length && written < exactSize) {
        if (seen.has(cur)) return null;
        seen.add(cur);
        const off = cur * miniSectorSize;
        if (off + miniSectorSize > miniStream.length) return null;
        const copyLen = Math.min(miniSectorSize, exactSize - written);
        out.set(miniStream.subarray(off, off + copyLen), written);
        written += copyLen;
        cur = miniFat[cur]!;
      }
      return written === exactSize ? out : null;
    };

    const result = new Map<string, Uint8Array>();
    for (const name of streamNames) {
      const target = entries.get(name);
      if (!target) return null;
      const bytes =
        target.size < miniStreamCutoff && root
          ? readMiniExact(target.startSector, target.size)
          : readRegularExact(target.startSector, target.size);
      if (!bytes) return null;
      result.set(name, bytes);
    }
    return result;
  } catch {
    return null;
  }
}

// --- Agile Encryption XML 完整解析 ---

function parseTagAttributes(xml: string, localName: string): Map<string, string> | null {
  const match = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b([^>]*)>`, 'u').exec(xml);
  if (!match) return null;
  const attrs = new Map<string, string>();
  const attrRegex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/gu;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(match[1]!)) !== null) {
    attrs.set(m[1]!, unescapeXml(m[2]!));
  }
  return attrs;
}

/**
 * 解析完整的 Agile EncryptionInfo 流（包含 keyData、dataIntegrity 与 passwordKey）。
 * 非 Agile 加密（例如旧版 Standard 3.2/4.2、证书加密等）返回 `kind: 'unsupported'`。
 */
export function parseAgileEncryptionInfo(encInfo: Uint8Array): AgileParseResult {
  if (encInfo.length < 8) {
    return { kind: 'unsupported', reason: 'EncryptionInfo stream is too short' };
  }
  const major = readUInt16LE(encInfo, 0);
  const minor = readUInt16LE(encInfo, 2);
  const flags = readUInt32LE(encInfo, 4);
  if (major !== 4 || minor !== 4 || flags !== 0x40) {
    return { kind: 'unsupported', reason: `Unsupported encryption type: version ${major}.${minor}` };
  }

  let start = 8;
  let len = encInfo.length - 8;
  if (encInfo.length >= 12) {
    const declared = readUInt32LE(encInfo, 8);
    if (declared > 0 && 12 + declared <= encInfo.length && encInfo[12] === 0x3c) {
      start = 12;
      len = declared;
    }
  }

  let xml = new TextDecoder().decode(encInfo.subarray(start, start + len));
  const end = xml.lastIndexOf('>');
  if (end >= 0) xml = xml.slice(0, end + 1);

  const keyDataAttrs = parseTagAttributes(xml, 'keyData');
  const integrityAttrs = parseTagAttributes(xml, 'dataIntegrity');
  const pwdAttrs = parseTagAttributes(xml, 'encryptedKey');
  if (!keyDataAttrs || !integrityAttrs || !pwdAttrs) {
    return { kind: 'unsupported', reason: 'Missing required Agile encryption XML elements' };
  }

  const parseAlgoBlock = (attrs: Map<string, string>) => {
    const cipherAlgorithm = attrs.get('cipherAlgorithm');
    const cipherChaining = attrs.get('cipherChaining');
    if (cipherAlgorithm !== 'AES' || cipherChaining !== 'ChainingModeCBC') return null;

    const saltSize = Number(attrs.get('saltSize'));
    const blockSize = Number(attrs.get('blockSize'));
    const keyBits = Number(attrs.get('keyBits'));
    const hashSize = Number(attrs.get('hashSize'));
    const hashAlgorithm = normalizeHashAlgorithm(attrs.get('hashAlgorithm'));
    if (
      !Number.isInteger(saltSize) ||
      saltSize <= 0 ||
      blockSize !== 16 ||
      (keyBits !== 128 && keyBits !== 192 && keyBits !== 256) ||
      !hashAlgorithm ||
      hashSize !== HASH_META[hashAlgorithm].size
    ) {
      return null;
    }
    const saltB64 = attrs.get('saltValue');
    if (!saltB64) return null;
    try {
      const saltValue = decodeBase64(saltB64);
      if (saltValue.length !== saltSize) return null;
      return { saltSize, blockSize, keyBits, hashSize, hashAlgorithm, saltValue };
    } catch {
      return null;
    }
  };

  const keyData = parseAlgoBlock(keyDataAttrs);
  const pwdBase = parseAlgoBlock(pwdAttrs);
  if (!keyData || !pwdBase) {
    return { kind: 'unsupported', reason: 'Unsupported Agile cipher or hash parameters' };
  }

  const spinCount = Number(pwdAttrs.get('spinCount'));
  if (!Number.isInteger(spinCount) || spinCount < 0) {
    return { kind: 'unsupported', reason: 'Invalid Agile spinCount' };
  }

  const hmacKeyB64 = integrityAttrs.get('encryptedHmacKey');
  const hmacValB64 = integrityAttrs.get('encryptedHmacValue');
  const verifierInputB64 = pwdAttrs.get('encryptedVerifierHashInput');
  const verifierValueB64 = pwdAttrs.get('encryptedVerifierHashValue');
  const keyValueB64 = pwdAttrs.get('encryptedKeyValue');
  if (!hmacKeyB64 || !hmacValB64 || !verifierInputB64 || !verifierValueB64 || !keyValueB64) {
    return { kind: 'unsupported', reason: 'Missing Agile encrypted key or integrity attributes' };
  }

  try {
    const encryptedHmacKey = decodeBase64(hmacKeyB64);
    const encryptedHmacValue = decodeBase64(hmacValB64);
    const encryptedVerifierHashInput = decodeBase64(verifierInputB64);
    const encryptedVerifierHashValue = decodeBase64(verifierValueB64);
    const encryptedKeyValue = decodeBase64(keyValueB64);

    const aligned = (arr: Uint8Array) => arr.length > 0 && arr.length % 16 === 0;
    if (
      !aligned(encryptedHmacKey) ||
      !aligned(encryptedHmacValue) ||
      !aligned(encryptedVerifierHashInput) ||
      !aligned(encryptedVerifierHashValue) ||
      !aligned(encryptedKeyValue)
    ) {
      return { kind: 'unsupported', reason: 'Unaligned Agile ciphertext blocks' };
    }

    return {
      kind: 'agile',
      info: {
        keyData,
        dataIntegrity: { encryptedHmacKey, encryptedHmacValue },
        passwordKey: {
          spinCount,
          ...pwdBase,
          encryptedVerifierHashInput,
          encryptedVerifierHashValue,
          encryptedKeyValue,
        },
      },
    };
  } catch {
    return { kind: 'unsupported', reason: 'Invalid base64 in Agile EncryptionInfo' };
  }
}

// --- 核心密码学流程（纯 JS 极速派生 + 零二次拷贝分段解密） ---

function derivePasswordHashSync(
  password: string,
  salt: Uint8Array,
  hashAlgorithm: AgileHashAlgorithm,
  spinCount: number
): Uint8Array {
  const initialHash = hashSync(hashAlgorithm, salt, utf16leEncode(password));
  return spinHashAgile(hashAlgorithm, initialHash, spinCount);
}

function deriveBlockKeySync(
  passwordHash: Uint8Array,
  blockKey: Uint8Array,
  hashAlgorithm: AgileHashAlgorithm,
  keyBytes: number
): Uint8Array {
  return resizeHash(hashSync(hashAlgorithm, passwordHash, blockKey), keyBytes);
}

function deriveIvSync(
  salt: Uint8Array,
  blockKey: Uint8Array,
  hashAlgorithm: AgileHashAlgorithm,
  blockSize: number
): Uint8Array {
  return resizeHash(hashSync(hashAlgorithm, salt, blockKey), blockSize);
}

/**
 * 基于已解析的 {@link AgilePasswordKey} 执行轻量 Verifier 密码校验。
 * 全程同步零分配纯 JS 计算，不依赖 `crypto.subtle`，可在 HTTPS 与明文 HTTP 环境下以数十毫秒完成 10 万次迭代。
 */
export function verifyAgileKeySync(key: AgilePasswordKey, password: string): boolean {
  const hashAlgorithm = normalizeHashAlgorithm(key.hashAlgorithm);
  if (!hashAlgorithm) return false;
  try {
    const keyBytes = key.keyBits / 8;
    const passwordIv = resizeHash(key.saltValue, key.blockSize);
    const passwordHash = derivePasswordHashSync(password, key.saltValue, hashAlgorithm, key.spinCount);

    const verifierKey = deriveBlockKeySync(
      passwordHash,
      BLOCK_KEYS.encryptedVerifierHashInput,
      hashAlgorithm,
      keyBytes
    );
    const verifierInput = aesCbcDecryptRaw(verifierKey, passwordIv, key.encryptedVerifierHashInput).subarray(
      0,
      key.saltSize
    );

    const verifierHashKey = deriveBlockKeySync(
      passwordHash,
      BLOCK_KEYS.encryptedVerifierHashValue,
      hashAlgorithm,
      keyBytes
    );
    const decryptedVerifierHash = aesCbcDecryptRaw(
      verifierHashKey,
      passwordIv,
      key.encryptedVerifierHashValue
    ).subarray(0, key.hashSize);

    const actualHash = hashSync(hashAlgorithm, verifierInput);
    return constantTimeEqual(decryptedVerifierHash, actualHash.subarray(0, key.hashSize));
  } catch {
    return false;
  }
}

/** 计算整包 HMAC：在安全上下文且大体积包时优先走原生 WebCrypto 硬件加速，否则走零拷贝纯 JS 流式 HMAC */
async function computePackageHmac(
  hashAlgorithm: AgileHashAlgorithm,
  hmacKey: Uint8Array,
  encryptedPackage: Uint8Array
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && encryptedPackage.byteLength >= WEBCRYPTO_HMAC_THRESHOLD) {
    try {
      const webAlg = HASH_META[hashAlgorithm].web;
      const key = await subtle.importKey(
        'raw',
        hmacKey as unknown as BufferSource,
        { name: 'HMAC', hash: webAlg },
        false,
        ['sign']
      );
      const sig = await subtle.sign('HMAC', key, encryptedPackage as unknown as BufferSource);
      return new Uint8Array(sig);
    } catch {
      // 某些受限环境 subtle 存在但单算法受限时，静默回退到纯 JS 实现
    }
  }
  return hmacSync(hashAlgorithm, hmacKey, encryptedPackage);
}

/**
 * 解密已提取出的 `EncryptionInfo` 与 `EncryptedPackage` 流，返回明文 OOXML zip 包（独立 ArrayBuffer）。
 *
 * @throws {AgileDecryptError} 密码错误/文件损坏（`invalidPassword`）或加密参数不受支持（`unsupportedEncryption`）
 */
export async function decryptAgileStreams(
  encryptionInfo: Uint8Array,
  encryptedPackage: Uint8Array,
  password: string
): Promise<ArrayBuffer> {
  const parsed = parseAgileEncryptionInfo(encryptionInfo);
  if (parsed.kind !== 'agile') {
    throw new AgileDecryptError('unsupportedEncryption', parsed.reason);
  }
  const { keyData, dataIntegrity, passwordKey } = parsed.info;
  const pwdHashAlg = passwordKey.hashAlgorithm;
  const pwdKeyBytes = passwordKey.keyBits / 8;
  const passwordIv = resizeHash(passwordKey.saltValue, passwordKey.blockSize);

  // 1. 派生密码哈希并校验 Verifier（错误密码在此快速失败，不触碰大体积正文）
  const passwordHash = derivePasswordHashSync(password, passwordKey.saltValue, pwdHashAlg, passwordKey.spinCount);

  const verifierKey = deriveBlockKeySync(passwordHash, BLOCK_KEYS.encryptedVerifierHashInput, pwdHashAlg, pwdKeyBytes);
  const verifierInput = aesCbcDecryptRaw(verifierKey, passwordIv, passwordKey.encryptedVerifierHashInput).subarray(
    0,
    passwordKey.saltSize
  );

  const verifierHashKey = deriveBlockKeySync(
    passwordHash,
    BLOCK_KEYS.encryptedVerifierHashValue,
    pwdHashAlg,
    pwdKeyBytes
  );
  const decryptedVerifierHash = aesCbcDecryptRaw(
    verifierHashKey,
    passwordIv,
    passwordKey.encryptedVerifierHashValue
  ).subarray(0, passwordKey.hashSize);

  const actualVerifierHash = hashSync(pwdHashAlg, verifierInput);
  if (!constantTimeEqual(decryptedVerifierHash, actualVerifierHash.subarray(0, passwordKey.hashSize))) {
    throw new AgileDecryptError('invalidPassword', 'Invalid workbook password');
  }

  // 2. 解出 packageKey
  const keyValueKey = deriveBlockKeySync(passwordHash, BLOCK_KEYS.encryptedKeyValue, pwdHashAlg, pwdKeyBytes);
  const packageKey = aesCbcDecryptRaw(keyValueKey, passwordIv, passwordKey.encryptedKeyValue).subarray(
    0,
    keyData.keyBits / 8
  );

  // 预展开整包共用的 AES 解密轮密钥（同时用于 HMAC Key/Value 与全部 4KB 正文分段）
  const expandedPackageKey = expandAesDecryptKey(packageKey);

  // 3. 校验 EncryptedPackage 完整性（HMAC）
  const dataHashAlg = keyData.hashAlgorithm;
  const hmacKeyIv = deriveIvSync(keyData.saltValue, BLOCK_KEYS.encryptedHmacKey, dataHashAlg, keyData.blockSize);
  const hmacValueIv = deriveIvSync(keyData.saltValue, BLOCK_KEYS.encryptedHmacValue, dataHashAlg, keyData.blockSize);

  const hmacKeyOut = new Uint8Array(dataIntegrity.encryptedHmacKey.length);
  aesCbcDecryptRawInto(
    expandedPackageKey,
    hmacKeyIv,
    dataIntegrity.encryptedHmacKey,
    0,
    dataIntegrity.encryptedHmacKey.length,
    hmacKeyOut,
    0,
    hmacKeyOut.length
  );
  const hmacKey = hmacKeyOut.subarray(0, keyData.hashSize);

  const expectedHmacOut = new Uint8Array(dataIntegrity.encryptedHmacValue.length);
  aesCbcDecryptRawInto(
    expandedPackageKey,
    hmacValueIv,
    dataIntegrity.encryptedHmacValue,
    0,
    dataIntegrity.encryptedHmacValue.length,
    expectedHmacOut,
    0,
    expectedHmacOut.length
  );
  const expectedHmac = expectedHmacOut.subarray(0, keyData.hashSize);

  const actualHmac = await computePackageHmac(dataHashAlg, hmacKey, encryptedPackage);
  if (!constantTimeEqual(expectedHmac, actualHmac.subarray(0, keyData.hashSize))) {
    throw new AgileDecryptError('invalidPassword', 'Invalid workbook password or corrupted encrypted package');
  }

  // 4. 4KB 分段原地解密写入预分配输出缓冲（零二次拼接拷贝）
  if (encryptedPackage.length < 8) {
    throw new AgileDecryptError('invalidPassword', 'EncryptedPackage stream is too short');
  }
  const originalSize = readUInt64LE(encryptedPackage, 0);
  if (!Number.isSafeInteger(originalSize) || originalSize < 0) {
    throw new AgileDecryptError('unsupportedEncryption', 'EncryptedPackage original size is invalid');
  }

  const output = new Uint8Array(originalSize);
  const blockIndexBytes = new Uint8Array(4);
  let encryptedOffset = 8;
  let plainOffset = 0;
  let blockIndex = 0;

  while (plainOffset < originalSize) {
    const plainLength = Math.min(AGILE_PACKAGE_SEGMENT_SIZE, originalSize - plainOffset);
    const encryptedLength = Math.ceil(plainLength / keyData.blockSize) * keyData.blockSize;
    if (encryptedOffset + encryptedLength > encryptedPackage.length) {
      throw new AgileDecryptError('invalidPassword', 'EncryptedPackage payload is truncated');
    }

    writeUInt32LE(blockIndexBytes, 0, blockIndex);
    const iv = deriveIvSync(keyData.saltValue, blockIndexBytes, dataHashAlg, keyData.blockSize);
    aesCbcDecryptRawInto(
      expandedPackageKey,
      iv,
      encryptedPackage,
      encryptedOffset,
      encryptedLength,
      output,
      plainOffset,
      plainLength
    );

    encryptedOffset += encryptedLength;
    plainOffset += plainLength;
    blockIndex += 1;
  }

  return output.buffer;
}
