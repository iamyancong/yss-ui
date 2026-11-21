#!/usr/bin/env node
/**
 * scripts/verify-ci-status.mjs
 *
 * 发版前智能状态守门脚本：
 * 1. 检查当前待发版 Commit 在 GitHub 上的 "CI / CD Pipeline" 运行状态；
 * 2. 若 CI 正在运行（in_progress / queued），自动等待其完成，无需人工反复刷新；
 * 3. 若 CI 成功（success），秒级放行，进入极速发包；
 * 4. 若 CI 失败（failure / cancelled），立即拦截并报错退出，坚决防止污染 npm 版本号。
 */

import { execSync } from 'child_process';

function getGitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getCommitMessage(sha) {
  try {
    return execSync(`git log -1 --pretty=%B ${sha}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const SKIP_CI_REGEX = /\[(skip\s+ci|ci\s+skip|no\s+ci|skip\s+actions|actions\s+skip)\]|\*\*\*NO_CI\*\*\*/i;

const targetSha = process.env.TARGET_SHA || process.env.GITHUB_SHA || getGitSha();
const repo = process.env.GITHUB_REPOSITORY || 'iamyancong/yss-ui';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const maxWaitSeconds = parseInt(process.env.MAX_WAIT_SECONDS || '900', 10); // 最长等待 15 分钟
const pollIntervalMs = 15000; // 每 15 秒查询一次

function log(msg) {
  console.log(`[verify-ci] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWorkflowRuns() {
  const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${targetSha}&per_page=20`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'yss-ui-ci-verifier',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API 响应异常: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.workflow_runs || [];
}

async function main() {
  log(`待验证 Commit: ${targetSha.slice(0, 7)} (${targetSha})`);
  log(`目标仓库: ${repo}`);

  if (!token) {
    log('⚠️ 未检测到 GITHUB_TOKEN，将使用无鉴权模式调用 GitHub API（注意公共调用速率限制）。');
  }

  const startTime = Date.now();
  let notFoundCount = 0;

  while (true) {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (elapsedSeconds > maxWaitSeconds) {
      console.error(`[verify-ci] ❌ 等待前置 CI 超时（超过 ${maxWaitSeconds} 秒），发版流程自动终止！`);
      process.exit(1);
    }

    let runs = [];
    try {
      runs = await fetchWorkflowRuns();
    } catch (err) {
      log(`⚠️ 抓取 workflow 状态失败，稍后重试: ${err.message}`);
      await sleep(pollIntervalMs);
      continue;
    }

    // 匹配当前 commit 上的 "CI / CD Pipeline"
    const ciRuns = runs.filter(r => r.name === 'CI / CD Pipeline' || (r.path && r.path.endsWith('ci.yml')));

    if (ciRuns.length === 0) {
      notFoundCount += 1;
      const commitMsg = getCommitMessage(targetSha);

      // 1. 若当前 commit 的提交信息命中 GitHub Actions skip 指令，秒级明确拦截，严禁死等
      if (SKIP_CI_REGEX.test(commitMsg)) {
        console.error(`\n[verify-ci] ❌ 严正拦截：检测到待验证 Commit (${targetSha.slice(0, 7)}) 提交信息中包含跳过 CI 指令 (如 [skip ci])！`);
        console.error(`[verify-ci] Commit 标题: ${commitMsg.split('\n')[0]}`);
        console.error('[verify-ci] GitHub Actions 已按全局规则自动跳过了该 Commit 的 push 流水线。');
        console.error('[verify-ci] 由于缺少前置测试与构建校验保障，发版流程已自动终止。');
        console.error('[verify-ci] 解决建议：');
        console.error('  1. 提交一条不带 [skip ci] 的新 Commit 并推送到 main 分支，让 CI 正常执行通过；');
        console.error('  2. 或在 GitHub Actions 页面手动运行一次 "CI / CD Pipeline" 成功后再执行发版。\n');
        process.exit(1);
      }

      if (notFoundCount > 6) {
        // 超过约 1.5 分钟还没找到
        log('⚠️ 未在当前 Commit 上检索到 CI / CD Pipeline 记录。');
        log('可能此 Commit 未触发 CI 或处于调度队列最前端，将继续等待...');
      } else {
        log(`⏳ 正在检索当前 Commit 的 CI 运行记录... (尝试 ${notFoundCount})`);
      }

      // 若超过 12 次（约 3 分钟）仍未发现任何 CI 记录，大概率未触发 CI，及时终止避免白白消耗 Actions 分钟数
      if (notFoundCount >= 12) {
        console.error(`\n[verify-ci] ❌ 在当前 Commit (${targetSha.slice(0, 7)}) 上连续等待 3 分钟未检索到任何 CI / CD Pipeline 运行记录！`);
        console.error('[verify-ci] 可能原因：');
        console.error('  1. 该提交通过跳过钩子或非触发分支推入，未生成 push 事件；');
        console.error('  2. GitHub Actions 调度系统故障或延迟超限。');
        console.error('[verify-ci] 请前往 GitHub Actions 检查 "CI / CD Pipeline" 是否已被触发，确认成功后再发版。\n');
        process.exit(1);
      }

      await sleep(pollIntervalMs);
      continue;
    }

    // 取最新的一条 CI run
    const latestCiRun = ciRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const { status, conclusion, html_url, id } = latestCiRun;

    if (status === 'completed') {
      if (conclusion === 'success') {
        log(`🎉 前置 CI / CD Pipeline 全部测试与文档校验已通过！`);
        log(`Run ID: ${id} | 详情查看: ${html_url}`);
        log(`耗时等待: ${elapsedSeconds}s，立即进入发包流程！`);
        process.exit(0);
      } else {
        console.error(`\n[verify-ci] ❌ 严正拦截：前置 CI / CD Pipeline 执行结果为 [${conclusion}]！`);
        console.error(`[verify-ci] 详情日志: ${html_url}`);
        console.error(`[verify-ci] 请先修复 CI 错误并重新构建成功后再进行发版，已自动终止发包。\n`);
        process.exit(1);
      }
    } else {
      log(`⏳ 检测到前置 CI / CD Pipeline 正在运行 (状态: ${status})...`);
      log(`⏳ 详情: ${html_url}`);
      log(`⏳ 自动等待前置完成中... (已等待 ${elapsedSeconds}s / 上限 ${maxWaitSeconds}s)`);
      await sleep(pollIntervalMs);
    }
  }
}

main().catch(err => {
  console.error('[verify-ci] 发生未捕获异常:', err);
  process.exit(1);
});
