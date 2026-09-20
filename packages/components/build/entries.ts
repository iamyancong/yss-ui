import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { pruneStableEntrySideEffects } from './entry-facade';

export { pruneStableEntrySideEffects } from './entry-facade';

/** 从根入口的真实具名再导出生成稳定实现入口，类型导出不进入运行时。 */
export const readEntries = (root: string): Record<string, { source: string; imported: string }> => {
  const file = resolve(root, 'src/index.ts');
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const entries: Record<string, { source: string; imported: string }> = {};
  for (const node of ast.statements) {
    if (
      !ts.isExportDeclaration(node) ||
      node.isTypeOnly ||
      !node.moduleSpecifier ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !node.exportClause ||
      !ts.isNamedExports(node.exportClause)
    )
      continue;
    for (const item of node.exportClause.elements) {
      if (item.isTypeOnly || item.name.text === 'default' || item.name.text === 'install') continue;
      entries[item.name.text] = {
        source: resolve(root, 'src', node.moduleSpecifier.text),
        imported: item.propertyName?.text ?? item.name.text,
      };
    }
  }
  return entries;
};

/** 生成虚拟入口；与根入口在同一 Rollup 图中构建，保持组件身份。 */
export const consumptionEntries = (root: string): Plugin => {
  const entries = readEntries(root);
  return {
    name: 'yss-consumption-entries',
    resolveId(id) {
      if (id === 'yss-table-styles' || id === resolve(root, 'yss-table-styles')) return '\0yss-table-styles';
      if (id.includes('yss-entry:')) return '\0' + id.slice(id.indexOf('yss-entry:'));
    },
    load(id) {
      if (id === '\0yss-table-styles') return `import ${JSON.stringify(resolve(root, 'src/table/base.less'))};`;
      if (!id.startsWith('\0yss-entry:')) return;
      const name = id.slice('\0yss-entry:'.length);
      const item = entries[name];
      return `export { ${item.imported} as ${name} } from ${JSON.stringify(item.source)};`;
    },
    transform(code, id) {
      if (id !== resolve(root, 'src/index.ts')) return;
      /** 旧 dist 保留历史全量样式；公开根入口把表格基础样式交给实际实现 chunk。 */
      const ast = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true);
      const tableStyles = new Set(['vxe-table/lib/style.css', 'vxe-pc-ui/lib/style.css', './table/global.less']);
      let transformed = code;
      for (const node of [...ast.statements].reverse()) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          tableStyles.has(node.moduleSpecifier.text)
        ) {
          transformed = transformed.slice(0, node.getStart(ast)) + transformed.slice(node.end);
        }
      }
      return { code: transformed, map: null };
    },
    generateBundle(_options, bundle) {
      /** CSS 只挂到拥有它的模块；动态组件的 CSS 随动态入口加载。 */
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const css = (chunk as typeof chunk & { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss;
        /** 样式跟随真实组件实现，根入口、lite、子路径和稳定入口共享同一份依赖。 */
        if (
          Object.keys(chunk.modules).some(id =>
            ['table', 'edit-table'].some(name => id.split('?')[0] === resolve(root, `src/${name}/index.vue`))
          )
        ) {
          if (!css) throw new Error(`表格实现缺少 Vite CSS 元数据：${chunk.fileName}`);
          const ownCss = [...css];
          css.clear();
          css.add('YTable.css');
          ownCss.forEach(file => css.add(file));
        }
        if (css?.size) {
          const prefix = chunk.fileName.split('/').length > 1 ? '../' : './';
          chunk.code =
            [...css]
              .map(file =>
                _options.format === 'es'
                  ? `import ${JSON.stringify(prefix + file)};`
                  : `require(${JSON.stringify(prefix + file)});`
              )
              .join('\n') +
            '\n' +
            chunk.code;
        }

        if (chunk.fileName.match(/(?:^|\/)entries\/[^/]+\.(?:mjs|cjs)$/)) {
          chunk.code = pruneStableEntrySideEffects(chunk.code, _options.format === 'es' ? 'es' : 'cjs');
          if (chunk.fileName.match(/(?:^|\/)entries\/YTable\.(?:mjs|cjs)$/)) {
            if (/edit-table|YEditTable/i.test(chunk.code)) {
              throw new Error(`entries/YTable 稳定入口仍包含 EditTable 相关引用：\n${chunk.code}`);
            }
          }
        }
      }
    },
  };
};
