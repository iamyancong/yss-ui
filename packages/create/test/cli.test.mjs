import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../bin/index.mjs');

const runCliProcess = (args, options = {}) => {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      ...options,
      env: {
        ...process.env,
        CI: 'true',
        ...options.env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
};

describe('@yss-ui/create CLI E2E 测试', () => {
  it('--help 正确退出并打印帮助文案', async () => {
    const { code, stdout } = await runCliProcess(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('npm create yss-app');
    expect(stdout).toContain('--name-zh');
  });

  it('--dry-run --json 能够正确解析并输出合法 JSON，且不写盘', async () => {
    const { code, stdout } = await runCliProcess(['order-center', '--name-zh', '订单中心', '--dry-run', '--json']);

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.resolved.name).toBe('order-center');
    expect(parsed.resolved.nameZh).toBe('订单中心');
    expect(parsed.resolved.activeRule).toBe('/orderCenter');
    expect(parsed.resolved.apiBase).toBe('/api/orderCenter');
    expect(parsed.sources.activeRule).toBe('derived');
  });

  it('非 TTY / CI 模式缺 --name-zh 时退出码为 2，且 --json 模式输出错误结构', async () => {
    const { code, stdout } = await runCliProcess(['order-center', '--json']);

    expect(code).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('MISSING_NAME_ZH');
    expect(parsed.message).toContain('应用中文名');
  });

  it('目标目录已存在时退出码为 3', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-cli-exists-'));
    try {
      const existingProject = path.join(tempDir, 'demo-app');
      await fs.mkdir(existingProject);

      const { code, stdout } = await runCliProcess([
        'demo-app',
        '--name-zh',
        '测试应用',
        '--target-dir',
        tempDir,
        '--dry-run',
        '--json',
      ]);

      expect(code).toBe(3);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.ok).toBe(false);
      expect(parsed.code).toBe('TARGET_EXISTS');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('拼错或未知参数直接报错退出码 2，不会继续执行', async () => {
    const { code, stdout } = await runCliProcess(['order-center', '--name-zh', '订单中心', '--dryrun', '--json']);
    expect(code).toBe(2);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('INVALID_CLI_ARGS');
    expect(parsed.message).toContain('--dryrun');
  });

  it('多余的位置参数退出码 2', async () => {
    const { code, stdout } = await runCliProcess(['order-center', 'extra', '--name-zh', '订单中心', '--json']);
    expect(code).toBe(2);
    expect(JSON.parse(stdout.trim()).code).toBe('INVALID_CLI_ARGS');
  });

  it('--pm 非白名单值退出码 2', async () => {
    const { code, stdout } = await runCliProcess([
      'order-center',
      '--name-zh',
      '订单中心',
      '--pm',
      'bun',
      '--dry-run',
      '--json',
    ]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout.trim()).code).toBe('INVALID_PACKAGE_MANAGER');
  });

  it('名称含数字时 --yes 推导出合法 activeRule 而不是报错', async () => {
    const cases = [
      ['crm2', '/crm-2', '/api/crm-2'],
      ['app-1', '/app-1', '/api/app-1'],
      ['order-center2', '/orderCenter2', '/api/orderCenter2'],
    ];
    for (const [name, activeRule, apiBase] of cases) {
      const { code, stdout } = await runCliProcess([name, '--name-zh', '测试', '--yes', '--dry-run', '--json']);
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.resolved.activeRule).toBe(activeRule);
      expect(parsed.resolved.apiBase).toBe(apiBase);
      expect(parsed.sources.activeRule).toBe('derived');
    }
  });

  it('只传 --plan-out 时写完计划即返回，不拉模板、不生成项目', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-cli-planonly-'));
    const planFile = path.join(tempDir, 'plan.json');
    try {
      const { code, stdout } = await runCliProcess([
        'my-crm',
        '--name-zh',
        '客户管理',
        '--target-dir',
        tempDir,
        '--template-url',
        'file:///definitely/not/a/repo',
        '--plan-out',
        planFile,
        '--json',
      ]);
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.ok).toBe(true);
      expect(parsed.planPath).toBe(planFile);
      expect(parsed.plan.options.name).toBe('my-crm');
      expect(parsed.plan.options.dryRun).toBeUndefined();

      await expect(fs.access(path.join(tempDir, 'my-crm'))).rejects.toThrow();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('--apply：篡改、重算 hash 绕过、文件损坏、文件缺失、目标已存在均退出码 4', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-cli-plan-'));
    const planFile = path.join(tempDir, 'test-plan.json');

    try {
      const genPlan = await runCliProcess([
        'my-crm',
        '--name-zh',
        '客户管理',
        '--target-dir',
        tempDir,
        '--plan-out',
        planFile,
      ]);
      expect(genPlan.code).toBe(0);

      const planContent = JSON.parse(await fs.readFile(planFile, 'utf8'));
      expect(planContent.hash).toBeDefined();
      expect(planContent.options.name).toBe('my-crm');

      // 1. 直接篡改 → 签名不匹配
      const tampered = { ...planContent, options: { ...planContent.options, port: 9999 } };
      await fs.writeFile(planFile, JSON.stringify(tampered), 'utf8');
      const applyTampered = await runCliProcess(['--apply', planFile, '--json']);
      expect(applyTampered.code).toBe(4);
      expect(JSON.parse(applyTampered.stdout.trim()).code).toBe('PLAN_MISMATCH');

      // 2. 篡改为非法参数并重算 hash → 重新校验拦截
      const { computePlanHash } = await import('../src/core/index.mjs');
      const forged = { ...planContent, options: { ...planContent.options, activeRule: '/Bad' } };
      forged.hash = computePlanHash(forged);
      await fs.writeFile(planFile, JSON.stringify(forged), 'utf8');
      const applyForged = await runCliProcess(['--apply', planFile, '--json']);
      expect(applyForged.code).toBe(4);
      expect(JSON.parse(applyForged.stdout.trim()).code).toBe('PLAN_INVALID_OPTIONS');

      // 3. 文件损坏
      await fs.writeFile(planFile, '{ broken json', 'utf8');
      const applyBroken = await runCliProcess(['--apply', planFile, '--json']);
      expect(applyBroken.code).toBe(4);
      expect(JSON.parse(applyBroken.stdout.trim()).code).toBe('PLAN_INVALID');

      // 4. 文件缺失
      const applyMissing = await runCliProcess(['--apply', path.join(tempDir, 'nope.json'), '--json']);
      expect(applyMissing.code).toBe(4);
      expect(JSON.parse(applyMissing.stdout.trim()).code).toBe('PLAN_INVALID');

      // 5. 目标已存在
      await fs.writeFile(planFile, JSON.stringify(planContent), 'utf8');
      await fs.mkdir(path.join(tempDir, 'my-crm'));
      const applyExists = await runCliProcess(['--apply', planFile, '--json']);
      expect(applyExists.code).toBe(4);
      expect(JSON.parse(applyExists.stdout.trim()).code).toBe('PLAN_TARGET_EXISTS');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
