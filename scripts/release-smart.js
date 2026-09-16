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
  const result = { bump: null, dryRun: false };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry' || a === '--dry-run') result.dryRun = true;
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
  const { bump, dryRun } = parseArgs(process.argv);
  if (!bump) {
    console.error('用法: node scripts/release-smart.js <patch|minor|major> [--dry]');
    process.exit(1);
  }

  const lastTag = findLastReleaseTag();
  log(`开始检测变更 (bump=${bump}${lastTag ? `, since=${lastTag}` : ''}${dryRun ? ', dry-run' : ''})`);

  const files = detectChangedFiles(lastTag);
  let changed = detectChangedPackages(files);
  changed = orderReleaseKeys(refineMcpPublish(changed, files, { log }));

  if (changed.length === 0) {
    log('未检测到需要发布的包，已退出');
    return;
  }

  log(`检测到变更包: ${changed.join(', ')}`);

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
