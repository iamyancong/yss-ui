import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesCbcDecryptRaw, aesCbcDecryptRawInto, expandAesDecryptKey } from '../crypto/aes-cbc';
import { createHasher, hashSync, hmacSync, spinHashAgile, type AgileHashAlgorithm } from '../crypto/hash';

const NODE_HASH_NAME: Record<AgileHashAlgorithm, string> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA384: 'sha384',
  SHA512: 'sha512',
};

describe('file-preview 纯 JS 密码学内核与 node:crypto 逐字节等价性', () => {
  const algorithms: AgileHashAlgorithm[] = ['SHA1', 'SHA256', 'SHA384', 'SHA512'];
  const sampleLengths = [0, 1, 20, 55, 56, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 255, 1024, 4096];

  it.each(algorithms)('%s 单段与流式多段摘要与 node:crypto 完全一致', alg => {
    const nodeAlg = NODE_HASH_NAME[alg];
    for (const len of sampleLengths) {
      const data = new Uint8Array(randomBytes(len));
      const expected = new Uint8Array(createHash(nodeAlg).update(data).digest());
      expect(hashSync(alg, data)).toEqual(expected);

      // 流式任意切块验证跨块边界拼接
      const hasher = createHasher(alg);
      let off = 0;
      const step = 17;
      while (off < data.length) {
        hasher.update(data.subarray(off, Math.min(off + step, data.length)));
        off += step;
      }
      expect(hasher.digest()).toEqual(expected);
    }
  });

  it.each(algorithms)('%s HMAC（短密钥 / 等长密钥 / 超块长密钥）与 node:crypto 完全一致', alg => {
    const nodeAlg = NODE_HASH_NAME[alg];
    const keyLengths = [0, 16, 32, 64, 128, 200];
    const msgLengths = [0, 1, 64, 128, 5000];
    for (const kLen of keyLengths) {
      const key = new Uint8Array(randomBytes(kLen));
      for (const mLen of msgLengths) {
        const msg = new Uint8Array(randomBytes(mLen));
        const expected = new Uint8Array(createHmac(nodeAlg, key).update(msg).digest());
        expect(hmacSync(alg, key, msg)).toEqual(expected);
      }
    }
  });

  it.each(algorithms)('%s spinHashAgile 单块零分配快路径与逐步哈希完全一致', alg => {
    const nodeAlg = NODE_HASH_NAME[alg];
    const seed = new Uint8Array(createHash(nodeAlg).update('yss-agile-seed').digest());

    for (const spinCount of [0, 1, 10, 257]) {
      let expected = seed;
      for (let i = 0; i < spinCount; i++) {
        const iter = Buffer.alloc(4);
        iter.writeUInt32LE(i, 0);
        expected = new Uint8Array(createHash(nodeAlg).update(iter).update(expected).digest());
      }
      expect(spinHashAgile(alg, seed, spinCount)).toEqual(expected);
    }
  });

  it.each([
    { bits: 128, cipher: 'aes-128-cbc', keyLen: 16 },
    { bits: 192, cipher: 'aes-192-cbc', keyLen: 24 },
    { bits: 256, cipher: 'aes-256-cbc', keyLen: 32 },
  ])('AES-$bits-CBC 无填充块解密与截断写入与 node:crypto 完全一致', ({ cipher, keyLen }) => {
    const key = new Uint8Array(randomBytes(keyLen));
    const expanded = expandAesDecryptKey(key);

    for (const blocks of [1, 2, 7, 256]) {
      const iv = new Uint8Array(randomBytes(16));
      const plain = new Uint8Array(randomBytes(blocks * 16));
      const enc = createCipheriv(cipher, key, iv);
      enc.setAutoPadding(false);
      const ciphertext = new Uint8Array(Buffer.concat([enc.update(plain), enc.final()]));

      expect(aesCbcDecryptRaw(key, iv, ciphertext)).toEqual(plain);

      // 测试非块对齐 writeLength 截断（OOXML 最后一个 4KB 分段常见场景）
      const partialLen = Math.max(1, plain.length - 9);
      const dst = new Uint8Array(partialLen + 8).fill(0xaa);
      aesCbcDecryptRawInto(expanded, iv, ciphertext, 0, ciphertext.length, dst, 4, partialLen);
      expect(dst.subarray(0, 4)).toEqual(new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa]));
      expect(dst.subarray(4, 4 + partialLen)).toEqual(plain.subarray(0, partialLen));
      expect(dst.subarray(4 + partialLen)).toEqual(new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa]));
    }
  });
});
