import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import ts from 'typescript';

/** 插件与契约产物仅从本仓库真实导出构建。 */
const root = fileURLToPath(new URL('../packages/components', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const policy = JSON.parse(readFileSync(resolve(root, 'consumption-policy.json'), 'utf8'));
const vitePeer = pkg.peerDependencies?.vite;
if (!vitePeer || policy.plugin?.vitePeer !== vitePeer) {
  throw new Error(
    `消费契约中的 plugin.vitePeer 必须与 package.json peerDependencies.vite 一致：${policy.plugin?.vitePeer} !== ${vitePeer}`
  );
}
const ast = ts.createSourceFile(
  'index.ts',
  readFileSync(resolve(root, 'src/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const names = ast.statements
  .flatMap(node =>
    ts.isExportDeclaration(node) && !node.isTypeOnly && node.exportClause && ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements.filter(item => !item.isTypeOnly).map(item => item.name.text)
      : []
  )
  .filter(name => !['default', 'install'].includes(name));
/** 从构建后的静态模块图收集真实 CSS，动态组件样式仍留在动态闭包。 */
const collectStyles = (file, visited = new Set()) => {
  if (visited.has(file)) return [];
  visited.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return source.statements.flatMap(node => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return [];
    const id = node.moduleSpecifier.text;
    if (!id.startsWith('.')) return id.endsWith('.css') ? [id] : [];
    const target = resolve(dirname(file), id);
    if (id.endsWith('.css')) return [relative(root, target).split('\\').join('/')];
    return /\.m?js$/.test(id) ? collectStyles(target, visited) : [];
  });
};
const authorityEntryPath = resolve(root, 'dist/root/entries/AuthorityDropdown.mjs');
const authorityEntry = readFileSync(authorityEntryPath, 'utf8');
const authoritySideEffectImports = authorityEntry.match(
  /^\s*import\s+["'](?![^"']+\.css(?:[?#].*)?["'])[^"']+["'];?\s*$/gm
);
const authorityCjsEntry = readFileSync(resolve(root, 'dist/root/entries/AuthorityDropdown.cjs'), 'utf8');
const authoritySideEffectRequires = authorityCjsEntry.match(
  /^\s*require\(\s*["'](?![^"']+\.css(?:[?#].*)?["'])[^"']+["']\s*\);?\s*$/gm
);
if (authoritySideEffectImports?.length || authoritySideEffectRequires?.length) {
  throw new Error(
    `AuthorityDropdown 稳定入口仍包含无关副作用导入：${[
      ...(authoritySideEffectImports || []),
      ...(authoritySideEffectRequires || []),
    ].join(' | ')}`
  );
}
const entries = Object.fromEntries(
  names.map(name => [
    name,
    {
      import: `@yss-ui/components/entries/${name}`,
      styles: [...new Set(collectStyles(resolve(root, `dist/root/entries/${name}.mjs`)))],
    },
  ])
);
for (const name of names) {
  readFileSync(resolve(root, `dist/root/entries/${name}.mjs`));
  writeFileSync(resolve(root, `dist/root/entries/${name}.d.ts`), `export { ${name} } from '../../index';\n`);
}
const contract = {
  ...policy,
  componentsVersion: pkg.version,
  peerDependencies: { vite: vitePeer },
  plugin: { ...policy.plugin, vitePeer },
  entries,
  subpaths: Object.keys(pkg.exports).filter(name => !name.includes('*')),
};
writeFileSync(resolve(root, 'dist/consumption.json'), JSON.stringify(contract, null, 2) + '\n');
mkdirSync(resolve(root, 'dist/vite'), { recursive: true });
await build({
  entryPoints: [resolve(root, 'tools/vite.ts')],
  outfile: resolve(root, 'dist/vite/index.mjs'),
  bundle: true,
  alias: {
    '@vue/compiler-sfc': fileURLToPath(import.meta.resolve('@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js')),
  },
  platform: 'node',
  format: 'esm',
  target: 'node18',
  external: ['vite'],
  minify: true,
});
writeFileSync(
  resolve(root, 'dist/vite/index.d.ts'),
  "import type { Plugin } from 'vite';\n/** 启用根入口按需加载与样式关联。 */\nexport declare const yssUi: () => Plugin;\n"
);
