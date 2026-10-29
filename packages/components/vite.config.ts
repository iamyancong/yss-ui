import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { inlineWorkers } from './build/inline-workers';

export default defineConfig({
  plugins: [
    inlineWorkers(__dirname),
    vue(),
    dts({
      entryRoot: resolve(__dirname, 'src'),
      outDir: resolve(__dirname, 'dist'),
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
      insertTypesEntry: false,
      copyDtsFiles: false,
      // 排除 docs 目录，避免处理文档示例代码
      exclude: ['**/docs/**', '../../docs/**'],
    }),
  ],
  // Excel 解析 Worker（内联）：自带依赖，不受主包 external 影响
  worker: { format: 'iife', rollupOptions: { output: { inlineDynamicImports: true } } },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        lite: resolve(__dirname, 'src/lite.ts'),
        sheet: resolve(__dirname, 'src/sheet/docs-exports.ts'),
        monaco: resolve(__dirname, 'src/monaco/index.ts'),
        echarts: resolve(__dirname, 'src/echarts/index.ts'),
        'file-preview': resolve(__dirname, 'src/file-preview/index.ts'),
        // 实验性 pptx 子路径：独立入口，@aiden0z/pptx-renderer 只在这里被引用
        'file-preview/pptx': resolve(__dirname, 'src/file-preview/pptx/index.ts'),
        table: resolve(__dirname, 'src/table/index.ts'),
        formily: resolve(__dirname, 'src/formily/index.ts'),
        'locale/index': resolve(__dirname, 'src/locale/index.ts'),
        'locale/zh-CN': resolve(__dirname, 'src/locale/zh-CN.ts'),
        'locale/en-US': resolve(__dirname, 'src/locale/en-US.ts'),
        'locale/zh-TW': resolve(__dirname, 'src/locale/zh-TW.ts'),
      },
      name: 'yss-ui',
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'vue',
        'dayjs',
        /^dayjs\//,
        'ant-design-vue',
        '@ant-design/icons-vue',
        'vxe-table',
        'vxe-pc-ui',
        'xe-utils',
        'docx-preview',
        /^docx-preview\//,
        '@aiden0z/pptx-renderer',
        /^@aiden0z\/pptx-renderer\//,
        '@vue-office/excel',
        /^@vue-office\//,
        'numfmt',
        'pdfjs-dist',
        /^pdfjs-dist\//,
        'echarts',
        /^echarts\//,
        '@formily/antdv',
        '@formily/core',
        '@formily/json-schema',
        '@formily/validator',
        '@formily/vue',
        /^@formily\//,
        '@univerjs/presets',
        '@univerjs/preset-sheets-core',
        /^@univerjs\//,
        'diff',
        'sql-formatter',
        'rxjs',
        'react',
        'react-dom',
        'prettier',
        'prettier-plugin-nginx',
        /^prettier\//,
        '@yss-ui/hooks',
        '@yss-ui/theme',
        '@yss-ui/utils',
        'monaco-editor',
        'monaco-editor-nls',
        /^monaco-editor\//,
        /^monaco-editor-nls\//,
      ],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
        },
      },
      // 抑制 treeshaking 警告（如 resolveDirective 未使用等）
      onwarn(warning, warn) {
        // 忽略 "imported but never used" 类型的警告
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
        // 忽略循环依赖警告
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        // 其他警告正常输出
        warn(warning);
      },
    },
    target: 'es2018',
    sourcemap: false,
    minify: false,
    emptyOutDir: true,
  },
});
