import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

/** 将真实变换模块编译到独立临时目录，测试 TS/Vue 与再导出语义。 */
const dir = mkdtempSync(`${tmpdir()}/yss-transform-`);
await build({
  entryPoints: ['packages/components/tools/transform.ts'],
  outfile: `${dir}/transform.mjs`,
  bundle: true,
  alias: {
    '@vue/compiler-sfc': fileURLToPath(import.meta.resolve('@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js')),
  },
  platform: 'node',
  format: 'esm',
});
const { transformImports } = await import(pathToFileURL(`${dir}/transform.mjs`).href);
await build({
  entryPoints: ['packages/components/build/entry-facade.ts'],
  outfile: `${dir}/entries.mjs`,
  bundle: false,
  platform: 'node',
  format: 'esm',
});
const { pruneStableEntrySideEffects } = await import(pathToFileURL(`${dir}/entries.mjs`).href);
const contract = { entries: { YButton: {}, YCard: {}, YTable: {}, YFormily: {} } };
mkdirSync(`${dir}/vite`);
writeFileSync(`${dir}/consumption.json`, JSON.stringify(contract));
await build({
  entryPoints: ['packages/components/tools/vite.ts'],
  outfile: `${dir}/vite/index.mjs`,
  bundle: true,
  alias: {
    '@vue/compiler-sfc': fileURLToPath(import.meta.resolve('@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js')),
  },
  platform: 'node',
  format: 'esm',
});
const { yssUi } = await import(pathToFileURL(`${dir}/vite/index.mjs`).href);

test('官方插件拒绝与已知旧插件及旧预构建器并存', () => {
  for (const name of ['yss-components-isolation', 'yss-public-root-entry', 'yss-isolated-prebundle']) {
    const config = {
      root: dir,
      plugins: [{ name }],
      optimizeDeps: { esbuildOptions: { plugins: [{ name }] } },
    };
    assert.throws(() => yssUi().configResolved(config), /不能与旧入口插件同时启用/);
  }
  const config = { root: dir, plugins: [], optimizeDeps: { include: ['vue', '@yss-ui/components'] } };
  yssUi().configResolved(config);
  assert.deepEqual(config.optimizeDeps.include, ['vue']);
});

test('具名别名与类型导入分开，默认安装保持原语义', () => {
  const result = transformImports(
    "import UI, { YButton as B, type YTableColumn } from '@yss-ui/components';",
    'page.ts',
    contract
  ).code;
  assert.match(result, /import UI, \{ type YTableColumn \} from "@yss-ui\/components"/);
  assert.match(result, /import \{ YButton as B \} from "@yss-ui\/components\/entries\/YButton"/);
});
test('Vue 仅处理 script，不修改模板文本和样式', () => {
  const code = `<script setup lang="ts">import { YTable } from '@yss-ui/components';</script><template><p>import { YTable } from '@yss-ui/components';</p></template>`;
  const result = transformImports(code, 'Page.vue', contract).code;
  assert.match(result, /entries\/YTable/);
  assert.ok(result.endsWith(code.slice(code.indexOf('<template>'))));
});
test('历史虚拟入口和具名再导出按稳定入口输出', () => {
  assert.match(
    transformImports("export { YFormily as Form } from 'virtual:yss-heavy-components';", 'barrel.ts', contract).code,
    /entries\/YFormily/
  );
});
test('AuthorityDropdown 稳定入口只保留自身实现和必要 CSS', () => {
  const esm = [
    'import { _ } from "../components/authority-hash.mjs";',
    'import "../components/button-hash.mjs";',
    'import "../formily.mjs";',
    'import "../components/authority.css";',
    'export { _ as AuthorityDropdown };',
  ].join('\n');
  const cjs = [
    '"use strict";',
    'const authority = require("../components/authority-hash.cjs");',
    'require("../components/button-hash.cjs");',
    'require("../formily.cjs");',
    'require("../components/authority.css");',
    'exports.AuthorityDropdown = authority._;',
  ].join('\n');

  const prunedEsm = pruneStableEntrySideEffects(esm, 'es');
  const prunedCjs = pruneStableEntrySideEffects(cjs, 'cjs');
  assert.match(prunedEsm, /authority-hash\.mjs/);
  assert.match(prunedEsm, /authority\.css/);
  assert.doesNotMatch(prunedEsm, /button-hash|formily/);
  assert.match(prunedCjs, /authority-hash\.cjs/);
  assert.match(prunedCjs, /authority\.css/);
  assert.doesNotMatch(prunedCjs, /button-hash|formily/);
});
test('YTable 稳定入口解耦 YEditTable 且保留自身 VXE 样式', () => {
  const esm = [
    'import "../YTable.css";',
    'import "./YEditTable.mjs";',
    'import { Y } from "../components/table-hash.mjs";',
    'export { Y as YTable };',
  ].join('\n');
  const cjs = [
    'require("../YTable.css");',
    'require("./YEditTable.cjs");',
    '"use strict";',
    'const components_table = require("../components/table-hash.js");',
    'exports.YTable = components_table.YTable;',
  ].join('\n');

  const prunedEsm = pruneStableEntrySideEffects(esm, 'es');
  const prunedCjs = pruneStableEntrySideEffects(cjs, 'cjs');
  assert.match(prunedEsm, /YTable\.css/);
  assert.match(prunedEsm, /table-hash\.mjs/);
  assert.doesNotMatch(prunedEsm, /YEditTable/);
  assert.match(prunedCjs, /YTable\.css/);
  assert.match(prunedCjs, /table-hash\.js/);
  assert.doesNotMatch(prunedCjs, /YEditTable/);
});
test('构建产物 entries/YTable 无 edit-table 引用且 consumption.json 样式收敛', () => {
  const yTableMjs = readFileSync('packages/components/dist/root/entries/YTable.mjs', 'utf8');
  const yTableCjs = readFileSync('packages/components/dist/root/entries/YTable.cjs', 'utf8');
  assert.doesNotMatch(yTableMjs, /edit-table|YEditTable/i);
  assert.doesNotMatch(yTableCjs, /edit-table|YEditTable/i);
  assert.match(yTableMjs, /YTable\.css/);
  const realContract = JSON.parse(readFileSync('packages/components/dist/consumption.json', 'utf8'));
  const styles = realContract.entries.YTable.styles;
  assert.ok(styles.some(s => s.includes('YTable.css')));
  assert.ok(!styles.some(s => s.includes('edit-table') || s.includes('YEditTable')));
});
test('动态整包、namespace、默认全量安装与 type-only 不改写', () => {
  for (const code of [
    "const x = import('@yss-ui/components');",
    "import * as UI from '@yss-ui/components';",
    "import UI from '@yss-ui/components';",
    "import type { YTable } from '@yss-ui/components';",
  ]) {
    assert.equal(transformImports(code, 'test.ts', contract), null);
  }
});
test('同包工具和契约公开入口齐全，未拆成新的功能包', () => {
  const pkg = JSON.parse(readFileSync('packages/components/package.json', 'utf8'));
  assert.ok(pkg.exports['./vite']);
  assert.ok(pkg.exports['./consumption.json']);
  assert.ok(pkg.dependencies['vxe-table']);
  assert.ok(pkg.dependencies['@formily/core']);
  assert.equal(pkg.peerDependenciesMeta.vite.optional, true);
});

test('Agent 场景覆盖旧版、新模板、混合入口和未知版本，不生成独立功能包', () => {
  const policy = JSON.parse(readFileSync('packages/components/consumption-policy.json', 'utf8'));
  const pkg = JSON.parse(readFileSync('packages/components/package.json', 'utf8'));
  assert.equal(policy.defaultImport, '@yss-ui/components');
  assert.equal(policy.plugin.vitePeer, pkg.peerDependencies.vite);
  assert.match(policy.plugin.viteValidation, /Vite 6/);
  assert.ok(!policy.verifiedLegacyVersions['1.6.6'].includes('table'));
  assert.ok(policy.verifiedLegacyVersions['1.6.7'].includes('table'));
  assert.equal(policy.verifiedLegacyVersions['9.9.9'], undefined);
  for (const name of [
    'component-selection-imports',
    'ytable-usage',
    'yedit-table-usage',
    'yss-formily',
    'yss-ui-business-page-generation',
  ]) {
    const skill = readFileSync(`packages/skills/${name}/SKILL.md`, 'utf8');
    assert.match(skill, /get_consumption_contract/);
    assert.match(skill, /根入口|@yss-ui\/components/);
    assert.match(skill, /未知版本/);
  }
  const mixed = transformImports(
    "import { YButton } from '@yss-ui/components'; import {YTable} from '@yss-ui/components/table';",
    'mixed.ts',
    contract
  ).code;
  assert.match(mixed, /entries\/YButton/);
  assert.match(mixed, /@yss-ui\/components\/table/);
});

test('Agent 最终代码与配置样本保持版本边界，实际变换后仍为单包消费', () => {
  const cases = JSON.parse(readFileSync('scripts/fixtures/agent-consumption.json', 'utf8'));
  for (const scenario of cases) {
    const result = scenario.plugin
      ? (transformImports(scenario.code, 'generated.ts', contract)?.code ?? scenario.code)
      : scenario.code;
    for (const expected of scenario.expected) assert.ok(result.includes(expected), `${scenario.name}: ${expected}`);
    assert.doesNotMatch(result + scenario.config, /@yss-ui\/(?:table|formily)|app\.use\(YSSUI\)/);
    assert.equal(scenario.config.includes('@yss-ui/components/vite'), scenario.plugin);
    if (scenario.version === '9.9.9') assert.match(scenario.config, /exports/);
  }
});
