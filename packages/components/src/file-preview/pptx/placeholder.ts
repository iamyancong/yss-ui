/**
 * pptx 里显示不了的图片的占位：带图标与说明文字（如「图片格式暂不支持（EMF）」），替代浏览器的裂图图标。
 *
 * - placeholderSvg：作为替换后的图片数据交给库渲染（SVG 宽高为 100%，随图片框缩放，文字不变形）
 * - markPlaceholders：渲染后给这些 <img> 加上 data-yss-pptx-placeholder 与 alt，便于读屏与自动检查
 * - guardSlideImages：兜底——库自己的英文占位换成本地化文字；浏览器解码失败的 <img> 换成占位
 *
 * 只能被 pptx 子路径使用。
 */

/** 占位原因：格式不支持 / 文件缺失 / 外部链接 / 过大 / 数据损坏 */
export type MediaIssue = 'unsupported' | 'missing' | 'external' | 'tooLarge' | 'broken';

export interface MediaPlaceholder {
  issue: MediaIssue;
  /** 格式名（unsupported 时），如 EMF、WMF、TIFF */
  format?: string;
  /** 已本地化的说明文字 */
  label: string;
}

/** 占位元素的类名（HTML 兜底占位使用） */
export const PLACEHOLDER_CLASS = 'yss-file-preview-pptx__media-placeholder';

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch] as string);

/** 图片框里的占位 SVG（无 viewBox、宽高 100%：随 <img> 尺寸铺满，图标与文字保持原尺寸居中） */
export const placeholderSvg = (label: string): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' +
  '<rect width="100%" height="100%" fill="#f5f5f5" stroke="#d9d9d9" stroke-width="2" stroke-dasharray="6 4"/>' +
  '<svg x="50%" y="50%" overflow="visible">' +
  '<g transform="translate(-14,-30)" fill="none" stroke="#bfbfbf" stroke-width="2">' +
  '<rect x="1" y="1" width="26" height="20" rx="2"/><path d="M1 17l7-7 6 6 4-4 9 9"/><circle cx="19" cy="7" r="2.5"/></g>' +
  `<text x="0" y="14" text-anchor="middle" font-size="14" fill="#8c8c8c" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">${escapeXml(label)}</text>` +
  '</svg></svg>';

/** HTML 占位元素：尺寸跟随被替换的元素（铺满图片框） */
export const createPlaceholderElement = (placeholder: MediaPlaceholder): HTMLElement => {
  const el = document.createElement('div');
  el.className = PLACEHOLDER_CLASS;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', placeholder.label);
  el.dataset.yssPptxPlaceholder = placeholder.format ? `${placeholder.issue}:${placeholder.format}` : placeholder.issue;
  const text = document.createElement('span');
  text.className = `${PLACEHOLDER_CLASS}-text`;
  text.textContent = placeholder.label;
  el.appendChild(text);
  return el;
};

const tag = (placeholder: MediaPlaceholder) =>
  placeholder.format ? `${placeholder.issue}:${placeholder.format}` : placeholder.issue;

/**
 * 给渲染结果里的占位 <img> 打标记。
 * @param urlToPath blob URL → 媒体路径（来自本实例的 mediaUrlCache）
 */
export function markPlaceholders(
  element: HTMLElement,
  urlToPath: (url: string) => string | undefined,
  placeholders: Map<string, MediaPlaceholder>
) {
  if (!placeholders.size) return;
  element.querySelectorAll('img').forEach(img => {
    const path = urlToPath(img.getAttribute('src') ?? '');
    const placeholder = path ? placeholders.get(path) : undefined;
    if (!placeholder) return;
    img.dataset.yssPptxPlaceholder = tag(placeholder);
    img.alt = placeholder.label;
    img.title = placeholder.label;
  });
}

/** 库内置的英文占位文字（@aiden0z/pptx-renderer 1.4：缺图、缺引用、WMF 等） */
const LIBRARY_TEXT = /^(?:🖼\s*)?(Image not found|Missing image reference|Unsupported format: ?(\w+))$/u;

/**
 * 兜底处理：
 * 1. 库自己画的英文占位（极少出现：媒体在本组件预处理后仍缺失时）换成本地化占位
 * 2. 浏览器解码失败的 <img>（数据损坏、浏览器不支持的变体）换成「图片无法显示」占位，不再显示裂图
 * @returns 移除监听的函数
 */
export function guardSlideImages(
  element: HTMLElement,
  label: (issue: MediaIssue, format?: string) => string
): () => void {
  element.querySelectorAll('div').forEach(div => {
    // 库的占位都是虚线边框的块，正文文本框不会被误判
    if (div.style.borderStyle !== 'dashed' || div.closest(`.${PLACEHOLDER_CLASS}`)) return;
    const text = (div.textContent ?? '').trim();
    if (div.querySelector(':scope div div') || text.length > 60) return;
    const match = LIBRARY_TEXT.exec(text.replace(/\s+/g, ' '));
    if (!match) return;
    const format = match[2]?.toUpperCase();
    const issue: MediaIssue = format ? 'unsupported' : 'missing';
    const placeholder = createPlaceholderElement({ issue, format, label: label(issue, format) });
    div.replaceWith(placeholder);
  });

  const onError = (event: Event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.yssPptxBroken) return;
    img.dataset.yssPptxBroken = '1';
    const placeholder = createPlaceholderElement({ issue: 'broken', label: label('broken') });
    // 保留库给 <img> 设置的尺寸与裁剪位置
    placeholder.style.cssText = img.style.cssText;
    placeholder.style.display = 'flex';
    img.replaceWith(placeholder);
  };
  element.addEventListener('error', onError, true);
  return () => element.removeEventListener('error', onError, true);
}
