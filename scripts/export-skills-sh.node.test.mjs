import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolvePublicSkills,
  resolveNonPublicSkills,
  scanFileSecurity,
  validateRelativeLinks,
  sanitizeExportContent,
  validateSkillDescription,
  collectExportFiles,
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
  assert.ok(!skills.includes('yss-create-microapp'), '必须排除离线兜底 yss-create-microapp');
  assert.ok(!skills.includes('page-module-development'), '必须排除已废弃的 page-module-development');
  assert.ok(!skills.includes('microapp-commit'), '必须排除已废弃的 microapp-commit');
  assert.ok(!skills.includes('sync-internal-dev'), '必须排除内部维护工具 sync-internal-dev');
  assert.ok(!skills.includes('component-development'), '必须排除 library 维护分类');
  assert.ok(!skills.includes('release-workflow'), '必须排除 release-workflow');

  // 校验排除 yss-create-microapp 后的公开技能数量
  assert.ok(skills.length >= 29, `公开导出 skill 数量应至少为 29 (当前: ${skills.length})`);
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

test('validateRelativeLinks: 检测跨技能引用（含 Markdown 链接、反引号路径、裸路径与断链）', () => {
  const publicSkillSet = new Set(['page-list-module', 'ytable-usage', 'create-yss-app']);

  // 合法相对链接（SKILL.md 与 references 目录内文件）
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '请查看 [表格使用](../ytable-usage/SKILL.md) 了解详情', publicSkillSet);
  });
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '请查看 `../ytable-usage/SKILL.md` 了解详情', publicSkillSet);
  });
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '请查看 [参数规范](../create-yss-app/references/params.md) 了解详情', publicSkillSet);
  });
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', '代码导入不误报: import YExample from "../index.vue"; import { x } from "../constant";', publicSkillSet);
  });

  // Markdown 链接引用未公开技能应抛错
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

  // 反引号包裹引用未公开技能（Issue 58 核心漏洞场景）必须被识别并抛错
  assert.throws(
    () => {
      validateRelativeLinks(
        'frontend-commit',
        '- yss-ui 组件库仓库自身的提交与发版：使用 `../commit-linting/SKILL.md`。',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: commit-linting/
  );

  assert.throws(
    () => {
      validateRelativeLinks(
        'yss-formily',
        '- 组件库内部改造 YFormily 源码：使用 `../component-development/SKILL.md`。',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: component-development/
  );

  // 反引号包裹引用未公开技能的子目录（scripts/、examples/、agents/）必须被识别并抛错
  assert.throws(
    () => {
      validateRelativeLinks(
        'test-skill',
        '调用脚本 `../sync-internal-dev/scripts/sync.mjs` 处理。',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: sync-internal-dev/
  );

  assert.throws(
    () => {
      validateRelativeLinks(
        'test-skill',
        '参考示例 `../component-development/examples/demo.vue` 实现。',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: component-development/
  );

  // 裸路径引用未公开技能必须抛错
  assert.throws(
    () => {
      validateRelativeLinks(
        'test-skill',
        '遇到问题转交 ../java-backend-commit/SKILL.md 处理。',
        publicSkillSet
      );
    },
    /引用了未公开或被排除的 Skill: java-backend-commit/
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

test('sanitizeExportContent: 导出时将非公开 Skill 引用安全改写为纯文字提示（方案 A）', () => {
  const publicSkillSet = new Set(['page-list-module', 'ytable-usage']);

  const input = `
- yss-ui 组件库仓库自身的提交与发版：使用 \`../commit-linting/SKILL.md\`。
- Java、Spring Boot、Maven、Gradle 后端仓库：使用 \`../java-backend-commit/SKILL.md\`。
- 组件库内部改造 YFormily 源码：使用 \`../component-development/SKILL.md\`。
- 列表页请参考：使用 \`../page-list-module/SKILL.md\`。
- 超链接形式：请参考 [内部发版](../release-workflow/SKILL.md) 了解详情。
- 脚本子目录形式：调用 \`../sync-internal-dev/scripts/sync.mjs\` 自动化处理。
`;

  const output = sanitizeExportContent(input, publicSkillSet);

  // 非公开 skill 的相对路径被改写为统一纯文字说明
  assert.ok(
    output.includes('使用内部维护 Skill `commit-linting`（仅内部 sync:skills 分发可用）。'),
    'commit-linting 应被平滑改写为内部维护提示'
  );
  assert.ok(
    output.includes('使用内部维护 Skill `java-backend-commit`（仅内部 sync:skills 分发可用）。'),
    'java-backend-commit 应被平滑改写为内部维护提示'
  );
  assert.ok(
    output.includes('使用内部维护 Skill `component-development`（仅内部 sync:skills 分发可用）。'),
    'component-development 应被平滑改写为内部维护提示'
  );
  assert.ok(
    output.includes('内部发版（内部维护 Skill `release-workflow`，仅内部 sync:skills 分发可用）'),
    '超链接形式应被改写为纯文字提示'
  );
  assert.ok(
    output.includes('调用内部维护 Skill `sync-internal-dev`（仅内部 sync:skills 分发可用） 自动化处理。'),
    '脚本子目录路径应被改写为纯文字提示'
  );

  // 公开 skill 依然保留原有的相对引用
  assert.ok(
    output.includes('使用 `../page-list-module/SKILL.md`。'),
    '公开技能引用不得被误改写'
  );

  // 经净化后的内容必须能顺利通过 validateRelativeLinks
  assert.doesNotThrow(() => {
    validateRelativeLinks('test-skill', output, publicSkillSet);
  });
});

test('validateSkillDescription: 拦截 frontmatter description 中残留的未公开技能名', () => {
  const nonPublicSkills = new Set(['yss-create-microapp', 'component-development', 'commit-linting']);

  // 包含未公开 skill 抛错
  assert.throws(
    () => {
      const badFm = `---
name: create-yss-app
description: 新建微应用首选入口；脱机离线创建请改用 yss-create-microapp。
---
# Content`;
      validateSkillDescription('create-yss-app', badFm, nonPublicSkills);
    },
    /frontmatter description 中引用了未公开的 Skill: yss-create-microapp/
  );

  assert.throws(
    () => {
      const badFm = `---
name: vue3-best-practices
description: Vue3 开发规范；组件库维护参考 component-development。
---
# Content`;
      validateSkillDescription('vue3-best-practices', badFm, nonPublicSkills);
    },
    /frontmatter description 中引用了未公开的 Skill: component-development/
  );

  // YAML 折行 / 多行写法（>-）也必须被扫描并拦截
  assert.throws(
    () => {
      const badMultilineFm = `---
name: sample-skill
description: >-
  这是一个跨行书写的微应用开发技能描述，
  用于测试换行场景；脱机离线创建请改用 yss-create-microapp。
---
# Content`;
      validateSkillDescription('sample-skill', badMultilineFm, nonPublicSkills);
    },
    /frontmatter description 中引用了未公开的 Skill: yss-create-microapp/
  );

  // 正常 description 顺利通过
  assert.doesNotThrow(() => {
    const goodFm = `---
name: create-yss-app
description: 新建微应用首选入口；脱机离线创建请改用内部离线方案。
---
# Content`;
    validateSkillDescription('create-yss-app', goodFm, nonPublicSkills);
  });
});

test('collectExportFiles: 默认收集 allowedSubdirs 包含 examples/scripts/references/agents 子目录及 SKILL.md', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-collect-test-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Skill');
    fs.writeFileSync(path.join(tempDir, 'unrelated.txt'), 'ignore me');

    fs.mkdirSync(path.join(tempDir, 'examples/nested'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'examples/demo.vue'), '<template></template>');
    fs.writeFileSync(path.join(tempDir, 'examples/nested/sample.ts'), 'export const x = 1;');

    fs.mkdirSync(path.join(tempDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'references/params.md'), '# Params');

    fs.mkdirSync(path.join(tempDir, 'not-allowed'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'not-allowed/secret.txt'), 'do not export');

    const files = collectExportFiles(tempDir);
    const relFiles = files.map(f => path.relative(tempDir, f).replace(/\\/g, '/'));

    assert.ok(relFiles.includes('SKILL.md'), '应包含 SKILL.md');
    assert.ok(relFiles.includes('examples/demo.vue'), '应包含 examples/demo.vue');
    assert.ok(relFiles.includes('examples/nested/sample.ts'), '应包含嵌套 examples 文件');
    assert.ok(relFiles.includes('references/params.md'), '应包含 references 文件');
    assert.ok(!relFiles.includes('unrelated.txt'), '不应包含非 SKILL.md 的根文件');
    assert.ok(!relFiles.some(f => f.startsWith('not-allowed')), '不应收集未在白名单的子目录');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runExport: 完整端到端导出到临时目录并通过全量断链与描述校验', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-skills-export-test-'));

  try {
    const report = runExport({ outDir: tempDir, clean: true });
    assert.ok(report.skillsCount >= 29, `导出技能数量应至少为 29 (当前: ${report.skillsCount})`);
    assert.ok(report.filesCount >= 40, '导出文件总数应达到预期');

    // 检查目录结构
    assert.ok(fs.existsSync(path.join(tempDir, 'README.md')), '应生成 README.md');
    assert.ok(fs.existsSync(path.join(tempDir, 'LICENSE')), '应生成 LICENSE');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/MANIFEST.json')), '应生成 MANIFEST.json');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/create-yss-app/SKILL.md')), '应包含 create-yss-app');
    assert.ok(fs.existsSync(path.join(tempDir, 'skills/yss-frontend-dev/SKILL.md')), '应包含 yss-frontend-dev');
    assert.ok(!fs.existsSync(path.join(tempDir, 'skills/yss-create-microapp')), '导出结果不应包含 yss-create-microapp');

    // 校验 README 内容包含一键安装命令
    const readme = fs.readFileSync(path.join(tempDir, 'README.md'), 'utf8');
    assert.ok(readme.includes("npx skills add iamyancong/yss-ui-skills --skill '*' -y"), 'README 应包含一键安装命令');

    // 校验 MANIFEST.json 内容
    const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'skills/MANIFEST.json'), 'utf8'));
    assert.equal(manifest.skillsCount, report.skillsCount);
    assert.ok(manifest.files['skills/create-yss-app/SKILL.md'], 'MANIFEST 应收录 create-yss-app 文件哈希');
    assert.ok(
      Object.keys(manifest.files).some(f => f.includes('/examples/')),
      'MANIFEST 应包含 examples 下的代码示例文件'
    );

    // 核心验收项：递归全量扫描导出的所有 Markdown 文件，断言零命中未公开 Skill 的相对路径！
    const forbiddenPattern = /\.\.\/(?:commit-linting|java-backend-commit|component-development|yss-create-microapp)\b/;
    const skillsBaseDir = path.join(tempDir, 'skills');
    const allExportedFiles = [];
    function scanDir(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) scanDir(full);
        else if (ent.isFile() && full.endsWith('.md')) allExportedFiles.push(full);
      }
    }
    scanDir(skillsBaseDir);

    for (const mdPath of allExportedFiles) {
      const mdContent = fs.readFileSync(mdPath, 'utf8');
      const rel = path.relative(tempDir, mdPath);
      assert.ok(
        !forbiddenPattern.test(mdContent),
        `导出的公开文件 ${rel} 中不得残留未公开 Skill 的相对路径引用`
      );
    }

    // 校验 frontend-commit 中的 2 处非公开引用已被正确改写
    const exportedFrontendCommit = fs.readFileSync(path.join(tempDir, 'skills/frontend-commit/SKILL.md'), 'utf8');
    assert.ok(
      exportedFrontendCommit.includes('使用内部维护 Skill `commit-linting`（仅内部 sync:skills 分发可用）。'),
      'frontend-commit 中的 commit-linting 路径应被改写'
    );
    assert.ok(
      exportedFrontendCommit.includes('使用内部维护 Skill `java-backend-commit`（仅内部 sync:skills 分发可用）。'),
      'frontend-commit 中的 java-backend-commit 路径应被改写'
    );

    // 校验 yss-formily 与 yss-ui-business-page-generation 中的 component-development 已被改写
    const exportedYssFormily = fs.readFileSync(path.join(tempDir, 'skills/yss-formily/SKILL.md'), 'utf8');
    assert.ok(
      exportedYssFormily.includes('使用内部维护 Skill `component-development`（仅内部 sync:skills 分发可用）。'),
      'yss-formily 中的 component-development 路径应被改写'
    );

    // 校验 create-yss-app description 已无 yss-create-microapp
    const exportedCreateApp = fs.readFileSync(path.join(tempDir, 'skills/create-yss-app/SKILL.md'), 'utf8');
    const descMatch = exportedCreateApp.match(/description:\s*(.+)/);
    assert.ok(
      descMatch && !descMatch[1].includes('yss-create-microapp'),
      'create-yss-app description 不得包含 yss-create-microapp'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
