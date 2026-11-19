import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { buildCodegenRules } = require('../packages/mcp/scripts/build-index.js');
const { DocStore } = require('../packages/mcp/lib/store.js');
const { handleToolCall } = require('../packages/mcp/lib/tools.js');

const SNAPSHOT_PATH = path.join(ROOT_DIR, 'scripts/fixtures/mcp-codegen-rules.snap.md');
const PHRASES_PATH = path.join(ROOT_DIR, 'scripts/fixtures/ai-rules-legacy-phrases.json');
const HARD_STOPS_PATH = path.join(ROOT_DIR, 'scripts/fixtures/ai-rules-legacy-hard-stops.json');

describe('MCP get_codegen_rules Data Source Integration (Phase 3)', () => {
  const rules = buildCodegenRules();

  it('buildCodegenRules 输出包含全部 keep 短语与 14 条 Hard Stops，且不含维护者私有路径与占位符', () => {
    assert.ok(rules.trim().length > 0, 'codegenRules 输出不得为空');

    // 不以 frontmatter 开头
    assert.ok(!rules.startsWith('---'), 'codegenRules 不得包含 YAML frontmatter');

    // 占位符已被完全替换
    assert.ok(!rules.includes('{{'), 'codegenRules 不得残留任何 {{ 占位符');
    assert.ok(
      rules.includes('.agents/skills/yss-ui-business-page-generation/SKILL.md'),
      'codegenRules 必须包含替换后的业务页面路由路径'
    );

    // 维护者约定与路径隔离
    assert.ok(!rules.includes('packages/components/src'), '不得包含 packages/components/src');
    assert.ok(!rules.includes('docs/components/demos'), '不得包含 docs/components/demos');
    assert.ok(!rules.includes('YSS AI SKILLS START'), '不得包含旧版全量技能清单块');

    // 包含全部 14 条 Hard Stops
    const hardStops = JSON.parse(fs.readFileSync(HARD_STOPS_PATH, 'utf8'));
    assert.equal(hardStops.length, 14);
    for (const stop of hardStops) {
      assert.ok(rules.includes(stop), `codegenRules 必须包含 Hard Stop 规则: "${stop}"`);
    }

    // 包含全部 keep 规则关键句
    const { keep } = JSON.parse(fs.readFileSync(PHRASES_PATH, 'utf8'));
    assert.ok(Array.isArray(keep) && keep.length >= 30);
    for (const phrase of keep) {
      assert.ok(rules.includes(phrase), `codegenRules 必须包含关键句: "${phrase}"`);
    }
  });

  it('快照比较与 UPDATE_SNAPSHOT 重写支持', () => {
    if (process.env.UPDATE_SNAPSHOT === '1' || !fs.existsSync(SNAPSHOT_PATH)) {
      fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
      fs.writeFileSync(SNAPSHOT_PATH, rules, 'utf8');
    }

    const expectedSnapshot = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
    assert.equal(rules, expectedSnapshot, 'buildCodegenRules 输出必须与快照文件完全一致');
  });

  it('使用最小 DocStore 调用 get_codegen_rules 返回正确结构与前缀', () => {
    const mockStore = new DocStore({
      componentsVersion: '1.7.0',
      entries: [],
      skills: [],
      codegenRules: rules,
    });

    const result = handleToolCall(mockStore, 'get_codegen_rules', {});
    assert.ok(result.startsWith('> 索引组件版本：1.7.0。'), '输出必须以 consumptionNotice 开头');
    assert.ok(
      result.includes('# YSS UI 业务代码生成硬规则\n\n'),
      '输出必须紧接固定标题 "# YSS UI 业务代码生成硬规则\\n\\n"'
    );
    assert.ok(result.endsWith(rules), '标题后必须直接拼接完整的 codegenRules 正文');
  });

  describe('边界异常场景处理', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-mcp-rules-test-'));
    });

    after(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rulesDir 不存在时抛错', () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      assert.throws(() => buildCodegenRules(nonExistent), /规则源目录不存在/);
    });

    it('源文件 core.md 为空时抛出带文件名的错误', () => {
      const emptyDir = path.join(tmpDir, 'empty-case');
      fs.mkdirSync(emptyDir);
      fs.writeFileSync(
        path.join(emptyDir, 'targets.json'),
        JSON.stringify({
          skillRoot: '.agents/skills',
          marker: { start: '<!-- S -->', end: '<!-- E -->' },
          targets: {
            'mcp-codegen': { mode: 'text', sources: ['core.md', 'codegen.md'] },
          },
        }),
        'utf8'
      );
      fs.writeFileSync(path.join(emptyDir, 'core.md'), '   \n\n\t  \n', 'utf8');
      fs.writeFileSync(path.join(emptyDir, 'codegen.md'), '# Codegen', 'utf8');

      assert.throws(() => buildCodegenRules(emptyDir), /源文件 core\.md 内容为空/);
    });
  });
});
