/**
 * Windows 图元文件（EMF / WMF）的识别与转换。
 *
 * 浏览器不能直接显示 EMF / WMF。@aiden0z/pptx-renderer 只能显示「内嵌位图」的 EMF（取出其中的位图），
 * 内嵌 PDF 的 EMF 需要 pdf.js，纯矢量 EMF 与所有 WMF 都显示不出来。
 * 本模块：
 * - classifyEmf：判断一个 EMF 能否交给库显示（内嵌 24 / 32 位位图）
 * - convertMetafile：业务项目通过 `loadMetafile` 提供 rtf.js 的 EMFJS / WMFJS 时，把 EMF / WMF 转成 SVG
 *
 * pptx 子路径与 Excel 渲染器共用（不在 file-preview 主入口的 chunk 里）。
 */

/** EMFJS / WMFJS 的 Renderer（rtf.js，MIT）。只声明用到的部分 */
export interface MetafileRendererModule {
  Renderer: new (data: ArrayBuffer) => { render(info: Record<string, unknown>): SVGElement };
}

/**
 * 按需加载图元文件渲染器，format 为 'emf' 或 'wmf'。返回含 `Renderer` 的模块即可，例如
 * `format => format === 'emf' ? import('rtf.js/dist/EMFJS.bundle.min.js') : import('rtf.js/dist/WMFJS.bundle.min.js')`
 */
export type MetafileLoader = (format: 'emf' | 'wmf') => Promise<unknown>;

const EMF_SIGNATURE = 0x464d4520; // ' EMF'
const EMR_EOF = 14;
const EMR_COMMENT = 70;
const EMR_STRETCHDIBITS = 81;

export const isEmf = (bytes: Uint8Array): boolean => {
  if (bytes.length < 88) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === 1 && view.getUint32(40, true) === EMF_SIGNATURE;
};

/** 可放置（Aldus placeable）WMF：D7 CD C6 9A；标准 WMF：类型 1 / 2，头长 9 个字 */
export const isWmf = (bytes: Uint8Array): boolean => {
  if (bytes.length < 18) return false;
  if (bytes[0] === 0xd7 && bytes[1] === 0xcd && bytes[2] === 0xc6 && bytes[3] === 0x9a) return true;
  return (bytes[0] === 1 || bytes[0] === 2) && bytes[1] === 0 && bytes[2] === 9 && bytes[3] === 0;
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

const containsPdf = (bytes: Uint8Array, start: number, end: number) => {
  for (let i = start; i + 4 <= end; i += 1) {
    if (PDF_MAGIC.every((b, k) => bytes[i + k] === b)) return true;
  }
  return false;
};

/**
 * EMF 的显示方式：
 * - 'bitmap'：内嵌 24 / 32 位未压缩位图，库能取出位图显示
 * - 'pdf'：内嵌 PDF（库需要 pdf.js，本组件不提供），视为不能显示
 * - 'vector'：纯矢量，库不能显示
 * 与库的判断顺序一致：先遇到的记录决定结果。
 */
export const classifyEmf = (bytes: Uint8Array): 'bitmap' | 'pdf' | 'vector' => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const type = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > bytes.length || type === EMR_EOF) break;
    if (type === EMR_COMMENT && size > 16 && containsPdf(bytes, offset + 8, offset + size)) return 'pdf';
    if (type === EMR_STRETCHDIBITS && size > 80) {
      const offBmi = view.getUint32(offset + 48, true);
      const cbBmi = view.getUint32(offset + 52, true);
      const cbBits = view.getUint32(offset + 60, true);
      const header = offset + offBmi;
      if (cbBmi && cbBits && header + 40 <= bytes.length) {
        const w = Math.abs(view.getInt32(header + 4, true));
        const h = Math.abs(view.getInt32(header + 8, true));
        const bits = view.getUint16(header + 14, true);
        const compression = view.getUint32(header + 16, true);
        if (compression === 0 && (bits === 24 || bits === 32) && w > 0 && h > 0 && w <= 8192 && h <= 8192 && w * h <= 16777216)
          return 'bitmap';
      }
    }
    offset += size;
  }
  return 'vector';
};

/** EMF 头里的设备单位边界（bounds），用于设置 SVG 尺寸 */
const emfSize = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const left = view.getInt32(8, true);
  const top = view.getInt32(12, true);
  const right = view.getInt32(16, true);
  const bottom = view.getInt32(20, true);
  return { width: Math.max(1, right - left + 1), height: Math.max(1, bottom - top + 1) };
};

/** 可放置 WMF 头里的边界；标准 WMF 没有尺寸信息，按 1000 × 1000 逻辑单位 */
const wmfSize = (bytes: Uint8Array) => {
  if (bytes[0] !== 0xd7) return { width: 1000, height: 1000 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const left = view.getInt16(6, true);
  const top = view.getInt16(8, true);
  const right = view.getInt16(10, true);
  const bottom = view.getInt16(12, true);
  return { width: Math.max(1, Math.abs(right - left)), height: Math.max(1, Math.abs(bottom - top)) };
};

const resolveRenderer = (mod: unknown, format: 'emf' | 'wmf'): MetafileRendererModule['Renderer'] | null => {
  const candidates: unknown[] = [mod];
  const m = mod as Record<string, any> | null;
  if (m) candidates.push(m.default, m[format.toUpperCase() + 'JS'], m.default?.[format.toUpperCase() + 'JS']);
  for (const c of candidates) {
    const renderer = (c as { Renderer?: unknown } | null | undefined)?.Renderer;
    if (typeof renderer === 'function') return renderer as MetafileRendererModule['Renderer'];
  }
  return null;
};

/** 用 EMFJS / WMFJS 把图元文件转成 SVG 文本；失败抛错（调用方改用占位） */
export async function convertMetafile(
  bytes: Uint8Array,
  format: 'emf' | 'wmf',
  load: MetafileLoader
): Promise<string> {
  const Renderer = resolveRenderer(await load(format), format);
  if (!Renderer) throw new Error(`metafile renderer for ${format} not found`);
  const { width, height } = format === 'emf' ? emfSize(bytes) : wmfSize(bytes);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const svg = new Renderer(buffer).render({
    width: `${width}px`,
    height: `${height}px`,
    wExt: width,
    hExt: height,
    xExt: width,
    yExt: height,
    // MM_ANISOTROPIC：按给定尺寸缩放
    mapMode: 8,
  });
  if (!svg || typeof (svg as { outerHTML?: unknown }).outerHTML !== 'string') throw new Error('metafile render failed');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  // <img> 按 pic 的尺寸拉伸显示，与 PowerPoint 一致
  svg.setAttribute('preserveAspectRatio', 'none');
  const text = new XMLSerializer().serializeToString(svg);
  if (!/<(?:svg:)?(?:path|rect|ellipse|polygon|polyline|line|text|image|g)\b/.test(text))
    throw new Error('metafile rendered nothing');
  return text;
}
