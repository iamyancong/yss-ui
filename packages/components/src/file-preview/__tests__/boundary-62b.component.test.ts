/**
 * #62 / #64 边界值（组件）：大文件不拦截、largeFileWarnSize 传给渲染器（按默认值处理）、无效的 maxSize、
 * 自定义渲染器提示大文件时按 Ctrl 缩放、快速连续切换与渲染中切换。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAX_FILE_SIZE } from '../constant';
import { listZipEntries, replaceZipEntries } from '../excel/zip';
import FilePreview from '../index.vue';
import { registerPreviewRenderer, unregisterPreviewRenderer } from '../renderers/registry';
import type { PreviewRenderer, PreviewZoomController } from '../renderers/types';
import { loadFixture, textBuffer } from './helpers';

/** 指定字节数、能识别为 docx 的内容 */
const docxOf = (size: number, part = 'word/document.xml') => {
  const head = new TextEncoder().encode(`PK\u0003\u0004..${part}`);
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  return out.buffer as ArrayBuffer;
};

const zoomSet: number[] = [];
const rendered: string[] = [];
const warnSizes: Array<number | undefined> = [];
const install = (types: string[], preflight?: PreviewRenderer['preflight']) =>
  registerPreviewRenderer({
    types,
    preflight,
    create() {
      let scale = 1;
      const zoom: PreviewZoomController = { get: () => scale, set: z => void zoomSet.push((scale = z)) };
      return {
        async render(container: HTMLElement, data: ArrayBuffer, ctx) {
          rendered.push(`${ctx.fileName}:${data.byteLength}`);
          warnSizes.push(ctx.largeFileWarnSize);
          container.textContent = `content ${ctx.fileName}`;
        },
        zoom,
      };
    },
  });

afterEach(() => {
  for (const t of ['docx', 'pptx', 'txt']) unregisterPreviewRenderer(t);
  zoomSet.length = 0;
  rendered.length = 0;
  warnSizes.length = 0;
  document.body.innerHTML = '';
});

describe('大文件不拦截：largeFileWarnSize 只决定提示条', () => {
  const head = 40;
  it.each([
    [head - 1, head - 1],
    [head, head],
    [head + 1, head + 1],
  ])(
    '阈值 %i 字节、文件 40 字节 → 直接渲染，渲染器收到阈值 %i（由渲染器决定是否显示提示条）',
    async (warn, expected) => {
      install(['docx']);
      const w = mount(FilePreview, { props: { source: docxOf(head), fileName: 'a.docx', largeFileWarnSize: warn } });
      await flushPromises();
      expect(w.classes()).toContain('yss-file-preview--ready');
      expect(warnSizes).toEqual([expected]);
      w.unmount();
    }
  );

  it.each([0, -1, NaN, Infinity])('largeFileWarnSize = %s：渲染器收到 Infinity（不按大小提示）', async warn => {
    install(['docx', 'pptx']);
    for (const name of ['a.docx', 'a.pptx']) {
      const part = name.endsWith('pptx') ? 'ppt/presentation.xml' : 'word/document.xml';
      const w = mount(FilePreview, { props: { source: docxOf(100, part), fileName: name, largeFileWarnSize: warn } });
      await flushPromises();
      expect(w.classes(), name).toContain('yss-file-preview--ready');
      w.unmount();
    }
    expect(warnSizes).toEqual([Infinity, Infinity]);
  });

  it('未传：渲染器收到默认 10MB；pptx、txt 都直接渲染', async () => {
    install(['pptx', 'txt']);
    const p = mount(FilePreview, {
      props: { source: docxOf(100, 'ppt/presentation.xml'), fileName: 'a.pptx', largeFileWarnSize: 10 },
    });
    const t = mount(FilePreview, { props: { source: textBuffer('x'.repeat(100)), fileName: 'a.txt' } });
    await flushPromises();
    expect(p.classes()).toContain('yss-file-preview--ready');
    expect(t.classes()).toContain('yss-file-preview--ready');
    expect(warnSizes).toContain(10 * 1024 * 1024);
    p.unmount();
    t.unmount();
  });

  it('maxSize 小于 largeFileWarnSize：超过 maxSize 只能下载，不再提示', async () => {
    install(['docx']);
    const w = mount(FilePreview, {
      props: { source: docxOf(100), fileName: 'a.docx', maxSize: 50, largeFileWarnSize: 80 },
    });
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--oversize');
    expect(rendered).toEqual([]);
    w.unmount();
  });
});

describe('maxSize 边界与无效值', () => {
  it.each([
    [99, 'oversize'],
    [100, 'ready'],
    [101, 'ready'],
    [Infinity, 'ready'],
  ])('maxSize = %s、文件 100 字节 → %s', async (maxSize, status) => {
    install(['txt']);
    const w = mount(FilePreview, { props: { source: textBuffer('x'.repeat(100)), fileName: 'a.txt', maxSize } });
    await flushPromises();
    expect(w.classes()).toContain(`yss-file-preview--${status}`);
    w.unmount();
  });

  it.each([0, -1, NaN])('maxSize = %s 无效：按默认 20MB，提示文案里的上限也是 20MB', async maxSize => {
    install(['txt']);
    const ok = mount(FilePreview, { props: { source: textBuffer('hello'), fileName: 'a.txt', maxSize } });
    await flushPromises();
    expect(ok.classes()).toContain('yss-file-preview--ready');
    ok.unmount();
    const big = mount(FilePreview, {
      props: { source: new Uint8Array(DEFAULT_MAX_FILE_SIZE + 1).buffer, fileName: 'a.txt', maxSize },
    });
    await flushPromises();
    expect(big.classes()).toContain('yss-file-preview--oversize');
    expect(big.text()).toContain('20');
    expect(big.text()).not.toContain('NaN');
    big.unmount();
  });
});

describe('自定义渲染器提示大文件时按 Ctrl 缩放', () => {
  it('Ctrl + = / Ctrl + 滚轮不缩放、不拦截浏览器默认行为；继续预览后恢复', async () => {
    install(['docx'], async () => ({ level: 'warn', reason: 'size' }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = mount(FilePreview, {
      attachTo: document.body,
      props: { source: docxOf(100), fileName: 'a.docx', largeFileWarnSize: 10 },
    });
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--large-file');
    const key = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true });
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    // happy-dom 的 WheelEvent 不支持修饰键参数
    Object.defineProperty(wheel, 'ctrlKey', { value: true });
    w.element.dispatchEvent(key);
    w.element.dispatchEvent(wheel);
    await flushPromises();
    expect(zoomSet).toEqual([]);
    expect(key.defaultPrevented).toBe(false);
    expect(wheel.defaultPrevented).toBe(false);
    expect(w.emitted('update:zoom')).toBeUndefined();
    expect(w.classes()).toContain('yss-file-preview--large-file');
    const buttons = w.findAll('.yss-file-preview__state button');
    await buttons[buttons.length - 1].trigger('click');
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--ready');
    const key2 = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true });
    w.element.dispatchEvent(key2);
    await flushPromises();
    expect(zoomSet.length).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    w.unmount();
  });
});

describe('快速切换', () => {
  it('预检、读取、渲染各阶段连续切换 30 次：只显示最后一个文件，中途的实例都被销毁', async () => {
    const destroyed: string[] = [];
    const started: string[] = [];
    registerPreviewRenderer({
      types: ['txt'],
      preflight: async () => {
        await new Promise(r => setTimeout(r, 1));
        return null;
      },
      create() {
        let name = '';
        return {
          async render(container: HTMLElement, _d: ArrayBuffer, ctx) {
            name = ctx.fileName;
            started.push(name);
            await new Promise(r => setTimeout(r, 2));
            container.textContent = `content ${name}`;
          },
          destroy() {
            destroyed.push(name);
          },
        };
      },
    });
    const source = (i: number) => (i % 3 === 0 ? new Blob([`f${i}`]) : textBuffer(`f${i}`));
    const w = mount(FilePreview, { props: { source: source(0), fileName: 'f0.txt' } });
    for (let i = 1; i < 30; i++) {
      await w.setProps({ source: source(i), fileName: `f${i}.txt` });
      // 交错停在不同阶段
      await new Promise(r => setTimeout(r, i % 4));
    }
    await new Promise(r => setTimeout(r, 20));
    await flushPromises();
    expect(w.text()).toContain('content f29.txt');
    expect(w.text()).not.toMatch(/content f(?!29)/);
    // 开始渲染但被切走的实例都已销毁
    for (const name of started.filter(n => n !== 'f29.txt')) expect(destroyed).toContain(name);
    w.unmount();
    expect(destroyed).toContain('f29.txt');
  });
});

/** 把 zip 里的一个部件换成不完整的 XML */
const corruptPart = (data: ArrayBuffer, part: string) => {
  const entries = listZipEntries(data)!;
  return replaceZipEntries(data, entries, new Map([[part, new TextEncoder().encode('<p:presentation><p:sldIdLst')]]))!;
};

describe('0 字节与损坏的文件（真实渲染器）', () => {
  const pptx = () => loadFixture('pptx-media.pptx');
  it.each(['a.docx', 'a.pptx', 'a.xlsx', 'a.xls', 'a.png', 'a.pdf'])('%s 0 字节 → 空文件', async name => {
    const w = mount(FilePreview, { props: { source: new ArrayBuffer(0), fileName: name } });
    await flushPromises();
    expect(w.classes()).toContain('yss-file-preview--empty');
    w.unmount();
  });

  it.each([
    ['docx 只有 zip 头', 'a.docx', () => docxOf(64)],
    ['pptx 截断一半（目录丢失，认不出类型）', 'a.pptx', () => pptx().slice(0, pptx().byteLength >> 1)],
    ['pptx 的 presentation.xml 损坏', 'a.pptx', () => corruptPart(pptx(), 'ppt/presentation.xml')],
  ])('%s → 显示错误或「不支持」（可下载），不抛未处理的异常', async (_, name, make) => {
    const w = mount(FilePreview, { props: { source: make(), fileName: name } });
    for (let i = 0; i < 50 && !w.classes().some(c => /--(error|ready|unsupported)$/.test(c)); i++) {
      await new Promise(r => setTimeout(r, 20));
      await flushPromises();
    }
    expect(
      w.classes().some(c => /--(error|unsupported)$/.test(c)),
      w.classes().join(' ')
    ).toBe(true);
    w.unmount();
  });
});
