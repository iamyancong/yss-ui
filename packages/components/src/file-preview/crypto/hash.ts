/**
 * 零依赖 FIPS 180-4 哈希（SHA-1 / SHA-256 / SHA-384 / SHA-512）与 RFC 2104 HMAC 实现。
 *
 * 性能设计：
 * 1. 全程使用 32-bit 整型位运算与扁平 TypedArray，避免 BigInt 装箱与 GC 压力。
 * 2. 提供流式 {@link createHasher}，计算大体积 EncryptedPackage 的 HMAC 时零整包拷贝。
 * 3. 提供 {@link spinHashAgile} 单块原地迭代快路径：OOXML Agile 4 种哈希的每轮输入均为
 *    `uint32LE(i) || prevHash`（24~68 字节，恒落入单块），在寄存器与复用数组内原地执行
 *    100,000 次压缩，实现零堆分配（Zero-Allocation），实测耗时远低于 10 万次跨边界 WebCrypto 调用。
 */

/** 支持的 OOXML Agile 哈希算法名（统一大写） */
export type AgileHashAlgorithm = 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512';

/** 流式哈希实例 */
export interface StreamingHasher {
  update(chunk: Uint8Array): this;
  digest(): Uint8Array;
}

/** 哈希算法元信息（输出字节数、分组字节数、WebCrypto 名称） */
export const HASH_META: Record<AgileHashAlgorithm, { size: number; blockSize: number; web: string }> = {
  SHA1: { size: 20, blockSize: 64, web: 'SHA-1' },
  SHA256: { size: 32, blockSize: 64, web: 'SHA-256' },
  SHA384: { size: 48, blockSize: 128, web: 'SHA-384' },
  SHA512: { size: 64, blockSize: 128, web: 'SHA-512' },
};

// ============================================================================
// 通用字节读写与旋转工具
// ============================================================================

const readBE32 = (buf: Uint8Array, off: number): number =>
  (buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]! | 0;

const writeBE32 = (buf: Uint8Array, off: number, val: number): void => {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
};

/** 将 32 位整数按小端序 4 字节重新解释为大端 32 位字（用于把 uint32LE(i) 直接写入 SHA 大端消息字） */
const bswap32 = (x: number): number =>
  ((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | ((x >>> 24) & 0xff) | 0;

// ============================================================================
// SHA-1 (FIPS 180-4)
// ============================================================================

const SHA1_IV = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0]);

function sha1CompressWords(state: Int32Array, w: Int32Array): void {
  for (let i = 16; i < 80; i++) {
    const t = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
    w[i] = (t << 1) | (t >>> 31);
  }
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  let e = state[4]!;

  for (let i = 0; i < 80; i++) {
    let f: number;
    let k: number;
    if (i < 20) {
      f = (b & c) | (~b & d);
      k = 0x5a827999;
    } else if (i < 40) {
      f = b ^ c ^ d;
      k = 0x6ed9eba1;
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d);
      k = 0x8f1bbcdc | 0;
    } else {
      f = b ^ c ^ d;
      k = 0xca62c1d6 | 0;
    }
    const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) | 0;
    e = d;
    d = c;
    c = (b << 30) | (b >>> 2);
    b = a;
    a = temp;
  }

  state[0] = (state[0]! + a) | 0;
  state[1] = (state[1]! + b) | 0;
  state[2] = (state[2]! + c) | 0;
  state[3] = (state[3]! + d) | 0;
  state[4] = (state[4]! + e) | 0;
}

function createSha1Hasher(): StreamingHasher {
  const state = new Int32Array(SHA1_IV);
  const block = new Uint8Array(64);
  const w = new Int32Array(80);
  let blockPos = 0;
  let totalBytes = 0;

  const compressBlock = (src: Uint8Array, off: number) => {
    for (let i = 0; i < 16; i++) {
      w[i] = readBE32(src, off + i * 4);
    }
    sha1CompressWords(state, w);
  };

  return {
    update(chunk: Uint8Array) {
      let off = 0;
      const len = chunk.length;
      totalBytes += len;
      if (blockPos > 0) {
        const take = Math.min(64 - blockPos, len);
        block.set(chunk.subarray(0, take), blockPos);
        blockPos += take;
        off += take;
        if (blockPos === 64) {
          compressBlock(block, 0);
          blockPos = 0;
        }
      }
      while (off + 64 <= len) {
        compressBlock(chunk, off);
        off += 64;
      }
      if (off < len) {
        block.set(chunk.subarray(off), 0);
        blockPos = len - off;
      }
      return this;
    },
    digest() {
      block[blockPos++] = 0x80;
      if (blockPos > 56) {
        block.fill(0, blockPos, 64);
        compressBlock(block, 0);
        blockPos = 0;
      }
      block.fill(0, blockPos, 56);
      const totalBits = totalBytes * 8;
      writeBE32(block, 56, Math.floor(totalBits / 0x100000000));
      writeBE32(block, 60, totalBits >>> 0);
      compressBlock(block, 0);

      const out = new Uint8Array(20);
      for (let i = 0; i < 5; i++) {
        writeBE32(out, i * 4, state[i]!);
      }
      return out;
    },
  };
}

// ============================================================================
// SHA-256 (FIPS 180-4)
// ============================================================================

const SHA256_IV = new Int32Array([
  0x6a09e667,
  0xbb67ae85 | 0,
  0x3c6ef372,
  0xa54ff53a | 0,
  0x510e527f,
  0x9b05688c | 0,
  0x1f83d9ab,
  0x5be0cd19,
]);

const SHA256_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function sha256CompressWords(state: Int32Array, w: Int32Array): void {
  for (let i = 16; i < 64; i++) {
    const w15 = w[i - 15]!;
    const w2 = w[i - 2]!;
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
  }

  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  let e = state[4]!;
  let f = state[5]!;
  let g = state[6]!;
  let h = state[7]!;

  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;

    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }

  state[0] = (state[0]! + a) | 0;
  state[1] = (state[1]! + b) | 0;
  state[2] = (state[2]! + c) | 0;
  state[3] = (state[3]! + d) | 0;
  state[4] = (state[4]! + e) | 0;
  state[5] = (state[5]! + f) | 0;
  state[6] = (state[6]! + g) | 0;
  state[7] = (state[7]! + h) | 0;
}

function createSha256Hasher(): StreamingHasher {
  const state = new Int32Array(SHA256_IV);
  const block = new Uint8Array(64);
  const w = new Int32Array(64);
  let blockPos = 0;
  let totalBytes = 0;

  const compressBlock = (src: Uint8Array, off: number) => {
    for (let i = 0; i < 16; i++) {
      w[i] = readBE32(src, off + i * 4);
    }
    sha256CompressWords(state, w);
  };

  return {
    update(chunk: Uint8Array) {
      let off = 0;
      const len = chunk.length;
      totalBytes += len;
      if (blockPos > 0) {
        const take = Math.min(64 - blockPos, len);
        block.set(chunk.subarray(0, take), blockPos);
        blockPos += take;
        off += take;
        if (blockPos === 64) {
          compressBlock(block, 0);
          blockPos = 0;
        }
      }
      while (off + 64 <= len) {
        compressBlock(chunk, off);
        off += 64;
      }
      if (off < len) {
        block.set(chunk.subarray(off), 0);
        blockPos = len - off;
      }
      return this;
    },
    digest() {
      block[blockPos++] = 0x80;
      if (blockPos > 56) {
        block.fill(0, blockPos, 64);
        compressBlock(block, 0);
        blockPos = 0;
      }
      block.fill(0, blockPos, 56);
      const totalBits = totalBytes * 8;
      writeBE32(block, 56, Math.floor(totalBits / 0x100000000));
      writeBE32(block, 60, totalBits >>> 0);
      compressBlock(block, 0);

      const out = new Uint8Array(32);
      for (let i = 0; i < 8; i++) {
        writeBE32(out, i * 4, state[i]!);
      }
      return out;
    },
  };
}

// ============================================================================
// SHA-384 / SHA-512 (FIPS 180-4，纯 32-bit 双字拆解无 BigInt 开销)
// ============================================================================

/** SHA-512 初始向量（8 × [hi, lo]） */
const SHA512_IV = new Int32Array([
  0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f,
  0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
]);

/** SHA-384 初始向量（8 × [hi, lo]） */
const SHA384_IV = new Int32Array([
  0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939, 0x67332667,
  0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
]);

/** SHA-512 / SHA-384 80 轮常量（高 32 位与低 32 位交错存储，共 160 项） */
const SHA512_K = new Int32Array([
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b,
  0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242,
  0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe,
  0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc,
  0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f,
  0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967,
  0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b, 0xa2bfe8a1,
  0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
  0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08,
  0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814,
  0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915,
  0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f,
  0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be,
  0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
]);

/**
 * SHA-512 / SHA-384 单块压缩函数（state 长度 16，w 长度 160，前 32 项已填入当前 128 字节块的高低字）。
 */
function sha512CompressWords(state: Int32Array, w: Int32Array): void {
  for (let i = 16; i < 80; i++) {
    const i2 = i * 2;
    // s0 = rotr64(w[i-15], 1) ^ rotr64(w[i-15], 8) ^ shr64(w[i-15], 7)
    const w15h = w[i2 - 30]!;
    const w15l = w[i2 - 29]!;
    const s0h = ((w15h >>> 1) | (w15l << 31)) ^ ((w15h >>> 8) | (w15l << 24)) ^ (w15h >>> 7);
    const s0l = ((w15l >>> 1) | (w15h << 31)) ^ ((w15l >>> 8) | (w15h << 24)) ^ ((w15l >>> 7) | (w15h << 25));

    // s1 = rotr64(w[i-2], 19) ^ rotr64(w[i-2], 61) ^ shr64(w[i-2], 6)
    const w2h = w[i2 - 4]!;
    const w2l = w[i2 - 3]!;
    const s1h = ((w2h >>> 19) | (w2l << 13)) ^ ((w2l >>> 29) | (w2h << 3)) ^ (w2h >>> 6);
    const s1l = ((w2l >>> 19) | (w2h << 13)) ^ ((w2h >>> 29) | (w2l << 3)) ^ ((w2l >>> 6) | (w2h << 26));

    // w[i] = w[i-16] + s0 + w[i-7] + s1 (64-bit unsigned add via 32-bit carry)
    const lo = (w[i2 - 32 + 1]! >>> 0) + (s0l >>> 0) + (w[i2 - 14 + 1]! >>> 0) + (s1l >>> 0);
    const hi = (w[i2 - 32]! >>> 0) + (s0h >>> 0) + (w[i2 - 14]! >>> 0) + (s1h >>> 0) + Math.floor(lo / 0x100000000);
    w[i2] = hi | 0;
    w[i2 + 1] = lo | 0;
  }

  let ah = state[0]!;
  let al = state[1]!;
  let bh = state[2]!;
  let bl = state[3]!;
  let ch = state[4]!;
  let cl = state[5]!;
  let dh = state[6]!;
  let dl = state[7]!;
  let eh = state[8]!;
  let el = state[9]!;
  let fh = state[10]!;
  let fl = state[11]!;
  let gh = state[12]!;
  let gl = state[13]!;
  let hh = state[14]!;
  let hl = state[15]!;

  for (let i = 0; i < 80; i++) {
    const i2 = i * 2;
    // S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41)
    const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
    const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
    const chh = (eh & fh) ^ (~eh & gh);
    const chl = (el & fl) ^ (~el & gl);

    const t1l = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (SHA512_K[i2 + 1]! >>> 0) + (w[i2 + 1]! >>> 0);
    const t1h =
      (hh >>> 0) + (S1h >>> 0) + (chh >>> 0) + (SHA512_K[i2]! >>> 0) + (w[i2]! >>> 0) + Math.floor(t1l / 0x100000000);

    // S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39)
    const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
    const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
    const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
    const majl = (al & bl) ^ (al & cl) ^ (bl & cl);

    const t2l = (S0l >>> 0) + (majl >>> 0);
    const t2h = (S0h >>> 0) + (majh >>> 0) + Math.floor(t2l / 0x100000000);

    hh = gh;
    hl = gl;
    gh = fh;
    gl = fl;
    fh = eh;
    fl = el;

    const nel = (dl >>> 0) + (t1l >>> 0);
    eh = ((dh >>> 0) + (t1h >>> 0) + Math.floor(nel / 0x100000000)) | 0;
    el = nel | 0;

    dh = ch;
    dl = cl;
    ch = bh;
    cl = bl;
    bh = ah;
    bl = al;

    const nal = (t1l >>> 0) + (t2l >>> 0);
    ah = ((t1h >>> 0) + (t2h >>> 0) + Math.floor(nal / 0x100000000)) | 0;
    al = nal | 0;
  }

  let l: number;
  l = (state[1]! >>> 0) + (al >>> 0);
  state[0] = ((state[0]! >>> 0) + (ah >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[1] = l | 0;

  l = (state[3]! >>> 0) + (bl >>> 0);
  state[2] = ((state[2]! >>> 0) + (bh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[3] = l | 0;

  l = (state[5]! >>> 0) + (cl >>> 0);
  state[4] = ((state[4]! >>> 0) + (ch >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[5] = l | 0;

  l = (state[7]! >>> 0) + (dl >>> 0);
  state[6] = ((state[6]! >>> 0) + (dh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[7] = l | 0;

  l = (state[9]! >>> 0) + (el >>> 0);
  state[8] = ((state[8]! >>> 0) + (eh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[9] = l | 0;

  l = (state[11]! >>> 0) + (fl >>> 0);
  state[10] = ((state[10]! >>> 0) + (fh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[11] = l | 0;

  l = (state[13]! >>> 0) + (gl >>> 0);
  state[12] = ((state[12]! >>> 0) + (gh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[13] = l | 0;

  l = (state[15]! >>> 0) + (hl >>> 0);
  state[14] = ((state[14]! >>> 0) + (hh >>> 0) + Math.floor(l / 0x100000000)) | 0;
  state[15] = l | 0;
}

function createSha512FamilyHasher(iv: Int32Array, outputBytes: 48 | 64): StreamingHasher {
  const state = new Int32Array(iv);
  const block = new Uint8Array(128);
  const w = new Int32Array(160);
  let blockPos = 0;
  let totalBytes = 0;

  const compressBlock = (src: Uint8Array, off: number) => {
    for (let i = 0; i < 32; i++) {
      w[i] = readBE32(src, off + i * 4);
    }
    sha512CompressWords(state, w);
  };

  return {
    update(chunk: Uint8Array) {
      let off = 0;
      const len = chunk.length;
      totalBytes += len;
      if (blockPos > 0) {
        const take = Math.min(128 - blockPos, len);
        block.set(chunk.subarray(0, take), blockPos);
        blockPos += take;
        off += take;
        if (blockPos === 128) {
          compressBlock(block, 0);
          blockPos = 0;
        }
      }
      while (off + 128 <= len) {
        compressBlock(chunk, off);
        off += 128;
      }
      if (off < len) {
        block.set(chunk.subarray(off), 0);
        blockPos = len - off;
      }
      return this;
    },
    digest() {
      block[blockPos++] = 0x80;
      if (blockPos > 112) {
        block.fill(0, blockPos, 128);
        compressBlock(block, 0);
        blockPos = 0;
      }
      block.fill(0, blockPos, 120);
      const totalBits = totalBytes * 8;
      writeBE32(block, 120, Math.floor(totalBits / 0x100000000));
      writeBE32(block, 124, totalBits >>> 0);
      compressBlock(block, 0);

      const out = new Uint8Array(outputBytes);
      const wordCount = outputBytes >>> 2;
      for (let i = 0; i < wordCount; i++) {
        writeBE32(out, i * 4, state[i]!);
      }
      return out;
    },
  };
}

// ============================================================================
// 公开 API：流式哈希、一次性哈希、零拷贝 HMAC、Agile 零分配迭代快路径
// ============================================================================

/** 创建流式哈希器 */
export function createHasher(algorithm: AgileHashAlgorithm): StreamingHasher {
  switch (algorithm) {
    case 'SHA1':
      return createSha1Hasher();
    case 'SHA256':
      return createSha256Hasher();
    case 'SHA384':
      return createSha512FamilyHasher(SHA384_IV, 48);
    case 'SHA512':
      return createSha512FamilyHasher(SHA512_IV, 64);
  }
}

/** 一次性计算一段或多段字节的哈希摘要（无需提前拼接大数组） */
export function hashSync(algorithm: AgileHashAlgorithm, ...chunks: Uint8Array[]): Uint8Array {
  const hasher = createHasher(algorithm);
  for (const chunk of chunks) {
    hasher.update(chunk);
  }
  return hasher.digest();
}

/** 计算 RFC 2104 HMAC（流式喂入正文，避免复制数 MB 的 EncryptedPackage） */
export function hmacSync(algorithm: AgileHashAlgorithm, key: Uint8Array, data: Uint8Array): Uint8Array {
  const { blockSize } = HASH_META[algorithm];
  const keyBlock = new Uint8Array(blockSize);
  if (key.length > blockSize) {
    keyBlock.set(hashSync(algorithm, key));
  } else {
    keyBlock.set(key);
  }

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const k = keyBlock[i]!;
    ipad[i] = k ^ 0x36;
    opad[i] = k ^ 0x5c;
  }

  const innerHash = createHasher(algorithm).update(ipad).update(data).digest();
  return createHasher(algorithm).update(opad).update(innerHash).digest();
}

/**
 * OOXML Agile 密钥派生专用零分配迭代快路径：
 * 执行 `for (let i = 0; i < spinCount; i++) H = Hash(uint32LE(i) || H)`。
 *
 * 4 种算法每轮输入长度（24 / 36 / 52 / 68 字节）均严格小于各自单块上限（55 / 55 / 111 / 111 字节），
 * 因此直接在 32-bit 整型工作数组中原地刷新 `w[0]` 与前序摘要字，避免 10 万次数组分配与序列化。
 */
export function spinHashAgile(algorithm: AgileHashAlgorithm, initialHash: Uint8Array, spinCount: number): Uint8Array {
  if (spinCount <= 0) return new Uint8Array(initialHash);

  if (algorithm === 'SHA512' || algorithm === 'SHA384') {
    const iv = algorithm === 'SHA512' ? SHA512_IV : SHA384_IV;
    const outputBytes = algorithm === 'SHA512' ? 64 : 48;
    const hashWords = outputBytes >>> 2; // 16 or 12
    const state = new Int32Array(16);
    const w = new Int32Array(160);

    // 预填充固定不变的尾部 padding：消息长度为 4 + outputBytes 字节（即 1 + hashWords 个 32-bit 字）
    w[1 + hashWords] = 0x80000000 | 0;
    // 其余 w[hashWords+2 .. 30] 默认为 0
    w[31] = (4 + outputBytes) * 8; // 544 (SHA512) 或 416 (SHA384)

    // 将 initialHash 写入 w[1 .. hashWords]
    for (let j = 0; j < hashWords; j++) {
      w[1 + j] = readBE32(initialHash, j * 4);
    }

    for (let i = 0; i < spinCount; i++) {
      // 重置初始向量
      for (let j = 0; j < 16; j++) state[j] = iv[j]!;
      w[0] = bswap32(i);
      sha512CompressWords(state, w);
      // 直接把压缩结果写回下一轮的 w[1 .. hashWords]（compress 仅写入 w[32..159]，padding 区域 w[1+hashWords..31] 恒定不变）
      for (let j = 0; j < hashWords; j++) w[1 + j] = state[j]!;
    }

    const out = new Uint8Array(outputBytes);
    for (let j = 0; j < hashWords; j++) {
      writeBE32(out, j * 4, state[j]!);
    }
    return out;
  }

  if (algorithm === 'SHA256') {
    const state = new Int32Array(8);
    const w = new Int32Array(64);
    for (let j = 0; j < 8; j++) {
      w[1 + j] = readBE32(initialHash, j * 4);
    }
    w[9] = 0x80000000 | 0;
    w[15] = (4 + 32) * 8; // 288

    for (let i = 0; i < spinCount; i++) {
      for (let j = 0; j < 8; j++) state[j] = SHA256_IV[j]!;
      w[0] = bswap32(i);
      sha256CompressWords(state, w);
      for (let j = 0; j < 8; j++) w[1 + j] = state[j]!;
      // SHA-256 仅写 w[16..63]，w[9..15] 不会被修改！
    }

    const out = new Uint8Array(32);
    for (let j = 0; j < 8; j++) {
      writeBE32(out, j * 4, state[j]!);
    }
    return out;
  }

  // SHA1
  const state = new Int32Array(5);
  const w = new Int32Array(80);
  for (let j = 0; j < 5; j++) {
    w[1 + j] = readBE32(initialHash, j * 4);
  }
  w[6] = 0x80000000 | 0;
  w[15] = (4 + 20) * 8; // 192

  for (let i = 0; i < spinCount; i++) {
    for (let j = 0; j < 5; j++) state[j] = SHA1_IV[j]!;
    w[0] = bswap32(i);
    sha1CompressWords(state, w);
    for (let j = 0; j < 5; j++) w[1 + j] = state[j]!;
  }

  const out = new Uint8Array(20);
  for (let j = 0; j < 5; j++) {
    writeBE32(out, j * 4, state[j]!);
  }
  return out;
}
