import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatPreviewTable, REGISTRY_PENDING_LABEL, resolvePreviewRegistry } from '../src/preview.mjs';

describe('预览表「依赖版本」registry 与实际对齐规则一致', () => {
  let cacheDir;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-frontend-template-preview-'));
  });

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  it('读取模板缓存 .npmrc：@yss-ui:registry 优先于 registry', async () => {
    await fs.writeFile(
      path.join(cacheDir, '.npmrc'),
      'registry=https://registry.example.com/\n@yss-ui:registry=https://registry.npmmirror.com/\n'
    );
    expect(await resolvePreviewRegistry({ cacheDir }, {})).toBe('https://registry.npmmirror.com');
  });

  it('npm_config_registry 优先于模板 .npmrc', async () => {
    await fs.writeFile(path.join(cacheDir, '.npmrc'), '@yss-ui:registry=https://registry.npmmirror.com/\n');
    const env = { npm_config_registry: 'https://npm.internal.com/' };
    expect(await resolvePreviewRegistry({ cacheDir }, env)).toBe('https://npm.internal.com');
  });

  it('模板缓存存在但未配置 .npmrc 时为官方源', async () => {
    expect(await resolvePreviewRegistry({ cacheDir }, {})).toBe('https://registry.npmjs.org');
  });

  it('模板尚未拉取时不猜测，显示以模板 .npmrc 为准', async () => {
    const missing = path.join(cacheDir, 'not-cloned-yet');
    expect(await resolvePreviewRegistry({ cacheDir: missing }, {})).toBe(REGISTRY_PENDING_LABEL);
  });

  it('表格展示传入的 registry', () => {
    const table = formatPreviewTable({ name: 'app' }, {}, '/tmp/app', { registry: 'https://registry.npmmirror.com' });
    expect(table).toContain('生成后对齐最新 (registry: https://registry.npmmirror.com)');
  });
});
