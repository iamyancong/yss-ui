const fs = require('fs');
const http = require('http');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ========== 配置 ==========

const WECOM_KEY = process.env.WECOM_WEBHOOK_KEY;
const CI_API_V4_URL = process.env.CI_API_V4_URL;
const CI_JOB_TOKEN = process.env.CI_JOB_TOKEN;
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME || 'unknown';
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA || 'unknown';
const GITLAB_USER_NAME = process.env.GITLAB_USER_NAME || process.env.GITLAB_USER_LOGIN || 'CI/CD';

// 是否为 dry-run 模式（本地测试用）
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');

const DOCS_BASE = process.env.DOCS_BASE_URL || 'https://iamyancong.github.io/yss-ui';

/**
 * 包配置映射
 * 定义每个包对应的 changelog 文件、显示标题和 emoji
 */
const PACKAGE_CONFIG = {
  '@yss-ui/components': {
    changelog: 'components.md',
    title: 'YSS UI 组件库',
    emoji: '📦',
    docsUrl: `${DOCS_BASE}/changelog/components`,
  },
  '@yss-ui/hooks': {
    changelog: 'hooks.md',
    title: 'YSS UI Hooks',
    emoji: '🪝',
    docsUrl: `${DOCS_BASE}/changelog/hooks`,
  },
  '@yss-ui/utils': {
    changelog: 'utils.md',
    title: 'YSS UI 工具库',
    emoji: '🔧',
    docsUrl: `${DOCS_BASE}/changelog/utils`,
  },
  '@yss-ui/skills': {
    changelog: 'skills.md',
    title: 'YSS AI Skills',
    emoji: '🤖',
    docsUrl: `${DOCS_BASE}/skills`,
  },
  '@yss-ui/mcp': {
    changelog: 'mcp.md',
    title: 'YSS MCP 文档服务',
    emoji: '🔌',
    docsUrl: `${DOCS_BASE}/guide/mcp`,
  },
  '@yss-ui/theme': {
    changelog: null, // 主题包暂无独立 changelog
    title: 'YSS UI 主题',
    emoji: '🎨',
    docsUrl: null,
  },
  '@yss-ui/skills-cli': {
    changelog: null, // CLI 工具暂无独立 changelog
    title: 'YSS Skills CLI',
    emoji: '⌨️',
    docsUrl: null,
  },
};

// ========== 工具函数 ==========

/**
 * 读取发布摘要文件，获取本次发布的包列表
 * @returns {Array<{name: string, oldVersion: string, newVersion: string}>}
 */
function readReleaseSummary() {
  const summaryPath = path.resolve(__dirname, '../.release-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    return Array.isArray(data.packages) ? data.packages : [];
  } catch (err) {
    console.warn('Failed to read release summary:', err.message);
    return [];
  }
}

/**
 * 解析 Changelog 文件中指定版本的内容块
 * @param {string} filePath - Changelog 文件路径
 * @param {string} targetVersion - 目标版本号（不含 v 前缀）
 * @returns {{date: string, lines: Array<{type: string, content: string}>} | null}
 */
function parseChangelog(filePath, targetVersion) {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  // 匹配版本标题行，例如 ## v1.1.35
  const versionRegex = new RegExp(`^##\\s+v${targetVersion.replace(/\./g, '\\.')}\\s*$`, 'm');
  const match = content.match(versionRegex);

  if (!match) return null;

  const startIndex = match.index;
  // 截取从当前版本标题开始的内容
  const substring = content.slice(startIndex);
  // 找到下一个版本标题或文件结束的分割线 (---)
  const endIndex = substring.indexOf('\n---', 1);

  const block = endIndex === -1 ? substring : substring.slice(0, endIndex);

  // 提取日期
  let date = 'Unknown';
  const dateMatch = block.match(/`(\d{4}-\d{2}-\d{2})`/);
  if (dateMatch) date = dateMatch[1];

  // 提取内容行
  const lines = [];
  block.split('\n').forEach(line => {
    const trimmed = line.trim();
    // 过滤掉版本号行、日期行、空行、分隔符
    if (trimmed.startsWith('## v') || trimmed.startsWith('`') || trimmed.startsWith('---') || trimmed.length === 0) {
      return;
    }

    if (line.startsWith('###')) {
      lines.push({ type: 'header', content: trimmed.replace(/###\s*/, '').trim() });
    } else {
      lines.push({ type: 'item', content: line });
    }
  });

  return { date, lines };
}

/**
 * 格式化 changelog 内容为企业微信 Markdown 格式
 * @param {Array<{type: string, content: string}>} lines
 * @param {number} maxLines - 最大行数限制
 * @returns {string}
 */
function formatChangelogContent(lines, maxLines = 10) {
  const formatted = [];
  let lineCount = 0;

  for (const item of lines) {
    if (lineCount >= maxLines) {
      formatted.push(`\n> ... (还有 ${lines.length - lineCount} 条更新)`);
      break;
    }

    if (item.type === 'header') {
      formatted.push(`\n**${item.content}**`);
      lineCount++;
    } else {
      const text = item.content.replace(/^\s*-\s*/, '').trim();
      if (text) {
        formatted.push(`> • ${text}`);
        lineCount++;
      }
    }
  }

  return formatted.join('\n').trim();
}

/**
 * 获取包发布通知中的 changelog 内容。
 * 已配置 changelog 的包必须能解析到目标版本内容，否则直接失败。
 * @param {{name: string, newVersion: string}} pkg - 发布包信息
 * @param {{changelog: string | null}} config - 包通知配置
 * @param {{lines: Array<{type: string, content: string}>} | null} changelog - 解析后的 changelog
 * @param {number} maxLines - 最大展示行数
 * @returns {string} 企业微信 Markdown 内容
 */
function resolvePackageChangelogContent(pkg, config, changelog, maxLines) {
  if (changelog && changelog.lines.length > 0) {
    return formatChangelogContent(changelog.lines, maxLines);
  }

  if (config.changelog) {
    throw new Error(`${pkg.name} 缺少 docs/changelog/${config.changelog} 中的 ## v${pkg.newVersion}`);
  }

  return '> 暂无独立更新日志';
}

/**
 * 请求 GitLab Job API，解析本次手动发布的真实操作者
 * 优先使用 Job API，避免项目里配置的同名 CI 变量覆盖 GitLab 预定义变量。
 * @returns {Promise<string>}
 */
function resolveReleaseUserName() {
  if (!CI_API_V4_URL || !CI_JOB_TOKEN) {
    return Promise.resolve(GITLAB_USER_NAME);
  }

  const jobApiUrl = new URL(`${CI_API_V4_URL.replace(/\/$/, '')}/job`);
  const requestLib = jobApiUrl.protocol === 'http:' ? http : https;

  return new Promise(resolve => {
    const req = requestLib.request(
      jobApiUrl,
      {
        method: 'GET',
        headers: {
          'JOB-TOKEN': CI_JOB_TOKEN,
        },
      },
      res => {
        let body = '';

        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.warn(`Failed to resolve release user from GitLab Job API: status ${res.statusCode}`);
            resolve(GITLAB_USER_NAME);
            return;
          }

          try {
            const data = JSON.parse(body);
            const user = data && data.user ? data.user : null;
            resolve((user && (user.name || user.username)) || GITLAB_USER_NAME);
          } catch (err) {
            console.warn('Failed to parse GitLab Job API response:', err.message);
            resolve(GITLAB_USER_NAME);
          }
        });
      }
    );

    req.on('error', err => {
      console.warn('Failed to resolve release user from GitLab Job API:', err.message);
      resolve(GITLAB_USER_NAME);
    });

    req.end();
  });
}

/**
 * 构建单包发布通知消息
 */
function buildSinglePackageMessage(pkg, config, changelog, releaseUserName) {
  const title = `## <font color="info">${config.emoji} ${config.title}发布</font>`;
  const changelogDate = changelog && changelog.date ? changelog.date : 'Unknown';
  const versionInfo = `**版本**: <font color="warning">v${pkg.newVersion}</font>  |  **日期**: ${changelogDate}`;

  const content = resolvePackageChangelogContent(pkg, config, changelog, 15);

  const footer = [
    `> **分支**: ${CI_COMMIT_REF_NAME}`,
    `> **提交**: ${CI_COMMIT_SHORT_SHA}`,
    `> **发布人**: ${releaseUserName}`,
  ].join('\n');

  const docsLink = config.docsUrl ? `\n\n[📖 查看完整更新日志](${config.docsUrl})` : '';

  return `${title}\n\n${versionInfo}\n\n---\n${content}\n\n---\n\n${footer}${docsLink}`;
}

/**
 * 构建多包发布通知消息
 */
function buildMultiPackageMessage(packages, changelogMap, releaseUserName) {
  const title = `## <font color="info">📦 YSS UI 多包发布</font>`;
  const today = new Date().toISOString().split('T')[0];
  const versionInfo = `**日期**: ${today}  |  **包数量**: ${packages.length}`;

  const sections = [];

  for (const pkg of packages) {
    const config = PACKAGE_CONFIG[pkg.name];
    if (!config) continue;

    const changelog = changelogMap[pkg.name];
    const sectionTitle = `### ${config.emoji} ${pkg.name} v${pkg.newVersion}`;
    const content = resolvePackageChangelogContent(pkg, config, changelog, 5);

    sections.push(`${sectionTitle}\n${content}`);
  }

  const footer = [
    `> **分支**: ${CI_COMMIT_REF_NAME}`,
    `> **提交**: ${CI_COMMIT_SHORT_SHA}`,
    `> **发布人**: ${releaseUserName}`,
  ].join('\n');

  // 根据实际发布的包动态生成更新日志链接
  const docsLinks = packages
    .map(pkg => {
      const config = PACKAGE_CONFIG[pkg.name];
      return config && config.docsUrl ? `[${config.emoji} ${config.title}](${config.docsUrl})` : null;
    })
    .filter(Boolean);

  const docsLink = docsLinks.length > 0 ? `\n\n📖 查看更新日志：${docsLinks.join(' | ')}` : '';

  return `${title}\n\n${versionInfo}\n\n---\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n${footer}${docsLink}`;
}

/**
 * 发送企业微信通知
 */
function sendWecomNotification(message) {
  if (DRY_RUN) {
    console.log('\n========== DRY RUN MODE ==========');
    console.log('以下是将要发送的消息内容:\n');
    console.log(message);
    console.log('\n===================================\n');
    return;
  }

  if (!WECOM_KEY) {
    console.log('Skipping WeCom notification: WECOM_WEBHOOK_KEY not set.');
    process.exit(0);
  }

  const payload = JSON.stringify({
    msgtype: 'markdown',
    markdown: { content: message },
  });

  const req = https.request(
    {
      hostname: 'qyapi.weixin.qq.com',
      path: `/cgi-bin/webhook/send?key=${WECOM_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    res => {
      if (res.statusCode === 200) {
        console.log('WeCom notification sent successfully.');
        process.exit(0);
      } else {
        console.error(`WeCom API Error: Status ${res.statusCode}`);
        process.exit(1);
      }
    }
  );

  req.on('error', e => {
    console.error(`Request Error: ${e.message}`);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

/**
 * 兼容旧逻辑：当没有 .release-summary.json 时的降级处理
 */
async function fallbackToLegacyLogic(releaseUserName) {
  console.log('No release summary found, falling back to legacy logic...');

  const pkgPath = path.resolve(__dirname, '../../packages/components/package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log('Component package.json not found. Skipping notification.');
    process.exit(0);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const version = pkg.version;

  const changelogDir = path.resolve(__dirname, '../../docs/changelog');
  const changelogPath = path.join(changelogDir, 'components.md');
  const changelog = parseChangelog(changelogPath, version);

  if (!changelog || changelog.lines.length === 0) {
    console.log(`No changelog found for version v${version}. Skipping notification.`);
    process.exit(0);
  }

  const config = PACKAGE_CONFIG['@yss-ui/components'];
  const message = buildSinglePackageMessage(
    { name: '@yss-ui/components', newVersion: version },
    config,
    changelog,
    releaseUserName
  );

  sendWecomNotification(message);
}

// ========== 主流程 ==========

async function main() {
  // 1. 读取发布摘要
  const releasedPackages = readReleaseSummary();
  const releaseUserName = await resolveReleaseUserName();

  if (releasedPackages.length === 0) {
    await fallbackToLegacyLogic(releaseUserName);
  } else {
    // 2. 获取每个包的 changelog
    const changelogDir = path.resolve(__dirname, '../../docs/changelog');
    const changelogMap = {};

    for (const pkg of releasedPackages) {
      const config = PACKAGE_CONFIG[pkg.name];
      if (config && config.changelog) {
        const changelogPath = path.join(changelogDir, config.changelog);
        changelogMap[pkg.name] = parseChangelog(changelogPath, pkg.newVersion);
      }
    }

    // 3. 根据发布包数量决定消息格式
    let message;
    if (releasedPackages.length === 1) {
      const pkg = releasedPackages[0];
      const config = PACKAGE_CONFIG[pkg.name] || {
        emoji: '📦',
        title: pkg.name,
        docsUrl: null,
      };
      message = buildSinglePackageMessage(pkg, config, changelogMap[pkg.name], releaseUserName);
    } else {
      message = buildMultiPackageMessage(releasedPackages, changelogMap, releaseUserName);
    }

    // 4. 发送通知
    sendWecomNotification(message);
  }
}

main().catch(err => {
  console.error('Script Failed:', err && err.message ? err.message : err);
  process.exit(1);
});
