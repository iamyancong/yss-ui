/**
 * GitHub Actions / CI 发版后置处理脚本：
 * 1. 读取 scripts/.release-summary.json
 * 2. 提交版本变更与生成物
 * 3. 自动打 Git Tag 并推送
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...options }).trim();
  } catch (err) {
    console.error(`[ci-post-release] Command failed: ${cmd}`, err.stderr || err.message);
    throw err;
  }
}

function main() {
  const summaryFile = path.resolve('scripts/.release-summary.json');
  if (!fs.existsSync(summaryFile)) {
    console.log('[ci-post-release] 未找到发布摘要文件 scripts/.release-summary.json，跳过后置处理。');
    return;
  }

  let list = [];
  try {
    const obj = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    list = Array.isArray(obj.packages) ? obj.packages : [];
  } catch (e) {
    console.error('[ci-post-release] 解析发布摘要失败:', e.message);
    return;
  }

  if (list.length === 0) {
    console.log('[ci-post-release] 没有需要发布的包，跳过。');
    return;
  }

  // 1. Stage changes
  run(
    'git add packages/*/package.json packages/mcp/index.hash docs/changelog/mcp.md .dumi/theme/slots/Features/generated-releases.json'
  );

  // Check diff
  const diff = run('git status --porcelain');
  if (!diff) {
    console.log('[ci-post-release] 工作区无版本相关变更需要提交。');
    return;
  }

  // 2. Commit version bump
  const bump = process.env.BUMP || 'patch';
  const commitSubj = `chore(release): ${bump} ${list.length} package(s) [skip ci]`;
  const commitBody = list.map(x => `- ${x.name}: ${x.oldVersion} -> ${x.newVersion}`).join('\n');

  console.log(`[ci-post-release] 提交发版记录: ${commitSubj}`);
  run(`git commit -m "${commitSubj}" -m "${commitBody}"`);

  // 3. Push commit
  const ref = process.env.GITHUB_REF_NAME || 'main';
  console.log(`[ci-post-release] 推送提交到 origin/${ref}...`);
  run(`git push origin HEAD:${ref}`);

  // 4. Create and push tags
  for (const pkg of list) {
    const shortName = pkg.name.replace('@yss-ui/', '');
    const tag = `${shortName}@${pkg.newVersion}`;
    console.log(`[ci-post-release] 创建并推送 tag: ${tag}`);
    try {
      run(`git tag ${tag}`);
      run(`git push origin ${tag}`);
    } catch (e) {
      console.warn(`[ci-post-release] 创建 tag ${tag} 遇到警告: ${e.message}`);
    }
  }

  console.log('[ci-post-release] 发版后置处理全部完成！');
}

main();
