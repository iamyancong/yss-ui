/**
 * 构建时脚本：生成开源文档贡献者数据
 *
 * 扫描 docs/ 目录下所有 .md 文件，通过 git log 提取贡献者信息，
 * 自动适配 GitHub 开源生态，生成贡献者的 GitHub 高清头像及个人主页链接，
 * 最终输出到 public/contributors.json。
 *
 * 用法: node scripts/generateContributors.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** 项目路径 */
const ROOT_DIR = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'contributors.json');

/**
 * 历史内网提交别名映射（用于将历史 commit 的姓名或邮箱平滑映射为 GitHub 用户名）
 */
const GITHUB_USERNAME_MAP = {
  wangyancong: 'iamyancong',
  'wangyancong@ysstech.com': 'iamyancong',
  'ycwang-dev': 'iamyancong',
};

/**
 * GitHub 用户名规范校验（1-39个字符，包含字母数字及单横线，不以横线起止）
 */
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * 根据 Git author name 与 email 解析出标准 GitHub 用户名
 * @param {string} rawName - Git commit 作者名
 * @param {string} rawEmail - Git commit 作者邮箱
 * @returns {string} - GitHub 用户名
 */
function resolveGitHubUsername(rawName, rawEmail) {
  const name = (rawName || '').trim();
  const email = (rawEmail || '').trim().toLowerCase();

  // 1. 优先查映射表（兼容历史已有提交）
  if (GITHUB_USERNAME_MAP[name.toLowerCase()]) {
    return GITHUB_USERNAME_MAP[name.toLowerCase()];
  }
  if (GITHUB_USERNAME_MAP[email]) {
    return GITHUB_USERNAME_MAP[email];
  }

  // 2. 匹配 GitHub 官方 noreply 邮箱，如 45351947+ycwang-dev@users.noreply.github.com
  const noreplyMatch = email.match(/^(?:\d+\+)?([a-zA-Z0-9-]+)@users\.noreply\.github\.com$/);
  if (noreplyMatch && GITHUB_USERNAME_REGEX.test(noreplyMatch[1])) {
    return noreplyMatch[1];
  }

  // 3. 若 Git author name 符合 GitHub 用户名规则，直接使用
  if (GITHUB_USERNAME_REGEX.test(name)) {
    return name;
  }

  // 4. 尝试邮箱前缀
  if (email.includes('@')) {
    const prefix = email.split('@')[0];
    if (GITHUB_USERNAME_REGEX.test(prefix)) {
      return prefix;
    }
  }

  return name || 'contributor';
}

/**
 * 递归扫描目录下的所有 .md 文件
 * @param {string} dir - 扫描目录
 * @returns {string[]} - md 文件路径数组
 */
function scanMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...scanMarkdownFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * 通过 git log 获取某个文档文件的贡献者列表
 * @param {string} filePath - 文件绝对路径
 * @returns {{ name: string, email: string, commits: number, avatar: string, url: string }[]}
 */
function getFileContributors(filePath) {
  try {
    const relativePath = path.relative(ROOT_DIR, filePath);
    const output = execSync(`git log --format="%aN||%aE" -- "${relativePath}"`, {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });

    if (!output.trim()) return [];

    const lines = output.trim().split('\n');
    const contributorMap = new Map();

    for (const line of lines) {
      const [name, email] = line.split('||');
      if (!name || !email) continue;

      const username = resolveGitHubUsername(name, email);
      const key = username.toLowerCase();

      if (contributorMap.has(key)) {
        contributorMap.get(key).commits += 1;
      } else {
        contributorMap.set(key, {
          name: username,
          email: email.trim(),
          commits: 1,
          avatar: `https://github.com/${username}.png?size=64`,
          url: `https://github.com/${username}`,
        });
      }
    }

    return Array.from(contributorMap.values()).sort((a, b) => b.commits - a.commits);
  } catch {
    return [];
  }
}

/**
 * 将文件路径转换为 dumi 路由路径（dumi 默认将驼峰转为中划线）
 * 例: docs/components/editTable.md => /components/edit-table
 * @param {string} filePath - 文件绝对路径
 * @returns {string} - 路由路径
 */
function filePathToRoutePath(filePath) {
  const relative = path.relative(DOCS_DIR, filePath);
  let routePath = '/' + relative.replace(/\.md$/, '').replace(/\\/g, '/');

  routePath = routePath
    .split('/')
    .map(segment => segment.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    .join('/');

  if (routePath.endsWith('/index')) {
    routePath = routePath.replace(/\/index$/, '');
  }
  return routePath || '/';
}

/**
 * 主函数
 */
async function main() {
  console.log('📝 开始生成 GitHub 开源贡献者数据...');

  const mdFiles = scanMarkdownFiles(DOCS_DIR);
  console.log(`   找到 ${mdFiles.length} 个文档文件`);

  const contributorsMap = {};
  const allContributors = new Set();

  for (const file of mdFiles) {
    const routePath = filePathToRoutePath(file);
    const contributors = getFileContributors(file);

    if (contributors.length > 0) {
      contributorsMap[routePath] = contributors;
      contributors.forEach(c => allContributors.add(c.name));
    }
  }

  console.log(`   共统计到 ${allContributors.size} 位独立贡献者：${Array.from(allContributors).join(', ')}`);
  console.log(`   覆盖 ${Object.keys(contributorsMap).length} 个文档页面`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contributorsMap, null, 2), 'utf-8');
  console.log(`✅ 贡献者数据已生成: ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);
}

main().catch(err => {
  console.error('❌ 生成贡献者数据失败:', err.message);
  const fallbackDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, '{}', 'utf-8');
  console.log('⚠️  已生成空的兜底文件，不影响后续构建');
});
