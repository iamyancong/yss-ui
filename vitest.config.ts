import { resolve } from 'path';
import { configDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/** Vitest 配置。 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@yss-ui/components/lite': resolve(__dirname, 'packages/components/src/lite.ts'),
      '@yss-ui/components/sheet': resolve(__dirname, 'packages/components/src/sheet/index.ts'),
      '@yss-ui/components/monaco': resolve(__dirname, 'packages/components/src/monaco/index.ts'),
      '@yss-ui/components/echarts': resolve(__dirname, 'packages/components/src/echarts/index.ts'),
      '@yss-ui/components/table': resolve(__dirname, 'packages/components/src/table/index.ts'),
      '@yss-ui/components/formily': resolve(__dirname, 'packages/components/src/formily/index.ts'),
      '@yss-ui/components': resolve(__dirname, 'packages/components/src'),
      '@yss-ui/utils': resolve(__dirname, 'packages/utils/src'),
      '@yss-ui/hooks': resolve(__dirname, 'packages/hooks/src'),
      '@yss-ui/theme': resolve(__dirname, 'packages/theme/src'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.component.test.ts', 'happy-dom']],
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
      'scripts/check-registry-artifacts.test.mjs',
      'scripts/generate-home-releases.test.js',
      'scripts/lib/release-packages.test.js',
      'packages/skills-cli/lib/sync.test.js',
    ],
  },
});
