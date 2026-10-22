/**
 * 精简的 TIFF 解码器：把 PPT 里常见的 TIFF 图片解成 RGBA 像素，再由调用方转成 PNG 交给浏览器显示
 * （Chrome / Edge / Firefox 都不能直接显示 TIFF，只有 Safari 可以）。
 *
 * 支持范围（覆盖 Office、截图工具、扫描件导出的绝大多数 TIFF）：
 * - 压缩：无压缩、LZW、Deflate（用浏览器自带的 DecompressionStream）、PackBits、JPEG（交给浏览器解码 JPEG 分块）
 * - 颜色：黑白 / 灰度（1、2、4、8、16 位）、调色板（1、2、4、8 位）、RGB / RGBA（8、16 位）、CMYK（8 位）
 * - 条带（strip）与分块（tile）、交错与平面排列、水平差分预测（Predictor 2）
 * - 多页 TIFF 只取第一页
 *
 * 不支持时抛出 TiffUnsupportedError（调用方显示「图片格式暂不支持（TIFF）」占位），不会让整页失败。
 * pptx 子路径与 Excel 渲染器共用（不在 file-preview 主入口的 chunk 里）。
 */

export class TiffUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TiffUnsupportedError';
  }
}

export class TiffTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TiffTooLargeError';
  }
}

export interface DecodedTiff {
  width: number;
  height: number;
  /** RGBA，每像素 4 字节 */
  data: Uint8ClampedArray;
}

export interface TiffDecodeOptions {
  /** 最大像素数（宽 × 高），超过时抛出 TiffTooLargeError，默认 5000 万 */
  maxPixels?: number;
  /**
   * 解码 JPEG 压缩的分块（compression = 7），返回该分块的 RGBA 像素。
   * 浏览器里由调用方用 createImageBitmap + canvas 实现；不提供时 JPEG 压缩的 TIFF 视为不支持。
   */
  decodeJpeg?: (jpeg: Uint8Array) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}

/** 文件头是否为 TIFF（II*\0 或 MM\0*） */
export const isTiff = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 &&
  ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a));

const DEFAULT_MAX_PIXELS = 50_000_000;

const TAG = {
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planar: 284,
  predictor: 317,
  colorMap: 320,
  tileWidth: 322,
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  extraSamples: 338,
  sampleFormat: 339,
  jpegTables: 347,
} as const;

/** 各 TIFF 字段类型的字节数 */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

type Tags = Map<number, number[] | Uint8Array>;

const readIfd = (bytes: Uint8Array, view: DataView, little: boolean): Tags => {
  const offset = view.getUint32(4, little);
  if (offset + 2 > bytes.length) throw new TiffUnsupportedError('TIFF: bad IFD offset');
  const count = view.getUint16(offset, little);
  const tags: Tags = new Map();
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > bytes.length) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const n = view.getUint32(entry + 4, little);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    const total = size * n;
    const at = total <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    if (at + total > bytes.length) continue;
    if (type === 7 || type === 1 || type === 2) {
      // BYTE / ASCII / UNDEFINED：JPEGTables 需要原始字节
      tags.set(tag, tag === TAG.jpegTables ? bytes.subarray(at, at + total) : Array.from(bytes.subarray(at, at + total)));
      continue;
    }
    const values: number[] = [];
    for (let k = 0; k < n; k += 1) {
      const p = at + k * size;
      if (type === 3) values.push(view.getUint16(p, little));
      else if (type === 4) values.push(view.getUint32(p, little));
      else if (type === 8) values.push(view.getInt16(p, little));
      else if (type === 9) values.push(view.getInt32(p, little));
      else values.push(0);
    }
    tags.set(tag, values);
  }
  return tags;
};

const num = (tags: Tags, tag: number, fallback?: number): number => {
  const v = tags.get(tag);
  const first = v ? v[0] : undefined;
  if (first === undefined) {
    if (fallback === undefined) throw new TiffUnsupportedError(`TIFF: missing tag ${tag}`);
    return fallback;
  }
  return first;
};

const list = (tags: Tags, tag: number): number[] => {
  const v = tags.get(tag);
  return v ? Array.from(v) : [];
};

/** TIFF 的 LZW（MSB 优先、提前一位扩展码宽） */
export const decodeLzw = (input: Uint8Array, expected: number): Uint8Array => {
  const out = new Uint8Array(expected);
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i += 1) {
    prefix[i] = -1;
    suffix[i] = i;
    first[i] = i;
    length[i] = 1;
  }
  let next = 258;
  let width = 9;
  let old = -1;
  let op = 0;
  let bit = 0;
  const totalBits = input.length * 8;
  const write = (code: number) => {
    const len = length[code];
    let c = code;
    for (let i = len - 1; i >= 0; i -= 1) {
      if (op + i < expected) out[op + i] = suffix[c];
      c = prefix[c];
    }
    op += len;
  };
  const add = (p: number, ch: number) => {
    if (next >= 4096) return;
    prefix[next] = p;
    suffix[next] = ch;
    first[next] = first[p];
    length[next] = length[p] + 1;
    next += 1;
  };
  while (bit + width <= totalBits && op < expected) {
    const byte = bit >>> 3;
    const chunk = ((input[byte] << 16) | ((input[byte + 1] ?? 0) << 8) | (input[byte + 2] ?? 0)) >>> 0;
    const code = (chunk >>> (24 - (bit & 7) - width)) & ((1 << width) - 1);
    bit += width;
    if (code === 257) break;
    if (code === 256) {
      next = 258;
      width = 9;
      old = -1;
      continue;
    }
    if (old === -1) {
      if (code > 255) break;
      write(code);
      old = code;
      continue;
    }
    if (code < next) {
      write(code);
      add(old, first[code]);
    } else if (code === next) {
      add(old, first[old]);
      write(code);
    } else {
      break;
    }
    old = code;
    if (next + 1 >= 1 << width && width < 12) width += 1;
  }
  return out;
};

export const decodePackBits = (input: Uint8Array, expected: number): Uint8Array => {
  const out = new Uint8Array(expected);
  let ip = 0;
  let op = 0;
  while (ip < input.length && op < expected) {
    const n = (input[ip] << 24) >> 24;
    ip += 1;
    if (n >= 0) {
      const count = n + 1;
      out.set(input.subarray(ip, ip + Math.min(count, expected - op)), op);
      ip += count;
      op += count;
    } else if (n !== -128) {
      const count = 1 - n;
      out.fill(input[ip] ?? 0, op, Math.min(op + count, expected));
      ip += 1;
      op += count;
    }
  }
  return out;
};

const inflate = async (input: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') throw new TiffUnsupportedError('TIFF: deflate not available');
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** 把 JPEGTables（量化表 / 霍夫曼表）拼进分块的 JPEG 数据，得到浏览器能解码的完整 JPEG */
const withJpegTables = (chunk: Uint8Array, tables: Uint8Array | undefined): Uint8Array => {
  if (!tables || tables.length < 4) return chunk;
  // tables: SOI ... EOI；chunk: SOI ... EOI。结果：SOI + tables 中间部分 + chunk 去掉 SOI
  const middle = tables.subarray(2, tables[tables.length - 2] === 0xff && tables[tables.length - 1] === 0xd9 ? -2 : undefined);
  const out = new Uint8Array(2 + middle.length + chunk.length - 2);
  out.set([0xff, 0xd8], 0);
  out.set(middle, 2);
  out.set(chunk.subarray(2), 2 + middle.length);
  return out;
};

/** 解码第一页为 RGBA */
export async function decodeTiff(bytes: Uint8Array, options: TiffDecodeOptions = {}): Promise<DecodedTiff> {
  if (!isTiff(bytes)) throw new TiffUnsupportedError('TIFF: bad header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 0x49;
  const tags = readIfd(bytes, view, little);

  const width = num(tags, TAG.width);
  const height = num(tags, TAG.height);
  if (width <= 0 || height <= 0) throw new TiffUnsupportedError('TIFF: bad size');
  if (width * height > (options.maxPixels ?? DEFAULT_MAX_PIXELS)) throw new TiffTooLargeError('TIFF: too large');

  const compression = num(tags, TAG.compression, 1);
  const photometric = num(tags, TAG.photometric, 1);
  const spp = num(tags, TAG.samplesPerPixel, 1);
  const bpsList = list(tags, TAG.bitsPerSample);
  const bps = bpsList[0] ?? 1;
  const planar = num(tags, TAG.planar, 1);
  const predictor = num(tags, TAG.predictor, 1);
  const sampleFormat = num(tags, TAG.sampleFormat, 1);
  if (sampleFormat !== 1) throw new TiffUnsupportedError('TIFF: sample format');
  if (bpsList.some(b => b !== bps)) throw new TiffUnsupportedError('TIFF: mixed bits');
  if (![1, 2, 4, 8, 16].includes(bps)) throw new TiffUnsupportedError('TIFF: bits per sample');
  if (predictor !== 1 && predictor !== 2) throw new TiffUnsupportedError('TIFF: predictor');

  const tiled = tags.has(TAG.tileOffsets);
  const chunkW = tiled ? num(tags, TAG.tileWidth) : width;
  const chunkH = tiled ? num(tags, TAG.tileLength) : Math.min(num(tags, TAG.rowsPerStrip, height), height);
  const offsets = list(tags, tiled ? TAG.tileOffsets : TAG.stripOffsets);
  const counts = list(tags, tiled ? TAG.tileByteCounts : TAG.stripByteCounts);
  if (!offsets.length || chunkW <= 0 || chunkH <= 0) throw new TiffUnsupportedError('TIFF: no image data');

  const across = Math.ceil(width / chunkW);
  const down = Math.ceil(height / chunkH);
  const planes = planar === 2 ? spp : 1;
  const perPlane = across * down;
  if (offsets.length < perPlane * planes) throw new TiffUnsupportedError('TIFF: missing chunks');

  const rgba = new Uint8ClampedArray(width * height * 4);
  const extra = list(tags, TAG.extraSamples);
  const colorMap = list(tags, TAG.colorMap);
  const jpegTables = tags.get(TAG.jpegTables) as Uint8Array | undefined;

  if (compression === 7 || compression === 6) {
    if (compression === 6 || !options.decodeJpeg) throw new TiffUnsupportedError('TIFF: jpeg');
    for (let c = 0; c < perPlane; c += 1) {
      const raw = bytes.subarray(offsets[c], offsets[c] + (counts[c] ?? 0));
      const tile = await options.decodeJpeg(withJpegTables(raw, jpegTables));
      const x0 = (c % across) * chunkW;
      const y0 = Math.floor(c / across) * chunkH;
      for (let y = 0; y < Math.min(tile.height, height - y0); y += 1) {
        for (let x = 0; x < Math.min(tile.width, width - x0); x += 1) {
          const s = (y * tile.width + x) * 4;
          const d = ((y0 + y) * width + x0 + x) * 4;
          rgba[d] = tile.data[s];
          rgba[d + 1] = tile.data[s + 1];
          rgba[d + 2] = tile.data[s + 2];
          rgba[d + 3] = tile.data[s + 3];
        }
      }
    }
    return { width, height, data: rgba };
  }

  const decompress = async (raw: Uint8Array, expected: number): Promise<Uint8Array> => {
    switch (compression) {
      case 1:
        return raw;
      case 5:
        return decodeLzw(raw, expected);
      case 8:
      case 32946:
        return inflate(raw);
      case 32773:
        return decodePackBits(raw, expected);
      default:
        throw new TiffUnsupportedError(`TIFF: compression ${compression}`);
    }
  };

  // 颜色换算所需的每像素样本数
  const colorSamples = photometric === 2 ? 3 : photometric === 5 ? 4 : 1;
  if (![0, 1, 2, 3, 5].includes(photometric)) throw new TiffUnsupportedError(`TIFF: photometric ${photometric}`);
  if (spp < colorSamples) throw new TiffUnsupportedError('TIFF: samples');
  if (photometric === 5 && bps !== 8) throw new TiffUnsupportedError('TIFF: cmyk bits');
  const alphaIndex = spp > colorSamples && (extra[0] === 1 || extra[0] === 2) ? colorSamples : -1;
  const maxValue = (1 << bps) - 1;

  // 先把所有分块的样本解到平面缓冲里：samples[plane][y * width + x]（16 位只保留高 8 位）
  const samples = Array.from({ length: spp }, () => new Uint8Array(width * height));
  for (let plane = 0; plane < planes; plane += 1) {
    for (let c = 0; c < perPlane; c += 1) {
      const index = plane * perPlane + c;
      const raw = bytes.subarray(offsets[index], offsets[index] + (counts[index] ?? bytes.length));
      const sppInChunk = planes === 1 ? spp : 1;
      const rowBytes = Math.ceil((chunkW * sppInChunk * bps) / 8);
      const data = await decompress(raw, rowBytes * chunkH);
      const x0 = (c % across) * chunkW;
      const y0 = Math.floor(c / across) * chunkH;
      for (let y = 0; y < chunkH && y0 + y < height; y += 1) {
        const row = y * rowBytes;
        if (predictor === 2) {
          if (bps === 8) {
            for (let i = sppInChunk; i < chunkW * sppInChunk; i += 1) data[row + i] = (data[row + i] + data[row + i - sppInChunk]) & 0xff;
          } else if (bps === 16) {
            for (let i = sppInChunk; i < chunkW * sppInChunk; i += 1) {
              const p = row + i * 2;
              const q = row + (i - sppInChunk) * 2;
              const prev = little ? data[q] | (data[q + 1] << 8) : (data[q] << 8) | data[q + 1];
              const cur = ((little ? data[p] | (data[p + 1] << 8) : (data[p] << 8) | data[p + 1]) + prev) & 0xffff;
              if (little) {
                data[p] = cur & 0xff;
                data[p + 1] = cur >> 8;
              } else {
                data[p] = cur >> 8;
                data[p + 1] = cur & 0xff;
              }
            }
          }
        }
        for (let x = 0; x < chunkW && x0 + x < width; x += 1) {
          const target = (y0 + y) * width + x0 + x;
          for (let s = 0; s < sppInChunk; s += 1) {
            const sample = planes === 1 ? s : plane;
            const i = x * sppInChunk + s;
            let value: number;
            if (bps === 8) value = data[row + i];
            else if (bps === 16) value = data[row + i * 2 + (little ? 1 : 0)];
            else {
              const bitPos = i * bps;
              const byte = data[row + (bitPos >> 3)];
              const raw8 = (byte >> (8 - bps - (bitPos & 7))) & maxValue;
              // 调色板保留原始索引，其余按比例放大到 0~255
              value = photometric === 3 ? raw8 : Math.round((raw8 * 255) / maxValue);
            }
            samples[sample][target] = value ?? 0;
          }
        }
      }
    }
  }

  const pixels = width * height;
  for (let p = 0; p < pixels; p += 1) {
    const d = p * 4;
    if (photometric === 2) {
      rgba[d] = samples[0][p];
      rgba[d + 1] = samples[1][p];
      rgba[d + 2] = samples[2][p];
    } else if (photometric === 5) {
      const k = 255 - samples[3][p];
      rgba[d] = ((255 - samples[0][p]) * k) / 255;
      rgba[d + 1] = ((255 - samples[1][p]) * k) / 255;
      rgba[d + 2] = ((255 - samples[2][p]) * k) / 255;
    } else if (photometric === 3) {
      const entries = colorMap.length / 3;
      const idx = samples[0][p];
      if (!entries || idx >= entries) throw new TiffUnsupportedError('TIFF: color map');
      rgba[d] = colorMap[idx] >> 8;
      rgba[d + 1] = colorMap[entries + idx] >> 8;
      rgba[d + 2] = colorMap[entries * 2 + idx] >> 8;
    } else {
      const v = photometric === 0 ? 255 - samples[0][p] : samples[0][p];
      rgba[d] = v;
      rgba[d + 1] = v;
      rgba[d + 2] = v;
    }
    rgba[d + 3] = alphaIndex >= 0 ? samples[alphaIndex][p] : 255;
  }
  return { width, height, data: rgba };
}
