/**
 * 图片渲染器：png、jpg、gif、webp、svg、bmp、ico，不依赖第三方库。
 *
 * - 一律用 <img src="blob:..."> 显示，SVG 也不写入 innerHTML：作为图片加载的 SVG 不会执行脚本和事件属性；
 * - 默认适应容器（小图不放大），支持缩放（按钮、Ctrl / ⌘ + 滚轮）、1:1 / 适应切换、旋转、重置、拖动平移、双击切换；
 * - 键盘 + - 0 r R 只在焦点位于图片区域时生效，方向键仍留给弹窗翻页。
 */
import {
  ExpandOutlined,
  OneToOneOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons-vue';
import { createVNode, render as vueRender, type Component } from 'vue';
import {
  IMAGE_FILE_TYPES,
  IMAGE_MAX_DISPLAY_SIZE,
  IMAGE_MAX_SCALE,
  IMAGE_MIME_MAP,
  IMAGE_MIN_SCALE,
  IMAGE_ZOOM_STEP,
} from '../constant';
import type { ImageFileType } from '../types';
import { sniffImageKind } from '../utils/detect';
import { isWheelNotch, PINCH_IDLE_MS, PINCH_ZOOM_SENSITIVITY, wheelDeltaPx } from '../utils/zoom';
import type { PreviewRenderer, PreviewRendererInstance, PreviewZoomController, RenderContext } from './types';

/** 适应窗口时与容器边缘保留的距离；底部多留出浮动工具栏的高度 */
const FIT_PADDING_X = 32;
const FIT_PADDING_Y = 112;

type ToolKey = 'zoomOut' | 'zoomIn' | 'toggleFit' | 'rotateLeft' | 'rotateRight' | 'reset';

const isImageType = (type: string): type is ImageFileType => (IMAGE_FILE_TYPES as readonly string[]).includes(type);

/** 按内容决定 MIME（.jpg 实际是 PNG 时按 PNG 显示），识别不出时按声明的类型 */
export function resolveImageMime(data: ArrayBuffer, declaredType: string): string {
  const kind = sniffImageKind(new Uint8Array(data)) ?? (isImageType(declaredType) ? declaredType : 'png');
  return IMAGE_MIME_MAP[kind];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function createButton(label: string, icon: Component | null, text?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yss-file-preview-image__btn';
  button.setAttribute('aria-label', label);
  button.title = label;
  if (icon) {
    const holder = document.createElement('span');
    holder.className = 'yss-file-preview-image__icon';
    holder.setAttribute('aria-hidden', 'true');
    vueRender(createVNode(icon), holder);
    button.appendChild(holder);
  }
  if (text) button.append(text);
  return button;
}

export const imageRenderer: PreviewRenderer = {
  types: [...IMAGE_FILE_TYPES],
  create() {
    let root: HTMLElement | null = null;
    let url: string | null = null;
    const iconHolders: HTMLElement[] = [];
    let relayout: (() => void) | null = null;
    const zoomListeners = new Set<(zoom: number, info?: { live?: boolean }) => void>();
    let zoomApi: { get(): number; set(z: number): void; fit(): number } | null = null;

    const cleanup = () => {
      for (const holder of iconHolders) vueRender(null, holder);
      iconHolders.length = 0;
      if (url) URL.revokeObjectURL(url);
      url = null;
      root?.remove();
      root = null;
      relayout = null;
      zoomApi = null;
      zoomListeners.clear();
    };

    const zoom: PreviewZoomController = {
      get: () => zoomApi?.get() ?? 1,
      set: z => zoomApi?.set(z),
      fit: () => zoomApi?.fit(),
      range: { min: IMAGE_MIN_SCALE, max: IMAGE_MAX_SCALE },
      onChange(listener) {
        zoomListeners.add(listener);
        return () => zoomListeners.delete(listener);
      },
    };

    const instance: PreviewRendererInstance = {
      async render(container: HTMLElement, data: ArrayBuffer, context: RenderContext) {
        if (context.signal.aborted) return;
        const { t } = context;

        root = document.createElement('div');
        root.className = 'yss-file-preview-image';
        root.tabIndex = 0;
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', t('imageViewer', { name: context.fileName }));

        const viewport = document.createElement('div');
        viewport.className = 'yss-file-preview-image__viewport';
        // Ctrl / ⌘ + 滚轮由这里按鼠标位置缩放，外壳不再处理
        viewport.dataset.previewZoom = 'self';
        const stage = document.createElement('div');
        stage.className = 'yss-file-preview-image__stage';
        const img = document.createElement('img');
        img.className = 'yss-file-preview-image__img';
        img.alt = context.fileName;
        img.draggable = false;
        img.decoding = 'async';
        stage.appendChild(img);
        viewport.appendChild(stage);

        const toolbar = document.createElement('div');
        toolbar.className = 'yss-file-preview-image__toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', t('imageToolbar'));
        const percent = document.createElement('span');
        percent.className = 'yss-file-preview-image__percent';
        percent.setAttribute('aria-live', 'polite');

        const buttons: Record<ToolKey, HTMLButtonElement> = {
          zoomOut: createButton(t('imageZoomOut'), ZoomOutOutlined),
          zoomIn: createButton(t('imageZoomIn'), ZoomInOutlined),
          toggleFit: createButton(t('imageActualSize'), OneToOneOutlined),
          rotateLeft: createButton(t('imageRotateLeft'), RotateLeftOutlined),
          rotateRight: createButton(t('imageRotateRight'), RotateRightOutlined),
          reset: createButton(t('imageReset'), UndoOutlined),
        };
        for (const button of Object.values(buttons)) {
          const holder = button.querySelector<HTMLElement>('.yss-file-preview-image__icon');
          if (holder) iconHolders.push(holder);
        }
        const divider = document.createElement('span');
        divider.className = 'yss-file-preview-image__divider';
        divider.setAttribute('aria-hidden', 'true');
        // 缩放控件在外壳（弹窗头部）时，这里只保留适应 / 原始尺寸、旋转与重置
        if (context.externalZoomControl) toolbar.classList.add('is-zoom-external');
        else toolbar.append(buttons.zoomOut, percent, buttons.zoomIn, divider);
        toolbar.append(
          buttons.toggleFit,
          buttons.rotateLeft,
          buttons.rotateRight,
          buttons.reset
        );

        root.append(viewport, toolbar);
        container.appendChild(root);

        url = URL.createObjectURL(new Blob([data], { type: resolveImageMime(data, context.fileType) }));
        const loaded = await new Promise<boolean>((resolve, reject) => {
          const onAbort = () => resolve(false);
          context.signal.addEventListener('abort', onAbort, { once: true });
          img.onload = () => {
            context.signal.removeEventListener('abort', onAbort);
            resolve(true);
          };
          img.onerror = () => {
            context.signal.removeEventListener('abort', onAbort);
            reject(new Error(t('imageLoadFailed')));
          };
          img.src = url!;
        });
        if (!loaded || context.signal.aborted || !root) return;

        // ---- 状态 ----
        // 没有固有尺寸的 SVG（只有 viewBox）naturalWidth 为 0，按容器大小显示
        const naturalWidth = img.naturalWidth || Math.max(1, viewport.clientWidth - FIT_PADDING_X) || 300;
        const naturalHeight = img.naturalHeight || Math.max(1, viewport.clientHeight - FIT_PADDING_Y) || 150;
        let rotation = 0;
        let fit = true;
        let scale = 1;

        const rotatedSize = () =>
          rotation % 180 === 0 ? [naturalWidth, naturalHeight] : [naturalHeight, naturalWidth];
        const fitScale = () => {
          const [w, h] = rotatedSize();
          const availableWidth = viewport.clientWidth - FIT_PADDING_X;
          const availableHeight = viewport.clientHeight - FIT_PADDING_Y;
          if (availableWidth <= 0 || availableHeight <= 0) return 1;
          return Math.min(1, availableWidth / w!, availableHeight / h!);
        };
        const maxScale = () =>
          Math.max(
            fitScale(),
            Math.min(IMAGE_MAX_SCALE, IMAGE_MAX_DISPLAY_SIZE / Math.max(naturalWidth, naturalHeight))
          );
        const minScale = () => Math.min(IMAGE_MIN_SCALE, fitScale());

        let reported = Number.NaN;
        /** 捏合进行中：只通知外壳实时的百分比，停下后再通知最终比例 */
        let live = false;
        let fitIcon: boolean | null = null;
        const apply = () => {
          if (fit) scale = fitScale();
          scale = clamp(scale, minScale(), maxScale());
          const width = naturalWidth * scale;
          const height = naturalHeight * scale;
          const [boxWidth, boxHeight] = rotation % 180 === 0 ? [width, height] : [height, width];
          img.style.width = `${width}px`;
          img.style.height = `${height}px`;
          img.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
          stage.style.width = `${Math.max(boxWidth, viewport.clientWidth)}px`;
          stage.style.height = `${Math.max(boxHeight, viewport.clientHeight)}px`;
          const pannable = boxWidth > viewport.clientWidth || boxHeight > viewport.clientHeight;
          viewport.classList.toggle('is-pannable', pannable);
          root!.dataset.scale = String(Math.round(scale * 1000) / 1000);
          root!.dataset.rotation = String(rotation);
          root!.dataset.fit = String(fit);
          percent.textContent = `${Math.round(scale * 100)}%`;
          buttons.zoomIn.disabled = scale >= maxScale() - 1e-6;
          buttons.zoomOut.disabled = scale <= minScale() + 1e-6;
          const toggleLabel = fit ? t('imageActualSize') : t('imageFit');
          buttons.toggleFit.setAttribute('aria-label', toggleLabel);
          buttons.toggleFit.title = toggleLabel;
          // 图标只在适应 / 原始尺寸切换时重新渲染（捏合时每帧都会调用 apply）
          if (fitIcon !== fit) {
            fitIcon = fit;
            const holder = buttons.toggleFit.querySelector<HTMLElement>('.yss-file-preview-image__icon');
            if (holder) vueRender(createVNode(fit ? OneToOneOutlined : ExpandOutlined), holder);
          }
          const rounded = Math.round(scale * 10000) / 10000;
          if (live) zoomListeners.forEach(fn => fn(rounded, { live: true }));
          else if (rounded !== reported) {
            reported = rounded;
            zoomListeners.forEach(fn => fn(rounded));
          }
        };

        /** 以视口内某点为锚点缩放，锚点下的内容保持不动；默认锚点为视口中心 */
        const zoomTo = (next: number, anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2) => {
          const previous = scale;
          const oldWidth = stage.offsetWidth || viewport.clientWidth;
          const oldHeight = stage.offsetHeight || viewport.clientHeight;
          const offsetX = viewport.scrollLeft + anchorX - oldWidth / 2;
          const offsetY = viewport.scrollTop + anchorY - oldHeight / 2;
          fit = false;
          scale = next;
          apply();
          const ratio = scale / previous;
          const newWidth = stage.offsetWidth || viewport.clientWidth;
          const newHeight = stage.offsetHeight || viewport.clientHeight;
          viewport.scrollLeft = newWidth / 2 + offsetX * ratio - anchorX;
          viewport.scrollTop = newHeight / 2 + offsetY * ratio - anchorY;
        };
        const zoomBy = (factor: number, anchorX?: number, anchorY?: number) => zoomTo(scale * factor, anchorX, anchorY);
        const centerScroll = () => {
          viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
          viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
        };
        const setFit = () => {
          fit = true;
          apply();
          centerScroll();
        };
        const rotate = (delta: number) => {
          rotation = (rotation + delta + 360) % 360;
          apply();
          centerScroll();
        };
        const reset = () => {
          rotation = 0;
          setFit();
        };
        const toggleFit = (anchorX?: number, anchorY?: number) => {
          if (fit) zoomTo(1, anchorX, anchorY);
          else setFit();
        };

        buttons.zoomIn.addEventListener('click', () => zoomBy(IMAGE_ZOOM_STEP));
        buttons.zoomOut.addEventListener('click', () => zoomBy(1 / IMAGE_ZOOM_STEP));
        buttons.toggleFit.addEventListener('click', () => toggleFit());
        buttons.rotateLeft.addEventListener('click', () => rotate(-90));
        buttons.rotateRight.addEventListener('click', () => rotate(90));
        buttons.reset.addEventListener('click', reset);

        const pointInViewport = (event: MouseEvent) => {
          const rect = viewport.getBoundingClientRect();
          return [event.clientX - rect.left, event.clientY - rect.top] as const;
        };

        // Ctrl / ⌘ + 滚轮缩放，普通滚轮照常滚动。鼠标滚轮一格按步长；触控板双指捏合（也是带 ctrlKey 的 wheel）
        // 按 deltaY 连续缩放，事件按 requestAnimationFrame 合并成每帧一次布局
        let pinchFactor = 1;
        let pinchAt: readonly [number, number] = [0, 0];
        let pinchFrame: unknown = null;
        let pinchTimer: ReturnType<typeof setTimeout> | null = null;
        let safariGesture: { scale: number } | null = null;
        const endLive = () => {
          if (pinchTimer !== null) clearTimeout(pinchTimer);
          pinchTimer = null;
          if (!live) return;
          live = false;
          if (root) apply();
        };
        const schedulePinch = (factor: number, at: readonly [number, number], autoEnd: boolean) => {
          pinchFactor *= factor;
          pinchAt = at;
          live = true;
          if (pinchFrame === null) {
            const raf =
              typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame
                : (cb: () => void) => setTimeout(cb, 16);
            pinchFrame = raf(() => {
              pinchFrame = null;
              const f = pinchFactor;
              pinchFactor = 1;
              if (root) zoomBy(f, pinchAt[0], pinchAt[1]);
            });
          }
          if (pinchTimer !== null) clearTimeout(pinchTimer);
          pinchTimer = autoEnd ? setTimeout(endLive, PINCH_IDLE_MS) : null;
        };
        viewport.addEventListener(
          'wheel',
          event => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            if (safariGesture) return;
            const at = pointInViewport(event);
            if (isWheelNotch(event) && !live) {
              zoomBy(event.deltaY < 0 ? IMAGE_ZOOM_STEP : 1 / IMAGE_ZOOM_STEP, at[0], at[1]);
              return;
            }
            const px = wheelDeltaPx(event.deltaY, event.deltaMode);
            schedulePinch(clamp(Math.exp(-px * PINCH_ZOOM_SENSITIVITY), 0.5, 2), at, true);
          },
          { passive: false }
        );
        // Safari（macOS 触控板捏合）：gesture* 事件的 scale 为相对手势开始的倍数
        type GestureLike = Event & { scale?: number; clientX: number; clientY: number };
        viewport.addEventListener('gesturestart', event => {
          event.preventDefault();
          safariGesture = { scale: 1 };
        });
        viewport.addEventListener('gesturechange', event => {
          const g = event as GestureLike;
          if (!safariGesture || !(typeof g.scale === 'number' && g.scale > 0)) return;
          event.preventDefault();
          schedulePinch(g.scale / safariGesture.scale, pointInViewport(g as unknown as MouseEvent), false);
          safariGesture.scale = g.scale;
        });
        viewport.addEventListener('gestureend', event => {
          event.preventDefault();
          safariGesture = null;
          endLive();
        });

        viewport.addEventListener('dblclick', event => {
          const [x, y] = pointInViewport(event);
          toggleFit(x, y);
        });

        // 图片比容器大时拖动平移
        let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
        viewport.addEventListener('pointerdown', event => {
          root?.focus({ preventScroll: true });
          if (event.button !== 0 || !viewport.classList.contains('is-pannable')) return;
          drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          viewport.setPointerCapture?.(event.pointerId);
          viewport.classList.add('is-dragging');
          event.preventDefault();
        });
        viewport.addEventListener('pointermove', event => {
          if (!drag || event.pointerId !== drag.id) return;
          viewport.scrollLeft = drag.left - (event.clientX - drag.x);
          viewport.scrollTop = drag.top - (event.clientY - drag.y);
        });
        const endDrag = (event: PointerEvent) => {
          if (!drag || event.pointerId !== drag.id) return;
          viewport.releasePointerCapture?.(event.pointerId);
          viewport.classList.remove('is-dragging');
          drag = null;
        };
        viewport.addEventListener('pointerup', endDrag);
        viewport.addEventListener('pointercancel', endDrag);

        // 键盘：只在焦点位于图片区域内时响应，不处理方向键，避免和弹窗翻页冲突
        root.addEventListener('keydown', event => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const handlers: Record<string, () => void> = {
            '+': () => zoomBy(IMAGE_ZOOM_STEP),
            '=': () => zoomBy(IMAGE_ZOOM_STEP),
            '-': () => zoomBy(1 / IMAGE_ZOOM_STEP),
            _: () => zoomBy(1 / IMAGE_ZOOM_STEP),
            '0': reset,
            r: () => rotate(90),
            R: () => rotate(-90),
          };
          const handler = handlers[event.key];
          if (!handler) return;
          event.preventDefault();
          handler();
        });

        relayout = () => {
          apply();
          if (fit) centerScroll();
        };
        zoomApi = {
          get: () => Math.round(scale * 10000) / 10000,
          set: z => zoomTo(z),
          fit: () => {
            setFit();
            return Math.round(scale * 10000) / 10000;
          },
        };
        if (typeof context.zoom === 'number' && Number.isFinite(context.zoom) && context.zoom > 0) {
          zoomTo(context.zoom);
          centerScroll();
        } else {
          apply();
          centerScroll();
        }
      },
      resize() {
        relayout?.();
      },
      destroy() {
        cleanup();
      },
      zoom,
    };
    return instance;
  },
};

export default imageRenderer;
