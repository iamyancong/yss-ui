/**
 * OOXML 密码加密（Excel / Word / PowerPoint「加密文档」）检测与解密。
 * 现代 Office 把加密后的 zip 包放进 OLE 复合文档的 EncryptedPackage 流，需密码解开后再按普通 xlsx/docx/pptx 预览。
 */
import { MissingDependencyError } from '../errors';
import { MAGIC_NUMBER_MAP } from '../constant';

const OOXML_ENCRYPTED_TYPES = new Set(['docx', 'xlsx', 'pptx']);

/** CFB 目录里 UTF-16LE 的 EncryptedPackage（OOXML 加密信封特有） */
const ENCRYPTED_PACKAGE_UTF16 = (() => {
  const name = 'EncryptedPackage';
  const out = new Uint8Array(name.length * 2);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
})();

function matchMagicBytes(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  const last = haystack.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** 是否为 OOXML 办公格式（加密前后都按此类型渲染） */
export function isOoxmlType(type: string): boolean {
  return OOXML_ENCRYPTED_TYPES.has(type);
}

/**
 * 是否为 Office「加密文档」信封：OLE 复合文档且含 EncryptedPackage 流。
 * 不解析完整 CFB，只扫文件头魔数与目录里的流名称。
 */
export function sniffOleEncrypted(bytes: Uint8Array): boolean {
  if (!matchMagicBytes(bytes, MAGIC_NUMBER_MAP.oleCompound)) return false;
  return indexOfBytes(bytes, ENCRYPTED_PACKAGE_UTF16) !== -1;
}

const toUint8Array = (data: ArrayBuffer | Uint8Array): Uint8Array =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

/**
 * 业务侧：检测文件是否为 Office「加密文档」（xlsx / docx / pptx 密码保护）。
 * 只读文件头，不解密、不校验密码。
 *
 * @param data - 文件字节（`File` / `Blob` 请先 `arrayBuffer()`）
 * @returns 是否加密
 *
 * @example
 * ```ts
 * import { isOfficeFileEncrypted } from '@yss-ui/components/file-preview';
 * const encrypted = isOfficeFileEncrypted(await file.arrayBuffer());
 * ```
 */
export function isOfficeFileEncrypted(data: ArrayBuffer | Uint8Array): boolean {
  return sniffOleEncrypted(toUint8Array(data));
}

/** 密码错误 */
export class InvalidPasswordError extends Error {
  constructor(message = 'Invalid password') {
    super(message);
    this.name = 'InvalidPasswordError';
  }
}

/** 加密算法不受支持（如旧版 Standard Encryption、证书加密） */
export class UnsupportedEncryptionError extends Error {
  constructor(message = 'Unsupported encryption') {
    super(message);
    this.name = 'UnsupportedEncryptionError';
  }
}

type DecryptWorkbook = (input: Uint8Array, password: string) => Promise<Uint8Array>;

let decryptWorkbookLoader: Promise<DecryptWorkbook> | null = null;

const loadDecryptWorkbook = (): Promise<DecryptWorkbook> => {
  if (!decryptWorkbookLoader) {
    decryptWorkbookLoader = import('ooxml-encryption')
      .then(mod => {
        const fn = (mod as { decryptWorkbook?: DecryptWorkbook }).decryptWorkbook;
        if (typeof fn !== 'function') {
          throw new MissingDependencyError('ooxml-encryption');
        }
        return fn;
      })
      .catch(err => {
        decryptWorkbookLoader = null;
        if (err instanceof MissingDependencyError) throw err;
        throw new MissingDependencyError('ooxml-encryption', err);
      });
  }
  return decryptWorkbookLoader;
};

/**
 * 用密码解密 OOXML 加密文件，返回普通 zip 包字节（可直接当 xlsx/docx/pptx 预览）。
 *
 * @param data - 加密文件内容（OLE 信封）
 * @param password - 打开密码
 * @returns 解密后的 OOXML zip
 */
export async function decryptOoxmlPackage(data: ArrayBuffer | Uint8Array, password: string): Promise<ArrayBuffer> {
  const input = data instanceof Uint8Array ? data : new Uint8Array(data);
  const decryptWorkbook = await loadDecryptWorkbook();
  try {
    const unlocked = await decryptWorkbook(input, password);
    // 拷贝到独立 ArrayBuffer，避免 SharedArrayBuffer / 视图偏移问题
    return unlocked.buffer.slice(unlocked.byteOffset, unlocked.byteOffset + unlocked.byteLength) as ArrayBuffer;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    const name = (err as { name?: string } | null)?.name;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'invalidPassword' || /password/i.test(message)) {
      throw new InvalidPasswordError(message);
    }
    if (
      code === 'unsupportedEncryptionType' ||
      code === 'unsupportedAgileParameters' ||
      name === 'OoxmlEncryptionError'
    ) {
      throw new UnsupportedEncryptionError(message);
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * 业务侧：校验打开密码是否正确。
 * - 未加密：返回 `true`（无需密码即可打开）
 * - 加密且密码正确：返回 `true`
 * - 加密且密码错误 / 空密码：返回 `false`
 * - 加密算法不受支持或缺依赖：抛出对应错误（`UnsupportedEncryptionError` / `MissingDependencyError`）
 *
 * @param data - 文件字节
 * @param password - 待校验的打开密码
 * @returns 密码是否可用
 *
 * @example
 * ```ts
 * import { isOfficeFileEncrypted, verifyOfficeFilePassword } from '@yss-ui/components/file-preview';
 * const buf = await file.arrayBuffer();
 * if (isOfficeFileEncrypted(buf) && !(await verifyOfficeFilePassword(buf, pwd))) {
 *   message.error('密码错误');
 * }
 * ```
 */
export async function verifyOfficeFilePassword(
  data: ArrayBuffer | Uint8Array,
  password: string
): Promise<boolean> {
  const bytes = toUint8Array(data);
  if (!sniffOleEncrypted(bytes)) return true;
  const trimmed = password.trim();
  if (!trimmed) return false;
  try {
    await decryptOoxmlPackage(bytes, trimmed);
    return true;
  } catch (err) {
    if (err instanceof InvalidPasswordError) return false;
    throw err;
  }
}
