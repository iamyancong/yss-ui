/**
 * Word（.docx）渲染器，基于 docx-preview。渲染后修正符号字体的项目符号与浏览器无法显示的图片（见 docx-fixup.ts）。
 */
import { DOCX_WARN_PAGES, formatCount, formatFileSize } from '../constant';
import { MissingDependencyError } from '../errors';
import { fixDocxOutput } from './docx-fixup';
import { createNoticeBar } from './notice-bar';
import type { PreviewRenderer } from './types';

type DocxPreviewModule = typeof import('docx-preview');

async function loadDocxPreview(): Promise<DocxPreviewModule> {
  try {
    return await import('docx-preview');
  } catch (err) {
    throw new MissingDependencyError('docx-preview', err);
  }
}

/** 文档属性里记录的页数（Word 保存时写入 docProps/app.xml；程序生成的文件可能没有或不准） */
export async function readDocxPages(data: ArrayBuffer): Promise<number | null> {
  // zip 读取与 Excel 共用，按需加载，不进入主入口
  const { listZipEntries, readZipText } = await import('../excel/zip');
  const entries = listZipEntries(data);
  if (!entries) return null;
  const xml = await readZipText(data, entries, 'docProps/app.xml').catch(() => null);
  const pages = xml ? Number(/<(?:\w+:)?Pages>\s*(\d+)\s*</.exec(xml)?.[1]) : NaN;
  return Number.isFinite(pages) && pages > 0 ? pages : null;
}

/** 视口外的页面不参与布局与绘制；占位高度取页面的最小高度（纸张高度） */
function lazyPages(host: HTMLElement): void {
  host.querySelectorAll<HTMLElement>('section.yss-file-preview-docx-doc').forEach(page => {
    page.style.contentVisibility = 'auto';
    page.style.containIntrinsicSize = `auto ${page.style.minHeight || '297mm'}`;
  });
}

export const docxRenderer: PreviewRenderer = {
  types: ['docx'],
  create() {
    let wrapper: HTMLElement | null = null;
    return {
      async render(container, data, context) {
        const [lib, pages] = await Promise.all([loadDocxPreview(), readDocxPages(data).catch(() => null)]);
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
        lazyPages(host);
        // 页数超过 DOCX_WARN_PAGES 或文件超过 largeFileWarnSize（恰好等于不提示）：直接预览，上方显示提示条
        const warnSize = context.largeFileWarnSize ?? Infinity;
        const notice =
          pages !== null && pages > DOCX_WARN_PAGES
            ? context.t('docxLargePagesNotice', { pages: formatCount(pages, context.locale) })
            : data.byteLength > warnSize
              ? context.t('docxLargeSizeNotice', { size: formatFileSize(data.byteLength) })
              : '';
        if (notice) host.insertBefore(createNoticeBar(notice, 'yss-file-preview__notice-bar--sticky'), host.firstChild);
      },
      destroy() {
        wrapper?.remove();
        wrapper = null;
      },
    };
  },
};

export default docxRenderer;
