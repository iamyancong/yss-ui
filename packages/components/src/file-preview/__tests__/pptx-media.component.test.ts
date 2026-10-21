/**
 * pptx 图片：用真实的 @aiden0z/pptx-renderer 解析 fixtures/pptx-media.pptx（每页一种图片情况），
 * 预处理后确认每张图片都能显示或显示带说明的占位（见 ./pptx-media-audit）。
 * （库的 buildPresentation 在 happy-dom 里读不出幻灯片列表，整页渲染的检查在真实浏览器里用 auditPptxMedia 做。）
 * fixtures/pptx-media.pptx 由 fixtures/make-pptx-media.py 生成，内容只有色块与英文标签。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePptxMedia, detectImageFormat, imageDimensions, type PptxZipFiles } from '../pptx/media';
import { classifyEmf, isEmf, isWmf } from '../pptx/metafile';
import { guardSlideImages } from '../pptx/placeholder';
import { decodeLzw, decodePackBits, decodeTiff, TiffTooLargeError, TiffUnsupportedError } from '../pptx/tiff';
import { auditPptxImageRels } from './pptx-media-audit';

const FIXTURE = resolve(__dirname, 'fixtures/pptx-media.pptx');
const fixture = () => {
  const b = readFileSync(FIXTURE);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const LABELS: Record<string, string> = {
  pptxImageUnsupported: '图片格式暂不支持（{type}）',
  pptxImageMissing: '图片缺失',
  pptxImageExternal: '外部链接图片未加载',
  pptxImageTooLarge: '图片过大，未显示',
  pptxImageBroken: '图片无法显示',
};
const mediaLabel = (issue: string, format?: string) => {
  const key = { unsupported: 'pptxImageUnsupported', missing: 'pptxImageMissing', external: 'pptxImageExternal', tooLarge: 'pptxImageTooLarge' }[issue] ?? 'pptxImageBroken';
  return LABELS[key].replace('{type}', format ?? '');
};

/** 1×1 PNG（happy-dom 没有 canvas，TIFF 转出的 PNG 用它代替） */
const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0)
);

/** happy-dom 没有 createObjectURL / canvas / ImageData / createImageBitmap：用最小实现代替，记录 blob 以便检查内容 */
const installBrowserStubs = () => {
  const blobs = new Map<string, Blob>();
  let seq = 0;
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:audit/${++seq}`;
    blobs.set(url, blob);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => blobs.delete(url)) as typeof URL.revokeObjectURL;
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    }
  );
  vi.stubGlobal('createImageBitmap', async () => ({ width: 2, height: 2, close: () => undefined }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        putImageData: () => undefined,
        drawImage: () => undefined,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      }) as never
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
    cb(new Blob([TINY_PNG], { type: 'image/png' }));
  });
  return {
    blobOf: (url: string) => blobs.get(url),
    restore() {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    },
  };
};

/** fixture 每页的预期占位（页码从 1 开始）；其余页正常显示 */
const EXPECTED_PLACEHOLDERS = {
  8: 'unsupported:EMF',
  10: 'unsupported:WMF',
  13: 'external',
  14: 'missing',
  15: 'missing',
  17: 'tooLarge',
  20: 'unsupported:WDP',
  21: 'broken',
};

const parseFixture = async () => {
  const lib = await import('@aiden0z/pptx-renderer');
  return (await lib.parseZip(fixture(), lib.RECOMMENDED_ZIP_LIMITS)) as unknown as PptxZipFiles;
};

describe('pptx 图片：整类格式问题（fixtures/pptx-media.pptx，真实 parseZip）', () => {
  let stubs: ReturnType<typeof installBrowserStubs>;
  beforeEach(() => {
    stubs = installBrowserStubs();
  });
  afterEach(() => {
    stubs.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('预处理后每页图片都是浏览器能显示的格式，或带说明的占位', async () => {
    const files = await parseFixture();
    const result = await normalizePptxMedia(files, { label: (issue, format) => mediaLabel(issue, format) });
    const report = auditPptxImageRels(files, result);
    expect(report.problems).toEqual([]);
    expect(report.slides).toBe(22);
    expect(report.placeholders).toEqual(EXPECTED_PLACEHOLDERS);
    // TIFF（LZW / 无压缩 / JPEG）转 PNG；扩展名不符的两张按真实格式改名
    expect(result.converted.map(c => `${c.from.split('/').pop()}→${c.format}`).sort()).toEqual([
      'e.tiff→png',
      'f.tif→png',
      'g.tiff→png',
      'r.png→jpeg',
      's.png→svg',
    ]);
    const emf = [...result.placeholders.values()].find(p => p.format === 'EMF');
    expect(emf?.label).toBe('图片格式暂不支持（EMF）');
  });

  it('提供 loadMetafile 时 EMF / WMF 转成 SVG，且只为用到的格式各加载一次；内嵌位图的 EMF 仍交给库', async () => {
    const Renderer = vi.fn(() => ({
      render: vi.fn(() => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
        return el;
      }),
    }));
    const loadMetafile = vi.fn(async (_format: 'emf' | 'wmf') => ({ default: { Renderer } }));
    const files = await parseFixture();
    const result = await normalizePptxMedia(files, { label: mediaLabel, loadMetafile });
    const report = auditPptxImageRels(files, result);
    expect(report.problems).toEqual([]);
    expect(report.placeholders[8]).toBeUndefined();
    expect(report.placeholders[10]).toBeUndefined();
    expect(loadMetafile.mock.calls.map(call => call[0]).sort()).toEqual(['emf', 'wmf']);
    const svg = new TextDecoder().decode(files.media!.get('ppt/media/h.emf.svg'));
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it('图元文件渲染器返回空图或报错时显示占位', async () => {
    const files = await parseFixture();
    const empty = vi.fn(async () => ({
      Renderer: class {
        render() {
          return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        }
      },
    }));
    const report = auditPptxImageRels(files, await normalizePptxMedia(files, { label: mediaLabel, loadMetafile: empty }));
    expect(report.placeholders[8]).toBe('unsupported:EMF');
    expect(report.placeholders[10]).toBe('unsupported:WMF');
  });

  it('没有图元文件的文稿不加载渲染器', async () => {
    const loadMetafile = vi.fn();
    const files = { media: new Map([['ppt/media/a.png', TINY_PNG]]), slideRels: new Map() };
    await normalizePptxMedia(files, { label: () => '', loadMetafile });
    expect(loadMetafile).not.toHaveBeenCalled();
  });
});

describe('pptx 图片预处理 normalizePptxMedia', () => {
  const rels = (...targets: string[]) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${targets.join('')}</Relationships>`;
  const image = (id: string, target: string, extra = '') =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"${extra}/>`;
  const label = (issue: string, format?: string) => (format ? `${issue}(${format})` : issue);

  it('改写关系：转换后的图片、缺失、外链；非图片关系与视频不动；原媒体保留', async () => {
    const files = {
      media: new Map<string, Uint8Array>([
        ['ppt/media/photo.png', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
        ['ppt/media/clip.mp4', new Uint8Array([0, 0, 0, 0x18])],
      ]),
      slides: new Map([['ppt/slides/slide1.xml', '<p:sld><a:blip r:embed="rId1"/><a:blip r:embed="rId9"/></p:sld>']]),
      slideRels: new Map([
        [
          'ppt/slides/_rels/slide1.xml.rels',
          rels(
            image('rId1', '../media/photo.png'),
            image('rId2', '../media/gone.png'),
            image('rId3', 'https://example.com/x.png', ' TargetMode="External"'),
            '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="../media/clip.mp4"/>',
            '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>'
          ),
        ],
      ]),
    };
    const result = await normalizePptxMedia(files, { label });
    const xml = files.slideRels.get('ppt/slides/_rels/slide1.xml.rels')!;
    // .png 里其实是 JPEG：按真实格式改名
    expect(xml).toContain('Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo.png.jpeg"');
    expect(files.media.has('ppt/media/photo.png')).toBe(true);
    expect(result.converted).toEqual([{ from: 'ppt/media/photo.png', to: 'ppt/media/photo.png.jpeg', format: 'jpeg' }]);
    // 缺失与外链：指向占位，外链不再是 External
    const target = (id: string) => new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(xml)?.[1];
    expect(target('rId2')).toMatch(/^\.\.\/media\/image\.yss-missing-\d+\.svg$/);
    expect(target('rId3')).toMatch(/^\.\.\/media\/image\.yss-external-\d+\.svg$/);
    expect(xml).not.toMatch(/Id="rId3"[^>]*TargetMode/);
    // 视频与超链接不动
    expect(xml).toContain('Target="../media/clip.mp4"');
    expect(xml).toContain('Target="https://example.com" TargetMode="External"');
    // 幻灯片引用了不存在的 rId9：补一条指向「图片缺失」的关系
    expect(target('rId9')).toBe(target('rId2'));
    const placeholders = [...result.placeholders.values()].map(p => p.label).sort();
    expect(placeholders).toEqual(['external', 'missing']);
    // 占位是浏览器能显示的 SVG，且带说明文字
    const svgPath = `ppt/slides/${target('rId2')}`.replace('slides/../', '');
    const svg = new TextDecoder().decode(files.media.get(svgPath));
    expect(detectImageFormat(files.media.get(svgPath)!)).toBe('svg');
    expect(svg).toContain('>missing</text>');
  });

  it('像素数超过上限显示「图片过大」；TIFF 解码失败显示「格式暂不支持（TIFF）」', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 5000);
    new DataView(png.buffer).setUint32(20, 5000);
    const badTiff = new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0]);
    const files = {
      media: new Map<string, Uint8Array>([
        ['ppt/media/big.png', png],
        ['ppt/media/bad.tiff', badTiff],
      ]),
      slideRels: new Map([['ppt/slides/_rels/slide1.xml.rels', rels(image('rId1', '../media/big.png'), image('rId2', '../media/bad.tiff'))]]),
    };
    const result = await normalizePptxMedia(files, { label, maxImagePixels: 10_000_000 });
    expect([...result.placeholders.values()].map(p => p.label).sort()).toEqual(['tooLarge', 'unsupported(TIFF)']);
  });

  it('预处理被中止时立即返回', async () => {
    const controller = new AbortController();
    controller.abort();
    const files = {
      media: new Map([['ppt/media/a.tiff', new Uint8Array([0x49, 0x49, 0x2a, 0])]]),
      slideRels: new Map([['ppt/slides/_rels/slide1.xml.rels', rels(image('rId1', '../media/a.tiff'))]]),
    };
    const result = await normalizePptxMedia(files, { label, signal: controller.signal });
    expect(result.placeholders.size).toBe(0);
  });
});

describe('格式识别与解码', () => {
  it('按文件头识别格式（不看扩展名），读取尺寸', () => {
    const b = (...bytes: number[]) => new Uint8Array([...bytes, ...new Array(120).fill(0)]);
    expect(detectImageFormat(b(0x89, 0x50, 0x4e, 0x47))).toBe('png');
    expect(detectImageFormat(b(0xff, 0xd8, 0xff))).toBe('jpeg');
    expect(detectImageFormat(b(0x47, 0x49, 0x46, 0x38))).toBe('gif');
    expect(detectImageFormat(b(0x42, 0x4d))).toBe('bmp');
    expect(detectImageFormat(b(0x49, 0x49, 0x2a, 0))).toBe('tiff');
    expect(detectImageFormat(b(0x4d, 0x4d, 0, 0x2a))).toBe('tiff');
    expect(detectImageFormat(b(0xd7, 0xcd, 0xc6, 0x9a))).toBe('wmf');
    expect(detectImageFormat(new TextEncoder().encode('\uFEFF<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))).toBe('svg');
    expect(detectImageFormat(new TextEncoder().encode('<html><body></body></html>'))).toBe('unknown');
    expect(detectImageFormat(new Uint8Array(0))).toBe('unknown');
    const emf = new Uint8Array(100);
    new DataView(emf.buffer).setUint32(0, 1, true);
    new DataView(emf.buffer).setUint32(40, 0x464d4520, true);
    expect(isEmf(emf)).toBe(true);
    expect(isWmf(emf)).toBe(false);
    expect(classifyEmf(emf)).toBe('vector');
    expect(imageDimensions(TINY_PNG, 'png')).toEqual({ width: 1, height: 1 });
  });

  it('LZW 与 PackBits', () => {
    // PackBits：3 个字面量 + 重复 4 次的 0xAA
    expect(Array.from(decodePackBits(new Uint8Array([2, 1, 2, 3, 0xfd, 0xaa]), 7))).toEqual([1, 2, 3, 0xaa, 0xaa, 0xaa, 0xaa]);
    // LZW：Clear(256) 'A' 'B' 258('AB') EOI(257)，9 位码 MSB 优先
    const codes = [256, 65, 66, 258, 257];
    let bits = '';
    codes.forEach(code => (bits += code.toString(2).padStart(9, '0')));
    bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
    const bytes = new Uint8Array(bits.length / 8).map((_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2));
    expect(Array.from(decodeLzw(bytes, 4))).toEqual([65, 66, 65, 66]);
  });

  it('TIFF：头部异常、像素数超限分别报错', async () => {
    await expect(decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toBeInstanceOf(TiffUnsupportedError);
    // 最小 TIFF：宽高各 10000（IFD 只有宽高两项）
    const tiff = new Uint8Array(8 + 2 + 24 + 4);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 0x2a, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 2, true);
    [256, 257].forEach((tag, i) => {
      const at = 10 + i * 12;
      view.setUint16(at, tag, true);
      view.setUint16(at + 2, 4, true);
      view.setUint32(at + 4, 1, true);
      view.setUint32(at + 8, 10000, true);
    });
    await expect(decodeTiff(tiff, { maxPixels: 1000 })).rejects.toBeInstanceOf(TiffTooLargeError);
  });
});

describe('渲染后兜底 guardSlideImages', () => {
  it('解码失败的图片换成「图片无法显示」占位；库的英文占位换成本地化文字', () => {
    const slide = document.createElement('div');
    const img = document.createElement('img');
    img.style.width = '100%';
    const lib = document.createElement('div');
    lib.style.border = '1px dashed #ccc';
    lib.textContent = 'Image not found';
    const wmf = document.createElement('div');
    wmf.style.border = '1px dashed #ddd';
    wmf.innerHTML = '<div>🖼</div><div>Unsupported format: WMF</div>';
    const text = document.createElement('div');
    text.textContent = 'Image not found';
    slide.append(img, lib, wmf, text);
    const off = guardSlideImages(slide, (issue, format) => (format ? `${issue}:${format}` : issue));
    expect(slide.querySelectorAll('[data-yss-pptx-placeholder]')).toHaveLength(2);
    expect(slide.textContent).toContain('unsupported:WMF');
    // 普通文本框（没有虚线边框）不受影响
    expect(text.parentNode).toBe(slide);
    img.dispatchEvent(new Event('error'));
    const broken = slide.querySelector<HTMLElement>('[data-yss-pptx-placeholder="broken"]')!;
    expect(broken.getAttribute('aria-label')).toBe('broken');
    expect(broken.style.width).toBe('100%');
    expect(img.parentNode).toBeNull();
    off();
  });
});
