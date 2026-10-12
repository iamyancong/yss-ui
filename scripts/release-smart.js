#!/usr/bin/env node
'use strict';

/**
 * 智能发版脚本 + 自动日志生成
 *
 * 功能：
 * 1. 检测从上次发版以来哪些包有变更
 * 2. 只 bump 有变更的包的版本号
 * 3. 使用 standard-version 生成统一的更新日志
 * 4. 构建并发布到 npm
 *
 * 用法：
 * node scripts/release-smart.js <patch|minor|major> [--dry]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  PACKAGES,
  detectChangedPackages,
  isMcpRuntimeChange,
  orderReleaseKeys,
  refineMcpPublish,
  matchesPackageDir,
  matchesExtraInput,
  ensureDerivedMcpPublish,
  rebuildMcpIndex,
  validateMcpIndex,
  persistMcpIndexHash,
  ensureMcpIndexChangelog,
} = require('./lib/release-packages');

function log(message) {
  console.log(`[release-smart] ${message}`);
}

function run(cmd, options = {}) {
  const result = execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...options });
  if (!result) return '';
  if (Buffer.isBuffer(result)) return result.toString('utf8').trim();
  if (typeof result === 'string') return result.trim();
  return '';
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function bumpSemver(version, bump) {
  const [majorStr, minorStr, patchStrAndPre] = version.split('.');
  const [patchStr] = (patchStrAndPre || '0').split('-');
  let major = parseInt(majorStr, 10) || 0;
  let minor = parseInt(minorStr, 10) || 0;
  let patch = parseInt(patchStr, 10) || 0;
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function parseArgs(argv) {
  const result = {
    bump: null,
    dryRun: false,
    overrideReason: process.env.RELEASE_OVERRIDE_REASON || '',
  };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry' || a === '--dry-run') result.dryRun = true;
    else if (a.startsWith('--override-reason=')) result.overrideReason = a.slice('--override-reason='.length);
    else positional.push(a);
  }
  if (positional[0] && ['patch', 'minor', 'major'].includes(positional[0])) {
    result.bump = positional[0];
  }
  return result;
}

/**
 * 查找上一次发版 commit（通过 git tag）
 */
function findLastReleaseTag() {
  try {
    const out = run('git describe --tags --abbrev=0');
    return out || null;
  } catch (_) {
    return null;
  }
}

/**
 * 获取比较区间内的提交对象列表。
 *
 * @param {string} baseRef 基准 commit
 * @param {string[]} [paths] 过滤路径列表
 * @returns {Array<{hash: string, message: string, body: string}>}
 */
function getCommitsBetween(baseRef, paths = []) {
  if (!baseRef) return [];
  try {
    const pathArg = Array.isArray(paths) && paths.length > 0 ? `-- ${paths.map(p => `"${p}"`).join(' ')}` : '';
    const raw = run(`git log --format="%H%x1f%s%x1f%b%x1e" ${baseRef}..HEAD ${pathArg}`.trim());
    if (!raw) return [];
    return raw
      .split('\x1e')
      .map(block => {
        const parts = block.trim().split('\x1f');
        return {
          hash: parts[0] || '',
          message: parts[1] || '',
          body: parts[2] || '',
        };
      })
      .filter(c => c.hash || c.message);
  } catch (err) {
    throw new Error(`获取提交记录失败 (${baseRef}..HEAD): ${err.message}`);
  }
}

/**
 * 校验发版范围内 API 快照是否发生变化。
 *
 * @param {string} baseRef 基准 tag 或 commit
 * @param {string[]} [files] 变更文件列表
 * @returns {{ changed: boolean, files: string[] }}
 */
function getSnapshotDiffInRange(baseRef, files = []) {
  if (baseRef) {
    try {
      const out = run(`git diff --name-only ${baseRef}..HEAD -- api-snapshot/`);
      const snapshotFiles = out
        ? out
            .split('\n')
            .map(s => s.trim().replace(/\\/g, '/'))
            .filter(Boolean)
        : [];
      return { changed: snapshotFiles.length > 0, files: snapshotFiles };
    } catch (err) {
      throw new Error(`检测发版范围内 API 快照变动失败 (${baseRef}..HEAD): ${err.message}`);
    }
  }
  const snapshotFiles = files.map(f => f.replace(/\\/g, '/')).filter(f => f.startsWith('api-snapshot/'));
  return { changed: snapshotFiles.length > 0, files: snapshotFiles };
}

/**
 * 检测从 baseRef 到 HEAD 之间变更的文件
 */
function detectChangedFiles(baseRef) {
  try {
    if (baseRef) {
      const out = run(`git diff --name-only ${baseRef}...HEAD`);
      return out ? out.split('\n') : [];
    }
  } catch (_) {
    // fallback
  }
  // 如果没有 baseRef，检测所有文件
  return [];
}

async function main() {
  const { bump, dryRun, overrideReason } = parseArgs(process.argv);
  if (!bump) {
    console.error('用法: node scripts/release-smart.js <patch|minor|major> [--dry] [--override-reason="..."]');
    process.exit(1);
  }

  const lastTag = findLastReleaseTag();
  log(`开始检测变更 (bump=${bump}${lastTag ? `, since=${lastTag}` : ''}${dryRun ? ', dry-run' : ''})`);

  const files = detectChangedFiles(lastTag);
  let changed = detectChangedPackages(files);
  changed = refineMcpPublish(changed, files, { log });
  changed = ensureDerivedMcpPublish(changed, { log });
  changed = orderReleaseKeys(changed);

  if (changed.length === 0) {
    log('未检测到需要发布的包，已退出');
    return;
  }

  log(`检测到变更包: ${changed.join(', ')}`);

  // 发版 bump 门禁 G1（按包独立评估）
  const snapshotRes = getSnapshotDiffInRange(lastTag, files);

  const { checkReleaseBumpGate } = require('./lib/release-bump-gate');
  const gateFailures = [];
  const gateSummaries = [];

  for (const key of changed) {
    const meta = PACKAGES[key];
    let pkgVersion = '1.0.0';
    if (meta) {
      const pkgJsonPath = path.join(meta.dir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          pkgVersion = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version || '1.0.0';
        } catch (_) {}
      }
    }
    const isZeroMajor = pkgVersion.startsWith('0.');

    const pkgPaths = meta ? [meta.dir, ...(meta.extraInputs || [])] : [];
    if (key === 'components') {
      pkgPaths.push('api-snapshot/', ':(exclude)api-snapshot/hooks.json');
    } else if (key === 'hooks') {
      pkgPaths.push('api-snapshot/hooks.json');
    }

    const pkgCommits = lastTag ? getCommitsBetween(lastTag, pkgPaths) : [];
    const pkgFiles = files.filter(f => {
      const norm = f.replace(/\\/g, '/');
      if (meta && matchesPackageDir(norm, meta.dir)) return true;
      if (meta && meta.extraInputs && meta.extraInputs.some(input => matchesExtraInput(norm, input))) return true;
      if (key === 'components' && norm.startsWith('api-snapshot/') && norm !== 'api-snapshot/hooks.json') return true;
      if (key === 'hooks' && norm === 'api-snapshot/hooks.json') return true;
      return false;
    });

    let pkgSnapshotChanged = false;
    if (key === 'components') {
      pkgSnapshotChanged = snapshotRes.files.some(f => f !== 'api-snapshot/hooks.json');
    } else if (key === 'hooks') {
      pkgSnapshotChanged = snapshotRes.files.includes('api-snapshot/hooks.json');
    }

    const gateResult = checkReleaseBumpGate({
      commits: pkgCommits,
      files: pkgFiles,
      targetBump: bump,
      overrideReason,
      snapshotChanged: pkgSnapshotChanged,
      isZeroMajor,
    });

    gateSummaries.push({
      key,
      version: pkgVersion,
      requiredBump: gateResult.requiredBump,
      ok: gateResult.ok,
      overridden: gateResult.overridden,
      overrideReason: gateResult.overrideReason,
    });

    if (!gateResult.ok) {
      gateFailures.push({
        key,
        version: pkgVersion,
        requiredBump: gateResult.requiredBump,
        reasons: gateResult.reasons,
      });
    }
  }

  log(`[gate] 待发包 bump 门禁评估:`);
  gateSummaries.forEach(s => {
    log(
      `  - [${s.key}@${s.version}] 最低要求=${s.requiredBump}, 当前目标=${bump}, 校验=${s.ok ? '通过' : '未通过'}${
        s.overridden ? ` (已通过 override 放行: ${s.overrideReason})` : ''
      }`
    );
  });

  if (gateFailures.length > 0) {
    console.error('\n❌ [release-smart] 发版 bump 门禁拦截！以下待发包未满足最低版本要求：');
    gateFailures.forEach(f => {
      console.error(`  📦 [${f.key}@${f.version}] 要求升级至 ≥ ${f.requiredBump}：`);
      f.reasons.forEach(r => console.error(`     - ${r}`));
    });
    console.error('\n如确需以当前版本类型强制发布，请提供 --override-reason="说明原因" 或设置 RELEASE_OVERRIDE_REASON 环境变量。\n');
    process.exit(1);
  }

  // 只更新有变更的包的版本号
  const summary = [];
  for (const key of changed) {
    const meta = PACKAGES[key];
    const pkgJsonPath = path.join(meta.dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      log(`跳过: 未找到 ${pkgJsonPath}`);
      continue;
    }
    const pkg = readJSON(pkgJsonPath);
    const oldVersion = pkg.version;
    const newVersion = bumpSemver(oldVersion, bump);

    if (key === 'mcp' && meta.changelog && !isMcpRuntimeChange(files)) {
      const inserted = ensureMcpIndexChangelog(meta.changelog, newVersion, { dryRun });
      if (inserted) {
        log(
          dryRun
            ? `@yss/mcp 索引同步将自动补充 changelog ## v${newVersion}`
            : `@yss/mcp 已自动补充索引同步 changelog ## v${newVersion}`
        );
      }
    }

    if (dryRun) {
      log(`${meta.name} 版本(预览): ${oldVersion} -> ${newVersion}`);
      summary.push({ name: meta.name, oldVersion, newVersion });
      continue;
    }

    pkg.version = newVersion;
    writeJSON(pkgJsonPath, pkg);
    log(`${meta.name} 版本: ${oldVersion} -> ${newVersion}`);
    summary.push({ name: meta.name, oldVersion, newVersion });
  }

  if (dryRun) {
    log('[dry-run] 跳过日志生成、构建与发布');
    return;
  }

  // 使用 standard-version 生成更新日志（但不改变版本号）
  log('生成更新日志...');
  try {
    // --skip.bump: 跳过版本号变更（已经手动处理了）
    // --skip.commit: 跳过自动 commit（我们会手动 commit）
    // --skip.tag: 跳过自动 tag（我们会手动 tag）
    run('npx standard-version --skip.bump --skip.commit --skip.tag', { stdio: 'inherit' });
  } catch (e) {
    log('日志生成失败（继续执行）: ' + e.message);
  }

  // 运行分包日志生成
  log('生成分包日志...');
  try {
    run('node scripts/generate-changelog.js', { stdio: 'inherit' });
  } catch (e) {
    log('分包日志生成失败（继续执行）: ' + e.message);
  }

  // 构建并发布每个包
  for (const key of changed) {
    const meta = PACKAGES[key];
    if (key === 'mcp') {
      log('重建并校验 @yss-ui/mcp 发布索引');
      rebuildMcpIndex();
      validateMcpIndex();
    }
    log(`开始构建 ${meta.name}`);
    try {
      run(`pnpm --filter ${meta.name} run build`, { stdio: 'inherit' });
    } catch (err) {
      console.error(err.stdout || err.message || err);
      process.exit(1);
    }

    log(`发布 ${meta.name}`);
    try {
      run(`pnpm --filter ${meta.name} publish --no-git-checks`, { stdio: 'inherit' });
    } catch (err) {
      console.error(err.stdout || err.message || err);
      process.exit(1);
    }

    if (key === 'mcp') {
      const hash = persistMcpIndexHash();
      if (hash) log(`已写入 mcp 索引哈希 ${hash.slice(0, 12)}…`);
    }
  }

  // 创建 git commit 和 tag
  const pkgNames = summary.map(s => s.name.replace('@yss-ui/', '')).join(', ');
  const commitMsg = `chore(release): ${bump} ${changed.length} package(s): ${pkgNames} [skip ci]`;

  log('创建 commit...');
  try {
    run('git add .');
    run(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
  } catch (e) {
    log('Commit 失败: ' + e.message);
  }

  // 创建 tag（使用第一个包的新版本号）
  const firstPkgVersion = summary[0].newVersion;
  const tagName = `v${firstPkgVersion}`;
  log(`创建 tag: ${tagName}`);
  try {
    run(`git tag ${tagName}`);
  } catch (e) {
    log('Tag 创建失败: ' + e.message);
  }

  log('✅ 发布流程完成');
  log(`📝 请执行: git push --follow-tags origin <branch>`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
