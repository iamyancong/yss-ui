import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildAiRules, AUTO_GENERATED_HEADER, AGENTS_MD_HEADER, REPO_ARTIFACTS } from './build-ai-rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts/build-ai-rules.mjs');
const SIZE_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts/check-agents-size.js');
const TARGETS = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'packages/skills/rules/targets.json'), 'utf8'));
const MARKER_START = TARGETS.marker.start;
const MARKER_END = TARGETS.marker.end;

/**
 * 创建带真实 rules 源的临时仓库根目录。
 *
 * @returns {string} 临时目录
 */
function makeTmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-build-ai-rules-agents-'));
  const srcRulesDir = path.join(ROOT_DIR, 'packages/skills/rules');
  const destRulesDir = path.join(root, 'packages/skills/rules');
  fs.mkdirSync(destRulesDir, { recursive: true });
  for (const file of fs.readdirSync(srcRulesDir)) {
    fs.copyFileSync(path.join(srcRulesDir, file), path.join(destRulesDir, file));
  }
  return root;
}

/**
 * 以子进程运行生成脚本。
 *
 * @param {string} root 临时根目录
 * @param {boolean} check 是否 check 模式
 * @returns {import('node:child_process').SpawnSyncReturns<string>} 结果
 */
function runCli(root, check) {
  const args = [SCRIPT_PATH, '--root', root];
  if (check) args.push('--check');
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

describe('AI Rules Builder and Synchronizer (build-ai-rules.mjs)', () => {
  let tmpRoot;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-build-ai-rules-'));
    // 拷贝真实 rules 源码到临时测试根目录
    const srcRulesDir = path.join(ROOT_DIR, 'packages/skills/rules');
    const destRulesDir = path.join(tmpRoot, 'packages/skills/rules');
    fs.mkdirSync(destRulesDir, { recursive: true });
    for (const file of fs.readdirSync(srcRulesDir)) {
      fs.copyFileSync(path.join(srcRulesDir, file), path.join(destRulesDir, file));
    }
  });

  after(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('buildAiRules 正常生成 3 个产物，且二次执行幂等无更新', () => {
    // 第一次执行：生成全部 3 个文件
    const res1 = buildAiRules({ root: tmpRoot });
    assert.equal(res1.changed.length, 3, '初次执行应更新全部 3 个产物');

    for (const artifact of REPO_ARTIFACTS) {
      const fullPath = path.join(tmpRoot, artifact.path);
      assert.ok(fs.existsSync(fullPath), `产物文件未生成: ${artifact.path}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      const header = artifact.path === 'AGENTS.md' ? AGENTS_MD_HEADER : AUTO_GENERATED_HEADER;
      assert.ok(content.includes(header), `${artifact.path} 必须包含自动生成注释`);
    }

    // 第二次执行：内容相同，changed 应为空
    const res2 = buildAiRules({ root: tmpRoot });
    assert.equal(res2.changed.length, 0, '二次执行必须幂等，无文件变动');

    // check 模式在干净状态下应无变化
    const checkRes = buildAiRules({ root: tmpRoot, check: true });
    assert.equal(checkRes.changed.length, 0, '干净状态下 check 应无变动');
  });

  it('产物具体格式验证：frontmatter、占位符清理与维护者路径隔离', () => {
    const agentsContent = fs.readFileSync(path.join(tmpRoot, 'AGENTS.md'), 'utf8');
    assert.ok(
      agentsContent.startsWith(`${MARKER_START}\n${AGENTS_MD_HEADER}\n`),
      'AGENTS.md 不存在时生成的文件只含标记块，块首为 AUTO-GENERATED 注释'
    );
    assert.ok(agentsContent.endsWith(`${MARKER_END}\n`));
    assert.ok(
      !agentsContent.includes('{{') && !agentsContent.startsWith('---'),
      'AGENTS.md 块内无占位符、无 frontmatter'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpRoot, '.agents/rules/yss-ai-skills.md')),
      '不再生成 .agents/rules/yss-ai-skills.md'
    );

    const mdcPath = path.join(tmpRoot, '.cursor/rules/rule.mdc');
    const mdcContent = fs.readFileSync(mdcPath, 'utf8');
    assert.ok(mdcContent.includes('alwaysApply: true'), 'rule.mdc 必须包含 alwaysApply: true');
    assert.ok(mdcContent.includes('title: YSS UI 代码生成规范'), 'rule.mdc 必须包含规范 title');

    const cursorrulesPath = path.join(tmpRoot, '.cursorrules');
    const cursorContent = fs.readFileSync(cursorrulesPath, 'utf8');
    assert.ok(!cursorContent.includes('{{'), '.cursorrules 不得残留任何占位符');
    assert.ok(!cursorContent.includes('YSS AI SKILLS START'), '.cursorrules 不得包含旧技能清单块');
    assert.ok(!cursorContent.includes('packages/components/src'), '.cursorrules 不得包含维护者内部路径');
  });

  it('文件被手动篡改或删除时，--check 阻断并返回 exit 1', () => {
    const testFile = path.join(tmpRoot, '.cursorrules');
    fs.appendFileSync(testFile, '\n# dirty change\n', 'utf8');

    const proc = spawnSync(process.execPath, [SCRIPT_PATH, '--check', '--root', tmpRoot], {
      encoding: 'utf8',
    });
    assert.equal(proc.status, 1, '内容漂移时 --check 必须 exit 1');
    assert.ok(proc.stderr.includes('.cursorrules'), '错误信息中应指明变动文件');

    // 恢复文件并测试删除产物场景
    buildAiRules({ root: tmpRoot });
    fs.unlinkSync(testFile);

    const procDel = spawnSync(process.execPath, [SCRIPT_PATH, '--check', '--root', tmpRoot], {
      encoding: 'utf8',
    });
    assert.equal(procDel.status, 1, '文件缺失时 --check 必须 exit 1');
    assert.ok(procDel.stderr.includes('.cursorrules'), '错误信息中应指明缺失文件');

    // 重新生成恢复
    buildAiRules({ root: tmpRoot });
  });

  it('真实仓库环境一致性检查：当前仓库产物与源保持同步', () => {
    const realCheck = buildAiRules({ root: ROOT_DIR, check: true });
    assert.equal(
      realCheck.changed.length,
      0,
      `真实仓库存在未同步产物: ${realCheck.changed.join(', ')}。请先执行 pnpm build:ai-rules。`
    );
  });
});

describe('AGENTS.md YSS-UI 标记块（方案 A）', () => {
  let root;

  before(() => {
    root = makeTmpRoot();
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** 读取临时 AGENTS.md。 */
  const readAgents = () => fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  /** 写入临时 AGENTS.md。 */
  const writeAgents = content => fs.writeFileSync(path.join(root, 'AGENTS.md'), content, 'utf8');

  it('已有内容无标记块：末尾追加，原内容逐字节保留且中间恰好一个空行', () => {
    const original = '# 宪法\n\n- 规则一\n';
    writeAgents(original);
    buildAiRules({ root });
    const content = readAgents();
    assert.ok(content.startsWith(`# 宪法\n\n- 规则一\n\n${MARKER_START}\n`));
    assert.ok(content.endsWith(`${MARKER_END}\n`));
  });

  it('已有旧块：原位替换，块外前后内容逐字节不变；幂等', () => {
    const before = '# 宪法\n\n前文\n\n';
    const after = '\n## 尾部\n\n后文\n';
    writeAgents(`${before}${MARKER_START}\n旧规则\n${MARKER_END}\n${after}`);
    const res = buildAiRules({ root });
    assert.deepEqual(
      res.changed.filter(f => f === 'AGENTS.md'),
      ['AGENTS.md']
    );
    const content = readAgents();
    assert.ok(content.startsWith(`${before}${MARKER_START}\n${AGENTS_MD_HEADER}\n`));
    assert.ok(content.endsWith(`${MARKER_END}\n${after}`));
    assert.ok(!content.includes('旧规则'));
    assert.equal(buildAiRules({ root }).changed.length, 0, '第二次执行无变化');
    assert.equal(buildAiRules({ root, check: true }).changed.length, 0, 'check 通过');
    assert.equal(runCli(root, true).status, 0);
  });

  it('手改块内内容 check 报 AGENTS.md 且 exit 1；手改块外内容 check 仍通过', () => {
    buildAiRules({ root });
    const clean = readAgents();
    writeAgents(clean.replace(`${MARKER_END}\n`, `被手改的一行\n${MARKER_END}\n`));
    const dirty = runCli(root, true);
    assert.equal(dirty.status, 1);
    assert.ok(dirty.stderr.includes('AGENTS.md'));
    writeAgents(`块外新增的维护者说明\n\n${clean}`);
    assert.equal(runCli(root, true).status, 0, '块外内容可自由编辑');
    buildAiRules({ root });
  });

  for (const [label, broken] of [
    ['重复 start', `${MARKER_START}\na\n${MARKER_START}\nb\n${MARKER_END}\n`],
    ['重复 end', `${MARKER_START}\na\n${MARKER_END}\nb\n${MARKER_END}\n`],
    ['只有 start', `# 宪法\n${MARKER_START}\n残缺\n`],
    ['只有 end', `# 宪法\n残缺\n${MARKER_END}\n`],
    ['end 在 start 之前', `${MARKER_END}\n颠倒\n${MARKER_START}\n`],
  ]) {
    it(`标记损坏（${label}）：生成与 check 均失败、错误指明 AGENTS.md、文件不被改动`, () => {
      writeAgents(broken);
      assert.throws(() => buildAiRules({ root }), /AGENTS\.md/);
      for (const check of [false, true]) {
        const proc = runCli(root, check);
        assert.equal(proc.status, 1);
        assert.ok(proc.stderr.includes('AGENTS.md'));
      }
      assert.equal(readAgents(), broken);
    });
  }

  it('CLAUDE.md -> AGENTS.md 软链在生成后保持不变', { skip: os.platform() === 'win32' }, () => {
    writeAgents('# 宪法\n');
    const claudePath = path.join(root, 'CLAUDE.md');
    fs.rmSync(claudePath, { force: true });
    fs.symlinkSync('AGENTS.md', claudePath);
    buildAiRules({ root });
    assert.ok(fs.lstatSync(claudePath).isSymbolicLink());
    assert.equal(fs.readlinkSync(claudePath), 'AGENTS.md');
    assert.ok(fs.lstatSync(path.join(root, 'AGENTS.md')).isFile());
    assert.ok(fs.readFileSync(claudePath, 'utf8').includes(MARKER_START));
  });

  it('真实仓库：AGENTS.md 含标记块、不再有 .agents/rules/yss-ai-skills.md、CLAUDE.md 仍是软链', () => {
    const content = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf8');
    assert.equal(content.split(MARKER_START).length - 1, 1);
    assert.equal(content.split(MARKER_END).length - 1, 1);
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, '.agents/rules/yss-ai-skills.md')));
    if (os.platform() !== 'win32') {
      assert.ok(fs.lstatSync(path.join(ROOT_DIR, 'CLAUDE.md')).isSymbolicLink());
      assert.equal(fs.readlinkSync(path.join(ROOT_DIR, 'CLAUDE.md')), 'AGENTS.md');
    }
  });
});

describe('check-agents-size：32 KiB 字节上限', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-agents-size-'));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** 以子进程检查指定文件。 */
  const runSize = file => spawnSync(process.execPath, [SIZE_SCRIPT_PATH, '--file', file], { encoding: 'utf8' });

  it('恰好 32768 字节通过，32769 字节失败，文件不存在失败', () => {
    const ok = path.join(dir, 'ok.md');
    const big = path.join(dir, 'big.md');
    fs.writeFileSync(ok, 'a'.repeat(32768));
    fs.writeFileSync(big, 'a'.repeat(32769));
    assert.equal(runSize(ok).status, 0);
    const fail = runSize(big);
    assert.equal(fail.status, 1);
    assert.ok(fail.stderr.includes('32768'));
    assert.equal(runSize(path.join(dir, 'missing.md')).status, 1);
  });

  it('真实仓库 AGENTS.md 未超限', () => {
    assert.equal(spawnSync(process.execPath, [SIZE_SCRIPT_PATH], { encoding: 'utf8' }).status, 0);
  });
});
