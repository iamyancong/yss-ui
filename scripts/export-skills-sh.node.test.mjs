import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolvePublicSkills,
  scanFileSecurity,
  validateRelativeLinks,
  runExport,
} from './export-skills-sh.mjs';

test('resolvePublicSkills: 准确提取业务白名单并排除废弃/维护/后端技能', () => {
  const skills = resolvePublicSkills();

  // 必须包含的核心顶层业务 skill
  assert.ok(skills.includes('create-yss-app'), '应包含 create-yss-app');
  assert.ok(skills.includes('yss-frontend-dev'), '应包含 yss-frontend-dev');
  assert.ok(skills.includes('page-list-module'), '应包含常用业务 skill');

  // 必须排除的废弃与内部 skill
  assert.ok(!skills.includes('java-backend-commit'), '必须排除 java-backend-commit');
  assert.ok(!skills.includes('page-module-development'), '必须排除已废弃的 page-module-development');
  assert.ok(!skills.includes('microapp-commit'), '必须排除已废弃的 microapp-commit');
  assert.ok(!skills.includes('sync-internal-dev'), '必须排除内部维护工具 sync-internal-dev');
  assert.ok(!skills.includes('component-development'), '必须排除 library 维护分类');
  assert.ok(!skills.includes('release-workflow'), '必须排除 release-workflow');
});

test('scanFileSecurity: 敏感信息命中时正确抛出安全门禁错误（且导出不认 allow 豁免）', () => {
  // 正常代码通过
  assert.doesNotThrow(() => {
    scanFileSecurity('test.md', 'const url = "https://github.com/iamyancong/yss-ui";');
  });

  // 拼接敏感测试字符串，防止源码中暴露明文或被静态检查误伤
  const fakePrivateIp1 = '192.' + '168.1.1';
  const fakePrivateIp2 = '10.' + '20.30.40';
  const fakeInternalDomain = 'https://' + 'gitlab.' + 'dm' + '.com/repo.git';
  const fakeMainDomain = 'https://' + 'internal.' + 'dm' + '.com/api';

  // 即使带有 skillscan:allow 标记，对外导出也必须拦截阻断
  assert.throws(
    () => {
      scanFileSecurity('test.md', `const ip = "${fakePrivateIp1}"; // skillscan:allow 测试用例`);
    },
    /安全门禁拦截.*内网\/私有 IP/
  );

  // 命中内网 IP 抛错
  assert.throws(
    () => {
      scanFileSecurity('test.md', `connect to ${fakePrivateIp2} for testing`);
    },
    /安全门禁拦截.*内网\/私有 IP/
  );

  // 命中内部系统域名抛错
  assert.throws(
    () => {
      scanFileSecurity('test.md', `clone from ${fakeInternalDomain}`);
    },
    /安全门禁拦截.*内部系统或主域名/
  );

  // 命中公司主域名抛错
  assert.throws(
    () => {
      scanFileSecurity('test.md', `fetch from ${fakeMainDomain}`);
    },
    /安全门禁拦截.*内部系统或主域名/
  );
});

test('validateRelativeLinks: 检测跨技能引用（含 references 路径与断链）', () => {
  const publicSkillSet = new Set(['page-list-module', 'ytable-usage', 'create-yss-app']);

  // 合法相对链接（SKILL.md 与 references 目录内文件）
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '请查看 [表格使用](../ytable-usage/SKILL.md) 了解详情', publicSkillSet);
  });
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '请查看 [参数规范](../create-yss-app/references/params.md) 了解详情', publicSkillSet);
  });

  // 引用了未公开技能应抛错
  assert.throws(
    () => {
      validateRelativeLinks(
        'test-skill',
        '请查看 [内部同步](../sync-internal-dev/SKILL.md) 操作',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: sync-internal-dev/
  );

  // 引用了公开技能但不存在的子文件应抛断链错
  assert.throws(
    () => {
      validateRelativeLinks(
        'test-skill',
        '请查看 [不存在的参考](../create-yss-app/references/non-existent.md)',
        publicSkillSet
      );
    },
    /存在断链，目标文件不存在/
  );
});

test('runExport: 完整端到端导出到临时目录', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-skills-export-test-'));

  try {
    const report = runExport({ outDir: tempDir, clean: true });
    assert.ok(report.skillsCount >= 25, '导出技能数量应达到预期');
    assert.ok(report.filesCount >= 40, '导出文件总数应达到预期');

    // 检查目录结构
    assert.ok(fs.existsSync(path.join(tempDir, 'README.md')), '应生成 README.md');
    assert.ok(fs.existsSync(path.join(tempDir, 'LICENSE')), '应生成 LICENSE');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/MANIFEST.json')), '应生成 MANIFEST.json');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/create-yss-app/SKILL.md')), '应包含 create-yss-app');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/yss-frontend-dev/SKILL.md')), '应包含 yss-frontend-dev');

    // 校验 MANIFEST.json 内容
    const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'skills/MANIFEST.json'), 'utf8'));
    assert.equal(manifest.skillsCount, report.skillsCount);
    assert.ok(manifest.files['skills/create-yss-app/SKILL.md'], 'MANIFEST 应收录 create-yss-app 文件哈希');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
