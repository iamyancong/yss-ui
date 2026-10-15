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
 * 校验 Markdown 相对链接。
 * 覆盖 ../xxx/SKILL.md、../xxx/references/... 等所有跨 skill 相对路径。
 *
 * @param {string} skillName 当前 skill 名称
 * @param {string} content Markdown 内容
 * @param {Set<string>} publicSkillSet 公开技能集合
 */
export function validateRelativeLinks(skillName, content, publicSkillSet) {
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

      // 1. 安全扫描
      scanFileSecurity(`${skillName}/${relPath}`, content);

      // 2. 链接检查（若是 Markdown）
      if (srcFile.endsWith('.md')) {
        validateRelativeLinks(skillName, content, publicSkillSet);
      }

      if (!dryRun) {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.writeFileSync(destFile, content, 'utf8');

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
      manifest.files[manifestRel] = calcSha256(srcFile);
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
