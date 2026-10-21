/**
 * 文件类型识别：后缀 / 显式类型 + MIME + 文件头 + zip 内容嗅探。
 */
import {
  EXTENSION_TYPE_MAP,
  IMAGE_FILE_TYPES,
  MAGIC_NUMBER_MAP,
  MIME_TYPE_MAP,
  SVG_SNIFF_RANGE,
  TEXT_FILE_TYPES,
  ZIP_SNIFF_RANGE,
} from '../constant';
import type { FileType, ImageFileType } from '../types';

/** 类型识别结果 */
export interface DetectResult {
  /** 最终用于渲染的文件类型，null 表示不支持或无法识别 */
  type: FileType | null;
  /** 后缀或显式声明的类型（可能是 doc、ppt 等不支持的类型） */
  expectedType: string | null;
  /** 文件内容与声明类型不一致 */
  mismatch: boolean;
  /** 0 字节文件 */
  isEmpty: boolean;
  /** 不能预览的原因 */
  reason?: 'EMPTY_FILE' | 'TYPE_MISMATCH' | 'UNSUPPORTED_TYPE';
}

/** 文件头签名 */
interface ByteSignature {
  isZip: boolean;
  isPdf: boolean;
  isOle: boolean;
  zipKind: ZipKind | null;
  /** 按文件头（SVG 按文本内容）识别出的图片类型 */
  imageKind: ImageFileType | null;
}

/** zip 容器里能区分出的 Office 类型 */
export type ZipKind = 'docx' | 'xlsx' | 'pptx';

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

const WORD_ENTRY = new TextEncoder().encode('word/');
const EXCEL_ENTRY = new TextEncoder().encode('xl/');
const POWERPOINT_ENTRY = new TextEncoder().encode('ppt/');

/**
 * 根据 zip 内的条目名区分 docx、xlsx 与 pptx。
 * zip 的本地文件头和尾部中央目录都以明文保存条目名，只扫描头尾即可。
 */
export function sniffZipKind(bytes: Uint8Array): ZipKind | null {
  const head = bytes.subarray(0, Math.min(bytes.length, ZIP_SNIFF_RANGE));
  const tail = bytes.subarray(Math.max(0, bytes.length - ZIP_SNIFF_RANGE));
  for (const part of [head, tail]) {
    if (indexOfBytes(part, WORD_ENTRY) !== -1) return 'docx';
    if (indexOfBytes(part, EXCEL_ENTRY) !== -1) return 'xlsx';
    if (indexOfBytes(part, POWERPOINT_ENTRY) !== -1) return 'pptx';
  }
  return null;
}

/** 根元素前允许出现的内容：XML 声明、注释、DOCTYPE */
const SVG_ROOT_PATTERN = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

/** 文本内容是否为 SVG：去掉 BOM 后，根元素是 <svg> */
export function sniffSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, Math.min(bytes.length, SVG_SNIFF_RANGE)));
  return SVG_ROOT_PATTERN.test(head.replace(/^\uFEFF/, ''));
}

/** BMP 只有 `BM` 两个字节太弱（文本也可能以 BM 开头），再校验保留字为 0 和 DIB 头长度 */
const BMP_DIB_HEADER_SIZES = [12, 40, 52, 56, 64, 108, 124];
function isBmp(bytes: Uint8Array): boolean {
  if (!matchMagicBytes(bytes, MAGIC_NUMBER_MAP.bmp) || bytes.length < 18) return false;
  const reservedZero = bytes[6] === 0 && bytes[7] === 0 && bytes[8] === 0 && bytes[9] === 0;
  const dibSize = bytes[14]! | (bytes[15]! << 8) | (bytes[16]! << 16) | (bytes[17]! << 24);
  return reservedZero && BMP_DIB_HEADER_SIZES.includes(dibSize);
}

/** 根据文件头识别图片类型；SVG 是文本，按内容识别 */
export function sniffImageKind(bytes: Uint8Array): ImageFileType | null {
  if (matchMagicBytes(bytes, MAGIC_NUMBER_MAP.png)) return 'png';
  if (matchMagicBytes(bytes, MAGIC_NUMBER_MAP.jpg)) return 'jpg';
  // GIF87a / GIF89a
  if (matchMagicBytes(bytes, MAGIC_NUMBER_MAP.gif) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return 'gif';
  }
  if (matchMagicBytes(bytes, MAGIC_NUMBER_MAP.riff) && matchMagicBytes(bytes.subarray(8), MAGIC_NUMBER_MAP.webp)) {
    return 'webp';
  }
  if (isBmp(bytes)) return 'bmp';
  // ICO：保留字 0、类型 1、图标数量 > 0
  if (matchMagicBytes(bytes, MAGIC_NUMBER_MAP.ico) && bytes.length >= 6 && (bytes[4]! | (bytes[5]! << 8)) > 0) {
    return 'ico';
  }
  if (sniffSvg(bytes)) return 'svg';
  return null;
}

const isImageType = (type: string): type is ImageFileType => (IMAGE_FILE_TYPES as readonly string[]).includes(type);

function readSignature(bytes: Uint8Array): ByteSignature {
  const isZip = matchMagicBytes(bytes, MAGIC_NUMBER_MAP.zip) || matchMagicBytes(bytes, MAGIC_NUMBER_MAP.zipEmpty);
  const isPdf = matchMagicBytes(bytes, MAGIC_NUMBER_MAP.pdf);
  const isOle = matchMagicBytes(bytes, MAGIC_NUMBER_MAP.oleCompound);
  return {
    isZip,
    isPdf,
    isOle,
    zipKind: isZip ? sniffZipKind(bytes) : null,
    imageKind: isZip || isPdf || isOle ? null : sniffImageKind(bytes),
  };
}

/** 文件内容是否与类型一致 */
function contentMatches(type: FileType, sig: ByteSignature): boolean {
  switch (type) {
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return sig.isZip && (sig.zipKind === null || sig.zipKind === type);
    case 'xls':
      // 部分系统导出的 .xls 实际是 xlsx（zip）格式，Excel 渲染器同样能处理
      return sig.isOle || (sig.isZip && sig.zipKind !== 'docx' && sig.zipKind !== 'pptx');
    case 'pdf':
      return sig.isPdf;
    default:
      // 图片：内容是任意一种图片即可（常见 .jpg 实际是 PNG），渲染时按实际内容决定 MIME
      if (isImageType(type)) return sig.imageKind !== null;
      // 文本类：不能是常见二进制容器或二进制图片（SVG 本身是文本，可以按文本查看）
      return !sig.isZip && !sig.isPdf && !sig.isOle && (sig.imageKind === null || sig.imageKind === 'svg');
  }
}

/** 从文件名或 URL 中提取小写后缀 */
export function extractExtension(filePathOrName?: string): string {
  if (!filePathOrName) return '';
  const cleanPath = filePathOrName.split(/[?#]/)[0] ?? '';
  const lastSegment = cleanPath.split(/[/\\]/).pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return '';
  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

/**
 * 校验文件头是否与预期类型一致。
 *
 * @returns verifiable 为 false 表示该类型无法通过文件头校验（例如文本）
 */
export function verifyMagicHeader(bytes: Uint8Array, expectedType: string): { matched: boolean; verifiable: boolean } {
  const type = EXTENSION_TYPE_MAP[expectedType];
  if (!type || TEXT_FILE_TYPES.includes(type)) {
    return { matched: true, verifiable: false };
  }
  return { matched: contentMatches(type, readSignature(bytes)), verifiable: true };
}

/**
 * 综合识别文件类型。
 *
 * @param fileName 文件名或 URL
 * @param mimeType MIME 类型
 * @param buffer 文件内容
 * @param explicitType 调用方显式声明的类型
 */
export function detectFileType(
  fileName?: string,
  mimeType?: string,
  buffer?: ArrayBuffer | Uint8Array,
  explicitType?: string
): DetectResult {
  const bytes = buffer instanceof Uint8Array ? buffer : buffer ? new Uint8Array(buffer) : undefined;
  const ext = extractExtension(fileName);
  const declared = explicitType?.toLowerCase() || (ext ? (EXTENSION_TYPE_MAP[ext] ?? ext) : null);

  if (bytes && bytes.byteLength === 0) {
    return { type: null, expectedType: declared, mismatch: false, isEmpty: true, reason: 'EMPTY_FILE' };
  }

  const sig = bytes ? readSignature(bytes) : null;
  const mismatch = (expectedType: string): DetectResult => ({
    type: null,
    expectedType,
    mismatch: true,
    isEmpty: false,
    reason: 'TYPE_MISMATCH',
  });
  const accept = (type: FileType, expectedType: string | null = type): DetectResult => ({
    type,
    expectedType,
    mismatch: false,
    isEmpty: false,
  });
  const unsupported = (expectedType: string | null): DetectResult => ({
    type: null,
    expectedType,
    mismatch: false,
    isEmpty: false,
    reason: 'UNSUPPORTED_TYPE',
  });

  // 1. 有后缀或显式类型
  if (declared) {
    const supportedType = EXTENSION_TYPE_MAP[declared];
    if (!supportedType) return unsupported(declared);
    if (sig && !contentMatches(supportedType, sig)) return mismatch(declared);
    return accept(supportedType, declared);
  }

  // 2. 没有后缀：先看文件内容
  if (sig) {
    if (sig.isPdf) return accept('pdf', null);
    if (sig.zipKind) return accept(sig.zipKind, null);
    if (sig.imageKind) return accept(sig.imageKind, null);
  }

  // 3. 再看 MIME
  const cleanMime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const mimeTypeMatched = MIME_TYPE_MAP[cleanMime];
  if (mimeTypeMatched) {
    if (sig && !contentMatches(mimeTypeMatched, sig)) return mismatch(mimeTypeMatched);
    return accept(mimeTypeMatched, mimeTypeMatched);
  }

  return unsupported(null);
}
