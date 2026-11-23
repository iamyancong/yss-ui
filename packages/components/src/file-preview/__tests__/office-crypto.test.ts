import { describe, expect, it, vi } from 'vitest';
import { extractEncryptionInfo, parseAgileEncryptionXml, verifyAgileKey } from '../utils/agile-verifier';
import { detectFileType } from '../utils/detect';
import {
  decryptOoxmlPackage,
  InvalidPasswordError,
  isOfficeFileEncrypted,
  sniffOleEncrypted,
  verifyOfficeFilePassword,
} from '../utils/office-crypto';
import { clearPasswordCache } from '../utils/password-cache';
import { loadFixture, xlsxBuffer } from './helpers';

const encryptedBytes = () => new Uint8Array(loadFixture('xlsx-encrypted.xlsx'));

describe('file-preview office crypto', () => {
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
  }, 15_000);

  it('verifyOfficeFilePassword：二次校验同一文件与密码命中内存缓存，毫秒级即返回', async () => {
    clearPasswordCache();
    const bytes = encryptedBytes();
    // 第一次验证：写入缓存
    expect(await verifyOfficeFilePassword(bytes, 'yss-test')).toBe(true);
    const start = performance.now();
    const res = await verifyOfficeFilePassword(bytes, 'yss-test');
    const elapsed = performance.now() - start;
    expect(res).toBe(true);
    expect(elapsed).toBeLessThan(50); // 缓存命中应在 50ms 内（通常 < 1ms）
  }, 15_000);

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

  it('WebCrypto subtle 不可用时显式抛错而非误判为密码错误', async () => {
    const encInfo = extractEncryptionInfo(encryptedBytes())!;
    const agileKey = parseAgileEncryptionXml(encInfo)!;
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      await expect(verifyAgileKey(agileKey, 'yss-test')).rejects.toThrow(/WebCrypto subtle/i);
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
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

  it('正确密码解密后得到 zip 包', async () => {
    const unlocked = new Uint8Array(await decryptOoxmlPackage(encryptedBytes(), 'yss-test'));
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
