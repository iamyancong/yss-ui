import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computePlanHash,
  createPlan,
  EXIT_CODES,
  parsePlanContent,
  PlanMismatchError,
  resolveOptions,
  verifyPlan,
} from '../src/core/index.mjs';

/**
 * 以真实解析流程构造计划（与 CLI --plan-out 一致）。
 *
 * @param {Record<string, any>} overrides 覆盖输入
 * @returns {Promise<Record<string, any>>}
 */
const buildPlan = async (overrides = {}) => {
  const { resolved } = await resolveOptions(
    {
      name: 'order-center',
      nameZh: '订单中心',
      targetDir: os.tmpdir(),
      dryRun: true,
      ...overrides,
    },
    { probePort: false }
  );
  return createPlan(resolved, 'abc1234');
};

describe('createPlan 与 verifyPlan', () => {
  it('合法 plan 通过校验并返回重新解析后的参数；dryRun 不会固化进计划', async () => {
    const plan = await buildPlan();
    expect(plan.hash).toBeDefined();
    expect(plan.templateCommit).toBe('abc1234');
    expect(plan.options.dryRun).toBeUndefined();

    const { resolved, targetPath } = await verifyPlan(plan);
    expect(resolved.name).toBe('order-center');
    expect(resolved.activeRule).toBe('/orderCenter');
    expect(targetPath).toBe(path.join(os.tmpdir(), 'order-center'));
  });

  it('篡改任意字段后 verifyPlan 抛出 PlanMismatchError (退出码 4)', async () => {
    const plan = await buildPlan();

    const tamperedPlan = { ...plan, options: { ...plan.options, port: 8082 } };
    await expect(verifyPlan(tamperedPlan)).rejects.toThrowError(PlanMismatchError);

    const tamperedPathPlan = { ...plan, targetPath: '/another/path' };
    await expect(verifyPlan(tamperedPathPlan)).rejects.toThrowError(PlanMismatchError);
  });

  it('重算 hash 绕过签名后，非法参数仍被重新校验拦截 (退出码 4)', async () => {
    const plan = await buildPlan();

    const forged = { ...plan, options: { ...plan.options, activeRule: '/Bad Rule', port: 70000 } };
    forged.hash = computePlanHash(forged);

    const error = await verifyPlan(forged).catch(err => err);
    expect(error).toBeInstanceOf(PlanMismatchError);
    expect(error.exitCode).toBe(EXIT_CODES.PLAN_MISMATCH);
    expect(error.code).toBe('PLAN_INVALID_OPTIONS');
  });

  it('重算 hash 但 targetPath 与参数不一致时拒绝执行', async () => {
    const plan = await buildPlan();
    const forged = { ...plan, targetPath: path.join(os.tmpdir(), 'somewhere-else') };
    forged.hash = computePlanHash(forged);

    const error = await verifyPlan(forged).catch(err => err);
    expect(error).toBeInstanceOf(PlanMismatchError);
    expect(error.message).toContain('targetPath');
  });

  it('目标目录已存在时抛出 PlanMismatchError (退出码 4，而非 3)', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-plan-test-'));
    try {
      await fs.mkdir(path.join(tempDir, 'order-center'));
      const plan = await buildPlan({ targetDir: tempDir });

      const error = await verifyPlan(plan).catch(err => err);
      expect(error).toBeInstanceOf(PlanMismatchError);
      expect(error.exitCode).toBe(EXIT_CODES.PLAN_MISMATCH);
      expect(error.code).toBe('PLAN_TARGET_EXISTS');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('结构缺失或版本不受支持时归为 PLAN_INVALID', async () => {
    await expect(verifyPlan(null)).rejects.toMatchObject({ code: 'PLAN_INVALID', exitCode: 4 });
    await expect(verifyPlan({ version: 99, hash: 'x', options: {} })).rejects.toMatchObject({ code: 'PLAN_INVALID' });
    await expect(verifyPlan({ version: 1, options: {} })).rejects.toMatchObject({ code: 'PLAN_INVALID' });
  });

  it('parsePlanContent 对损坏文件抛出 PLAN_INVALID (退出码 4)', () => {
    expect(() => parsePlanContent('{ not json')).toThrowError(PlanMismatchError);
    expect(() => parsePlanContent('[]')).toThrowError(PlanMismatchError);
    try {
      parsePlanContent('{ not json');
    } catch (error) {
      expect(error.code).toBe('PLAN_INVALID');
      expect(error.exitCode).toBe(EXIT_CODES.PLAN_MISMATCH);
    }
  });
});
