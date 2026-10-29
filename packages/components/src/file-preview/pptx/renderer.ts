/**
 * PowerPoint（.pptx）渲染器，基于 @aiden0z/pptx-renderer（Apache-2.0）。**实验性支持**，
 * 需要业务项目自行安装 @aiden0z/pptx-renderer 并显式注册。
 *
 * 只使用库的底层 API（parseZip → buildPresentation → renderSlide），不使用它的 PptxViewer：
 * 列表、缩放、页码、按需渲染由本渲染器负责，库只负责把单页画成 DOM。
 * 本渲染器负责的部分：按幻灯片尺寸等比缩放到容器宽度（随容器变化重新计算，无横向滚动）、
 * 页间距 / 阴影 / 页码、隐藏页标记、按需渲染（滚动到附近才绘制，适合上百页）、空文稿与损坏文件的提示、
 * 每个预览实例独立管理自己的图表实例与图片 blob URL（多个预览互不影响，销毁时全部释放）。
 *
 * 图表：库的两处排版问题（单独设置的字号少换算 pt → px、分类轴标签固定不旋转导致重叠）在 ./charts 中逐个图表修正。
 *
 * 图片：库把图片按扩展名直接交给 <img>，浏览器不认识的格式（TIFF、EMF、WMF 等）会显示裂图。
 * ./media 在渲染前统一预处理：TIFF 转 PNG、EMF / WMF 可选转 SVG、其余显示带说明文字的占位（见 ./media 的说明）；
 * 渲染后 ./placeholder 再兜底：浏览器仍解码失败的图片换成「图片无法显示」占位，不出现裂图。
 *
 * 已知限制（库本身的能力）：不支持动画与切换效果；字体取决于浏览器所在系统是否安装（文件内嵌字体会加载）；
 * 少数复杂效果（3D、部分艺术字）与 PowerPoint 显示有差异。
 *
 * 本文件只能被 `@yss-ui/components/file-preview/pptx` 子路径引用，主入口不得引用
 * （否则不用 pptx 的项目也要解析 @aiden0z/pptx-renderer）。
 */
import { formatCount, formatFileSize, PPTX_WARN_SLIDES } from '../constant';
import { MissingDependencyError } from '../errors';
import { createNoticeBar } from '../renderers/notice-bar';
import type { PreviewRenderer, RenderContext } from '../renderers/types';
import { adjustChart, findChartPath, parseChartFonts, type ChartFontSizes, type ChartLike } from './charts';
import { normalizePptxMedia, type PptxZipFiles } from './media';
import type { MetafileLoader } from './metafile';
import { guardSlideImages, markPlaceholders, type MediaIssue, type MediaPlaceholder } from './placeholder';

/** 库需要的 npm 包名（提示安装、错误信息使用） */
export const PPTX_PACKAGE = '@aiden0z/pptx-renderer';

/** 库解析出的单页（只声明用到的部分） */
interface PptxSlideData {
  hidden?: boolean;
  /** lazySlides 模式下尚未解析的幻灯片 XML */
  sourceXml?: string;
  /** 绘制时解析出的形状（图表节点带 chartPath） */
  nodes?: unknown[];
}

/** 库解析出的演示文稿（只声明用到的部分） */
interface PptxPresentationData {
  /** 幻灯片宽度（px） */
  width: number;
  /** 幻灯片高度（px） */
  height: number;
  slides: PptxSlideData[];
}

/** renderSlide 返回的单页句柄（只声明用到的部分） */
interface PptxSlideHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

/** 图表实例（只声明用到的部分） */
interface PptxChartInstance {
  isDisposed(): boolean;
  dispose(): void;
  resize?(): void;
}

/**
 * @aiden0z/pptx-renderer 模块（只声明本渲染器用到的部分，类型不依赖它是否安装）。
 * 自定义 `load` 时返回该模块即可：`load: () => import('@aiden0z/pptx-renderer')`。
 */
export interface PptxRendererLibrary {
  parseZip(buffer: ArrayBuffer, limits?: object): Promise<unknown>;
  buildPresentation(files: any, options?: { lazySlides?: boolean }): unknown;
  renderSlide(presentation: any, slide: any, options?: Record<string, unknown>): PptxSlideHandle;
  /** 库推荐的 zip 安全上限（条目数、解压后大小），存在时使用 */
  RECOMMENDED_ZIP_LIMITS?: object;
}

/** 解压安全上限（与库的 RECOMMENDED_ZIP_LIMITS 同名字段） */
export interface PptxZipLimits {
  /** 最多条目数 */
  maxEntries?: number;
  /** 单个条目解压后的最大字节数 */
  maxEntryUncompressedBytes?: number;
  /** 全部条目解压后的最大字节数 */
  maxTotalUncompressedBytes?: number;
  /** 媒体（图片、视频、音频）合计最大字节数 */
  maxMediaBytes?: number;
  /** 并发解压数 */
  maxConcurrency?: number;
}

export interface PptxRendererOptions {
  /**
   * 自定义加载 @aiden0z/pptx-renderer 的方式，默认 `() => import('@aiden0z/pptx-renderer')`。
   * 例如在业务项目里写 `load: () => import('@aiden0z/pptx-renderer')`，让业务项目自己的构建解析该依赖。
   */
  load?: () => Promise<PptxRendererLibrary>;
  /**
   * 显示 EMF / WMF 矢量图（Windows 图元文件，常见于从 Visio、Excel 粘贴的图）。浏览器不能直接显示，
   * 提供该函数后按需加载 rtf.js（MIT）把它们转成 SVG；不提供时这类图片显示「图片格式暂不支持（EMF）」占位
   * （内嵌位图的 EMF 仍可显示）。只在文稿里真的有 EMF / WMF 时才会调用。
   * rtf.js 对简单矢量图与 WMF 效果较好，带复杂坐标变换的 EMF 可能显示不完整（实验性）。
   *
   * ```ts
   * registerPptxRenderer({
   *   loadMetafile: format =>
   *     format === 'emf' ? import('rtf.js/dist/EMFJS.bundle.min.js') : import('rtf.js/dist/WMFJS.bundle.min.js'),
   * })
   * ```
   */
  loadMetafile?: MetafileLoader;
  /**
   * 解压安全上限，与默认值合并。默认按文件大小放宽：条目 10000 个；单个条目至少 64MB、最多 256MB；
   * 解压后合计为文件大小的 8 倍（256MB ~ 1GB）；媒体合计为文件大小的 2 倍（192MB ~ 768MB）。
   * 超过上限时提示「文件内容超出预览上限」。
   */
  zipLimits?: PptxZipLimits;
  /** 单张图片的最大像素数（宽 × 高），超过时显示「图片过大，未显示」，默认 1 亿 */
  maxImagePixels?: number;
}

const MB = 1024 * 1024;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 按文件大小计算解压上限：库的推荐值（单条目 32MB、合计 256MB）对 50MB 以上、内嵌视频的文稿偏紧，
 * 会让整个文件打不开；这里随文件大小放宽，同时保留上限防止压缩炸弹。
 */
export const pptxZipLimits = (byteLength: number, base: object | undefined, override?: PptxZipLimits) => ({
  maxConcurrency: 8,
  ...(base as PptxZipLimits | undefined),
  maxEntries: 10000,
  maxEntryUncompressedBytes: clamp(byteLength * 2, 64 * MB, 256 * MB),
  maxTotalUncompressedBytes: clamp(byteLength * 8, 256 * MB, 1024 * MB),
  maxMediaBytes: clamp(byteLength * 2, 192 * MB, 768 * MB),
  ...override,
});

const isZipLimitError = (err: unknown) => /zip limit/i.test(String((err as Error | null)?.message ?? err));

/** 读不到容器宽度时（例如容器还没显示）使用的宽度 */
const FALLBACK_WIDTH = 960;
/** 打开时立即绘制的页数，其余页滚动到附近时再绘制 */
const EAGER_SLIDES = 3;

/**
 * 大文稿提示条文案：页数超过 PPTX_WARN_SLIDES 优先，其次文件超过 largeFileWarnSize（恰好等于不提示）；不需要时返回空串。
 * warnSize 为 0 / 负数 / NaN / Infinity / 未传时不按大小提示
 */
export function pptxNoticeOf(
  slides: number,
  byteLength: number,
  warnSize: number | undefined,
  t: RenderContext['t'],
  locale?: string
): string {
  if (Number.isFinite(slides) && slides > PPTX_WARN_SLIDES)
    return t('pptxLargeSlidesNotice', { slides: formatCount(slides, locale) });
  if (typeof warnSize === 'number' && warnSize > 0 && Number.isFinite(warnSize) && byteLength > warnSize)
    return t('pptxLargeSizeNotice', { size: formatFileSize(byteLength) });
  return '';
}
/** 不支持 IntersectionObserver 时，每批绘制的页数 */
const BATCH_SLIDES = 4;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

const defaultLoad = () => import('@aiden0z/pptx-renderer') as unknown as Promise<PptxRendererLibrary>;

/** 文件不是 zip，或解析失败（损坏、缺少 presentation.xml） */
class PptxInvalidError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PptxInvalidError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const isZip = (data: ArrayBuffer) => {
  if (data.byteLength < 4) return false;
  const head = new Uint8Array(data, 0, 4);
  return ZIP_SIGNATURE.every((byte, i) => head[i] === byte);
};

/** 幻灯片是否被设置为隐藏（放映时跳过）。lazySlides 模式下库还没解析 show 属性，直接读 XML */
export const isHiddenSlide = (slide: PptxSlideData | undefined): boolean => {
  if (!slide) return false;
  if (slide.hidden) return true;
  const xml = slide.sourceXml;
  if (typeof xml !== 'string') return false;
  const tag = /<(?:\w+:)?sld\b[^>]*>/.exec(xml)?.[0] ?? '';
  return /\sshow\s*=\s*["'](?:0|false)["']/.test(tag);
};

const validPresentation = (value: unknown): value is PptxPresentationData => {
  const pres = value as PptxPresentationData | null;
  return (
    !!pres &&
    Number.isFinite(pres.width) &&
    pres.width > 0 &&
    Number.isFinite(pres.height) &&
    pres.height > 0 &&
    Array.isArray(pres.slides)
  );
};

/** 创建 pptx 渲染器，可传入自定义加载函数 */
export function createPptxRenderer(options: PptxRendererOptions = {}): PreviewRenderer {
  const load = options.load ?? defaultLoad;

  const loadLibrary = async (): Promise<PptxRendererLibrary> => {
    try {
      const lib = (await load()) as PptxRendererLibrary & { default?: PptxRendererLibrary };
      // 兼容只有默认导出的打包结果
      const resolved = typeof lib.renderSlide === 'function' ? lib : lib.default;
      if (!resolved || typeof resolved.renderSlide !== 'function')
        throw new Error(`${PPTX_PACKAGE}: renderSlide not found`);
      return resolved;
    } catch (err) {
      throw new MissingDependencyError(PPTX_PACKAGE, err);
    }
  };

  return {
    types: ['pptx'],
    create() {
      let root: HTMLElement | null = null;
      let lib: PptxRendererLibrary | null = null;
      let pres: PptxPresentationData | null = null;
      let observer: IntersectionObserver | null = null;
      let resizeObserver: ResizeObserver | null = null;
      let batchTimer: ReturnType<typeof setTimeout> | null = null;
      let lastWidth = -1;
      /** 本实例的图表与图片 URL：不与其他预览共享，销毁时只释放自己的 */
      const chartInstances = new Set<PptxChartInstance>();
      /** parseZip 结果中的图表 XML（路径 → 文本），用于修正图表字号 */
      let chartXml: Map<string, string> | null = null;
      const chartFonts = new Map<string, ChartFontSizes | undefined>();
      /** 库初始化图表后会调用 chartInstances.add：在这里修正该图表（失败时保持库的效果） */
      const addChart = chartInstances.add.bind(chartInstances);
      chartInstances.add = chart => {
        addChart(chart);
        tuneChart(chart);
        return chartInstances;
      };
      const mediaUrlCache = new Map<string, string>();
      /** 预处理时换成占位的图片（媒体路径 → 占位信息） */
      let placeholders = new Map<string, MediaPlaceholder>();
      const unguards: Array<() => void> = [];
      const urlToPath = (url: string) => {
        if (!url) return undefined;
        for (const [path, value] of mediaUrlCache) if (value === url) return path;
        return undefined;
      };
      const mediaLabel = (issue: MediaIssue, format?: string) => {
        switch (issue) {
          case 'unsupported':
            return t('pptxImageUnsupported', { type: format ?? '?' });
          case 'missing':
            return t('pptxImageMissing');
          case 'external':
            return t('pptxImageExternal');
          case 'tooLarge':
            return t('pptxImageTooLarge');
          default:
            return t('pptxImageBroken');
        }
      };
      const handles: PptxSlideHandle[] = [];
      const items: Array<{ slide: HTMLElement; canvas: HTMLElement; rendered: boolean }> = [];
      let t: RenderContext['t'] = key => key;

      const fontsOf = (path: string | undefined) => {
        if (!path) return undefined;
        if (!chartFonts.has(path)) {
          const xml = chartXml?.get(path);
          chartFonts.set(path, typeof xml === 'string' ? parseChartFonts(xml) : undefined);
        }
        return chartFonts.get(path);
      };

      const tuneChart = (chart: PptxChartInstance) => {
        try {
          const echart = chart as unknown as ChartLike;
          if (typeof echart.getDom !== 'function' || typeof echart.getOption !== 'function') return;
          const dom = echart.getDom();
          const item = dom?.closest?.<HTMLElement>('.yss-file-preview-pptx__item');
          const slideRoot = item?.querySelector<HTMLElement>('.yss-file-preview-pptx__canvas');
          if (!item || !slideRoot || !pres) return;
          const slide = pres.slides[Number(item.dataset.index)];
          adjustChart(echart, fontsOf(findChartPath(dom, slideRoot, slide?.nodes)));
        } catch {
          // 修正失败不影响图表本身
        }
      };

      /** 每页缩放到列表宽度：只改 transform，不重新绘制 */
      const layout = () => {
        if (!root || !items.length || !pres) return;
        const width = items[0].slide.clientWidth || root.clientWidth || FALLBACK_WIDTH;
        if (width === lastWidth) return;
        lastWidth = width;
        const scale = width / pres.width;
        const height = Math.round(((width * pres.height) / pres.width) * 100) / 100;
        items.forEach(item => {
          item.slide.style.height = `${height}px`;
          item.canvas.style.transform = `scale(${scale})`;
        });
      };

      const renderSlide = (index: number) => {
        const item = items[index];
        if (!item || item.rendered || !lib || !pres) return;
        item.rendered = true;
        try {
          const handle = lib.renderSlide(pres, pres.slides[index], {
            chartInstances,
            mediaUrlCache,
            // 文件里的外部链接媒体（http 图片 / 视频）不自动请求，避免预览时访问第三方地址
            externalMedia: 'block',
          });
          handles.push(handle);
          // 同步打标记、挂兜底监听（图片的 error 事件最早在下一个任务触发，不会漏掉）
          markPlaceholders(handle.element, urlToPath, placeholders);
          unguards.push(guardSlideImages(handle.element, mediaLabel));
          item.canvas.appendChild(handle.element);
        } catch {
          item.canvas.textContent = '';
          const tip = document.createElement('div');
          tip.className = 'yss-file-preview-pptx__slide-error';
          tip.textContent = t('pptxSlideError');
          item.slide.appendChild(tip);
        }
      };

      /** 不支持 IntersectionObserver 时分批绘制，避免一次绘制上百页卡住页面 */
      const renderInBatches = (start: number) => {
        for (let i = start; i < Math.min(start + BATCH_SLIDES, items.length); i += 1) renderSlide(i);
        if (start + BATCH_SLIDES < items.length) {
          batchTimer = setTimeout(() => renderInBatches(start + BATCH_SLIDES), 16);
        }
      };

      const buildList = (presentation: PptxPresentationData) => {
        const count = presentation.slides.length;
        const list = document.createElement('div');
        list.className = 'yss-file-preview-pptx__list';
        for (let i = 0; i < count; i += 1) {
          const item = document.createElement('div');
          item.className = 'yss-file-preview-pptx__item';
          item.dataset.index = String(i);
          const slide = document.createElement('div');
          slide.className = 'yss-file-preview-pptx__slide';
          slide.setAttribute('role', 'group');
          slide.setAttribute('aria-label', t('pptxPage', { current: i + 1, total: count }));
          const canvas = document.createElement('div');
          canvas.className = 'yss-file-preview-pptx__canvas';
          canvas.style.width = `${presentation.width}px`;
          canvas.style.height = `${presentation.height}px`;
          slide.appendChild(canvas);
          const footer = document.createElement('div');
          footer.className = 'yss-file-preview-pptx__page';
          footer.textContent = t('pptxPage', { current: i + 1, total: count });
          if (isHiddenSlide(presentation.slides[i])) {
            item.classList.add('is-hidden');
            const badge = document.createElement('span');
            badge.className = 'yss-file-preview-pptx__badge';
            badge.textContent = t('pptxHidden');
            footer.appendChild(badge);
          }
          item.append(slide, footer);
          list.appendChild(item);
          items.push({ slide, canvas, rendered: false });
        }
        return list;
      };

      const showEmpty = () => {
        if (!root) return;
        const empty = document.createElement('div');
        empty.className = 'yss-file-preview-pptx__empty';
        empty.textContent = t('pptxNoSlides');
        root.appendChild(empty);
      };

      const watch = () => {
        if (!root) return;
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => layout());
          resizeObserver.observe(root);
        }
        if (typeof IntersectionObserver !== 'undefined') {
          observer = new IntersectionObserver(
            entries =>
              entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const index = Number((entry.target as HTMLElement).dataset.index);
                renderSlide(index);
                observer?.unobserve(entry.target);
              }),
            // 提前一屏绘制，滚动时基本看不到空白页
            { root, rootMargin: '100% 0px' }
          );
          root.querySelectorAll('.yss-file-preview-pptx__item').forEach((el, i) => {
            if (!items[i]?.rendered) observer?.observe(el);
          });
        } else {
          renderInBatches(EAGER_SLIDES);
        }
      };

      return {
        async render(container, data, context) {
          t = context.t;
          const library = await loadLibrary();
          if (context.signal.aborted) return;
          if (!isZip(data)) throw new PptxInvalidError(t('pptxInvalid'));

          const aborted = new Promise<void>(resolve =>
            context.signal.addEventListener('abort', () => resolve(), { once: true })
          );

          let presentation: unknown;
          try {
            const limits = pptxZipLimits(data.byteLength, library.RECOMMENDED_ZIP_LIMITS, options.zipLimits);
            const files = await Promise.race([library.parseZip(data, limits), aborted]);
            if (context.signal.aborted) return;
            // 缺少 ppt/presentation.xml（例如改了扩展名的 docx / xlsx）：库会按默认尺寸返回空文稿，这里按无效文件处理
            const presentationXml = (files as { presentation?: unknown } | null)?.presentation;
            if (typeof presentationXml !== 'string' || !presentationXml.trim())
              throw new Error('ppt/presentation.xml not found');
            const charts = (files as { charts?: unknown }).charts;
            chartXml = charts instanceof Map ? (charts as Map<string, string>) : null;
            // 浏览器显示不了的图片（TIFF / EMF / WMF / 缺失 / 外链…）在这里换成能显示的数据或占位
            try {
              const normalized = await Promise.race([
                normalizePptxMedia(files as PptxZipFiles, {
                  label: mediaLabel,
                  loadMetafile: options.loadMetafile,
                  maxImagePixels: options.maxImagePixels,
                  signal: context.signal,
                }),
                aborted,
              ]);
              if (context.signal.aborted) return;
              if (normalized) placeholders = normalized.placeholders;
            } catch {
              // 预处理失败不影响打开文件：按库的默认方式显示图片（渲染后仍有兜底占位）
            }
            // lazySlides：只在绘制某一页时才解析该页的形状，打开上百页的文件更快
            presentation = library.buildPresentation(files, { lazySlides: true });
          } catch (err) {
            throw new PptxInvalidError(t(isZipLimitError(err) ? 'pptxTooLarge' : 'pptxInvalid'), err);
          }
          // 尺寸异常时同样按无效文件处理
          if (!validPresentation(presentation)) throw new PptxInvalidError(t('pptxInvalid'));
          lib = library;
          pres = presentation;

          root = document.createElement('div');
          root.className = 'yss-file-preview-pptx';
          container.appendChild(root);

          if (!presentation.slides.length) {
            showEmpty();
            return;
          }
          const notice = pptxNoticeOf(
            presentation.slides.length,
            data.byteLength,
            context.largeFileWarnSize,
            t,
            context.locale
          );
          if (notice) root.appendChild(createNoticeBar(notice, 'yss-file-preview__notice-bar--sticky'));
          root.appendChild(buildList(presentation));
          layout();
          for (let i = 0; i < Math.min(EAGER_SLIDES, items.length); i += 1) renderSlide(i);
          watch();
        },
        resize() {
          lastWidth = -1;
          layout();
        },
        destroy() {
          observer?.disconnect();
          observer = null;
          resizeObserver?.disconnect();
          resizeObserver = null;
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = null;
          unguards.splice(0).forEach(off => off());
          placeholders = new Map();
          handles.splice(0).forEach(handle => {
            try {
              handle.dispose();
            } catch {
              // 单页释放失败不影响其他页
            }
          });
          chartInstances.forEach(chart => {
            try {
              if (!chart.isDisposed()) chart.dispose();
            } catch {
              // 同上
            }
          });
          chartInstances.clear();
          chartXml = null;
          chartFonts.clear();
          if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            mediaUrlCache.forEach(url => URL.revokeObjectURL(url));
          }
          mediaUrlCache.clear();
          root?.remove();
          root = null;
          lib = null;
          pres = null;
          items.length = 0;
          lastWidth = -1;
        },
      };
    },
  };
}

/** 默认 pptx 渲染器（通过 `import('@aiden0z/pptx-renderer')` 加载），可直接传给 registerPreviewRenderer */
export const pptxRenderer: PreviewRenderer = createPptxRenderer();
