/**
 * pptx 图片预处理：在交给 @aiden0z/pptx-renderer 渲染之前，把浏览器显示不了的图片换成能显示的数据。
 *
 * 背景：库按扩展名把图片包成 blob URL 交给 <img>。Chrome / Edge / Firefox 不能解码 TIFF、EMF、WMF，
 * 于是页面上出现裂图；缺失的图片与外部链接图片则显示英文提示。这里统一处理整类问题：
 *
 * | 情况 | 处理 |
 * | --- | --- |
 * | TIFF | 本地解码（./tiff）后转 PNG |
 * | EMF / WMF | 提供 `loadMetafile`（rtf.js）时转 SVG；未提供时：内嵌位图的 EMF 仍交给库，其余显示「图片格式暂不支持（EMF）」 |
 * | 扩展名与内容不符（如 .png 里是 JPEG、.xml 里是 SVG） | 按真实格式改名 |
 * | 其他浏览器不支持的格式（WDP、PICT、EPS…） | 「图片格式暂不支持（XXX）」 |
 * | 图片文件缺失、关系缺失 | 「图片缺失」 |
 * | 外部链接图片（不自动请求第三方地址） | 「外部链接图片未加载」 |
 * | 像素数超过上限 | 「图片过大，未显示」 |
 * | 空文件 / 数据损坏 | 「图片无法显示」 |
 *
 * 替换方式：新数据以新路径（如 `image3.tiff.png`）放进 files.media，再改写引用它的 .rels 里的 Target；
 * 原文件保留不动。只处理被图片关系（relationships/image）引用的媒体，视频、音频不受影响。
 *
 * 只能被 pptx 子路径使用。
 */
import { classifyEmf, convertMetafile, type MetafileLoader } from './metafile';
import { DEFAULT_MAX_IMAGE_PIXELS, detectImageFormat, imageDimensions, NATIVE_IMAGE_FORMATS as NATIVE, type ImageFormat } from '../shared/image-format';

export { DEFAULT_MAX_IMAGE_PIXELS, detectImageFormat, imageDimensions, type ImageFormat };
import { placeholderSvg, type MediaIssue, type MediaPlaceholder } from './placeholder';
import { decodeTiff, TiffTooLargeError, type DecodedTiff } from './tiff';

/** parseZip 结果中用到的部分 */
export interface PptxZipFiles {
  media?: Map<string, Uint8Array>;
  slides?: Map<string, string>;
  slideLayouts?: Map<string, string>;
  slideMasters?: Map<string, string>;
  [key: string]: unknown;
}

/** 库按扩展名推断的格式（与 @aiden0z/pptx-renderer 的扩展名 → MIME 表一致） */
const EXTENSION_FORMAT: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  gif: 'gif',
  svg: 'svg',
  bmp: 'bmp',
  webp: 'webp',
  tif: 'tiff',
  tiff: 'tiff',
  emf: 'emf',
  wmf: 'wmf',
};

const IMAGE_REL = /\/relationships\/image$/;
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** 规范化路径：处理 . 与 .. */
const normalize = (path: string) => {
  const out: string[] = [];
  path.split('/').forEach(part => {
    if (!part || part === '.') return;
    if (part === '..') out.pop();
    else out.push(part);
  });
  return out.join('/');
};

/** 关系文件 a/_rels/b.xml.rels → 所属部件所在目录 a */
const relsSourceDir = (relsPath: string) => dirname(dirname(relsPath));

const resolveTarget = (relsPath: string, target: string) => {
  const clean = decodeURIComponent(target.split('#')[0]);
  return clean.startsWith('/') ? normalize(clean) : normalize(`${relsSourceDir(relsPath)}/${clean}`);
};

/** 从目录 fromDir 指向 toPath 的相对路径 */
const relativePath = (fromDir: string, toPath: string) => {
  const from = fromDir.split('/').filter(Boolean);
  const to = toPath.split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
};

const RELATIONSHIP = /<Relationship\b[^>]*?\/?>/g;
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
const attrValue = (tag: string, name: string) => {
  const m = attr(tag, name);
  return m ? (m[2] ?? m[3] ?? '') : undefined;
};
const setAttr = (tag: string, name: string, value: string) => {
  const m = attr(tag, name);
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return m ? tag.replace(m[0], ` ${name}="${escaped}"`) : tag.replace(/\s*\/?>$/, ` ${name}="${escaped}"/>`);
};
const removeAttr = (tag: string, name: string) => {
  const m = attr(tag, name);
  return m ? tag.replace(m[0], '') : tag;
};

export interface NormalizeMediaOptions {
  /** 占位说明文字（已本地化） */
  label: (issue: MediaIssue, format?: string) => string;
  /** 转换 EMF / WMF 的渲染器（rtf.js），不提供时按「暂不支持」处理（内嵌位图的 EMF 除外） */
  loadMetafile?: MetafileLoader;
  /** 像素上限，默认 DEFAULT_MAX_IMAGE_PIXELS */
  maxImagePixels?: number;
  /** RGBA → PNG 字节。默认用 canvas；测试或无 DOM 环境可替换 */
  encodePng?: (image: DecodedTiff) => Promise<Uint8Array>;
  /** 解码 JPEG 字节为 RGBA（JPEG 压缩的 TIFF 使用）。默认用 createImageBitmap + canvas */
  decodeJpeg?: (jpeg: Uint8Array) => Promise<DecodedTiff>;
  signal?: AbortSignal;
}

export interface NormalizeMediaResult {
  /** 占位图片：媒体路径 → 占位信息（渲染后用于给 <img> 打标记） */
  placeholders: Map<string, MediaPlaceholder>;
  /** 转换记录：原路径 → 新路径与格式 */
  converted: Array<{ from: string; to: string; format: ImageFormat }>;
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d not available');
  return { canvas, ctx };
};

const defaultEncodePng = async (image: DecodedTiff): Promise<Uint8Array> => {
  const { canvas, ctx } = createCanvas(image.width, image.height);
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png encode failed');
  return new Uint8Array(await blob.arrayBuffer());
};

const defaultDecodeJpeg = async (jpeg: Uint8Array): Promise<DecodedTiff> => {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap not available');
  const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }));
  try {
    const { ctx } = createCanvas(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close?.();
  }
};

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const utf8 = (text: string) => (encoder ? encoder.encode(text) : Uint8Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0)));

const extensionOf = (path: string) => (path.split('/').pop() ?? '').split('.').pop()?.toLowerCase() ?? '';

/** 关系文件所在的 Map（parseZip 结果里键以 .rels 结尾的 Map） */
const relsMaps = (files: PptxZipFiles) =>
  Object.values(files).filter(
    (value): value is Map<string, string> =>
      value instanceof Map && [...value.keys()].some(key => typeof key === 'string' && key.endsWith('.rels'))
  );

/** 部件 XML 中引用图片的关系 ID（a:blip 的 r:embed / r:link） */
const blipRelIds = (xml: string) => {
  const ids = new Set<string>();
  const re = /<(?:\w+:)?blip\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    for (const name of ['r:embed', 'r:link']) {
      const value = attrValue(tag, name);
      if (value) ids.add(value);
    }
  }
  return ids;
};

/**
 * 预处理 parseZip 的结果（原地修改 files.media 与各 .rels）。任何单张图片处理失败都只影响该图片。
 */
export async function normalizePptxMedia(
  files: PptxZipFiles,
  options: NormalizeMediaOptions
): Promise<NormalizeMediaResult> {
  const result: NormalizeMediaResult = { placeholders: new Map(), converted: [] };
  const media = files.media;
  if (!(media instanceof Map)) return result;
  const maxPixels = options.maxImagePixels ?? DEFAULT_MAX_IMAGE_PIXELS;
  const encodePng = options.encodePng ?? defaultEncodePng;
  const decodeJpeg = options.decodeJpeg ?? defaultDecodeJpeg;

  /** 原媒体路径 → 替换后的路径 */
  const replacement = new Map<string, string>();
  let serial = 0;

  const addPlaceholder = (basePath: string, issue: MediaIssue, format?: string) => {
    serial += 1;
    const path = `${basePath}.yss-${issue}-${serial}.svg`;
    const placeholder: MediaPlaceholder = { issue, format, label: options.label(issue, format) };
    media.set(path, utf8(placeholderSvg(placeholder.label)));
    result.placeholders.set(path, placeholder);
    return path;
  };

  const processImage = async (path: string): Promise<string | undefined> => {
    const bytes = media.get(path);
    if (!bytes || !bytes.length) return addPlaceholder(path, 'broken');
    const format = detectImageFormat(bytes);
    const declared = EXTENSION_FORMAT[extensionOf(path)];

    if (NATIVE.has(format)) {
      const size = imageDimensions(bytes, format);
      if (size && size.width * size.height > maxPixels) return addPlaceholder(path, 'tooLarge');
      // 扩展名与内容不符（库按扩展名决定 MIME，SVG 必须有正确的 MIME 才能显示）
      if (format !== 'ico' && declared !== format) {
        const to = `${path}.${format}`;
        media.set(to, bytes);
        result.converted.push({ from: path, to, format });
        return to;
      }
      return undefined;
    }

    try {
      if (format === 'tiff') {
        const decoded = await decodeTiff(bytes, { maxPixels, decodeJpeg });
        const to = `${path}.png`;
        media.set(to, await encodePng(decoded));
        result.converted.push({ from: path, to, format: 'png' });
        return to;
      }
      if (format === 'emf' || format === 'wmf') {
        // 内嵌位图的 EMF（常见于粘贴的截图）：库能准确取出位图，优先交给库（扩展名不是 .emf 时改名，让库走 EMF 分支）
        if (format === 'emf' && classifyEmf(bytes) === 'bitmap') {
          if (declared === 'emf') return undefined;
          const to = `${path}.emf`;
          media.set(to, bytes);
          return to;
        }
        if (options.loadMetafile) {
          try {
            const svg = await convertMetafile(bytes, format, options.loadMetafile);
            const to = `${path}.svg`;
            media.set(to, utf8(svg));
            result.converted.push({ from: path, to, format: 'svg' });
            return to;
          } catch {
            // 转换失败：显示占位
          }
        }
        return addPlaceholder(path, 'unsupported', format.toUpperCase());
      }
    } catch (err) {
      if (err instanceof TiffTooLargeError) return addPlaceholder(path, 'tooLarge');
      return addPlaceholder(path, 'unsupported', format.toUpperCase());
    }
    // 无法识别的数据：扩展名是常见图片格式时视为损坏，否则按格式不支持（显示扩展名）
    const ext = extensionOf(path).toUpperCase();
    if (declared && NATIVE.has(declared)) return addPlaceholder(path, 'broken');
    return addPlaceholder(path, 'unsupported', ext || undefined);
  };

  const maps = relsMaps(files);
  // 1. 收集被图片关系引用的媒体
  const referenced = new Set<string>();
  maps.forEach(map =>
    map.forEach((xml, relsPath) => {
      if (typeof xml !== 'string') return;
      for (const tag of xml.match(RELATIONSHIP) ?? []) {
        if (!IMAGE_REL.test(attrValue(tag, 'Type') ?? '') || /^external$/i.test(attrValue(tag, 'TargetMode') ?? '')) continue;
        const target = attrValue(tag, 'Target');
        if (target) referenced.add(resolveTarget(relsPath, target));
      }
    })
  );

  // 2. 逐个处理（顺序处理，避免同时解码多张大图占满内存）
  for (const path of referenced) {
    if (options.signal?.aborted) return result;
    if (!media.has(path)) continue;
    const to = await processImage(path);
    if (to) replacement.set(path, to);
  }

  // 3. 改写关系：替换后的图片、缺失的图片、外部链接图片
  const placeholderFor = new Map<string, string>();
  const shared = (issue: MediaIssue) => {
    if (!placeholderFor.has(issue)) placeholderFor.set(issue, addPlaceholder('ppt/media/image', issue));
    return placeholderFor.get(issue) as string;
  };
  maps.forEach(map =>
    map.forEach((xml, relsPath) => {
      if (typeof xml !== 'string') return;
      const next = xml.replace(RELATIONSHIP, tag => {
        if (!IMAGE_REL.test(attrValue(tag, 'Type') ?? '')) return tag;
        const target = attrValue(tag, 'Target') ?? '';
        let to: string | undefined;
        let updated = tag;
        if (/^external$/i.test(attrValue(tag, 'TargetMode') ?? '')) {
          // 外部链接图片：不请求外部地址，显示占位
          to = shared('external');
          updated = removeAttr(updated, 'TargetMode');
        } else {
          const path = resolveTarget(relsPath, target);
          to = replacement.get(path) ?? (media.has(path) ? undefined : shared('missing'));
        }
        return to ? setAttr(updated, 'Target', relativePath(relsSourceDir(relsPath), to)) : tag;
      });
      if (next !== xml) map.set(relsPath, next);
    })
  );

  // 4. 幻灯片 / 版式 / 母版引用了不存在的关系 ID：补一条指向「图片缺失」占位的关系
  const pairs: Array<[unknown, unknown]> = [
    [files.slides, files.slideRels],
    [files.slideLayouts, files.slideLayoutRels],
    [files.slideMasters, files.slideMasterRels],
  ];
  for (const [parts, rels] of pairs) {
    if (!(parts instanceof Map) || !(rels instanceof Map)) continue;
    (parts as Map<string, unknown>).forEach((xml, partPath) => {
      if (typeof xml !== 'string') return;
      const ids = blipRelIds(xml);
      if (!ids.size) return;
      const relsPath = `${dirname(partPath)}/_rels/${partPath.split('/').pop()}.rels`;
      const current = rels.get(relsPath);
      const relsXml = typeof current === 'string' && current.includes('<Relationships') ? current : EMPTY_RELS;
      const existing = new Set((relsXml.match(RELATIONSHIP) ?? []).map(tag => attrValue(tag, 'Id')));
      const missing = [...ids].filter(id => !existing.has(id));
      if (!missing.length) return;
      const to = relativePath(dirname(partPath), shared('missing'));
      const added = missing
        .map(id => `<Relationship Id="${id}" Type="${IMAGE_REL_TYPE}" Target="${to}"/>`)
        .join('');
      const open = /<Relationships\b[^>]*?\/>/.exec(relsXml);
      rels.set(
        relsPath,
        open
          ? relsXml.replace(open[0], `${open[0].slice(0, -2)}>${added}</Relationships>`)
          : relsXml.replace(/<\/Relationships>\s*$/, `${added}</Relationships>`)
      );
    });
  }
  return result;
}
