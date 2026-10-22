/**
 * DrawingML 颜色变换、主题色与中文字体别名。
 */
import { describe, expect, it } from 'vitest';
import {
  applyColorMods,
  DEFAULT_THEME_COLORS,
  fontFamily,
  hexToRgba,
  rgbaToCss,
  resolveColor,
  type ThemeInfo,
} from '../excel/dml';
import { parseXml, type XNode } from '../excel/xml';

const theme: ThemeInfo = { colors: DEFAULT_THEME_COLORS };
const mod = (name: string, val: string): XNode => ({ name, prefix: 'a', attrs: { val }, children: [], text: '' });

describe('颜色', () => {
  it('hex → rgba → css', () => {
    expect(hexToRgba('#4472C4')).toEqual({ r: 68 / 255, g: 114 / 255, b: 196 / 255, a: 1 });
    expect(rgbaToCss({ r: 1, g: 0, b: 0, a: 1 })).toBe('#FF0000');
    expect(rgbaToCss({ r: 1, g: 0, b: 0, a: 0.5 })).toMatch(/^rgba\(/);
  });

  it('lumMod / tint / shade / alpha', () => {
    const base = hexToRgba('#4472C4')!;
    const tinted = applyColorMods(base, [mod('tint', '40000')]);
    expect(tinted.r).toBeGreaterThan(base.r);
    const shade = applyColorMods(base, [mod('shade', '50000')]);
    expect(shade.r).toBeCloseTo(base.r * 0.5);
    const alpha = applyColorMods(base, [mod('alpha', '50000')]);
    expect(alpha.a).toBeCloseTo(0.5);
    const lum = applyColorMods(base, [mod('lumMod', '50000')]);
    expect(lum.r + lum.g + lum.b).not.toBeCloseTo(base.r + base.g + base.b);
  });

  it('schemeClr 按主题取色', () => {
    const node = parseXml(`<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>`);
    expect(resolveColor(node, theme)).toBe('#4472C4');
  });
});

describe('fontFamily', () => {
  it('楷体补上 KaiTi / STKaiti，忽略主题占位名', () => {
    expect(fontFamily('楷体', '+mn-lt')).toContain('KaiTi');
    expect(fontFamily('楷体')).toContain('STKaiti');
    expect(fontFamily(undefined, 'Calibri')).toBe('"Calibri", sans-serif');
  });
});
