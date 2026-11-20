#!/usr/bin/env node

/**
 * Skills 触发与路由评测（Tier 2）：确定性、零模型依赖、可进 CI。
 *
 * 设计参考 awesome-llm-apps agent_skills/evals 的 run_trigger_evals.py：
 * skill 的 description 就是它的全部触发面，因此对其做词法检查——
 * 正例 prompt 对自己 skill 的得分必须显著高于 near-miss 负例，
 * 且在全目录中必须把自己的 skill 排在第一；任何两个 skill 的
 * description 词表不得近似碰撞。
 *
 * 针对中文语料的两点适配：
 * 1. 分词 = CJK 二元组（bigram）+ ASCII 单词，无需分词库；
 * 2. 出现在超过 BACKGROUND_DF_RATIO 比例 description 中的词
 *    视为背景词汇（如「指导 / 业务页面 / 当…时使用」），
 *    不参与打分与碰撞计算，避免模板措辞淹没判别词。
 *
 * 用例位于 packages/skills/evals/<skill>/trigger-cases.json；
 * 标记 "lexical": false 的用例跳过词法检查（靠推理触发，由行为层覆盖）；
 * "accept_route_to" 声明可接受的替代路由（如枢纽 skill yss-formily）。
 *
 * 用法：node scripts/run-trigger-evals.js [--strict]
 *   --strict  缺少 trigger-cases.json 的 skill 视为失败（默认仅警告）
 */

const fs = require('fs');
const path = require('path');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '../..');

/** Skill 源码目录。 */
const SKILLS_DIR = path.join(ROOT_DIR, 'packages/skills');

/** 评测用例目录。 */
const EVALS_DIR = path.join(SKILLS_DIR, 'evals');

/** 评测全局配置（碰撞白名单等）。 */
const EVALS_CONFIG_PATH = path.join(EVALS_DIR, 'evals.config.json');

/** 最弱正例得分必须超过最强负例得分的倍数。 */
const MARGIN = 1.15;

/** 两个 description 的判别词重叠超过该比例视为近似碰撞。 */
const COLLISION_THRESHOLD = 0.5;

/** 一个词出现在超过该比例的 description 中即视为背景词汇。 */
const BACKGROUND_DF_RATIO = 0.4;

/** ASCII 停用词（description 与 prompt 中的常见无判别力单词）。 */
const ASCII_STOP = new Set(['the', 'and', 'for', 'with', 'use', 'when', 'not']);

/**
 * 英文轻词干化：仅剥离常见后缀，足以对齐 commits/commit、hooks/hook。
 *
 * @param {string} word 小写单词
 * @returns {string} 词干
 */
function stem(word) {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * 混合分词：CJK 连续段取二元组，ASCII 取小写单词（长度 >= 2）。
 *
 * @param {string} text 待分词文本
 * @returns {Set<string>} 词元集合
 */
function tokenize(text) {
  const out = new Set();
  const lower = String(text || '').toLowerCase();

  for (const match of lower.matchAll(/[a-z0-9][a-z0-9'+.-]*/g)) {
    const word = match[0].replace(/[.'-]+$/g, '');
    if (word.length < 2 || ASCII_STOP.has(word)) continue;
    out.add(stem(word));
  }

  for (const match of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = match[0];
    for (let i = 0; i < run.length - 1; i += 1) {
      out.add(run.slice(i, i + 2));
    }
  }
  return out;
}

/**
 * 读取 skill 的 frontmatter description（单行，validate-skills 已保证）。
 *
 * @param {string} skillDir skill 目录绝对路径
 * @returns {string} description 文本
 */
function readDescription(skillDir) {
  const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const match = content.match(/^description:\s*(.+)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

/**
 * 收集全部 skill 及其 description 词元。
 *
 * @returns {Map<string, Set<string>>} skill 名称到原始词元集合
 */
function collectSkills() {
  const skills = new Map();
  for (const entry of fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(SKILLS_DIR, entry.name);
    if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;
    skills.set(entry.name, tokenize(readDescription(skillDir)));
  }
  return skills;
}

/**
 * 计算背景词汇：出现在超过阈值比例 description 中的词元。
 *
 * @param {Map<string, Set<string>>} skills skill 词元表
 * @returns {Set<string>} 背景词元集合
 */
function computeBackground(skills) {
  const df = new Map();
  for (const tokens of skills.values()) {
    for (const token of tokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  const limit = skills.size * BACKGROUND_DF_RATIO;
  const background = new Set();
  for (const [token, count] of df) {
    if (count > limit) background.add(token);
  }
  return background;
}

/**
 * 从集合中剔除背景词元。
 *
 * @param {Set<string>} tokens 原始词元
 * @param {Set<string>} background 背景词元
 * @returns {Set<string>} 判别词元
 */
function discriminative(tokens, background) {
  const out = new Set();
  for (const token of tokens) {
    if (!background.has(token)) out.add(token);
  }
  return out;
}

/**
 * prompt 对 description 的词法得分：交集大小 / sqrt(prompt 词元数)。
 *
 * @param {Set<string>} promptTokens prompt 判别词元
 * @param {Set<string>} descTokens description 判别词元
 * @returns {number} 得分
 */
function score(promptTokens, descTokens) {
  if (promptTokens.size === 0) return 0;
  let hit = 0;
  for (const token of promptTokens) {
    if (descTokens.has(token)) hit += 1;
  }
  return hit / Math.sqrt(promptTokens.size);
}

/**
 * 读取评测全局配置。
 *
 * @returns {{collisionAllowlist: Array<{pair: string[], reason: string}>}} 配置
 */
function readEvalsConfig() {
  if (!fs.existsSync(EVALS_CONFIG_PATH)) return { collisionAllowlist: [] };
  return JSON.parse(fs.readFileSync(EVALS_CONFIG_PATH, 'utf8'));
}

/**
 * 检查任意两个 skill 的 description 判别词是否近似碰撞。
 *
 * @param {Map<string, Set<string>>} skillTokens 判别词元表
 * @param {Set<string>} allowedPairs 白名单键集合（"a|b" 按字母序）
 * @param {string[]} failures 失败收集容器
 */
function checkCollisions(skillTokens, allowedPairs, failures) {
  const names = Array.from(skillTokens.keys());
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = skillTokens.get(names[i]);
      const b = skillTokens.get(names[j]);
      let shared = 0;
      for (const token of a) {
        if (b.has(token)) shared += 1;
      }
      const overlap = shared / Math.max(1, Math.min(a.size, b.size));
      if (overlap <= COLLISION_THRESHOLD) continue;
      const key = [names[i], names[j]].sort().join('|');
      if (allowedPairs.has(key)) {
        console.log(`ALLOW ${names[i]} vs ${names[j]} 词表重叠 ${(overlap * 100).toFixed(0)}%（白名单）`);
        continue;
      }
      failures.push(
        `descriptions 近似碰撞: ${names[i]} vs ${names[j]}（判别词重叠 ${(overlap * 100).toFixed(0)}%），请收窄其一的 description 或加入白名单并说明原因`
      );
    }
  }
}

/**
 * 运行单个 skill 的触发用例。
 *
 * @param {string} name skill 名称
 * @param {Map<string, Set<string>>} skillTokens 判别词元表
 * @param {Set<string>} background 背景词元
 * @param {string[]} failures 失败收集容器
 * @returns {boolean} 是否存在用例文件
 */
function runSkillCases(name, skillTokens, background, failures) {
  const caseFile = path.join(EVALS_DIR, name, 'trigger-cases.json');
  if (!fs.existsSync(caseFile)) return false;

  const spec = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
  const own = skillTokens.get(name);
  const positives = [];
  const negatives = [];

  for (const kase of spec.cases || []) {
    if (kase.lexical === false) continue;
    const promptTokens = discriminative(tokenize(kase.prompt), background);
    const s = score(promptTokens, own);
    (kase.should_trigger ? positives : negatives).push({ score: s, id: kase.id });

    if (kase.should_trigger && skillTokens.size > 1) {
      let best = name;
      let bestScore = s;
      for (const [other, tokens] of skillTokens) {
        if (other === name) continue;
        const otherScore = score(promptTokens, tokens);
        if (otherScore > bestScore) {
          best = other;
          bestScore = otherScore;
        }
      }
      const accepted = new Set([name, ...(kase.accept_route_to || [])]);
      if (!accepted.has(best)) {
        failures.push(`${name}: 正例 "${kase.id}" 被路由到 ${best}（${bestScore.toFixed(2)} > ${s.toFixed(2)}）`);
      }
    }
  }

  if (positives.length > 0 && negatives.length > 0) {
    const worstPos = positives.reduce((min, c) => (c.score < min.score ? c : min));
    const bestNeg = negatives.reduce((max, c) => (c.score > max.score ? c : max));
    if (worstPos.score <= bestNeg.score * MARGIN) {
      failures.push(
        `${name}: 最弱正例 "${worstPos.id}"（${worstPos.score.toFixed(2)}）未拉开最强负例 "${bestNeg.id}"（${bestNeg.score.toFixed(2)}）` +
          '，description 缺少用户实际会说的词汇，或负例与其共享了过多词汇'
      );
    } else {
      console.log(
        `PASS  ${name}: ${positives.length} 正例全部压过 ${negatives.length} 负例（最弱 ${worstPos.score.toFixed(2)} vs 最强 ${bestNeg.score.toFixed(2)}）`
      );
    }
  }
  return true;
}

/** 执行触发与路由评测。 */
function main() {
  const strict = process.argv.includes('--strict');
  const rawSkills = collectSkills();
  if (rawSkills.size === 0) {
    console.error(`未在 ${SKILLS_DIR} 下找到任何 skill`);
    process.exit(1);
  }

  const background = computeBackground(rawSkills);
  const skillTokens = new Map();
  for (const [name, tokens] of rawSkills) {
    skillTokens.set(name, discriminative(tokens, background));
  }

  const config = readEvalsConfig();
  const allowedPairs = new Set((config.collisionAllowlist || []).map(item => [...item.pair].sort().join('|')));

  const failures = [];
  const missing = [];

  checkCollisions(skillTokens, allowedPairs, failures);

  for (const name of skillTokens.keys()) {
    if (!runSkillCases(name, skillTokens, background, failures)) {
      missing.push(name);
    }
  }

  for (const name of missing) {
    const message = `${name} 缺少 evals/${name}/trigger-cases.json`;
    if (strict) {
      failures.push(message);
    } else {
      console.log(`WARN  ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n❌ 触发与路由评测失败（${failures.length} 项）:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log(`\n✅ 触发与路由评测通过，共 ${skillTokens.size} 个 skill（背景词 ${background.size} 个已过滤）。`);
}

main();
