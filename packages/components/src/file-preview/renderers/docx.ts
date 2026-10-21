/**
 * Word（.docx）渲染器，基于 docx-preview。渲染后修正符号字体的项目符号与浏览器无法显示的图片（见 docx-fixup.ts）。
 */
import { MissingDependencyError } from '../errors';
import { fixDocxOutput } from './docx-fixup';
import type { PreviewRenderer } from './types';

type DocxPreviewModule = typeof import('docx-preview');

async function loadDocxPreview(): Promise<DocxPreviewModule> {
  try {
    return await import('docx-preview');
  } catch (err) {
    throw new MissingDependencyError('docx-preview', err);
  }
}

export const docxRenderer: PreviewRenderer = {
  types: ['docx'],
  create() {
    let wrapper: HTMLElement | null = null;
    return {
      async render(container, data, context) {
        const lib = await loadDocxPreview();
        if (context.signal.aborted) return;
        const host = document.createElement('div');
        wrapper = host;
        host.className = 'yss-file-preview-docx';
        container.appendChild(host);
        // 样式写入 wrapper 内部，并统一加 className 前缀，避免与页面样式互相污染；
        // useBase64URL 让图片使用 data URL，不产生需要手动释放的 Blob URL。
        await lib.renderAsync(data, host, host, {
          className: 'yss-file-preview-docx-doc',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: true,
        });
        if (context.signal.aborted) return;
        // 符号字体的项目符号、浏览器显示不了的图片（TIFF / EMF / WMF）
        fixDocxOutput(host, type => context.t('docxImageUnsupported', { type }));
      },
      destroy() {
        wrapper?.remove();
        wrapper = null;
      },
    };
  },
};

export default docxRenderer;
