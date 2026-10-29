/**
 * 只读的精简 zip 解析：按中央目录读取指定条目，用浏览器自带的 DecompressionStream 解压。
 *
 * 只给 Excel 渲染器读取 xlsx 里的几个 XML（工作簿、样式、共享字符串、工作表），
 * 不引入额外依赖。不支持加密与 zip64（xlsx 不会用到）。
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  crc: number;
  flags: number;
}

const utf8 = new TextDecoder('utf-8');

/** 读取中央目录；不是 zip 时返回 null */
export function listZipEntries(data: ArrayBuffer): Map<string, ZipEntry> | null {
  const view = new DataView(data);
  const len = data.byteLength;
  if (len < 22) return null;
  // EOCD 在末尾，后面可能跟最多 65535 字节的注释
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const bytes = new Uint8Array(data);
  for (let i = 0; i < count; i++) {
    if (offset + 46 > len || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return entries;
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name.replace(/^\/+/, ''), { name, method, compressedSize, size, localOffset, crc, flags });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** 单个条目解压后的上限（防 zip 炸弹；正常的工作表 XML、图表、图片远小于此） */
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

/** 边解压边计数：超过 max 立即中止并返回 null，不会先把整个条目解压到内存 */
async function inflateRaw(input: Uint8Array, max: number, head = false): Promise<Uint8Array | null> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (head && total >= max) {
        chunks.push(value);
        await reader.cancel().catch(() => undefined);
        break;
      }
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * 解压一个条目；不支持的压缩方式、损坏的数据、或解压结果超过目录里声明的大小（声明不可信时以 MAX_ENTRY_BYTES 为上限）时返回 null
 */
export async function readZipEntry(data: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array | null> {
  const view = new DataView(data);
  const at = entry.localOffset;
  if (at + 30 > data.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) return null;
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = new Uint8Array(data, start, Math.min(entry.compressedSize, data.byteLength - start));
  if (entry.method === 0) return raw;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;
  // 目录里声明的解压大小（未声明时按上限）；实际解压结果不应超过它
  const declared = entry.size > 0 && entry.size !== 0xffffffff ? entry.size : MAX_ENTRY_BYTES;
  return inflateRaw(raw, Math.min(declared, MAX_ENTRY_BYTES));
}

/**
 * 只解压条目开头的约 bytes 字节（够读到工作表 XML 开头的 <dimension>），不解压整个条目；读不了时返回 null
 */
export async function readZipEntryHead(data: ArrayBuffer, entry: ZipEntry, bytes: number): Promise<Uint8Array | null> {
  const view = new DataView(data);
  const at = entry.localOffset;
  if (at + 30 > data.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) return null;
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = new Uint8Array(data, start, Math.max(0, Math.min(entry.compressedSize, data.byteLength - start)));
  if (entry.method === 0) return raw.subarray(0, bytes);
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;
  const out = await inflateRaw(raw, bytes, true);
  return out ? out.subarray(0, bytes) : null;
}

/**
 * 边解压边把数据交给 visit，不保留解压结果（只扫描、计数）；visit 返回 false 时提前结束。
 * 不能解压时返回 false
 */
export async function scanZipEntry(
  data: ArrayBuffer,
  entry: ZipEntry,
  visit: (chunk: Uint8Array) => boolean | void
): Promise<boolean> {
  const view = new DataView(data);
  const at = entry.localOffset;
  if (at + 30 > data.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) return false;
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = new Uint8Array(data, start, Math.max(0, Math.min(entry.compressedSize, data.byteLength - start)));
  if (entry.method === 0) {
    visit(raw);
    return true;
  }
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return false;
  const reader = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return true;
      total += value.byteLength;
      if (total > MAX_ENTRY_BYTES || visit(value) === false) {
        await reader.cancel().catch(() => undefined);
        return true;
      }
    }
  } catch {
    return false;
  }
}

/** 读取条目为 UTF-8 文本；不存在或无法解压时返回 null */
export async function readZipText(
  data: ArrayBuffer,
  entries: Map<string, ZipEntry>,
  path: string
): Promise<string | null> {
  const entry = entries.get(path);
  if (!entry) return null;
  const bytes = await readZipEntry(data, entry);
  return bytes ? utf8.decode(bytes) : null;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 复制一份 zip，替换其中几个条目的内容（替换的条目不压缩存储，其余条目原样复制压缩数据）。
 * 读取失败时返回 null。
 */
export function replaceZipEntries(data: ArrayBuffer, entries: Map<string, ZipEntry>, replacements: Map<string, Uint8Array>): ArrayBuffer | null {
  const src = new Uint8Array(data);
  const view = new DataView(data);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, entry] of entries) {
    const at = entry.localOffset;
    if (at + 30 > data.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) return null;
    const replacement = replacements.get(path);
    let body: Uint8Array;
    let method = entry.method;
    let crc = entry.crc;
    let size = entry.size;
    if (replacement) {
      body = replacement;
      method = 0;
      crc = crc32(replacement);
      size = replacement.length;
    } else {
      const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
      if (start + entry.compressedSize > data.byteLength) return null;
      body = src.subarray(start, start + entry.compressedSize);
    }
    const name = encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIGNATURE, true);
    lv.setUint16(4, 20, true);
    // 去掉「数据描述符」标志：大小与 CRC 直接写在头里
    lv.setUint16(6, (entry.flags & ~0x0008) | 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, CENTRAL_SIGNATURE, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, (entry.flags & ~0x0008) | 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIGNATURE, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out.buffer;
}

/** 生成不压缩的 zip（只用于很小的文件） */
export function createStoredZip(files: Array<[name: string, content: string]>): ArrayBuffer {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of files) {
    const body = encoder.encode(content);
    const name = encoder.encode(path);
    const crc = crc32(body);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIGNATURE, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, body.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, CENTRAL_SIGNATURE, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, body.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIGNATURE, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out.buffer;
}
