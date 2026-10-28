'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  cleanupManagedSkillTarget,
  createIdeLinks,
  ensureGitIgnore,
  ensurePrettierIgnore,
  normalizeIgnoreEntries,
  resolveSkillsSource,
  syncSkillEntries,
  syncSkills,
  updateAntigravityRules,
  updateCursorRules,
} = require('./sync');

/**
 * 创建最小可同步 Skill。
 *
 * @param {string} root Skills 根目录
 * @param {string} name Skill 名称
 */
async function createSkill(root, name) {
  const skillDir = path.join(root, name);
  await fs.ensureDir(skillDir);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`, 'utf8');
}

const originalLog = console.log;
const originalWarn = console.warn;

test.beforeEach(() => {
  console.log = () => {};
  console.warn = () => {};
});

test.afterEach(() => {
  console.log = originalLog;
  console.warn = originalWarn;
});

test('用户级同步只替换 YSS 同名项并保留第三方 Skills', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-sync-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const targetRoot = path.join(tempRoot, 'target');

  try {
    await createSkill(sourceRoot, 'frontend-commit');
    await createSkill(targetRoot, 'third-party-skill');
    await createSkill(targetRoot, 'microapp-commit');
    await createSkill(targetRoot, 'page-module-development');

    await syncSkillEntries(sourceRoot, targetRoot, ['frontend-commit'], {
      link: true,
      label: 'test',
      deprecatedSkills: ['microapp-commit', 'page-module-development'],
      writeManifest: true,
    });

    assert.equal(await fs.pathExists(path.join(targetRoot, 'third-party-skill/SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'microapp-commit')), false);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'page-module-development')), false);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'frontend-commit/SKILL.md')), true);

    const manifest = await fs.readJson(path.join(targetRoot, '.yss-skills-manifest.json'));
    assert.deepEqual(manifest.skills, ['frontend-commit']);
    assert.equal(manifest.mode, os.platform() === 'win32' ? 'copy' : 'link');
  } finally {
    await fs.remove(tempRoot);
  }
});

test('项目级 IDE 目录已有第三方 Skills 时不会被整目录覆盖', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-project-links-'));
  const primaryRoot = path.join(tempRoot, '.agents/skills');
  const legacyRoot = path.join(tempRoot, '.agent/skills');

  try {
    await createSkill(primaryRoot, 'frontend-commit');
    await createSkill(legacyRoot, 'third-party-skill');
    await createSkill(legacyRoot, 'page-module-development');

    const warnings = [];
    console.warn = message => warnings.push(String(message));
    await createIdeLinks(
      tempRoot,
      '.agents/skills',
      ['.agent/skills'],
      ['frontend-commit'],
      ['microapp-commit', 'page-module-development']
    );

    // 第三方 Skill 会随 .agent/skills 一起被 .gitignore 忽略，需提示迁移到主目录
    assert.equal(
      warnings.some(message => message.includes('third-party-skill') && message.includes('.agents/skills')),
      true
    );
    assert.equal(await fs.pathExists(path.join(legacyRoot, 'third-party-skill/SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(legacyRoot, 'page-module-development')), false);
    assert.equal(await fs.pathExists(path.join(legacyRoot, 'frontend-commit/SKILL.md')), true);
    assert.equal(
      await fs.realpath(path.join(legacyRoot, 'frontend-commit')),
      await fs.realpath(path.join(primaryRoot, 'frontend-commit'))
    );
    const manifest = await fs.readJson(path.join(legacyRoot, '.yss-skills-manifest.json'));
    assert.equal(manifest.source, os.platform() === 'win32' ? '@yss-ui/skills' : '../../.agents/skills');
    assert.equal(path.isAbsolute(manifest.source), false);
  } finally {
    await fs.remove(tempRoot);
  }
});

test('旧版整目录链接通过 .agent/skills 间接到达主目录时保持兼容', { skip: os.platform() === 'win32' }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-legacy-root-link-'));
  const primaryRoot = path.join(tempRoot, '.agents/skills');
  const legacyRoot = path.join(tempRoot, '.agent/skills');
  const cursorRoot = path.join(tempRoot, '.cursor/skills');

  try {
    await createSkill(primaryRoot, 'frontend-commit');
    await fs.ensureDir(path.dirname(cursorRoot));
    await fs.symlink('../.agent/skills', cursorRoot, 'dir');

    await createIdeLinks(tempRoot, '.agents/skills', ['.agent/skills', '.cursor/skills'], ['frontend-commit'], []);

    assert.equal((await fs.lstat(cursorRoot)).isSymbolicLink(), true);
    assert.equal(
      await fs.realpath(path.join(cursorRoot, 'frontend-commit')),
      await fs.realpath(path.join(primaryRoot, 'frontend-commit'))
    );
    assert.equal((await fs.lstat(path.join(legacyRoot, 'frontend-commit'))).isSymbolicLink(), true);
  } finally {
    await fs.remove(tempRoot);
  }
});

test('废弃用户级目录只清理清单中的 YSS Skills', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-legacy-global-'));
  const targetRoot = path.join(tempRoot, '.codex/skills');
  const outsideRoot = path.join(tempRoot, 'outside-skill');

  try {
    await createSkill(targetRoot, 'frontend-commit');
    await createSkill(targetRoot, 'microapp-commit');
    await createSkill(targetRoot, 'third-party-skill');
    await createSkill(tempRoot, 'outside-skill');
    await fs.writeJson(path.join(targetRoot, '.yss-skills-manifest.json'), {
      source: '@yss-ui/skills',
      mode: 'copy',
      skills: ['frontend-commit', 'microapp-commit', '../../outside-skill'],
    });

    const removed = await cleanupManagedSkillTarget(targetRoot, 'codexLegacy');

    assert.equal(removed, 2);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'frontend-commit')), false);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'microapp-commit')), false);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'third-party-skill/SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(outsideRoot, 'SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(targetRoot, '.yss-skills-manifest.json')), false);
  } finally {
    await fs.remove(tempRoot);
  }
});

test('生成的项目规则统一引用 .agents/skills 主目录', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-generated-rules-'));

  try {
    await updateCursorRules(tempRoot, ['frontend-commit'], '.agents/skills');
    await updateAntigravityRules(tempRoot, ['frontend-commit'], '.agents/skills');

    const cursorRules = await fs.readFile(path.join(tempRoot, '.cursorrules'), 'utf8');
    const agentRules = await fs.readFile(path.join(tempRoot, '.agents/rules/yss-ai-skills.md'), 'utf8');

    assert.match(cursorRules, /\.agents\/skills\/frontend-commit\/SKILL\.md/);
    assert.match(agentRules, /\.agents\/skills\/frontend-commit\/SKILL\.md/);
    assert.equal(cursorRules.includes('.agent/skills/'), false);
    assert.equal(agentRules.includes('.agent/skills/'), false);
  } finally {
    await fs.remove(tempRoot);
  }
});

test('--local 项目级主目录直接链接 monorepo 单一事实源', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-local-primary-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(tempRoot);
    await syncSkills({ local: true, links: false });

    const skillPath = path.join(tempRoot, '.agents/skills/api-integration');
    const manifest = await fs.readJson(path.join(tempRoot, '.agents/skills/.yss-skills-manifest.json'));

    assert.equal((await fs.lstat(skillPath)).isSymbolicLink(), os.platform() !== 'win32');
    assert.equal(manifest.mode, os.platform() === 'win32' ? 'copy' : 'link');
    assert.equal(await fs.pathExists(path.join(skillPath, 'SKILL.md')), true);
  } finally {
    process.chdir(previousCwd);
    await fs.remove(tempRoot);
  }
});

test('--local 始终解析到 monorepo 的 packages/skills 单一事实源', async () => {
  const sourceInfo = await resolveSkillsSource({ local: true });

  assert.equal(sourceInfo.local, true);
  assert.equal(sourceInfo.temporary, false);
  assert.equal(path.basename(sourceInfo.source), 'skills');
  assert.equal(await fs.pathExists(path.join(sourceInfo.source, 'skills.config.json')), true);
});

test('ensurePrettierIgnore 自动为项目创建或补齐 .prettierignore 规则且保证幂等', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-prettierignore-'));
  const ignorePath = path.join(tempRoot, '.prettierignore');

  try {
    // 1. 不存在文件时自动创建
    await ensurePrettierIgnore(tempRoot);
    let content = await fs.readFile(ignorePath, 'utf8');
    assert.equal(content.includes('.agents/'), true);
    assert.equal(content.includes('.cursorrules'), true);

    // 2. 再次执行具有幂等性
    await ensurePrettierIgnore(tempRoot);
    const contentSecond = await fs.readFile(ignorePath, 'utf8');
    assert.equal(contentSecond, content);

    // 3. 原有文件已有其他内容但漏掉某些 AI 目录时，能安全补齐
    await fs.writeFile(ignorePath, 'dist/\nnode_modules/\n.agents/skills/\n', 'utf8');
    await ensurePrettierIgnore(tempRoot);
    content = await fs.readFile(ignorePath, 'utf8');
    assert.equal(content.includes('dist/'), true);
    assert.equal(content.includes('.cursorrules'), true);
    assert.match(content, /^\.cursor\/skills$/m);
    assert.match(content, /^\.codex\/skills$/m);
    assert.doesNotMatch(content, /^\.(?:agent|cursor|claude|trae|codex)\/$/m);

    // 4. 旧版整目录标记块自动迁移为只忽略 skills 兼容路径，保留 .cursor/mcp.json 等可被格式化
    await fs.writeFile(
      ignorePath,
      'dist/\n\n# --- YSS AI SKILLS IGNORE START ---\n# old\n.agents/\n.agent/\n.cursor/\n.claude/\n.trae/\n.codex/\n.cursorrules\n# --- YSS AI SKILLS IGNORE END ---\n',
      'utf8'
    );
    await ensurePrettierIgnore(tempRoot);
    content = await fs.readFile(ignorePath, 'utf8');
    assert.match(content, /^\.agents\/$/m);
    assert.match(content, /^\.claude\/skills$/m);
    assert.doesNotMatch(content, /^\.(?:agent|cursor|claude|trae|codex)\/$/m);
  } finally {
    await fs.remove(tempRoot);
  }
});

/**
 * 判断当前环境是否可用 git，用于真实验证 .gitignore 语义。
 *
 * @returns {boolean} 是否可用
 */
function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 读取 git 视角下的未跟踪路径（已被忽略的路径不会出现）。
 *
 * @param {string} cwd 仓库目录
 * @returns {string[]} 未跟踪路径
 */
function listUntracked(cwd) {
  return execFileSync('git', ['-c', 'core.quotePath=false', 'status', '--porcelain', '--untracked-files=all'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(line => line.startsWith('?? '))
    .map(line => line.slice(3).trim());
}

/** 1.1.1 写入的整目录忽略标记块，用于迁移回归 */
const LEGACY_GITIGNORE_BLOCK = [
  '# --- YSS AI SKILLS GITIGNORE START ---',
  '# IDE Skills 软链接派生目录（主目录为 .agents/skills，软链接目录由 @yss-ui/skills-cli 本地派生请勿提交）',
  '.agent/',
  '.cursor/',
  '.claude/',
  '.trae/',
  '# --- YSS AI SKILLS GITIGNORE END ---',
].join('\n');

const canTestGitSymlinks = os.platform() !== 'win32' && hasGit();

test(
  'ensureGitIgnore 只忽略 IDE skills 兼容路径，团队共享配置仍纳入版本控制 (#60)',
  { skip: !canTestGitSymlinks },
  async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-gitignore-git-'));

    try {
      execFileSync('git', ['init', '-q'], { cwd: tempRoot });
      await createSkill(path.join(tempRoot, '.agents/skills'), 'frontend-commit');
      // 团队共享配置
      await fs.outputFile(path.join(tempRoot, '.cursor/rules/team.mdc'), 'x\n');
      await fs.outputFile(path.join(tempRoot, '.cursor/mcp.json'), '{}\n');
      await fs.outputFile(path.join(tempRoot, '.claude/settings.json'), '{}\n');
      await fs.outputFile(path.join(tempRoot, '.trae/rules/team.md'), 'x\n');
      await fs.outputFile(path.join(tempRoot, '.agent/workflows/release.md'), 'x\n');
      // 当前结构：真实目录 + 逐 Skill 软链接 + manifest
      await createIdeLinks(
        tempRoot,
        '.agents/skills',
        ['.cursor/skills', '.claude/skills', '.agent/skills'],
        ['frontend-commit'],
        []
      );
      // 旧结构：整个 skills 目录本身就是软链接
      await fs.symlink('../.agents/skills', path.join(tempRoot, '.trae/skills'), 'dir');

      await fs.writeFile(path.join(tempRoot, '.gitignore'), `node_modules/\n\n${LEGACY_GITIGNORE_BLOCK}\n`, 'utf8');
      assert.equal(await ensureGitIgnore(tempRoot), 'updated');

      const content = await fs.readFile(path.join(tempRoot, '.gitignore'), 'utf8');
      assert.match(content, /^node_modules\/$/m);
      for (const entry of ['.agent/skills', '.cursor/skills', '.claude/skills', '.trae/skills']) {
        assert.equal(content.split('\n').includes(entry), true, `${entry} 应写入且不带结尾斜杠`);
      }
      assert.doesNotMatch(content, /^\.(?:agent|cursor|claude|trae)\/\s*$/m);

      const untracked = listUntracked(tempRoot);
      for (const shared of [
        '.cursor/rules/team.mdc',
        '.cursor/mcp.json',
        '.claude/settings.json',
        '.trae/rules/team.md',
        '.agent/workflows/release.md',
        '.agents/skills/frontend-commit/SKILL.md',
      ]) {
        assert.equal(untracked.includes(shared), true, `${shared} 不应被忽略`);
      }
      assert.equal(
        untracked.some(file => /^\.(?:agent|cursor|claude|trae)\/skills/.test(file)),
        false,
        `skills 兼容路径应全部被忽略，实际未跟踪：${untracked.join(', ')}`
      );
    } finally {
      await fs.remove(tempRoot);
    }
  }
);

test('ensureGitIgnore 在 monorepo 子包执行时规则锚定到子包目录', { skip: !canTestGitSymlinks }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-gitignore-monorepo-'));
  const appRoot = path.join(tempRoot, 'packages/app');

  try {
    execFileSync('git', ['init', '-q'], { cwd: tempRoot });
    await createSkill(path.join(appRoot, '.agents/skills'), 'frontend-commit');
    await fs.outputFile(path.join(appRoot, '.cursor/rules/team.mdc'), 'x\n');
    await createIdeLinks(appRoot, '.agents/skills', ['.cursor/skills'], ['frontend-commit'], []);
    await fs.outputFile(path.join(tempRoot, '.cursor/skills/root-skill/SKILL.md'), 'x\n');

    await ensureGitIgnore(appRoot, ['.cursor/skills']);

    const untracked = listUntracked(tempRoot);
    assert.equal(untracked.includes('packages/app/.cursor/rules/team.mdc'), true);
    assert.equal(untracked.includes('.cursor/skills/root-skill/SKILL.md'), true);
    assert.equal(
      untracked.some(file => file.startsWith('packages/app/.cursor/skills')),
      false
    );
  } finally {
    await fs.remove(tempRoot);
  }
});

test('ensureGitIgnore 覆盖判断：尊重用户整目录规则，带斜杠或否定规则视为未覆盖', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-gitignore-cover-'));
  const ignorePath = path.join(tempRoot, '.gitignore');

  try {
    // 1. 不存在 .gitignore 时创建，再次执行保持幂等
    assert.equal(await ensureGitIgnore(tempRoot), 'added');
    const created = await fs.readFile(ignorePath, 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'unchanged');
    assert.equal(await fs.readFile(ignorePath, 'utf8'), created);

    // 2. 用户主动整目录忽略：尊重现有配置，不追加
    const userWholeDirs = 'node_modules/\n.agent/\n.cursor\n/.claude/\n.trae/\n';
    await fs.writeFile(ignorePath, userWholeDirs, 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'unchanged');
    assert.equal(await fs.readFile(ignorePath, 'utf8'), userWholeDirs);

    // 3. 精确路径（含根锚点）已覆盖
    const exact = '/.agent/skills\n.cursor/skills\n.claude/skills\n.trae/skills\n';
    await fs.writeFile(ignorePath, exact, 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'unchanged');

    // 4. 带结尾斜杠匹配不到整目录软链接，需补齐标记块
    await fs.writeFile(ignorePath, '.agent/skills/\n.cursor/skills/\n.claude/skills/\n.trae/skills/\n', 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'added');
    assert.match(await fs.readFile(ignorePath, 'utf8'), /^\.cursor\/skills$/m);

    // 5. 否定规则与注释不算覆盖
    await fs.writeFile(
      ignorePath,
      '# .cursor/skills\n!.agent/skills\n.cursor/skills\n.claude/skills\n.trae/skills\n',
      'utf8'
    );
    assert.equal(await ensureGitIgnore(tempRoot), 'added');

    // 6. 本仓库根 .gitignore 已按 */skills 配置，执行 --local 同步时不应追加标记块
    const repoIgnore = await fs.readFile(path.resolve(__dirname, '../../../.gitignore'), 'utf8');
    await fs.writeFile(ignorePath, repoIgnore, 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'unchanged');
  } finally {
    await fs.remove(tempRoot);
  }
});

test('ensureGitIgnore 保留 CRLF 换行，并在无兼容目录时清理旧标记块', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-gitignore-eol-'));
  const ignorePath = path.join(tempRoot, '.gitignore');

  try {
    await fs.writeFile(ignorePath, 'node_modules/\r\ndist/\r\n', 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot), 'added');
    const content = await fs.readFile(ignorePath, 'utf8');
    assert.equal(content.replace(/\r\n/g, '').includes('\n'), false, '不应混入 LF');
    assert.match(content, /\r\n\.cursor\/skills\r\n/);

    // symbolicLinks 显式为空：移除 1.1.1 遗留的整目录标记块，保留用户规则
    await fs.writeFile(ignorePath, `node_modules/\n\n${LEGACY_GITIGNORE_BLOCK}\ndist/\n`, 'utf8');
    assert.equal(await ensureGitIgnore(tempRoot, []), 'removed');
    const stripped = await fs.readFile(ignorePath, 'utf8');
    assert.equal(stripped.includes('YSS AI SKILLS'), false);
    assert.doesNotMatch(stripped, /^\.cursor\/$/m);
    assert.match(stripped, /^node_modules\/$/m);
    assert.match(stripped, /^dist\/$/m);
    assert.equal(await ensureGitIgnore(tempRoot, []), 'unchanged');
  } finally {
    await fs.remove(tempRoot);
  }
});

test('ensureGitIgnore 存在多个重复标记块时只保留一份并维持原位置', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-gitignore-dup-'));
  const ignorePath = path.join(tempRoot, '.gitignore');

  try {
    await fs.writeFile(
      ignorePath,
      `node_modules/\n\n${LEGACY_GITIGNORE_BLOCK}\ndist/\n\n${LEGACY_GITIGNORE_BLOCK}\n\ncoverage/\n${LEGACY_GITIGNORE_BLOCK}\n`,
      'utf8'
    );
    assert.equal(await ensureGitIgnore(tempRoot), 'updated');

    const content = await fs.readFile(ignorePath, 'utf8');
    assert.equal(content.match(/# --- YSS AI SKILLS GITIGNORE START ---/g).length, 1);
    assert.equal(content.match(/# --- YSS AI SKILLS GITIGNORE END ---/g).length, 1);
    assert.doesNotMatch(content, /^\.cursor\/$/m);
    // 新标记块保留在第一个旧块的位置，用户规则顺序不变
    const order = ['node_modules/', '# --- YSS AI SKILLS GITIGNORE START ---', 'dist/', 'coverage/'].map(text =>
      content.indexOf(text)
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order
    );
    assert.equal(order.includes(-1), false);

    // 二次执行幂等
    assert.equal(await ensureGitIgnore(tempRoot), 'unchanged');
    assert.equal(await fs.readFile(ignorePath, 'utf8'), content);
  } finally {
    await fs.remove(tempRoot);
  }
});

test('normalizeIgnoreEntries 规范化 symbolicLinks 并拒绝越界或通配路径', () => {
  assert.deepEqual(
    normalizeIgnoreEntries([
      './.cursor/skills/',
      '.claude\\skills',
      '.trae//skills',
      '.cursor/skills',
      '/abs/skills',
      'C:\\abs\\skills',
      '../escape/skills',
      '.agent/./skills',
      '.agent/*',
      '!.agent/skills',
      'has space/skills',
      '',
      1,
    ]),
    ['.cursor/skills', '.claude/skills', '.trae/skills']
  );
  assert.deepEqual(normalizeIgnoreEntries(undefined), [
    '.agent/skills',
    '.cursor/skills',
    '.claude/skills',
    '.trae/skills',
  ]);
  assert.deepEqual(normalizeIgnoreEntries([]), []);
});

test('默认同步（未指定 --all）包含 yss-create-microapp', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-default-sync-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(tempRoot);
    await syncSkills({ local: true, links: false });

    const createSkillPath = path.join(tempRoot, '.agents/skills/yss-create-microapp/SKILL.md');
    assert.equal(await fs.pathExists(createSkillPath), true);

    const manifest = await fs.readJson(path.join(tempRoot, '.agents/skills/.yss-skills-manifest.json'));
    assert.equal(manifest.skills.includes('yss-create-microapp'), true);
  } finally {
    process.chdir(previousCwd);
    await fs.remove(tempRoot);
  }
});
