import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FilePreview from '../index.vue';
import { createPptxRenderer, pptxRenderer, registerPptxRenderer } from '../pptx';
import { getRenderer } from '../renderers/registry';
import type { RenderContext } from '../renderers/types';

interface MockSlide {
  index: number;
  hidden?: boolean;
  sourceXml?: string;
}

interface MockDeck {
  width: number;
  height: number;
  slides: MockSlide[];
}

interface MockChart {
  id: string;
  disposed: boolean;
  isDisposed: () => boolean;
  dispose: () => void;
}

const state = vi.hoisted(() => ({
  pending: null as null | (() => void),
  hold: false,
  deck: null as null | MockDeck,
  parseError: null as null | Error,
  failSlide: -1,
  parseCalls: [] as Array<{ data: ArrayBuffer; limits: unknown }>,
  buildCalls: [] as Array<unknown>,
  renderCalls: [] as Array<{ index: number; options: Record<string, any> }>,
  handles: [] as Array<{ index: number; dispose: ReturnType<typeof vi.fn> }>,
  charts: [] as MockChart[],
  withChart: false,
  /** 模拟库在页面插入后初始化 ECharts（与库一样在 requestAnimationFrame 里调用 chartInstances.add） */
  withEchart: false,
  /** 模拟库按 slide1 的图片关系画 <img>（src 记在 mediaUrlCache 里） */
  withImages: false,
  echarts: [] as Array<{ setOption: ReturnType<typeof vi.fn>; option: any }>,
  files: { presentation: '<p:presentation/>' } as unknown,
}));

const makeDeck = (count: number, width = 960, height = 540): MockDeck => ({
  width,
  height,
  slides: Array.from({ length: count }, (_, index) => ({ index, sourceXml: '<p:sld><p:cSld/></p:sld>' })),
});

const LIMITS = { maxEntries: 4000 };

vi.mock('@aiden0z/pptx-renderer', () => ({
  RECOMMENDED_ZIP_LIMITS: LIMITS,
  parseZip: vi.fn(
    (data: ArrayBuffer, limits: unknown) =>
      new Promise((resolve, reject) => {
        state.parseCalls.push({ data, limits });
        const finish = () => (state.parseError ? reject(state.parseError) : resolve(state.files));
        if (state.hold) state.pending = finish;
        else finish();
      })
  ),
  buildPresentation: vi.fn((_files: unknown, options: unknown) => {
    state.buildCalls.push(options);
    return state.deck ?? makeDeck(2);
  }),
  renderSlide: vi.fn((_pres: MockDeck, slide: MockSlide, options: Record<string, any>) => {
    state.renderCalls.push({ index: slide.index, options });
    if (slide.index === state.failSlide) throw new Error('boom');
    const element = document.createElement('div');
    element.className = 'mock-slide';
    element.textContent = `SLIDE ${slide.index + 1}`;
    if (state.withChart) {
      const chart: MockChart = {
        id: `chart-${state.charts.length}`,
        disposed: false,
        isDisposed: () => chart.disposed,
        dispose: () => {
          chart.disposed = true;
        },
      };
      state.charts.push(chart);
      options.chartInstances.add(chart);
      options.mediaUrlCache.set(`img-${slide.index}`, `blob:img-${slide.index}`);
    }
    if (state.withImages) {
      const rels = (state.files as { slideRels: Map<string, string> }).slideRels.get('ppt/slides/_rels/slide1.xml.rels')!;
      for (const [, target] of rels.matchAll(/relationships\/image" Target="\.\.\/([^"]+)"/g)) {
        const path = `ppt/${target}`;
        const url = `blob:media/${path}`;
        options.mediaUrlCache.set(path, url);
        const img = document.createElement('img');
        img.src = url;
        img.style.width = '100%';
        element.appendChild(img);
      }
    }
    if (state.withEchart) {
      (slide as MockSlide & { nodes?: unknown[] }).nodes = [
        { nodeType: 'chart', chartPath: 'ppt/charts/chart1.xml', position: { x: 10, y: 20 }, size: { w: 500, h: 300 } },
      ];
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'absolute', left: '10px', top: '20px', width: '500px', height: '300px' });
      const dom = document.createElement('div');
      host.appendChild(dom);
      element.appendChild(host);
      const option: any = { legend: [{ show: true, textStyle: { fontSize: 10 } }], series: [] };
      const echart = {
        option,
        getDom: () => dom,
        getOption: () => option,
        setOption: vi.fn((patch: any) => Object.assign(option, patch)),
        isDisposed: () => false,
        dispose: () => undefined,
      };
      state.echarts.push(echart);
      Promise.resolve().then(() => {
        dom.setAttribute('_echarts_instance_', 'ec');
        options.chartInstances.add(echart);
      });
    }
    const handle = { index: slide.index, dispose: vi.fn() };
    state.handles.push(handle);
    return { element, ready: Promise.resolve(), dispose: handle.dispose };
  }),
}));

/** zip 文件头 + 任意内容 */
const zipBuffer = (text = 'ppt/presentation.xml') => {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(4 + body.length);
  out.set([0x50, 0x4b, 0x03, 0x04]);
  out.set(body, 4);
  return out.buffer;
};

const createContext = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  fileName: 'deck.pptx',
  fileType: 'pptx',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t: (key, params) => (params ? `${key}:${Object.values(params).join('/')}` : key),
  appContext: null,
  ...overrides,
});

/** happy-dom 不做布局：按类名给幻灯片外框一个可控的宽度 */
let slideWidth = 800;
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

/** 可控的 IntersectionObserver：trigger(i) 模拟第 i 页滚动到附近 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  observed: Element[] = [];
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter(e => e !== el);
  }
  disconnect = vi.fn(() => {
    this.observed = [];
  });
  trigger(index: number) {
    const target = this.observed.find(el => (el as HTMLElement).dataset.index === String(index));
    if (target)
      this.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], this as never);
  }
}

const items = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>('.yss-file-preview-pptx__item'));
const renderedCount = (root: ParentNode) => root.querySelectorAll('.yss-file-preview-pptx__canvas .mock-slide').length;

describe('file-preview pptx 渲染器（实验性，@aiden0z/pptx-renderer）', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state.hold = false;
    state.pending = null;
    state.deck = null;
    state.parseError = null;
    state.failSlide = -1;
    state.parseCalls = [];
    state.buildCalls = [];
    state.renderCalls = [];
    state.handles = [];
    state.charts = [];
    state.withChart = false;
    state.withEchart = false;
    state.withImages = false;
    state.echarts = [];
    state.files = { presentation: '<p:presentation/>' };
    slideWidth = 800;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('yss-file-preview-pptx__slide') ? slideWidth : 0;
      },
    });
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    container.remove();
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('使用底层 API：parseZip（带放宽后的 zip 上限）→ buildPresentation（lazySlides）→ 逐页 renderSlide', async () => {
    const instance = pptxRenderer.create();
    const data = zipBuffer();
    await instance.render(container, data, createContext());
    // 以库的推荐值为基础，按文件大小放宽（小文件取下限）
    expect(state.parseCalls).toEqual([
      {
        data,
        limits: {
          ...LIMITS,
          maxConcurrency: 8,
          maxEntries: 10000,
          maxEntryUncompressedBytes: 64 * 1024 * 1024,
          maxTotalUncompressedBytes: 256 * 1024 * 1024,
          maxMediaBytes: 192 * 1024 * 1024,
        },
      },
    ]);
    expect(state.buildCalls).toEqual([{ lazySlides: true }]);
    expect(state.renderCalls.map(call => call.index)).toEqual([0, 1]);
    // 外部链接媒体不自动请求；图表与图片 URL 用本实例自己的集合
    const [first, second] = state.renderCalls;
    expect(first!.options.externalMedia).toBe('block');
    expect(first!.options.chartInstances).toBeInstanceOf(Set);
    expect(first!.options.mediaUrlCache).toBeInstanceOf(Map);
    expect(second!.options.chartInstances).toBe(first!.options.chartInstances);
    expect(items(container)).toHaveLength(2);
    expect(renderedCount(container)).toBe(2);
    instance.destroy?.();
  });

  it('按幻灯片尺寸等比缩放到容器宽度：16:9', async () => {
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    const slide = container.querySelector<HTMLElement>('.yss-file-preview-pptx__slide')!;
    const canvas = container.querySelector<HTMLElement>('.yss-file-preview-pptx__canvas')!;
    expect(canvas.style.width).toBe('960px');
    expect(canvas.style.height).toBe('540px');
    expect(canvas.style.transform).toBe(`scale(${800 / 960})`);
    expect(slide.style.height).toBe('450px');
    instance.destroy?.();
  });

  it('4:3 与竖版自定义尺寸保持比例', async () => {
    state.deck = makeDeck(1, 720, 540);
    const a = pptxRenderer.create();
    await a.render(container, zipBuffer(), createContext());
    expect(container.querySelector<HTMLElement>('.yss-file-preview-pptx__slide')!.style.height).toBe('600px');
    expect(container.querySelector<HTMLElement>('.yss-file-preview-pptx__canvas')!.style.transform).toBe(
      `scale(${800 / 720})`
    );
    a.destroy?.();

    state.deck = makeDeck(1, 540, 720);
    const b = pptxRenderer.create();
    await b.render(container, zipBuffer(), createContext());
    expect(container.querySelector<HTMLElement>('.yss-file-preview-pptx__slide')!.style.height).toBe('1066.67px');
    b.destroy?.();
  });

  it('resize：重新计算缩放，不重新解析也不重新绘制', async () => {
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    const canvas = container.querySelector<HTMLElement>('.yss-file-preview-pptx__canvas')!;
    slideWidth = 1440;
    instance.resize?.();
    expect(canvas.style.transform).toBe('scale(1.5)');
    expect(container.querySelector<HTMLElement>('.yss-file-preview-pptx__slide')!.style.height).toBe('810px');
    slideWidth = 480;
    instance.resize?.();
    expect(canvas.style.transform).toBe('scale(0.5)');
    expect(state.parseCalls).toHaveLength(1);
    expect(state.renderCalls).toHaveLength(2);
    instance.destroy?.();
  });

  it('每页显示页码；隐藏页加标记（已解析的 hidden 与未解析的 show="0" 都识别）', async () => {
    state.deck = makeDeck(4);
    state.deck.slides[1]!.sourceXml = '<?xml version="1.0"?><p:sld xmlns:p="x" show="0"><p:cSld/></p:sld>';
    state.deck.slides[2]!.hidden = true;
    // 子元素里的 show 属性不算
    state.deck.slides[3]!.sourceXml = '<p:sld><p:cSld><p:x show="0"/></p:cSld></p:sld>';
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    const pages = Array.from(container.querySelectorAll('.yss-file-preview-pptx__page')).map(el => el.textContent);
    expect(pages).toEqual(['pptxPage:1/4', 'pptxPage:2/4pptxHidden', 'pptxPage:3/4pptxHidden', 'pptxPage:4/4']);
    expect(items(container)[1]!.classList.contains('is-hidden')).toBe(true);
    expect(container.querySelector('.yss-file-preview-pptx__slide')!.getAttribute('aria-label')).toBe('pptxPage:1/4');
    instance.destroy?.();
  });

  it('上百页：先画前 3 页，其余滚动到附近时才画', async () => {
    state.deck = makeDeck(100);
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    expect(items(container)).toHaveLength(100);
    expect(renderedCount(container)).toBe(3);
    const [observer] = MockIntersectionObserver.instances;
    expect(observer!.options?.root).toBe(container.querySelector('.yss-file-preview-pptx'));
    expect(observer!.observed).toHaveLength(97);
    observer!.trigger(57);
    expect(renderedCount(container)).toBe(4);
    expect(items(container)[57]!.textContent).toContain('SLIDE 58');
    // 已画过的不再观察，也不重复绘制
    observer!.trigger(57);
    expect(renderedCount(container)).toBe(4);
    expect(observer!.observed).toHaveLength(96);
    instance.destroy?.();
    expect(observer!.disconnect).toHaveBeenCalled();
  });

  it('不支持 IntersectionObserver 时分批绘制全部', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.useFakeTimers();
    state.deck = makeDeck(20);
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    expect(renderedCount(container)).toBe(7);
    await vi.runAllTimersAsync();
    expect(renderedCount(container)).toBe(20);
    instance.destroy?.();
  });

  it('单页绘制失败只影响该页', async () => {
    state.deck = makeDeck(3);
    state.failSlide = 1;
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    expect(items(container)[1]!.textContent).toContain('pptxSlideError');
    expect(renderedCount(container)).toBe(2);
    instance.destroy?.();
  });

  it('没有幻灯片：显示空提示', async () => {
    state.deck = makeDeck(0);
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    expect(container.querySelector('.yss-file-preview-pptx__empty')?.textContent).toBe('pptxNoSlides');
    expect(items(container)).toHaveLength(0);
    instance.destroy?.();
  });

  it('不是 zip、空文件、解析失败、缺少 presentation.xml：抛出可读的错误', async () => {
    await expect(
      pptxRenderer.create().render(container, new TextEncoder().encode('not a zip').buffer, createContext())
    ).rejects.toThrow('pptxInvalid');
    await expect(pptxRenderer.create().render(container, new ArrayBuffer(0), createContext())).rejects.toThrow(
      'pptxInvalid'
    );
    expect(state.parseCalls).toHaveLength(0);

    state.parseError = new Error("Corrupted zip: can't find end of central directory");
    const broken = pptxRenderer.create();
    const err = await broken.render(container, zipBuffer(), createContext()).catch(e => e);
    expect(err).toMatchObject({ name: 'PptxInvalidError', message: 'pptxInvalid' });
    expect((err as { cause?: Error }).cause?.message).toContain('Corrupted zip');
    broken.destroy?.();

    // 超出解压上限（条目过多 / 解压后过大）：提示超出预览上限，而不是「文件损坏」
    state.parseError = new Error('PPTX zip limit exceeded: total uncompressed size');
    const huge = await pptxRenderer.create().render(container, zipBuffer(), createContext()).catch(e => e);
    expect(huge).toMatchObject({ name: 'PptxInvalidError', message: 'pptxTooLarge' });

    state.parseError = null;
    // zip 里没有 ppt/presentation.xml（例如改了扩展名的 docx）
    state.files = { presentation: '' };
    await expect(pptxRenderer.create().render(container, zipBuffer(), createContext())).rejects.toThrow('pptxInvalid');
    expect(state.buildCalls).toHaveLength(0);

    state.files = { presentation: '<p:presentation/>' };
    state.deck = { width: 0, height: 0, slides: [] };
    await expect(pptxRenderer.create().render(container, zipBuffer(), createContext())).rejects.toThrow('pptxInvalid');
    expect(container.innerHTML).toBe('');
  });

  it('destroy：释放每页句柄、本实例的图表与图片 URL，并移除 DOM', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { revokeObjectURL: revoke }));
    state.withChart = true;
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    instance.destroy?.();
    expect(state.handles.every(handle => handle.dispose.mock.calls.length === 1)).toBe(true);
    expect(state.charts.every(chart => chart.disposed)).toBe(true);
    expect(revoke.mock.calls.map(call => call[0])).toEqual(['blob:img-0', 'blob:img-1']);
    expect(container.innerHTML).toBe('');
    expect(() => instance.resize?.()).not.toThrow();
    expect(() => instance.destroy?.()).not.toThrow();
  });

  it('图表初始化后按图表 XML 修正字号（库把单独设置的 pt 当作 px）', async () => {
    state.withEchart = true;
    state.files = {
      presentation: '<p:presentation/>',
      charts: new Map([
        [
          'ppt/charts/chart1.xml',
          '<c:chartSpace><c:chart><c:plotArea/><c:legend><c:txPr><a:p><a:pPr><a:defRPr sz="1000"/></a:pPr></a:p></c:txPr></c:legend></c:chart></c:chartSpace>',
        ],
      ]),
    };
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    await vi.waitFor(() => expect(state.echarts[0]?.setOption).toHaveBeenCalled());
    expect(state.echarts[0]!.option.legend[0]).toMatchObject({ textStyle: { fontSize: 13.33 }, itemWidth: 13.33 });
    const set = state.renderCalls[0]!.options.chartInstances as Set<unknown>;
    expect(set.has(state.echarts[0])).toBe(true);
    instance.destroy?.();
    expect(set.size).toBe(0);
  });

  it('图表修正出错时不影响库：图表照常登记', async () => {
    state.withEchart = true;
    state.files = { presentation: '<p:presentation/>', charts: 'not a map' };
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    const set = state.renderCalls[0]!.options.chartInstances as Set<unknown>;
    await vi.waitFor(() => expect(set.size).toBe(2));
    // 找不到图表 XML：不改字号（图例保持库的 10px）
    expect(state.echarts[0]!.option.legend[0].textStyle.fontSize).toBe(10);
    // getDom 抛错也不影响登记
    const broken = {
      getDom: () => {
        throw new Error('x');
      },
      getOption: () => ({}),
      isDisposed: () => false,
      dispose: vi.fn(),
    };
    expect(() => set.add(broken)).not.toThrow();
    expect(set.has(broken)).toBe(true);
    instance.destroy?.();
    expect(broken.dispose).toHaveBeenCalled();
  });

  it('多个预览互不影响：销毁其中一个只释放它自己的图表', async () => {
    state.withChart = true;
    const a = pptxRenderer.create();
    const b = pptxRenderer.create();
    const boxA = document.createElement('div');
    const boxB = document.createElement('div');
    container.append(boxA, boxB);
    await a.render(boxA, zipBuffer(), createContext());
    await b.render(boxB, zipBuffer(), createContext());
    const setA = state.renderCalls[0]!.options.chartInstances as Set<MockChart>;
    const setB = state.renderCalls.find(call => call.options.chartInstances !== setA)!.options
      .chartInstances as Set<MockChart>;
    expect(setA).not.toBe(setB);
    a.destroy?.();
    expect([...setB].every(chart => !chart.disposed)).toBe(true);
    expect(setB.size).toBe(2);
    expect(boxB.querySelectorAll('.mock-slide')).toHaveLength(2);
    b.destroy?.();
    expect(state.charts.every(chart => chart.disposed)).toBe(true);
  });

  it('解析中取消：render 立即结束，不等库返回', async () => {
    state.hold = true;
    const controller = new AbortController();
    const instance = pptxRenderer.create();
    const done = instance.render(container, zipBuffer(), createContext({ signal: controller.signal }));
    await vi.waitFor(() => expect(state.pending).not.toBeNull());
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    instance.destroy?.();
    state.pending?.();
    expect(state.buildCalls).toHaveLength(0);
    expect(container.innerHTML).toBe('');
  });

  it('开始前已取消时不解析', async () => {
    const controller = new AbortController();
    controller.abort();
    await pptxRenderer.create().render(container, zipBuffer(), createContext({ signal: controller.signal }));
    expect(state.parseCalls).toHaveLength(0);
    expect(container.innerHTML).toBe('');
  });

  it('registerPptxRenderer 注册到全局注册表，返回的函数取消注册', async () => {
    expect(await getRenderer('pptx')).toBeNull();
    const unregister = registerPptxRenderer();
    expect((await getRenderer('pptx'))?.types).toEqual(['pptx']);
    unregister();
    expect(await getRenderer('pptx')).toBeNull();
  });

  it('注册后组件可渲染 pptx 并触发 loaded', async () => {
    const unregister = registerPptxRenderer();
    const wrapper = mount(FilePreview, { props: { source: zipBuffer('..ppt/slide1.xml'), fileName: 'deck.pptx' } });
    await vi.waitFor(() => expect(wrapper.emitted('loaded')?.[0]?.[0]).toMatchObject({ fileType: 'pptx' }));
    expect(wrapper.text()).toContain('SLIDE 1');
    wrapper.unmount();
    unregister();
  });

  it('图片：预处理后浏览器显示不了的图片标记为带说明的占位；解码失败的图片换成占位', async () => {
    const wmf = new Uint8Array(40);
    wmf.set([0xd7, 0xcd, 0xc6, 0x9a]);
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const image = (id: string, target: string) =>
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;
    state.files = {
      presentation: '<p:presentation/>',
      media: new Map([
        ['ppt/media/a.wmf', wmf],
        ['ppt/media/b.png', png],
      ]),
      slideRels: new Map([
        ['ppt/slides/_rels/slide1.xml.rels', `<Relationships>${image('rId1', '../media/a.wmf')}${image('rId2', '../media/b.png')}</Relationships>`],
      ]),
    };
    state.deck = makeDeck(1);
    state.withImages = true;
    const instance = pptxRenderer.create();
    await instance.render(container, zipBuffer(), createContext());
    const [placeholder, photo] = Array.from(container.querySelectorAll('img'));
    expect(placeholder!.dataset.yssPptxPlaceholder).toBe('unsupported:WMF');
    expect(placeholder!.alt).toBe('pptxImageUnsupported:WMF');
    expect(photo!.dataset.yssPptxPlaceholder).toBeUndefined();
    // 浏览器解码失败：换成「图片无法显示」，不显示裂图
    photo!.dispatchEvent(new Event('error'));
    const broken = container.querySelector<HTMLElement>('[data-yss-pptx-placeholder="broken"]');
    expect(broken?.getAttribute('aria-label')).toBe('pptxImageBroken');
    expect(photo!.parentNode).toBeNull();
    instance.destroy?.();
  });

  it('load 选项使用业务项目提供的库，并兼容只有默认导出的模块', async () => {
    const renderSlide = vi.fn(() => ({ element: document.createElement('div'), dispose: vi.fn() }));
    const lib = {
      parseZip: vi.fn(async () => ({ presentation: '<p:presentation/>' })),
      buildPresentation: vi.fn(() => makeDeck(1)),
      renderSlide,
    };
    const renderer = createPptxRenderer({ load: async () => ({ default: lib }) as never });
    const instance = renderer.create();
    await instance.render(container, zipBuffer(), createContext());
    expect(renderSlide).toHaveBeenCalledTimes(1);
    // 没有 RECOMMENDED_ZIP_LIMITS 时同样使用本组件的上限
    expect(lib.parseZip).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({ maxEntries: 10000 }));
    instance.destroy?.();
  });

  it('load 返回的模块不是 @aiden0z/pptx-renderer 时按缺少依赖处理', async () => {
    const renderer = createPptxRenderer({ load: async () => ({}) as never });
    await expect(renderer.create().render(container, zipBuffer(), createContext())).rejects.toMatchObject({
      name: 'MissingDependencyError',
    });
  });
});
