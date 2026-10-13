import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCdPath, getNextSteps } from '../src/pm.mjs';
import { formatPreviewTable } from '../src/preview.mjs';
import {
  confirmCreation,
  promptPostActions,
  resolveInteractiveAnswers,
  runInteractivePrompts,
} from '../src/prompts.mjs';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(val => typeof val === 'symbol' || val === '__CANCEL__'),
}));

/** 端口探测依赖本机 8081 是否被占用，测试中统一 mock，避免结果随环境变化。 */
const { probeFreePortMock } = vi.hoisted(() => ({ probeFreePortMock: vi.fn() }));

vi.mock('../src/core/index.mjs', async importOriginal => ({
  ...(await importOriginal()),
  probeFreePort: probeFreePortMock,
}));

describe('prompts 交互提问流程测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeFreePortMock.mockResolvedValue(8081);
  });

  it('交互问答提问顺序与默认 initialValue 符合预期', async () => {
    const textCalls = [];
    p.text.mockImplementation(async opts => {
      textCalls.push(opts);
      if (opts.message.includes('中文名')) return '用户中心';
      if (opts.message.includes('英文名')) return 'user-center';
      if (opts.message.includes('激活路由')) return opts.initialValue || '/userCenter';
      if (opts.message.includes('开发端口')) return opts.initialValue || '8081';
      if (opts.message.includes('接口请求前缀')) return opts.initialValue || '/api/userCenter';
      if (opts.message.includes('后端代理目标')) return opts.initialValue || 'http://127.0.0.1:3000';
      if (opts.message.includes('项目描述')) return '用户管理微应用';
      return '';
    });

    const { answers } = await runInteractivePrompts({});

    expect(answers.name).toBe('user-center');
    expect(answers.nameZh).toBe('用户中心');
    expect(answers.activeRule).toBe('/userCenter');
    expect(answers.port).toBe(8081);
    expect(answers.description).toBe('用户管理微应用');
    expect(answers.openapiUrl).toBe('');
    expect(textCalls.some(call => call.message.includes('OpenAPI'))).toBe(false);
    expect(textCalls.at(-1).message).toContain('项目描述');

    // 验证提问顺序
    expect(textCalls[0].message).toContain('中文名');
    expect(textCalls[1].message).toContain('英文名');
    expect(textCalls[2].message).toContain('激活路由');
    expect(textCalls[3].message).toContain('开发端口');
    expect(textCalls[4].message).toContain('接口请求前缀');
    expect(textCalls[3].initialValue).toBe('8081');
    expect(p.note).not.toHaveBeenCalledWith(expect.anything(), '端口提示');
  });

  it('不再询问 OpenAPI 地址，但 --openapi-url 传入的值原样保留', async () => {
    p.text.mockImplementation(
      async opts => opts.initialValue || (opts.message.includes('英文名') ? 'user-center' : '用户中心')
    );

    const { answers } = await runInteractivePrompts({ openapiUrl: 'http://api.internal/v3/api-docs' });

    expect(answers.openapiUrl).toBe('http://api.internal/v3/api-docs');
    expect(p.text.mock.calls.some(([opts]) => opts.message.includes('OpenAPI'))).toBe(false);
  });

  it('8081 被占用时端口 initialValue 为探测到的空闲端口，并给出提示', async () => {
    probeFreePortMock.mockResolvedValue(8082);
    const textCalls = [];
    p.text.mockImplementation(async opts => {
      textCalls.push(opts);
      if (opts.message.includes('中文名')) return '用户中心';
      if (opts.message.includes('英文名')) return 'user-center';
      return opts.initialValue ?? '';
    });

    const { answers } = await runInteractivePrompts({});

    expect(probeFreePortMock).toHaveBeenCalledWith(8081);
    expect(textCalls.find(opts => opts.message.includes('开发端口')).initialValue).toBe('8082');
    expect(answers.port).toBe(8082);
    expect(p.note).toHaveBeenCalledWith(expect.stringContaining('8082'), '端口提示');
  });

  describe('预览表来源标注', () => {
    const originalProxyEnv = process.env.YSS_PROXY_TARGET;

    beforeEach(() => {
      delete process.env.YSS_PROXY_TARGET;
    });

    afterEach(() => {
      if (originalProxyEnv === undefined) delete process.env.YSS_PROXY_TARGET;
      else process.env.YSS_PROXY_TARGET = originalProxyEnv;
    });

    /**
     * 模拟交互：中英文名由用户输入，其余问题默认直接回车（返回 initialValue），可按提问文案覆盖。
     *
     * @param {Record<string, string>} [overrides] 提问文案关键字 → 用户输入
     */
    const mockAnswers = (overrides = {}) => {
      p.text.mockImplementation(async opts => {
        if (opts.message.includes('中文名')) return '用户中心';
        if (opts.message.includes('英文名')) return 'user-center';
        const key = Object.keys(overrides).find(keyword => opts.message.includes(keyword));
        if (key) return overrides[key];
        return opts.initialValue ?? '';
      });
    };

    /**
     * 从渲染后的预览表中按字段名取出来源文案。
     *
     * @param {string} table 预览表文本
     * @param {string} field 字段中文名
     * @returns {string}
     */
    const sourceOf = (table, field) => {
      const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
      const line = table
        .replace(ansiPattern, '')
        .split('\n')
        .find(row => row.startsWith(field));
      return line.trim().split(/\s+/).pop();
    };

    const runFlow = async (initialInput = {}) => {
      const promptResult = await runInteractivePrompts(initialInput);
      const result = await resolveInteractiveAnswers(initialInput, promptResult);
      return { ...result, table: formatPreviewTable(result.resolved, result.sources, result.targetPath) };
    };

    it('全部直接回车时，激活路由/端口/接口前缀/代理目标都不标为「用户指定」', async () => {
      mockAnswers();
      const { resolved, sources, table } = await runFlow();

      expect(resolved.activeRule).toBe('/userCenter');
      expect(resolved.port).toBe(8081);
      expect(resolved.apiBase).toBe('/api/userCenter');
      expect(sources).toMatchObject({
        name: 'user',
        nameZh: 'user',
        activeRule: 'derived',
        port: 'default',
        apiBase: 'derived',
        proxyTarget: 'default',
      });
      for (const field of ['激活路由', '开发端口', '接口前缀', '代理目标']) {
        expect(sourceOf(table, field)).not.toBe('用户指定');
      }
      expect(sourceOf(table, '激活路由')).toBe('自动推导');
      expect(sourceOf(table, '开发端口')).toBe('默认预设');
    });

    it('8081 被占用时直接回车采纳探测端口：保留 8082 并标为「自动推导」', async () => {
      probeFreePortMock.mockResolvedValue(8082);
      mockAnswers();
      const { resolved, sources, warnings, table } = await runFlow();

      expect(resolved.port).toBe(8082);
      expect(sources.port).toBe('derived');
      expect(warnings.some(warning => warning.includes('8082'))).toBe(true);
      expect(sourceOf(table, '开发端口')).toBe('自动推导');
    });

    it('YSS_PROXY_TARGET 存在且直接回车时，代理目标标为「环境变量」', async () => {
      process.env.YSS_PROXY_TARGET = 'http://gw.test.internal:8080';
      mockAnswers();
      const { resolved, table } = await runFlow();

      expect(resolved.proxyTarget).toBe('http://gw.test.internal:8080');
      expect(sourceOf(table, '代理目标')).toBe('环境变量');
    });

    it('只手动修改激活路由时，四个可推导字段中仅激活路由为「用户指定」，接口前缀跟随新路由推导', async () => {
      mockAnswers({ 激活路由: '/customRule' });
      const { resolved, sources, table } = await runFlow();

      expect(resolved.activeRule).toBe('/customRule');
      expect(resolved.apiBase).toBe('/api/customRule');
      expect(sources).toMatchObject({
        activeRule: 'user',
        port: 'default',
        apiBase: 'derived',
        proxyTarget: 'default',
      });
      expect(sourceOf(table, '激活路由')).toBe('用户指定');
      for (const field of ['开发端口', '接口前缀', '代理目标']) {
        expect(sourceOf(table, field)).not.toBe('用户指定');
      }
    });

    it('手动把端口改成其他值时标为「用户指定」', async () => {
      mockAnswers({ 开发端口: '9000' });
      const { resolved, sources } = await runFlow();

      expect(resolved.port).toBe(9000);
      expect(sources.port).toBe('user');
    });

    it('命令行已预设的字段不经过提问，即使等于推导值也保持「用户指定」', async () => {
      mockAnswers();
      const { sources } = await runFlow({ activeRule: '/userCenter', port: '8081' });

      expect(sources.activeRule).toBe('user');
      expect(sources.port).toBe('user');
      expect(sources.apiBase).toBe('derived');
    });
  });

  it('英文名对应目录已存在时立即提示并重新询问，而不是等全部问完', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-prompts-exists-'));
    try {
      await fs.mkdir(path.join(tempDir, 'taken-app'));

      const nameAnswers = ['taken-app', 'free-app'];
      const textCalls = [];
      p.text.mockImplementation(async opts => {
        textCalls.push(opts.message);
        if (opts.message.includes('中文名')) return '测试';
        if (opts.message.includes('英文名')) return nameAnswers.shift();
        return opts.initialValue ?? '';
      });

      const { answers } = await runInteractivePrompts({ targetDir: tempDir });

      expect(answers.name).toBe('free-app');
      expect(p.note).toHaveBeenCalledWith(expect.stringContaining('taken-app'), '目录冲突');
      expect(textCalls.filter(message => message.includes('英文名'))).toHaveLength(2);
      // 冲突提示发生在激活路由提问之前
      expect(textCalls.indexOf('激活路由 (activeRule):')).toBeGreaterThan(
        textCalls.lastIndexOf('应用英文名 (仅支持字母、数字与中划线):')
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('getNextSteps 的 cd 路径按 --target-dir 相对当前目录给出，不再固定为应用名', () => {
    const cwd = process.cwd();
    expect(formatCdPath(path.join(cwd, 'my-app'), cwd)).toBe('my-app');
    expect(formatCdPath(path.join(cwd, 'apps', 'my-app'), cwd)).toBe(path.join('apps', 'my-app'));
    expect(formatCdPath('/somewhere/else/my-app', cwd)).toBe('/somewhere/else/my-app');
    expect(formatCdPath('/some where/my-app', cwd)).toBe('"/some where/my-app"');
    expect(formatCdPath(cwd, cwd)).toBe('');

    const steps = getNextSteps({ targetPath: '/elsewhere/my-app', port: 8082, activeRule: '/myApp', pm: 'npm' });
    expect(steps[0]).toBe('cd /elsewhere/my-app');
    expect(steps).toContain('npm run dev');
  });

  it('用户在任一步骤取消操作时退出进程并返回 130', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('PROCESS_EXIT_130');
    });

    p.text.mockResolvedValueOnce('__CANCEL__');

    await expect(runInteractivePrompts({})).rejects.toThrow('PROCESS_EXIT_130');
    expect(exitSpy).toHaveBeenCalledWith(130);
    expect(p.cancel).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('confirmCreation 与 promptPostActions 正常收集布尔值', async () => {
    p.confirm.mockResolvedValueOnce(true);
    const confirmed = await confirmCreation(
      { name: 'app', activeRule: '/app', port: 8081 },
      { name: 'user' },
      '/path/to/app'
    );
    expect(confirmed).toBe(true);

    p.confirm.mockClear();
    p.confirm
      .mockResolvedValueOnce(true) // install
      .mockResolvedValueOnce(false); // git

    const post = await promptPostActions();
    expect(post).toEqual({ install: true, git: false });
    expect(p.confirm).toHaveBeenCalledTimes(2);
    expect(p.confirm.mock.calls.map(([arg]) => arg.message).join('\n')).not.toMatch(/Skills/);
  });
});
