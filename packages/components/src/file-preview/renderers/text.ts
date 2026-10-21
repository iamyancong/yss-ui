/**
 * 文本（.txt / .md，以及 CSV 的源文本视图）渲染器。
 * 编码只在开头采样判定一次，大文件用流式 TextDecoder 分段追加，避免多字节字符被切断后乱码。
 */
import { formatFileSize, TEXT_CHUNK_SIZE, TEXT_ENCODING_PROBE_SIZE, TEXT_LARGE_FILE_THRESHOLD } from '../constant';
import type { TextEncoding } from '../types';
import type { PreviewRenderer } from './types';

/** 实际使用的解码器编码 */
export type ResolvedTextEncoding = 'utf-8' | 'gbk' | 'utf-16le' | 'utf-16be';

/** 当前环境是否支持该编码 */
export function isEncodingSupported(encoding: string): boolean {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判定文本编码。
 * - 显式 utf-8 / gbk 直接使用（环境不支持 GBK 时退回 UTF-8）
 * - auto：先看 BOM，再看是否为没有 BOM 的 UTF-16（以西文为主的文本，一半字节是 0），
 *   再用 UTF-8 严格模式解码开头采样，失败则使用 GBK
 */
export function detectTextEncoding(bytes: Uint8Array, preferred: TextEncoding = 'auto'): ResolvedTextEncoding {
  const gbkOrUtf8: ResolvedTextEncoding = isEncodingSupported('gbk') ? 'gbk' : 'utf-8';
  if (preferred === 'utf-8') return 'utf-8';
  if (preferred === 'gbk') return gbkOrUtf8;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const utf16 = guessBomlessUtf16(bytes.subarray(0, TEXT_ENCODING_PROBE_SIZE));
  if (utf16) return utf16;

  try {
    // stream: true 时末尾被截断的多字节字符不会报错，只有真正非法的字节序列才会抛出
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, TEXT_ENCODING_PROBE_SIZE), { stream: true });
    return 'utf-8';
  } catch {
    return gbkOrUtf8;
  }
}

/**
 * 没有 BOM 的 UTF-16：西文字符的高字节是 0，0 集中出现在奇数位（LE）或偶数位（BE）。
 * 以中文为主的 UTF-16 没有这个特征，识别不了（会按 GBK / UTF-8 显示）。
 */
function guessBomlessUtf16(sample: Uint8Array): ResolvedTextEncoding | null {
  const pairs = Math.floor(sample.length / 2);
  if (pairs < 4) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i + 1 < sample.length; i += 2) {
    if (sample[i] === 0) evenZero++;
    if (sample[i + 1] === 0) oddZero++;
  }
  if (oddZero >= pairs * 0.3 && evenZero <= pairs * 0.05) return 'utf-16le';
  if (evenZero >= pairs * 0.3 && oddZero <= pairs * 0.05) return 'utf-16be';
  return null;
}

/** 一次性解码整个文本 */
export function decodeTextBuffer(buffer: ArrayBuffer | Uint8Array, preferred: TextEncoding = 'auto'): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new TextDecoder(detectTextEncoding(bytes, preferred)).decode(bytes);
}

/** 分段读取器：每次 next() 返回下一段文本，跨段的多字节字符由流式解码器拼接 */
export interface ChunkedTextReader {
  readonly encoding: ResolvedTextEncoding;
  readonly total: number;
  readonly loaded: number;
  readonly done: boolean;
  next(size?: number): string;
}

export function createChunkedTextReader(
  buffer: ArrayBuffer | Uint8Array,
  preferred: TextEncoding = 'auto',
  chunkSize = TEXT_CHUNK_SIZE
): ChunkedTextReader {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const encoding = detectTextEncoding(bytes, preferred);
  const decoder = new TextDecoder(encoding);
  let offset = 0;
  return {
    encoding,
    total: bytes.byteLength,
    get loaded() {
      return offset;
    },
    get done() {
      return offset >= bytes.byteLength;
    },
    next(size = chunkSize) {
      if (offset >= bytes.byteLength) return '';
      const end = Math.min(offset + size, bytes.byteLength);
      const chunk = bytes.subarray(offset, end);
      offset = end;
      return decoder.decode(chunk, { stream: offset < bytes.byteLength });
    },
  };
}

export const textRenderer: PreviewRenderer = {
  types: ['txt', 'md'],
  create() {
    let wrapper: HTMLElement | null = null;
    let cleanupListener: (() => void) | null = null;
    return {
      async render(container, data, context) {
        const reader = createChunkedTextReader(data, context.textEncoding);
        const isLarge = reader.total > TEXT_LARGE_FILE_THRESHOLD;

        wrapper = document.createElement('div');
        wrapper.className = 'yss-file-preview-text';
        const pre = document.createElement('pre');
        pre.className = 'yss-file-preview-text__content';
        pre.append(document.createTextNode(isLarge ? reader.next() : reader.next(reader.total)));
        wrapper.appendChild(pre);

        if (isLarge) {
          const bar = document.createElement('div');
          bar.className = 'yss-file-preview-text__more';
          const tip = document.createElement('span');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'yss-file-preview-text__more-btn';
          button.textContent = context.t('loadMore');
          const updateTip = () => {
            tip.textContent = context.t('textPartial', {
              loaded: formatFileSize(reader.loaded),
              total: formatFileSize(reader.total),
            });
          };
          const onClick = () => {
            pre.append(document.createTextNode(reader.next()));
            updateTip();
            if (reader.done) {
              cleanupListener?.();
              bar.remove();
            }
          };
          button.addEventListener('click', onClick);
          cleanupListener = () => {
            button.removeEventListener('click', onClick);
            cleanupListener = null;
          };
          updateTip();
          bar.append(tip, button);
          wrapper.appendChild(bar);
        }

        container.appendChild(wrapper);
      },
      destroy() {
        cleanupListener?.();
        wrapper?.remove();
        wrapper = null;
      },
    };
  },
};

export default textRenderer;
