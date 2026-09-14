/**
 * 文档索引仓库：加载 data/index.json，提供名称解析、章节提取与全文搜索。
 *
 * 搜索采用与仓库 skills 触发评测一致的中文二元组 + 英文单词词法方案，
 * 零依赖、确定性、离线可用。
 */

const fs = require('fs');
const path = require('path');

/**
 * 混合分词：CJK 连续段取二元组，ASCII 取小写单词。
 *
 * @param {string} text 待分词文本
 * @returns {Set<string>} 词元集合
 */
function tokenize(text) {
  const out = new Set();
  const lower = String(text || '').toLowerCase();
  for (const match of lower.matchAll(/[a-z0-9][a-z0-9'+.-]*/g)) {
    const word = match[0].replace(/[.'-]+$/g, '');
    if (word.length >= 2) out.add(word);
  }
  for (const match of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = match[0];
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i += 1) {
      out.add(run.slice(i, i + 2));
    }
  }
  return out;
}

/**
 * 名称归一化：小写并去除分隔符，用于组件别名匹配。
 *
 * @param {string} name 输入名称
 * @returns {string} 归一化结果
 */
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

/** 文档索引仓库。 */
class DocStore {
  /**
   * @param {string|object} [indexPathOrData] 索引文件路径或已解析的数据对象，默认包内 data/index.json，可用环境变量 YSS_MCP_INDEX 覆盖
   */
  constructor(indexPathOrData) {
    if (indexPathOrData && typeof indexPathOrData === 'object') {
      /** @type {{generatedAt: string, componentsVersion: string, entries: Array<object>, skills: Array<object>, codegenRules: string, schemas?: object, coverage?: object}} */
      this.index = indexPathOrData;
      this.aliasMap = this.buildAliasMap();
      return;
    }
    const resolved =
      (typeof indexPathOrData === 'string' ? indexPathOrData : null) ||
      process.env.YSS_MCP_INDEX ||
      path.join(__dirname, '../data/index.json');
    if (!fs.existsSync(resolved)) {
      throw new Error(`索引文件不存在: ${resolved}，请先在 yss-ui 仓库运行 pnpm --filter @yss/mcp build:index`);
    }
    /** @type {{generatedAt: string, componentsVersion: string, entries: Array<object>, skills: Array<object>, codegenRules: string, schemas?: object, coverage?: object}} */
    this.index = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    this.aliasMap = this.buildAliasMap();
  }

  /**
   * 构建条目别名表：id、无连字符 id、Y 前缀、中英文标题等。
   *
   * @returns {Map<string, object>} 归一化别名到条目的映射
   */
  buildAliasMap() {
    const map = new Map();
    for (const entry of this.index.entries) {
      const aliases = new Set([entry.id, entry.id.replace(/-/g, ''), `y${entry.id.replace(/-/g, '')}`, entry.title]);
      // 标题形如 "YTable 表格" / "useTableHeight 表格高度"：拆出英文名与中文名
      for (const part of entry.title.split(/\s+/)) {
        aliases.add(part);
      }
      for (const alias of aliases) {
        const key = normalizeName(alias);
        if (key && !map.has(key)) map.set(key, entry);
      }
    }
    return map;
  }

  /**
   * 按名称解析文档条目。
   *
   * @param {string} name 组件/Hook/工具函数名称（支持 YTable、y-table、table、表格等写法）
   * @returns {object | null} 文档条目
   */
  resolveEntry(name) {
    const key = normalizeName(name);
    if (!key) return null;
    if (this.aliasMap.has(key)) return this.aliasMap.get(key);
    for (const [alias, entry] of this.aliasMap) {
      if (alias.includes(key) || key.includes(alias)) return entry;
    }
    return null;
  }

  /**
   * 按组件名获取组件 JSON Schema。
   *
   * @param {string} name 组件名（支持 YTable、table、edit-table 等）
   * @returns {object | null} 组件 Schema
   */
  getComponentSchema(name) {
    if (!this.index.schemas) return null;
    const entry = this.resolveEntry(name);
    if (entry && this.index.schemas[entry.id]) {
      return this.index.schemas[entry.id];
    }
    const clean = normalizeName(name).replace(/^y/, '');
    for (const [key, schema] of Object.entries(this.index.schemas)) {
      if (normalizeName(key) === clean || normalizeName(key).includes(clean)) {
        return schema;
      }
    }
    return null;
  }

  /**
   * 获取测试覆盖率信息。
   *
   * @param {string} [name] 组件或模块名，不传则返回全量大盘
   * @returns {object | null} 覆盖率数据
   */
  getCoverage(name) {
    if (!this.index.coverage) return null;
    if (!name) return this.index.coverage;

    const entry = this.resolveEntry(name);
    const targetId = entry ? entry.id : normalizeName(name).replace(/^y/, '');

    // 1. 优先精确匹配
    for (const pkg of this.index.coverage.packages || []) {
      for (const mod of pkg.modules || []) {
        if (mod.name.toLowerCase() === targetId.toLowerCase() || normalizeName(mod.name) === targetId) {
          return {
            package: pkg.title,
            module: mod,
            totalMetrics: this.index.coverage.totalMetrics,
          };
        }
      }
    }

    // 2. 兜底模糊匹配
    for (const pkg of this.index.coverage.packages || []) {
      for (const mod of pkg.modules || []) {
        if (
          mod.name.toLowerCase().includes(targetId.toLowerCase()) ||
          targetId.toLowerCase().includes(mod.name.toLowerCase())
        ) {
          return {
            package: pkg.title,
            module: mod,
            totalMetrics: this.index.coverage.totalMetrics,
          };
        }
      }
    }
    return null;
  }

  /**
   * 获取指定组件的测试覆盖率百分比与标签。
   *
   * @param {string} compId 组件 id（如 button, table）
   * @returns {string | null} 简要状态描述
   */
  getComponentCoveragePct(compId) {
    if (!this.index.coverage) return null;
    const target = normalizeName(compId).replace(/^y/, '');
    for (const pkg of this.index.coverage.packages || []) {
      for (const mod of pkg.modules || []) {
        if (normalizeName(mod.name) === target) {
          if (this.index.coverage.hasCoverageReport) {
            return `${mod.lines.pct}%`;
          }
          return mod.hasTest ? `${mod.testCount} 测` : '无单测';
        }
      }
    }
    return null;
  }

  /**
   * 提取 markdown 的指定二级章节（如 API）。
   *
   * @param {string} doc markdown 正文
   * @param {string} heading 章节名（匹配 "## <heading>" 前缀）
   * @returns {string | null} 章节内容（含标题），未找到返回 null
   */
  static extractSection(doc, heading) {
    const lines = doc.split(/\r?\n/);
    const start = lines.findIndex(
      line => line.startsWith('## ') && line.slice(3).trim().toLowerCase().startsWith(heading.toLowerCase())
    );
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('## ')) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n').trim();
  }

  /**
   * 将 markdown 按二级标题切成章节。
   *
   * @param {string} doc markdown 正文
   * @returns {Array<{heading: string, body: string}>} 章节列表
   */
  static splitSections(doc) {
    const sections = [];
    const lines = doc.split(/\r?\n/);
    let heading = '(开头)';
    let buffer = [];
    const flush = () => {
      if (buffer.length > 0) sections.push({ heading, body: buffer.join('\n').trim() });
      buffer = [];
    };
    for (const line of lines) {
      if (line.startsWith('## ')) {
        flush();
        heading = line.slice(3).trim();
      }
      buffer.push(line);
    }
    flush();
    return sections.filter(section => section.body.length > 0);
  }

  /**
   * 跨文档与 skills 的词法搜索。
   *
   * @param {string} query 查询语句（中文/英文/组件名均可）
   * @param {number} limit 返回条数
   * @returns {Array<{source: string, heading: string, score: number, snippet: string}>} 命中列表
   */
  search(query, limit = 5) {
    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];
    const hits = [];

    const scoreText = text => {
      const tokens = tokenize(text);
      let hit = 0;
      for (const token of queryTokens) {
        if (tokens.has(token)) hit += 1;
      }
      return hit / Math.sqrt(queryTokens.size);
    };

    for (const entry of this.index.entries) {
      const titleBoost = scoreText(entry.title) * 0.5;
      for (const section of DocStore.splitSections(entry.doc)) {
        const score = scoreText(`${section.heading}\n${section.body}`) + titleBoost;
        if (score > 0.3) {
          hits.push({
            source: `${entry.title}（${entry.link}）`,
            heading: section.heading,
            score,
            snippet: section.body.slice(0, 400),
          });
        }
      }
    }

    for (const skill of this.index.skills) {
      const score = scoreText(`${skill.name} ${skill.description}`) + scoreText(skill.content) * 0.6;
      if (score > 0.3) {
        hits.push({
          source: `skill: ${skill.name}`,
          heading: skill.description.slice(0, 60),
          score,
          snippet: skill.content.slice(0, 400),
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}

module.exports = { DocStore, tokenize, normalizeName };
