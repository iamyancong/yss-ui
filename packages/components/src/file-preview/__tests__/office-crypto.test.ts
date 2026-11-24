import { decryptWorkbook } from 'ooxml-encryption';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractEncryptionInfo,
  extractOleStreams,
  parseAgileEncryptionXml,
  verifyAgileKey,
} from '../utils/agile-verifier';
import { detectFileType } from '../utils/detect';
import {
  decryptOoxmlPackage,
  InvalidPasswordError,
  isOfficeFileEncrypted,
  sniffOleEncrypted,
  UnsupportedEncryptionError,
  verifyOfficeFilePassword,
} from '../utils/office-crypto';
import { clearPasswordCache } from '../utils/password-cache';
import { loadFixture, xlsxBuffer } from './helpers';

const encryptedBytes = () => new Uint8Array(loadFixture('xlsx-encrypted.xlsx'));

describe('file-preview office crypto', () => {
  afterEach(() => {
    clearPasswordCache();
  });

  it('sniffOleEncrypted / isOfficeFileEncrypted 识别 OOXML 加密信封', () => {
    expect(sniffOleEncrypted(encryptedBytes())).toBe(true);
    expect(isOfficeFileEncrypted(encryptedBytes())).toBe(true);
    expect(isOfficeFileEncrypted(xlsxBuffer())).toBe(false);
    expect(sniffOleEncrypted(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).toBe(false);
  });

  it('verifyOfficeFilePassword：未加密为 true，正确密码 true，错误密码 false', async () => {
    expect(await verifyOfficeFilePassword(xlsxBuffer(), 'any')).toBe(true);
    expect(await verifyOfficeFilePassword(encryptedBytes(), 'yss-test')).toBe(true);
    expect(await verifyOfficeFilePassword(encryptedBytes(), 'wrong')).toBe(false);
    expect(await verifyOfficeFilePassword(encryptedBytes(), '   ')).toBe(false);
  });

  it('verifyOfficeFilePassword：二次校验同一文件与密码命中内存缓存，毫秒级即返回', async () => {
    const bytes = encryptedBytes();
    // 第一次验证：写入缓存
    expect(await verifyOfficeFilePassword(bytes, 'yss-test')).toBe(true);
    const start = performance.now();
    const res = await verifyOfficeFilePassword(bytes, 'yss-test');
    const elapsed = performance.now() - start;
    expect(res).toBe(true);
    expect(elapsed).toBeLessThan(50); // 缓存命中应在 50ms 内（通常 < 1ms）
  });

  it('parseAgileEncryptionXml 拒绝非 Agile 或参数异常的 EncryptionInfo', () => {
    const encInfo = extractEncryptionInfo(encryptedBytes());
    expect(encInfo).not.toBeNull();
    expect(parseAgileEncryptionXml(encInfo!)).not.toBeNull();

    // 伪造旧版 Standard Encryption 3.2 头
    const standard = new Uint8Array(encInfo!);
    standard[0] = 3;
    standard[1] = 0;
    standard[2] = 2;
    standard[3] = 0;
    expect(parseAgileEncryptionXml(standard)).toBeNull();
  });

  it('非安全上下文（HTTP，crypto.subtle 不可用）下自动纯 JS 验密与解密，且结果与 WebCrypto 逐字节一致', async () => {
    const raw = encryptedBytes();
    const expectedPlain = await decryptWorkbook(raw, 'yss-test');
    const encInfo = extractEncryptionInfo(raw)!;
    const agileKey = parseAgileEncryptionXml(encInfo)!;

    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      expect(await verifyAgileKey(agileKey, 'yss-test')).toBe(true);
      expect(await verifyAgileKey(agileKey, 'wrong')).toBe(false);

      expect(await verifyOfficeFilePassword(raw, 'wrong')).toBe(false);
      expect(await verifyOfficeFilePassword(raw, 'yss-test')).toBe(true);

      const unlocked = new Uint8Array(await decryptOoxmlPackage(raw, 'yss-test'));
      expect(unlocked).toEqual(expectedPlain);

      await expect(decryptOoxmlPackage(raw, 'wrong')).rejects.toBeInstanceOf(InvalidPasswordError);
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });

  it('HTTP 环境下遇到旧版 Standard Encryption 抛出 UnsupportedEncryptionError，不暴露 WebCrypto 错误', async () => {
    const raw = encryptedBytes();
    const encInfo = extractEncryptionInfo(raw)!;
    // 在原始 OLE 字节中定位 EncryptionInfo 流头（04 00 04 00 40 00 00 00）并篡改为 Standard 3.2
    const header = Uint8Array.from([4, 0, 4, 0, 0x40, 0, 0, 0]);
    let offset = -1;
    for (let i = 0; i <= raw.length - header.length; i++) {
      if (header.every((b, idx) => raw[i + idx] === b)) {
        offset = i;
        break;
      }
    }
    expect(offset).toBeGreaterThan(-1);
    expect(encInfo[0]).toBe(4);
    const mutated = new Uint8Array(raw);
    mutated[offset] = 3;
    mutated[offset + 2] = 2;

    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      await expect(verifyOfficeFilePassword(mutated, 'yss-test')).rejects.toBeInstanceOf(UnsupportedEncryptionError);
      await expect(decryptOoxmlPackage(mutated, 'yss-test')).rejects.toBeInstanceOf(UnsupportedEncryptionError);
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });

  it('EncryptedPackage 正文被篡改时 HMAC 完整性校验失败并抛出 InvalidPasswordError', async () => {
    const raw = encryptedBytes();
    const streams = extractOleStreams(raw, ['EncryptionInfo', 'EncryptedPackage']);
    expect(streams).not.toBeNull();
    const encPkg = streams!.get('EncryptedPackage')!;
    // 在原始字节中定位 EncryptedPackage 前 16 字节并翻转其中一比特
    const needle = encPkg.subarray(8, 24);
    let offset = -1;
    for (let i = 0; i <= raw.length - needle.length; i++) {
      if (needle.every((b, idx) => raw[i + idx] === b)) {
        offset = i;
        break;
      }
    }
    expect(offset).toBeGreaterThan(-1);
    const tampered = new Uint8Array(raw);
    tampered[offset]! ^= 0x01;

    await expect(decryptOoxmlPackage(tampered, 'yss-test')).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it('加密 xlsx 识别为需要密码，而不是内容不符', () => {
    const result = detectFileType('secret.xlsx', undefined, encryptedBytes());
    expect(result).toMatchObject({
      type: 'xlsx',
      mismatch: false,
      encrypted: true,
      reason: 'PASSWORD_REQUIRED',
    });
  });

  it('普通 OLE xls 不是加密文档', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(24).fill(0)]);
    const result = detectFileType('legacy.xls', undefined, ole);
    expect(result.encrypted).toBeFalsy();
    expect(result.type).toBe('xls');
  });

  it('正确密码解密后得到 zip 包，且原始加密字节未被破坏', async () => {
    const raw = encryptedBytes();
    const snapshot = new Uint8Array(raw);
    const unlocked = new Uint8Array(await decryptOoxmlPackage(raw, 'yss-test'));
    expect(raw).toEqual(snapshot);
    expect(unlocked[0]).toBe(0x50);
    expect(unlocked[1]).toBe(0x4b);
    const detected = detectFileType('secret.xlsx', undefined, unlocked);
    expect(detected.type).toBe('xlsx');
    expect(detected.mismatch).toBe(false);
    expect(detected.encrypted).toBeFalsy();
  });

  it('错误密码抛出 InvalidPasswordError', async () => {
    await expect(decryptOoxmlPackage(encryptedBytes(), 'wrong-password')).rejects.toBeInstanceOf(InvalidPasswordError);
  });
});
