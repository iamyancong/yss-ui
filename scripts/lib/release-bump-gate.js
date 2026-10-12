'use strict';

/**
 * G1 发版 bump 门禁：防止破坏性变化或新功能以 patch 误发。
 *
 * 核心规则：
 * 1. 提交中含 feat → 至少 minor
 * 2. 提交中含 "!" 或正文 "BREAKING CHANGE" → major（0.x 版本按 minor 宽松处理）
 * 3. 改动命中 release-behavior-allowlist.json 敏感文件且契约快照有变化 → 至少 minor
 * 4. 若目标 bump 低于要求，只有显式提供 overrideReason 时才允许放行
 */

const fs = require('fs');
const path = require('path');

const BUMP_LEVELS = {
  patch: 1,
  minor: 2,
  major: 3,
};

const LEVEL_TO_BUMP = {
  1: 'patch',
  2: 'minor',
  3: 'major',
};

/**
 * 路径是否匹配通配模式（支持简单的 * 匹配）。
 *
 * @param {string} filePath 文件相对路径
 * @param {string} pattern 匹配规则
 * @returns {boolean}
 */
function matchPattern(filePath, pattern) {
  const normFile = filePath.replace(/\\/g, '/');
  const normPattern = pattern.replace(/\\/g, '/');

  if (normPattern.includes('*')) {
    const regexStr = '^' + normPattern.replace(/\*/g, '[^/]+') + '$';
    return new RegExp(regexStr).test(normFile);
  }

  return normFile === normPattern;
}

/**
 * 读取敏感行为监控文件列表。
 *
 * @param {string} [configPath]
 * @returns {string[]}
 */
function loadBehaviorAllowlist(configPath) {
  const file = configPath || path.join(__dirname, '../release-behavior-allowlist.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * 评估发版所需的最低 Semver bump 类型。
 *
 * @param {object} params
 * @param {Array<{hash?: string, message: string, body?: string}>} params.commits 提交列表
 * @param {string[]} [params.files] 变更文件列表
 * @param {string} params.targetBump 目标 bump 类型（patch | minor | major）
 * @param {string} [params.overrideReason] 显式绕过原因
 * @param {boolean} [params.snapshotChanged] API 契约快照是否发生变化
 * @param {boolean} [params.isZeroMajor] 是否处于 0.x 阶段
 * @param {string[]} [params.allowlist] 敏感行为白名单
 * @returns {{ ok: boolean, requiredBump: 'patch'|'minor'|'major', reasons: string[], overridden: boolean, overrideReason?: string }}
 */
function checkReleaseBumpGate(params) {
  const {
    commits = [],
    files = [],
    targetBump,
    overrideReason = '',
    snapshotChanged = false,
    isZeroMajor = false,
    allowlist,
  } = params;

  let maxLevel = BUMP_LEVELS.patch;
  const reasons = [];

  // 1. 检查提交信息 (Conventional Commits)
  for (const c of commits) {
    const rawMsg = c.message || '';
    const body = c.body || '';
    const fullText = `${rawMsg}\n${body}`;
    const hash = c.hash ? c.hash.slice(0, 7) : '';

    const isBreaking =
      /^[a-z]+(\([^)]+\))?!:/i.test(rawMsg) ||
      /\bBREAKING[ -]CHANGE:/m.test(fullText);

    if (isBreaking) {
      const required = isZeroMajor ? BUMP_LEVELS.minor : BUMP_LEVELS.major;
      if (required > maxLevel) {
        maxLevel = required;
      }
      reasons.push(
        `提交 ${hash || rawMsg.slice(0, 30)} 包含破坏性变更 (BREAKING CHANGE 或 !)，要求升级至 ${
          isZeroMajor ? 'minor (0.x)' : 'major'
        }`
      );
    } else if (/^feat(\([^)]+\))?:/i.test(rawMsg)) {
      if (BUMP_LEVELS.minor > maxLevel) {
        maxLevel = BUMP_LEVELS.minor;
      }
      reasons.push(`提交 ${hash || rawMsg.slice(0, 30)} 包含新功能 (feat)，要求升级至 minor`);
    }
  }

  // 2. 检查公开行为敏感文件与契约测试
  const patterns = allowlist || loadBehaviorAllowlist();
  const matchedFiles = files.filter(f => patterns.some(p => matchPattern(f, p)));

  // 契约测试文件 (如 *contract.test.ts) 改动同样视为行为变化
  const isContractTest = file => /(?:^|\/)[^/]*contract\.test\.[jt]sx?$/i.test(file.replace(/\\/g, '/'));
  const matchedContractTests = files.filter(isContractTest);

  if (matchedFiles.length > 0) {
    if (BUMP_LEVELS.minor > maxLevel) {
      maxLevel = BUMP_LEVELS.minor;
    }
    reasons.push(
      `改动命中敏感行为文件 (${matchedFiles.slice(0, 3).join(', ')}${
        matchedFiles.length > 3 ? '等' : ''
      })，要求升级至 minor（或提供 override_reason）`
    );
  }

  if (matchedContractTests.length > 0) {
    if (BUMP_LEVELS.minor > maxLevel) {
      maxLevel = BUMP_LEVELS.minor;
    }
    reasons.push(
      `改动命中行为契约测试 (${matchedContractTests.slice(0, 3).join(', ')}${
        matchedContractTests.length > 3 ? '等' : ''
      })，要求升级至 minor（或提供 override_reason）`
    );
  }

  // 3. 检查 API 契约快照变动
  if (snapshotChanged) {
    if (BUMP_LEVELS.minor > maxLevel) {
      maxLevel = BUMP_LEVELS.minor;
    }
    reasons.push('API 契约快照 (api-snapshot/) 发生变动，要求升级至 minor（或提供 override_reason）');
  }

  const requiredBump = LEVEL_TO_BUMP[maxLevel] || 'patch';
  const targetLevel = BUMP_LEVELS[targetBump] || 1;

  if (targetLevel < maxLevel) {
    const trimmedReason = typeof overrideReason === 'string' ? overrideReason.trim() : '';
    if (trimmedReason) {
      return {
        ok: true,
        requiredBump,
        reasons,
        overridden: true,
        overrideReason: trimmedReason,
      };
    }

    return {
      ok: false,
      requiredBump,
      reasons: [
        ...reasons,
        `目标版本类型 "${targetBump}" 低于门禁计算出的最低要求 "${requiredBump}"`,
      ],
      overridden: false,
    };
  }

  return {
    ok: true,
    requiredBump,
    reasons: reasons.length > 0 ? reasons : ['所有提交与文件变更符合当前目标版本要求'],
    overridden: false,
  };
}

module.exports = {
  checkReleaseBumpGate,
  loadBehaviorAllowlist,
  matchPattern,
};
