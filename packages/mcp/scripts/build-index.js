#!/usr/bin/env node

/**
 * 构建 @yss/mcp 的文档索引快照（data/index.json）。
 *
 * 数据源与 scripts/generate-llms.js 同源：.dumirc.ts sidebar 枚举
 * 组件 / Hooks / 工具函数文档，packages/skills 提供技能内容，
 * .cursorrules 提供代码生成硬规则。索引随包发布，版本与组件库对齐，
 * 业务项目安装后 MCP Server 零网络、零仓库依赖即可回答查询。
 *
 * 只能在 yss-ui 仓库内运行（依赖仓库 devDependencies 的 esbuild-register）。
 */

const fs = require('fs');
const path = require('path');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '../../..');

/** 文档目录。 */
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

/** Skill 源码目录。 */
const SKILLS_DIR = path.join(ROOT_DIR, 'packages/skills');

/** 索引输出路径。 */
const OUTPUT_PATH = path.join(__dirname, '../data/index.json');

const { register } = require('esbuild-register/dist/node');
register({ target: 'node16' });
// eslint-disable-next-line import/no-unresolved
const dumiConfig = require(path.join(ROOT_DIR, '.dumirc.ts')).default;

/**
 * 移除 markdown frontmatter。
 *
 * @param {string} content markdown 内容
 * @returns {string} 正文
 */
function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

/**
 * Dumi link 转文档文件路径（与 generate-llms.js 保持一致）。
 *
 * @param {string} link Dumi link（如 /components/edit-table）
 * @returns {string} markdown 绝对路径
 */
function linkToFilePath(link) {
  const [category, ...rest] = link.replace(/^\//, '').split('/');
  const fileName = rest.join('/');

  const directPath = path.join(DOCS_DIR, category, `${fileName}.md`);
  if (fs.existsSync(directPath)) return directPath;

  if (category === 'hooks') {
    const camelCaseName = fileName
      .split('-')
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
    return path.join(DOCS_DIR, category, `${camelCaseName}.md`);
  }

  const camelCaseFileName = fileName
    .split('/')
    .map(segment => segment.replace(/-([a-z])/g, (_, char) => char.toUpperCase()))
    .join('/');
  return path.join(DOCS_DIR, category, `${camelCaseFileName}.md`);
}

/**
 * 递归读取目录下全部文本文件。
 *
 * @param {string} dirPath 目录绝对路径
 * @param {string} baseDir 相对化基准目录
 * @returns {Array<{path: string, content: string}>} 文件列表
 */
function readDirFiles(dirPath, baseDir) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirFiles(fullPath, baseDir));
      continue;
    }
    if (!/\.(?:vue|ts|tsx|js|jsx|less|css|md|json)$/.test(entry.name)) continue;
    files.push({ path: path.relative(baseDir, fullPath), content: fs.readFileSync(fullPath, 'utf8') });
  }
  return files;
}

/**
 * 从文档 markdown 中提取 demo 引用（<code src="./demos/..."> 标签）。
 *
 * @param {string} content markdown 内容
 * @param {string} mdPath markdown 文件绝对路径
 * @returns {Array<{id: string, title: string, files: Array<{path: string, content: string}>}>} demo 列表
 */
function extractDemos(content, mdPath) {
  const demos = [];
  const seen = new Set();
  const codeTag = /<code\b([^>]*)>/g;
  let match = codeTag.exec(content);
  while (match) {
    const attrs = match[1];
    const src = attrs.match(/src="([^"]+)"/)?.[1];
    const title = attrs.match(/title="([^"]+)"/)?.[1] || '';
    if (src) {
      const entryPath = path.resolve(path.dirname(mdPath), src);
      const demosRoot = path.join(path.dirname(mdPath), 'demos');
      // 目录式 demo（basic/index.vue）收录整个目录；平铺单文件 demo（basic.vue）只收录该文件
      const isDirDemo = path.basename(entryPath) === 'index.vue';
      const id = path
        .relative(demosRoot, isDirDemo ? path.dirname(entryPath) : entryPath)
        .replace(/\.vue$/, '')
        .split(path.sep)
        .join('/');
      if (!seen.has(id)) {
        seen.add(id);
        const files = isDirDemo
          ? readDirFiles(path.dirname(entryPath), path.dirname(entryPath))
          : [
              {
                path: path.basename(entryPath),
                content: fs.existsSync(entryPath) ? fs.readFileSync(entryPath, 'utf8') : '',
              },
            ];
        demos.push({ id, title, files });
      }
    }
    match = codeTag.exec(content);
  }
  return demos;
}

/**
 * 从 sidebar 分类配置构建文档条目。
 *
 * @param {Array} sidebarConfig sidebar 配置数组
 * @param {string} type 条目类型（component/hook/util）
 * @returns {Array<object>} 文档条目
 */
function buildEntries(sidebarConfig, type) {
  const entries = [];
  for (const category of sidebarConfig || []) {
    for (const item of category.children || []) {
      if (item.link.endsWith('/hooks')) continue; // 跳过介绍页
      const mdPath = linkToFilePath(item.link);
      if (!fs.existsSync(mdPath)) {
        console.warn(`WARN 文档缺失: ${item.link} -> ${path.relative(ROOT_DIR, mdPath)}`);
        continue;
      }
      const raw = fs.readFileSync(mdPath, 'utf8');
      const doc = stripFrontmatter(raw);
      entries.push({
        type,
        id: item.link.split('/').pop(),
        link: item.link,
        title: item.title,
        category: category.title,
        doc,
        demos: extractDemos(doc, mdPath),
      });
    }
  }
  return entries;
}

/**
 * 读取全部 skill（按 skills.config.json 分类）。
 *
 * @returns {Array<{name: string, category: string, description: string, content: string}>} skill 列表
 */
function buildSkills() {
  const config = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, 'skills.config.json'), 'utf8'));
  const categoryOf = {};
  for (const [category, skills] of Object.entries(config.categories || {})) {
    for (const skill of skills || []) {
      if (!categoryOf[skill]) categoryOf[skill] = category;
    }
  }

  const skills = [];
  for (const entry of fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf8');
    skills.push({
      name: entry.name,
      category: categoryOf[entry.name] || 'other',
      description: content.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '',
      content: stripFrontmatter(content),
    });
  }
  return skills;
}

/** 构建索引并写入 data/index.json。 */
function main() {
  const sidebar = dumiConfig.themeConfig.sidebar || {};

  // 1. 提取组件 Schema 字典
  let schemas = {};
  try {
    const { generateSchemas } = require('./generate-schemas');
    schemas = generateSchemas();
  } catch (err) {
    console.warn('⚠️ 生成组件 schemas 失败，尝试读取已有 schemas.json:', err.message);
    const schemasPath = path.join(__dirname, '../data/schemas.json');
    if (fs.existsSync(schemasPath)) {
      schemas = JSON.parse(fs.readFileSync(schemasPath, 'utf8'));
    }
  }

  // 2. 读取 coverage 矩阵快照
  let coverage = null;
  const coveragePath = path.join(__dirname, '../data/coverage-summary.json');
  if (fs.existsSync(coveragePath)) {
    try {
      coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    } catch (e) {
      console.warn('⚠️ 读取 coverage-summary.json 快照失败:', e.message);
    }
  }

  const index = {
    generatedAt: new Date().toISOString(),
    componentsVersion: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'packages/components/package.json'), 'utf8'))
      .version,
    entries: [
      ...buildEntries(sidebar['/components'], 'component'),
      ...buildEntries(sidebar['/hooks'], 'hook'),
      ...buildEntries(sidebar['/utils'], 'util'),
    ],
    skills: buildSkills(),
    codegenRules: fs.readFileSync(path.join(ROOT_DIR, '.cursorrules'), 'utf8'),
    schemas,
    coverage,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index), 'utf8');

  const size = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  const demoCount = index.entries.reduce((sum, entry) => sum + entry.demos.length, 0);
  const schemaCount = Object.keys(index.schemas || {}).length;
  console.log(
    `✅ 已生成索引: ${index.entries.length} 个文档条目（${demoCount} 个 demo、${schemaCount} 个 Schema）、${index.skills.length} 个 skill，共 ${size} KB`
  );
  console.log(`   -> ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

main();
