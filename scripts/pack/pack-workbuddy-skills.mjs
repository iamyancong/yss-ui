#!/usr/bin/env node

/**
 * @file pack-workbuddy-skills.mjs
 * @description 把 packages/skills 下的公开技能按场景聚合为技能市场 zip。
 *              每个包自包含：主技能正文放在包根 SKILL.md，所有成员技能（含引用闭包）
 *              平铺在 references/ 下（dep-<skill>--<原相对路径>.md），组内引用改写为
 *              @references/xxx 的包根相对写法，天然闭合，不依赖用户安装其它技能。
 *
 *              目录层级硬约束：WorkBuddy 开放平台只解析「包根/SKILL.md + 一级子目录里的文件」，
 *              出现任何二级子目录（如 references/mcp-data/x.json）都会报
 *              「目录层级超限 — Skill 包仅支持两级目录结构」。
 *              因此这里把所有嵌套目录压平为一级文件名，并校验 zip 内每个条目深度 ≤ 3 段。
 *
 *              执行：pnpm pack:skills
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AUTHOR, SKILL_VERSION, EXCLUDED_SKILLS, SKILL_GROUPS, DOCS_SKILL } from './workbuddy-assets.config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS_SRC = path.join(REPO_ROOT, 'packages', 'skills');
const OUT_DIR = path.join(REPO_ROOT, 'dist', 'workbuddy', 'skills');
const ASSET_DIR = 'references';
const MAX_ZIP_BYTES = 3 * 1024 * 1024;
/** 平台限制：包根目录 / 二级目录 / 文件，即最多 3 段路径。 */
const MAX_ZIP_SEGMENTS = 3;

const SKILL_REF_RE = /(?:[.][.]\/)+([a-z0-9][a-z0-9-]*)\/SKILL[.]md/g;
const LEGACY_DEPS_REF_RE = /@references\/deps\/([a-z0-9][a-z0-9-]*)\/SKILL[.]md/g;
const ASSET_REF_RE = /(?:\.\/)?((?:references|scripts|templates|examples)\/[^\s`'"()\[\]（），。；：、【】]+)/g;
const BUNDLED_REF_RE = /@((?:references|scripts|templates|examples)\/[^\s`'"()\[\]（），。；：、【】]+)/g;
const EXCLUDED = new Set(EXCLUDED_SKILLS);
const SKIP_NAMES = new Set(['.DS_Store', 'agents']);

const yaml = value => JSON.stringify(value);

async function listSourceSkills() {
  const entries = await fs.readdir(SKILLS_SRC, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && entry.name !== 'evals' && entry.name !== 'rules')
    .map(entry => entry.name)
    .sort();
}

/** 递归列出技能目录内需要随包分发的文件（过滤第三方工具产物与垃圾文件）。 */
async function listSkillFiles(skillName) {
  const base = path.join(SKILLS_SRC, skillName);
  const out = [];
  async function walk(dir, rel) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (SKIP_NAMES.has(entry.name) || entry.name.endsWith('.test.js') || entry.name.endsWith('.test.mjs')) continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, nextRel);
      else if (entry.isFile()) out.push(nextRel);
    }
  }
  await walk(base, '');
  return out;
}

/** 去掉源码 SKILL.md 的 frontmatter，只留正文。 */
function stripFrontmatter(text) {
  return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

function generateFrontmatter(group) {
  return `---
name: ${group.name}
display_name: ${yaml(group.displayName.zh)}
display_name_en: ${yaml(group.displayName.en)}
description: ${yaml(group.description)}
description_zh: ${yaml(group.descriptionZh)}
description_en: ${yaml(group.descriptionEn)}
version: ${SKILL_VERSION}
author: ${yaml(AUTHOR)}
examples_zh:
${group.examplesZh.map(x => `  - ${yaml(x)}`).join('\n')}
examples_en:
${group.examplesEn.map(x => `  - ${yaml(x)}`).join('\n')}
---

`;
}

/** 平铺文件名的公共前缀：dep-<skill>--<原路径用 -- 连接>（去掉重复的 references/ 段，文件本来就在 references/ 下）。 */
function flatBase(owner, rel) {
  const trimmed = rel.replace(/^references\//, '');
  return `dep-${owner}--${trimmed.split('/').join('--')}`;
}

/**
 * 计算成员闭包：从配置的 primary + support 出发，把所有 ../xxx/SKILL.md
 * 引用到的公开技能一并纳入包，直到收敛。指向内部技能的引用不纳入。
 */
async function resolveMembers(seedMembers) {
  const members = new Set(seedMembers);
  const queue = [...seedMembers];
  const excludedRefs = new Set();

  while (queue.length) {
    const name = queue.shift();
    for (const rel of await listSkillFiles(name)) {
      if (!rel.endsWith('.md')) continue;
      const text = await fs.readFile(path.join(SKILLS_SRC, name, rel), 'utf-8');
      for (const match of text.matchAll(SKILL_REF_RE)) {
        const dep = match[1];
        if (EXCLUDED.has(dep)) {
          excludedRefs.add(`${name}/${rel} → ${dep}`);
          continue;
        }
        if (!members.has(dep)) {
          members.add(dep);
          queue.push(dep);
        }
      }
    }
  }
  return { members: [...members].sort(), excludedRefs: [...excludedRefs] };
}

/**
 * 资源落位表：`<owner>/<原相对路径>` → 包内相对路径（两级以内）。
 * - 主技能附属文件：`references/xxx.md` 这类两级路径原样保留，更深的压平到 references/ 下
 * - 成员技能附属文件：统一压平为 `references/dep-<skill>--<路径>.md`
 * 成员技能的 SKILL.md 单独映射为 `references/dep-<skill>.md`。
 */
async function buildAssetMap(primary, members) {
  const map = new Map();
  const set = (key, dest) => {
    const exist = map.get(key);
    if (exist && exist !== dest) throw new Error(`资源落位冲突：${key} → ${exist} / ${dest}`);
    const clash = [...map.entries()].find(([k, v]) => v === dest && k !== key);
    if (clash) throw new Error(`平铺文件名冲突：${key} 与 ${clash[0]} 都要写到 ${dest}`);
    map.set(key, dest);
  };
  for (const rel of await listSkillFiles(primary)) {
    if (rel === 'SKILL.md') continue;
    const depth = rel.split('/').length;
    set(`${primary}/${rel}`, depth <= 2 ? rel : `${ASSET_DIR}/${rel.split('/').join('--')}`);
  }
  for (const name of members) {
    // 主技能正文已经是包根 SKILL.md，不再重复平铺一份，指向它的引用就写 @SKILL.md
    if (name === primary) {
      set(`${primary}/SKILL.md`, 'SKILL.md');
      continue;
    }
    set(`${name}/SKILL.md`, `${ASSET_DIR}/dep-${name}.md`);
    for (const rel of await listSkillFiles(name)) {
      if (rel === 'SKILL.md') continue;
      set(`${name}/${rel}`, `${ASSET_DIR}/${flatBase(name, rel)}`);
    }
  }
  return map;
}

/** 单条资源引用的改写：命中文件 → @references/xxx；命中目录 → @references/前缀--*；未命中 → null。 */
function rewriteAssetToken(owner, token, assetMap) {
  const trimmed = token.replace(/[.,;]+$/, '');
  const tail = token.slice(trimmed.length);
  const rel = trimmed.replace(/\/+$/, '');
  const exact = assetMap.get(`${owner}/${rel}`);
  if (exact) return `@${exact}${tail}`;
  if (rel !== trimmed) return `@${ASSET_DIR}/${flatBase(owner, rel)}--*${tail}`;
  const inDir = [...assetMap.keys()].some(key => key.startsWith(`${owner}/${rel}/`));
  if (inDir) return `@${ASSET_DIR}/${flatBase(owner, rel)}--*${tail}`;
  return null;
}

/**
 * 重写正文里的跨技能引用与资源引用。
 * - ../xxx/SKILL.md → @references/dep-xxx.md（内部技能替换为说明文字）
 * - 本技能自己的 references/examples/... → 压平后的 @references/xxx
 * - 不认识的路径（如仓库根 scripts/release-changed.js）原样保留
 */
function rewriteRefs(text, owner, assetMap) {
  let out = text.replace(SKILL_REF_RE, (full, dep) => {
    if (EXCLUDED.has(dep)) return '（该能力属内部流程，不随本技能分发）';
    return assetMap.has(`${dep}/SKILL.md`) ? `@${assetMap.get(`${dep}/SKILL.md`)}` : full;
  });
  out = out.replace(LEGACY_DEPS_REF_RE, (full, dep) =>
    assetMap.has(`${dep}/SKILL.md`) ? `@${assetMap.get(`${dep}/SKILL.md`)}` : '（该能力属内部流程，不随本技能分发）'
  );
  out = out.replace(ASSET_REF_RE, (full, token) => rewriteAssetToken(owner, token, assetMap) ?? full);
  return out;
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf-8');
}

/** 配置自检：分组必须恰好覆盖全部公开技能，且不重复、不引用内部技能。 */
async function validateConfig(allSkills) {
  const errors = [];
  const publicSkills = allSkills.filter(name => !EXCLUDED.has(name));
  const seen = new Map();
  const names = new Set();

  for (const group of SKILL_GROUPS) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(group.name)) errors.push(`技能名非 kebab-case: ${group.name}`);
    if (names.has(group.name)) errors.push(`技能名重复: ${group.name}`);
    names.add(group.name);

    for (const key of ['description', 'descriptionZh', 'descriptionEn']) {
      if (!group[key]) errors.push(`${group.name} 缺少 ${key}`);
    }
    if (!group.displayName?.zh || !group.displayName?.en) errors.push(`${group.name} 缺少中英文展示名`);
    if (!group.examplesZh?.length || !group.examplesEn?.length) errors.push(`${group.name} 缺少中英文示例`);

    for (const name of [group.primary, ...group.support]) {
      if (EXCLUDED.has(name)) errors.push(`${group.name} 引用了内部技能: ${name}`);
      if (!allSkills.includes(name)) errors.push(`${group.name} 引用了不存在的技能: ${name}`);
      if (seen.has(name)) errors.push(`技能被重复分组: ${name}（${seen.get(name)} 与 ${group.name}）`);
      seen.set(name, group.name);
    }
  }

  for (const name of publicSkills) {
    if (!seen.has(name)) errors.push(`公开技能未被任何分组收录: ${name}`);
  }
  if (errors.length) throw new Error('资产配置校验失败：\n  - ' + errors.join('\n  - '));
  console.log(`✅ 配置校验通过：${publicSkills.length} 个公开技能 → ${SKILL_GROUPS.length} 个市场技能，内部技能 ${EXCLUDED.size} 个已排除`);
}

/** 打包后按开放平台规则复核单个 zip：命名、体积、两级目录、垃圾文件。 */
function assertSkillZip(zipPath, groupName) {
  const size = (execFileSync('stat', ['-f', '%z', zipPath], { encoding: 'utf-8' })).trim();
  if (Number(size) > MAX_ZIP_BYTES) {
    throw new Error(`${groupName}.zip 超过 3MB: ${(Number(size) / 1024 / 1024).toFixed(2)}MB`);
  }
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' })
    .split('\n').map(line => line.trim()).filter(Boolean);
  if (!entries.includes(`${groupName}/SKILL.md`)) {
    throw new Error(`${groupName}.zip 缺少 ${groupName}/SKILL.md（平台解析失败）`);
  }
  const badRoot = entries.find(entry => !entry.startsWith(`${groupName}/`));
  if (badRoot) throw new Error(`${groupName}.zip 含包外条目: ${badRoot}`);
  const tooDeep = entries
    .map(entry => ({ entry, segments: entry.split('/').filter(Boolean) }))
    .filter(({ segments }) => segments.length > MAX_ZIP_SEGMENTS);
  if (tooDeep.length) {
    throw new Error(
      `${groupName}.zip 目录层级超限（平台仅支持两级目录），请压平：\n  - ` +
      tooDeep.slice(0, 5).map(({ entry }) => entry).join('\n  - ')
    );
  }
  if (entries.some(entry => entry.includes('.DS_Store') || entry.includes('/agents/'))) {
    throw new Error(`${groupName}.zip 含垃圾文件或第三方工具产物`);
  }
  return Number(size);
}

/** 包内所有 @references/... 引用必须指向真实存在的文件（或目录通配前缀）。 */
async function assertNoDanglingRefs(pkgDir, groupName) {
  const packed = new Set();
  async function walk(dir, rel) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), nextRel);
      else packed.add(nextRel);
    }
  }
  await walk(pkgDir, '');

  const dangling = [];
  for (const rel of packed) {
    if (!rel.endsWith('.md')) continue;
    const text = await fs.readFile(path.join(pkgDir, rel), 'utf-8');
    for (const match of text.matchAll(BUNDLED_REF_RE)) {
      const token = match[1].replace(/[.,;]+$/, '');
      const ok = token.endsWith('--*')
        ? [...packed].some(file => file.startsWith(token.slice(0, -1)))
        : packed.has(token);
      if (!ok) dangling.push(`${rel} → @${token}`);
    }
    for (const match of text.matchAll(SKILL_REF_RE)) {
      if (!EXCLUDED.has(match[1])) dangling.push(`${rel} → 未改写的跨技能引用 ${match[0]}`);
    }
  }
  if (dangling.length) {
    throw new Error(`${groupName} 存在悬空引用：\n  - ${dangling.slice(0, 10).join('\n  - ')}`);
  }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function buildGroup(group) {
  const seed = [group.primary, ...group.support];
  const { members, excludedRefs } = await resolveMembers(seed);
  const pkgDir = path.join(OUT_DIR, group.name);
  await fs.rm(pkgDir, { recursive: true, force: true });
  await fs.mkdir(pkgDir, { recursive: true });
  const assetMap = await buildAssetMap(group.primary, members);

  // 1. 包根 SKILL.md：注入市场规范 frontmatter + 主技能正文
  const primaryBody = stripFrontmatter(
    await fs.readFile(path.join(SKILLS_SRC, group.primary, 'SKILL.md'), 'utf-8')
  );
  await writeText(
    path.join(pkgDir, 'SKILL.md'),
    generateFrontmatter(group) + rewriteRefs(primaryBody, group.primary, assetMap)
  );

  // 2. 全部成员技能（含主技能自身的附属资源与引用闭包）按落位表写盘并改写引用
  for (const [key, dest] of assetMap) {
    if (dest === 'SKILL.md') continue; // 主技能正文已带 frontmatter 写为包根 SKILL.md
    const [owner, ...rest] = key.split('/');
    const rel = rest.join('/');
    const src = path.join(SKILLS_SRC, owner, rel);
    if (!await exists(src)) throw new Error(`${group.name} 映射了不存在的源文件: ${key}`);
    const target = path.join(pkgDir, dest);
    if (rel.endsWith('.md')) {
      await writeText(target, rewriteRefs(await fs.readFile(src, 'utf-8'), owner, assetMap));
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(src, target);
    }
  }

  // 3. 校验引用闭合后打包
  await assertNoDanglingRefs(pkgDir, group.name);
  const zipPath = path.join(OUT_DIR, `${group.name}.zip`);
  await fs.rm(zipPath, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', zipPath, group.name, '-x', '*.DS_Store'], { cwd: OUT_DIR });
  const size = assertSkillZip(zipPath, group.name);

  return {
    name: group.name,
    title: group.displayName.zh,
    members: members.length,
    sizeKB: size / 1024,
    excludedRefs
  };
}

/**
 * 「组件文档速查」技能的正文：把 MCP 离线契约数据的检索方法写清楚，
 * 让用户不连接任何 MCP 也能核对真实组件 API。正文里不出现跨技能相对引用。
 * 注意：三份 JSON 平铺在 references/ 下，不建二级子目录（平台只解析两级结构）。
 */
function generateDocsSkillBody() {
  return `# YSS UI 组件文档速查

## 何时必须使用

编写任何 \`@yss-ui/components\` 组件配置、Formily JSON Schema、YTable 列配置前，
**必须先检索本技能自带的离线契约数据**核对真实属性、事件、插槽与方法。
严禁凭记忆猜测 API，严禁臆造 \`Y\` 前缀组件；数据中查不到就明确告知「文档未提供」，
不要编造替代写法。

## 随包内置的数据

| 文件 | 内容 |
|---|---|
| \`@references/schemas.json\` | 组件 Props 约束、枚举值、默认值、Emits、Slots 的结构化 Schema |
| \`@references/index.json\` | 组件文档全文、171+ 官方 Demo 源码、开发 Skills 索引 |
| \`@references/coverage-summary.json\` | 组件库文档覆盖率与模块健康度 |

三份数据合计约 1.5MB（压缩进技能包约 375KB），是 ${DOCS_SKILL.mcpPackage} 生成的只读快照。

## 检索步骤

1. **确认组件存在**：用 Grep 在 \`@references/schemas.json\` 中搜索组件名（如 \`YTable\`）；
   组件清单也可查 \`@references/index.json\`。
2. **核对属性**：用 Grep 搜索属性名，读取对应的类型、默认值与枚举约束；
   \`detail=all\` 类透传配置不在核心 Schema 中时，回到文档全文确认。
3. **取标准写法**：用 Grep 在 \`@references/index.json\` 中搜索组件名或 Demo 标识，
   读取官方 Demo 的 \`index.vue\`、hooks 与样式片段作为实现基准。
4. **判断资料可信度**：用 \`@references/coverage-summary.json\` 确认该组件是否有权威文档；
   覆盖率低的组件要向用户说明风险，不要补写想象中的 API。
5. **写代码前**：先读项目里的代码生成硬规则（样式导入、SFC 结构、主题 Token、大数精度），
   再按上面查到的真实配置实现。

以上步骤分别对应 MCP 的 \`list_components\`、\`get_component_schema\`、
\`get_component_docs\`、\`get_demo\`、\`get_test_coverage\`、\`get_codegen_rules\` 等工具，
区别只是这里用 Grep / Read 直接查离线文件，无需连接服务、无需联网、无需鉴权。

## 边界与安全

- 数据只读，不执行脚本、不写盘、不访问用户业务数据；不需要任何账号或 Token。
- 索引版本与组件库版本对齐；升级 \`@yss-ui/mcp\` 后重新构建本技能包即可更新数据。
- 带本地执行脚本的开发流程（如脚手架）需要项目中另行安装 \`@yss-ui/skills-cli\`，
  本技能只提供文档事实，不要尝试执行未安装的脚本。
- 如需实时查询能力，可在 WorkBuddy 客户端的自定义连接器中配置
  \`npx -y ${DOCS_SKILL.mcpPackage}\`（无需开放平台上架）。

## 与其它技能配合

本技能回答「组件真实有哪些 API」，\`yss-microapp-scaffold\`、\`yss-table-list\`、
\`yss-formily-forms\` 等技能回答「按什么流程写」。两者配合可覆盖从查文档到交付的完整链路。
`;
}

/** 构建「组件文档速查」技能包：自带 MCP 离线数据，是自包含资产，不依赖任何连接器。 */
async function buildDocsSkill() {
  const d = DOCS_SKILL;
  const pkgDir = path.join(OUT_DIR, d.name);
  await fs.rm(pkgDir, { recursive: true, force: true });
  await fs.mkdir(path.join(pkgDir, ASSET_DIR), { recursive: true });

  await writeText(
    path.join(pkgDir, 'SKILL.md'),
    generateFrontmatter(d) + generateDocsSkillBody()
  );

  // 数据文件平铺在 references/ 一级，避免平台「目录层级超限」
  for (const file of d.dataFiles) {
    const src = path.join(REPO_ROOT, d.dataDir, file);
    const text = await fs.readFile(src, 'utf-8');
    JSON.parse(text); // 数据文件必须是合法 JSON
    await fs.copyFile(src, path.join(pkgDir, ASSET_DIR, file));
  }

  await assertNoDanglingRefs(pkgDir, d.name);
  const zipPath = path.join(OUT_DIR, `${d.name}.zip`);
  await fs.rm(zipPath, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', zipPath, d.name, '-x', '*.DS_Store'], { cwd: OUT_DIR });
  const size = assertSkillZip(zipPath, d.name);

  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' }).split('\n');
  for (const file of d.dataFiles) {
    if (!entries.includes(`${d.name}/${ASSET_DIR}/${file}`)) {
      throw new Error(`${d.name}.zip 缺少数据文件 ${file}`);
    }
  }
  return {
    name: d.name,
    title: d.displayName.zh,
    members: 0,
    sizeKB: size / 1024,
    excludedRefs: []
  };
}

async function main() {
  console.log('🚀 构建 WorkBuddy 技能市场资产包...\n');
  const allSkills = await listSourceSkills();
  await validateConfig(allSkills);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const results = [];
  const allExcludedRefs = new Set();
  for (const group of SKILL_GROUPS) {
    const result = await buildGroup(group);
    results.push(result);
    result.excludedRefs.forEach(ref => allExcludedRefs.add(ref));
    console.log(`   ✔ ${result.name.padEnd(30)} ${String(result.members).padStart(2)} 个源技能  ${result.sizeKB.toFixed(1)}KB`);
  }

  // 连接器市场受限时的替代资产：自带 MCP 离线契约数据的独立技能
  const docsResult = await buildDocsSkill();
  results.push(docsResult);
  console.log(`   ✔ ${docsResult.name.padEnd(30)} ${DOCS_SKILL.dataFiles.length} 份离线数据  ${docsResult.sizeKB.toFixed(1)}KB`);

  console.log('\n📋 产物清单（dist/workbuddy/skills/）：');
  for (const r of results) {
    console.log(`   ${r.name}.zip  ${r.title}  ${r.sizeKB.toFixed(1)}KB`);
  }
  console.log(`\n✅ 共 ${results.length} 个技能包，全部 ≤3MB、frontmatter 合规、两级目录、引用闭合`);
  if (allExcludedRefs.size) {
    console.log(`   指向内部技能的 ${allExcludedRefs.size} 处引用已替换为说明文字：`);
    for (const ref of [...allExcludedRefs].slice(0, 8)) console.log(`     - ${ref}`);
  }
  console.log('\n💡 上传入口：开放平台 → 发布管理 → 技能 → 创建（一个技能一个 zip，多个技能需分别创建）\n');
}

main().catch(err => {
  console.error('❌ 构建失败:', err.message);
  process.exit(1);
});
