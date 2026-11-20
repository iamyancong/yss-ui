/**
 * 自动从 docs/changelog 提取最新版本号与发布日期，生成首页 ReleasePulse 所需数据。
 *
 * 运行时机：
 * 1. pnpm docs:prepare (predev / prebuild)
 * 2. Dockerfile 构建阶段
 * 3. CI 发版阶段
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { HOME_PRODUCT_HIGHLIGHTS } = require('./home-release-positioning');

const ROOT_DIR = path.resolve(__dirname, '../..');
const OUTPUT_FILE = path.join(ROOT_DIR, '.dumi/theme/slots/Features/generated-releases.json');

/**
 * 产品线发布配置。
 *
 * highlight 来自独立的长期产品定位契约，禁止用单次发版摘要替换。
 */
const RELEASE_CONFIGS = [
  {
    key: 'components',
    pkg: '@yss-ui/components',
    changelog: 'docs/changelog/components.md',
    pkgJson: 'packages/components/package.json',
    highlight: HOME_PRODUCT_HIGHLIGHTS.components,
    link: '/changelog/components',
    tone: 'blue',
  },
  {
    key: 'skills',
    pkg: '@yss-ui/skills',
    changelog: 'docs/changelog/skills.md',
    pkgJson: 'packages/skills/package.json',
    highlight: HOME_PRODUCT_HIGHLIGHTS.skills,
    link: '/changelog/skills',
    tone: 'purple',
  },
  {
    key: 'mcp',
    pkg: '@yss-ui/mcp',
    changelog: 'docs/changelog/mcp.md',
    pkgJson: 'packages/mcp/package.json',
    highlight: HOME_PRODUCT_HIGHLIGHTS.mcp,
    link: '/changelog/mcp',
    tone: 'cyan',
  },
];

/**
 * 从 changelog 文件中解析最新版本号与日期
 *
 * @param {string} relativePath changelog 文件相对路径
 * @returns {{ version?: string, date?: string }}
 */
function parseLatestFromChangelog(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    return {};
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  // 匹配第一个 "## vX.Y.Z" 或 "## X.Y.Z"
  const versionMatch = content.match(/^##\s+(?:v)?(\d+\.\d+\.\d+(?:-[\w.]+)?)/m);
  if (!versionMatch) {
    return {};
  }

  const version = `v${versionMatch[1]}`;
  const versionIndex = versionMatch.index;

  // 在版本标题后查找紧随其后的日期 "`YYYY-MM-DD`"
  const afterVersion = content.slice(versionIndex);
  const dateMatch = afterVersion.match(/`(\d{4}-\d{2}-\d{2})`/);
  const date = dateMatch ? dateMatch[1] : undefined;

  return { version, date };
}

/**
 * 从 package.json 中读取版本号兜底
 *
 * @param {string} relativePath package.json 相对路径
 * @returns {string | undefined}
 */
function parseVersionFromPkgJson(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    return undefined;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return pkg.version ? `v${pkg.version}` : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * 构建首页版本动态数据，不产生文件写入。
 *
 * @returns {Array<{ key: string, pkg: string, version: string, date: string, highlight: string, link: string, tone: string }>}
 */
function buildHomeReleases() {
  return RELEASE_CONFIGS.map(item => {
    const fromChangelog = parseLatestFromChangelog(item.changelog);
    const fallbackVersion = parseVersionFromPkgJson(item.pkgJson) || 'v1.0.0';

    const version = fromChangelog.version || fallbackVersion;
    const date = fromChangelog.date || new Date().toISOString().slice(0, 10);

    return {
      key: item.key,
      pkg: item.pkg,
      version,
      date,
      highlight: item.highlight,
      link: item.link,
      tone: item.tone,
    };
  });
}

/**
 * 生成首页 ReleasePulse 数据文件。
 *
 * @returns {Array<{ key: string, pkg: string, version: string, date: string, highlight: string, link: string, tone: string }>}
 */
function generateHomeReleases() {
  const result = buildHomeReleases();

  // 确保输出目录存在
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`[generate-home-releases] ✅ 成功生成首页版本动态数据: ${OUTPUT_FILE}`);
  result.forEach(item => {
    console.log(`  - ${item.pkg}: ${item.version} (${item.date})`);
  });
}

if (require.main === module || require.main?.filename === path.resolve(__dirname, "../generate-home-releases.js")) {
  generateHomeReleases();
}

module.exports = { buildHomeReleases, generateHomeReleases };
