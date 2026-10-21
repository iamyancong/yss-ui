/**
 * 弹窗内浮层（Tooltip、下拉）的挂载层。
 *
 * 浮层默认挂到 body，按文档坐标定位：页面滚动过、body 设置了 overflow（页面常见的 overflow-x: hidden、
 * 弹窗打开时的滚动锁定）时，ant-design-vue 计算「可见区域」会把整页当作可见，
 * 靠近视口顶部的浮层（例如全屏时标题栏按钮的提示）不会翻转，显示在屏幕外。
 *
 * 这里在弹窗所在容器里（默认 body；弹窗设置了 getContainer 时跟随它，使用浏览器原生全屏时也在全屏元素内）
 * 放一个铺满视口的 fixed 层：浮层相对它定位、按视口计算可见区域，层级紧贴弹窗之上，
 * 滚动、缩放、全屏切换时位置都正确。不挂进 .ant-modal-wrap：那是弹窗自己管理的节点，插入外部节点会干扰关闭时的 DOM 更新。
 */
export const POPUP_LAYER_CLASS = 'yss-file-preview-popup-layer';

export interface PopupLayer {
  /** 传给 getPopupContainer：返回挂载层（按需创建） */
  getContainer: (trigger?: HTMLElement | null) => HTMLElement;
  /** 移除挂载层（弹窗关闭动画结束、组件卸载时调用） */
  dispose: () => void;
}

/**
 * @param resolveParent 返回弹窗的挂载容器（与 Modal 的 getContainer 一致，默认 body）。
 * 挂载层放在容器下，而不是 Modal 内部的 Portal 节点里：后者由 Modal 管理，插入外部节点会干扰它的 DOM 更新
 */
export function createPopupLayer(resolveParent: () => HTMLElement | null | undefined): PopupLayer {
  let layer: HTMLElement | null = null;

  const getContainer = (trigger?: HTMLElement | null) => {
    // 按组件自己的 wrapClassName 找弹窗节点，不依赖 ant 前缀（ConfigProvider 可改 prefixCls）
    const wrap = trigger?.closest<HTMLElement>('.yss-file-preview-modal') ?? null;
    const parent = resolveParent() ?? document.body;
    if (!layer) {
      layer = document.createElement('div');
      layer.className = POPUP_LAYER_CLASS;
    }
    // 紧贴弹窗之上：叠加多个弹窗时也不会被后打开的普通弹窗压住或压住它们
    const zIndex = wrap ? Number.parseInt(getComputedStyle(wrap).zIndex, 10) : Number.NaN;
    layer.style.zIndex = String(Number.isFinite(zIndex) ? zIndex + 1 : 1001);
    if (layer.parentElement !== parent) parent.appendChild(layer);
    return layer;
  };

  const dispose = () => {
    layer?.remove();
    layer = null;
  };

  return { getContainer, dispose };
}
