import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const RULES_DIR = path.join(ROOT_DIR, 'packages/skills/rules');
const CORE_MD_PATH = path.join(RULES_DIR, 'core.md');
const CODEGEN_MD_PATH = path.join(RULES_DIR, 'codegen.md');
const TARGETS_JSON_PATH = path.join(RULES_DIR, 'targets.json');
const HARD_STOPS_FIXTURE_PATH = path.join(ROOT_DIR, 'scripts/fixtures/ai-rules-legacy-hard-stops.json');
const PHRASES_FIXTURE_PATH = path.join(ROOT_DIR, 'scripts/fixtures/ai-rules-legacy-phrases.json');

/**
 * 计算规范化文本的有效行数（去掉末尾换行符后切分）。
 *
 * @param {string} content 文本内容
 * @returns {number} 行数
 */
export function countNormalizedLines(content) {
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  return normalized.split('\n').length;
}

describe('AI Rules Single Source of Truth (Phase 1)', () => {
  it('countNormalizedLines 行数边界断言（恰好 60 行通过，61 行超标）', () => {
    const lines60 = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const lines61 = Array.from({ length: 61 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

    assert.equal(countNormalizedLines(lines60), 60);
    assert.ok(countNormalizedLines(lines60) <= 60, '恰好 60 行应当通过');

    assert.equal(countNormalizedLines(lines61), 61);
    assert.ok(countNormalizedLines(lines61) > 60, '61 行应当超标');
  });

  it('core.md 格式与结构约束（存在非空、≤ 60 行、无 BOM/CR/frontmatter、单换行结尾、占位符合法）', () => {
    assert.ok(fs.existsSync(CORE_MD_PATH), 'packages/skills/rules/core.md 必须存在');
    const content = fs.readFileSync(CORE_MD_PATH, 'utf8');
    assert.ok(content.trim().length > 0, 'core.md 不得为空');

    assert.ok(!content.startsWith('\uFEFF'), 'core.md 不得包含 UTF-8 BOM');
    assert.ok(!content.includes('\r'), 'core.md 不得包含 CR 换行字符');
    assert.ok(content.endsWith('\n') && !content.endsWith('\n\n'), 'core.md 必须以且仅以单个换行符结尾');
    assert.ok(!content.startsWith('---'), 'core.md 必须为纯 Markdown，严禁包含 YAML frontmatter');

    const lineCount = countNormalizedLines(content);
    assert.ok(lineCount <= 60, `core.md 行数必须 ≤ 60 行（当前行数: ${lineCount}）`);

    assert.ok(!content.includes('Available Skills'), 'core.md 不得列出全量 skill 清单（禁止包含 "Available Skills"）');

    // 占位符校验：只允许 {{skillRoot}}
    const unknownPlaceholderPattern = /\{\{(?!skillRoot\}\})[^}]*\}\}/g;
    assert.ok(!unknownPlaceholderPattern.test(content), 'core.md 只允许 {{skillRoot}} 占位符，禁止包含未知占位符');

    const skillRootMatches = content.match(/\{\{skillRoot\}\}\//g) || [];
    assert.ok(
      skillRootMatches.length <= 15,
      `core.md 中 {{skillRoot}}/ 占位符出现次数必须 ≤ 15（当前出现 ${skillRootMatches.length} 次）`
    );

    // 断言引用的每个 skill 真实存在
    const refPattern = /\{\{skillRoot\}\}\/([a-zA-Z0-9_-]+)\/SKILL\.md/g;
    let match;
    let refCount = 0;
    while ((match = refPattern.exec(content)) !== null) {
      refCount++;
      const skillName = match[1];
      const targetSkillPath = path.join(ROOT_DIR, 'packages/skills', skillName, 'SKILL.md');
      assert.ok(fs.existsSync(targetSkillPath), `core.md 引用的 Skill 不存在: ${skillName} (${targetSkillPath})`);
    }
    assert.ok(refCount > 0, 'core.md 必须包含至少一个必读 Skill 路由');
  });

  it('codegen.md 格式与内容约束（存在非空、无 BOM/CR/frontmatter、单换行结尾、逐字包含 14 条 Hard Stops）', () => {
    assert.ok(fs.existsSync(CODEGEN_MD_PATH), 'packages/skills/rules/codegen.md 必须存在');
    const codegenContent = fs.readFileSync(CODEGEN_MD_PATH, 'utf8');
    assert.ok(codegenContent.trim().length > 0, 'codegen.md 不得为空');

    assert.ok(!codegenContent.startsWith('\uFEFF'), 'codegen.md 不得包含 UTF-8 BOM');
    assert.ok(!codegenContent.includes('\r'), 'codegen.md 不得包含 CR 换行字符');
    assert.ok(
      codegenContent.endsWith('\n') && !codegenContent.endsWith('\n\n'),
      'codegen.md 必须以且仅以单个换行符结尾'
    );
    assert.ok(!codegenContent.startsWith('---'), 'codegen.md 不得以 YAML frontmatter 开头');

    const unknownPlaceholderPattern = /\{\{(?!skillRoot\}\})[^}]*\}\}/g;
    assert.ok(!unknownPlaceholderPattern.test(codegenContent), 'codegen.md 不得包含未知占位符');

    assert.ok(fs.existsSync(HARD_STOPS_FIXTURE_PATH), 'Hard Stops fixture 必须存在');
    const hardStops = JSON.parse(fs.readFileSync(HARD_STOPS_FIXTURE_PATH, 'utf8'));
    assert.equal(hardStops.length, 14, 'Hard Stops 必须包含 14 条规则');
    assert.equal(new Set(hardStops).size, 14, 'Hard Stops 14 条规则必须两两不重复');

    for (const rule of hardStops) {
      assert.ok(codegenContent.includes(rule), `codegen.md 必须逐字包含 Hard Stop 规则: "${rule}"`);
    }
  });

  it('keep 里每条关键句都出现在 core.md + codegen.md 中，两两不重复且与 dropped 无交集', () => {
    assert.ok(fs.existsSync(PHRASES_FIXTURE_PATH), 'Phrases fixture 必须存在');
    const phrases = JSON.parse(fs.readFileSync(PHRASES_FIXTURE_PATH, 'utf8'));

    const coreContent = fs.readFileSync(CORE_MD_PATH, 'utf8');
    const codegenContent = fs.readFileSync(CODEGEN_MD_PATH, 'utf8');
    const combinedContent = `${coreContent}\n\n${codegenContent}`;

    assert.ok(Array.isArray(phrases.keep) && phrases.keep.length >= 30, 'keep 列表必须包含足够的关键规则句');
    assert.equal(new Set(phrases.keep).size, phrases.keep.length, 'keep 列表中所有条目必须两两不重复');

    const droppedPhrases = new Set((phrases.dropped || []).map(item => item.phrase));
    for (const phrase of phrases.keep) {
      assert.ok(!droppedPhrases.has(phrase), `keep 与 dropped 存在冲突交集条目: "${phrase}"`);
      assert.ok(combinedContent.includes(phrase), `core.md + codegen.md 必须包含规则关键句: "${phrase}"`);
    }

    assert.ok(Array.isArray(phrases.dropped) && phrases.dropped.length > 0, 'dropped 列表不得为空');
    const validMovedTo = new Set(['lib-docs-sync', 'lib-component-add', 'removed', 'AGENTS.md']);
    for (const item of phrases.dropped) {
      assert.ok(item.phrase && typeof item.phrase === 'string', 'dropped 条目必须提供 phrase');
      assert.ok(item.reason && item.reason.trim().length > 0, `dropped 条目 "${item.phrase}" 必须注明 reason`);
      assert.ok(
        validMovedTo.has(item.movedTo),
        `dropped 条目 "${item.phrase}" 的 movedTo 必须属于 [lib-docs-sync, lib-component-add, removed, AGENTS.md]，当前为: ${item.movedTo}`
      );
    }
  });

  it('core.md 与 codegen.md 严禁出现维护者专用路径与约定', () => {
    const coreContent = fs.readFileSync(CORE_MD_PATH, 'utf8');
    const codegenContent = fs.readFileSync(CODEGEN_MD_PATH, 'utf8');
    const forbiddenPatterns = [
      'packages/components/src',
      'docs/components/demos',
      'Dumi demos 中始终',
      'docs 的 API 表',
    ];

    for (const pattern of forbiddenPatterns) {
      assert.ok(!coreContent.includes(pattern), `core.md 不得包含维护者路径或约定: "${pattern}"`);
      assert.ok(!codegenContent.includes(pattern), `codegen.md 不得包含维护者路径或约定: "${pattern}"`);
    }
  });

  it('targets.json 合法、模式有效、markers 独立且引用的 sources 文件均存在', () => {
    assert.ok(fs.existsSync(TARGETS_JSON_PATH), 'packages/skills/rules/targets.json 必须存在');
    const raw = fs.readFileSync(TARGETS_JSON_PATH, 'utf8');
    const data = JSON.parse(raw);

    assert.equal(data.version, 1, 'targets.json version 必须为 1');
    assert.ok(data.marker && data.marker.start && data.marker.end, 'targets.json 必须包含合法 marker');
    assert.notEqual(data.marker.start, data.marker.end, 'marker.start 与 marker.end 不能相同');

    const validModes = new Set(['marker-block', 'file', 'text']);
    assert.ok(data.targets && typeof data.targets === 'object', 'targets.json 必须包含 targets 对象');

    for (const [key, target] of Object.entries(data.targets)) {
      assert.ok(
        validModes.has(target.mode),
        `target "${key}" 的 mode (${target.mode}) 必须在 [marker-block, file, text] 范围内`
      );
      assert.ok(
        Array.isArray(target.sources) && target.sources.length > 0,
        `target "${key}" 必须包含非空 sources 数组`
      );

      for (const sourceFile of target.sources) {
        const sourceFullPath = path.join(RULES_DIR, sourceFile);
        assert.ok(
          fs.existsSync(sourceFullPath),
          `target "${key}" 引用的 source 文件不存在: ${sourceFile} (${sourceFullPath})`
        );
      }
    }
  });
});
