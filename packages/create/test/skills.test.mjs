import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILLS_CHECK_SCRIPT, SKILLS_CLI_SPEC, syncSkills } from '../src/core/index.mjs';

/**
 * 构造 spawn 桩：按调用顺序返回预设的退出码（'error' 表示触发 error 事件，'hang' 表示永不退出）。
 *
 * @param {Array<number | 'error' | 'hang'>} outcomes 每次调用的结果
 * @param {string} [output=''] 子进程退出前写到 stdout 的内容
 * @returns {{ spawnImpl: Function, calls: Array<{ command: string, args: string[], options: object }> }}
 */
const createSpawnStub = (outcomes, output = '') => {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => undefined;
    const outcome = outcomes[calls.length - 1];
    setImmediate(() => {
      if (output) child.stdout.emit('data', Buffer.from(output));
      if (outcome === 'hang') return;
      if (outcome === 'error') child.emit('error', new Error('spawn npx ENOENT'));
      else child.emit('exit', outcome);
    });
    return child;
  };
  return { spawnImpl, calls };
};

describe('core/skills.mjs 生成后同步 AI Skills', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-skills-sync-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('使用 npx 拉取最新 skills-cli 在项目根目录同步', async () => {
    const { spawnImpl, calls } = createSpawnStub([0]);
    const result = await syncSkills(projectRoot, { spawnImpl });

    expect(result).toEqual({ status: 'synced', warnings: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('npx');
    expect(calls[0].args).toEqual(['-y', SKILLS_CLI_SPEC, 'sync']);
    expect(SKILLS_CLI_SPEC).toBe('@yss-ui/skills-cli@latest');
    expect(calls[0].options.cwd).toBe(projectRoot);
  });

  it('模板提供 check-skills.mjs 时同步后执行校验，校验失败只告警', async () => {
    await fs.mkdir(path.join(projectRoot, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, SKILLS_CHECK_SCRIPT), '');

    const passed = createSpawnStub([0, 0]);
    expect(await syncSkills(projectRoot, { spawnImpl: passed.spawnImpl })).toEqual({ status: 'synced', warnings: [] });
    expect(passed.calls[1].command).toBe(process.execPath);
    expect(passed.calls[1].args).toEqual([SKILLS_CHECK_SCRIPT]);

    const failed = createSpawnStub([0, 1]);
    const result = await syncSkills(projectRoot, { spawnImpl: failed.spawnImpl });
    expect(result.status).toBe('synced');
    expect(result.warnings[0]).toContain('校验未通过');
  });

  it('同步失败、npx 不存在或超时都不抛错，返回 failed 并给出手动命令', async () => {
    for (const outcome of [1, 'error', 'hang']) {
      const { spawnImpl, calls } = createSpawnStub([outcome]);
      const result = await syncSkills(projectRoot, { spawnImpl, timeoutMs: 20 });
      expect(result.status).toBe('failed');
      expect(result.warnings[0]).toContain('npx -y @yss-ui/skills-cli@latest sync');
      expect(calls).toHaveLength(1);
    }
  });

  it('offline 模式不启动任何子进程', async () => {
    const { spawnImpl, calls } = createSpawnStub([]);
    const result = await syncSkills(projectRoot, { spawnImpl, offline: true });
    expect(result.status).toBe('skipped');
    expect(result.warnings[0]).toContain('offline');
    expect(calls).toHaveLength(0);
  });

  it('子进程输出先缓冲：成功时静默，失败时只把尾部写到 stderr，不写 stdout', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      for (const [code, expectEcho] of [
        [0, false],
        [1, true],
      ]) {
        stderrSpy.mockClear();
        const { spawnImpl, calls } = createSpawnStub([code], '  ✓ .claude/skills: api-integration\n');
        await syncSkills(projectRoot, { spawnImpl });
        expect(calls[0].options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
        const echoed = stderrSpy.mock.calls.some(([text]) => String(text).includes('api-integration'));
        expect(echoed).toBe(expectEcho);
      }
      expect(stdoutSpy.mock.calls.some(([text]) => String(text).includes('api-integration'))).toBe(false);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
