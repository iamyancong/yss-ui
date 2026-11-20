import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import ts from 'typescript';

/** 读取真实静态 ESM 引用或 CJS require，不把注释、字符串和动态 import 当依赖。 */
const readStaticSpecifiers = file => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const specifiers = [];
  const visit = node => {
    if (ts.isFunctionLike(node)) return;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
};

/**
 * 校验稳定入口实际可达的 Table/EditTable 实现持有公共 CSS，且与生成契约一致。
 * 同时用于工作区构建和解包后的 tarball；独立检查 ESM/CJS，避免一侧漏注入。
 */
export const assertTableStyleOwnership = (packageRoot, entries) => {
  const cssFile = resolve(packageRoot, 'dist/root/YTable.css');
  assert.ok(readFileSync(cssFile).length > 0, '表格公共 CSS 为空');
  for (const [name, component] of [
    ['YTable', 'table'],
    ['YEditTable', 'edit-table'],
  ]) {
    assert.ok(entries[name]?.styles?.includes('dist/root/YTable.css'), `${name} 契约缺少表格公共 CSS`);
    for (const extension of ['mjs', 'cjs']) {
      const graph = new Map();
      const visit = file => {
        if (graph.has(file)) return;
        const imports = readStaticSpecifiers(file)
          .filter(id => id.startsWith('.'))
          .map(id => resolve(dirname(file), id));
        graph.set(file, imports);
        imports.filter(id => /\.(?:mjs|cjs|js)$/.test(id)).forEach(visit);
      };
      visit(resolve(packageRoot, `dist/root/entries/${name}.${extension}`));
      const implementations = [...graph.keys()].filter(
        file =>
          dirname(file) === resolve(packageRoot, 'dist/root/components') &&
          new RegExp(`^${component}-[^/]+\\.(?:mjs|cjs|js)$`).test(basename(file))
      );
      assert.ok(implementations.length > 0, `${name}.${extension} 未引用实际组件实现`);
      for (const file of implementations) {
        assert.ok(
          graph.get(file).includes(cssFile),
          `${name}.${extension} 的实现 ${basename(file)} 缺少公共 CSS 静态引用`
        );
      }
    }
  }
};
