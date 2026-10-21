import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_FILE_TYPES } from '../constant';
import zhCN from '../../locale/lang/zh-CN';
import zhTW from '../../locale/lang/zh-TW';
import enUS from '../../locale/lang/en-US';

const ROOT = resolve(__dirname, '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return name === '__tests__' ? [] : sourceFiles(file);
    return /\.(?:ts|vue)$/.test(name) ? [file] : [];
  });

describe('file-preview 主入口与 pptx 子路径的边界', () => {
  it('pptx 子路径之外的源码不引用 @aiden0z/pptx-renderer，也不引用 pptx 子路径', () => {
    const offenders = sourceFiles(ROOT)
      .filter(file => !relative(ROOT, file).startsWith('pptx/'))
      .filter(file => {
        const code = readFileSync(file, 'utf8');
        return /['"]@aiden0z\/pptx-renderer['"]/.test(code) || /from\s+['"]\.{1,2}\/(?:\.\.\/)*pptx['"/]|import\(\s*['"][./]+pptx/.test(code);
      })
      .map(file => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('pptx 不是内置格式', () => {
    expect(SUPPORTED_FILE_TYPES).not.toContain('pptx');
  });

  it('三种语言都有 pptx 启用提示，且包含函数名', () => {
    for (const pack of [zhCN, zhTW, enUS]) {
      expect(pack.filePreview.pptxOptInDesc).toContain('@aiden0z/pptx-renderer');
      expect(pack.filePreview.pptxOptInDesc).toContain('registerPptxRenderer()');
    }
  });
});
