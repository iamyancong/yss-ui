/**
 * Excel（.xlsx / .xls）渲染器，基于 @vue-office/excel（exceljs + x-spreadsheet）。
 *
 * @vue-office/excel 自带的数据转换会把公式结果、日期、数字格式、字号、列宽等显示错（见 ../excel/apply.ts），
 * 这里通过它的 beforeTransformData / transformData 回调，按文件里保存的值和数字格式重写显示内容。
 * 修正代码与数字格式库 numfmt 都在打开表格时按需加载；修正失败时按库的原样显示，不影响预览。
 */
import { createVNode, render as vueRender, type Component } from 'vue';
import { MissingDependencyError } from '../errors';
import type { AxisView } from '../excel/zoom';
import type { PreviewRenderer, PreviewRendererInstance, PreviewZoomController } from './types';

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

/** 缩放比例的硬性范围（数据层面能正常绘制的范围；默认可用范围由外壳的 zoomMin / zoomMax 决定） */
const SCALE_MIN = 0.1;
const SCALE_MAX = 10;
/** 适应宽度 / 整页的范围 */
const FIT_MIN = 0.25;
const FIT_MAX = 4;
/** 按钮、快捷键缩放的过渡时长 */
const ZOOM_ANIMATION_MS = 150;
const clampScale = (v: number, min = SCALE_MIN, max = SCALE_MAX) => Math.min(max, Math.max(min, v));
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
      setScale(scale: number): void;
    } | null = null;
    let pendingSheet = 0;
    let destroyed = false;
    let zoomCleanup: (() => void) | null = null;
    let onSheetSwitch: (() => void) | null = null;
    const instance: PreviewRendererInstance = {
      async render(container, data, context) {
        const xls = isOleCompound(data);
        const initialZoom =
          typeof context.zoom === 'number' && Number.isFinite(context.zoom) && context.zoom > 0
            ? clampScale(context.zoom)
            : undefined;
        const [VueOfficeExcel, fixup] = await Promise.all([
          loadExcelComponent(),
          loadFixup()
            .then(mod =>
              mod.prepareExcelFixup({ data, xls, locale: context.locale, signal: context.signal, zoom: initialZoom })
            )
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
              onSheetSwitch?.();
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
                scale: fixup.scale,
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

        // 缩放：按比例改写行高、列宽、字号后让 x-spreadsheet 真正重绘（见 ../excel/zoom.ts），画布始终清晰。
        // 捏合 / 按钮动画中每帧（requestAnimationFrame）重绘一次，锚点（指针或左上角）下的内容精确到像素保持不动
        if (fixup.zoomable) {
          const { geometryOf, captureAxisAnchor, axisView } = fixup.zoomMath;
          const bar = (dir: 'vertical' | 'horizontal') =>
            target.querySelector<HTMLElement>(`.x-spreadsheet-scrollbar.${dir}`);
          const cellsEl = () => target.querySelector<HTMLElement>('.x-spreadsheet-overlayer-content');

          /** 左上角被裁短的行 / 列（不足一格的滚动），用户滚动、切换工作表、再次缩放前恢复 */
          let trims: Array<{
            axis: Record<string, unknown>;
            key: string;
            prop: 'height' | 'width';
            value: number;
            created: boolean;
          }> = [];
          let trimView: { x: AxisView; y: AxisView } | null = null;
          const restoreTrim = () => {
            for (const t of trims) {
              if (t.created) delete t.axis[t.key];
              else (t.axis[t.key] as Record<string, number>)[t.prop] = t.value;
            }
            trims = [];
            trimView = null;
          };
          const applyTrim = (axis: Record<string, unknown>, view: AxisView, prop: 'height' | 'width', size: number) => {
            if (!(view.trim > 0)) return;
            const key = String(view.index);
            const cur = axis[key] as Record<string, unknown> | undefined;
            if (cur && cur.hide) return;
            const created = !cur || typeof cur !== 'object';
            const value = created ? size : typeof cur[prop] === 'number' ? (cur[prop] as number) : size;
            if (created) axis[key] = { [prop]: size };
            (axis[key] as Record<string, number>)[prop] = Math.max(0.5, value - view.trim);
            trims.push({ axis, key, prop, value, created });
          };

          /** 当前的滚动状态（含裁剪） */
          const currentView = (live: NonNullable<ReturnType<typeof fixup.live>>) => {
            const { scroll, freeze } = live;
            return {
              x: trimView?.x ?? { index: scroll.ci > 0 ? scroll.ci : freeze.cols, trim: 0, offset: scroll.x || 0 },
              y: trimView?.y ?? { index: scroll.ri > 0 ? scroll.ri : freeze.rows, trim: 0, offset: scroll.y || 0 },
            };
          };

          /** 锚点：视口坐标 → 单元格区域内坐标 → 行列 + 格内比例；没有指针时取单元格区域左上角 */
          const captureAnchors = (client?: { x: number; y: number }) => {
            const live = fixup.live(pendingSheet);
            const cells = cellsEl();
            if (!live || !cells) return null;
            const rect = cells.getBoundingClientRect();
            const lx = client ? Math.min(Math.max(client.x - rect.left, 0), rect.width) : 0;
            const ly = client ? Math.min(Math.max(client.y - rect.top, 0), rect.height) : 0;
            const geo = geometryOf(live.data, live.freeze);
            const view = currentView(live);
            return {
              x: captureAxisAnchor(geo.cols, live.freeze.cols, view.x, lx),
              y: captureAxisAnchor(geo.rows, live.freeze.rows, view.y, ly),
            };
          };

          /** x-spreadsheet 的滚动条按新的内容尺寸显示（与它自己的 Scrollbar.set 相同） */
          const syncBar = (el: HTMLElement | null, vertical: boolean, view: number, total: number) => {
            const content = el?.firstElementChild as HTMLElement | null;
            if (!el || !content) return;
            const r = view - 1;
            if (total > r) {
              el.style[vertical ? 'height' : 'width'] = `${r - 15}px`;
              el.style.display = 'block';
              content.style[vertical ? 'width' : 'height'] = '1px';
              content.style[vertical ? 'height' : 'width'] = `${total}px`;
            } else el.style.display = 'none';
          };

          /** 我们自己设置的滚动条位置：随后异步到来的 scroll 事件据此识别，不当作用户滚动 */
          let expected: { top: number; left: number } | null = null;
          let frameCost = 0;
          /**
           * 按比例 next 重绘一帧：只改写当前工作表的尺寸（其他表在结束时一起改写），算出让锚点不动的滚动状态
           * （整格部分交给 x-spreadsheet 滚动，余下的裁掉左上角那格），再通过竖向滚动条的 scroll 事件让它只重绘一次
           */
          const frame = (next: number, anchors: NonNullable<ReturnType<typeof captureAnchors>>) => {
            const live = fixup.live(pendingSheet);
            const vbar = bar('vertical');
            const hbar = bar('horizontal');
            const cells = cellsEl();
            if (destroyed || !target.isConnected || !live || !vbar || !hbar || !cells) return false;
            const t0 = performance.now();
            restoreTrim();
            fixup.setScale(next, pendingSheet);
            const geo = geometryOf(live.data, live.freeze);
            const x = axisView(geo.cols, live.freeze.cols, anchors.x);
            const y = axisView(geo.rows, live.freeze.rows, anchors.y);
            applyTrim(live.data.rows as Record<string, unknown>, y, 'height', geo.rows.sizeOf(y.index));
            applyTrim(live.data.cols as Record<string, unknown>, x, 'width', geo.cols.sizeOf(x.index));
            trimView = { x, y };
            const { scroll } = live;
            scroll.ci = x.offset > 0 ? x.index : 0;
            scroll.x = x.offset;
            // 滚动条内容至少能滚到目标位置（缩小到接近末尾时），结束后的完整重绘会恢复真实尺寸
            const totalH =
              geo.rows.total - geo.rows.start(live.freeze.rows) + geo.rows.start(live.freeze.rows) - y.trim;
            const totalW = geo.cols.total - x.trim;
            syncBar(vbar, true, cells.offsetHeight, Math.max(totalH, y.offset + cells.offsetHeight + 1));
            syncBar(hbar, false, cells.offsetWidth, Math.max(totalW, x.offset + cells.offsetWidth + 1));
            hbar.scrollLeft = Math.max(0, x.offset - 1);
            vbar.scrollTop = Math.max(0, y.offset - 1);
            expected = { top: vbar.scrollTop, left: hbar.scrollLeft };
            // y 设为 NaN：x-spreadsheet 按滚动条位置重新算出 ri / y（与上面一致）并重绘一次；scrollx 随后发现 x 未变，不再重绘
            scroll.y = Number.NaN;
            vbar.dispatchEvent(new Event('scroll'));
            if (!Number.isFinite(scroll.y)) scroll.y = y.offset;
            overlay?.setScale(next);
            target.dataset.zoom = String(Math.round(next * 10000) / 10000);
            frameCost = performance.now() - t0;
            target.dataset.zoomFrameMs = frameCost.toFixed(1);
            return true;
          };

          // 用户滚动时恢复被裁短的那格（x-spreadsheet 本来就按整格滚动）；捕获阶段先于 x-spreadsheet 处理
          const onScrollCapture = (e: Event) => {
            const t = e.target as HTMLElement | null;
            if (!trims.length || !t?.classList?.contains('x-spreadsheet-scrollbar')) return;
            const vbar = bar('vertical');
            const hbar = bar('horizontal');
            if (expected && vbar?.scrollTop === expected.top && hbar?.scrollLeft === expected.left) return;
            const live = fixup.live(pendingSheet);
            restoreTrim();
            expected = null;
            // 让 x-spreadsheet 这次一定重绘（它在滚动距离对应的行列没变时会跳过）
            if (live) {
              if (t === vbar) live.scroll.y = Number.NaN;
              else live.scroll.x = Number.NaN;
            }
            overlay?.setScale(fixup.scale);
          };
          target.addEventListener('scroll', onScrollCapture, true);
          onSheetSwitch = () => {
            restoreTrim();
            expected = null;
          };

          let current = fixup.scale;
          let targetScale: number | null = null;
          let gesture: NonNullable<ReturnType<typeof captureAnchors>> | null = null;
          let anim: {
            from: number;
            to: number;
            start: number;
            anchors: NonNullable<ReturnType<typeof captureAnchors>>;
          } | null = null;
          let animFrame: number | null = null;
          const raf =
            typeof requestAnimationFrame === 'function'
              ? (cb: FrameRequestCallback) => requestAnimationFrame(cb)
              : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
          const cancelRaf = (id: number) =>
            typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);
          const stopAnim = () => {
            if (animFrame !== null) cancelRaf(animFrame);
            animFrame = null;
            anim = null;
          };

          /** 结束：其他工作表也按新比例改写，再完整重绘一次（同步滚动条尺寸、选区位置），保留裁剪后的滚动状态 */
          const finish = (next: number, anchors: NonNullable<ReturnType<typeof captureAnchors>> | null) => {
            targetScale = null;
            current = next;
            if (!anchors) {
              applyLegacy(next);
              return;
            }
            fixup.setScale(next);
            frame(next, anchors);
            if (host?.isConnected) window.dispatchEvent(new Event('resize'));
            overlay?.setScale(next);
          };

          /** 取不到 x-spreadsheet 滚动状态时（不应发生）退回整页重绘、保持左上角 */
          const applyLegacy = (next: number) => {
            const vbar = bar('vertical');
            const hbar = bar('horizontal');
            restoreTrim();
            const pos = fixup.rescale(pendingSheet, next, { left: hbar?.scrollLeft ?? 0, top: vbar?.scrollTop ?? 0 });
            window.dispatchEvent(new Event('resize'));
            if (pos && vbar && hbar) {
              vbar.scrollTop = pos.top;
              vbar.dispatchEvent(new Event('scroll'));
              hbar.scrollLeft = pos.left;
              hbar.dispatchEvent(new Event('scroll'));
            }
            overlay?.setScale(next);
            target.dataset.zoom = String(next);
          };

          const reduceMotion = () =>
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

          /** 按钮、快捷键、鼠标滚轮、适应宽度：约 150ms 的缓动，同样每帧真正重绘 */
          const animateTo = (next: number, client?: { x: number; y: number }) => {
            const anchors = captureAnchors(client);
            stopAnim();
            targetScale = next;
            if (!anchors || reduceMotion() || Math.abs(next - current) < 1e-6) {
              finish(next, anchors);
              return;
            }
            anim = { from: current, to: next, start: -1, anchors };
            const step = (now: number) => {
              animFrame = null;
              const a = anim;
              if (!a) return;
              if (a.start < 0) a.start = now;
              const t = Math.min(1, (now - a.start) / ZOOM_ANIMATION_MS);
              // easeOutCubic；按对数插值，放大缩小速度一致
              const k = 1 - Math.pow(1 - t, 3);
              const z = a.from * Math.pow(a.to / a.from, k);
              if (t >= 1) {
                anim = null;
                finish(a.to, a.anchors);
                return;
              }
              current = z;
              frame(z, a.anchors);
              animFrame = raf(step);
            };
            animFrame = raf(step);
          };

          const controller: PreviewZoomController = {
            get: () => targetScale ?? current,
            set(next, options) {
              if (!(next > 0)) return;
              const z = clampScale(next);
              if (gesture) {
                // 捏合结束：外壳已等手势停下
                const anchors = gesture;
                gesture = null;
                finish(z, anchors);
                return;
              }
              animateTo(z, options?.anchor);
            },
            preview(next, anchor) {
              if (!(next > 0)) return;
              stopAnim();
              if (!gesture) gesture = captureAnchors(anchor);
              const z = clampScale(next);
              targetScale = z;
              current = z;
              if (!gesture || !frame(z, gesture)) gesture = null;
            },
            fit(mode) {
              const used = fixup.usedSize(pendingSheet);
              const content = cellsEl();
              if (!used || !content || !used.w || !used.h) return undefined;
              // 留出滚动条的宽度
              const w = content.clientWidth - 16;
              const h = content.clientHeight - 16;
              if (w <= 0 || h <= 0) return undefined;
              let next = w / used.w;
              if (mode === 'page') next = Math.min(next, h / used.h);
              next = Math.round(clampScale(next, FIT_MIN, FIT_MAX) * 100) / 100;
              animateTo(next);
              return next;
            },
          };
          zoomCleanup = () => {
            stopAnim();
            target.removeEventListener('scroll', onScrollCapture, true);
          };
          target.dataset.zoom = String(fixup.scale);
          instance.zoom = controller;
        }

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
        zoomCleanup?.();
        zoomCleanup = null;
        onSheetSwitch = null;
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
    return instance;
  },
};

export default excelRenderer;
