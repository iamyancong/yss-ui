#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { x as extractTarball } from 'tar';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_RETRIES = 5;
const DEFAULT_DELAY_MS = 2000;
const MCP_PACKAGE_NAME = '@yss-ui/mcp';
const COMPONENTS_PACKAGE_NAME = '@yss-ui/components';

/**
 * 读取 CI 发版摘要，避免从工作区版本推断本批次目标版本。
 *
 * @param {string} summaryPath 发版摘要路径
 * @returns {Array<{name: string, oldVersion: string, newVersion: string}>} 发版包列表
 */
export const readReleaseSummary = summaryPath => {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  if (!Array.isArray(summary.packages) || summary.packages.length === 0) {
    throw new Error(`发版摘要为空或格式错误：${summaryPath}`);
  }
  for (const item of summary.packages) {
    if (!item || typeof item.name !== 'string' || typeof item.newVersion !== 'string' || !item.newVersion) {
      throw new Error(`发版摘要包含无效包条目：${summaryPath}`);
    }
  }
  return summary.packages;
};

/**
 * 根据本批次摘要解析 components 目标版本；MCP-only 修复时由调用方传入当前 registry 版本。
 *
 * @param {Array<{name: string, newVersion: string}>} packages 发版包列表
 * @param {string} fallbackVersion 没有 components 发版时的 registry 当前版本
 * @returns {string} 应写入 MCP 索引的 components 版本
 */
export const resolveExpectedComponentsVersion = (packages, fallbackVersion) => {
  const components = packages.find(item => item.name === COMPONENTS_PACKAGE_NAME);
  return components?.newVersion || fallbackVersion;
};

/**
 * 校验解包后的 MCP 发布内容。
 *
 * @param {{ manifest: object, index: object, mcpVersion: string, expectedComponentsVersion: string }} input 发布内容
 * @returns {void}
 */
export const assertPublishedMcpContract = ({ manifest, index, mcpVersion, expectedComponentsVersion }) => {
  assert.equal(manifest.name, MCP_PACKAGE_NAME, 'MCP tarball 包名不正确');
  assert.equal(manifest.version, mcpVersion, 'MCP tarball 版本不正确');
  assert.equal(index.componentsVersion, expectedComponentsVersion, 'MCP 索引顶层 componentsVersion 未对齐发布目标');

  const contract = index.consumptionContract;
  assert.ok(contract && typeof contract === 'object', 'MCP tarball 缺少 consumptionContract');
  assert.equal(
    contract.componentsVersion,
    expectedComponentsVersion,
    'MCP consumptionContract.componentsVersion 未对齐发布目标'
  );
  assert.ok(contract.plugin?.vitePeer, 'MCP consumptionContract 缺少 plugin.vitePeer');
  assert.equal(
    contract.plugin.vitePeer,
    contract.peerDependencies?.vite,
    'MCP plugin.vitePeer 与顶层 peerDependencies.vite 不一致'
  );
};

/**
 * 从 registry 获取指定包的最新版本，用于 MCP-only 发布的目标版本回退。
 *
 * @param {{ name: string, registry: string }} input 包名与 registry
 * @returns {string} registry 版本
 */
const readRegistryVersion = ({ name, registry }) =>
  execFileSync('npm', ['view', name, 'version', '--registry', registry], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/**
 * 从 registry 打包精确版本，避免 npm pack 使用 latest 造成误验收。
 *
 * @param {{ name: string, version: string, registry: string, destination: string }} input 打包参数
 * @returns {string} tarball 路径
 */
export const packRegistryPackage = ({ name, version, registry, destination }) => {
  execFileSync('npm', ['pack', `${name}@${version}`, '--registry', registry, '--pack-destination', destination], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tarballs = fs.readdirSync(destination).filter(file => file.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`${name}@${version} 未生成唯一 registry tarball：${tarballs.join(', ') || '无'}`);
  }
  return path.join(destination, tarballs[0]);
};

/**
 * 清理一次验证目录中可能由失败的 npm pack 留下的 tarball。
 *
 * @param {string} directory 临时打包目录
 * @returns {void}
 */
const clearTarballs = directory => {
  for (const file of fs.readdirSync(directory).filter(item => item.endsWith('.tgz'))) {
    fs.rmSync(path.join(directory, file), { force: true });
  }
};

/**
 * 等待 registry 传播并验证已发布 MCP tarball。
 *
 * @param {{
 *   mcpVersion: string,
 *   expectedComponentsVersion: string,
 *   registry?: string,
 *   retries?: number,
 *   delayMs?: number,
 *   tempParent?: string,
 *   pack?: typeof packRegistryPackage
 * }} input 验证参数
 * @returns {Promise<{mcpVersion: string, expectedComponentsVersion: string, tarball: string}>} 验证结果
 */
export const verifyPublishedMcpTarball = async ({
  mcpVersion,
  expectedComponentsVersion,
  registry = DEFAULT_REGISTRY,
  retries = DEFAULT_RETRIES,
  delayMs = DEFAULT_DELAY_MS,
  tempParent = os.tmpdir(),
  pack = packRegistryPackage,
}) => {
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'yss-published-mcp-'));
  const packDirectory = path.join(tempRoot, 'pack');
  const extractDirectory = path.join(tempRoot, 'extract');
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(extractDirectory, { recursive: true });

  let tarball;
  let lastError;
  const attemptCount = Number.isInteger(retries) ? Math.max(1, retries) : DEFAULT_RETRIES;
  const waitMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : DEFAULT_DELAY_MS;
  try {
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      try {
        clearTarballs(packDirectory);
        tarball = pack({
          name: MCP_PACKAGE_NAME,
          version: mcpVersion,
          registry,
          destination: packDirectory,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attemptCount) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }
    if (!tarball) {
      throw new Error(
        `registry tarball 验证失败：${MCP_PACKAGE_NAME}@${mcpVersion} 在 ${attemptCount} 次尝试后仍不可用：${
          lastError?.message || '未知错误'
        }`
      );
    }

    await extractTarball({ file: tarball, cwd: extractDirectory });
    const packageRoot = path.join(extractDirectory, 'package');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const index = JSON.parse(fs.readFileSync(path.join(packageRoot, 'data/index.json'), 'utf8'));
    assertPublishedMcpContract({ manifest, index, mcpVersion, expectedComponentsVersion });
    return { mcpVersion, expectedComponentsVersion, tarball };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

/**
 * 根据发版摘要验证刚发布的 MCP 包。
 *
 * @param {{ summaryPath?: string, registry?: string }} [options] 验证配置
 * @returns {Promise<object>} 验证结果
 */
export const verifyPublishedRelease = async ({
  summaryPath = path.join(ROOT_DIR, 'scripts/.release-summary.json'),
  registry = DEFAULT_REGISTRY,
} = {}) => {
  if (!fs.existsSync(summaryPath)) {
    return { skipped: true, reason: `未找到发版摘要：${summaryPath}` };
  }
  const packages = readReleaseSummary(summaryPath);
  const mcp = packages.find(item => item.name === MCP_PACKAGE_NAME);
  if (!mcp?.newVersion) {
    return { skipped: true, reason: `本批次未发布 ${MCP_PACKAGE_NAME}` };
  }
  const componentsTarget = packages.find(item => item.name === COMPONENTS_PACKAGE_NAME)?.newVersion;
  const currentComponentsVersion = componentsTarget
    ? null
    : readRegistryVersion({ name: COMPONENTS_PACKAGE_NAME, registry });
  const expectedComponentsVersion = resolveExpectedComponentsVersion(packages, currentComponentsVersion);
  return verifyPublishedMcpTarball({
    mcpVersion: mcp.newVersion,
    expectedComponentsVersion,
    registry,
  });
};

const parseArgs = argv => {
  const options = {};
  for (const argument of argv.slice(2)) {
    if (argument.startsWith('--summary=')) options.summaryPath = argument.slice('--summary='.length);
    if (argument.startsWith('--registry=')) options.registry = argument.slice('--registry='.length);
  }
  return options;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPublishedRelease(parseArgs(process.argv))
    .then(result => {
      // eslint-disable-next-line no-console
      console.log(
        result.skipped
          ? `[published-release] SKIP ${result.reason}`
          : `[published-release] OK ${MCP_PACKAGE_NAME}@${result.mcpVersion} -> components@${result.expectedComponentsVersion}`
      );
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(`[published-release] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
