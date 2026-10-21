import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { MissingDependencyError } from '../errors';
import FilePreview from '../index.vue';
import { docxRenderer } from '../renderers/docx';
import { excelRenderer } from '../renderers/excel';
import { pptxRenderer, registerPptxRenderer } from '../pptx';
import type { RenderContext } from '../renderers/types';
import { docxBuffer, xlsxBuffer } from './helpers';

vi.mock('docx-preview', () => {
  throw new Error('Cannot find package docx-preview');
});
vi.mock('@vue-office/excel', () => {
  throw new Error('Cannot find package @vue-office/excel');
});
vi.mock('@aiden0z/pptx-renderer', () => {
  throw new Error('Cannot find package @aiden0z/pptx-renderer');
});

const ctx = { signal: new AbortController().signal, t: (k: string) => k } as unknown as RenderContext;

describe('缺少可选依赖', () => {
  it('渲染器抛出 MissingDependencyError 并带包名', async () => {
    await expect(docxRenderer.create().render(document.createElement('div'), docxBuffer(), ctx)).rejects.toMatchObject({
      name: 'MissingDependencyError',
      packageName: 'docx-preview',
    });
    await expect(
      excelRenderer.create().render(document.createElement('div'), xlsxBuffer(), ctx)
    ).rejects.toBeInstanceOf(MissingDependencyError);
    await expect(pptxRenderer.create().render(document.createElement('div'), xlsxBuffer(), ctx)).rejects.toMatchObject({
      name: 'MissingDependencyError',
      packageName: '@aiden0z/pptx-renderer',
    });
  });

  it('已注册 pptx 但缺少 @aiden0z/pptx-renderer 时显示安装提示', async () => {
    const unregister = registerPptxRenderer();
    const pptx = new TextEncoder().encode('PK\u0003\u0004..ppt/presentation.xml').buffer as ArrayBuffer;
    const wrapper = mount(FilePreview, { props: { source: pptx, fileName: 'deck.pptx' } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('pnpm add @aiden0z/pptx-renderer'));
    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(MissingDependencyError);
    wrapper.unmount();
    unregister();
  });

  it('自定义 load 失败同样按缺少依赖处理', async () => {
    const { createPptxRenderer } = await import('../pptx');
    const renderer = createPptxRenderer({ load: () => Promise.reject(new Error('nope')) });
    await expect(renderer.create().render(document.createElement('div'), xlsxBuffer(), ctx)).rejects.toMatchObject({
      name: 'MissingDependencyError',
      packageName: '@aiden0z/pptx-renderer',
    });
  });

  it('组件显示安装提示，触发 error 而不触发 loaded', async () => {
    const wrapper = mount(FilePreview, { props: { source: docxBuffer(), fileName: 'a.docx' } });
    await vi.waitFor(() => expect(wrapper.text()).toContain('缺少预览依赖'));
    expect(wrapper.text()).toContain('pnpm add docx-preview');
    expect(wrapper.emitted('loaded')).toBeUndefined();
    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(MissingDependencyError);
    expect(wrapper.find('.yss-file-preview__host').exists()).toBe(false);
    wrapper.unmount();
  });
});
