import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { inlineWorkers } from './build/inline-workers';

export default defineConfig({
  plugins: [inlineWorkers(__dirname), vue()],
  worker: { format: 'iife', rollupOptions: { output: { inlineDynamicImports: true } } },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'YssUI',
      fileName: () => 'yss-ui.umd.js',
      formats: ['umd'],
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
        },
        assetFileNames: assetInfo => {
          if (assetInfo.name === 'style.css') return 'yss-ui.css';
          return assetInfo.name ?? 'assets/[name]-[hash][extname]';
        },
      },
    },
    outDir: resolve(__dirname, 'dist-umd'),
    target: 'es2015',
    sourcemap: false,
    minify: false,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@yss-ui/hooks': resolve(__dirname, '../hooks/src'),
      '@yss-ui/theme': resolve(__dirname, '../theme/src'),
      '@yss-ui/utils': resolve(__dirname, '../utils/src'),
    },
  },
});
