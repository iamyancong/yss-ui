/**
 * 清理稳定入口中的 Rollup 顶层副作用导入。
 *
 * 稳定入口只负责暴露对应实现模块；实现模块自身已经携带真实依赖。
 * 保留 CSS 副作用导入，避免未来入口存在显式样式时被误删。
 *
 * @param code Rollup 生成的入口代码
 * @param format 输出格式
 * @returns 清理后的入口代码
 */
export const pruneStableEntrySideEffects = (code: string, format: 'es' | 'cjs'): string => {
  const lines = code.split('\n');
  const isCssImport = (specifier: string) => /\.css(?:[?#].*)?$/.test(specifier);

  if (format === 'es') {
    return lines
      .filter(line => {
        const match = line.trim().match(/^import\s+["']([^"']+)["'];?$/);
        return !match || isCssImport(match[1]);
      })
      .join('\n');
  }

  return lines
    .filter(line => {
      const match = line.trim().match(/^require\(\s*["']([^"']+)["']\s*\);?$/);
      return !match || isCssImport(match[1]);
    })
    .join('\n');
};
