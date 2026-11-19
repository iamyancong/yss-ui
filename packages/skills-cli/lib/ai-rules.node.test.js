const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  loadRulesSource,
  normalizeSource,
  serializeFrontmatter,
  renderTarget,
  applyMarkerBlock,
  render,
} = require('./ai-rules');

describe('AI Rules Library Unit Tests (ai-rules.js)', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yss-ai-rules-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('normalizeSource 边界处理：去 BOM、CRLF/CR 转 LF、去行尾空白、空文本抛错', () => {
    assert.throws(() => normalizeSource('   \n\t  \n', 'empty.md'), /源文件 empty\.md 内容为空/);

    const raw = '\uFEFFline 1   \r\n\r\nline 2\t  \rline 3 \n\n';
    const normalized = normalizeSource(raw, 'test.md');
    assert.equal(normalized, 'line 1\n\nline 2\nline 3');
    assert.ok(!normalized.includes('\r'));
    assert.ok(!normalized.includes('\uFEFF'));
  });

  it('loadRulesSource 边界异常：目录不存在、缺 targets.json、JSON 解析失败、targets/marker 无效', () => {
    assert.throws(() => loadRulesSource(path.join(tmpDir, 'not-exists')), /规则源目录不存在/);

    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir);
    assert.throws(() => loadRulesSource(emptyDir), /找不到 targets\.json/);

    fs.writeFileSync(path.join(emptyDir, 'targets.json'), '{ broken json', 'utf8');
    assert.throws(() => loadRulesSource(emptyDir), /解析 targets\.json 失败/);

    fs.writeFileSync(path.join(emptyDir, 'targets.json'), JSON.stringify({}), 'utf8');
    assert.throws(() => loadRulesSource(emptyDir), /缺少有效的 targets 对象/);

    fs.writeFileSync(
      path.join(emptyDir, 'targets.json'),
      JSON.stringify({ targets: {}, marker: { start: 'A', end: 'A' } }),
      'utf8'
    );
    assert.throws(() => loadRulesSource(emptyDir), /缺少合法 marker 配置或 marker\.start 与 marker\.end 相同/);

    fs.writeFileSync(
      path.join(emptyDir, 'targets.json'),
      JSON.stringify({
        marker: { start: '<!-- S -->', end: '<!-- E -->' },
        targets: {
          badMode: { mode: 'invalid', sources: ['a.md'] },
        },
      }),
      'utf8'
    );
    assert.throws(() => loadRulesSource(emptyDir), /mode "invalid" 无效/);

    fs.writeFileSync(
      path.join(emptyDir, 'targets.json'),
      JSON.stringify({
        marker: { start: '<!-- S -->', end: '<!-- E -->' },
        targets: {
          badPath: { mode: 'file', sources: ['a.md'] },
        },
      }),
      'utf8'
    );
    assert.throws(() => loadRulesSource(emptyDir), /缺少有效的 path 属性/);

    fs.writeFileSync(
      path.join(emptyDir, 'targets.json'),
      JSON.stringify({
        marker: { start: '<!-- S -->', end: '<!-- E -->' },
        targets: {
          missingSrc: { mode: 'text', sources: ['not-found.md'] },
        },
      }),
      'utf8'
    );
    assert.throws(() => loadRulesSource(emptyDir), /引用的源文件不存在: not-found\.md/);
  });

  it('frontmatter 序列化：boolean、number、需要引号的字符串、非法类型抛错', () => {
    assert.equal(serializeFrontmatter(null), '');
    assert.equal(serializeFrontmatter({}), '');

    const fm = serializeFrontmatter({
      boolVal: true,
      numVal: 42,
      normalStr: 'hello-world',
      withColon: 'foo: bar',
      withHash: 'heading #1',
      withQuotes: 'say "hi"',
      withSpaces: ' padded ',
    });

    assert.ok(fm.startsWith('---\n'));
    assert.ok(fm.endsWith('---\n\n'));
    assert.ok(fm.includes('boolVal: true'));
    assert.ok(fm.includes('numVal: 42'));
    assert.ok(fm.includes('normalStr: hello-world'));
    assert.ok(fm.includes('withColon: "foo: bar"'));
    assert.ok(fm.includes('withHash: "heading #1"'));
    assert.ok(fm.includes('withQuotes: "say \\"hi\\""'));
    assert.ok(fm.includes('withSpaces: " padded "'));

    assert.throws(() => serializeFrontmatter({ badList: ['a', 'b'] }), /frontmatter 属性 "badList" 的值类型不受支持/);
    assert.throws(() => serializeFrontmatter({ badObj: { x: 1 } }), /frontmatter 属性 "badObj" 的值类型不受支持/);
  });

  it('renderTarget：占位符替换、未知 target 报错列出清单、未知占位符报错、marker-block 配 frontmatter 报错', () => {
    const mockRules = {
      config: {
        skillRoot: '.agents/skills',
        marker: { start: '<!-- S -->', end: '<!-- E -->' },
        targets: {
          t1: { mode: 'file', path: 'out.md', sources: ['s1.md'] },
          tBlock: { mode: 'marker-block', path: 'AGENTS.md', sources: ['s1.md'] },
          tUnknownPlaceholder: { mode: 'text', sources: ['s2.md'] },
        },
      },
      sources: {
        's1.md': '# Title\n\nPath is {{skillRoot}}/my-skill/SKILL.md',
        's2.md': 'Here is {{unknownVar}} and {{another}}',
      },
    };

    assert.throws(
      () => renderTarget('nonExistent', mockRules),
      /未知 target: "nonExistent"，可用 target 包括: t1, tBlock, tUnknownPlaceholder/
    );

    assert.throws(
      () => renderTarget('tUnknownPlaceholder', mockRules),
      /存在未解析的占位符: \{\{unknownVar\}\}, \{\{another\}\}/
    );

    assert.throws(
      () => renderTarget('tBlock', mockRules, { frontmatter: { a: 1 } }),
      /mode 为 marker-block 的 target 不支持配置 frontmatter/
    );

    // 默认 skillRoot 替换
    const outDefault = renderTarget('t1', mockRules);
    assert.ok(outDefault.includes('.agents/skills/my-skill/SKILL.md'));
    assert.ok(outDefault.endsWith('\n') && !outDefault.endsWith('\n\n'));

    // options.skillRoot 覆盖且归一化反斜杠与末尾斜杠
    const outCustom = renderTarget('t1', mockRules, {
      skillRoot: 'custom\\path\\to\\skills///',
    });
    assert.ok(outCustom.includes('custom/path/to/skills/my-skill/SKILL.md'));

    // marker-block 输出包装
    const outBlock = renderTarget('tBlock', mockRules);
    assert.ok(outBlock.startsWith('<!-- S -->\n'));
    assert.ok(outBlock.endsWith('<!-- E -->\n'));
  });

  it('applyMarkerBlock：完整覆盖空文件、无块追加、原位替换、格式异常及幂等性', () => {
    const marker = { start: '<!-- START -->', end: '<!-- END -->' };
    const block = '<!-- START -->\ncontent line\n<!-- END -->\n';

    // 1. 空内容
    assert.equal(applyMarkerBlock('', block, marker), block);
    assert.equal(applyMarkerBlock('   \n\n  ', block, marker), block);

    // 2. 原文件无标记：末尾追加且空一行（末尾带换行 vs 不带换行）
    const existingWithNl = '# Title\n\nsome text\n';
    const appended1 = applyMarkerBlock(existingWithNl, block, marker);
    assert.equal(appended1, '# Title\n\nsome text\n\n<!-- START -->\ncontent line\n<!-- END -->\n');

    const existingNoNl = '# Title\n\nsome text';
    const appended2 = applyMarkerBlock(existingNoNl, block, marker);
    assert.equal(appended2, '# Title\n\nsome text\n\n<!-- START -->\ncontent line\n<!-- END -->\n');

    // 3. 原位替换且块外内容逐字节保持不变
    const fileWithBlock = 'Prefix\n\n<!-- START -->\nold content\n<!-- END -->\n\nSuffix\n';
    const updated = applyMarkerBlock(fileWithBlock, block, marker);
    assert.equal(updated, 'Prefix\n\n<!-- START -->\ncontent line\n<!-- END -->\n\nSuffix\n');

    // 4. 幂等性：apply(apply(x)) === apply(x)
    assert.equal(applyMarkerBlock(updated, block, marker), updated);

    // 5. CRLF 原内容：块外换行保持 CRLF
    const crlfFile = 'Line 1\r\n\r\nLine 2';
    const crlfAppended = applyMarkerBlock(crlfFile, block, marker);
    assert.ok(crlfAppended.startsWith('Line 1\r\n\r\nLine 2\r\n\r\n<!-- START -->\n'));

    // 6. 重复标记报错
    const dupStart = '<!-- START --> a <!-- START --> b <!-- END -->';
    assert.throws(() => applyMarkerBlock(dupStart, block, marker), /包含重复的 marker/);

    const dupEnd = '<!-- START --> a <!-- END --> b <!-- END -->';
    assert.throws(() => applyMarkerBlock(dupEnd, block, marker), /包含重复的 marker/);

    // 7. 损坏标记：单边、顺序颠倒
    assert.throws(
      () => applyMarkerBlock('only start <!-- START -->', block, marker),
      /marker 损坏: 仅发现 marker\.start 或 marker\.end 单边标记/
    );
    assert.throws(
      () => applyMarkerBlock('only end <!-- END -->', block, marker),
      /marker 损坏: 仅发现 marker\.start 或 marker\.end 单边标记/
    );
    assert.throws(
      () => applyMarkerBlock('<!-- END --> inverted <!-- START -->', block, marker),
      /marker\.end 出现在 marker\.start 之前/
    );
  });

  it('render 便捷封装与真实 packages/skills/rules 集成', () => {
    const realRulesDir = path.resolve(__dirname, '../../skills/rules');
    const out = render('mcp-codegen', { rulesDir: realRulesDir });
    assert.ok(out.includes('# YSS UI 代码生成规则'));
    assert.ok(out.includes('## Hard Stops'));
    assert.ok(!out.includes('\r'));
  });
});
