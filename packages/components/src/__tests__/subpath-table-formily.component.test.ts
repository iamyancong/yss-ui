import { describe, expect, it, vi } from 'vitest';

vi.mock('ant-design-vue', async () => {
  const { defineComponent: defineVueComponent, h: render } = await import('vue');
  const createStub = (name: string) =>
    defineVueComponent({
      name,
      setup:
        (_, { slots }) =>
        () =>
          render('div', slots.default?.()),
    });
  return {
    Form: createStub('FormStub'),
    FormItem: createStub('FormItemStub'),
    Button: createStub('ButtonStub'),
    Pagination: createStub('PaginationStub'),
  };
});

vi.mock('@formily/antdv', async () => {
  const { defineComponent: defineVueComponent, h: render } = await import('vue');
  const createStub = (name: string) =>
    defineVueComponent({
      name,
      setup:
        (_, { slots }) =>
        () =>
          render('div', slots.default?.()),
    });
  return {
    FormItem: Object.assign(createStub('FormItemStub'), { BaseItem: createStub('BaseItemStub') }),
    FormLayout: createStub('FormLayoutStub'),
    FormGrid: createStub('FormGridStub'),
    Reset: createStub('ResetStub'),
    Submit: createStub('SubmitStub'),
  };
});

import {
  YTable,
  YEditTable,
  ActionButton,
  ActionColumn,
  EditTableColumn,
  EditTableCell,
  calcActionColumnWidth,
} from '@yss-ui/components/table';
import { YFormily, YssFormily, AutoButtonGroup, Reset, CompatibleFormilyFormItem } from '@yss-ui/components/formily';

describe('Table & Formily subpath exports', () => {
  it('table 子路径应当正确导出 YTable、YEditTable 及辅助方法', () => {
    expect(YTable).toBeDefined();
    expect(YEditTable).toBeDefined();
    expect(ActionButton).toBeDefined();
    expect(ActionColumn).toBeDefined();
    expect(EditTableColumn).toBeDefined();
    expect(EditTableCell).toBeDefined();
    expect(typeof calcActionColumnWidth).toBe('function');
  });

  it('formily 子路径应当正确导出 YFormily 及辅助组件', () => {
    expect(YFormily).toBeDefined();
    expect(YssFormily).toBeDefined();
    expect(YFormily).toBe(YssFormily);
    expect(AutoButtonGroup).toBeDefined();
    expect(Reset).toBeDefined();
    expect(CompatibleFormilyFormItem).toBeDefined();
  });
});
