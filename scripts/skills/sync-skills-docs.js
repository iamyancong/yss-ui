/**
 * @description 同步 AI Skills 文档到 Dumi 文档目录
 * 功能：将 packages/skills 下的 SKILL.md 复制到 docs/skills/ 目录下
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const SOURCE_DIR = path.join(__dirname, '../../packages/skills');
const TARGET_DIR = path.join(__dirname, '../../docs/skills');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeFrontmatterForDumi(content, skillName) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) {
    return {
      body: content,
      frontmatterLines: ['title: ' + skillName, 'toc: content'],
      description: '',
    };
  }

  const frontmatter = fmMatch[1];
  const body = content.slice(fmMatch[0].length);
  const lines = frontmatter.split('\n').filter(Boolean);
  const descriptionMatch = frontmatter.match(/^\s*description:\s*(.+)$/m);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const hasToc = lines.some(function (line) {
    return /^toc\s*:/i.test(line.trim());
  });
  if (!hasToc) {
    lines.push('toc: content');
  }

  return { body: body, frontmatterLines: lines, description: description };
}

function injectDescription(body, description) {
  if (!description) return body.trimStart();

  const content = body.trimStart();
  const lines = content.split('\n');
  const firstNonEmpty = lines.findIndex(function (line) {
    return line.trim().length > 0;
  });

  if (firstNonEmpty >= 0 && /^#\s+/.test(lines[firstNonEmpty])) {
    lines.splice(firstNonEmpty + 1, 0, '', '> ' + description, '');
    return lines.join('\n');
  }

  return '> ' + description + '\n\n' + content;
}

/**
 * 将 Skill 源文档渲染为 Dumi 文档。
 *
 * @param {string} content Skill 源文档内容
 * @param {string} skillName Skill 目录名
 * @returns {string} 可写入 docs/skills 的完整内容
 */
function renderSkillDoc(content, skillName) {
  const normalized = normalizeFrontmatterForDumi(content, skillName);
  let rendered = normalized.body.replace(/```(ts|typescript|vue|js|javascript|json)(?!\s*\|\s*pure)/g, '```$1 | pure');
  rendered = injectDescription(rendered, normalized.description);
  return '---\n' + normalized.frontmatterLines.join('\n') + '\n---\n\n' + rendered.trimStart();
}

function readDirSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath);
}

function main() {
  console.log('🔄 开始同步 AI Skills 文档...');
  ensureDirSync(TARGET_DIR);

  const items = readDirSafe(SOURCE_DIR);
  const skills = [];

  for (const item of items) {
    if (item.startsWith('.') || item === 'package.json' || item === 'skills.config.json') continue;
    const skillPath = path.join(SOURCE_DIR, item);
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) continue;

    const skillMd = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    skills.push({ name: item, path: skillMd });
  }

  const expectedDocs = new Set(['index.md']);
  for (const skill of skills) {
    const targetFile = path.join(TARGET_DIR, skill.name + '.md');
    expectedDocs.add(skill.name + '.md');
    const sourceContent = fs.readFileSync(skill.path, 'utf8');
    const content = renderSkillDoc(sourceContent, skill.name);

    fs.writeFileSync(targetFile, content);
    console.log(chalk.green('✅ Synced: ' + skill.name));
  }

  const currentDocs = readDirSafe(TARGET_DIR);
  for (const file of currentDocs) {
    if (!file.endsWith('.md') || expectedDocs.has(file)) continue;
    fs.unlinkSync(path.join(TARGET_DIR, file));
    console.log(chalk.yellow('🗑 Removed stale doc: ' + file));
  }

  console.log('\n✨ Successfully synced ' + skills.length + ' skills to docs/skills/');
}

if (require.main === module || require.main?.filename === path.resolve(__dirname, "../sync-skills-docs.js")) {
  main();
}

module.exports = { renderSkillDoc };
