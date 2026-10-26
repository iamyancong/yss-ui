import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALLOWLIST,
  checkHardcodedAntPrefix,
  scanContentForHardcodedAntPrefix,
} from './check-hardcoded-ant-prefix.mjs';

test('当前仓库组件与 Hook 源码不存在未豁免的硬编码 .ant- 选择器', () => {
  const result = checkHardcodedAntPrefix();
  assert.ok(result.scannedCount > 0, '应至少扫描到组件与 Hook 源码文件');
  assert.deepEqual(result.findings, []);
  assert.equal(ALLOWLIST.size, 0);
});

test('scanContentForHardcodedAntPrefix 能准确识别样式与 DOM 查询中的 .ant- 并忽略注释和 CSS 变量', () => {
  const sampleVue = `
<script setup lang="ts">
// 注释里的 .ant-card-body 不应报错
/* 块注释里的 .ant-select-selector 也不应报错 */
const body = el.querySelector('.ant-card-body');
const isCard = el.classList.contains('ant-card');
const nodes = el.getElementsByClassName('ant-tree-node');
</script>
<template>
  <!-- 模板注释 .ant-btn-disabled -->
  <div class="y-demo ant-card-custom" />
</template>
<style scoped lang="less">
.y-demo {
  color: var(--ant-primary-color, #3371ff);
  :deep(.ant-input) {
    border-color: red;
  }
  :deep([class^="ant-picker"]) {
    padding: 0;
  }
}
</style>
`;
  const violations = scanContentForHardcodedAntPrefix(sampleVue, 'demo.vue');
  assert.equal(violations.length, 6);
  assert.equal(violations[0].match, '.ant-card-body');
  assert.equal(violations[1].match, "classList.contains('ant-card'");
  assert.equal(violations[2].match, "getElementsByClassName('ant-tree-node'");
  assert.equal(violations[3].match, 'class="y-demo ant-card-custom"');
  assert.equal(violations[4].match, '.ant-input');
  assert.equal(violations[5].match, '[class^="ant-picker"]');
});

test('新加的三种规则（getElementsByClassName、模板 class、属性选择器）各自正例命中且反例不误报', () => {
  // 1. getElementsByClassName：命中 ant-xxx，不命中 y-xxx 或包含 ant 子串的 tenant-xxx
  const caseGetByClass = `
const hit = root.getElementsByClassName('ant-select-item');
const safe1 = root.getElementsByClassName('y-select-item');
const safe2 = root.getElementsByClassName('tenant-select-item');
`;
  const v1 = scanContentForHardcodedAntPrefix(caseGetByClass, 'case1.ts');
  assert.equal(v1.length, 1);
  assert.equal(v1[0].match, "getElementsByClassName('ant-select-item'");

  // 2. 模板 class="..."：命中 class="... ant-xxx ..."，不命中 class="y-xxx" 或 class="merchant-card"
  const caseTemplateClass = `
<template>
  <div class="y-card ant-card-bordered" />
  <div class="y-card y-card__body" />
  <div class="merchant-card tenant-header" />
</template>
`;
  const v2 = scanContentForHardcodedAntPrefix(caseTemplateClass, 'case2.vue');
  assert.equal(v2.length, 1);
  assert.equal(v2[0].match, 'class="y-card ant-card-bordered"');

  // 3. 属性选择器 [class^="ant-"] / [class*="ant-"]：命中 ant-，不命中 y- 或 tenant-
  const caseAttrSelector = `
.y-demo {
  [class^="ant-table"] { color: red; }
  [class^="y-table"] { color: blue; }
  [class*="tenant-table"] { color: green; }
}
`;
  const v3 = scanContentForHardcodedAntPrefix(caseAttrSelector, 'case3.less');
  assert.equal(v3.length, 1);
  assert.equal(v3[0].match, '[class^="ant-table"]');
});

test('checkHardcodedAntPrefix 支持通过 allowlist 豁免指定文件', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-ant-prefix-'));
  try {
    const compDir = path.join(tmpRoot, 'packages/components/src/demo');
    fs.mkdirSync(compDir, { recursive: true });
    const fileA = path.join(compDir, 'style.less');
    fs.writeFileSync(fileA, '.y-demo { :deep(.ant-picker-cell) { padding: 0; } }\n', 'utf8');

    const unallowed = checkHardcodedAntPrefix({
      rootDir: tmpRoot,
      scanDirs: ['packages/components/src'],
      allowlist: new Map(),
    });
    assert.equal(unallowed.findings.length, 1);
    assert.equal(unallowed.findings[0].file, 'packages/components/src/demo/style.less');

    const allowed = checkHardcodedAntPrefix({
      rootDir: tmpRoot,
      scanDirs: ['packages/components/src'],
      allowlist: new Map([
        ['packages/components/src/demo/style.less', { reason: '测试白名单豁免' }],
      ]),
    });
    assert.equal(allowed.findings.length, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
