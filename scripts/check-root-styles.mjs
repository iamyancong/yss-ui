import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** 在真实 tarball 消费目录验证无插件、官方插件及显式全量 CSS，保留浏览器验收页面。 */
export const checkRootStyles = consumer => {
  writeFileSync(
    join(consumer, 'button-only.js'),
    `import { createApp, h } from 'vue';
import { YButton } from '@yss-ui/components';
createApp({ render: () => h(YButton, { id: 'button-ready' }, () => 'Button ready') }).mount('#app');`
  );
  writeFileSync(
    join(consumer, 'table-only.js'),
    `import { createApp, h, ref } from 'vue';
import { YTable, YEditTable } from '@yss-ui/components';
import { YTable as SubTable, YEditTable as SubEditTable } from '@yss-ui/components/table';
import { YTable as LiteTable } from '@yss-ui/components/lite';
if (YTable !== SubTable || YTable !== LiteTable || YEditTable !== SubEditTable) throw new Error('组件身份不一致');
createApp({ setup() {
  const disabled = ref(true);
  const count = ref(0);
  const buttons = [
    { key: 'view', text: '查看' }, { key: 'config', text: '配置' },
    { key: 'edit', text: '编辑发布目标（长文案）', disabledFn: () => disabled.value, clickFn: () => count.value++ },
    { key: 'delete', text: '删除', isConfirm: true, disabledFn: () => disabled.value, clickFn: () => count.value++ },
  ];
  return () => h('div', [
    h('button', { id: 'toggle-disabled', onClick: () => disabled.value = !disabled.value }, '切换禁用'),
    h('span', { id: 'action-count' }, String(count.value)),
    h(YTable, { data: [{ id: 1, name: 'Alice' }], columns: [{ field: 'name', title: 'Name' }], pageable: false, actionConfig: { displayLimit: 2, width: 220, buttons } }),
    h(YEditTable, { data: [{ id: 2, name: 'Bob' }], columns: [{ field: 'name', title: 'Edit', component: 'form-item-input' }, { type: 'action', title: '操作' }], actionConfig: { displayLimit: 2, width: 220, buttons } }),
  ]);
} }).mount('#app');`
  );
  const report = {};
  for (const mode of ['plain-button', 'plugin-button', 'full-button', 'plain-table', 'plugin-table']) {
    const table = mode.endsWith('table');
    const plugin = mode.startsWith('plugin');
    const full = mode.startsWith('full');
    writeFileSync(
      join(consumer, `${mode}.html`),
      `<meta charset="UTF-8"><div id="app"></div><script type="module" src="/${mode}.js"></script>`
    );
    writeFileSync(
      join(consumer, `${mode}.js`),
      `${full ? "import '@yss-ui/components/style.css';" : ''}\nimport './${table ? 'table' : 'button'}-only.js';`
    );
    writeFileSync(
      join(consumer, 'root-styles.config.mjs'),
      `
${plugin ? "import { yssUi } from '@yss-ui/components/vite';" : ''}
export default { plugins: [${plugin ? 'yssUi(),' : ''}{name: 'audit-root-styles', generateBundle(_, bundle) {
 this.emitFile({type:'asset',fileName:'audit.json',source:JSON.stringify(Object.fromEntries(Object.values(bundle).filter(item=>item.type==='chunk').map(item=>[item.fileName,{ modules:item.moduleIds, imports:item.imports, css:[...(item.viteMetadata?.importedCss ?? [])], isEntry:item.isEntry }])))});
}}], build: { outDir: 'dist-${mode}', manifest: true, rollupOptions: { input: '${mode}.html' } } };`
    );
    execFileSync('pnpm', ['exec', 'vite', 'build', '--config', 'root-styles.config.mjs'], {
      cwd: consumer,
      stdio: 'pipe',
    });
    const output = join(consumer, `dist-${mode}`);
    const audit = JSON.parse(readFileSync(join(output, 'audit.json'), 'utf8'));
    const files = new Set();
    const modules = new Set();
    /** 只收集入口静态闭包；重型动态引擎不计入首屏。 */
    const visit = file => {
      if (files.has(file)) return;
      files.add(file);
      const chunk = audit[file];
      if (!chunk) return;
      chunk.modules.forEach(id => modules.add(id));
      chunk.css.forEach(css => files.add(css));
      chunk.imports.forEach(visit);
    };
    Object.entries(audit)
      .filter(([, value]) => value.isEntry)
      .forEach(([file]) => visit(file));
    const css = [...files]
      .filter(file => file.endsWith('.css'))
      .map(file => readFileSync(join(output, file), 'utf8'))
      .join('\n');
    if (!table && !full) {
      assert.ok(!/vxe-table--|vxe-body--|vxe-table\{|vxe-button/.test(css), `${mode} 意外包含表格 CSS`);
      assert.ok(
        ![...modules].some(id => /YTable\.css|vxe-table|vxe-pc-ui|@formily/.test(id)),
        `${mode} 意外包含表格模块`
      );
    } else {
      assert.match(css, /vxe-table--/, `${mode} 缺少表格全局样式`);
      assert.match(css, /vxe-button/, `${mode} 缺少 VXE UI 样式`);
    }
    report[mode] = {
      modules: [...modules],
      files: [...files].map(file => {
        const bytes = readFileSync(join(output, file));
        return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
      }),
    };
  }
  writeFileSync(join(consumer, 'root-styles-report.json'), JSON.stringify(report, null, 2));
  console.log(`根入口样式消费矩阵通过：${consumer}`);
};
