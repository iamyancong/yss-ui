import { execFile as execFileCallback, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFile = promisify(execFileCallback);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, '../bin/index.mjs');
const skillScript = path.resolve(__dirname, '../../skills/yss-create-microapp/scripts/create.mjs');

/**
 * 固定端口：默认会从 8081 探测空闲端口，并行测试中的其他 CLI 进程探测时会短暂占用 8081，
 * 导致两次生成拿到不同端口、micro-config.json 不一致。
 */
const FIXED_PORT = '18571';

/**
 * 递归收集目录下的所有相对路径及对应 sha256。
 *
 * @param {string} dirPath 根目录
 * @param {string} [base=''] 相对路径前缀
 * @returns {Promise<Record<string, string>>}
 */
const collectFilesWithHash = async (dirPath, base = '') => {
  const result = {};
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const sub = await collectFilesWithHash(fullPath, relPath);
      Object.assign(result, sub);
    } else if (entry.isFile()) {
      const content = await fs.readFile(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      result[relPath] = hash;
    }
  }

  return result;
};

/**
 * 以非交互环境运行脚本并收集 stdout / stderr。
 *
 * @param {string[]} args 传给 node 的参数
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
const runProcess = args =>
  new Promise(resolve => {
    const child = spawn(process.execPath, args, { env: { ...process.env, CI: 'true' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });

describe('Skill 脚本与 CLI 一致性快照测试', () => {
  it('同一参数下 CLI 与 Skill 脚本生成的文件树与 sha256 逐文件完全一致', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-snapshot-test-'));
    const templateRepo = path.join(tempRoot, 'template-repo');
    const outSkill = path.join(tempRoot, 'out-skill');
    const outCli = path.join(tempRoot, 'out-cli');
    const cacheSkill = path.join(os.tmpdir(), `yss-frontend-template-cache-skill-${Date.now()}`);
    const cacheCli = path.join(os.tmpdir(), `yss-frontend-template-cache-cli-${Date.now()}`);

    try {
      // 1. 搭建最小本地 Git 模板仓库 fixture
      await fs.mkdir(path.join(templateRepo, 'scripts'), { recursive: true });

      // 编写模板内的 create-microapp.mjs 桩脚本
      const stubScriptContent = `#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = key => {
  const idx = args.indexOf(key);
  return idx !== -1 ? args[idx + 1] : '';
};

const appName = getArg('--name');
const targetDir = getArg('--target-dir');
const port = getArg('--port');
const activeRule = getArg('--active-rule');
const apiBase = getArg('--api-base');
const proxyTarget = getArg('--proxy-target');

// 模拟真实模板脚本会向 stdout 打印日志，用于验证 --json 模式下不会污染 stdout
console.log('[stub] generating ' + appName + ' ...');

// 按真实模板的 parseArgs 规则解析（不带值的 --xxx 视为布尔），写到项目目录之外供断言
const parsed = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  const next = args[i + 1];
  if (!next || next.startsWith('--')) parsed[args[i].slice(2)] = true;
  else parsed[args[i].slice(2)] = args[++i];
}
await fs.mkdir(targetDir, { recursive: true });
await fs.writeFile(path.join(targetDir, 'scaffold-received.json'), JSON.stringify({
  argv: args,
  parsed,
  driver: process.env.YSS_CREATE_DRIVER || null,
}));

const appRoot = path.join(targetDir, appName);
await fs.mkdir(path.join(appRoot, 'packages'), { recursive: true });
await fs.mkdir(path.join(appRoot, 'src'), { recursive: true });

await fs.writeFile(path.join(appRoot, 'package.json'), JSON.stringify({
  name: appName,
  version: '0.1.0',
  private: true
}, null, 2) + '\\n');

await fs.writeFile(path.join(appRoot, 'micro-config.json'), JSON.stringify({
  name: 'default',
  port: Number(port),
  activeRule,
  apiBase,
  proxyTarget,
  app: { name: 'default', description: '' }
}, null, 2) + '\\n');

await fs.writeFile(path.join(appRoot, 'packages/package.json'), JSON.stringify({
  name: \`@\${appName}/core\`,
  description: ''
}, null, 2) + '\\n');

await fs.writeFile(path.join(appRoot, 'src/index.ts'), '// Generated microapp code\\n');
`;
      await fs.writeFile(path.join(templateRepo, 'scripts/create-microapp.mjs'), stubScriptContent);
      await fs.chmod(path.join(templateRepo, 'scripts/create-microapp.mjs'), 0o755);

      await execFile('git', ['init', '-b', 'template'], { cwd: templateRepo });
      await execFile('git', ['config', 'user.name', 'Test'], { cwd: templateRepo });
      await execFile('git', ['config', 'user.email', 'test@example.com'], { cwd: templateRepo });
      await execFile('git', ['add', '.'], { cwd: templateRepo });
      await execFile('git', ['commit', '-m', 'feat: init template fixture'], { cwd: templateRepo });

      const templateUrl = `file://${templateRepo}`;

      // 2. 执行 Skill 脚本
      const runSkill = () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              skillScript,
              '--name',
              'demo-app',
              '--name-zh',
              '演示应用',
              '--description',
              '统一测试描述',
              '--port',
              FIXED_PORT,
              '--template-url',
              templateUrl,
              '--template-branch',
              'template',
              '--target-dir',
              outSkill,
              '--cache-dir',
              cacheSkill,
              '--no-sync-deps',
              '--no-skills',
            ],
            { env: { ...process.env, CI: 'true' } }
          );
          child.on('close', code => (code === 0 ? resolve() : reject(new Error(`Skill 失败: ${code}`))));
        });

      // 3. 执行 CLI 脚本 (--yes 非交互)
      const runCli = () =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              cliEntry,
              'demo-app',
              '--name-zh',
              '演示应用',
              '--description',
              '统一测试描述',
              '--port',
              FIXED_PORT,
              '--template-url',
              templateUrl,
              '--template-branch',
              'template',
              '--target-dir',
              outCli,
              '--cache-dir',
              cacheCli,
              '--yes',
              '--no-sync-deps',
              '--no-skills',
            ],
            { env: { ...process.env, CI: 'true' } }
          );
          child.on('close', code => (code === 0 ? resolve() : reject(new Error(`CLI 失败: ${code}`))));
        });

      await runSkill();
      await runCli();

      // 4. 对比两处产物文件清单与 sha256
      const skillFiles = await collectFilesWithHash(path.join(outSkill, 'demo-app'));
      const cliFiles = await collectFilesWithHash(path.join(outCli, 'demo-app'));

      expect(Object.keys(skillFiles).sort()).toEqual(Object.keys(cliFiles).sort());
      expect(skillFiles).toEqual(cliFiles);

      // 模板脚本收到「后处理由 create 负责」的开关，且按旧模板解析规则其他参数值不受影响
      for (const outDir of [outSkill, outCli]) {
        const received = JSON.parse(await fs.readFile(path.join(outDir, 'scaffold-received.json'), 'utf8'));
        expect(received.argv.slice(-2)).toEqual(['--skip-skills', '--no-summary']);
        expect(received.driver).toBe('cli');
        expect(received.parsed).toEqual({
          name: 'demo-app',
          'target-dir': outDir,
          port: FIXED_PORT,
          'active-rule': '/demoApp',
          'api-base': '/api/demoApp',
          'proxy-target': expect.stringMatching(/^https?:\/\//),
          'skip-skills': true,
          'no-summary': true,
        });
      }

      // 5. --json 真实生成：模板脚本的 stdout 不能混入，stdout 必须可整体 JSON.parse
      const outJson = path.join(tempRoot, 'out-json');
      const jsonRun = await runProcess([
        cliEntry,
        'demo-app',
        '--name-zh',
        '演示应用',
        '--description',
        '统一测试描述',
        '--port',
        FIXED_PORT,
        '--template-url',
        templateUrl,
        '--template-branch',
        'template',
        '--target-dir',
        outJson,
        '--cache-dir',
        cacheCli,
        '--yes',
        '--json',
        '--no-sync-deps',
        '--no-skills',
      ]);
      expect(jsonRun.code).toBe(0);
      expect(jsonRun.stderr).toContain('[stub] generating');
      const jsonOutput = JSON.parse(jsonRun.stdout.trim());
      expect(jsonOutput.ok).toBe(true);
      expect(jsonOutput.targetPath).toBe(path.join(outJson, 'demo-app'));
      expect(jsonOutput.templateCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(Array.isArray(jsonOutput.nextSteps)).toBe(true);
      expect(Array.isArray(jsonOutput.dependencyUpdates)).toBe(true);
      expect(jsonOutput.lockfile).toBe('unchanged');
      expect(jsonOutput.skills).toBe('skipped');
      expect(await collectFilesWithHash(jsonOutput.targetPath)).toEqual(cliFiles);

      // 6. --plan-out → --apply 链路生成结果也与直接生成一致
      const outApply = path.join(tempRoot, 'out-apply');
      const planFile = path.join(tempRoot, 'plan.json');
      const planRun = await runProcess([
        cliEntry,
        'demo-app',
        '--name-zh',
        '演示应用',
        '--description',
        '统一测试描述',
        '--port',
        FIXED_PORT,
        '--template-url',
        templateUrl,
        '--template-branch',
        'template',
        '--target-dir',
        outApply,
        '--cache-dir',
        cacheCli,
        '--plan-out',
        planFile,
        '--json',
        '--no-sync-deps',
      ]);
      expect(planRun.code).toBe(0);
      await expect(fs.access(path.join(outApply, 'demo-app'))).rejects.toThrow();

      const applyRun = await runProcess([cliEntry, '--apply', planFile, '--json', '--no-skills']);
      expect(applyRun.code).toBe(0);
      const applyOutput = JSON.parse(applyRun.stdout.trim());
      expect(applyOutput.ok).toBe(true);
      expect(Array.isArray(applyOutput.dependencyUpdates)).toBe(true);
      expect(applyOutput.lockfile).toBe('unchanged');
      expect(await collectFilesWithHash(path.join(outApply, 'demo-app'))).toEqual(cliFiles);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
      await fs.rm(cacheSkill, { recursive: true, force: true });
      await fs.rm(cacheCli, { recursive: true, force: true });
    }
  }, 30000);
});
