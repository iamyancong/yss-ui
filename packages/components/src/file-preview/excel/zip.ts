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
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name.replace(/^\/+/, ''), { name, method, compressedSize, size, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 解压一个条目；不支持的压缩方式返回 null */
export async function readZipEntry(data: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array | null> {
  const view = new DataView(data);
  const at = entry.localOffset;
  if (at + 30 > data.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) return null;
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = new Uint8Array(data, start, Math.min(entry.compressedSize, data.byteLength - start));
  if (entry.method === 0) return raw;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;
  return inflateRaw(raw);
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
