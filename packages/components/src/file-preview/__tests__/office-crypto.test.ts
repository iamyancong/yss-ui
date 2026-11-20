import { describe, expect, it } from 'vitest';
import { detectFileType } from '../utils/detect';
import {
  decryptOoxmlPackage,
  InvalidPasswordError,
  sniffOleEncrypted,
} from '../utils/office-crypto';
import { loadFixture, xlsxBuffer } from './helpers';

const encryptedBytes = () => new Uint8Array(loadFixture('xlsx-encrypted.xlsx'));

describe('file-preview office crypto', () => {
  it('sniffOleEncrypted 识别 OOXML 加密信封', () => {
    expect(sniffOleEncrypted(encryptedBytes())).toBe(true);
    expect(sniffOleEncrypted(new Uint8Array(xlsxBuffer()))).toBe(false);
    expect(sniffOleEncrypted(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).toBe(false);
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
    await expect(decryptOoxmlPackage(encryptedBytes(), 'wrong-password')).rejects.toBeInstanceOf(
      InvalidPasswordError
    );
  });
});
