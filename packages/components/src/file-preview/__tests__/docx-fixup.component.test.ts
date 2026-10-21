import { describe, expect, it } from 'vitest';
import { DOCX_IMAGE_PLACEHOLDER_CLASS, dataUrlHead, fixDocxOutput, fixSymbolBullets, sniffUnsupportedImage } from '../renderers/docx-fixup';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const emfHead = () => {
  const b = new Array(48).fill(0);
  b[0] = 1;
  b[40] = 0x20;
  b[41] = 0x45;
  b[42] = 0x4d;
  b[43] = 0x46;
  return b;
};

describe('docx 显示修正', () => {
  it('符号字体的项目符号换成 Unicode，并去掉符号字体', () => {
    const css = `p.a-num-1-0:before {\n  content: "\uf0b7\\9";\n  counter-increment: a-num-1-0;\n  font-family: Symbol;\n}\np.b:before {\n  content: "\uf0a7\\9";\n  font-family: Wingdings;\n}\np.c:before {\n  content: "o\\9";\n  font-family: Courier New;\n}`;
    const out = fixSymbolBullets(css);
    expect(out).toContain('content: "•\\9"');
    expect(out).toContain('content: "▪\\9"');
    expect(out).not.toMatch(/Symbol|Wingdings/);
    expect(out).toContain('font-family: Courier New;');
    expect(fixSymbolBullets('p { color: red }')).toBe('p { color: red }');
  });

  it('识别浏览器无法显示的图片格式', () => {
    expect(sniffUnsupportedImage(Uint8Array.from([0x49, 0x49, 0x2a, 0]))).toBe('TIFF');
    expect(sniffUnsupportedImage(Uint8Array.from([0x4d, 0x4d, 0, 0x2a]))).toBe('TIFF');
    expect(sniffUnsupportedImage(Uint8Array.from(emfHead()))).toBe('EMF');
    expect(sniffUnsupportedImage(Uint8Array.from([0xd7, 0xcd, 0xc6, 0x9a]))).toBe('WMF');
    expect(sniffUnsupportedImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(dataUrlHead('blob:x')).toBeNull();
  });

  it('不能显示的图片换成同尺寸占位，能显示的不动', () => {
    const root = document.createElement('div');
    root.innerHTML = `<style>p:before { content: "\uf0b7"; font-family: Symbol; }</style>
      <img id="png" src="data:image/png;base64,${b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])}">
      <img id="emf" style="width: 96px; height: 48px" src="data:application/octet-stream;base64,${b64(emfHead())}">`;
    expect(fixDocxOutput(root, type => `unsupported ${type}`)).toBe(1);
    expect(root.querySelector('#png')).not.toBeNull();
    const box = root.querySelector<HTMLElement>(`.${DOCX_IMAGE_PLACEHOLDER_CLASS}`)!;
    expect(box.textContent).toBe('EMF');
    expect(box.getAttribute('aria-label')).toBe('unsupported EMF');
    expect(box.style.width).toBe('96px');
    expect(root.querySelector('style')!.textContent).toContain('•');
  });
});
