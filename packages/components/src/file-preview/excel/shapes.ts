/**
 * 绘图对象 → DOM：图片、形状 / 文本框、组合、OLE 对象、图表与占位卡片的外框。
 * 只用 textContent 写入文字、只加载 xlsx 里的图片（Blob URL），不执行任何脚本、不请求外部地址。
 */
import type { LineStyle, ShapeStyle } from './dml';
import type { DrawingItem, Paragraph, Xfrm } from './drawing';
import type { Rect } from './geometry';
import type { ImageIssue, ImageLoader, LoadedImage } from './media';

export const CLS = 'yss-file-preview-excel';

/** 组合里的图表：先放一个空容器，由 ./overlay.ts 找到后异步画图 */
export const groupChartItems = new WeakMap<HTMLElement, DrawingItem>();

export interface ShapeContext {
  loader: ImageLoader;
  /** 图片占位文字 */
  imageLabel(issue: ImageIssue, format?: string): string;
  oleLabel(type: string): string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const css = (l: LineStyle | undefined) =>
  l && !l.none && l.color
    ? `${Math.max(0.5, l.width ?? 1)}px ${l.dash === 'dashed' ? 'dashed' : l.dash === 'dotted' ? 'dotted' : 'solid'} ${l.color}`
    : '';

/** 图表对象外框：只在文件写了可见线条 / 填充时应用，不额外加默认边框 */
export function applyChartFrame(el: HTMLElement, style?: ShapeStyle, rounded?: boolean) {
  const border = css(style?.line);
  if (border) el.style.border = border;
  if (style?.fill && style.fill !== 'none') el.style.background = style.fill;
  if (rounded) el.style.borderRadius = '4px';
}

/** 占位卡片（图片无法显示、图表不支持等） */
export function placeholderCard(
  rect: Pick<Rect, 'w' | 'h'>,
  title: string | undefined,
  hint: string,
  kind: string
): HTMLElement {
  const card = document.createElement('div');
  card.className = `${CLS}__placeholder ${CLS}__placeholder--${kind}`;
  if (title) {
    const t = document.createElement('div');
    t.className = `${CLS}__placeholder-title`;
    t.textContent = title;
    card.appendChild(t);
  }
  const h = document.createElement('div');
  h.className = `${CLS}__placeholder-hint`;
  h.textContent = hint;
  card.appendChild(h);
  card.title = [title, hint].filter(Boolean).join('\n');
  if (rect.h < 40 || rect.w < 60) card.classList.add(`${CLS}__placeholder--compact`);
  return card;
}

function transformOf(xfrm: Xfrm | undefined): string {
  if (!xfrm) return '';
  const parts: string[] = [];
  if (xfrm.rot) parts.push(`rotate(${xfrm.rot}deg)`);
  if (xfrm.flipH || xfrm.flipV) parts.push(`scale(${xfrm.flipH ? -1 : 1}, ${xfrm.flipV ? -1 : 1})`);
  return parts.join(' ');
}

export function place(el: HTMLElement, rect: Rect) {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${Math.max(0, rect.w)}px`;
  el.style.height = `${Math.max(0, rect.h)}px`;
}

function applyImage(
  wrap: HTMLElement,
  img: LoadedImage,
  crop: { l: number; t: number; r: number; b: number } | undefined,
  ctx: ShapeContext,
  rect: Rect
) {
  if (!('url' in img)) {
    wrap.appendChild(placeholderCard(rect, undefined, ctx.imageLabel(img.issue, img.format), 'image'));
    return;
  }
  const el = document.createElement('img');
  el.alt = '';
  el.draggable = false;
  el.decoding = 'async';
  el.src = img.url;
  el.className = `${CLS}__img`;
  if (crop && (crop.l || crop.t || crop.r || crop.b)) {
    // 按裁剪比例放大图片，再用外框裁掉多出的部分
    const sx = 1 - crop.l - crop.r;
    const sy = 1 - crop.t - crop.b;
    if (sx > 0.001 && sy > 0.001) {
      el.style.width = `${100 / sx}%`;
      el.style.height = `${100 / sy}%`;
      el.style.left = `${(-crop.l / sx) * 100}%`;
      el.style.top = `${(-crop.t / sy) * 100}%`;
    }
  }
  el.addEventListener('error', () => {
    el.remove();
    wrap.appendChild(placeholderCard(rect, undefined, ctx.imageLabel('broken'), 'image'));
  });
  wrap.appendChild(el);
}

/** 常见预设形状的 SVG 路径（100 × 100 坐标系），其余按矩形显示 */
const PRESET_PATHS: Record<string, string> = {
  triangle: 'M50 0 L100 100 L0 100 Z',
  rtTriangle: 'M0 0 L100 100 L0 100 Z',
  diamond: 'M50 0 L100 50 L50 100 L0 50 Z',
  parallelogram: 'M25 0 L100 0 L75 100 L0 100 Z',
  trapezoid: 'M25 0 L75 0 L100 100 L0 100 Z',
  pentagon: 'M50 0 L100 38 L81 100 L19 100 L0 38 Z',
  homePlate: 'M0 0 L80 0 L100 50 L80 100 L0 100 Z',
  chevron: 'M0 0 L80 0 L100 50 L80 100 L0 100 L20 50 Z',
  hexagon: 'M25 0 L75 0 L100 50 L75 100 L25 100 L0 50 Z',
  octagon: 'M29 0 L71 0 L100 29 L100 71 L71 100 L29 100 L0 71 L0 29 Z',
  rightArrow: 'M0 25 L60 25 L60 0 L100 50 L60 100 L60 75 L0 75 Z',
  leftArrow: 'M100 25 L40 25 L40 0 L0 50 L40 100 L40 75 L100 75 Z',
  upArrow: 'M25 100 L25 40 L0 40 L50 0 L100 40 L75 40 L75 100 Z',
  downArrow: 'M25 0 L25 60 L0 60 L50 100 L100 60 L75 60 L75 0 Z',
  leftRightArrow: 'M0 50 L25 0 L25 25 L75 25 L75 0 L100 50 L75 100 L75 75 L25 75 L25 100 Z',
  star5: 'M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z',
  plus: 'M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z',
  flowChartDecision: 'M50 0 L100 50 L50 100 L0 50 Z',
  wedgeRectCallout: 'M0 0 L100 0 L100 80 L40 80 L20 100 L25 80 L0 80 Z',
};

const LINE_GEOMS = /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/;

function shapeSvg(item: Extract<DrawingItem, { type: 'shape' }>, rect: Rect): SVGSVGElement | null {
  const line = item.style.line;
  const stroke = line && !line.none ? (line.color ?? '#000000') : 'none';
  const sw = Math.max(0.5, line?.width ?? 1);
  if (item.connector || LINE_GEOMS.test(item.geom)) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(Math.max(1, rect.w)));
    svg.setAttribute('height', String(Math.max(1, rect.h)));
    svg.setAttribute('overflow', 'visible');
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', '0');
    l.setAttribute('y1', '0');
    l.setAttribute('x2', String(rect.w));
    l.setAttribute('y2', String(rect.h));
    l.setAttribute('stroke', stroke === 'none' ? '#000000' : stroke);
    l.setAttribute('stroke-width', String(sw));
    if (line?.dash === 'dashed') l.setAttribute('stroke-dasharray', `${sw * 4} ${sw * 3}`);
    svg.appendChild(l);
    return svg;
  }
  const d = PRESET_PATHS[item.geom];
  if (!d) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('class', `${CLS}__shape-bg`);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', item.style.fill && item.style.fill !== 'none' ? item.style.fill : 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', String(sw));
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(p);
  return svg;
}

function textBlock(paragraphs: Paragraph[], body: Extract<DrawingItem, { type: 'shape' }>['body']): HTMLElement | null {
  if (!paragraphs.some(p => p.runs.some(r => r.text.trim()))) return null;
  const box = document.createElement('div');
  box.className = `${CLS}__shape-text`;
  box.style.justifyContent = body.anchor === 'ctr' ? 'center' : body.anchor === 'b' ? 'flex-end' : 'flex-start';
  const [t, r, b, l] = body.insets;
  box.style.padding = `${t}px ${r}px ${b}px ${l}px`;
  if (body.vertical) box.style.writingMode = 'vertical-rl';
  paragraphs.forEach(p => {
    const el = document.createElement('div');
    el.style.textAlign = p.align;
    p.runs.forEach(run => {
      const s = document.createElement('span');
      s.textContent = run.text || (p.runs.length === 1 ? '\u00a0' : '');
      if (run.style.size) s.style.fontSize = `${run.style.size}px`;
      if (run.style.color) s.style.color = run.style.color;
      if (run.style.bold) s.style.fontWeight = 'bold';
      if (run.style.italic) s.style.fontStyle = 'italic';
      if (run.style.underline) s.style.textDecoration = 'underline';
      if (run.style.font) s.style.fontFamily = run.style.font;
      el.appendChild(s);
    });
    box.appendChild(el);
  });
  return box;
}

function fillCss(style: ShapeStyle): string {
  return style.fill && style.fill !== 'none' ? style.fill : 'transparent';
}

/** 画一个非图表对象（图表由 ./overlay.ts 异步画） */
export function renderItem(item: DrawingItem, rect: Rect, ctx: ShapeContext): HTMLElement {
  const el = document.createElement('div');
  el.className = `${CLS}__object ${CLS}__object--${item.type}`;
  place(el, rect);
  const tf = transformOf(item.xfrm);
  if (tf) el.style.transform = tf;
  if (item.descr) el.setAttribute('aria-label', item.descr);
  switch (item.type) {
    case 'picture': {
      const border = css(item.style.line);
      if (border) el.style.outline = border;
      if (item.linked) el.appendChild(placeholderCard(rect, undefined, ctx.imageLabel('external'), 'image'));
      else void ctx.loader.load(item.media).then(img => applyImage(el, img, item.crop, ctx, rect));
      break;
    }
    case 'ole': {
      const label = ctx.oleLabel(item.progId || 'OLE');
      el.title = label;
      void ctx.loader.load(item.media).then(img => {
        if ('url' in img) applyImage(el, img, undefined, ctx, rect);
        else el.appendChild(placeholderCard(rect, undefined, label, 'ole'));
      });
      break;
    }
    case 'shape': {
      const svg = shapeSvg(item, rect);
      if (svg) el.appendChild(svg);
      else {
        el.style.background = fillCss(item.style);
        const border = css(item.style.line);
        if (border) el.style.border = border;
        if (item.geom === 'ellipse' || item.geom === 'flowChartConnector') el.style.borderRadius = '50%';
        else if (item.geom === 'roundRect' || item.geom === 'flowChartAlternateProcess')
          el.style.borderRadius = `${Math.min(rect.w, rect.h) * 0.16}px`;
        if (item.media)
          void ctx.loader
            .load(item.media)
            .then(img => 'url' in img && (el.style.background = `center / 100% 100% no-repeat url("${img.url}")`));
      }
      const text = textBlock(item.paragraphs, item.body);
      if (text) {
        if (item.body.rotation) text.style.transform = `rotate(${item.body.rotation}deg)`;
        el.appendChild(text);
      }
      break;
    }
    case 'group': {
      const ch =
        item.xfrm?.ch ?? (item.xfrm ? { x: item.xfrm.x, y: item.xfrm.y, w: item.xfrm.w, h: item.xfrm.h } : undefined);
      const sx = ch && ch.w ? rect.w / ch.w : 0;
      const sy = ch && ch.h ? rect.h / ch.h : 0;
      item.children.forEach(c => {
        if (c.hidden || !c.xfrm || !ch) return;
        const r: Rect = { x: (c.xfrm.x - ch.x) * sx, y: (c.xfrm.y - ch.y) * sy, w: c.xfrm.w * sx, h: c.xfrm.h * sy };
        if (c.type === 'chart' || c.type === 'chartex') {
          const child = document.createElement('div');
          child.className = `${CLS}__object ${CLS}__object--chart`;
          place(child, r);
          if (c.type === 'chart') applyChartFrame(child, c.chart?.style, c.chart?.roundedCorners);
          child.dataset.groupChart = '1';
          groupChartItems.set(child, c);
          el.appendChild(child);
          return;
        }
        el.appendChild(renderItem(c, r, ctx));
      });
      break;
    }
    default:
      break;
  }
  return el;
}
