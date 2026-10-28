/**
 * 叠加层入口（renderers/excel.ts 在工作表有图表、图片、批注等内容时才动态加载）。
 */
import type { FilePreviewTranslate } from '../renderers/types';
import type { XsSheet } from './apply';
import type { CellFormatter } from './format';
import type { WorkbookModel } from './model';
import { ExcelOverlay } from './overlay';
import { createRefResolver } from './refs';
import { fontFamily } from './dml';

export interface CreateOverlayOptions {
  root: HTMLElement;
  model: WorkbookModel;
  sheets: XsSheet[];
  t: FilePreviewTranslate;
  formatter: CellFormatter | null;
  maxImagePixels?: number;
  navigate?: (sheet: string, row: number, col: number) => void;
  /** 当前缩放比例 */
  scale?: number;
}

export function createExcelOverlay(options: CreateOverlayOptions): ExcelOverlay | null {
  const { model, formatter } = options;
  let current = '';
  const resolver = createRefResolver(model, formatter, () => current);
  const format = (value: number, code?: string) => {
    if (!formatter) return String(Math.round(value * 1e10) / 1e10);
    try {
      return formatter.format({ t: 'n', v: value, fmt: code || 'General' }).text;
    } catch {
      return String(value);
    }
  };
  const overlay = new ExcelOverlay({
    root: options.root,
    model,
    sheets: options.sheets,
    t: options.t,
    format,
    resolveRef: (ref, sheet) => {
      current = sheet;
      return resolver(ref);
    },
    maxImagePixels: options.maxImagePixels,
    navigate: options.navigate,
    scale: options.scale,
    fontFamily: fontFamily(model.theme?.minorLatin, model.theme?.minorEa),
  });
  if (!overlay.attach()) {
    overlay.destroy();
    return null;
  }
  Object.defineProperty(options.root, Symbol.for('yss.filePreview.excelOverlay'), { value: overlay, configurable: true });
  return overlay;
}
