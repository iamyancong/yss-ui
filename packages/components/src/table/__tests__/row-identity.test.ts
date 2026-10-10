import { describe, expect, it } from 'vitest';
import { resolveRowIdentity } from '../utils/rowIdentity';

describe('resolveRowIdentity 行身份解析', () => {
  it('优先使用 scope.rowid', () => {
    const scope = { rowid: 'row_101', row: { id: 1 } };
    expect(resolveRowIdentity(scope)).toBe('rowid:row_101');
  });

  it('rowid 为空字符串、null 或 undefined 时回退到 row.id', () => {
    expect(resolveRowIdentity({ rowid: '', row: { id: 2 } })).toBe('id:2');
    expect(resolveRowIdentity({ rowid: null, row: { id: 2 } })).toBe('id:2');
    expect(resolveRowIdentity({ rowid: undefined, row: { id: 2 } })).toBe('id:2');
  });

  it('rowid 不存在且 row.id 为有效值时解析为 id:xxx', () => {
    expect(resolveRowIdentity({ row: { id: 'abc' } })).toBe('id:abc');
    expect(resolveRowIdentity({ row: { id: 100 } })).toBe('id:100');
  });

  it('数字 1 与字符串 "1" 视为同一身份', () => {
    expect(resolveRowIdentity({ row: { id: 1 } })).toBe(resolveRowIdentity({ row: { id: '1' } }));
    expect(resolveRowIdentity({ rowid: 1 })).toBe(resolveRowIdentity({ rowid: '1' }));
  });

  it('数字 0 作为合法主键时不被视为空键', () => {
    expect(resolveRowIdentity({ rowid: 0, row: { id: 99 } })).toBe('rowid:0');
    expect(resolveRowIdentity({ row: { id: 0 } })).toBe('id:0');
  });

  it('id 为空字符串、null、undefined 或 NaN 时回退到行对象引用', () => {
    const rowWithEmptyId = { id: '', name: 'test' };
    expect(resolveRowIdentity({ row: rowWithEmptyId })).toBe(rowWithEmptyId);

    const rowWithNullId = { id: null, name: 'test' };
    expect(resolveRowIdentity({ row: rowWithNullId })).toBe(rowWithNullId);

    const rowWithUndefId = { id: undefined, name: 'test' };
    expect(resolveRowIdentity({ row: rowWithUndefId })).toBe(rowWithUndefId);

    const rowWithNanId = { id: Number.NaN, name: 'test' };
    expect(resolveRowIdentity({ row: rowWithNanId })).toBe(rowWithNanId);

    const rowWithoutId = { name: 'test' };
    expect(resolveRowIdentity({ row: rowWithoutId })).toBe(rowWithoutId);
  });

  it('row 为 undefined 或 null 时返回 undefined', () => {
    expect(resolveRowIdentity(undefined)).toBeUndefined();
    expect(resolveRowIdentity(null)).toBeUndefined();
    expect(resolveRowIdentity({})).toBeUndefined();
    expect(resolveRowIdentity({ row: null })).toBeUndefined();
    expect(resolveRowIdentity({ row: undefined })).toBeUndefined();
  });
});
