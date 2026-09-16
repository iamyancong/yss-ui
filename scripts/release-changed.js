#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  PACKAGES,
  detectChangedPackages,
  isMcpRuntimeChange,
  refineMcpPublish,
  rebuildMcpIndex,
  validateMcpIndex,
  persistMcpIndexHash,
  hasChangelogVersion,
  ensureMcpIndexChangelog,
} = require('./lib/release-packages');
const { generateHomeReleases } = require('./generate-home-releases');

// 收集本次发布的摘要信息，供 CI 提交信息使用
const releaseSummaryEntries = [];

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[release] ${message}`);
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
  const result = { bump: null, base: null, dryRun: false };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry' || a === '--dry-run') result.dryRun = true;
    else if (a.startsWith('--base=')) result.base = a.slice('--base='.length);
    else if (a.startsWith('--since=') || a.startsWith('--base-ref=')) result.base = a.split('=')[1];
    else positional.push(a);
  }
  if (positional[0] && ['patch', 'minor', 'major'].includes(positional[0])) {
    result.bump = positional[0];
  }
  return result;
}

/**
 * 尝试找到上一次发布提交（commit message 以 "chore(release): bump packages" 开头）
 * 若找不到则返回 null，由调用方决定兜底策略。
 */
function findLastReleaseCommit() {
  try {
    // 优先在当前分支查找；若没有则返回空
    // 匹配所有 release 格式: "chore(release): bump packages" 或 "chore(release): patch N package(s)"
    const out = run('git log -n 1 --grep "^chore(release):" --pretty=format:%H');
    return out || null;
  } catch (_) {
    return null;
  }
}

/**
 * 解析比较基线：
 * 1) 如命令行提供 --base，则直接使用
 * 2) 否则使用上一次发布提交
 * 3) 再否则退化为仓库初始提交
 */
function resolveBaseRef(baseArg) {
  if (baseArg) return baseArg;
  const last = findLastReleaseCommit();
  if (last) return last;
  try {
    return run('git rev-list --max-parents=0 HEAD');
  } catch (_) {
    return null;
  }
}

/**
 * 检测变更的文件列表
 *
 * @param {string} baseRef - 比较的基准 commit
 * @returns {string[]} 变更的文件路径列表
 */
function detectChangedFiles(baseRef) {
  try {
    if (baseRef) {
      // Changed files since baseRef
      const out = run(`git diff --name-only ${baseRef}...HEAD`);
      const allFiles = out ? out.split('\n').filter(Boolean) : [];

      // 获取从 baseRef 到 HEAD 之间的所有 commit
      const commits = run(`git log --format=%H ${baseRef}..HEAD`).split('\n').filter(Boolean);

      // 收集所有发布 commit 中仅修改的 package.json 文件
      const releaseOnlyPackageJsons = new Set();
      for (const commit of commits) {
        try {
          const msg = run(`git log -1 --format=%s ${commit}`);
          // 检查是否是发布 commit
          if (msg.startsWith('chore(release):')) {
            // 获取该 commit 修改的文件
            const commitFiles = run(`git diff-tree --no-commit-id --name-only -r ${commit}`)
              .split('\n')
              .filter(Boolean);
            // 如果该 commit 只修改了 package.json 文件，则记录这些文件
            const onlyPackageJsons = commitFiles.every(f => f.endsWith('package.json')) && commitFiles.length > 0;
            if (onlyPackageJsons) {
              commitFiles.forEach(f => releaseOnlyPackageJsons.add(f));
            }
          }
        } catch (_) {
          // ignore individual commit errors
        }
      }

      // 过滤掉发布 commit 中仅修改的 package.json
      const filteredFiles = allFiles.filter(file => !releaseOnlyPackageJsons.has(file));
      return filteredFiles;
    }
  } catch (_) {
    // ignore and fall back to status
  }
  // Default: use working tree changes (staged + unstaged + untracked)
  let files = [];
  try {
    const status = run('git status --porcelain');
    files = status
      ? status
          .split('\n')
          .filter(Boolean)
          .map(line => line.slice(3).trim())
      : [];
  } catch (_) {
    files = [];
  }
  try {
    const untracked = run('git ls-files --others --exclude-standard');
    if (untracked) files.push(...untracked.split('\n'));
  } catch (_) {
    // ignore
  }
  return Array.from(new Set(files));
}

/**
 * 生成待发布包的版本计划。
 *
 * @param {string[]} changed - 变更包 key 列表
 * @param {string} bump - 版本升级类型
 * @returns {Array<{key: string, meta: object, pkgJsonPath: string, oldVersion: string, newVersion: string, pkg: object}>}
 */
function createReleasePlan(changed, bump) {
  const plan = [];
  for (const key of changed) {
    const meta = PACKAGES[key];
    const pkgJsonPath = path.join(meta.dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      log(`跳过: 未找到 ${pkgJsonPath}`);
      // eslint-disable-next-line no-continue
      continue;
    }
    const pkg = readJSON(pkgJsonPath);
    const oldVersion = pkg.version;
    const newVersion = bumpSemver(oldVersion, bump);
    plan.push({ key, meta, pkgJsonPath, oldVersion, newVersion, pkg });
  }
  return plan;
}

/**
 * 发布前校验 changelog 是否包含目标版本。
 *
 * @param {Array<{key: string, meta: object, newVersion: string}>} releasePlan - 待发布包计划
 * @param {{ dryRun?: boolean, autoInsertedKeys?: string[] }} [options] - 校验选项
 */
function validateReleaseChangelogs(releasePlan, options = {}) {
  const { dryRun = false, autoInsertedKeys = [] } = options;
  const errors = [];
  for (const item of releasePlan) {
    const { key, meta, newVersion } = item;
    if (!meta.changelog) {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (dryRun && autoInsertedKeys.includes(key)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (!hasChangelogVersion(meta.changelog, newVersion)) {
      errors.push(`${meta.name} 缺少 ${meta.changelog} 中的 ## v${newVersion}`);
    }
  }

  if (errors.length > 0) {
    errors.forEach(message => {
      // eslint-disable-next-line no-console
      console.error(`[release] ${message}`);
    });
    throw new Error('发布前 changelog 校验失败，请补充目标版本更新日志后重试');
  }
}

/**
 * 当组件包进入发版计划时，校验其精确锁定的第三方运行时制品可从当前 Registry 下载。
 *
 * @param {Array<{key: string}>} releasePlan - 待发布包计划
 * @returns {void}
 */
function validateComponentRegistryArtifacts(releasePlan) {
  if (!releasePlan.some(item => item.key === 'components')) return;
  log('校验 @yss-ui/components 第三方运行时制品');
  run('pnpm check:registry-artifacts', { stdio: 'inherit' });
}

function ensureWorkspaceRoot() {
  const root = process.cwd();
  const expected = ['packages', 'pnpm-workspace.yaml'];
  const exists = expected.every(p => fs.existsSync(path.join(root, p)));
  if (!exists) {
    throw new Error('请在仓库根目录执行该命令');
  }
}

function saveReleaseSummary(entries) {
  try {
    const outPath = path.join('scripts', '.release-summary.json');
    const payload = { packages: entries };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (_) {
    // ignore summary write errors
  }
}

async function main() {
  ensureWorkspaceRoot();
  const { bump, base, dryRun } = parseArgs(process.argv);
  if (!bump) {
    // eslint-disable-next-line no-console
    console.error('用法: node scripts/release-changed.js <patch|minor|major> [--base=<git-ref>] [--dry]');
    process.exit(1);
  }

  const resolvedBase = resolveBaseRef(base);
  log(`开始检测变更 (bump=${bump}${resolvedBase ? `, base=${resolvedBase}` : ''}${dryRun ? ', dry-run' : ''})`);
  const files = detectChangedFiles(resolvedBase);
  let changed = detectChangedPackages(files);
  changed = refineMcpPublish(changed, files, { log });
  if (changed.length === 0) {
    log('未检测到需要发布的包，已退出');
    // 清理上一次可能遗留的摘要文件
    try {
      const outPath = path.join('scripts', '.release-summary.json');
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch (_) {
      // ignore
    }
    return;
  }

  log(`检测到变更包: ${changed.join(', ')}`);
  const releasePlan = createReleasePlan(changed, bump);
  if (releasePlan.length === 0) {
    log('未生成有效发布计划，已退出');
    return;
  }

  if (dryRun) {
    releasePlan.forEach(item => {
      log(`${item.meta.name} 版本(预览): ${item.oldVersion} -> ${item.newVersion}`);
    });
  }

  const mcpItem = releasePlan.find(item => item.key === 'mcp');
  const autoInsertedKeys = [];
  if (mcpItem && !isMcpRuntimeChange(files)) {
    const inserted = ensureMcpIndexChangelog(mcpItem.meta.changelog, mcpItem.newVersion, { dryRun });
    if (inserted) {
      autoInsertedKeys.push('mcp');
      log(
        dryRun
          ? `@yss/mcp 索引同步将自动补充 changelog ## v${mcpItem.newVersion}`
          : `@yss/mcp 已自动补充索引同步 changelog ## v${mcpItem.newVersion}`
      );
    }
  }

  validateReleaseChangelogs(releasePlan, { dryRun, autoInsertedKeys });
  validateComponentRegistryArtifacts(releasePlan);

  // 依次处理每个包：版本号 + 构建 + 发布
  for (const item of releasePlan) {
    const { meta, pkgJsonPath, oldVersion, newVersion, pkg } = item;
    if (dryRun) {
      log(`[dry-run] 跳过写入、构建与发布: ${meta.name}`);
      releaseSummaryEntries.push({ name: meta.name, oldVersion, newVersion });
      // eslint-disable-next-line no-continue
      continue;
    }

    pkg.version = newVersion;
    writeJSON(pkgJsonPath, pkg);
    log(`${meta.name} 版本: ${oldVersion} -> ${newVersion}`);
    releaseSummaryEntries.push({ name: meta.name, oldVersion, newVersion });

    if (item.key === 'mcp') {
      log('重建并校验 @yss-ui/mcp 发布索引');
      rebuildMcpIndex();
      validateMcpIndex();
    }

    // 构建
    log(`开始构建 ${meta.name}`);
    try {
      run(`pnpm --filter ${meta.name} run build`, { stdio: 'inherit' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err.stdout || err.message || err);
      process.exit(1);
    }

    // 发布
    const publishRegistry = process.env.NPM_PUBLISH_REGISTRY || 'https://registry.npmjs.org/';
    log(`发布 ${meta.name}@${newVersion} 至 ${publishRegistry}`);
    try {
      run(`pnpm --filter ${meta.name} publish --no-git-checks --registry=${publishRegistry}`, { stdio: 'inherit' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err.stdout || err.message || err);
      process.exit(1);
    }

    if (item.key === 'mcp') {
      const hash = persistMcpIndexHash();
      if (hash) log(`已写入 mcp 索引哈希 ${hash.slice(0, 12)}…`);
    }
  }

  log('发布流程完成');
  // 将本次发布摘要写入文件，供 CI 读取生成更清晰的提交信息
  if (!dryRun) {
    saveReleaseSummary(releaseSummaryEntries);
    try {
      generateHomeReleases();
    } catch (_) {
      // ignore home release generation error
    }
  }
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
