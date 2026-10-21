import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCustomRenderers,
  getCustomRendererTypes,
  getRenderer,
  registerPreviewRenderer,
  unregisterPreviewRenderer,
} from '../renderers/registry';
import type { PreviewRenderer } from '../renderers/types';

const fakeRenderer = (types: string[]): PreviewRenderer => ({
  types,
  create: () => ({ render: async () => undefined }),
});

describe('file-preview/renderers/registry', () => {
  afterEach(() => clearCustomRenderers());

  it('内置类型都有渲染器工厂', async () => {
    for (const type of ['docx', 'xlsx', 'xls', 'pdf', 'txt', 'csv', 'md']) {
      const renderer = await getRenderer(type);
      expect(renderer?.types).toContain(type);
      expect(typeof renderer?.create).toBe('function');
    }
  });

  it('每次 create 返回独立实例', async () => {
    const renderer = await getRenderer('pdf');
    expect(renderer?.create()).not.toBe(renderer?.create());
  });

  it('未知类型返回 null', async () => {
    expect(await getRenderer('ppt')).toBeNull();
    expect(await getRenderer('doc')).toBeNull();
  });

  it('自定义渲染器优先，类型不区分大小写', async () => {
    const custom = fakeRenderer(['PDF', 'ofd']);
    registerPreviewRenderer(custom);
    expect(await getRenderer('pdf')).toBe(custom);
    expect(await getRenderer('OFD')).toBe(custom);
    expect(getCustomRendererTypes().sort()).toEqual(['ofd', 'pdf']);
    unregisterPreviewRenderer('pdf');
    expect(await getRenderer('pdf')).not.toBe(custom);
  });

  it('注册参数非法时抛错', () => {
    expect(() => registerPreviewRenderer(fakeRenderer([]))).toThrow(TypeError);
    expect(() => registerPreviewRenderer({ types: ['x'] } as unknown as PreviewRenderer)).toThrow(TypeError);
  });
});
