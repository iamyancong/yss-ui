/**
 * 可复用的 pptx 图片检查：渲染完成后调用，确认「每张图片要么正常显示，要么显示带说明的占位」，不出现裂图。
 *
 * - 浏览器（真实解码）：每个 <img> 加载完成且 naturalWidth > 0
 * - happy-dom / jsdom（不解码图片）：每个 <img> 的 blob 内容必须是浏览器能显示的格式（PNG / JPEG / GIF / BMP / WebP / SVG / ICO），
 *   不能是 TIFF / EMF / WMF / 无法识别的数据
 * - 占位必须带说明文字（alt / aria-label）
 * - 不能出现库自带的英文占位（Image not found 等）
 *
 * 用法：`const report = await auditPptxMedia(root, { blobOf })`，然后 `expect(report.problems).toEqual([])`。
 */
import { detectImageFormat, type PptxZipFiles } from '../pptx/media';
import { classifyEmf } from '../pptx/metafile';

const NATIVE = new Set(['png', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico']);
const LIBRARY_TEXT = /^(?:🖼\s*)?(?:Image not found|Missing image reference|Unsupported format: ?\w+)$/u;

export interface PptxMediaAuditOptions {
  /** happy-dom / jsdom 下按 URL 取回 blob（配合替换 URL.createObjectURL 使用）；浏览器下不需要 */
  blobOf?: (url: string) => Blob | undefined;
  /** 浏览器下等待单张图片加载的超时，默认 8 秒 */
  timeout?: number;
}

export interface PptxMediaAuditReport {
  /** 已渲染的页数 */
  slides: number;
  /** 正常显示的图片数 */
  images: number;
  /** 占位：`页码:原因`，如 `8:unsupported:EMF` */
  placeholders: string[];
  /** 问题：裂图、占位缺少说明、库的英文占位等；为空表示通过 */
  problems: string[];
}

/** 测试环境（happy-dom / jsdom）不解码图片，改为检查 blob 内容 */
const isJsdom = () => typeof navigator !== 'undefined' && /jsdom|happy-?dom/i.test(navigator.userAgent);

const waitImage = (img: HTMLImageElement, timeout: number) =>
  img.complete
    ? Promise.resolve()
    : new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, timeout);
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });

const blobFormat = async (blob: Blob) => detectImageFormat(new Uint8Array(await blob.arrayBuffer()));

export async function auditPptxMedia(root: ParentNode, options: PptxMediaAuditOptions = {}): Promise<PptxMediaAuditReport> {
  const report: PptxMediaAuditReport = { slides: 0, images: 0, placeholders: [], problems: [] };
  const jsdom = isJsdom();
  const timeout = options.timeout ?? 8000;

  const checkUrl = async (slide: number, url: string, what: string) => {
    if (!url.startsWith('blob:') && !url.startsWith('data:')) return true;
    if (jsdom) {
      const blob = options.blobOf?.(url);
      if (!blob) {
        report.problems.push(`${slide}: ${what} 没有数据`);
        return false;
      }
      const format = await blobFormat(blob);
      if (!NATIVE.has(format)) {
        report.problems.push(`${slide}: ${what} 是浏览器不能显示的格式（${format}）`);
        return false;
      }
      return true;
    }
    return true;
  };

  const items = Array.from(root.querySelectorAll<HTMLElement>('.yss-file-preview-pptx__item'));
  for (const item of items) {
    const slide = Number(item.dataset.index) + 1;
    const canvas = item.querySelector<HTMLElement>('.yss-file-preview-pptx__canvas');
    if (!canvas || !canvas.childElementCount) continue;
    report.slides += 1;

    for (const img of Array.from(canvas.querySelectorAll('img'))) {
      const tag = img.dataset.yssPptxPlaceholder;
      if (tag) {
        report.placeholders.push(`${slide}:${tag}`);
        if (!img.alt) report.problems.push(`${slide}: 占位缺少说明文字`);
        continue;
      }
      const src = img.getAttribute('src') ?? '';
      if (jsdom) {
        if (await checkUrl(slide, src, '图片')) report.images += 1;
        continue;
      }
      await waitImage(img, timeout);
      if (img.complete && img.naturalWidth > 0) report.images += 1;
      // 兜底监听会把解码失败的图片换成占位；此时 img 已不在页面里
      else if (img.isConnected) report.problems.push(`${slide}: 裂图（naturalWidth = 0）`);
    }

    for (const el of Array.from(canvas.querySelectorAll<HTMLElement>('[data-yss-pptx-placeholder]'))) {
      if (el.tagName === 'IMG') continue;
      report.placeholders.push(`${slide}:${el.dataset.yssPptxPlaceholder}`);
      if (!el.getAttribute('aria-label')) report.problems.push(`${slide}: 占位缺少说明文字`);
    }

    for (const image of Array.from(canvas.querySelectorAll('image'))) {
      const href = image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '';
      await checkUrl(slide, href, 'SVG 图片');
    }

    for (const el of Array.from(canvas.querySelectorAll<HTMLElement>('*'))) {
      const match = /url\("?((?:blob|data):[^")]+)"?\)/.exec(el.style?.backgroundImage ?? '');
      if (match) await checkUrl(slide, match[1], '背景图片');
    }

    for (const div of Array.from(canvas.querySelectorAll('div'))) {
      if (div.querySelector(':scope div div')) continue;
      if (LIBRARY_TEXT.test((div.textContent ?? '').trim().replace(/\s+/g, ' ')))
        report.problems.push(`${slide}: 库的英文占位「${(div.textContent ?? '').trim()}」`);
    }
  }
  return report;
}

export interface PptxImageRelsReport {
  slides: number;
  /** 正常显示的图片数 */
  images: number;
  /** 页码 → 占位原因（同页多张用逗号连接） */
  placeholders: Record<number, string>;
  problems: string[];
}

const normalizePath = (path: string) => {
  const out: string[] = [];
  path.split('/').forEach(part => {
    if (!part || part === '.') return;
    if (part === '..') out.pop();
    else out.push(part);
  });
  return out.join('/');
};

/**
 * 不渲染、只看数据的检查（任何环境可用）：预处理之后，每页 a:blip / svgBlip 引用的图片
 * 都要指向浏览器能显示的数据（或库能处理的内嵌位图 EMF），或者是带说明的占位。
 */
export function auditPptxImageRels(
  files: PptxZipFiles,
  result: { placeholders: Map<string, { issue: string; format?: string; label: string }> }
): PptxImageRelsReport {
  const report: PptxImageRelsReport = { slides: 0, images: 0, placeholders: {}, problems: [] };
  const slides = [...(files.slides ?? new Map<string, string>()).entries()].sort(
    ([a], [b]) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1])
  );
  const relsMap = files.slideRels as Map<string, string> | undefined;
  for (const [path, xml] of slides) {
    const slide = Number(/(\d+)\.xml$/.exec(path)?.[1]);
    report.slides += 1;
    const dir = path.slice(0, path.lastIndexOf('/'));
    const relsXml = relsMap?.get(`${dir}/_rels/${path.split('/').pop()}.rels`) ?? '';
    const rels = new Map<string, string>();
    for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
      const id = /\sId="([^"]+)"/.exec(tag)?.[1];
      if (id) rels.set(id, tag);
    }
    const refs = [...xml.matchAll(/<(?:\w+:)?(?:blip|svgBlip)\b[^>]*\sr:(?:embed|link)="([^"]+)"/g)].map(m => m[1]);
    for (const id of refs) {
      const tag = rels.get(id);
      if (!tag) {
        report.problems.push(`${slide}: 引用 ${id} 没有对应的关系`);
        continue;
      }
      if (/TargetMode="External"/i.test(tag)) {
        report.problems.push(`${slide}: 外部链接图片没有换成占位`);
        continue;
      }
      const target = /\sTarget="([^"]+)"/.exec(tag)?.[1] ?? '';
      const mediaPath = normalizePath(`${dir}/${target}`);
      const placeholder = result.placeholders.get(mediaPath);
      if (placeholder) {
        if (!placeholder.label) report.problems.push(`${slide}: 占位缺少说明文字`);
        const tagText = placeholder.format ? `${placeholder.issue}:${placeholder.format}` : placeholder.issue;
        report.placeholders[slide] = report.placeholders[slide] ? `${report.placeholders[slide]},${tagText}` : tagText;
        continue;
      }
      const bytes = files.media?.get(mediaPath);
      if (!bytes) {
        report.problems.push(`${slide}: ${mediaPath} 不存在`);
        continue;
      }
      const format = detectImageFormat(bytes);
      if (NATIVE.has(format) || (format === 'emf' && classifyEmf(bytes) === 'bitmap')) report.images += 1;
      else report.problems.push(`${slide}: ${mediaPath.split('/').pop()} 是浏览器不能显示的格式（${format}）`);
    }
  }
  return report;
}
