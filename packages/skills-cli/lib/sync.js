const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');
const os = require('os');
const tar = require('tar');

// Registry configuration
const REGISTRY = process.env.YSS_SKILLS_REGISTRY || 'https://registry.npmjs.org/';
const LOCAL_SKILLS_SOURCE = path.resolve(__dirname, '../../skills');
const SYNC_MANIFEST = '.yss-skills-manifest.json';
const DEFAULT_PRIMARY_TARGET = '.agents/skills';

/**
 * Download and extract the latest @yss-ui/skills package
 */
async function downloadLatestSkills() {
  const tmpDir = path.join(os.tmpdir(), 'yss-skills-update', Date.now().toString());
  await fs.ensureDir(tmpDir);

  console.log(chalk.blue(`🔍 Checking for latest @yss-ui/skills...`));

  try {
    // 1. Download tarball using npm pack
    // Using npm pack because it handles auth tokens in .npmrc automatically
    // We specify registry explicitly to be safe, or rely on user config
    // Note: 'npm pack' downloads to current directory, so we change cwd
    const cmd = REGISTRY ? `npm pack @yss-ui/skills --registry=${REGISTRY}` : `npm pack @yss-ui/skills`;

    // Check if npm is available
    try {
      execSync('npm --version', { stdio: 'ignore' });
    } catch (e) {
      throw new Error('npm is required to download skills. Please install npm.');
    }

    if (REGISTRY) {
      console.log(chalk.dim(`Downloading from ${REGISTRY}...`));
    }

    // Execute pack in temp dir
    const fileName = execSync(cmd, { cwd: tmpDir, encoding: 'utf8' }).trim();
    const tarballPath = path.join(tmpDir, fileName);

    if (!fs.existsSync(tarballPath)) {
      throw new Error('Download failed: Tarball not found');
    }

    console.log(chalk.green(`✅ Downloaded: ${fileName}`));

    // 2. Extract tarball
    const extractDir = path.join(tmpDir, 'package'); // npm pack extracts to 'package' folder usually
    await fs.ensureDir(extractDir);

    await tar.x({
      file: tarballPath,
      cwd: tmpDir, // Extract into tmpDir, it usually creates a 'package' subdir
    });

    const finalSource = path.join(tmpDir, 'package');
    return finalSource;
  } catch (err) {
    // Clean up on error
    await fs.remove(tmpDir);
    throw err;
  }
}

/**
 * 读取路径状态，并兼容不存在或失效的符号链接。
 *
 * @param {string} targetPath 目标路径
 * @returns {Promise<import('fs').Stats | null>} 路径状态
 */
async function lstatOrNull(targetPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 将 Skill 根目录转为可写入 Markdown 与规则文件的跨平台路径。
 *
 * @param {string} skillRoot Skill 根目录
 * @returns {string} 使用正斜杠且无末尾斜杠的路径
 */
function normalizeSkillRoot(skillRoot) {
  return skillRoot.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * 判断清单中的 Skill 名称是否可安全拼接到目标目录。
 *
 * @param {unknown} skill Skill 名称
 * @returns {skill is string} 是否为安全的小写短横线名称
 */
function isSafeSkillName(skill) {
  return typeof skill === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(skill);
}

/**
 * 判断兼容目录是否已经能够解析到主 Skills 目录中的全部托管项。
 *
 * @param {string} sourceRoot 主 Skills 目录
 * @param {string} targetRoot 待检查的兼容目录
 * @param {string[]} skills 托管 Skill 名称
 * @returns {Promise<boolean>} 是否全部解析到主目录
 */
async function resolvesManagedSkillsFrom(sourceRoot, targetRoot, skills) {
  if (skills.length === 0) return false;

  for (const skill of skills) {
    try {
      const [sourceSkill, targetSkill] = await Promise.all([
        fs.realpath(path.join(sourceRoot, skill)),
        fs.realpath(path.join(targetRoot, skill)),
      ]);
      if (sourceSkill !== targetSkill) return false;
    } catch (_) {
      return false;
    }
  }

  return true;
}

/**
 * 清理由旧版 CLI 清单管理的 Skills，保留目标目录中的第三方内容。
 *
 * @param {string} targetRoot 已废弃的用户级 Skills 目录
 * @param {string} label 日志标签
 * @returns {Promise<number>} 删除的托管 Skill 数量
 */
async function cleanupManagedSkillTarget(targetRoot, label) {
  const manifestPath = path.join(targetRoot, SYNC_MANIFEST);
  if (!(await lstatOrNull(manifestPath))) return 0;

  let manifest;
  try {
    manifest = await fs.readJson(manifestPath);
  } catch (error) {
    console.warn(chalk.yellow(`  ⚠ ${label}: invalid ${SYNC_MANIFEST}; skipped cleanup.`));
    return 0;
  }

  const managedSkills = Array.isArray(manifest.skills) ? manifest.skills.filter(isSafeSkillName) : [];
  let removed = 0;
  for (const skill of managedSkills) {
    const targetSkill = path.join(targetRoot, skill);
    if (!(await lstatOrNull(targetSkill))) continue;
    await fs.remove(targetSkill);
    removed += 1;
    console.log(chalk.dim(`  - ${label}: removed legacy managed ${skill}`));
  }

  await fs.remove(manifestPath);
  return removed;
}

/**
 * 将指定 Skills 安全同步到目标目录，只更新同名项并保留其他来源的 Skills。
 *
 * @param {string} sourceRoot Skills 源目录
 * @param {string} targetRoot 目标 Skills 目录
 * @param {string[]} skills 要同步的 Skill 名称
 * @param {{ link?: boolean, label?: string, deprecatedSkills?: string[], writeManifest?: boolean }} [options] 同步选项
 */
async function syncSkillEntries(sourceRoot, targetRoot, skills, options = {}) {
  const useLinks = Boolean(options.link) && os.platform() !== 'win32';
  const label = options.label || targetRoot;
  const deprecatedSkills = options.deprecatedSkills || [];
  const manifestPath = path.join(targetRoot, SYNC_MANIFEST);
  let previouslyManaged = [];

  await fs.ensureDir(targetRoot);

  if (options.writeManifest) {
    try {
      const manifest = await fs.readJson(manifestPath);
      previouslyManaged = Array.isArray(manifest.skills) ? manifest.skills.filter(isSafeSkillName) : [];
    } catch (_) {}
  }

  const staleSkills = Array.from(new Set([...deprecatedSkills, ...previouslyManaged]))
    .filter(isSafeSkillName)
    .filter(skill => !skills.includes(skill));
  for (const skill of staleSkills) {
    const stalePath = path.join(targetRoot, skill);
    if (await lstatOrNull(stalePath)) {
      await fs.remove(stalePath);
      console.log(chalk.dim(`  - ${label}: removed deprecated ${skill}`));
    }
  }

  for (const skill of skills) {
    const sourceSkill = path.join(sourceRoot, skill);
    const targetSkill = path.join(targetRoot, skill);
    const targetStats = await lstatOrNull(targetSkill);

    if (useLinks) {
      const expectedTarget = path.resolve(sourceSkill);
      if (targetStats?.isSymbolicLink()) {
        const currentLink = await fs.readlink(targetSkill);
        const currentTarget = path.resolve(path.dirname(targetSkill), currentLink);
        if (currentTarget === expectedTarget) {
          console.log(chalk.dim(`  ✓ ${label}: ${skill} (already linked)`));
          continue;
        }
      }

      if (targetStats) await fs.remove(targetSkill);
      const relativeTarget = path.relative(path.dirname(targetSkill), sourceSkill);
      await fs.symlink(relativeTarget, targetSkill, 'dir');
      console.log(chalk.green(`  ✓ ${label}: ${skill} -> ${relativeTarget}`));
      continue;
    }

    if (targetStats) await fs.remove(targetSkill);
    await fs.copy(sourceSkill, targetSkill, { overwrite: true });
    console.log(chalk.green(`  ✓ ${label}: ${skill} (copied)`));
  }

  if (options.writeManifest) {
    await fs.writeJson(
      manifestPath,
      {
        source: useLinks ? path.resolve(sourceRoot) : '@yss-ui/skills',
        mode: useLinks ? 'link' : 'copy',
        skills,
      },
      { spaces: 2 }
    );
  }
}

/**
 * 为项目内不同 AI IDE 建立按 Skill 粒度的链接，不覆盖目标目录中的第三方 Skills。
 *
 * @param {string} projectRoot 项目根目录
 * @param {string} primaryTarget 主目录路径（如 .agents/skills）
 * @param {string[]} links IDE Skills 目录列表
 * @param {string[]} skills 要同步的 Skill 名称
 * @param {string[]} deprecatedSkills 已废弃的 YSS Skill 名称
 */
async function createIdeLinks(projectRoot, primaryTarget, links, skills, deprecatedSkills) {
  if (!links || links.length === 0) return;

  console.log(chalk.blue('\n🔗 Creating project links for AI IDEs...'));
  const sourceRoot = path.join(projectRoot, primaryTarget);

  for (const link of links) {
    const targetRoot = path.join(projectRoot, link);
    const targetStats = await lstatOrNull(targetRoot);

    try {
      if (targetStats?.isSymbolicLink()) {
        const currentLink = await fs.readlink(targetRoot);
        const currentTarget = path.resolve(path.dirname(targetRoot), currentLink);
        if (currentTarget === path.resolve(sourceRoot)) {
          console.log(chalk.dim(`  ✓ ${link} (already linked to ${primaryTarget})`));
          continue;
        }
        if (await resolvesManagedSkillsFrom(sourceRoot, targetRoot, skills)) {
          console.log(chalk.dim(`  ✓ ${link} (resolves to ${primaryTarget} through a compatibility link)`));
          continue;
        }
        console.warn(chalk.yellow(`  ⚠ ${link} points elsewhere; skipped to avoid overwriting it.`));
        continue;
      }
      if (targetStats && !targetStats.isDirectory()) {
        console.warn(chalk.yellow(`  ⚠ ${link} is not a directory; skipped.`));
        continue;
      }

      await syncSkillEntries(sourceRoot, targetRoot, skills, {
        link: true,
        label: link,
        deprecatedSkills,
        writeManifest: true,
      });
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠ Failed to sync ${link}: ${error.message}`));
    }
  }
}

/**
 * 解析本次同步的 Skills 来源。
 *
 * @param {{ local?: boolean }} options CLI 选项
 * @returns {Promise<{ source: string, temporary: boolean, local: boolean }>} 来源信息
 */
async function resolveSkillsSource(options) {
  if (options.local) {
    if (!(await fs.pathExists(path.join(LOCAL_SKILLS_SOURCE, 'skills.config.json')))) {
      throw new Error(`Local skills source not found: ${LOCAL_SKILLS_SOURCE}`);
    }
    console.log(chalk.blue('Using local monorepo skills (single source of truth).'));
    return { source: LOCAL_SKILLS_SOURCE, temporary: false, local: true };
  }

  try {
    const source = await downloadLatestSkills();
    return { source, temporary: true, local: false };
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Failed to download latest skills: ${error.message}`));
    if (await fs.pathExists(path.join(LOCAL_SKILLS_SOURCE, 'skills.config.json'))) {
      console.log(chalk.yellow('Falling back to local monorepo skills.'));
      return { source: LOCAL_SKILLS_SOURCE, temporary: false, local: true };
    }
    throw new Error('Could not resolve skills source. Download failed and no local fallback found.');
  }
}

/**
 * 读取源目录中有效的 Skill 列表。
 *
 * @param {string} skillsSource Skills 源目录
 * @returns {Promise<string[]>} Skill 名称列表
 */
async function listSkills(skillsSource) {
  const items = await fs.readdir(skillsSource);
  const skills = [];
  for (const item of items) {
    if (item === 'package.json' || item.startsWith('.')) continue;
    const fullPath = path.join(skillsSource, item);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory() && (await fs.pathExists(path.join(fullPath, 'SKILL.md')))) {
        skills.push(item);
      }
    } catch (_) {}
  }
  return skills.sort();
}

/**
 * 同步 Skills 到项目目录和可选的用户级 AI IDE 目录。
 *
 * @param {{ all?: boolean, local?: boolean, global?: boolean, globalOnly?: boolean, links?: boolean }} [options] CLI 选项
 * @returns {Promise<{ source: string, skills: string[] }>} 同步结果
 */
async function syncSkills(options = {}) {
  const cwd = process.cwd();
  const sourceInfo = await resolveSkillsSource(options);
  const skillsSource = sourceInfo.source;

  try {
    const skills = await listSkills(skillsSource);
    if (skills.length === 0) {
      throw new Error('No skills found in the source package.');
    }
    console.log(chalk.green(`Found ${skills.length} skills: ${skills.join(', ')}`));

    let skillsConfig = { excludeFromDefaultSync: [] };
    try {
      skillsConfig = await fs.readJson(path.join(skillsSource, 'skills.config.json'));
    } catch (_) {
      console.warn(chalk.yellow('Warning: skills.config.json not found in source. Syncing all skills.'));
    }

    let skillsToSync;
    if (options.all) {
      skillsToSync = skills;
      console.log(chalk.blue('Syncing ALL skills (including library maintainer skills)...'));
    } else {
      const excludeList = skillsConfig.excludeFromDefaultSync || [];
      const defaultCategories = skillsConfig.defaultSync || [];
      const categories = skillsConfig.categories || {};
      const configuredDefaults = defaultCategories.flatMap(category => categories[category] || []);
      const defaultCandidates = configuredDefaults.length > 0 ? Array.from(new Set(configuredDefaults)) : skills;
      skillsToSync = defaultCandidates.filter(skill => skills.includes(skill) && !excludeList.includes(skill));
      console.log(chalk.green(`Will sync: [${skillsToSync.join(', ')}]`));
    }

    if (skillsToSync.length === 0) {
      throw new Error('No skills matched the sync criteria.');
    }

    const primaryTarget = skillsConfig.primaryTarget || DEFAULT_PRIMARY_TARGET;
    const deprecatedSkills = skillsConfig.deprecatedSkills || [];
    const globalOnly = Boolean(options.globalOnly);

    if (!globalOnly) {
      const targetDir = path.join(cwd, primaryTarget);
      console.log(chalk.blue(`Syncing from: ${skillsSource}`));
      console.log(chalk.blue(`Syncing to: ${targetDir}`));
      await syncSkillEntries(skillsSource, targetDir, skillsToSync, {
        link: sourceInfo.local,
        label: primaryTarget,
        deprecatedSkills,
        writeManifest: true,
      });

      try {
        await updateCursorRules(cwd, skillsToSync, primaryTarget);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to update .cursorrules: ${error.message}`));
      }
      try {
        await updateAntigravityRules(cwd, skillsToSync, primaryTarget);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to update .agents/rules: ${error.message}`));
      }
      try {
        await ensurePrettierIgnore(cwd);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to update .prettierignore: ${error.message}`));
      }

      if (options.links !== false) {
        await createIdeLinks(cwd, primaryTarget, skillsConfig.symbolicLinks || [], skillsToSync, deprecatedSkills);
      }
    }

    if (options.global || globalOnly) {
      console.log(chalk.blue('\n🌐 Syncing user-level AI IDE skills...'));
      const globalTargets = skillsConfig.globalTargets || {};
      const activeTargetPaths = new Set();
      for (const [name, configuredPath] of Object.entries(globalTargets)) {
        const targetRoot = path.isAbsolute(configuredPath) ? configuredPath : path.join(os.homedir(), configuredPath);
        activeTargetPaths.add(path.resolve(targetRoot));
        await syncSkillEntries(skillsSource, targetRoot, skillsToSync, {
          link: sourceInfo.local,
          label: name,
          deprecatedSkills,
          writeManifest: true,
        });
      }

      const deprecatedGlobalTargets = skillsConfig.deprecatedGlobalTargets || {};
      for (const [name, configuredPath] of Object.entries(deprecatedGlobalTargets)) {
        const targetRoot = path.isAbsolute(configuredPath) ? configuredPath : path.join(os.homedir(), configuredPath);
        if (activeTargetPaths.has(path.resolve(targetRoot))) continue;
        await cleanupManagedSkillTarget(targetRoot, name);
      }
    }

    console.log(chalk.bold.green('\n✅ Skills synchronized successfully!'));
    return { source: skillsSource, skills: skillsToSync };
  } finally {
    if (sourceInfo.temporary) {
      await fs.remove(path.dirname(skillsSource));
    }
  }
}

/**
 * Update .cursorrules to include the synced skills.
 *
 * @param {string} projectRoot 项目根目录
 * @param {string[]} skills Skill 名称列表
 * @param {string} primaryTarget 项目级 Skills 主目录
 */
async function updateCursorRules(projectRoot, skills, primaryTarget = DEFAULT_PRIMARY_TARGET) {
  const rulesPath = path.join(projectRoot, '.cursorrules');
  const markerStart = '# --- YSS AI SKILLS START ---';
  const markerEnd = '# --- YSS AI SKILLS END ---';

  const skillRoot = normalizeSkillRoot(primaryTarget);
  const skillLines = skills.map(skill => `- ${skill}: ${skillRoot}/${skill}/SKILL.md`).join('\n');
  const skillsBlock = `
${markerStart}
# The following skills are available in this project.
# AI Assistant: When a user request matches a skill, you MUST read the corresponding SKILL.md file.

${skillLines}

# General Instruction:
# Before starting any complex task, check if it falls under one of the skills above.
# If so, read the SKILL.md file to understand the standards and best practices.
${markerEnd}
`;

  let content = '';
  if (await fs.pathExists(rulesPath)) {
    content = await fs.readFile(rulesPath, 'utf8');
  }

  // Remove existing block if present
  const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g');
  if (regex.test(content)) {
    content = content.replace(regex, skillsBlock.trim());
    console.log(chalk.blue('Updated existing AI Skills config in .cursorrules'));
  } else {
    // Append to end
    content = content ? `${content}\n\n${skillsBlock.trim()}` : skillsBlock.trim();
    console.log(chalk.green('Added AI Skills config to .cursorrules'));
  }

  await fs.writeFile(rulesPath, content, 'utf8');
}

/**
 * Update Antigravity-style workspace rules to force skill discovery.
 *
 * @param {string} projectRoot 项目根目录
 * @param {string[]} skills Skill 名称列表
 * @param {string} primaryTarget 项目级 Skills 主目录
 */
async function updateAntigravityRules(projectRoot, skills, primaryTarget = DEFAULT_PRIMARY_TARGET) {
  const rulesDir = path.join(projectRoot, '.agents/rules');
  const rulesPath = path.join(rulesDir, 'yss-ai-skills.md');
  await fs.ensureDir(rulesDir);

  const skillRoot = normalizeSkillRoot(primaryTarget);
  const skillLines = skills.map(skill => `- ${skill}: ${skillRoot}/${skill}/SKILL.md`).join('\n');
  const content = `---
trigger: always_on
---

# YSS AI Skills Entry

本项目使用 YSS UI 业务页面开发规范。处理 Vue3 业务页面、CRUD、列表、表单、抽屉、YTable、YEditTable、YFormily、YTree、API 对接任务时，必须先读取匹配的 SKILL.md，再写计划或代码。

## Available Skills

${skillLines}

## Mandatory Workflow

1. 页面/CRUD/列表/表单任务：先读 \`${skillRoot}/yss-ui-business-page-generation/SKILL.md\`。
2. 新增或修改页面、组件、Less、内联样式、TS 渲染配置、SVG 色值：必须读 \`${skillRoot}/theme-token-usage/SKILL.md\`。
3. 导出、报表、模板、附件、Excel、CSV、PDF、ZIP、Blob 下载任务：必须读 \`${skillRoot}/file-export-download/SKILL.md\`。
4. 列表或表格任务：同时读 \`${skillRoot}/page-list-module/SKILL.md\`、\`${skillRoot}/ytable-usage/SKILL.md\`、\`${skillRoot}/use-table-height/SKILL.md\`。
5. 新增/编辑/查看/抽屉表单：同时读 \`${skillRoot}/yss-formily/SKILL.md\`、\`${skillRoot}/page-form-module/SKILL.md\`。
6. 可编辑表格、扩展属性、添加行/删除行：必须读 \`${skillRoot}/yedit-table-usage/SKILL.md\`。
7. 用户给原型截图或旧项目路径：必须读 \`${skillRoot}/prototype-page-acceptance/SKILL.md\`，先生成验收清单，再实现。

## Hard Stops

- 禁止使用 YTable 不存在的 \`request\`、\`search-params\` Props 和 \`actionConfig.actions\`；实例 \`refresh()\` 只刷新当前表格数据，不得当作远程重新查询。
- 标准列表必须使用 \`:data\`、\`:columns\`、\`:loading\`、\`pageable\`、\`v-model:pagination\`、\`@page-change\`。
- 表格工具栏必须使用 \`:toolbar-config="{ custom: true }"\`，新增/导入等主按钮放 \`#toolbar-right\`。
- 业务列表查询区默认将查询/重置按钮放在 YFormily 外部独占一行并右对齐；\`AutoButtonGroup + Submit + Reset\` 仅用于纯 Formily 提交表单。
- 所有 YFormily 横向业务表单必须使用 \`FormLayout(labelWidth, labelAlign: 'right') -> FormGrid -> 字段\`，不得省略固定 label 宽度和右对齐。
- FormGrid 必须保持响应式：默认 \`minColumns: 1\`，通过 \`maxColumns\`、\`minWidth\` 控制宽屏列数；禁止 \`minColumns\` 等于 \`maxColumns\` 固定列数，除非用户明确要求不响应式。
- 抽屉/弹窗编辑表单默认 \`labelWidth: 140\`、\`FormGrid { maxColumns: 2, minColumns: 1, minWidth: 320~360 }\`；备注/长文本字段必须用 \`gridSpan\` 占满整行。
- 可编辑表格必须优先使用 \`YEditTable\`，禁止用 \`a-table\` 手搓。
- 抽屉表单必须有响应式宽度，查看态不显示保存按钮。
- 页面和组件禁止硬编码品牌色及 hover/active/selected/focus 色阶；主色透明态必须从真实动态 Token 派生，不得依赖未同步变量的固定色 fallback。
- 导出下载必须优先调用 \`handleBlobResponse(res.data, res.headers)\`；生成方法缺少 Blob 配置时，第二参数必须传 \`{ responseType: 'blob' }\`，禁止手改 Orval 生成文件。
- Orval 请求失败由 \`mutator.ts\` 统一提示并 reject；业务 Hook 禁止 \`if (res?.success)\` 冗余判断，也禁止在 \`else\`/\`catch\` 重复 \`message.error\`，除非请求显式跳过了全局处理。
- 调用 Orval API 前必须检查当前生成文件；存在具名导出时直接导入，只有工厂导出时在模块顶层创建一次实例，禁止猜测 \`getApi()\` 名称。
- 有截图/旧项目参考时，交付前必须逐项对照查询区、表格工具栏、分页高度、抽屉、label、字段控件类型。
`;

  await fs.writeFile(rulesPath, content, 'utf8');
  console.log(chalk.green('Updated Antigravity YSS AI Skills rule in .agents/rules/yss-ai-skills.md'));
}

/**
 * 确保项目的 .prettierignore 中包含 AI Skills 与规则的忽略项，避免本地提交时格式化改写产生差异。
 *
 * @param {string} projectRoot 项目根目录
 */
async function ensurePrettierIgnore(projectRoot) {
  const ignorePath = path.join(projectRoot, '.prettierignore');
  const markerStart = '# --- YSS AI SKILLS IGNORE START ---';
  const markerEnd = '# --- YSS AI SKILLS IGNORE END ---';

  const ignoreBlock = `${markerStart}
# 官方 Skills 为发布包派生资产，由 @yss-ui/skills-cli 托管同步，严禁本地 Prettier 格式化改写产生漂移
.agents/
.agent/
.cursor/
.claude/
.trae/
.codex/
.cursorrules
${markerEnd}`;

  let content = '';
  if (await fs.pathExists(ignorePath)) {
    content = await fs.readFile(ignorePath, 'utf8');
  }

  // 1. 若已有标记块，更新标记块内容
  const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g');
  if (regex.test(content)) {
    content = content.replace(regex, ignoreBlock);
    await fs.writeFile(ignorePath, content, 'utf8');
    console.log(chalk.blue('Updated AI Skills ignore rules in .prettierignore'));
    return;
  }

  // 2. 若已有散落的 .agents/ 规则，检查是否有缺失的核心目录
  const requiredPatterns = ['.agents/', '.agent/', '.cursor/', '.claude/', '.trae/', '.cursorrules'];
  const hasSomeAgentRule = content.includes('.agents/') || content.includes('.agents/skills/');

  if (hasSomeAgentRule) {
    const isMissingAny = requiredPatterns.some(pat => !content.includes(pat));
    if (!isMissingAny) {
      // 已经全部包含，无需重复追加
      return;
    }
  }

  // 3. 追加标记块
  content = content ? `${content.trimEnd()}\n\n${ignoreBlock}\n` : `${ignoreBlock}\n`;
  await fs.writeFile(ignorePath, content, 'utf8');
  console.log(chalk.green('Added AI Skills ignore rules to .prettierignore'));
}

module.exports = {
  cleanupManagedSkillTarget,
  createIdeLinks,
  ensurePrettierIgnore,
  isSafeSkillName,
  listSkills,
  normalizeSkillRoot,
  resolveSkillsSource,
  resolvesManagedSkillsFrom,
  syncSkillEntries,
  syncSkills,
  updateAntigravityRules,
  updateCursorRules,
};
