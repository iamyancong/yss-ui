#!/usr/bin/env node

/**
 * skills.sh 公开分发导出流水线脚本。
 *
 * 核心逻辑：
 * 1. 动态白名单计算：以 packages/skills/skills.config.json 的 categories.app 为基准，
 * 2. 导出内嵌安全扫描：零容忍敏感信息（不认任何行内豁免），严格阻断私网 IP、内部系统域名与凭据。
 * 4. 链接完整性校验：验证 Markdown 内部相对链接的目标均在公开导出集合内。
 * 5. 生成 skills/MANIFEST.json：记录每文件 sha256、commit SHA 与版本。
 *
 * 用法：
 *   node scripts/export-skills-sh.mjs [--out-dir <dir>] [--dry-run] [--clean]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const SKILLS_SRC_DIR = path.join(ROOT_DIR, 'packages/skills');
export const SKILLS_CONFIG_PATH = path.join(SKILLS_SRC_DIR, 'skills.config.json');
export const SKILLS_PKG_PATH = path.join(SKILLS_SRC_DIR, 'package.json');

/** 显式排除的 skills（业务不适宜公开或维护类） */
export const EXCLUDED_SKILLS = new Set([
  'java-backend-commit', // 后端提交规范，不进前端分发仓
  'yss-create-microapp', // 离线兜底，仅内部 sync:skills 分发
]);

/** 敏感内容扫描正则规则（采用拼接写法，严禁在源码中暴露明文字符串） */
export const SENSITIVE_PATTERNS = [
  {
    rx: /(?<![\w.-])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?![\w.-])/,
    label: '内网/私有 IP 地址',
  },
  {
    rx: new RegExp('(?:[a-zA-Z0-9_-]+\\.)*' + 'dm' + '\\.com', 'i'),
    label: '内部系统或主域名',
  },
  {
    rx: /_authToken\s*=|npmToken\.[a-zA-Z0-9_\-]+/i,
    label: '敏感认证 Token',
  },
];

/**
 * 动态计算待导出的公开 skills 白名单。
 *
 * @param {string} [configPath] skills.config.json 路径
 * @returns {string[]} 白名单 skill 名称数组
 */
export function resolvePublicSkills(configPath = SKILLS_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`找不到技能配置文件: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const deprecated = new Set(config.deprecatedSkills || []);
  const library = new Set(config.categories?.library || []);
  const appSkills = config.categories?.app || [];

  const list = appSkills.filter(name => {
    if (deprecated.has(name)) return false;
    if (library.has(name)) return false;
    if (EXCLUDED_SKILLS.has(name)) return false;
    return true;
  });

  // 去重并排序
  return Array.from(new Set(list)).sort();
}

/**
 * 动态计算全部未公开或被排除的 skills 集合。
 *
 * @param {string} [configPath] skills.config.json 路径
 * @returns {Set<string>} 非公开 skill 名称集合
 */
export function resolveNonPublicSkills(configPath = SKILLS_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`找不到技能配置文件: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const allKnown = new Set([
    ...(config.categories?.library || []),
    ...(config.categories?.app || []),
    ...(config.categories?.hooks || []),
    ...(config.categories?.universal || []),
    ...(config.deprecatedSkills || []),
    ...EXCLUDED_SKILLS,
  ]);
  const publicSkills = new Set(resolvePublicSkills(configPath));
  const nonPublic = new Set();
  for (const name of allKnown) {
    if (!publicSkills.has(name)) {
      nonPublic.add(name);
    }
  }
  return nonPublic;
}

/**
 * 扫描文本中的敏感内容，对外导出时零容忍（不认 skillscan:allow 豁免）。
 *
 * @param {string} filePath 相对文件路径
 * @param {string} content 文本内容
 */
export function scanFileSecurity(filePath, content) {
  const lines = content.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    // 对外导出不认任何行内豁免，防止私有 IP 或域名带 allow 标签被带入公开仓
    for (const pat of SENSITIVE_PATTERNS) {
      if (pat.rx.test(line)) {
        throw new Error(
          `[安全门禁拦截] 文件 ${filePath}:${idx + 1} 检测到 ${pat.label}：\n> ${line.trim().slice(0, 120)}`
        );
      }
    }
  }
}

/**
 * 计算文件 SHA-256 哈希。
 *
 * @param {string} filePath 文件绝对路径
 * @returns {string} sha256 字符串
 */
export function calcSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 递归收集目录下的文件。
 *
 * @param {string} dir 目录
 * @param {string[]} [allowedSubdirs] 允许拷贝的子目录名
 * @returns {string[]} 文件绝对路径
 */
export function collectExportFiles(dir, allowedSubdirs = ['references', 'scripts', 'agents', 'examples']) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (allowedSubdirs.includes(entry.name)) {
        files.push(...collectNestedFiles(fullPath));
      }
    } else if (entry.isFile()) {
      if (entry.name === 'SKILL.md') {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function collectNestedFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectNestedFiles(full));
    } else if (entry.isFile()) {
      // 排除常见临时文件
      if (entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
      result.push(full);
    }
  }
  return result;
}

/**
 * 校验 Markdown 相对链接与跨 Skill 引用路径。
 * 覆盖 Markdown 链接 [text](../xxx/...)、反引号 `../xxx/...` 与裸路径等所有跨 skill 相对路径。
 *
 * @param {string} skillName 当前 skill 名称
 * @param {string} content Markdown 内容
 * @param {Set<string>} publicSkillSet 公开技能集合
 */
export function validateRelativeLinks(skillName, content, publicSkillSet) {
  // 1. 扫描标准 Markdown 超链接
  const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1].trim();
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('mailto:')) {
      continue;
    }
    // 跨 skill 引用相对路径形如 ../<other-skill>/...（包含 SKILL.md 与 references 等）
    const crossSkillMatch = href.match(/^\.\.\/([^/#?]+)(?:\/([^#?]+))?/);
    if (crossSkillMatch) {
      const targetSkill = crossSkillMatch[1];
      if (!publicSkillSet.has(targetSkill)) {
        throw new Error(
          `[链接校验失败] ${skillName} 引用了未公开或被排除的 Skill: ${targetSkill} (href: ${href})`
        );
      }
      // 进一步校验被引用的目标文件在 packages/skills/<targetSkill>/... 中物理存在
      const subPath = crossSkillMatch[2] || 'SKILL.md';
      const targetFullPath = path.join(SKILLS_SRC_DIR, targetSkill, subPath);
      if (!fs.existsSync(targetFullPath)) {
        throw new Error(
          `[链接校验失败] ${skillName} 存在断链，目标文件不存在: ${targetSkill}/${subPath} (href: ${href})`
        );
      }
    }
  }

  // 2. 额外扫描反引号与裸文本中的跨 skill 引用（形如 `../<skill>/...` 或裸 ../<skill>/...）
  // 覆盖 SKILL.md 以及 references/、scripts/、agents/、examples/ 等全部随 Skill 分发的子目录
  const crossSkillRegex =
    /(?:`\.\.\/([a-zA-Z0-9_-]+)\/(SKILL\.md|(?:references|scripts|agents|examples)\/[^`]+)`)|(?:\.\.\/([a-zA-Z0-9_-]+)\/(SKILL\.md|(?:references|scripts|agents|examples)\/[^\s)`"'，；。！？!?]+))/g;
  let refMatch;
  while ((refMatch = crossSkillRegex.exec(content)) !== null) {
    const targetSkill = refMatch[1] || refMatch[3];
    const subPath = refMatch[2] || refMatch[4];
    const fullMatched = refMatch[0];

    if (!publicSkillSet.has(targetSkill)) {
      throw new Error(
        `[链接校验失败] ${skillName} 引用了未公开或被排除的 Skill: ${targetSkill} (path: ${fullMatched})`
      );
    }
    const targetFullPath = path.join(SKILLS_SRC_DIR, targetSkill, subPath);
    if (!fs.existsSync(targetFullPath)) {
      throw new Error(
        `[链接校验失败] ${skillName} 存在断链，目标文件不存在: ${targetSkill}/${subPath} (path: ${fullMatched})`
      );
    }
  }
}

/**
 * 对外导出时对 Markdown 内容进行净化。
 * 将指向未公开或被排除 Skill 的相对路径改写为统一纯文字，
 * 既保障 packages/skills 内部可用性（方案 A），又杜绝公开分发断链。
 *
 * @param {string} content Markdown 内容
 * @param {Set<string>} publicSkillSet 公开技能集合
 * @returns {string} 净化后的 Markdown 内容
 */
export function sanitizeExportContent(content, publicSkillSet) {
  // 1. 处理反引号包裹的跨 skill 相对路径（如：使用 `../commit-linting/SKILL.md`）
  let result = content.replace(
    /(使用|请使用|转交)?\s*`\.\.\/([a-zA-Z0-9_-]+)\/(?:SKILL\.md|(?:references|scripts|agents|examples)\/[^`]+)`/g,
    (match, verb, targetSkill) => {
      if (!publicSkillSet.has(targetSkill)) {
        const prefix = verb ? `${verb}` : '';
        return `${prefix}内部维护 Skill \`${targetSkill}\`（仅内部 sync:skills 分发可用）`;
      }
      return match;
    }
  );

  // 2. 处理标准 Markdown 超链接（如：[xxx](../component-development/SKILL.md)）
  result = result.replace(
    /\[([^\]]+)\]\(\.\.\/([a-zA-Z0-9_-]+)\/(?:SKILL\.md|(?:references|scripts|agents|examples)\/[^)#\s]+)\)/g,
    (match, linkText, targetSkill) => {
      if (!publicSkillSet.has(targetSkill)) {
        return `${linkText}（内部维护 Skill \`${targetSkill}\`，仅内部 sync:skills 分发可用）`;
      }
      return match;
    }
  );

  // 3. 处理裸跨 skill 相对路径
  result = result.replace(
    /(使用|请使用|转交)?\s*(?<![`a-zA-Z0-9_.-])\.\.\/([a-zA-Z0-9_-]+)\/(?:SKILL\.md|(?:references|scripts|agents|examples)\/[^\s)`"'，；。！？!?]+)/g,
    (match, verb, targetSkill) => {
      if (!publicSkillSet.has(targetSkill)) {
        const prefix = verb ? `${verb}` : '';
        return `${prefix}内部维护 Skill \`${targetSkill}\`（仅内部 sync:skills 分发可用）`;
      }
      return match;
    }
  );

  return result;
}

/**
 * 从 Markdown frontmatter 中提取 description 文本，支持单行及 YAML 多行/折行写法。
 *
 * @param {string} content Markdown 内容
 * @returns {string} 提取到的 description 文本
 */
export function extractFrontmatterDescription(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmMatch) return '';
  const lines = fmMatch[1].split(/\r?\n/);
  let collecting = false;
  const descLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!collecting) {
      if (/^description\s*:/i.test(trimmed)) {
        collecting = true;
        const inlineVal = trimmed.replace(/^description\s*:\s*[>|]?-?\s*/i, '');
        if (inlineVal) descLines.push(inlineVal);
      }
    } else {
      if (/^[a-zA-Z0-9_-]+\s*:/i.test(line)) {
        break;
      }
      if (trimmed) descLines.push(trimmed);
    }
  }
  return descLines.join(' ').replace(/^['"]|['"]$/g, '').trim();
}

/**
 * 校验 Skill 的 frontmatter description，禁止出现未公开或被排除的 Skill 名称。
 *
 * @param {string} skillName 当前 skill 名称
 * @param {string} content Markdown 内容
 * @param {Set<string>} nonPublicSkills 非公开技能集合
 */
export function validateSkillDescription(skillName, content, nonPublicSkills) {
  const description = extractFrontmatterDescription(content);
  if (!description) return;

  for (const nonPublic of nonPublicSkills) {
    const regex = new RegExp(`(?<![a-zA-Z0-9_-])${nonPublic}(?![a-zA-Z0-9_-])`);
    if (regex.test(description)) {
      throw new Error(
        `[描述校验失败] ${skillName} 的 frontmatter description 中引用了未公开的 Skill: ${nonPublic}`
      );
    }
  }
}

/**
 * 执行 skills.sh 导出任务。
 *
 * @param {object} options 选项
 * @param {string} [options.outDir] 目标输出目录
 * @param {boolean} [options.dryRun] 是否仅预检
 * @param {boolean} [options.clean] 是否清空目标目录
 * @returns {object} 导出报告
 */
export function runExport(options = {}) {
  const outDir = path.resolve(options.outDir || path.join(ROOT_DIR, 'tmp/skills-export'));
  const dryRun = Boolean(options.dryRun);
  const clean = Boolean(options.clean);

  const publicSkills = resolvePublicSkills();
  const publicSkillSet = new Set(publicSkills);
  const nonPublicSkillSet = resolveNonPublicSkills();

  console.log(`[export-skills-sh] 解析出 ${publicSkills.length} 个公开白名单 Skills...`);

  // 获取 Git Commit 与 Version
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch {
    // 允许在非 git 环境 fallback
  }

  let pkgVersion = '1.0.0';
  if (fs.existsSync(SKILLS_PKG_PATH)) {
    pkgVersion = JSON.parse(fs.readFileSync(SKILLS_PKG_PATH, 'utf8')).version || pkgVersion;
  }

  const manifest = {
    version: pkgVersion,
    gitCommit,
    generatedAt: new Date().toISOString(),
    skillsCount: publicSkills.length,
    skills: publicSkills,
    files: {},
  };

  if (!dryRun) {
    if (clean && fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(outDir, 'skills'), { recursive: true });
  }

  let totalFilesCopied = 0;

  for (const skillName of publicSkills) {
    const srcSkillDir = path.join(SKILLS_SRC_DIR, skillName);
    if (!fs.existsSync(srcSkillDir)) {
      throw new Error(`公开白名单中的 Skill 目录不存在: ${srcSkillDir}`);
    }

    const filesToCopy = collectExportFiles(srcSkillDir);
    const destSkillDir = path.join(outDir, 'skills', skillName);

    for (const srcFile of filesToCopy) {
      const relPath = path.relative(srcSkillDir, srcFile);
      const destFile = path.join(destSkillDir, relPath);

      const content = fs.readFileSync(srcFile, 'utf8');

      // 1. 安全扫描（对原始源文件进行敏感信息扫描）
      scanFileSecurity(`${skillName}/${relPath}`, content);

      // 2. 导出内容净化与门禁校验（若是 Markdown）
      let exportContent = content;
      if (srcFile.endsWith('.md')) {
        exportContent = sanitizeExportContent(content, publicSkillSet);
        validateRelativeLinks(skillName, exportContent, publicSkillSet);
        validateSkillDescription(skillName, exportContent, nonPublicSkillSet);
      }

      if (!dryRun) {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.writeFileSync(destFile, exportContent, 'utf8');

        // 保持可执行权限
        if (srcFile.endsWith('.mjs') || srcFile.endsWith('.sh') || srcFile.endsWith('.js')) {
          try {
            const stat = fs.statSync(srcFile);
            fs.chmodSync(destFile, stat.mode);
          } catch {
            // 忽略权限复制异常
          }
        }
      }

      const manifestRel = `skills/${skillName}/${relPath}`;
      manifest.files[manifestRel] = crypto.createHash('sha256').update(exportContent).digest('hex');
      totalFilesCopied += 1;
    }
  }

  if (!dryRun) {
    // 写入 MANIFEST.json
    const manifestPath = path.join(outDir, 'skills/MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 写入基础 README.md 与 LICENSE
    const readmeContent = `# YSS UI Official AI Skills\n\nOfficial public skills for YSS micro-frontend ecosystem, indexed by [skills.sh](https://www.skills.sh).\n\n## Installation\n\n\`\`\`bash\nnpx skills add iamyancong/yss-ui-skills --skill '*' -y\n\`\`\`\n\nTotal Skills: ${publicSkills.length}\n`;
    fs.writeFileSync(path.join(outDir, 'README.md'), readmeContent, 'utf8');

    const licenseSrc = path.join(ROOT_DIR, 'LICENSE');
    if (fs.existsSync(licenseSrc)) {
      fs.copyFileSync(licenseSrc, path.join(outDir, 'LICENSE'));
    }
  }

  console.log(`[export-skills-sh] 成功处理 ${publicSkills.length} 个 Skills, 共 ${totalFilesCopied} 个文件。`);
  if (dryRun) {
    console.log('[export-skills-sh] (Dry Run 模式，未实际写盘)');
  } else {
    console.log(`[export-skills-sh] 导出产物位于: ${outDir}`);
  }

  return {
    skillsCount: publicSkills.length,
    filesCount: totalFilesCopied,
    manifest,
  };
}

// 命令行直接执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clean = args.includes('--clean');
  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx !== -1 ? args[outDirIdx + 1] : undefined;

  try {
    runExport({ dryRun, clean, outDir });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
