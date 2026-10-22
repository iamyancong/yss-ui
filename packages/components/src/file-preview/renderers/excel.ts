/**
 * Excel（.xlsx / .xls）渲染器，基于 @vue-office/excel（exceljs + x-spreadsheet）。
 *
 * @vue-office/excel 自带的数据转换会把公式结果、日期、数字格式、字号、列宽等显示错（见 ../excel/apply.ts），
 * 这里通过它的 beforeTransformData / transformData 回调，按文件里保存的值和数字格式重写显示内容。
 * 修正代码与数字格式库 numfmt 都在打开表格时按需加载；修正失败时按库的原样显示，不影响预览。
 */
import { createVNode, render as vueRender, type Component } from 'vue';
import { MissingDependencyError } from '../errors';
import type { PreviewRenderer } from './types';

async function loadExcelComponent(): Promise<Component> {
  try {
    const [mod] = await Promise.all([import('@vue-office/excel'), import('@vue-office/excel/lib/index.css')]);
    return ((mod as { default?: Component }).default ?? mod) as Component;
  } catch (err) {
    throw new MissingDependencyError('@vue-office/excel', err);
  }
}

/** 是否为 OLE 复合文档（老版 .xls） */
function isOleCompound(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(4, data.byteLength));
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

const loadFixup = () => import('../excel/index');
const loadOverlay = () => import('../excel/overlay-entry');

export const excelRenderer: PreviewRenderer = {
  types: ['xlsx', 'xls'],
  create() {
    let host: HTMLElement | null = null;
    let overlay: {
      setSheet(i: number): void;
      destroy(): void;
      scrollToCell(r: number, c: number): void;
      reloadSheet(): void;
    } | null = null;
    let pendingSheet = 0;
    let destroyed = false;
    return {
      async render(container, data, context) {
        const xls = isOleCompound(data);
        const [VueOfficeExcel, fixup] = await Promise.all([
          loadExcelComponent(),
          loadFixup()
            .then(mod => mod.prepareExcelFixup({ data, xls, locale: context.locale, signal: context.signal }))
            .catch(() => null),
        ]);
        if (context.signal.aborted) return;
        const target = document.createElement('div');
        target.className = 'yss-file-preview-excel';
        // x-spreadsheet 在 window 上用方向键移动选区，声明后弹窗不会在表格内抢方向键
        target.dataset.previewKeyboard = 'self';
        const sheetHost = document.createElement('div');
        sheetHost.className = 'yss-file-preview-excel__sheet';
        target.appendChild(sheetHost);
        container.appendChild(target);
        host = target;

        await new Promise<void>((resolve, reject) => {
          context.signal.addEventListener('abort', () => resolve(), { once: true });
          const vnode = createVNode(VueOfficeExcel, {
            src: fixup?.source ?? data,
            // 老版 .xls（OLE 复合文档）需要打开 xls 解析；内容其实是 xlsx 的 .xls 按 xlsx 解析
            options: {
              minColLength: 20,
              xls,
              ...(fixup
                ? {
                    beforeTransformData: fixup.beforeTransformData,
                    transformData: fixup.transformData,
                  }
                : {}),
            },
            style: { width: '100%', height: '100%' },
            onRendered: () => resolve(),
            // 切换工作表：叠加层（图表、图片、批注…）随之切换
            onSwitchSheet: (index: number) => {
              pendingSheet = index;
              overlay?.setSheet(index);
            },
            onError: (err: unknown) =>
              reject(err instanceof Error ? err : new Error(String(err ?? 'Excel render failed'))),
          });
          if (context.appContext) vnode.appContext = context.appContext;
          vueRender(vnode, sheetHost);
        });
        if (context.signal.aborted || !fixup) return;
        const model = fixup.model;
        if (fixup.sheets) Object.defineProperty(target, Symbol.for('yss.filePreview.excelData'), { value: fixup.sheets });
        if (!model) return;

        // 公式没有保存结果（程序生成的文件）或文件要求打开时重算：提示预览显示的是文件里保存的结果
        const visible = model.sheets.filter(s => s.state === 'visible');
        const missing = visible.reduce((n, s) => n + s.missingFormulas, 0);
        const formulas = visible.reduce((n, s) => n + s.formulaCells, 0);
        const notice = missing
          ? context.t('excelFormulaMissing', { count: missing })
          : model.fullCalcOnLoad && formulas
            ? context.t('excelRecalcOnLoad')
            : '';
        if (notice) {
          const bar = document.createElement('div');
          bar.className = 'yss-file-preview-excel__notice';
          bar.setAttribute('role', 'status');
          bar.textContent = notice;
          target.insertBefore(bar, sheetHost);
          // x-spreadsheet 按容器高度绘制，提示条占位后重新测量
          window.dispatchEvent(new Event('resize'));
        }

        // 图表、图片、形状、批注、超链接、数据条、迷你图：叠加层按需加载，没有这些内容的表格不加载
        const visibleSheets = fixup.sheets ?? [];
        if (visibleSheets.length && model.sheets.some(s => s.extras || s.cf?.bars.length || s.cf?.icons.length)) {
          try {
            const mod = await loadOverlay();
            if (!context.signal.aborted && !destroyed) {
              const clickTab = (name: string) =>
                Array.from(target.querySelectorAll<HTMLElement>('.x-spreadsheet-menu > li'))
                  .find(li => li.textContent?.trim() === name)
                  ?.click();
              const created = mod.createExcelOverlay({
                root: target,
                model,
                sheets: visibleSheets,
                t: context.t,
                formatter: fixup.formatter,
                navigate: (sheet, row, col) => {
                  const index = visibleSheets.findIndex(s => s.name === sheet);
                  if (index < 0) return;
                  if (index !== pendingSheet) clickTab(sheet);
                  // 切换工作表在 x-spreadsheet 里是异步的，稍后再滚动
                  setTimeout(() => overlay?.scrollToCell(row, col), 60);
                },
              });
              if (created) {
                overlay = created;
                overlay.setSheet(pendingSheet);
              }
            }
          } catch {
            // 叠加层加载失败时只显示单元格
          }
        }

        // x-spreadsheet 展开隐藏行是双击行号上的条；WPS 单击即可，这里把单击转成双击
        const onUnhide = (e: MouseEvent) => {
          const t = e.target as HTMLElement | null;
          const resizer = t?.parentElement;
          if (
            !t?.classList.contains('x-spreadsheet-resizer-hover') ||
            !resizer?.classList.contains('x-spreadsheet-resizer')
          )
            return;
          if (t !== resizer.firstElementChild) return;
          t.dispatchEvent(new MouseEvent('dblclick', { bubbles: false }));
          requestAnimationFrame(() => overlay?.reloadSheet());
        };
        target.addEventListener('click', onUnhide);

        // 打开时显示文件保存时的当前工作表
        const active = model.sheets[model.activeTab];
        if (model.activeTab > 0 && active && active.state === 'visible') {
          const tab = Array.from(target.querySelectorAll<HTMLElement>('.x-spreadsheet-menu > li')).find(
            li => li.textContent?.trim() === active.name
          );
          tab?.click();
        }
      },
      resize() {
        // x-spreadsheet 只在初始化和 window resize 时按容器尺寸重绘画布，且 vue-office 没有暴露实例，
        // 容器尺寸变化（如弹窗全屏）后只能派发一次 resize 事件让它重新测量
        if (host?.isConnected) window.dispatchEvent(new Event('resize'));
      },
      destroy() {
        destroyed = true;
        overlay?.destroy();
        overlay = null;
        if (host) {
          const sheetHost = host.querySelector<HTMLElement>('.yss-file-preview-excel__sheet');
          if (sheetHost) vueRender(null, sheetHost);
          host.remove();
          host = null;
        }
      },
    };
  },
};

export default excelRenderer;
