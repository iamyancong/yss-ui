import { parse } from '@babel/parser';
import { parse as parseSfc } from '@vue/compiler-sfc';
import MagicString from 'magic-string';

/** 构建产物中的公开符号映射。 */
export interface EntryContract {
  entries: Record<string, { import: string; styles: string[] }>;
}

/** 根入口和历史虚拟入口采用相同具名导入契约。 */
const ROOTS = new Set([
  '@yss-ui/components',
  '@yss-ui/components/lite',
  'virtual:yss-light-components',
  'virtual:yss-heavy-components',
]);

/** 按语法节点改写运行时具名导入，保留类型、默认安装与动态整包语义。 */
export const transformImports = (code: string, id: string, contract: EntryContract) => {
  if (![...ROOTS].some(name => code.includes(name))) return null;
  const cleanId = id.split('?')[0];
  const output = new MagicString(code);
  const scripts =
    cleanId.endsWith('.vue') && !id.includes('?')
      ? (() => {
          const { descriptor, errors } = parseSfc(code, { filename: cleanId });
          if (errors.length) throw new Error(`[YSS UI] 无法解析 ${id}: ${errors[0]}`);
          const blocks = [descriptor.script, descriptor.scriptSetup].filter(
            (block): block is NonNullable<typeof block> => Boolean(block)
          );
          return blocks.map(block => ({ code: block.content, offset: block.loc.start.offset }));
        })()
      : [{ code, offset: 0 }];
  for (const script of scripts) {
    const ast = parse(script.code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration') continue;
      if (!node.source || !ROOTS.has(node.source.value)) continue;
      if (
        (node.type === 'ImportDeclaration' && node.importKind === 'type') ||
        (node.type === 'ExportNamedDeclaration' && node.exportKind === 'type')
      )
        continue;
      const replacements: string[] = [];
      const preserved: string[] = [];
      for (const spec of node.specifiers) {
        const specStart = spec.start ?? 0;
        const specEnd = spec.end ?? 0;
        const specText = script.code.slice(specStart, specEnd);
        const isImport = spec.type === 'ImportSpecifier';
        const isExport = spec.type === 'ExportSpecifier';
        if (!isImport && !isExport) {
          preserved.push(specText);
          continue;
        }
        const original = isImport ? spec.imported : spec.local;
        const name = original.type === 'Identifier' ? original.name : original.value;
        const typed = isImport ? spec.importKind === 'type' : spec.exportKind === 'type';
        if (typed || !contract.entries[name]) {
          preserved.push(specText);
          continue;
        }
        const binding = specText;
        const from = `@yss-ui/components/entries/${name}`;
        replacements.push(`${isImport ? 'import' : 'export'} { ${binding} } from ${JSON.stringify(from)};`);
      }
      if (!replacements.length) continue;
      if (preserved.length) {
        /** 默认或命名空间导入不能放入花括号；具名部分单独保留。 */
        const named = node.specifiers
          .filter(spec => spec.type === 'ImportSpecifier' || spec.type === 'ExportSpecifier')
          .map(spec => script.code.slice(spec.start ?? 0, spec.end ?? 0))
          .filter(text => preserved.includes(text));
        const other = node.specifiers
          .filter(spec => spec.type !== 'ImportSpecifier' && spec.type !== 'ExportSpecifier')
          .map(spec => script.code.slice(spec.start ?? 0, spec.end ?? 0));
        const bindings = [...other, ...(named.length ? [`{ ${named.join(', ')} }`] : [])].join(', ');
        replacements.unshift(
          `${node.type === 'ImportDeclaration' ? 'import' : 'export'} ${bindings} from ${JSON.stringify(node.source.value)};`
        );
      }
      const nodeStart = node.start ?? 0;
      const nodeEnd = node.end ?? 0;
      output.overwrite(script.offset + nodeStart, script.offset + nodeEnd, replacements.join('\n'));
    }
  }
  return output.hasChanged()
    ? { code: output.toString(), map: output.generateMap({ source: id, includeContent: true, hires: true }) }
    : null;
};
