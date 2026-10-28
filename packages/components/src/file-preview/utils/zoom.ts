/**
 * 缩放比例的纯函数：边界、步进、快捷键与滚轮换算。外壳（YFilePreview / 弹窗头部控件）与测试共用。
 */
import type { FilePreviewFileType, FilePreviewZoomFit } from '../types';

/** 默认可缩放范围（渲染器没有给出 range、也没有设置 zoomMin / zoomMax 时） */
export const DEFAULT_ZOOM_MIN = 0.5;
export const DEFAULT_ZOOM_MAX = 2;
export const DEFAULT_ZOOM_STEP = 0.1;
/** 下拉里的常用比例 */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
/** 任何情况下都不超出的范围（防止误传 0 或极大值） */
const HARD_MIN = 0.01;
const HARD_MAX = 32;

export interface ZoomRange {
  min: number;
  max: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 实际范围：props 优先，其次渲染器建议的范围，最后是默认 50%–200% */
export function resolveZoomRange(
  props: { zoomMin?: number; zoomMax?: number },
  rendererRange?: Partial<ZoomRange>
): ZoomRange {
  let min = finite(props.zoomMin) ? props.zoomMin : finite(rendererRange?.min) ? rendererRange!.min! : DEFAULT_ZOOM_MIN;
  let max = finite(props.zoomMax) ? props.zoomMax : finite(rendererRange?.max) ? rendererRange!.max! : DEFAULT_ZOOM_MAX;
  min = Math.min(Math.max(min, HARD_MIN), HARD_MAX);
  max = Math.min(Math.max(max, HARD_MIN), HARD_MAX);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

/** 保留 4 位小数，避免 0.1 + 0.2 这类浮点误差显示成 30.000000000000004% */
export const roundZoom = (z: number) => Math.round(z * 10000) / 10000;

export function clampZoom(z: number, range: ZoomRange): number {
  if (!Number.isFinite(z)) return 1 < range.min ? range.min : 1 > range.max ? range.max : 1;
  return roundZoom(Math.min(range.max, Math.max(range.min, z)));
}

/**
 * 按步长放大 / 缩小：先对齐到步长的整数倍（如 0.83 放大到 0.9 而不是 0.93），再收敛到范围内
 */
export function stepZoom(z: number, direction: 1 | -1, step: number, range: ZoomRange): number {
  const s = finite(step) ? step : DEFAULT_ZOOM_STEP;
  const n = z / s;
  const snapped = direction > 0 ? Math.floor(n + 1e-6) + 1 : Math.ceil(n - 1e-6) - 1;
  return clampZoom(snapped * s, range);
}

/** 滚轮 / 触控板捏合（带 ctrlKey 的 wheel）一次事件的缩放倍数 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  // deltaMode 1 为按行滚动（Firefox），一行约 16px
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.min(2, Math.max(0.5, Math.exp(-px / 500)));
}

export type ZoomShortcut = 'in' | 'out' | 'reset';

/** Ctrl / ⌘ + = / + / - / 0；按 code 兜底不同键盘布局（数字键盘的 + - 0 也算） */
export function zoomShortcut(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>
): ZoomShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  switch (e.key) {
    case '=':
    case '+':
      return 'in';
    case '-':
    case '_':
      return 'out';
    case '0':
      return 'reset';
    default:
      break;
  }
  switch (e.code) {
    case 'Equal':
    case 'NumpadAdd':
      return 'in';
    case 'Minus':
    case 'NumpadSubtract':
      return 'out';
    case 'Digit0':
    case 'Numpad0':
      return 'reset';
    default:
      return null;
  }
}

/** 某个文件类型是否允许缩放（zoomable 为 boolean 或类型列表） */
export function isZoomableType(
  zoomable: boolean | readonly string[] | undefined,
  type: FilePreviewFileType | string | null
): boolean {
  if (zoomable === undefined || zoomable === true) return true;
  if (zoomable === false || !type) return false;
  const t = String(type).toLowerCase();
  return zoomable.some(item => String(item).toLowerCase() === t);
}

export const formatZoom = (z: number) => `${Math.round(z * 100)}%`;

export const isFitMode = (fit: FilePreviewZoomFit | undefined): fit is 'width' | 'page' =>
  fit === 'width' || fit === 'page';

/** 按文件来源记住比例：字符串（URL）按值，对象（File / Blob / 函数）按引用 */
export class ZoomMemory {
  private readonly byValue = new Map<string, number>();
  private byRef = new WeakMap<object, number>();

  get(key: unknown): number | undefined {
    if (typeof key === 'string') return this.byValue.get(key);
    if (key && (typeof key === 'object' || typeof key === 'function')) return this.byRef.get(key as object);
    return undefined;
  }

  set(key: unknown, zoom: number): void {
    if (typeof key === 'string') this.byValue.set(key, zoom);
    else if (key && (typeof key === 'object' || typeof key === 'function')) this.byRef.set(key as object, zoom);
  }

  clear(): void {
    this.byValue.clear();
    this.byRef = new WeakMap();
  }
}

/** 触控板捏合（带 ctrlKey 的 wheel）每像素 deltaY 的对数缩放系数：与 Chrome 整页缩放的手感一致，内容跟手 */
export const PINCH_ZOOM_SENSITIVITY = 0.01;
/** 捏合停止多久视为结束（之后才做真正的重绘） */
export const PINCH_IDLE_MS = 140;

/** wheel 的 deltaY 统一成像素（deltaMode 1 按行约 16px，2 按页约 400px） */
export function wheelDeltaPx(deltaY: number, deltaMode = 0): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
}

/**
 * 带 ctrlKey 的 wheel 是否来自鼠标滚轮（一格一格的，按步长缩放），否则视为触控板捏合（连续缩放）。
 * 判断不了的（高精度滚轮的小增量、带小数的增量）一律按连续缩放处理：手感只是更细腻，不会跳；
 * 捏合进行中（外壳的 ZoomGesture 处于 active）的事件也都按连续缩放。
 * 鼠标滚轮：按行 / 按页滚动，或像素模式下一次 ≥ 50px 的整数（Chrome / Edge 一格 100 或 120）；
 * 触控板捏合每个事件通常只有几个像素且带小数
 */
export function isWheelNotch(e: Pick<WheelEvent, 'deltaY' | 'deltaX' | 'deltaMode'>): boolean {
  if (e.deltaMode !== 0) return true;
  return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0;
}

/** 捏合一次 wheel 事件后的比例：连续（对数）缩放，不对齐步长，只收敛到范围内 */
export function pinchZoom(z: number, deltaPx: number, range: ZoomRange, k = PINCH_ZOOM_SENSITIVITY): number {
  const next = z * Math.exp(-deltaPx * k);
  if (!Number.isFinite(next)) return z;
  return Math.min(range.max, Math.max(range.min, next));
}

/** 缩放锚点（视口坐标 clientX / clientY），锚点下的内容缩放前后保持不动 */
export interface ZoomAnchor {
  x: number;
  y: number;
}

export interface ZoomGestureOptions {
  /** 每帧最多一次：实时预览（如 CSS transform）并更新显示的百分比 */
  preview(zoom: number, anchor: ZoomAnchor | undefined): void;
  /** 手势结束：真正应用比例并通知外部 */
  commit(zoom: number, anchor: ZoomAnchor | undefined): void;
  idleMs?: number;
  raf?: (cb: () => void) => unknown;
  cancelRaf?: (id: unknown) => void;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/**
 * 连续缩放手势的状态机（触控板捏合 / Safari gesture* / 触摸屏双指）：
 * update 只记录目标比例，按 requestAnimationFrame 合并成每帧一次 preview；
 * 停止 idleMs 或调用 end 后 commit 一次。
 */
export class ZoomGesture {
  private value = 1;
  private anchor: ZoomAnchor | undefined;
  private frame: unknown = null;
  private timer: unknown = null;
  private running = false;
  private readonly o: Required<ZoomGestureOptions>;

  constructor(options: ZoomGestureOptions) {
    const hasRaf = typeof requestAnimationFrame === 'function';
    this.o = {
      idleMs: PINCH_IDLE_MS,
      raf: hasRaf ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16),
      cancelRaf: hasRaf
        ? id => cancelAnimationFrame(id as number)
        : id => clearTimeout(id as ReturnType<typeof setTimeout>),
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: id => clearTimeout(id as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  get active(): boolean {
    return this.running;
  }

  /** 手势中的目标比例（未开始时为 undefined） */
  get current(): number | undefined {
    return this.running ? this.value : undefined;
  }

  /** 开始（或继续）手势；已在进行中时忽略 base */
  begin(base: number): void {
    if (this.running) return;
    this.running = true;
    this.value = base;
  }

  /** 设置目标比例；autoEnd 为 false 时不按空闲自动结束（Safari / 触摸有明确的结束事件） */
  update(zoom: number, anchor?: ZoomAnchor, autoEnd = true): void {
    if (!this.running || !Number.isFinite(zoom) || !(zoom > 0)) return;
    this.value = zoom;
    if (anchor) this.anchor = anchor;
    if (this.frame === null) {
      this.frame = this.o.raf(() => {
        this.frame = null;
        if (this.running) this.o.preview(this.value, this.anchor);
      });
    }
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = autoEnd ? this.o.setTimer(() => this.end(), this.o.idleMs) : null;
  }

  /** 结束并提交 */
  end(): void {
    if (!this.running) return;
    const { value, anchor } = this;
    this.stop();
    this.o.commit(value, anchor);
  }

  /** 放弃（如组件卸载），不提交 */
  cancel(): void {
    this.stop();
  }

  private stop() {
    this.running = false;
    this.anchor = undefined;
    if (this.frame !== null) this.o.cancelRaf(this.frame);
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.frame = null;
    this.timer = null;
  }
}
