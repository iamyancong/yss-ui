import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_ZOOM_STEP } from '../constant';
import { imageRenderer, resolveImageMime } from '../renderers/image';
import type { PreviewRendererInstance, RenderContext } from '../renderers/types';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).buffer;
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__svgXss=1"><script>window.__svgXss=2</script></svg>'
).buffer;

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);
const createContext = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  fileName: 'photo.png',
  fileType: 'png',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t,
  appContext: null,
  ...overrides,
});

const setSize = (el: Element, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
};

describe('file-preview 图片渲染器', () => {
  let container: HTMLElement;
  let created: Blob[];
  let revoked: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    created = [];
    revoked = [];
    let seq = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      created.push(blob as Blob);
      return `blob:image/${++seq}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => {
      revoked.push(url);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  /** 开始渲染，模拟浏览器加载图片（happy-dom 不会解码图片） */
  const renderImage = async (
    data: ArrayBuffer = PNG,
    { width = 2000, height = 1000, viewport = [1032, 612] as [number, number], fail = false, context = createContext() } = {}
  ) => {
    const instance = imageRenderer.create();
    const done = instance.render(container, data, context);
    const root = container.lastElementChild as HTMLElement;
    const img = root.querySelector('img')!;
    expect(img).not.toBeNull();
    const view = root.querySelector('.yss-file-preview-image__viewport')!;
    setSize(view, viewport[0], viewport[1]);
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
    if (fail) img.onerror?.(new Event('error'));
    else img.onload?.(new Event('load'));
    return { instance, done, img, view, root };
  };
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  /** happy-dom 的 WheelEvent 不支持修饰键参数，这里补上 */
  const wheel = (deltaY: number, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) => {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'ctrlKey', { value: !!mods.ctrlKey });
    Object.defineProperty(event, 'metaKey', { value: !!mods.metaKey });
    return event;
  };
  const scaleOf = (root: HTMLElement) => Number(root.dataset.scale);

  it('按内容决定 MIME，未识别时按声明类型', () => {
    expect(resolveImageMime(PNG, 'jpg')).toBe('image/png');
    expect(resolveImageMime(SVG, 'svg')).toBe('image/svg+xml');
    expect(resolveImageMime(new ArrayBuffer(4), 'webp')).toBe('image/webp');
  });

  it('默认适应容器（不放大小图），工具栏有 aria-label', async () => {
    const { done, root, img } = await renderImage();
    await done;
    // 可用区域 (1032-32) x (612-112) = 1000 x 500，2000x1000 的图缩放 0.5
    expect(scaleOf(root)).toBe(0.5);
    expect(root.dataset.fit).toBe('true');
    expect(img.style.width).toBe('1000px');
    expect(root.getAttribute('aria-label')).toBe('imageViewer:{"name":"photo.png"}');
    expect(container.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('imageToolbar');
    expect(container.querySelector('.yss-file-preview-image__percent')?.textContent).toBe('50%');

    const small = await renderImage(PNG, { width: 100, height: 80 });
    await small.done;
    expect(scaleOf(small.root)).toBe(1);
  });

  it('SVG 只用 <img src="blob:"> 加载，不插入 DOM，脚本不会执行', async () => {
    const { done, img } = await renderImage(SVG, { context: createContext({ fileName: 'x.svg', fileType: 'svg' }) });
    await done;
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(created[0]?.type).toBe('image/svg+xml');
    expect(container.querySelector('svg script')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('__svgXss');
    expect((window as unknown as { __svgXss?: number }).__svgXss).toBeUndefined();
  });

  it('缩放、1:1 / 适应切换、旋转、重置', async () => {
    const { done, root, img } = await renderImage();
    await done;
    button('imageZoomIn').click();
    expect(scaleOf(root)).toBeCloseTo(0.5 * IMAGE_ZOOM_STEP, 3);
    expect(root.dataset.fit).toBe('false');
    button('imageZoomOut').click();
    expect(scaleOf(root)).toBeCloseTo(0.5, 3);

    // 切换按钮的含义随状态变化：非适应状态下是“适应窗口”，适应状态下是“原始尺寸”
    expect(button('imageActualSize')).toBeNull();
    button('imageFit').click();
    expect(root.dataset.fit).toBe('true');
    button('imageActualSize').click();
    expect(scaleOf(root)).toBe(1);
    button('imageFit').click();
    expect(root.dataset.fit).toBe('true');

    button('imageRotateRight').click();
    expect(root.dataset.rotation).toBe('90');
    expect(img.style.transform).toContain('rotate(90deg)');
    // 旋转后按宽高互换重新适应：1000x2000 放进 1000x500 → 0.25
    expect(scaleOf(root)).toBe(0.25);
    button('imageRotateLeft').click();
    button('imageRotateLeft').click();
    expect(root.dataset.rotation).toBe('270');

    button('imageZoomIn').click();
    button('imageReset').click();
    expect(root.dataset).toMatchObject({ rotation: '0', fit: 'true', scale: '0.5' });
  });

  it('缩放有上下限，到达时按钮禁用', async () => {
    const { done, root } = await renderImage(PNG, { width: 100, height: 100 });
    await done;
    for (let i = 0; i < 40; i++) button('imageZoomIn').click();
    expect(scaleOf(root)).toBe(8);
    expect(button('imageZoomIn').disabled).toBe(true);
    for (let i = 0; i < 60; i++) button('imageZoomOut').click();
    expect(scaleOf(root)).toBe(0.05);
    expect(button('imageZoomOut').disabled).toBe(true);
  });

  it('Ctrl / ⌘ + 滚轮缩放并阻止默认滚动，普通滚轮不处理', async () => {
    const { done, root, view } = await renderImage();
    await done;
    const plain = wheel(-300);
    view.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(scaleOf(root)).toBe(0.5);

    const zoom = wheel(-300, { ctrlKey: true });
    view.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(scaleOf(root)).toBeGreaterThan(0.5);

    const before = scaleOf(root);
    view.dispatchEvent(wheel(300, { metaKey: true }));
    expect(scaleOf(root)).toBeLessThan(before);
  });

  it('双击在适应窗口与原始尺寸之间切换', async () => {
    const { done, root, view } = await renderImage();
    await done;
    view.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(scaleOf(root)).toBe(1);
    view.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(root.dataset.fit).toBe('true');
  });

  it('键盘 + - 0 r R 只在图片区域内生效，方向键不处理', async () => {
    const { done, root } = await renderImage();
    await done;
    const press = (key: string, target: EventTarget = root) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    press('+');
    expect(scaleOf(root)).toBeCloseTo(0.625, 3);
    press('-');
    expect(scaleOf(root)).toBeCloseTo(0.5, 3);
    press('r');
    expect(root.dataset.rotation).toBe('90');
    press('R');
    expect(root.dataset.rotation).toBe('0');
    press('=');
    press('0');
    expect(root.dataset.fit).toBe('true');
    expect(press('ArrowRight').defaultPrevented).toBe(false);
    // 焦点不在图片区域时不响应
    press('+', window);
    expect(scaleOf(root)).toBe(0.5);
  });

  it('图片比视口大时可拖动平移', async () => {
    const { done, root, view } = await renderImage();
    await done;
    expect(view.classList.contains('is-pannable')).toBe(false);
    button('imageActualSize').click();
    expect(scaleOf(root)).toBe(1);
    expect(view.classList.contains('is-pannable')).toBe(true);
    view.scrollLeft = 100;
    view.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 200, clientY: 200, bubbles: true }));
    expect(view.classList.contains('is-dragging')).toBe(true);
    view.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 200, bubbles: true }));
    expect(view.scrollLeft).toBe(150);
    view.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(view.classList.contains('is-dragging')).toBe(false);
  });

  it('resize：适应模式下按新尺寸重新适应', async () => {
    const { done, root, view, instance } = await renderImage();
    await done;
    setSize(view, 2032, 1112);
    instance.resize?.();
    expect(scaleOf(root)).toBe(1);
  });

  it('图片无法解码时 render 抛出错误；destroy 释放 Blob URL 并移除 DOM', async () => {
    const failed = await renderImage(PNG, { fail: true });
    await expect(failed.done).rejects.toThrow('imageLoadFailed');
    failed.instance.destroy?.();
    expect(revoked).toContain('blob:image/1');
    expect(container.innerHTML).toBe('');

    const ok = await renderImage();
    await ok.done;
    ok.instance.destroy?.();
    expect(revoked).toContain('blob:image/2');
    expect(container.querySelector('.yss-file-preview-image')).toBeNull();
  });

  it('加载中取消：render 正常结束，destroy 后释放资源', async () => {
    const controller = new AbortController();
    const instance: PreviewRendererInstance = imageRenderer.create();
    const done = instance.render(container, PNG, createContext({ signal: controller.signal }));
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    instance.destroy?.();
    expect(revoked).toHaveLength(1);

    const pre = new AbortController();
    pre.abort();
    await imageRenderer.create().render(container, PNG, createContext({ signal: pre.signal }));
    expect(created).toHaveLength(1);
  });
});
