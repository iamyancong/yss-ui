/**
 * 打开中的预览弹窗栈，用于让键盘事件只由最上层弹窗处理。
 */
const openModals: symbol[] = [];

export function pushModal(id: symbol): void {
  popModal(id);
  openModals.push(id);
}

export function popModal(id: symbol): void {
  const index = openModals.indexOf(id);
  if (index !== -1) openModals.splice(index, 1);
}

export function isTopmostModal(id: symbol): boolean {
  return openModals[openModals.length - 1] === id;
}
