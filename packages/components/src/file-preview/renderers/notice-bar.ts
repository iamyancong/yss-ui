/**
 * 预览上方的提示条（不拦截预览）：大文件提示、Excel 公式结果提示、截断提示等共用同一样式。
 */
export function createNoticeBar(text: string, extraClass?: string): HTMLElement {
  const bar = document.createElement('div');
  bar.className = extraClass ? `yss-file-preview__notice-bar ${extraClass}` : 'yss-file-preview__notice-bar';
  bar.setAttribute('role', 'status');
  bar.textContent = text;
  return bar;
}
