import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE_BRANCH,
  DEFAULT_TEMPLATE_URL,
  EXIT_CODES,
  diagnoseGitFailure,
  getGitErrorDetail,
  syncTemplate,
} from '../src/core/index.mjs';

describe('模板仓库拉取', () => {
  it('默认模板为 GitHub 公开仓库，分支 main', () => {
    expect(DEFAULT_TEMPLATE_URL).toBe('https://github.com/iamyancong/microapp-template-vue3.git');
    expect(DEFAULT_TEMPLATE_BRANCH).toBe('main');
  });

  it('getGitErrorDetail 只保留 git 的失败原因，去掉 Command failed 与 clone 进度行', () => {
    const error = Object.assign(new Error('Command failed: git clone --branch template -- https://x/y.git /tmp/c'), {
      stderr: "正克隆到 '/tmp/c'...\nremote: Repository not found.\nfatal: repository 'https://x/y.git/' not found\n",
    });
    expect(getGitErrorDetail(error)).toBe(
      "remote: Repository not found.\nfatal: repository 'https://x/y.git/' not found"
    );
    expect(getGitErrorDetail(new Error('spawn git ENOENT\nmore'))).toBe('spawn git ENOENT');
  });

  it.each([
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", '认证失败'],
    ['remote: HTTP Basic: Access denied', '认证失败'],
    ['fatal: Remote branch template not found in upstream origin', '不存在指定分支'],
    ['remote: Repository not found.', '模板仓库不存在'],
    ["fatal: unable to access 'https://github.com/x/y.git/': Failed to connect to github.com port 443", '无法连接'],
    ['fatal: something else', ''],
  ])('diagnoseGitFailure(%s)', (detail, expected) => {
    if (expected) expect(diagnoseGitFailure(detail)).toContain(expected);
    else expect(diagnoseGitFailure(detail)).toBe('');
  });

  it('clone 失败：退出码 5，报错只出现一次仓库信息，提示检查 GitHub 访问与覆盖方式', async () => {
    const missingRepo = `file://${path.join(os.tmpdir(), `yss-missing-repo-${Date.now()}`)}`;
    const cacheDir = path.join(os.tmpdir(), `yss-frontend-template-cache-missing-${Date.now()}`);
    const progress = [];

    const error = await syncTemplate({ url: missingRepo, branch: 'template', cacheDir }, msg =>
      progress.push(msg)
    ).catch(err => err);

    expect(error.code).toBe('TEMPLATE_CLONE_FAILED');
    expect(error.exitCode).toBe(EXIT_CODES.TEMPLATE_SYNC_FAILED);
    expect(error.message).toContain(`模板仓库拉取失败: ${missingRepo} (分支: template)`);
    expect(error.message).not.toContain('Command failed');
    expect(error.message).not.toMatch(/Cloning into|正克隆到/);
    expect(error.message.split(missingRepo).length - 1).toBeLessThanOrEqual(2);
    expect(error.hint).toContain('GitHub');
    expect(error.hint).not.toMatch(/内网|VPN|GitLab/);
    expect(error.hint).toContain('--template-url');
    expect(error.hint).toContain('YSS_FRONTEND_TEMPLATE_URL');
    expect(progress.filter(msg => msg.includes('正在克隆模板仓库'))).toHaveLength(1);
    await expect(fs.access(cacheDir)).rejects.toThrow();
  });
});
