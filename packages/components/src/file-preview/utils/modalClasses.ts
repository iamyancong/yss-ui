/**
 * 给 ant-design-vue 弹窗内部的「内容 / 标题栏 / 主体」节点加上本组件自己的类名。
 *
 * 弹窗布局（满高、无内边距、全屏）需要改这几个节点的样式。它们的类名带 antd 前缀
 * （默认 ant-modal-content，ConfigProvider 设置 prefixCls 后变成 custom-modal-content 等），
 * 样式里写死 .ant-modal-* 会在自定义前缀下失效。这里通过 Modal 的 modalRender 拿到内容节点，
 * 从它的类名推算出当前前缀，再给标题栏与主体追加固定类名，样式只依赖这些固定类名。
 */
import { cloneVNode, h, isVNode, mergeProps, type VNode } from 'vue';

export const MODAL_CLASSES = {
  /** 弹窗本身（antd 的 {prefix}-modal 节点，通过 Modal 的 class 传入） */
  dialog: 'yss-file-preview-modal__dialog',
  /** {prefix}-modal-content */
  content: 'yss-file-preview-modal__content',
  /** {prefix}-modal-header */
  titlebar: 'yss-file-preview-modal__titlebar',
  /** {prefix}-modal-body */
  main: 'yss-file-preview-modal__main',
} as const;

const classOf = (node: VNode) => String((node.props as { class?: unknown } | null)?.class ?? '');

/** Modal 的 modalRender：返回加了固定类名的内容节点 */
export function renderModalWithOwnClasses({ originVNode }: { originVNode: unknown }): VNode {
  // antd 声明的参数类型是 VueNode（可能是文本或数组），实际总是内容节点；不是 VNode 时原样返回
  if (!isVNode(originVNode)) return originVNode as VNode;
  const contentClass = classOf(originVNode);
  const prefix = contentClass.endsWith('-content') ? contentClass.slice(0, -'-content'.length) : '';
  const children = Array.isArray(originVNode.children)
    ? (originVNode.children as unknown[]).map(child => {
        if (!prefix || !isVNode(child)) return child;
        const cls = classOf(child);
        if (cls === `${prefix}-header`) return cloneVNode(child, { class: MODAL_CLASSES.titlebar });
        if (cls === `${prefix}-body`) return cloneVNode(child, { class: MODAL_CLASSES.main });
        return child;
      })
    : originVNode.children;
  return h(
    originVNode.type as string,
    mergeProps(originVNode.props ?? {}, { class: MODAL_CLASSES.content }),
    children as VNode[]
  );
}
