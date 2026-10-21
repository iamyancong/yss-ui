/**
 * PDF 渲染器：使用浏览器内置 PDF 查看器（iframe + Blob URL）。
 * 内置查看器自带下载、打印、缩放，弹窗因此不再重复显示下载按钮。
 * showDownload 为 false 时追加 Open Parameters 隐藏工具栏：Chromium / Edge 生效，
 * Firefox（pdf.js）与 Safari 不保证；用户仍可通过右键、快捷键等方式保存，不是下载防护。
 */

/** 隐藏内置查看器工具栏与侧边栏的 PDF Open Parameters */
export const PDF_HIDE_TOOLBAR_HASH = '#toolbar=0&navpanes=0';
import type { PreviewRenderer } from './types';

export const pdfRenderer: PreviewRenderer = {
  types: ['pdf'],
  create() {
    let blobUrl: string | null = null;
    let iframe: HTMLIFrameElement | null = null;
    return {
      async render(container, data, context) {
        blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        iframe = document.createElement('iframe');
        iframe.className = 'yss-file-preview-pdf';
        iframe.title = context.fileName || context.t('title');
        iframe.src = context.showDownload === false ? `${blobUrl}${PDF_HIDE_TOOLBAR_HASH}` : blobUrl;
        container.appendChild(iframe);
      },
      destroy() {
        if (iframe) {
          iframe.removeAttribute('src');
          iframe.remove();
          iframe = null;
        }
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
        }
      },
    };
  },
};

export default pdfRenderer;
