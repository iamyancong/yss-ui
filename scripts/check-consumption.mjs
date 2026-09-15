import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import assert from 'node:assert/strict';

/** 在工作区外真实安装 tarball；不通过工作区链接证明安装成本。 */
const root = fileURLToPath(new URL('..', import.meta.url));
const targetDirectory = process.argv.slice(2).find(value => !value.startsWith('--'));
const baseline = process.argv.includes('--baseline');
const directory = targetDirectory ? resolve(targetDirectory) : mkdtempSync(join(tmpdir(), 'yss-consumption-'));
const packs = join(directory, 'tarballs');
mkdirSync(packs, { recursive: true });
/** 执行可复现安装和构建，保留失败目录。 */
const run = (args, cwd) => execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
const deps = {
  vue: '3.5.20',
  'ant-design-vue': '4.2.6',
  dayjs: '1.11.13',
  vite: '6.0.5',
  '@vitejs/plugin-vue': '5.2.4',
};
for (const name of ['utils', 'theme', 'hooks', 'components']) {
  run(['pack', '--pack-destination', packs], join(root, 'packages', name));
  deps[`@yss-ui/${name}`] = join(
    packs,
    readdirSync(packs).find(file => file.startsWith(`yss-ui-${name}-`))
  );
}
if (baseline) deps['@yss-ui/components'] = '1.6.7';
const consumer = join(directory, 'consumer');
mkdirSync(consumer, { recursive: true });
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'yss-real-consumer',
      packageManager: 'pnpm@8.10.0',
      private: true,
      type: 'module',
      dependencies: deps,
      pnpm: {
        overrides: Object.fromEntries(
          Object.entries(deps).filter(([name]) => name.startsWith('@yss-ui/') && name !== '@yss-ui/components')
        ),
      },
    },
    null,
    2
  )
);
writeFileSync(
  join(consumer, '.npmrc'),
  'registry=https://registry.npmjs.org/\n@yss-ui:registry=https://registry.npmjs.org/\n'
);
cpSync(join(root, 'scripts/fixtures/consumption'), consumer, { recursive: true });
writeFileSync(
  join(consumer, 'vite.config.mjs'),
  `import vue from '@vitejs/plugin-vue';\n${baseline ? '' : "import { yssUi } from '@yss-ui/components/vite';"}\nexport default { resolve:{alias:{'virtual:yss-heavy-components':'@yss-ui/components','virtual:yss-light-components':'@yss-ui/components'}}, plugins: [vue(), ${baseline ? '' : 'yssUi(),'} {name:'audit-modules',generateBundle(_options,bundle){this.emitFile({type:'asset',fileName:'module-audit.json',source:JSON.stringify(Object.fromEntries(Object.values(bundle).filter(item=>item.type==='chunk').map(item=>[item.fileName,item.moduleIds])))})}}], build: { manifest: true, target: 'chrome90' } };\n`
);
run(['install'], consumer);
writeFileSync(
  join(directory, 'installation-tree.json'),
  execFileSync('pnpm', ['list', '--depth', '0', '--json'], { cwd: consumer })
);
/** pnpm 8 的无限树展开会在共享 peer 图上溢出；lockfile 保留完整节点与边，避免指数重复。 */
cpSync(join(consumer, 'pnpm-lock.yaml'), join(directory, 'installation-lock.yaml'));
run(['exec', 'vite', 'build'], consumer);
const output = join(consumer, 'dist');
const manifest = JSON.parse(readFileSync(join(output, '.vite/manifest.json'), 'utf8'));
const sourceModules = existsSync(join(output, 'yss-consumption-modules.json'))
  ? JSON.parse(readFileSync(join(output, 'yss-consumption-modules.json'), 'utf8'))
  : {};
/** 静态闭包按文件去重，动态页面分别计算。 */
const closure = key => {
  const files = new Set();
  const seen = new Set();
  const visit = id => {
    if (seen.has(id)) return;
    seen.add(id);
    const chunk = manifest[id];
    assert.ok(chunk, `缺少 ${id}`);
    files.add(chunk.file);
    (chunk.css ?? []).forEach(file => files.add(file));
    (chunk.imports ?? []).forEach(visit);
  };
  if (manifest[key]) visit(key);
  else {
    assert.ok(sourceModules[key]?.length, `缺少源码归属 ${key}`);
    for (const file of sourceModules[key]) {
      const item = Object.entries(manifest).find(([, value]) => value.file === file);
      assert.ok(item, `缺少页面产物 ${file}`);
      visit(item[0]);
    }
  }
  return [...files].map(file => {
    const bytes = readFileSync(join(output, file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length };
  });
};
const report = Object.fromEntries(
  ['index.html', 'src/Table.vue', 'src/Form.vue', 'src/Chart.vue'].map(key => [key, closure(key)])
);
const moduleAudit = JSON.parse(readFileSync(join(output, 'module-audit.json'), 'utf8'));
if (!baseline)
  for (const row of report['index.html'])
    for (const id of moduleAudit[row.file] ?? [])
      assert.ok(
        !/node_modules\/(?:@formily|vxe-table|vxe-pc-ui|monaco-editor|echarts|@univerjs)\//.test(id),
        `Button 首屏含无关模块 ${id}`
      );
const initialText = report['index.html'].map(row => readFileSync(join(output, row.file), 'utf8')).join('\n');
if (!baseline)
  assert.ok(!/vxe-table--|vxe-body--|monaco-editor|univer-sheet/.test(initialText), 'Button 首屏含无关重型引擎或样式');
writeFileSync(join(directory, 'bundle-report.json'), JSON.stringify(report, null, 2));
console.log(`消费验证与安装树：${directory}`);

/** 保留真实安装的物理包清单和重复版本；依赖边由完整 lockfile 提供。 */
const installed = [];
const store = join(consumer, 'node_modules/.pnpm');
for (const directory of readdirSync(store)) {
  const modules = join(store, directory, 'node_modules');
  if (!existsSync(modules)) continue;
  const paths = readdirSync(modules).flatMap(name =>
    name.startsWith('@')
      ? readdirSync(join(modules, name)).map(child => join(modules, name, child))
      : [join(modules, name)]
  );
  for (const path of paths) {
    const file = join(path, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (!installed.some(row => row.name === pkg.name && row.version === pkg.version))
      installed.push({ name: pkg.name, version: pkg.version });
  }
}
const versions = installed.reduce((groups, item) => {
  (groups[item.name] ??= []).push(item);
  return groups;
}, {});
const diskKiB = Number(
  execFileSync('du', ['-sk', join(consumer, 'node_modules')], { encoding: 'utf8' }).split(/\s+/)[0]
);
writeFileSync(
  join(directory, 'installation-report.json'),
  JSON.stringify(
    {
      node: process.version,
      pnpm: execFileSync('pnpm', ['--version'], { cwd: consumer, encoding: 'utf8' }).trim(),
      diskKiB,
      packages: installed,
      duplicates: Object.fromEntries(Object.entries(versions).filter(([, rows]) => rows.length > 1)),
      componentsTarballBytes: baseline ? null : statSync(deps['@yss-ui/components']).size,
      note: '完整依赖边见 installation-lock.yaml；diskKiB 为本机 du 分配块含开发工具，不等于网络下载。',
    },
    null,
    2
  )
);
