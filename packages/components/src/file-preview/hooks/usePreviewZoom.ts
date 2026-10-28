/**
 * YFilePreview 的缩放状态：v-model:zoom、范围与步进、每个文件独立记住比例，以及 Ctrl / ⌘ + 滚轮、快捷键、双指捏合。
 * 实际缩放由渲染器的 zoom 能力完成（见 renderers/types.ts 的 PreviewZoomController）。
 */
import { computed, reactive, ref, watch, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import type { PreviewZoomController } from '../renderers/types';
import type {
  FilePreviewFileType,
  FilePreviewProps,
  FilePreviewStatus,
  FilePreviewZoomInfo,
  FilePreviewZoomState,
} from '../types';
import {
  clampZoom,
  isFitMode,
  isWheelNotch,
  pinchZoom,
  isZoomableType,
  resolveZoomRange,
  roundZoom,
  stepZoom,
  wheelDeltaPx,
  zoomShortcut,
  ZoomGesture,
  ZoomMemory,
  type ZoomAnchor,
} from '../utils/zoom';

/** 外壳（弹窗头部）显示缩放控件时 provide，渲染器据此隐藏自己的放大 / 缩小按钮 */
export const FILE_PREVIEW_ZOOM_HOST: InjectionKey<boolean> = Symbol('yss.filePreview.zoomHost');

export interface UsePreviewZoomOptions {
  props: FilePreviewProps;
  emit: {
    (e: 'update:zoom', zoom: number): void;
    (e: 'zoom-change', zoom: number, info: FilePreviewZoomInfo): void;
  };
  controller: ShallowRef<PreviewZoomController | null>;
  status: Ref<FilePreviewStatus>;
  detectedType: Ref<FilePreviewFileType | null>;
  /** 是否由外壳显示缩放控件 */
  externalControl: boolean;
}

export function usePreviewZoom({
  props,
  emit,
  controller,
  status,
  detectedType,
  externalControl,
}: UsePreviewZoomOptions) {
  const memory = new ZoomMemory();
  /**
   * 连续缩放（触控板捏合、Safari gesture*、触摸屏双指）：每帧预览一次、只更新显示的百分比，
   * 结束后才真正应用并触发 update:zoom / zoom-change
   */
  const gesture = new ZoomGesture({
    preview(z, anchor) {
      const c = controller.value;
      if (!available.value || !c) return;
      const clamped = clampZoom(z, range.value);
      if (c.preview) c.preview(clamped, anchor);
      else c.set(clamped, anchor ? { anchor } : undefined);
      value.value = roundZoom(clamped);
    },
    commit(z, anchor) {
      setZoom(z, anchor);
    },
  });
  /** 挂载时的 zoom 作为没有记录的文件的初始比例；之后 v-model 回写的值是上一个文件的比例，不能沿用 */
  const initialZoom = props.zoom;
  const value = ref(1);
  /** 上一次通过 update:zoom / zoom-change 通知外部的比例 */
  let emitted = 1;

  const range = computed(() => resolveZoomRange(props, controller.value?.range));
  const available = computed(
    () => status.value === 'ready' && !!controller.value && isZoomableType(props.zoomable, detectedType.value)
  );
  const state = reactive({
    available,
    value,
    min: computed(() => range.value.min),
    max: computed(() => range.value.max),
    canFit: computed(() => !!controller.value?.fit),
  }) as FilePreviewZoomState;

  const commit = (zoom: number) => {
    const z = roundZoom(zoom);
    memory.set(props.source, z);
    value.value = z;
    // 捏合过程中 value 已实时更新（只用于显示），这里按上一次通知外部的值判断
    if (z === emitted) return;
    emitted = z;
    emit('update:zoom', z);
    emit('zoom-change', z, { fileType: detectedType.value });
  };

  const setZoom = (zoom: number, anchor?: ZoomAnchor) => {
    const c = controller.value;
    if (!available.value || !c) return;
    gesture.cancel();
    c.set(clampZoom(zoom, range.value), anchor ? { anchor } : undefined);
    // 渲染器可能再收敛一次（如图片按显示尺寸限制最大比例），以它实际的比例为准
    commit(c.get());
  };
  const zoomIn = () => setZoom(stepZoom(value.value, 1, props.zoomStep ?? 0, range.value));
  const zoomOut = () => setZoom(stepZoom(value.value, -1, props.zoomStep ?? 0, range.value));
  const resetZoom = () => setZoom(1);
  const fitZoom = (mode: 'width' | 'page' = 'width') => {
    const c = controller.value;
    if (!available.value || !c?.fit) return;
    const z = c.fit(mode);
    if (z !== undefined) commit(z);
  };

  /** 渲染前：本文件记住的比例，或挂载时传入的 zoom；都没有时由渲染器决定（表格 100%，图片适应窗口） */
  const zoomContext = (fileType: string) => {
    if (!isZoomableType(props.zoomable, fileType)) return { externalZoomControl: false };
    const remembered = memory.get(props.source);
    return {
      zoom: remembered ?? (isFitMode(props.zoomFit) ? undefined : initialZoom),
      externalZoomControl: externalControl,
    };
  };

  let unsubscribe: (() => void) | null = null;
  watch(controller, c => {
    unsubscribe?.();
    unsubscribe = null;
    if (!c || !isZoomableType(props.zoomable, detectedType.value)) return;
    gesture.cancel();
    unsubscribe =
      c.onChange?.((z, info) => {
        if (info?.live) value.value = roundZoom(z);
        else commit(z);
      }) ?? null;
    const remembered = memory.get(props.source);
    const target = remembered ?? (isFitMode(props.zoomFit) ? undefined : initialZoom);
    if (target !== undefined) {
      const z = clampZoom(target, range.value);
      if (Math.abs(c.get() - z) > 1e-6) c.set(z);
      commit(c.get());
    } else if (isFitMode(props.zoomFit) && c.fit) {
      commit(c.fit(props.zoomFit) ?? c.get());
    } else {
      commit(c.get());
    }
  });

  // 外部修改 v-model:zoom
  watch(
    () => props.zoom,
    z => {
      if (typeof z === 'number' && Number.isFinite(z) && roundZoom(z) !== value.value) setZoom(z);
    }
  );

  /** Ctrl / ⌘ + = / - / 0；处理了返回 true */
  const handleKeydown = (e: KeyboardEvent): boolean => {
    if (!available.value || e.defaultPrevented) return false;
    const action = zoomShortcut(e);
    if (!action) return false;
    e.preventDefault();
    if (action === 'in') zoomIn();
    else if (action === 'out') zoomOut();
    else resetZoom();
    return true;
  };

  const selfZoomed = (e: Event) => {
    const target = e.target as HTMLElement | null;
    return !!target && typeof target.closest === 'function' && !!target.closest('[data-preview-zoom="self"]');
  };
  const anchorOf = (e: { clientX: number; clientY: number }): ZoomAnchor | undefined =>
    Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX, y: e.clientY } : undefined;
  /** Safari 的 gesture* 进行中（它同时可能派发带 ctrlKey 的 wheel，忽略后者，避免重复缩放） */
  let safariGesture = false;

  /**
   * Ctrl / ⌘ + 滚轮；阻止浏览器整页缩放。
   * 鼠标滚轮一格按步长缩放；触控板双指捏合（也是带 ctrlKey 的 wheel，但每次只有几个像素）按 deltaY 连续缩放、跟手，
   * 以指针位置为锚点。
   * 在捕获阶段处理并停止传播：x-spreadsheet 会把滚轮当作滚动；自己处理缩放的区域（data-preview-zoom="self"，如图片按鼠标位置缩放）除外
   */
  const handleWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.defaultPrevented || !available.value) return;
    if (selfZoomed(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (safariGesture) return;
    const anchor = anchorOf(e);
    if (isWheelNotch(e) && !gesture.active) {
      setZoom(stepZoom(value.value, e.deltaY < 0 ? 1 : -1, props.zoomStep ?? 0, range.value), anchor);
      return;
    }
    gesture.begin(value.value);
    gesture.update(pinchZoom(gesture.current!, wheelDeltaPx(e.deltaY, e.deltaMode), range.value), anchor);
  };

  /** Safari（macOS 触控板捏合）：gesturestart / gesturechange / gestureend，e.scale 为相对手势开始的倍数 */
  let gestureBase = 1;
  const handleGestureStart = (e: Event) => {
    if (!available.value || selfZoomed(e)) return;
    e.preventDefault();
    safariGesture = true;
    gestureBase = value.value;
    gesture.begin(gestureBase);
  };
  const handleGestureChange = (e: Event) => {
    if (!safariGesture) return;
    e.preventDefault();
    const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
    if (!(typeof g.scale === 'number' && g.scale > 0)) return;
    gesture.update(
      clampZoom(gestureBase * g.scale, range.value),
      anchorOf(g as { clientX: number; clientY: number }),
      false
    );
  };
  const handleGestureEnd = (e: Event) => {
    if (!safariGesture) return;
    e.preventDefault();
    safariGesture = false;
    gesture.end();
  };

  // 触摸屏双指捏合
  let pinch: { distance: number; zoom: number } | null = null;
  const touchInfo = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      anchor: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
    };
  };
  const handleTouchStart = (e: TouchEvent) => {
    pinch = e.touches.length === 2 && available.value ? { distance: touchInfo(e).distance, zoom: value.value } : null;
    if (pinch) gesture.begin(pinch.zoom);
  };
  const handleTouchMove = (e: TouchEvent) => {
    if (!pinch || e.touches.length !== 2 || !pinch.distance) return;
    e.preventDefault();
    const info = touchInfo(e);
    gesture.update(clampZoom(pinch.zoom * (info.distance / pinch.distance), range.value), info.anchor, false);
  };
  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2 && pinch) {
      pinch = null;
      gesture.end();
    }
  };

  const dispose = () => {
    gesture.cancel();
    unsubscribe?.();
    unsubscribe = null;
  };

  return {
    state,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitZoom,
    zoomContext,
    handleKeydown,
    handleWheel,
    handleGestureStart,
    handleGestureChange,
    handleGestureEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    dispose,
  };
}
