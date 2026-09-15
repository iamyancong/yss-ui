#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { x as extractTarball } from 'tar';
import ts from 'typescript';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_PARENT = path.join(ROOT_DIR, 'tmp');
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

/**
 * 动态解析 Vite CLI 路径，兼顾 monorepo 本地和 CI 独立 pnpm 安装环境。
 *
 * @returns {string} Vite CLI 绝对路径。
 */
const resolveViteCli = () => {
  const directPath = path.join(ROOT_DIR, 'packages', 'components', 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(directPath)) return directPath;
  try {
    const req = createRequire(path.join(ROOT_DIR, 'packages', 'components', 'package.json'));
    const vitePkg = req.resolve('vite/package.json');
    const pkg = JSON.parse(fs.readFileSync(vitePkg, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite || 'bin/vite.js';
    return path.resolve(path.dirname(vitePkg), bin);
  } catch {
    const rootReq = createRequire(path.join(ROOT_DIR, 'package.json'));
    const vitePkg = rootReq.resolve('vite/package.json');
    const pkg = JSON.parse(fs.readFileSync(vitePkg, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vite || 'bin/vite.js';
    return path.resolve(path.dirname(vitePkg), bin);
  }
};

const VITE_CLI = resolveViteCli();
const PACKAGE_DIRECTORIES = ['utils', 'theme', 'hooks', 'components'];

/**
 * 执行命令，失败时保留完整子进程上下文。
 *
 * @param {string} command 命令。
 * @param {string[]} args 参数。
 * @param {import('node:child_process').ExecFileSyncOptions} [options] 执行选项。
 * @returns {string} 标准输出。
 */
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

/**
 * 递归收集 package exports 中所有本地目标。
 *
 * @param {unknown} value exports 节点。
 * @returns {string[]} 本地文件路径。
 */
const collectExportTargets = value => {
  if (typeof value === 'string') return value.startsWith('./') ? [value] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectExportTargets);
};

/** 比较新旧产物公开名称，防止根入口切换时遗漏运行时 API。 */
const readRuntimeExportNames = file => {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  return source.statements
    .flatMap(statement => {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.map(element => element.name.text);
      }
      return ts.isExportAssignment(statement) ? ['default'] : [];
    })
    .sort();
};

/**
 * 检查 tarball 中的入口、类型和 workspace 依赖改写结果。
 *
 * @param {string} packageDirectory 解压后的包目录。
 */
const validatePackedManifest = packageDirectory => {
  const manifestPath = path.join(packageDirectory, 'package.json');
  assert.ok(fs.existsSync(manifestPath), `${packageDirectory} 缺少 package.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targets = new Set([manifest.main, manifest.module, manifest.types, ...collectExportTargets(manifest.exports)]);

  for (const target of targets) {
    if (!target || target.includes('*')) continue;
    const resolved = path.resolve(packageDirectory, target);
    assert.ok(
      resolved.startsWith(`${path.resolve(packageDirectory)}${path.sep}`),
      `${manifest.name} 入口越界: ${target}`
    );
    assert.ok(fs.existsSync(resolved), `${manifest.name} 声明的入口不存在: ${target}`);
  }

  if (manifest.name === '@yss-ui/components') {
    /** 新公开路径切换后仍保留旧插件读取的每个历史 JS 产物。 */
    for (const name of ['index', 'lite', 'sheet', 'monaco', 'echarts', 'table', 'formily']) {
      for (const extension of ['mjs', 'cjs']) {
        assert.ok(
          fs.existsSync(path.join(packageDirectory, `dist/${name}.${extension}`)),
          `缺少历史产物 ${name}.${extension}`
        );
      }
    }
    assert.equal(manifest.yssUi?.treeShakableRoot, true);
    assert.notEqual(manifest.module, 'dist/index.mjs', '公开根入口仍指向传统公共构建');
    assert.deepEqual(
      readRuntimeExportNames(path.join(packageDirectory, manifest.module)),
      readRuntimeExportNames(path.join(packageDirectory, 'dist/index.mjs')),
      '根入口公开名称发生变化'
    );
  }

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      assert.ok(!String(version).startsWith('workspace:'), `${manifest.name} 的 ${name} 仍使用 workspace 协议`);
    }
  }
};

/**
 * 将 workspace 包打成真实 tarball 并解压到消费项目的 node_modules。
 *
 * @param {string} packageName 包目录名。
 * @param {string} tempRoot 临时根目录。
 * @param {string} consumerDirectory 消费项目目录。
 * @returns {Promise<void>}
 */
const packAndExtract = async (packageName, tempRoot, consumerDirectory) => {
  const packageRoot = path.join(ROOT_DIR, 'packages', packageName);
  const packDirectory = path.join(tempRoot, 'packs', packageName);
  const extractDirectory = path.join(tempRoot, 'extract', packageName);
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(extractDirectory, { recursive: true });

  run(PNPM_COMMAND, ['pack', '--pack-destination', packDirectory], { cwd: packageRoot });
  const tarballs = fs.readdirSync(packDirectory).filter(file => file.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, `${packageName} 应生成且仅生成一个 tarball`);

  await extractTarball({ file: path.join(packDirectory, tarballs[0]), cwd: extractDirectory });
  const extractedPackage = path.join(extractDirectory, 'package');
  validatePackedManifest(extractedPackage);

  const destination = path.join(consumerDirectory, 'node_modules', '@yss-ui', packageName);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(extractedPackage, destination);
};

/**
 * 为手工解包的消费者补齐第三方依赖。
 *
 * 真实包管理器会安装 dependencies、optionalDependencies 与 peerDependencies；
 * 此处只链接工作区已安装的第三方包，YSS 包本身仍完全来自 tarball。
 *
 * @param {string} consumerDirectory 消费项目目录。
 */
const linkConsumerDependencies = consumerDirectory => {
  for (const packageName of PACKAGE_DIRECTORIES) {
    const workspacePackageRoot = path.join(ROOT_DIR, 'packages', packageName);
    const manifest = JSON.parse(fs.readFileSync(path.join(workspacePackageRoot, 'package.json'), 'utf8'));
    const dependencies = new Set(
      ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap(section =>
        Object.keys(manifest[section] ?? {})
      )
    );

    for (const dependencyName of dependencies) {
      if (dependencyName.startsWith('@yss-ui/')) continue;
      const destination = path.join(consumerDirectory, 'node_modules', dependencyName);
      if (fs.existsSync(destination)) continue;

      const candidates = [
        path.join(workspacePackageRoot, 'node_modules', dependencyName),
        path.join(ROOT_DIR, 'node_modules', dependencyName),
      ];
      const source = candidates.find(candidate => fs.existsSync(candidate));
      assert.ok(source, `${manifest.name} 的已声明依赖未安装: ${dependencyName}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(fs.realpathSync(source), destination, 'junction');
    }
  }
};

/**
 * 写入临时消费者的运行时与类型验证文件。
 *
 * @param {string} consumerDirectory 消费项目目录。
 */
const writeConsumerFixtures = consumerDirectory => {
  const runtimeSource = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [hooks, utils, theme] = await Promise.all([
  import('@yss-ui/hooks'),
  import('@yss-ui/utils'),
  import('@yss-ui/theme'),
]);

assert.match(import.meta.resolve('@yss-ui/components'), /index\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/lite'), /lite\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/sheet'), /sheet\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/monaco'), /monaco\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/echarts'), /echarts\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/table'), /table\.mjs$/);
assert.match(import.meta.resolve('@yss-ui/components/formily'), /formily\.mjs$/);
const locale = await import('@yss-ui/components/locale');
for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
  const pack = (await import('@yss-ui/components/locale/' + language)).default;
  assert.equal(pack.name, language);
  locale.setGlobalLocale(pack);
  assert.equal(locale.getGlobalLocale().name, language);
  assert.equal(require('@yss-ui/components/locale/' + language).default.name, language);
}
assert.equal(typeof require('@yss-ui/components/locale').useLocale, 'function');
assert.equal(typeof hooks.useLoading, 'function');
assert.ok(Object.keys(utils).length > 0);
assert.ok(Object.keys(theme).length > 0);

assert.match(require.resolve('@yss-ui/components'), /index\.cjs$/);
assert.match(require.resolve('@yss-ui/components/lite'), /lite\.cjs$/);
assert.match(require.resolve('@yss-ui/components/sheet'), /sheet\.cjs$/);
assert.match(require.resolve('@yss-ui/components/monaco'), /monaco\.cjs$/);
assert.match(require.resolve('@yss-ui/components/echarts'), /echarts\.cjs$/);
assert.match(require.resolve('@yss-ui/components/table'), /table\.cjs$/);
assert.match(require.resolve('@yss-ui/components/formily'), /formily\.cjs$/);
assert.equal(typeof require('@yss-ui/hooks').useLoading, 'function');
assert.ok(Object.keys(require('@yss-ui/utils')).length > 0);
assert.ok(Object.keys(require('@yss-ui/theme')).length > 0);
`;

  const typeSource = `
import componentsPlugin, {
  YButton,
  YFileImport,
  type YFileImportProps,
} from '@yss-ui/components';
import {
  YTable,
  AuthorityDropdown,
  YFileImport as LiteFileImport,
  type AuthorityDropdownProps,
  type AuthorityDropdownItem,
  type YFileImportProps as LiteFileImportProps,
  type FileImportTexts,
  type ImportResult,
} from '@yss-ui/components/lite';
import { YSheet, type YSheetProps } from '@yss-ui/components/sheet';
import { YMonaco, YMonacoDiff, type YMonacoProps } from '@yss-ui/components/monaco';
import { YEcharts, type YEchartsProps } from '@yss-ui/components/echarts';
import { YTable as SubpathTable, YEditTable as SubpathEditTable, type YTableProps, type YEditTableProps } from '@yss-ui/components/table';
import { YFormily as SubpathFormily, type YFormilyProps } from '@yss-ui/components/formily';
import { YConfigProvider, setGlobalLocale, useLocale, type YssLocale } from '@yss-ui/components/locale';
import zhTW from '@yss-ui/components/locale/zh-TW';
const locale: YssLocale = zhTW;
setGlobalLocale(locale);
void [YConfigProvider, useLocale];
import { useLoading } from '@yss-ui/hooks';
import * as utils from '@yss-ui/utils';
import * as theme from '@yss-ui/theme';

const fileImportProps: YFileImportProps = { modelValue: false, multiple: true };
const sheetProps: YSheetProps = { modelValue: null, locale: 'zh-CN' };
const monacoProps: YMonacoProps = { modelValue: 'select 1;' };
const echartsProps: YEchartsProps = { options: {} };
const liteImportTexts: FileImportTexts = { cancel: '取消' };
const liteImportResult: ImportResult = { total: 10, success: 10 };
const liteFileImportProps: LiteFileImportProps = { modelValue: false, texts: liteImportTexts, importResult: liteImportResult };
const authItem: AuthorityDropdownItem = { permissionCode: 'user:delete' };
const authorityProps: AuthorityDropdownProps = { fallback: 'disable', dropdownItems: [authItem] };
const subpathTableProps: Partial<YTableProps> = { data: [] };
const subpathEditTableProps: Partial<YEditTableProps> = { data: [] };
const subpathFormilyProps: YFormilyProps = { schema: {} };

void [componentsPlugin, YButton, YFileImport, YTable, AuthorityDropdown, LiteFileImport, YSheet, YMonaco, YMonacoDiff, YEcharts, SubpathTable, SubpathEditTable, SubpathFormily, useLoading, utils, theme, fileImportProps, sheetProps, monacoProps, echartsProps, liteFileImportProps, authorityProps, subpathTableProps, subpathEditTableProps, subpathFormilyProps];
`;

  const browserSource = `
import componentsPlugin, { YButton, YFileImport } from '@yss-ui/components';
import { YTable } from '@yss-ui/components/lite';
import { YSheet } from '@yss-ui/components/sheet';
import { YMonaco, YMonacoDiff } from '@yss-ui/components/monaco';
import { YEcharts } from '@yss-ui/components/echarts';
import { YTable as SubpathTable } from '@yss-ui/components/table';
import { YFormily as SubpathFormily } from '@yss-ui/components/formily';
import { useLoading } from '@yss-ui/hooks';
import * as utils from '@yss-ui/utils';
import * as theme from '@yss-ui/theme';

const registrations = new Map();
componentsPlugin.install({ component: (name, component) => registrations.set(name, component), use() {} });
if (!registrations.has('YssFormily') || !registrations.has('YDropdown') || !registrations.has('YSheet') || !registrations.has('YMonaco') || !registrations.has('YEcharts')) throw new Error('历史全局别名丢失');
globalThis.yssLegacyConsumer = [componentsPlugin, YButton, YFileImport, YTable, YSheet, YMonaco, YMonacoDiff, YEcharts, useLoading, utils, theme];
`;

  const rootSource = `
import { createApp, h } from 'vue';
import { ConfigProvider } from 'ant-design-vue';
import '@yss-ui/components/dist/style.css';
import { YCard, YTable, YFormily, YssFormily, useLocale } from '@yss-ui/components';
import { YTable as LiteTable } from '@yss-ui/components/lite';
import { useLocale as publicUseLocale } from '@yss-ui/components/locale';
if (useLocale !== publicUseLocale) throw new Error('语言入口单例被复制');
if (YFormily !== YssFormily) throw new Error('历史表单别名不一致');
if (YTable !== LiteTable) throw new Error('根入口与 lite 组件实例不一致');
(globalThis as any).yssRootConsumer = { YCard, YTable, YFormily };
createApp({ render: () => h(ConfigProvider, null, { default: () => h(YCard, null, { default: () => [
  h('h2', '根入口消费验证'),
  h(YFormily, { schema: { type: 'object', properties: { name: { type: 'string', title: '姓名', 'x-decorator': 'FormItem', 'x-component': 'Input' } } } }),
  h(YTable, { columns: [{ field: 'name', title: '姓名' }], data: [{ name: '张三' }], pageable: false }),
] }) }) }).mount('#app');
`;
  const rootConfig = `
import assert from 'node:assert/strict';
export default {
  build: { target: 'chrome90', manifest: true, rollupOptions: { input: 'root.html' } },
  plugins: [{ name: 'verify-root-static-closure', generateBundle(_, bundle) {
    const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry);
    assert.ok(entry, 'root entry missing');
    const visited = new Set();
    const visit = file => {
      if (visited.has(file)) return;
      visited.add(file);
      const chunk = bundle[file];
      if (!chunk || chunk.type !== 'chunk') return;
      for (const id of Object.keys(chunk.modules)) {
        assert.ok(!/node_modules\\/(?:@univerjs|monaco-editor|echarts)\\//.test(id), 'Heavy engine in table page: ' + id);
      }
      chunk.imports.forEach(visit);
    };
    visit(entry.fileName);
  } }],
};
`;
  fs.writeFileSync(path.join(consumerDirectory, 'root.ts'), rootSource);
  fs.writeFileSync(
    path.join(consumerDirectory, 'root.html'),
    '<div id="app"></div><script type="module" src="./root.ts"></script>'
  );
  fs.writeFileSync(path.join(consumerDirectory, 'root.config.mjs'), rootConfig);
  fs.writeFileSync(
    path.join(consumerDirectory, 'card.ts'),
    `import { YCard } from '@yss-ui/components'; globalThis.yssCardConsumer = YCard;`
  );
  fs.writeFileSync(path.join(consumerDirectory, 'card.html'), '<script type="module" src="./card.ts"></script>');
  fs.writeFileSync(
    path.join(consumerDirectory, 'card.config.mjs'),
    rootConfig
      .replace('root.html', 'card.html')
      .replace('@univerjs|monaco-editor|echarts', '@formily|vxe-table|vxe-pc-ui|@univerjs|monaco-editor|echarts')
  );

  const installSource = `
import { createApp } from 'vue';
import UI, { AuthorityDropdown, YButton, YTable, YFormily, YSheet, YMonaco, YMonacoDiff, YEcharts } from '@yss-ui/components';
const app = createApp({ render: () => null });
app.use(UI);
for (const [name, component] of Object.entries({ YButton, YTable, YFormily, YssFormily: YFormily, YDropdown: AuthorityDropdown, YSheet, YMonaco, YMonacoDiff, YEcharts })) {
  if (app.component(name) !== component) throw new Error('全量安装兼容性失败: ' + name);
}
globalThis.yssInstallVerified = true;
`;
  fs.writeFileSync(path.join(consumerDirectory, 'install.ts'), installSource);
  fs.writeFileSync(path.join(consumerDirectory, 'install.html'), '<script type="module" src="./install.ts"></script>');
  fs.writeFileSync(
    path.join(consumerDirectory, 'install.config.mjs'),
    `export default { build: { target: 'chrome90', rollupOptions: { input: 'install.html' } } };`
  );

  const localeSource = `
import { setGlobalLocale, getGlobalLocale, useLocale, YConfigProvider } from '@yss-ui/components/locale';
import zhTW from '@yss-ui/components/locale/zh-TW';
setGlobalLocale(zhTW);
globalThis.yssLocaleConsumer = { getGlobalLocale, useLocale, YConfigProvider };
`;
  const localeConfig = `
import assert from 'node:assert/strict';
export default {
  build: { rollupOptions: { input: 'locale.html' } },
  plugins: [{ name: 'verify-locale-static-closure', generateBundle(_, bundle) {
    const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry);
    assert.ok(entry, 'locale entry missing');
    const visited = new Set();
    const visit = file => {
      if (visited.has(file)) return;
      visited.add(file);
      const chunk = bundle[file];
      if (!chunk || chunk.type !== 'chunk') return;
      for (const id of Object.keys(chunk.modules)) {
        assert.ok(!/node_modules\\/(?:@formily|vxe-pc-ui|vxe-table|@univerjs|monaco-editor|echarts)\\//.test(id), 'Heavy engine in locale static closure: ' + id);
      }
      chunk.imports.forEach(visit);
    };
    visit(entry.fileName);
    console.log('Locale static closure verified: ' + visited.size + ' chunks');
  } }],
};
`;
  fs.writeFileSync(path.join(consumerDirectory, 'locale.ts'), localeSource);
  fs.writeFileSync(path.join(consumerDirectory, 'locale.html'), '<script type="module" src="./locale.ts"></script>');
  fs.writeFileSync(path.join(consumerDirectory, 'locale.config.mjs'), localeConfig);
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['./consumer.ts', './root.ts'],
  };

  fs.writeFileSync(path.join(consumerDirectory, 'runtime.mjs'), runtimeSource.trimStart());
  fs.writeFileSync(path.join(consumerDirectory, 'consumer.ts'), typeSource.trimStart());
  fs.writeFileSync(path.join(consumerDirectory, 'browser.ts'), browserSource.trimStart());
  fs.writeFileSync(
    path.join(consumerDirectory, 'index.html'),
    '<!doctype html><html><body><script type="module" src="/browser.ts"></script></body></html>\n'
  );
  fs.writeFileSync(path.join(consumerDirectory, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
};

/**
 * 确保只删除由本脚本在 tmp 下创建的临时目录。
 *
 * @param {string} tempRoot 待清理路径。
 */
const cleanupTempDirectory = tempRoot => {
  const resolvedParent = path.resolve(TEMP_PARENT);
  const resolvedTarget = path.resolve(tempRoot);
  assert.ok(
    resolvedTarget.startsWith(`${resolvedParent}${path.sep}package-consumer-`),
    `拒绝清理非预期路径: ${tempRoot}`
  );
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
};

/** 执行真实发布包消费验证。 */
const main = async () => {
  fs.mkdirSync(TEMP_PARENT, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(TEMP_PARENT, 'package-consumer-'));
  const consumerDirectory = path.join(tempRoot, 'consumer');
  fs.mkdirSync(consumerDirectory, { recursive: true });

  try {
    for (const packageName of PACKAGE_DIRECTORIES) {
      await packAndExtract(packageName, tempRoot, consumerDirectory);
    }
    linkConsumerDependencies(consumerDirectory);
    writeConsumerFixtures(consumerDirectory);
    run(process.execPath, [path.join(consumerDirectory, 'runtime.mjs')], { cwd: consumerDirectory, stdio: 'inherit' });
    assert.ok(fs.existsSync(VITE_CLI), `缺少消费者构建所需的 Vite CLI: ${VITE_CLI}`);
    run(
      process.execPath,
      [
        VITE_CLI,
        'build',
        consumerDirectory,
        '--outDir',
        path.join(tempRoot, 'browser-dist'),
        '--emptyOutDir',
        '--logLevel',
        'error',
      ],
      { stdio: 'inherit' }
    );
    run(
      process.execPath,
      [
        VITE_CLI,
        'build',
        '--config',
        'locale.config.mjs',
        '--outDir',
        path.join(tempRoot, 'locale-dist'),
        '--logLevel',
        'error',
      ],
      { cwd: consumerDirectory, stdio: 'inherit' }
    );
    run(
      process.execPath,
      [
        VITE_CLI,
        'build',
        '--config',
        'root.config.mjs',
        '--outDir',
        path.join(tempRoot, 'root-dist'),
        '--logLevel',
        'error',
      ],
      { cwd: consumerDirectory, stdio: 'inherit' }
    );
    run(
      process.execPath,
      [
        VITE_CLI,
        'build',
        '--config',
        'card.config.mjs',
        '--outDir',
        path.join(tempRoot, 'card-dist'),
        '--logLevel',
        'error',
      ],
      { cwd: consumerDirectory, stdio: 'inherit' }
    );
    run(
      process.execPath,
      [
        VITE_CLI,
        'build',
        '--config',
        'install.config.mjs',
        '--outDir',
        path.join(tempRoot, 'install-dist'),
        '--logLevel',
        'error',
      ],
      { cwd: consumerDirectory, stdio: 'inherit' }
    );
    console.log('Consumer artifacts: ' + tempRoot);
    run(
      PNPM_COMMAND,
      ['exec', 'tsc', '--project', path.join(consumerDirectory, 'tsconfig.json'), '--pretty', 'false'],
      {
        stdio: 'inherit',
      }
    );
    console.log(
      '✅ 发布包消费验证通过：4 个 tarball 的 Node 入口、Vite 浏览器构建、exports 与类型均可用；locale 三语子路径、根入口/卡片静态闭包与全量安装构建通过。'
    );
  } finally {
    if (process.env.YSS_KEEP_CONSUMER !== 'true') cleanupTempDirectory(tempRoot);
  }
};

await main();
