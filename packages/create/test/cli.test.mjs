import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../bin/index.mjs');
const pkg = createRequire(import.meta.url)('../package.json');

/**
 * 启动一个模拟 registry，记录收到的请求。
 *
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler 请求处理
 * @returns {Promise<{ url: string, requests: string[], close: () => Promise<void> }>}
 */
const startMockRegistry = async handler => {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    handler(req, res);
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: () =>
      new Promise(resolve => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
};

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
    expect(parsed.cliVersion).toBe(pkg.version);
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
    expect(parsed.cliVersion).toBe(pkg.version);
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

  it('--version 输出 package.json 的版本号', async () => {
    const { code, stdout } = await runCliProcess(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  describe('新版本检查', () => {
    /**
     * 在非 CI、无交互终端的子进程里只生成计划文件，便于观察是否请求 registry。
     *
     * @param {string} registryUrl 模拟 registry 地址
     * @param {string[]} [extraArgs] 追加参数
     * @param {Record<string, string>} [env] 追加环境变量
     */
    const runPlanOnly = async (registryUrl, extraArgs = [], env = {}) => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-cli-update-'));
      try {
        const result = await runCliProcess(
          [
            'my-crm',
            '--name-zh',
            '客户管理',
            '--target-dir',
            tempDir,
            '--plan-out',
            path.join(tempDir, 'plan.json'),
            ...extraArgs,
          ],
          { env: { CI: '', npm_config_registry: registryUrl, ...env } }
        );
        return result;
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };

    it('非交互模式在 stderr 打印版本号', async () => {
      const registry = await startMockRegistry((_req, res) => res.end(JSON.stringify({ version: pkg.version })));
      try {
        const { code, stderr } = await runPlanOnly(registry.url);
        expect(code).toBe(0);
        expect(stderr).toContain(`create-yss-app v${pkg.version}`);
      } finally {
        await registry.close();
      }
    });

    it.each([
      ['没有交互终端', [], {}],
      ['--json', ['--json'], {}],
      ['--no-update-check', ['--no-update-check'], {}],
      ['YSS_CREATE_NO_UPDATE_CHECK=1', [], { YSS_CREATE_NO_UPDATE_CHECK: '1' }],
      ['CI=true', [], { CI: 'true' }],
    ])('%s 时不请求 registry、不打印提示框', async (_label, extraArgs, env) => {
      const registry = await startMockRegistry((_req, res) => res.end(JSON.stringify({ version: '99.0.0' })));
      try {
        const { code, stdout, stderr } = await runPlanOnly(registry.url, extraArgs, env);
        expect(code).toBe(0);
        expect(registry.requests).toEqual([]);
        expect(stderr).not.toContain('发现新版本');
        if (extraArgs.includes('--json')) {
          expect(JSON.parse(stdout.trim()).cliVersion).toBe(pkg.version);
        }
      } finally {
        await registry.close();
      }
    });
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

  it('--no-sync-deps 在预览表和 dry-run 中正确体现', async () => {
    const res = await runCliProcess(['test-app', '--name-zh', '测试应用', '--dry-run', '--no-sync-deps']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('跳过对齐 (保持模板原样)');
  });
});
