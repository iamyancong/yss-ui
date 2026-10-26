import { resolve } from 'path';
import { configDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/** Vitest 配置。 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      // @formily/antdv 内部直接导入了无后缀的 `ant-design-vue/es/*`（如 `ant-design-vue/es/_util/type`），
      // 在 Node 原生 ESM 加载下会报 ERR_MODULE_NOT_FOUND，且需与测试中 `import { ConfigProvider } from 'ant-design-vue'`
      // 共享同一份 CJS globalConfig 单例，因此统一将 `ant-design-vue/es/*` 映射至 `lib/*` 并将 `@formily/antdv` 指到 esm 入口交由 Vite 转换。
      {
        find: /^ant-design-vue\/es\/(.*)$/,
        replacement: resolve(__dirname, 'node_modules/ant-design-vue/lib/$1'),
      },
      {
        find: '@formily/antdv',
        replacement: resolve(__dirname, 'node_modules/@formily/antdv/esm/index.js'),
      },
      {
        find: '@yss-ui/components/lite',
        replacement: resolve(__dirname, 'packages/components/src/lite.ts'),
      },
      {
        find: '@yss-ui/components/sheet',
        replacement: resolve(__dirname, 'packages/components/src/sheet/index.ts'),
      },
      {
        find: '@yss-ui/components/monaco',
        replacement: resolve(__dirname, 'packages/components/src/monaco/index.ts'),
      },
      {
        find: '@yss-ui/components/echarts',
        replacement: resolve(__dirname, 'packages/components/src/echarts/index.ts'),
      },
      {
        find: '@yss-ui/components/table',
        replacement: resolve(__dirname, 'packages/components/src/table/index.ts'),
      },
      {
        find: '@yss-ui/components/formily',
        replacement: resolve(__dirname, 'packages/components/src/formily/index.ts'),
      },
      {
        find: '@yss-ui/components',
        replacement: resolve(__dirname, 'packages/components/src'),
      },
      {
        find: '@yss-ui/utils',
        replacement: resolve(__dirname, 'packages/utils/src'),
      },
      {
        find: '@yss-ui/hooks',
        replacement: resolve(__dirname, 'packages/hooks/src'),
      },
      {
        find: '@yss-ui/theme',
        replacement: resolve(__dirname, 'packages/theme/src'),
      },
    ],
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.component.test.ts', 'happy-dom']],
    server: {
      deps: {
        inline: [/@formily\/antdv/],
      },
    },
    coverage: {
      provider: 'v8',
      all: true,
      include: ['packages/{components,hooks,utils,theme}/src/**/*.{ts,vue}'],
      exclude: ['**/*.{test,spec}.ts', '**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 45,
        branches: 62,
        functions: 48,
        lines: 45,
      },
    },
    /** 这些脚本使用 Node.js 原生 test runner，由各自的 package script 执行。 */
    exclude: [
      ...configDefaults.exclude,
      '**/*.node.test.*',
      'scripts/**',
      'packages/skills-cli/lib/sync.test.js',
      'packages/mcp/lib/tools.test.js',
    ],
  },
});
