/**
 * 零依赖 FIPS 197 AES-128 / AES-192 / AES-256 CBC 无填充块解密实现。
 *
 * 性能设计：
 * 1. 模块首次调用时按需生成逆 S-Box 与 4 张 256 项 32-bit 逆变换 T-table（TD0~TD3），
 *    单次 16 字节分组解密仅需查表 + XOR，吞吐可达数十 MB/s。
 * 2. 轮密钥展开与 Equivalent Inverse Cipher 变换通过 {@link expandAesDecryptKey} 只执行一次，
 *    在 OOXML Agile 4KB 分段循环中全程复用，避免重复展开密钥。
 * 3. 提供 {@link aesCbcDecryptRawInto} 直接将明文写入预分配输出缓冲区，无需 WebCrypto
 *    无填充解密时的末尾伪造加密块开销，也避免大文件二次拼接拷贝。
 */

const AES_BLOCK_SIZE = 16;

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

/** 懒初始化查找表，避免模块加载阶段占用主线程启动时间 */
interface AesTables {
  sbox: Uint8Array;
  invSbox: Uint8Array;
  td0: Int32Array;
  td1: Int32Array;
  td2: Int32Array;
  td3: Int32Array;
  invMix: (w: number) => number;
}

let cachedTables: AesTables | null = null;

function xtime(a: number): number {
  return ((a << 1) ^ ((a & 0x80) !== 0 ? 0x1b : 0)) & 0xff;
}

function gmul(a: number, b: number): number {
  let p = 0;
  let aa = a;
  let bb = b;
  for (let i = 0; i < 8; i++) {
    if ((bb & 1) !== 0) p ^= aa;
    aa = xtime(aa);
    bb >>>= 1;
  }
  return p;
}

function getTables(): AesTables {
  if (cachedTables) return cachedTables;

  // 通过 GF(2^8) 生成 S-Box 与逆 S-Box，省去大段硬编码常量表
  const sbox = new Uint8Array(256);
  const invSbox = new Uint8Array(256);
  let p = 1;
  let q = 1;
  do {
    p = p ^ xtime(p);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q ^= (q & 0x80) !== 0 ? 0x09 : 0;
    q &= 0xff;
    const xformed =
      q ^ ((q << 1) | (q >>> 7)) ^ ((q << 2) | (q >>> 6)) ^ ((q << 3) | (q >>> 5)) ^ ((q << 4) | (q >>> 4));
    sbox[p] = (xformed ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;

  for (let i = 0; i < 256; i++) {
    invSbox[sbox[i]!] = i;
  }

  // 构建 4 张 Equivalent Inverse Cipher T-table（TD0..TD3）
  const td0 = new Int32Array(256);
  const td1 = new Int32Array(256);
  const td2 = new Int32Array(256);
  const td3 = new Int32Array(256);

  for (let i = 0; i < 256; i++) {
    const s = invSbox[i]!;
    const s14 = gmul(s, 14);
    const s9 = gmul(s, 9);
    const s13 = gmul(s, 13);
    const s11 = gmul(s, 11);
    const t0 = (s14 << 24) | (s9 << 16) | (s13 << 8) | s11 | 0;
    td0[i] = t0;
    td1[i] = (t0 >>> 8) | (t0 << 24);
    td2[i] = (t0 >>> 16) | (t0 << 16);
    td3[i] = (t0 >>> 24) | (t0 << 8);
  }

  const invMix = (w: number): number => {
    const b0 = sbox[(w >>> 24) & 0xff]!;
    const b1 = sbox[(w >>> 16) & 0xff]!;
    const b2 = sbox[(w >>> 8) & 0xff]!;
    const b3 = sbox[w & 0xff]!;
    return td0[b0]! ^ td1[b1]! ^ td2[b2]! ^ td3[b3]!;
  };

  cachedTables = { sbox, invSbox, td0, td1, td2, td3, invMix };
  return cachedTables;
}

/** 预展开后的 AES 解密轮密钥 */
export interface AesDecryptKey {
  /** 轮数（10 / 12 / 14） */
  rounds: number;
  /** 逆序排列且中间轮已应用 InvMixColumns 的 32-bit 轮密钥 */
  decWords: Int32Array;
}

const readBE32 = (buf: Uint8Array, off: number): number =>
  (buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]! | 0;

const writeBE32 = (buf: Uint8Array, off: number, val: number): void => {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
};

/**
 * 展开 AES-128 / AES-192 / AES-256 解密轮密钥（每个 packageKey 只需调用一次）。
 *
 * @param keyBytes - 16 / 24 / 32 字节原始密钥
 */
export function expandAesDecryptKey(keyBytes: Uint8Array): AesDecryptKey {
  const nk = keyBytes.length >>> 2;
  if (nk !== 4 && nk !== 6 && nk !== 8) {
    throw new Error(`Unsupported AES key length: ${keyBytes.length * 8} bits`);
  }
  const { sbox, invMix } = getTables();
  const rounds = nk + 6;
  const totalWords = (rounds + 1) * 4;
  const enc = new Int32Array(totalWords);

  for (let i = 0; i < nk; i++) {
    enc[i] = readBE32(keyBytes, i * 4);
  }
  for (let i = nk; i < totalWords; i++) {
    let temp = enc[i - 1]!;
    if (i % nk === 0) {
      temp =
        ((sbox[(temp >>> 16) & 0xff]! << 24) |
          (sbox[(temp >>> 8) & 0xff]! << 16) |
          (sbox[temp & 0xff]! << 8) |
          sbox[(temp >>> 24) & 0xff]!) ^
        (RCON[(i / nk - 1) | 0]! << 24);
    } else if (nk > 6 && i % nk === 4) {
      temp =
        (sbox[(temp >>> 24) & 0xff]! << 24) |
        (sbox[(temp >>> 16) & 0xff]! << 16) |
        (sbox[(temp >>> 8) & 0xff]! << 8) |
        sbox[temp & 0xff]!;
    }
    enc[i] = enc[i - nk]! ^ temp;
  }

  // 生成逆序轮密钥，并对中间轮施加 InvMixColumns 供 T-table 加速使用
  const decWords = new Int32Array(totalWords);
  for (let r = 0; r <= rounds; r++) {
    const srcOff = (rounds - r) * 4;
    const dstOff = r * 4;
    if (r === 0 || r === rounds) {
      decWords[dstOff] = enc[srcOff]!;
      decWords[dstOff + 1] = enc[srcOff + 1]!;
      decWords[dstOff + 2] = enc[srcOff + 2]!;
      decWords[dstOff + 3] = enc[srcOff + 3]!;
    } else {
      decWords[dstOff] = invMix(enc[srcOff]!);
      decWords[dstOff + 1] = invMix(enc[srcOff + 1]!);
      decWords[dstOff + 2] = invMix(enc[srcOff + 2]!);
      decWords[dstOff + 3] = invMix(enc[srcOff + 3]!);
    }
  }

  return { rounds, decWords };
}

/**
 * 使用已展开的轮密钥执行 AES-CBC 无填充解密，并直接将前 `writeLength` 字节写入目标缓冲区。
 *
 * @param key - 由 {@link expandAesDecryptKey} 生成的解密轮密钥
 * @param iv - 16 字节初始化向量
 * @param src - 密文输入数组
 * @param srcOffset - 密文起始偏移
 * @param encryptedLength - 密文长度（必须是 16 的整数倍）
 * @param dst - 明文目标数组
 * @param dstOffset - 目标写入偏移
 * @param writeLength - 实际写入目标数组的有效字节数（<= encryptedLength，自动截断尾部块填充）
 */
export function aesCbcDecryptRawInto(
  key: AesDecryptKey,
  iv: Uint8Array,
  src: Uint8Array,
  srcOffset: number,
  encryptedLength: number,
  dst: Uint8Array,
  dstOffset: number,
  writeLength: number
): void {
  if (encryptedLength === 0 || writeLength <= 0) return;
  if (encryptedLength % AES_BLOCK_SIZE !== 0) {
    throw new Error('AES-CBC raw input must be block aligned');
  }
  const { invSbox, td0, td1, td2, td3 } = getTables();
  const { rounds, decWords: rk } = key;

  let prev0 = readBE32(iv, 0);
  let prev1 = readBE32(iv, 4);
  let prev2 = readBE32(iv, 8);
  let prev3 = readBE32(iv, 12);

  let remaining = writeLength;
  const endOff = srcOffset + encryptedLength;
  let outPos = dstOffset;
  let tailBuf: Uint8Array | null = null;

  for (let pos = srcOffset; pos < endOff; pos += AES_BLOCK_SIZE) {
    const c0 = readBE32(src, pos);
    const c1 = readBE32(src, pos + 4);
    const c2 = readBE32(src, pos + 8);
    const c3 = readBE32(src, pos + 12);

    let s0 = c0 ^ rk[0]!;
    let s1 = c1 ^ rk[1]!;
    let s2 = c2 ^ rk[2]!;
    let s3 = c3 ^ rk[3]!;

    let kIdx = 4;
    for (let r = 1; r < rounds; r++) {
      const t0 =
        td0[(s0 >>> 24) & 0xff]! ^ td1[(s3 >>> 16) & 0xff]! ^ td2[(s2 >>> 8) & 0xff]! ^ td3[s1 & 0xff]! ^ rk[kIdx++]!;
      const t1 =
        td0[(s1 >>> 24) & 0xff]! ^ td1[(s0 >>> 16) & 0xff]! ^ td2[(s3 >>> 8) & 0xff]! ^ td3[s2 & 0xff]! ^ rk[kIdx++]!;
      const t2 =
        td0[(s2 >>> 24) & 0xff]! ^ td1[(s1 >>> 16) & 0xff]! ^ td2[(s0 >>> 8) & 0xff]! ^ td3[s3 & 0xff]! ^ rk[kIdx++]!;
      const t3 =
        td0[(s3 >>> 24) & 0xff]! ^ td1[(s2 >>> 16) & 0xff]! ^ td2[(s1 >>> 8) & 0xff]! ^ td3[s0 & 0xff]! ^ rk[kIdx++]!;
      s0 = t0;
      s1 = t1;
      s2 = t2;
      s3 = t3;
    }

    const p0 =
      ((invSbox[(s0 >>> 24) & 0xff]! << 24) |
        (invSbox[(s3 >>> 16) & 0xff]! << 16) |
        (invSbox[(s2 >>> 8) & 0xff]! << 8) |
        invSbox[s1 & 0xff]!) ^
      rk[kIdx++]! ^
      prev0;
    const p1 =
      ((invSbox[(s1 >>> 24) & 0xff]! << 24) |
        (invSbox[(s0 >>> 16) & 0xff]! << 16) |
        (invSbox[(s3 >>> 8) & 0xff]! << 8) |
        invSbox[s2 & 0xff]!) ^
      rk[kIdx++]! ^
      prev1;
    const p2 =
      ((invSbox[(s2 >>> 24) & 0xff]! << 24) |
        (invSbox[(s1 >>> 16) & 0xff]! << 16) |
        (invSbox[(s0 >>> 8) & 0xff]! << 8) |
        invSbox[s3 & 0xff]!) ^
      rk[kIdx++]! ^
      prev2;
    const p3 =
      ((invSbox[(s3 >>> 24) & 0xff]! << 24) |
        (invSbox[(s2 >>> 16) & 0xff]! << 16) |
        (invSbox[(s1 >>> 8) & 0xff]! << 8) |
        invSbox[s0 & 0xff]!) ^
      rk[kIdx]! ^
      prev3;

    prev0 = c0;
    prev1 = c1;
    prev2 = c2;
    prev3 = c3;

    if (remaining >= AES_BLOCK_SIZE) {
      writeBE32(dst, outPos, p0);
      writeBE32(dst, outPos + 4, p1);
      writeBE32(dst, outPos + 8, p2);
      writeBE32(dst, outPos + 12, p3);
      outPos += AES_BLOCK_SIZE;
      remaining -= AES_BLOCK_SIZE;
    } else if (remaining > 0) {
      tailBuf ??= new Uint8Array(AES_BLOCK_SIZE);
      writeBE32(tailBuf, 0, p0);
      writeBE32(tailBuf, 4, p1);
      writeBE32(tailBuf, 8, p2);
      writeBE32(tailBuf, 12, p3);
      dst.set(tailBuf.subarray(0, remaining), outPos);
      outPos += remaining;
      remaining = 0;
    }
  }
}

/**
 * 一次性执行 AES-CBC 无填充解密并返回独立 Uint8Array（用于 Verifier、HMAC Key、Package Key 等小块数据）。
 */
export function aesCbcDecryptRaw(keyBytes: Uint8Array, iv: Uint8Array, bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0) return new Uint8Array();
  const expanded = expandAesDecryptKey(keyBytes);
  const out = new Uint8Array(bytes.length);
  aesCbcDecryptRawInto(expanded, iv, bytes, 0, bytes.length, out, 0, bytes.length);
  return out;
}
