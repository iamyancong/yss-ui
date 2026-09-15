import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';
import { transformImports, type EntryContract } from './transform';

/** 在同包契约支持下启用根入口按需加载；不改变全量安装或动态整包导入。 */
export const yssUi = (): Plugin => {
  const contract = JSON.parse(readFileSync(new URL('../consumption.json', import.meta.url), 'utf8')) as EntryContract;
  let projectRoot = process.cwd();
  return {
    name: 'yss-ui-consumption',
    enforce: 'pre',
    config(config) {
      const include = new Set<string>();
      /** 预扫描业务源码，只预构建项目实际引用的稳定入口；新增导入交由 Vite 增量发现。 */
      const scan = (directory: string) => {
        if (!existsSync(directory)) return;
        for (const item of readdirSync(directory, { withFileTypes: true })) {
          if (['node_modules', 'dist', '.git'].includes(item.name)) continue;
          const file = resolve(directory, item.name);
          if (item.isDirectory()) {
            scan(file);
            continue;
          }
          if (!/\.(vue|[cm]?[jt]sx?)$/.test(file) || /\.(test|spec|d)\.[jt]s$/.test(file)) continue;
          const result = transformImports(readFileSync(file, 'utf8'), file, contract);
          for (const match of (result?.code ?? '').matchAll(/@yss-ui\/components\/entries\/([\w]+)/g))
            include.add(match[0]);
        }
      };
      scan(resolve(config.root ?? process.cwd(), 'src'));
      return {
        build: { rollupOptions: { preserveEntrySignatures: 'exports-only' } },
        optimizeDeps: {
          include: [...include],
          esbuildOptions: {
            plugins: [
              {
                name: 'yss-ui-scan-root',
                setup(build) {
                  /** Vite 扫描器不预构建根 barrel，实际使用入口已经显式纳入 include。 */
                  build.onResolve(
                    { filter: /^(?:@yss-ui\/components(?:\/lite)?|virtual:yss-(?:light|heavy)-components)$/ },
                    args => ({ path: args.path, external: true })
                  );
                },
              },
            ],
          },
        },
      };
    },
    configResolved(config) {
      /** 旧入口改写与官方插件互斥，避免解析顺序导致静默加载错误。 */
      const incompatible = config.plugins
        .filter(plugin => ['yss-components-isolation', 'yss-public-root-entry'].includes(plugin.name))
        .map(plugin => plugin.name);
      const legacyOptimizer = config.optimizeDeps.esbuildOptions?.plugins?.some(
        plugin => plugin.name === 'yss-isolated-prebundle'
      );
      if (incompatible.length || legacyOptimizer) {
        throw new Error(
          `[yss-ui] 官方插件不能与旧入口插件同时启用，请移除：${[...incompatible, ...(legacyOptimizer ? ['yss-isolated-prebundle'] : [])].join(', ')}`
        );
      }
      projectRoot = config.root;
      config.optimizeDeps.include = config.optimizeDeps.include?.filter(
        id => !['@yss-ui/components', '@yss-ui/components/lite'].includes(id)
      );
    },
    resolveId(id) {
      if (id === 'virtual:yss-light-components' || id === 'virtual:yss-heavy-components') {
        return this.resolve('@yss-ui/components', undefined, { skipSelf: true });
      }
      if (id === '@yss-ui/components/style.css' || id === '@yss-ui/components/dist/style.css') {
        return this.resolve('ant-design-vue/dist/reset.css', undefined, { skipSelf: true });
      }
    },
    generateBundle(_options, bundle) {
      /** 保存源码到真实 chunk 的归属，页面被 Rollup 合并时仍可精确验收闭包。 */
      const modules: Record<string, string[]> = {};
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds) {
          const source = relative(projectRoot, id.split('?')[0]).split('\\').join('/');
          if (!source.startsWith('src/')) continue;
          modules[source] ??= [];
          if (!modules[source].includes(chunk.fileName)) modules[source].push(chunk.fileName);
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'yss-consumption-modules.json',
        source: JSON.stringify(modules, null, 2),
      });
    },
    transform(code, id) {
      if (id.includes('/node_modules/') || !/\.(vue|[cm]?[jt]sx?)(?:\?|$)/.test(id) || /[?&]type=style/.test(id))
        return;
      return transformImports(code, id, contract);
    },
  };
};
