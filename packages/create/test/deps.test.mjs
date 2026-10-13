import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  fetchPackageMetadata,
  OFFICIAL_REGISTRY,
  parseNpmrcRegistry,
  parseSemverTuple,
  parseVersionSpec,
  resolveLatestPackageVersion,
  resolveProjectRegistry,
  syncDependencies,
} from '../src/core/deps.mjs';

describe('core/deps.mjs 依赖对齐与 lockfile 维护模块', () => {
  describe('版本与前缀解析', () => {
    it('正确解析 ^ / ~ 与精确版本号，并标记 isStandard', () => {
      expect(parseVersionSpec('^1.7.3')).toEqual({ prefix: '^', version: '1.7.3', isStandard: true });
      expect(parseVersionSpec('~1.0.6')).toEqual({ prefix: '~', version: '1.0.6', isStandard: true });
      expect(parseVersionSpec('1.8.0')).toEqual({ prefix: '', version: '1.8.0', isStandard: true });
      expect(parseVersionSpec('v1.8.0')).toEqual({ prefix: '', version: '1.8.0', isStandard: true });
    });

    it('对复杂版本声明（workspace/范围/别名/tag）标记 isStandard: false', () => {
      expect(parseVersionSpec('workspace:*').isStandard).toBe(false);
      expect(parseVersionSpec('latest').isStandard).toBe(false);
      expect(parseVersionSpec('>=1.0.0 <2').isStandard).toBe(false);
      expect(parseVersionSpec('npm:foo@^1.0.0').isStandard).toBe(false);
    });

    it('正确比对 SemVer 大小', () => {
      expect(compareSemver('1.8.0', '1.7.3')).toBe(1);
      expect(compareSemver('1.7.3', '1.8.0')).toBe(-1);
      expect(compareSemver('1.8.0', '1.8.0')).toBe(0);
      expect(parseSemverTuple('v1.2.3')).toEqual([1, 2, 3]);
    });
  });

  describe('registry 优先级解析', () => {
    it('解析 .npmrc 中的 @yss-ui:registry 与 registry', () => {
      const npmrcContent = `
# 内部注释
@yss-ui:registry = https://registry.npmmirror.com/
registry = https://custom.registry.com
`;
      const parsed = parseNpmrcRegistry(npmrcContent);
      expect(parsed.scopedRegistry).toBe('https://registry.npmmirror.com');
      expect(parsed.defaultRegistry).toBe('https://custom.registry.com');
    });

    it('优先级：环境变量 > .npmrc @yss-ui:registry > .npmrc registry > 官方源', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-npmrc-test-'));
      try {
        // 1. 无 .npmrc，无环境变量 -> 官方源
        const defaultReg = await resolveProjectRegistry(tempDir, {});
        expect(defaultReg).toBe(OFFICIAL_REGISTRY);

        // 2. 写入 .npmrc
        await fs.writeFile(path.join(tempDir, '.npmrc'), 'registry=https://custom-mirror.com\n');
        const customReg = await resolveProjectRegistry(tempDir, {});
        expect(customReg).toBe('https://custom-mirror.com');

        await fs.writeFile(
          path.join(tempDir, '.npmrc'),
          '@yss-ui:registry=https://yss-scope.com\nregistry=https://custom-mirror.com\n'
        );
        const scopedReg = await resolveProjectRegistry(tempDir, {});
        expect(scopedReg).toBe('https://yss-scope.com');

        // 3. 环境变量优先
        const envReg = await resolveProjectRegistry(tempDir, { npm_config_registry: 'https://env-registry.com' });
        expect(envReg).toBe('https://env-registry.com');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('网络查询与镜像延迟回退', () => {
    it('官方源直接获取最新版本', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.8.0' },
          versions: { '1.8.0': { peerDependencies: { vue: '^3.3.0' } } },
        }),
      });

      const res = await resolveLatestPackageVersion('@yss-ui/components', OFFICIAL_REGISTRY, {
        fetchImpl: mockFetch,
      });
      expect(res.resolvedVersion).toBe('1.8.0');
      expect(res.warning).toBeUndefined();
    });

    it('镜像滞后时退回使用项目镜像可用版本并给出警告', async () => {
      const mockFetch = async url => {
        if (url.includes('registry.npmjs.org')) {
          return {
            ok: true,
            json: async () => ({
              'dist-tags': { latest: '1.8.0' },
            }),
          };
        }
        // npmmirror 尚未同步 1.8.0，最高只有 1.7.3
        return {
          ok: true,
          json: async () => ({
            'dist-tags': { latest: '1.7.3' },
          }),
        };
      };

      const res = await resolveLatestPackageVersion('@yss-ui/components', 'https://registry.npmmirror.com', {
        fetchImpl: mockFetch,
      });

      expect(res.resolvedVersion).toBe('1.7.3');
      expect(res.warning).toContain('当前源 (https://registry.npmmirror.com) 尚未同步 @yss-ui/components@1.8.0');
    });

    it('镜像不可用/404 时不盲目写入官方源版本', async () => {
      const mockFetch = async url => {
        if (url.includes('registry.npmjs.org')) {
          return {
            ok: true,
            json: async () => ({
              'dist-tags': { latest: '1.8.0' },
            }),
          };
        }
        return { ok: false, status: 404 };
      };

      const res = await resolveLatestPackageVersion('@yss-ui/components', 'https://private-reg.com', {
        fetchImpl: mockFetch,
      });

      expect(res.resolvedVersion).toBeNull();
      expect(res.warning).toContain('无法获取 @yss-ui/components 最新元数据');
    });

    it('超时与网络异常优雅返回 null', async () => {
      const slowFetch = () => new Promise(resolve => setTimeout(resolve, 500));
      const res = await fetchPackageMetadata('@yss-ui/components', OFFICIAL_REGISTRY, {
        fetchImpl: slowFetch,
        timeoutMs: 50,
      });
      expect(res).toBeNull();
    });
  });

  describe('syncDependencies 完整流程', () => {
    const setupProjectFixture = async () => {
      const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-dep-fixture-'));
      await fs.mkdir(path.join(projectDir, 'packages'), { recursive: true });

      // 根目录 package.json
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-root',
            devDependencies: {
              '@yss-ui/skills-cli': '^1.0.14',
              typescript: '^5.0.0',
            },
          },
          null,
          2
        )
      );

      // packages/package.json
      await fs.writeFile(
        path.join(projectDir, 'packages/package.json'),
        JSON.stringify(
          {
            name: 'test-child',
            dependencies: {
              '@yss-ui/components': '^1.7.3',
              '@yss-ui/hooks': '~1.1.3',
              '@yss-ui/utils': '1.0.6',
              vue: '^3.3.8',
            },
          },
          null,
          2
        )
      );

      // 初始 lockfile
      await fs.writeFile(path.join(projectDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');

      return projectDir;
    };

    it('对齐成功：保留原前缀 (^/~ / 精确) 并更新两处 package.json', async () => {
      const projectDir = await setupProjectFixture();
      try {
        const mockFetch = async url => {
          let latest = '1.8.0';
          if (url.includes('skills-cli')) latest = '1.1.0';
          if (url.includes('hooks')) latest = '1.2.0';
          if (url.includes('utils')) latest = '1.0.8';

          return {
            ok: true,
            json: async () => ({
              'dist-tags': { latest },
            }),
          };
        };

        const result = await syncDependencies(projectDir, {
          fetchImpl: mockFetch,
          spawnImpl: () => ({
            once: (evt, cb) => {
              if (evt === 'exit') cb(0);
            },
            kill: () => undefined,
          }),
        });

        expect(result.lockfile).toBe('regenerated');
        expect(result.updates.length).toBe(4);

        const componentsUpdate = result.updates.find(u => u.name === '@yss-ui/components');
        expect(componentsUpdate).toMatchObject({
          from: '^1.7.3',
          to: '^1.8.0',
          status: 'updated',
        });

        const hooksUpdate = result.updates.find(u => u.name === '@yss-ui/hooks');
        expect(hooksUpdate).toMatchObject({
          from: '~1.1.3',
          to: '~1.2.0',
          status: 'updated',
        });

        const utilsUpdate = result.updates.find(u => u.name === '@yss-ui/utils');
        expect(utilsUpdate).toMatchObject({
          from: '1.0.6',
          to: '1.0.8',
          status: 'updated',
        });

        const skillsUpdate = result.updates.find(u => u.name === '@yss-ui/skills-cli');
        expect(skillsUpdate).toMatchObject({
          from: '^1.0.14',
          to: '^1.1.0',
          status: 'updated',
        });

        // 校验写盘结果
        const rootJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        expect(rootJson.devDependencies['@yss-ui/skills-cli']).toBe('^1.1.0');

        const pkgJson = JSON.parse(await fs.readFile(path.join(projectDir, 'packages/package.json'), 'utf8'));
        expect(pkgJson.dependencies['@yss-ui/components']).toBe('^1.8.0');
        expect(pkgJson.dependencies['@yss-ui/hooks']).toBe('~1.2.0');
        expect(pkgJson.dependencies['@yss-ui/utils']).toBe('1.0.8');
        expect(pkgJson.dependencies.vue).toBe('^3.3.8'); // 非 @yss-ui/* 不受影响
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('offline 模式下不发请求，标记 skipped 并保持文件不变', async () => {
      const projectDir = await setupProjectFixture();
      try {
        let fetchCalled = false;
        const mockFetch = async () => {
          fetchCalled = true;
          return { ok: false };
        };

        const result = await syncDependencies(projectDir, {
          offline: true,
          fetchImpl: mockFetch,
        });

        expect(fetchCalled).toBe(false);
        expect(result.lockfile).toBe('unchanged');
        expect(result.updates.every(u => u.status === 'skipped')).toBe(true);

        const pkgJson = JSON.parse(await fs.readFile(path.join(projectDir, 'packages/package.json'), 'utf8'));
        expect(pkgJson.dependencies['@yss-ui/components']).toBe('^1.7.3');
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('--no-sync-deps 显式关闭，完全不产生 updates', async () => {
      const projectDir = await setupProjectFixture();
      try {
        const result = await syncDependencies(projectDir, {
          syncDeps: false,
        });

        expect(result.updates.length).toBe(0);
        expect(result.lockfile).toBe('unchanged');
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('lockfile 刷新失败分支：自动删除旧 lockfile 并告警', async () => {
      const projectDir = await setupProjectFixture();
      try {
        const mockFetch = async () => ({
          ok: true,
          json: async () => ({ 'dist-tags': { latest: '1.8.0' } }),
        });

        // 模拟 pnpm 执行退出码非 0
        const mockSpawn = () => ({
          once: (evt, cb) => {
            if (evt === 'exit') cb(1);
          },
          kill: () => undefined,
        });

        const result = await syncDependencies(projectDir, {
          fetchImpl: mockFetch,
          spawnImpl: mockSpawn,
        });

        expect(result.lockfile).toBe('removed');
        expect(result.warnings.some(w => w.includes('已删除旧锁文件'))).toBe(true);
        await expect(fs.access(path.join(projectDir, 'pnpm-lock.yaml'))).rejects.toThrow();
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('镜像落后时不会把模板更高版本降级改回旧版本', async () => {
      const projectDir = await setupProjectFixture();
      try {
        // 将模板 dependencies 改为更高版本 ^1.8.0
        const pkgPath = path.join(projectDir, 'packages/package.json');
        const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        pkgJson.dependencies['@yss-ui/components'] = '^1.8.0';
        await fs.writeFile(pkgPath, JSON.stringify(pkgJson, null, 2));

        // 镜像上最新版由于滞后只有 1.7.3
        const mockFetch = async () => ({
          ok: true,
          json: async () => ({ 'dist-tags': { latest: '1.7.3' } }),
        });

        const result = await syncDependencies(projectDir, {
          fetchImpl: mockFetch,
        });

        const componentsUpdate = result.updates.find(u => u.name === '@yss-ui/components');
        expect(componentsUpdate).toMatchObject({
          from: '^1.8.0',
          to: '^1.8.0',
          status: 'unchanged',
        });

        // 确保文件没有被降级写回 1.7.3
        const updatedPkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        expect(updatedPkgJson.dependencies['@yss-ui/components']).toBe('^1.8.0');
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('复杂版本写法（如 workspace:*、latest、范围等）自动跳过不予改写', async () => {
      const projectDir = await setupProjectFixture();
      try {
        const pkgPath = path.join(projectDir, 'packages/package.json');
        const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        pkgJson.dependencies['@yss-ui/utils'] = 'workspace:*';
        pkgJson.dependencies['@yss-ui/theme'] = 'latest';
        await fs.writeFile(pkgPath, JSON.stringify(pkgJson, null, 2));

        const mockFetch = async () => ({
          ok: true,
          json: async () => ({ 'dist-tags': { latest: '1.8.0' } }),
        });

        const mockSpawn = () => ({
          once: (evt, cb) => {
            if (evt === 'exit') cb(0);
          },
          kill: () => undefined,
        });

        const result = await syncDependencies(projectDir, {
          fetchImpl: mockFetch,
          spawnImpl: mockSpawn,
        });

        // workspace:* 与 latest 不应作为候选被修改
        expect(result.updates.some(u => u.name === '@yss-ui/utils')).toBe(false);
        expect(result.updates.some(u => u.name === '@yss-ui/theme')).toBe(false);

        const updatedPkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        expect(updatedPkgJson.dependencies['@yss-ui/utils']).toBe('workspace:*');
        expect(updatedPkgJson.dependencies['@yss-ui/theme']).toBe('latest');
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });

    it('超时或 404 保留原版本并标记 failed', async () => {
      const projectDir = await setupProjectFixture();
      try {
        const mockFetch = async () => ({
          ok: false,
          status: 500,
        });

        const result = await syncDependencies(projectDir, {
          fetchImpl: mockFetch,
        });

        expect(result.updates.every(u => u.status === 'failed')).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        const pkgJson = JSON.parse(await fs.readFile(path.join(projectDir, 'packages/package.json'), 'utf8'));
        expect(pkgJson.dependencies['@yss-ui/components']).toBe('^1.7.3');
      } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
      }
    });
  });
});
