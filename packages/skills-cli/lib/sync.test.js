'use strict';

const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  cleanupManagedSkillTarget,
  createIdeLinks,
  ensurePrettierIgnore,
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

    await syncSkillEntries(sourceRoot, targetRoot, ['frontend-commit'], {
      link: true,
      label: 'test',
      deprecatedSkills: ['microapp-commit'],
      writeManifest: true,
    });

    assert.equal(await fs.pathExists(path.join(targetRoot, 'third-party-skill/SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(targetRoot, 'microapp-commit')), false);
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

    await createIdeLinks(tempRoot, '.agents/skills', ['.agent/skills'], ['frontend-commit'], ['microapp-commit']);

    assert.equal(await fs.pathExists(path.join(legacyRoot, 'third-party-skill/SKILL.md')), true);
    assert.equal(await fs.pathExists(path.join(legacyRoot, 'frontend-commit/SKILL.md')), true);
    assert.equal(
      await fs.realpath(path.join(legacyRoot, 'frontend-commit')),
      await fs.realpath(path.join(primaryRoot, 'frontend-commit'))
    );
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
    assert.equal(content.includes('.cursor/'), true);
  } finally {
    await fs.remove(tempRoot);
  }
});
