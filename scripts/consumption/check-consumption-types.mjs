import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

/** 在指定隔离消费者中严格检查公开声明，不关闭依赖声明检查，不隐含安装。 */
const consumer = process.argv.slice(2).find(value => !value.startsWith('--'));
if (!consumer) throw new Error('请指定隔离消费者目录，并预先安装 TypeScript 5.9.2。');
const root = resolve(consumer);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (!/^yss-(?:real-consumer|consumer-)/.test(pkg.name ?? '')) throw new Error('仅允许在 YSS 隔离验收项目执行。');
const requireFromConsumer = createRequire(resolve(root, 'package.json'));
const compiler = requireFromConsumer.resolve('typescript/bin/tsc');
const fixture = resolve(root, '.yss-consumption-types.ts');
writeFileSync(
  fixture,
  "import type { YTableProps, YEditTableProps, YFormilyProps } from '@yss-ui/components';\n" +
    "import { YTable } from '@yss-ui/components/table';\n" +
    "import { YFormily } from '@yss-ui/components/formily';\n" +
    'export type Consumer = [YTableProps, YEditTableProps, YFormilyProps, typeof YTable, typeof YFormily];\n',
  { flag: 'wx' }
);
try {
  execFileSync(
    process.execPath,
    [
      compiler,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      'false',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--target',
      'ES2022',
      '--lib',
      'ES2022,DOM',
      fixture,
    ],
    { cwd: root, stdio: 'inherit' }
  );
} catch (error) {
  process.exitCode = typeof error.status === 'number' ? error.status : 1;
} finally {
  unlinkSync(fixture);
}
