import { build, defineConfig } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import legacy from './vite.config';
import rootEntry from './vite.config.root';

/** 单一监听流程先更新传统产物，再更新公开根入口，避免两个监听器互相清空 dist。 */
export default defineConfig({
  ...legacy,
  plugins: [
    ...(legacy.plugins ?? []),
    {
      name: 'yss-watch-public-root',
      /** 传统构建完成最后一种格式后再生成根入口，共享样式、类型和 locale 已就绪。 */
      async writeBundle(options) {
        if (options.format !== 'cjs') return;
        await build({ ...rootEntry, configFile: false, root: __dirname });
        /** 稳定入口、声明和插件契约必须对应同一轮源码构建。 */
        await promisify(execFile)(process.execPath, [resolve(__dirname, '../../scripts/build-consumption.mjs')]);
      },
    },
  ],
  build: { ...legacy.build, watch: {} },
});
