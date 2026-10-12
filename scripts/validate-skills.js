#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { renderSkillDoc } = require('./sync-skills-docs');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '..');

/** Skill 源码目录。 */
const SKILLS_DIR = path.join(ROOT_DIR, 'packages/skills');

/** Skill 的 Dumi 同步文档目录。 */
const DOCS_DIR = path.join(ROOT_DIR, 'docs/skills');

/** Skill 分类与同步配置。 */
const SKILLS_CONFIG_PATH = path.join(SKILLS_DIR, 'skills.config.json');

/** 每个 Skill 必须具备的仓库级标准章节。 */
const REQUIRED_SECTIONS = [
  '## 触发条件',
  '## 不适用场景',
  '## 硬约束（禁止/必须）',
  '## 标准代码骨架',
  '## 交付检查清单',
  '## 失败兜底策略',
];

/** Skill Creator 建议的单个 SKILL.md 最大行数。 */
const MAX_SKILL_LINES = 500;

/** 业务层禁止直接导入的 Formily UI 包。 */
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"]@formily\/antdv['"]/,
  /from\s+['"]@formily\/antd['"]/,
  /from\s+['"]@formily\/antd-v3['"]/,
];

/** 需要遵守全局 mutator 错误处理合同的 Skill 路径。 */
const API_ERROR_CONTRACT_PATHS = [
  'api-integration',
  'file-export-download',
  'page-form-module',
  'page-list-module',
  'page-skeleton',
  'yss-ui-business-page-generation',
];

/**
 * 递归收集目录中符合条件的文件。
 *
 * @param {string} dirPath 起始目录
 * @param {(filePath: string) => boolean} predicate 文件过滤函数
 * @returns {string[]} 文件绝对路径列表
 */
function collectFiles(dirPath, predicate) {
  const result = [];
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

/**
 * 读取仓库中的全部 Skill 目录名。
 *
 * @returns {string[]} 按字母序排列的 Skill 名称
 */
function getSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

/**
 * 解析只允许 name 和 description 的 Skill frontmatter。
 *
 * @param {string} content SKILL.md 内容
 * @returns {{data: Record<string, string>, keys: string[]} | null} frontmatter 结果
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const data = {};
  const keys = [];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      keys.push(line);
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    keys.push(key);
    data[key] = value;
  }
  return { data, keys };
}

/**
 * 校验全部 Skill 的 frontmatter、行数和标准章节。
 *
 * @param {string[]} skills Skill 名称列表
 * @param {string[]} errors 错误收集容器
 */
function checkSkillStructure(skills, errors) {
  for (const skill of skills) {
    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    const relativePath = path.relative(ROOT_DIR, skillPath);
    const content = fs.readFileSync(skillPath, 'utf8');
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter) {
      errors.push(`${relativePath} 缺少合法 frontmatter`);
      continue;
    }

    const uniqueKeys = Array.from(new Set(frontmatter.keys));
    if (
      frontmatter.keys.length !== 2 ||
      uniqueKeys.length !== 2 ||
      !uniqueKeys.includes('name') ||
      !uniqueKeys.includes('description')
    ) {
      errors.push(`${relativePath} frontmatter 只能包含 name 和 description`);
    }
    if (frontmatter.data.name !== skill) {
      errors.push(`${relativePath} 的 name 必须与目录名一致: ${skill}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.data.name || '')) {
      errors.push(`${relativePath} 的 name 必须使用小写字母、数字与中划线`);
    }
    if (!frontmatter.data.description || !/[\u4e00-\u9fff]/.test(frontmatter.data.description)) {
      errors.push(`${relativePath} 的 description 必须是包含触发场景的中文描述`);
    } else if (frontmatter.data.description.length < 100) {
      errors.push(
        `${relativePath} 的 description 必须不少于 100 字（当前 ${frontmatter.data.description.length} 字），需明确包含触发场景与不适用场景`
      );
    }
    if (content.split(/\r?\n/).length > MAX_SKILL_LINES) {
      errors.push(`${relativePath} 超过 ${MAX_SKILL_LINES} 行，请将详细示例拆到 references`);
    }
    for (const section of REQUIRED_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`${relativePath} 缺少必填段落: ${section}`);
      }
    }
  }
}

/**
 * 校验 Skill 分类、默认同步与排除列表。
 *
 * @param {string[]} skills Skill 名称列表
 * @param {string[]} errors 错误收集容器
 */
function checkSkillsConfig(skills, errors) {
  const config = JSON.parse(fs.readFileSync(SKILLS_CONFIG_PATH, 'utf8'));
  const categories = config.categories || {};
  const knownSkills = new Set(skills);
  const configuredSkills = new Set();

  if (config.primaryTarget !== '.agents/skills') {
    errors.push('skills.config.json primaryTarget 必须使用 Codex 标准项目目录 .agents/skills');
  }

  const symbolicLinks = config.symbolicLinks || [];
  if (!Array.isArray(symbolicLinks)) {
    errors.push('skills.config.json symbolicLinks 必须是数组');
  } else {
    if (symbolicLinks.includes(config.primaryTarget)) {
      errors.push('skills.config.json symbolicLinks 不得重复 primaryTarget');
    }
    if (!symbolicLinks.includes('.agent/skills')) {
      errors.push('skills.config.json symbolicLinks 必须保留 .agent/skills 兼容目录');
    }
  }

  const globalTargets = config.globalTargets || {};
  const globalTargetPaths = Object.values(globalTargets);
  if (globalTargets.agents !== '.agents/skills') {
    errors.push('skills.config.json globalTargets.agents 必须指向 .agents/skills');
  }
  if (globalTargetPaths.includes('.codex/skills')) {
    errors.push('skills.config.json globalTargets 不得再同步到旧的 .codex/skills');
  }
  if (new Set(globalTargetPaths).size !== globalTargetPaths.length) {
    errors.push('skills.config.json globalTargets 存在重复目标目录');
  }

  const deprecatedGlobalTargets = config.deprecatedGlobalTargets || {};
  for (const targetPath of Object.values(deprecatedGlobalTargets)) {
    if (globalTargetPaths.includes(targetPath)) {
      errors.push(`skills.config.json 废弃用户级目录仍在活跃目标中: ${targetPath}`);
    }
  }

  for (const [category, entries] of Object.entries(categories)) {
    if (!Array.isArray(entries)) {
      errors.push(`skills.config.json 的 categories.${category} 必须是数组`);
      continue;
    }
    for (const skill of entries) {
      if (!knownSkills.has(skill)) {
        errors.push(`skills.config.json 的 categories.${category} 引用不存在的 skill: ${skill}`);
      }
      configuredSkills.add(skill);
    }
  }

  const deprecatedSkills = new Set(config.deprecatedSkills || []);
  for (const skill of deprecatedSkills) {
    if (configuredSkills.has(skill)) {
      errors.push(`skills.config.json 已废弃 skill 不得出现在 categories 中: ${skill}`);
    }
  }

  for (const skill of skills) {
    if (!configuredSkills.has(skill) && !deprecatedSkills.has(skill)) {
      errors.push(`skills.config.json 未分类 skill: ${skill}`);
    }
  }
  for (const category of config.defaultSync || []) {
    if (!Object.prototype.hasOwnProperty.call(categories, category)) {
      errors.push(`skills.config.json defaultSync 引用不存在的分类: ${category}`);
    }
  }
  for (const skill of config.excludeFromDefaultSync || []) {
    if (!knownSkills.has(skill)) {
      errors.push(`skills.config.json excludeFromDefaultSync 引用不存在的 skill: ${skill}`);
    }
  }
}

/**
 * 校验 Markdown 中的禁用导入和相对文档链接。
 *
 * @param {string[]} errors 错误收集容器
 */
function checkMarkdownContent(errors) {
  const markdownFiles = collectFiles(SKILLS_DIR, filePath => filePath.endsWith('.md'));
  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(ROOT_DIR, filePath);

    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`${relativePath} 命中禁用导入: ${pattern}`);
      }
    }

    const linkPattern = /\[[^\]]*\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
    let match = linkPattern.exec(content);
    while (match) {
      const target = match[1].split('#')[0];
      if (!/^(?:https?:)?\/\//.test(target)) {
        const resolvedTarget = path.resolve(path.dirname(filePath), target);
        if (!fs.existsSync(resolvedTarget)) {
          errors.push(`${relativePath} 包含断链: ${match[1]}`);
        }
      }
      match = linkPattern.exec(content);
    }
  }
}

/**
 * 从 Markdown 中提取 JavaScript/TypeScript/Vue 代码块。
 *
 * @param {string} content Markdown 内容
 * @returns {string[]} 代码块列表
 */
function extractExecutableCodeBlocks(content) {
  const blocks = [];
  const pattern = /```(?:js|javascript|ts|typescript|vue)(?:\s*\|\s*pure)?[^\n]*\n([\s\S]*?)```/g;
  let match = pattern.exec(content);
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(content);
  }
  return blocks;
}

/**
 * 检查 API 示例是否违反 mutator 统一错误处理合同。
 *
 * @param {string[]} errors 错误收集容器
 */
function checkApiErrorContract(errors) {
  for (const relativeEntry of API_ERROR_CONTRACT_PATHS) {
    const entryPath = path.join(SKILLS_DIR, relativeEntry);
    const files = collectFiles(entryPath, filePath => /\.(?:md|ts|vue)$/.test(filePath));

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const codeBlocks = filePath.endsWith('.md') ? extractExecutableCodeBlocks(content) : [content];
      for (const code of codeBlocks) {
        const hasManualErrorMessage = /\bmessage\.error\s*\(/.test(code);
        const explicitlySkipsGlobalHandler = /\bskip(?:BusinessError|ErrorHandler)\s*:\s*true\b/.test(code);
        if (hasManualErrorMessage && !explicitlySkipsGlobalHandler) {
          errors.push(`${path.relative(ROOT_DIR, filePath)} 的请求示例重复 message.error，应交由 mutator 统一处理`);
          break;
        }
        if (/\bif\s*\([^)]*\b(?:res|response)(?:\?\.)?\.success\b/.test(code)) {
          errors.push(
            `${path.relative(ROOT_DIR, filePath)} 使用 if (res.success) 冗余判断，失败响应已由 mutator reject`
          );
          break;
        }
        if (/\bonError\s*:\s*[^\n]*\bmessage\.error\s*\(/.test(code)) {
          errors.push(`${path.relative(ROOT_DIR, filePath)} 在 onError 重复 message.error，应交由 mutator 统一处理`);
          break;
        }
      }
    }
  }
}

/**
 * 校验 Formily 系列 Skill 是否显式路由到分步表单策略。
 *
 * @param {string[]} errors 错误收集容器
 */
function checkFormilyStepPolicy(errors) {
  const formilySkills = [
    'formily-foundation',
    'formily-linkage-effects',
    'formily-mode-slot-detail',
    'formily-step-flow',
  ];
  for (const skill of formilySkills) {
    const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    if (!content.includes('formily-step-flow') && !content.includes('Steps')) {
      errors.push(`${path.relative(ROOT_DIR, skillPath)} 未声明分步表单默认策略`);
    }
  }
}

/**
 * 校验已存在的 agents/openai.yaml 与 Skill 名称一致。
 *
 * @param {string[]} skills Skill 名称列表
 * @param {string[]} errors 错误收集容器
 */
function checkAgentMetadata(skills, errors) {
  for (const skill of skills) {
    const metadataPath = path.join(SKILLS_DIR, skill, 'agents/openai.yaml');
    if (!fs.existsSync(metadataPath)) continue;
    const content = fs.readFileSync(metadataPath, 'utf8');
    for (const key of ['display_name', 'short_description', 'default_prompt']) {
      if (!new RegExp(`^\\s*${key}:\\s*"[^"]+"\\s*$`, 'm').test(content)) {
        errors.push(`${path.relative(ROOT_DIR, metadataPath)} 缺少加引号的 ${key}`);
      }
    }
    const shortDescription = content.match(/^\s*short_description:\s*"([^"]+)"\s*$/m)?.[1] || '';
    if (shortDescription.length < 25 || shortDescription.length > 64) {
      errors.push(`${path.relative(ROOT_DIR, metadataPath)} 的 short_description 必须为 25-64 个字符`);
    }
    if (!content.includes(`$${skill}`)) {
      errors.push(`${path.relative(ROOT_DIR, metadataPath)} 的 default_prompt 必须显式引用 $${skill}`);
    }
  }
}

/**
 * 校验 docs/skills 是否与 Skill 源文档精确同步。
 *
 * @param {string[]} skills Skill 名称列表
 * @param {string[]} errors 错误收集容器
 */
function checkDocsSync(skills, errors) {
  const expectedDocs = new Set(['index.md']);
  for (const skill of skills) {
    const sourcePath = path.join(SKILLS_DIR, skill, 'SKILL.md');
    const docPath = path.join(DOCS_DIR, `${skill}.md`);
    expectedDocs.add(`${skill}.md`);

    if (!fs.existsSync(docPath)) {
      errors.push(`缺少文档文件: ${path.relative(ROOT_DIR, docPath)}`);
      continue;
    }

    const source = fs.readFileSync(sourcePath, 'utf8');
    const actual = fs.readFileSync(docPath, 'utf8');
    const expected = renderSkillDoc(source, skill);
    if (actual !== expected) {
      errors.push(
        `${path.relative(ROOT_DIR, docPath)} 与 ${path.relative(ROOT_DIR, sourcePath)} 不同步，请运行 pnpm sync:skills-docs`
      );
    }
  }

  for (const file of fs.readdirSync(DOCS_DIR).filter(file => file.endsWith('.md'))) {
    if (!expectedDocs.has(file)) {
      errors.push(`发现过期技能文档: ${path.relative(ROOT_DIR, path.join(DOCS_DIR, file))}`);
    }
  }
}

/**
 * 校验 Skills 索引与 Dumi 业务导航是否覆盖已注册 Skill。
 *
 * @param {string[]} skills Skill 名称列表
 * @param {string[]} errors 错误收集容器
 */
function checkDocsNavigation(skills, errors) {
  const indexPath = path.join(DOCS_DIR, 'index.md');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  for (const skill of skills) {
    if (!indexContent.includes(`./${skill}.md`)) {
      errors.push(`${path.relative(ROOT_DIR, indexPath)} 缺少 skill 入口: ${skill}`);
    }
  }

  const config = JSON.parse(fs.readFileSync(SKILLS_CONFIG_PATH, 'utf8'));
  const appSkills = config.categories?.app || [];
  const dumiConfigPath = path.join(ROOT_DIR, '.dumirc.ts');
  const dumiConfig = fs.readFileSync(dumiConfigPath, 'utf8');
  for (const skill of appSkills) {
    if (!dumiConfig.includes(`link: '/skills/${skill}'`)) {
      errors.push(`${path.relative(ROOT_DIR, dumiConfigPath)} 业务导航缺少 skill: ${skill}`);
    }
  }
}

/** 执行全量 Skill 校验。 */
function main() {
  const errors = [];
  const skills = getSkills();

  checkSkillStructure(skills, errors);
  checkSkillsConfig(skills, errors);
  checkMarkdownContent(errors);
  checkApiErrorContract(errors);
  checkFormilyStepPolicy(errors);
  checkAgentMetadata(skills, errors);
  checkDocsSync(skills, errors);
  checkDocsNavigation(skills, errors);

  if (errors.length > 0) {
    console.error('❌ Skills 校验失败:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`✅ Skills 校验通过，共检查 ${skills.length} 个 skill。`);
}

main();
