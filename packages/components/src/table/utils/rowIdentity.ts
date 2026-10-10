const isEmptyKey = (v: unknown): boolean => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/**
 * 解析操作列所在行的稳定身份标识。
 *
 * 解析优先级：
 * 1. scope.rowid（vxe 按 rowConfig.keyField 计算出的主键标识，支持深路径且与 tr key 复用一致）
 * 2. row.id（常规业务唯一主键）
 * 3. row 对象引用本身（兜底，维持原有引用语义）
 *
 * @param scope 单元格 scope（包含 row、rowid 等）
 * @returns 稳定身份标识，用于 watch 比较
 */
export function resolveRowIdentity(scope: any): unknown {
  if (!isEmptyKey(scope?.rowid)) {
    return `rowid:${String(scope.rowid)}`;
  }
  const row = scope?.row;
  if (row === null || row === undefined) {
    return undefined;
  }
  if (typeof row === 'object' && !isEmptyKey(row.id)) {
    return `id:${String(row.id)}`;
  }
  return row;
}
