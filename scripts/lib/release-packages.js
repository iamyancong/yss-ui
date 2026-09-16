/**
 * 发版包注册表与变更检测：CI（release-changed）与本地 smart 发版的唯一来源。
 *
 * `@yss-ui/mcp` 是派生快照包：payload 来自文档 / Demo / Skills / 规则，
 * 不能只按 `packages/mcp/` 目录判断是否需要发布。
 */

'use strict';

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');

/** @typedef {{ dir: string, name: string, changelog?: string, extraInputs?: string[], indexHashFile?: string }} PackageMeta */

/**
 * 可发布包注册表。
 *
 * extraInputs：目录以 `/` 结尾按前缀匹配，否则按精确文件匹配。
 *
 * @type {Record<string, PackageMeta>}
 */
const PACKAGES = {
  components: { dir: 'packages/components', name: '@yss-ui/components', changelog: 'docs/changelog/components.md' },
  hooks: { dir: 'packages/hooks', name: '@yss-ui/hooks', changelog: 'docs/changelog/hooks.md' },
  theme: { dir: 'packages/theme', name: '@yss-ui/theme' },
  utils: { dir: 'packages/utils', name: '@yss-ui/utils', changelog: 'docs/changelog/utils.md' },
  'skills-cli': { dir: 'packages/skills-cli', name: '@yss-ui/skills-cli' },
  skills: { dir: 'packages/skills', name: '@yss-ui/skills', changelog: 'docs/changelog/skills.md' },
  mcp: {
    dir: 'packages/mcp',
    name: '@yss-ui/mcp',
    changelog: 'docs/changelog/mcp.md',
    extraInputs: ['docs/components/', 'docs/hooks/', 'docs/utils/', 'packages/skills/', '.dumirc.ts', '.cursorrules'],
    indexHashFile: 'packages/mcp/index.hash',
  },
};

/** MCP 索引 JSON 路径（gitignore，发布时由 build-index 生成）。 */
const MCP_INDEX_JSON = 'packages/mcp/data/index.json';

/** 组件包 package.json 路径，用于校验 MCP 索引是否跟随组件包版本。 */
const COMPONENTS_PACKAGE_JSON = 'packages/components/package.json';

/**
 * 重建 MCP 发布索引。
 *
 * @returns {void}
 */
function rebuildMcpIndex() {
  execSync('node packages/mcp/scripts/build-index.js', { stdio: 'inherit' });
}

/**
 * 校验待发布的 MCP 索引与组件包消费契约保持一致。
 *
 * @param {{ indexPath?: string, componentsPackagePath?: string }} [options] 测试或特殊工作区路径
 * @returns {object} 已校验的索引对象
 */
function validateMcpIndex(options = {}) {
  const indexPath = options.indexPath || MCP_INDEX_JSON;
  const componentsPackagePath = options.componentsPackagePath || COMPONENTS_PACKAGE_JSON;
  if (!fs.existsSync(indexPath)) {
    throw new Error(`MCP 索引不存在：${indexPath}`);
  }
  const componentsPackage = JSON.parse(fs.readFileSync(componentsPackagePath, 'utf8'));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const contract = index.consumptionContract || {};
  const expectedVersion = componentsPackage.version;
  const actualVersions = [index.componentsVersion, contract.componentsVersion];
  if (actualVersions.some(version => version !== expectedVersion)) {
    throw new Error(`MCP 索引版本未对齐组件包 ${expectedVersion}：${actualVersions.join(', ') || '缺失'}`);
  }
  const expectedVitePeer = componentsPackage.peerDependencies?.vite;
  if (
    !expectedVitePeer ||
    contract.plugin?.vitePeer !== expectedVitePeer ||
    contract.peerDependencies?.vite !== expectedVitePeer
  ) {
    throw new Error(
      `MCP 索引 Vite peer 未对齐组件包 peerDependencies.vite：${contract.plugin?.vitePeer} / ${contract.peerDependencies?.vite} !== ${expectedVitePeer}`
    );
  }
  return index;
}

/**
 * 路径是否落在包目录下（`packages/<dir>/` 前缀）。
 *
 * @param {string} normalized 正斜杠路径
 * @param {string} dir 包目录
 * @returns {boolean}
 */
function matchesPackageDir(normalized, dir) {
  const packageDir = dir.replace(/\/$/, '');
  return normalized === packageDir || normalized.startsWith(`${packageDir}/`);
}

/**
 * 路径是否命中 extraInput：目录前缀或精确文件。
 *
 * @param {string} normalized 正斜杠路径
 * @param {string} spec extraInput 规格
 * @returns {boolean}
 */
function matchesExtraInput(normalized, spec) {
  if (!spec.endsWith('/')) {
    return normalized === spec;
  }
  const dir = spec.replace(/\/$/, '');
  return normalized === dir || normalized.startsWith(`${dir}/`);
}

/**
 * 根据变更文件检测需要发布的包。
 *
 * 不把 `docs/guide/`、`docs/changelog/`、`docs/skills/`、`docs/audits/`、`.dumi/`
 * 算作 mcp 输入——它们不在 extraInputs 里。
 *
 * @param {string[]} files 变更文件路径
 * @param {Record<string, PackageMeta>} [packages] 包注册表，默认 PACKAGES
 * @returns {string[]} 变更包 key 列表（插入顺序）
 */
function detectChangedPackages(files, packages = PACKAGES) {
  const changed = new Set();
  const entries = Object.entries(packages);
  files.forEach(f => {
    if (!f) return;
    const normalized = f.replace(/\\/g, '/');
    for (const [key, meta] of entries) {
      if (matchesPackageDir(normalized, meta.dir)) {
        changed.add(key);
        continue;
      }
      for (const input of meta.extraInputs || []) {
        if (matchesExtraInput(normalized, input)) {
          changed.add(key);
        }
      }
    }
  });
  return Array.from(changed);
}

/**
 * 是否变更了 mcp 运行时（lib/bin/scripts/package.json/README），不含 index.hash。
 *
 * @param {string[]} files 变更文件路径
 * @returns {boolean}
 */
function isMcpRuntimeChange(files) {
  return files.some(f => {
    if (!f) return false;
    const normalized = f.replace(/\\/g, '/');
    if (!matchesPackageDir(normalized, 'packages/mcp')) return false;
    if (normalized === 'packages/mcp/index.hash') return false;
    return true;
  });
}

/**
 * 去掉 generatedAt 后做稳定序列化，供内容哈希使用。
 *
 * @param {object} index 索引对象
 * @returns {string} 规范 JSON
 */
function canonicalizeIndex(index) {
  const clone = { ...index };
  delete clone.generatedAt;
  return JSON.stringify(clone);
}

/**
 * 计算索引内容哈希（忽略 generatedAt）。
 *
 * @param {object} index 索引对象
 * @returns {string} sha256 hex
 */
function hashIndexContent(index) {
  return crypto.createHash('sha256').update(canonicalizeIndex(index)).digest('hex');
}

/**
 * 读取已入库的索引哈希。文件不存在返回 null。
 *
 * @param {string} [hashFile] 哈希文件路径
 * @returns {string | null}
 */
function readStoredIndexHash(hashFile = PACKAGES.mcp.indexHashFile) {
  if (!hashFile || !fs.existsSync(hashFile)) return null;
  const value = fs.readFileSync(hashFile, 'utf8').trim();
  return value || null;
}

/**
 * 将哈希写入 git 跟踪文件（不进入 npm pack）。
 *
 * @param {string} hash sha256 hex
 * @param {string} [hashFile] 哈希文件路径
 */
function writeIndexHash(hash, hashFile = PACKAGES.mcp.indexHashFile) {
  fs.writeFileSync(hashFile, `${hash}\n`, 'utf8');
}

/**
 * 重建 MCP 索引并计算内容哈希。只能在 yss-ui 仓库根目录调用。
 *
 * @returns {string} sha256 hex
 */
function computeCurrentIndexHash() {
  rebuildMcpIndex();
  const index = JSON.parse(fs.readFileSync(MCP_INDEX_JSON, 'utf8'));
  return hashIndexContent(index);
}

/**
 * 发布成功后把当前 data/index.json 的内容哈希写入 index.hash。
 *
 * @param {string} [hashFile] 哈希文件路径
 * @returns {string | null} 写入的哈希；索引不存在时返回 null
 */
function persistMcpIndexHash(hashFile = PACKAGES.mcp.indexHashFile) {
  if (!fs.existsSync(MCP_INDEX_JSON)) return null;
  const index = JSON.parse(fs.readFileSync(MCP_INDEX_JSON, 'utf8'));
  const hash = hashIndexContent(index);
  writeIndexHash(hash, hashFile);
  return hash;
}

/**
 * 精筛 mcp：无运行时变更且索引内容哈希未变则从待发集合去掉。
 * 哈希文件缺失视为需要发布（消化相对上次 npm 包的文档漂移）。
 *
 * @param {string[]} changed 粗筛后的包 key
 * @param {string[]} files 变更文件
 * @param {{ log?: (msg: string) => void, computeIndexHash?: () => string, storedHash?: string | null }} [options]
 * @returns {string[]} 精筛后的包 key
 */
function refineMcpPublish(changed, files, options = {}) {
  const log = options.log || (() => {});
  if (!changed.includes('mcp')) return changed;

  if (isMcpRuntimeChange(files)) {
    log('mcp 运行时文件变更，将发布 @yss-ui/mcp');
    return changed;
  }

  let currentHash;
  try {
    const compute = options.computeIndexHash || computeCurrentIndexHash;
    currentHash = compute();
  } catch (err) {
    log(`mcp 索引构建失败，保留待发布: ${err.message}`);
    return changed;
  }

  const storedHash = options.storedHash !== undefined ? options.storedHash : readStoredIndexHash();
  if (storedHash == null) {
    log('mcp 索引哈希文件不存在，将发布 @yss-ui/mcp');
    return changed;
  }
  if (currentHash === storedHash) {
    log('mcp 索引内容未变化，跳过 @yss-ui/mcp');
    return changed.filter(key => key !== 'mcp');
  }
  log('mcp 索引内容已变化，将发布 @yss-ui/mcp');
  return changed;
}

/**
 * 判断 changelog 是否已有目标版本标题。
 *
 * @param {string} filePath changelog 路径
 * @param {string} version 版本号（不含 v）
 * @returns {boolean}
 */
function hasChangelogVersion(filePath, version) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const versionRegex = new RegExp(`^##\\s+v${escapedVersion}\\s*$`, 'm');
  return versionRegex.test(content);
}

/**
 * 本地日历日 YYYY-MM-DD。
 *
 * @param {Date} [now]
 * @returns {string}
 */
function todayLocal(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 为 mcp 索引同步自动插入目标版本块。运行时变更不要调用本函数。
 *
 * @param {string} filePath changelog 路径
 * @param {string} version 目标版本
 * @param {{ dryRun?: boolean, date?: string }} [options]
 * @returns {boolean} 是否插入（或 dry-run 下本应插入）
 */
function ensureMcpIndexChangelog(filePath, version, options = {}) {
  if (hasChangelogVersion(filePath, version)) return false;
  if (!fs.existsSync(filePath)) return false;

  const date = options.date || todayLocal();
  const block = [
    `## v${version}`,
    '',
    `\`${date}\``,
    '',
    '### 📝 Documentation',
    '',
    '- **索引同步**: 重建并发布文档索引（组件 API / Demo / Skills / 代码生成规则）。',
    '',
    '',
  ].join('\n');

  if (options.dryRun) return true;

  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^## v/m);
  const next = match
    ? `${content.slice(0, match.index)}${block}${content.slice(match.index)}`
    : `${content.trimEnd()}\n\n${block}`;
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

module.exports = {
  PACKAGES,
  MCP_INDEX_JSON,
  rebuildMcpIndex,
  validateMcpIndex,
  detectChangedPackages,
  isMcpRuntimeChange,
  matchesPackageDir,
  matchesExtraInput,
  canonicalizeIndex,
  hashIndexContent,
  readStoredIndexHash,
  writeIndexHash,
  computeCurrentIndexHash,
  persistMcpIndexHash,
  refineMcpPublish,
  hasChangelogVersion,
  todayLocal,
  ensureMcpIndexChangelog,
};
