/**
 * 极简 XML 解析：把图表、绘图、批注等小型 OOXML 部件读成元素树，供 ./drawing.ts、./chart.ts 使用。
 *
 * 只做非校验解析（不处理 DTD、外部实体），不依赖浏览器 DOMParser，在 Node 测试环境也能运行。
 * 元素名去掉命名空间前缀（c:chart → chart），属性名保留前缀（r:id）。
 * 格式错误时尽量读出已解析的部分，不抛异常。
 */
import { decodeXmlText } from './xlsx';

export interface XNode {
  /** 去掉前缀的元素名 */
  name: string;
  /** 前缀（c:chart 的 c），没有时为空字符串 */
  prefix: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** 直接包含的文字（已解码） */
  text: string;
}

const NAME = /[A-Za-z_][\w.:-]*/y;
const ATTR = /\s*([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;

/** 解析 XML；失败或为空时返回 null */
export function parseXml(xml: string | null | undefined, maxNodes = 200000): XNode | null {
  if (!xml) return null;
  const root: XNode = { name: '#root', prefix: '', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  let i = 0;
  let count = 0;
  const len = xml.length;
  while (i < len) {
    const lt = xml.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decodeXmlText(xml.slice(i));
      break;
    }
    if (lt > i) top.text += decodeXmlText(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      top.text += xml.slice(lt + 9, end < 0 ? len : end);
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      const end = xml.indexOf('>', lt + 2);
      i = end < 0 ? len : end + 1;
      continue;
    }
    if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt + 2);
      const qname = xml.slice(lt + 2, end < 0 ? len : end).trim();
      // 关闭到最近的同名元素；不匹配的结束标签忽略
      for (let k = stack.length - 1; k > 0; k--) {
        const n = stack[k];
        if ((n.prefix ? `${n.prefix}:${n.name}` : n.name) === qname) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? len : end + 1;
      continue;
    }
    NAME.lastIndex = lt + 1;
    const nm = NAME.exec(xml);
    if (!nm) {
      top.text += '<';
      i = lt + 1;
      continue;
    }
    const qname = nm[0];
    const colon = qname.indexOf(':');
    const node: XNode = {
      name: colon >= 0 ? qname.slice(colon + 1) : qname,
      prefix: colon >= 0 ? qname.slice(0, colon) : '',
      attrs: {},
      children: [],
      text: '',
    };
    let p = NAME.lastIndex;
    for (;;) {
      ATTR.lastIndex = p;
      const am = ATTR.exec(xml);
      if (!am) break;
      node.attrs[am[1]] = decodeXmlText(am[3] ?? am[4] ?? '');
      p = ATTR.lastIndex;
    }
    const gt = xml.indexOf('>', p);
    if (gt < 0) break;
    top.children.push(node);
    if (++count > maxNodes) break;
    const selfClose = xml[gt - 1] === '/';
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root.children[0] ?? null;
}

/** 第一个同名子元素（按去掉前缀的名称） */
export const child = (node: XNode | null | undefined, name: string): XNode | undefined =>
  node?.children.find(c => c.name === name);

/** 所有同名子元素 */
export const childrenOf = (node: XNode | null | undefined, name: string): XNode[] =>
  node ? node.children.filter(c => c.name === name) : [];

/** 按路径取后代：path('plotArea', 'barChart') */
export function path(node: XNode | null | undefined, ...names: string[]): XNode | undefined {
  let cur: XNode | undefined = node ?? undefined;
  for (const n of names) {
    cur = child(cur, n);
    if (!cur) return undefined;
  }
  return cur;
}

/** 深度优先查找第一个同名后代 */
export function find(node: XNode | null | undefined, name: string): XNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.name === name) return c;
    const hit = find(c, name);
    if (hit) return hit;
  }
  return undefined;
}

/** 所有同名后代（深度优先） */
export function findAll(node: XNode | null | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

/** 子元素的 val 属性 */
export const val = (node: XNode | null | undefined, name: string): string | undefined => child(node, name)?.attrs.val;

/** 子元素 val 为布尔值；没有该元素时返回 fallback，有元素没有 val 时按 OOXML 默认 true */
export function boolVal(node: XNode | null | undefined, name: string, fallback = false): boolean {
  const c = child(node, name);
  if (!c) return fallback;
  const v = c.attrs.val;
  return v === undefined ? true : v === '1' || v === 'true';
}

export function numVal(node: XNode | null | undefined, name: string): number | undefined {
  const v = val(node, name);
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 展开 mc:AlternateContent：取第一个非空的 Choice，否则取 Fallback。
 * 返回展开后的子元素列表（不含 AlternateContent 本身）。
 */
export function unwrapAlternate(nodes: XNode[]): XNode[] {
  const out: XNode[] = [];
  for (const n of nodes) {
    if (n.name !== 'AlternateContent') {
      out.push(n);
      continue;
    }
    const choice = n.children.find(c => c.name === 'Choice' && c.children.length);
    const pick = choice ?? n.children.find(c => c.name === 'Fallback');
    if (pick) out.push(...unwrapAlternate(pick.children));
  }
  return out;
}

/** 元素内所有文字（a:t），段落之间换行 */
export function textContent(node: XNode | null | undefined): string {
  if (!node) return '';
  if (node.name === 't' || node.name === 'v') return node.text;
  if (node.name === 'br') return '\n';
  if (!node.children.length) return node.text;
  let s = '';
  node.children.forEach((c, i) => {
    if (c.name === 'p' && i > 0 && node.children.slice(0, i).some(x => x.name === 'p')) s += '\n';
    s += textContent(c);
  });
  return s;
}
