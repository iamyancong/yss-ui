/**
 * docx-preview 渲染结果的显示修正（只处理浏览器显示不了的部分，不改动库的排版）：
 * - 项目符号：Word 的符号字体（Symbol / Wingdings）把符号放在私有区（如 U+F0B7），
 *   没有这些字体的系统（macOS、Linux、多数手机）会显示成方框，换成对应的 Unicode 符号；
 * - 图片：TIFF / EMF / WMF 浏览器无法显示（会出现破图图标），换成同尺寸的提示占位。
 */

/** 符号字体私有区字符 → Unicode（只列 Word 项目符号常用的几个） */
const SYMBOL_FONT_CHARS: Record<string, Record<number, string>> = {
  symbol: { 0xf0b7: '•', 0xf0a7: '♣', 0xf0a8: '♦', 0xf0d8: '∧', 0xf02d: '−', 0xf0e0: '◊' },
  wingdings: {
    0xf0a7: '▪',
    0xf0d8: '➢',
    0xf0fc: '✓',
    0xf076: '❖',
    0xf06e: '■',
    0xf06c: '●',
    0xf071: '❑',
    0xf0a8: '◻',
    0xf09f: '•',
    0xf0b2: '✧',
    0xf0e8: '➔',
    0xf0d6: '➢',
  },
};

/** 修正 docx-preview 生成的编号样式里的符号字体项目符号 */
export function fixSymbolBullets(css: string): string {
  if (!/font-family:\s*["']?(?:symbol|wingdings)/i.test(css)) return css;
  return css.replace(/\{[^{}]*\}/g, block => {
    const font = /font-family:\s*["']?(symbol|wingdings)["']?\s*;/i.exec(block);
    if (!font) return block;
    const table = SYMBOL_FONT_CHARS[font[1].toLowerCase()];
    let changed = false;
    const next = block.replace(/content:\s*"([^"]*)"/, (_m, text: string) => {
      const out = Array.from(text, ch => {
        const mapped = table[ch.codePointAt(0)!];
        if (mapped) changed = true;
        return mapped ?? ch;
      }).join('');
      return `content: "${out}"`;
    });
    // 换成 Unicode 符号后不再用符号字体（系统没有该字体时会退回到会显示方框的字体）
    return changed ? next.replace(font[0], '') : block;
  });
}

/** 浏览器不能显示的图片格式；能显示返回 null */
export function sniffUnsupportedImage(bytes: Uint8Array): 'TIFF' | 'EMF' | 'WMF' | null {
  if (bytes.length < 4) return null;
  const [a, b, c, d] = bytes;
  if ((a === 0x49 && b === 0x49 && c === 0x2a && d === 0) || (a === 0x4d && b === 0x4d && c === 0 && d === 0x2a)) return 'TIFF';
  if (a === 0x01 && b === 0 && c === 0 && d === 0 && bytes.length >= 44) {
    if (bytes[40] === 0x20 && bytes[41] === 0x45 && bytes[42] === 0x4d && bytes[43] === 0x46) return 'EMF';
  }
  // 可放置 WMF（Aldus 头）或标准 WMF 头
  if (a === 0xd7 && b === 0xcd && c === 0xc6 && d === 0x9a) return 'WMF';
  if ((a === 1 || a === 2) && b === 0 && c === 9 && d === 0) return 'WMF';
  return null;
}

/** 读取 data URL 开头的字节（只解码前 64 字节，足够识别格式） */
export function dataUrlHead(src: string, size = 48): Uint8Array | null {
  const m = /^data:[^,]*;base64,/.exec(src);
  if (!m) return null;
  const chunk = src.slice(m[0].length, m[0].length + Math.ceil(size / 3) * 4);
  try {
    const bin = atob(chunk);
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export const DOCX_IMAGE_PLACEHOLDER_CLASS = 'yss-file-preview-docx__image-placeholder';

/** 修正渲染结果；label 生成占位的提示文字。返回替换的图片数 */
export function fixDocxOutput(root: HTMLElement, label: (type: string) => string): number {
  root.querySelectorAll('style').forEach(style => {
    const css = style.textContent ?? '';
    const fixed = fixSymbolBullets(css);
    if (fixed !== css) style.textContent = fixed;
  });
  let replaced = 0;
  root.querySelectorAll('img').forEach(img => {
    const head = dataUrlHead(img.getAttribute('src') ?? '');
    const type = head && sniffUnsupportedImage(head);
    if (!type) return;
    const box = document.createElement('span');
    box.className = DOCX_IMAGE_PLACEHOLDER_CLASS;
    box.setAttribute('role', 'img');
    const text = label(type);
    box.setAttribute('aria-label', text);
    box.title = text;
    // 占位通常很小，只显示格式名，完整提示放在 title / aria-label
    box.textContent = type;
    // 保留 docx-preview 按文档设置的尺寸与定位
    box.style.cssText = img.style.cssText;
    if (!img.style.width && img.getAttribute('width')) box.style.width = `${img.getAttribute('width')}px`;
    if (!img.style.height && img.getAttribute('height')) box.style.height = `${img.getAttribute('height')}px`;
    img.replaceWith(box);
    replaced++;
  });
  return replaced;
}
