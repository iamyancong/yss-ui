import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, isAbsolute } from 'node:path';
import legacy from './vite.config';
import { consumptionEntries, readEntries } from './build/entries';

/** 新入口复用旧公开语言模块，避免重复创建注入 Symbol 与全局 Ref。 */
const sharedLocale: Plugin = {
  name: 'yss-shared-public-locale',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || (!source.startsWith('.') && !isAbsolute(source))) return;
    const target = resolve(importer.split('?')[0], '..', source).replace(/\.ts$/, '');
    const locale = resolve(__dirname, 'src/locale');
    if ([locale, `${locale}/index`, `${locale}/useLocale`, `${locale}/vxeBridge`].includes(target)) {
      return { id: '@yss-ui/components/locale', external: true };
    }
  },
};

/** 公开根入口构建；旧 dist/index、lite、sheet 产物保留，兼容历史工具读取。 */
export default defineConfig({
  plugins: [consumptionEntries(__dirname), sharedLocale, vue()],
  build: {
    ...legacy.build,
    outDir: 'dist/root',
    emptyOutDir: true,
    cssCodeSplit: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        lite: resolve(__dirname, 'src/lite.ts'),
        YTable: 'yss-table-styles',
        ...Object.fromEntries(
          ['table', 'formily', 'monaco', 'echarts'].map(name => [name, resolve(__dirname, `src/${name}/index.ts`)])
        ),
        sheet: resolve(__dirname, 'src/sheet/docs-exports.ts'),
        ...Object.fromEntries(
          Object.keys(readEntries(__dirname)).map(name => [`entries/${name}`, `yss-entry:${name}`])
        ),
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      ...legacy.build?.rollupOptions,
      output: {
        exports: 'named',
        hoistTransitiveImports: false,
        onlyExplicitManualChunks: true,
        /** 按组件职责分块，消费项目继续按页面合并，无需逐组件发请求。 */
        manualChunks(id) {
          const root = `${resolve(__dirname, 'src')}/`;
          if (id === `${root}install.ts`) return 'install';
          if (id === `${root}table/base.less`) return;
          if (id === `${root}table/index.ts`) return;
          if (!id.startsWith(root)) return;
          const component = id.slice(root.length).split('/')[0];
          if (!component || component.includes('.') || component === 'locale' || component === 'sheet') return;
          return `components/${component}`;
        },
      },
    },
  },
});
