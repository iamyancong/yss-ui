#!/usr/bin/env node

/**
 * @file pack-workbuddy-connector.mjs
 * @description 构建 yss-ui MCP 连接器包（MCP + Skill / stdio）。
 *              MCP Server 由 WorkBuddy 通过 npx 拉起已发布的 @yss-ui/mcp npm 包，
 *              包内不放 node_modules、不放服务代码，只放元信息、连接配置、图标与引导技能。
 *              执行：pnpm pack:connector
 *              规范：https://open.workbuddy.cn/docs/connector
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CONNECTOR, CONNECTOR_TOOLS } from './workbuddy-assets.config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(REPO_ROOT, 'dist', 'workbuddy', 'connector');
const PKG_DIR = path.join(OUT_DIR, CONNECTOR.source);
const MCP_SRC = path.join(REPO_ROOT, 'packages', 'mcp');
const MAX_ZIP_BYTES = 20 * 1024 * 1024;

const writeJson = (file, data) =>
  fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');

/** 校验配置、工具清单与源码的一致性。 */
async function validateSources() {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(CONNECTOR.source)) {
    throw new Error(`source 必须为 kebab-case: ${CONNECTOR.source}`);
  }
  const pkg = JSON.parse(await fs.readFile(path.join(MCP_SRC, 'package.json'), 'utf-8'));
  const expectedVersion = CONNECTOR.npmPackage.split('@').pop();
  if (pkg.version !== expectedVersion) {
    throw new Error(`npm 包版本不一致：配置 ${expectedVersion}，源码 ${pkg.version}`);
  }
  const toolsJs = await fs.readFile(path.join(MCP_SRC, 'lib', 'tools.js'), 'utf-8');
  const actualTools = [...toolsJs.matchAll(/^\s*name:\s*'([a-z_]+)',/gm)].map(m => m[1]).sort();
  const documentedTools = CONNECTOR_TOOLS.map(t => t.name).sort();
  if (JSON.stringify(actualTools) !== JSON.stringify(documentedTools)) {
    throw new Error(
      `工具清单与 lib/tools.js 不一致：\n  源码: ${actualTools.join(', ')}\n  配置: ${documentedTools.join(', ')}`
    );
  }
  await fs.access(path.join(REPO_ROOT, CONNECTOR.iconSource));
  console.log(`✅ 源校验通过：npm ${CONNECTOR.npmPackage}、${actualTools.length} 个 MCP 工具、图标素材存在`);
}

function buildConnectorMeta() {
  return {
    name: CONNECTOR.name,
    name_zh: CONNECTOR.nameZh,
    name_en: CONNECTOR.nameEn,
    description: CONNECTOR.description,
    description_zh: CONNECTOR.descriptionZh,
    description_en: CONNECTOR.descriptionEn,
    source: CONNECTOR.source,
    type: CONNECTOR.type,
    // 只读本地文档索引，无凭证、无用户数据，因此省略 auth_mode
    version: CONNECTOR.version,
    examples_zh: CONNECTOR.examplesZh,
    examples_en: CONNECTOR.examplesEn,
    // runtime / name_zh / examples_zh 等字段需要较新客户端
    minWorkbuddyVersion: CONNECTOR.minWorkbuddyVersion
  };
}

function buildMcpJson() {
  return {
    mcpServers: {
      [CONNECTOR.mcpServerKey]: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', CONNECTOR.npmPackage],
        timeout: CONNECTOR.timeout,
        // 平台托管 Node，用户机器无需预装
        runtime: CONNECTOR.runtime
      }
    }
  };
}

function buildGuideSkill() {
  const sections = CONNECTOR_TOOLS.map(tool => {
    const rows = tool.params.length
      ? `| 参数 | 类型 | 必填 | 说明 |\n|---|---|:--:|---|\n${tool.params
          .map(p => `| \`${p.name}\` | ${p.type} | ${p.required ? '是' : '否'} | ${p.desc} |`)
          .join('\n')}`
      : '无需参数。';
    return `### ${tool.name}\n\n${tool.summary}\n\n${rows}`;
  }).join('\n\n');

  return `---
name: ${CONNECTOR.guideSkillName}
description: 使用 YSS UI 组件文档 MCP 查询真实组件 API、Schema、官方 Demo 与代码生成规则，杜绝臆造组件与属性。
---

# YSS UI 组件文档 MCP 使用指南

## 何时必须使用

编写任何 \`@yss-ui/components\` 组件配置、Formily JSON Schema、YTable 列配置或页面样式前，
必须先用本连接器的工具核对真实 API。**严禁凭记忆猜测属性、事件、插槽，严禁臆造 Y 前缀组件**；
工具中查不到就明确告知用户「文档未提供」，不要编造替代写法。

## 推荐调用顺序

1. \`get_codegen_rules\` — 每次生成业务代码前先读一次硬规则；
2. \`list_components\` / \`get_component_schema\` — 确认组件真实存在及其 Props 约束；
3. \`get_component_docs\` — 读取 props / events / slots / methods 章节；
4. \`get_demo\` — 取官方标准写法作为实现基准；
5. \`search_docs\` — 以上都定位不到时做中文全文检索；
6. \`list_skills\` / \`get_skill\` — 需要完整开发规范时读取对应 Skill。

## 可用工具（${CONNECTOR_TOOLS.length} 个）

${sections}

## 边界与错误处理

- 本服务是**本地只读文档索引**：零网络请求、无需鉴权、不写盘、不访问用户业务数据。
- 未知 \`componentsVersion\` 时不得推断新版本能力，先请用户确认实际安装版本。
- 带本地执行脚本的 Skill（如脚手架）需要用户在项目中另行安装 \`@yss-ui/skills-cli\`；
  MCP 只提供只读文档，不要尝试替用户执行未安装的脚本。
- 工具返回「未找到」时，改用 \`search_docs\` 或 \`list_components\` 核对名称，不要直接改为手写配置。
- 连接失败时提示用户检查 Node 运行时（连接器已声明 runtime，由 WorkBuddy 自动准备）后重试。

## 安全

不要向任何工具传递账号、密码、Token、私钥；本服务不需要任何凭证。
`;
}

async function prepareIcon() {
  const src = path.join(REPO_ROOT, CONNECTOR.iconSource);
  const dest = path.join(PKG_DIR, 'icon.png');
  execFileSync('sips', ['-z', '64', '64', src, '--out', dest], { stdio: 'ignore' });
  const size = (await fs.stat(dest)).size;
  if (size > 200 * 1024) throw new Error(`图标过大: ${(size / 1024).toFixed(1)}KB`);
  return size;
}

/** 按官方「提交检查清单」做本地复核。 */
async function assertConnectorPackage() {
  const meta = JSON.parse(await fs.readFile(path.join(PKG_DIR, 'connector-meta.json'), 'utf-8'));
  const mcp = JSON.parse(await fs.readFile(path.join(PKG_DIR, 'mcp.json'), 'utf-8'));
  const errors = [];

  for (const key of ['name', 'name_zh', 'name_en', 'description', 'description_zh', 'description_en', 'source', 'version']) {
    if (!meta[key]) errors.push(`connector-meta.json 缺少 ${key}`);
  }
  if (!Array.isArray(meta.examples_zh) || !Array.isArray(meta.examples_en)) {
    errors.push('connector-meta.json 缺少中英文示例');
  }
  const servers = Object.keys(mcp.mcpServers || {});
  if (servers.length !== 1) errors.push(`mcp.json 必须且只能有 1 个 Server，当前 ${servers.length} 个`);
  if (mcp.mcpServers?.[servers[0]]?.command !== 'npx') errors.push('stdio MCP 须用 npx 启动');
  if (!meta.minWorkbuddyVersion) errors.push('用了 runtime 字段但未声明 minWorkbuddyVersion');

  const guide = await fs.readFile(
    path.join(PKG_DIR, 'skills', CONNECTOR.guideSkillName, 'SKILL.md'), 'utf-8'
  );
  if (!/^---\nname: /m.test(guide)) errors.push('引导技能缺少 frontmatter');
  for (const tool of CONNECTOR_TOOLS) {
    if (!guide.includes(tool.name)) errors.push(`引导技能未说明工具 ${tool.name}`);
  }
  for (const file of ['icon.png', 'connector-meta.json', 'mcp.json']) {
    try { await fs.access(path.join(PKG_DIR, file)); } catch { errors.push(`缺少文件: ${file}`); }
  }
  const allText = guide + JSON.stringify(meta) + JSON.stringify(mcp);
  if (/(sk-[a-zA-Z0-9]{16,}|Bearer\s+[a-zA-Z0-9._-]{20,}|BEGIN (RSA|OPENSSH) PRIVATE KEY)/.test(allText)) {
    errors.push('检测到疑似硬编码凭证');
  }
  if (errors.length) throw new Error('连接器包未通过提交检查清单：\n  - ' + errors.join('\n  - '));
  console.log('✅ 提交检查清单通过：元信息、单 Server、引导技能、图标、无硬编码凭证');
}

function buildZip(zipName, cwd, target, requiredEntry) {
  const zipPath = path.join(OUT_DIR, zipName);
  execFileSync('zip', ['-q', '-r', '-X', zipPath, target, '-x', '*.DS_Store'], { cwd });
  const size = Number(execFileSync('stat', ['-f', '%z', zipPath], { encoding: 'utf-8' }).trim());
  if (size > MAX_ZIP_BYTES) throw new Error(`${zipName} 超过 20MB`);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' }).split('\n').map(s => s.trim());
  if (!entries.includes(requiredEntry)) {
    throw new Error(`${zipName} 缺少 ${requiredEntry}（平台会报「包内未找到 connector-meta.json」）`);
  }
  if (entries.some(e => e.includes('.DS_Store'))) throw new Error(`${zipName} 含 .DS_Store`);
  return size / 1024;
}

async function main() {
  console.log('🚀 构建 WorkBuddy 连接器包...\n');
  await validateSources();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.rm(PKG_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(PKG_DIR, 'skills', CONNECTOR.guideSkillName), { recursive: true });

  await writeJson(path.join(PKG_DIR, 'connector-meta.json'), buildConnectorMeta());
  await writeJson(path.join(PKG_DIR, 'mcp.json'), buildMcpJson());
  await fs.writeFile(
    path.join(PKG_DIR, 'skills', CONNECTOR.guideSkillName, 'SKILL.md'),
    buildGuideSkill(),
    'utf-8'
  );
  const iconSize = await prepareIcon();
  await assertConnectorPackage();

  const mainZip = buildZip(
    `${CONNECTOR.source}-connector.zip`, OUT_DIR, CONNECTOR.source,
    `${CONNECTOR.source}/connector-meta.json`
  );
  const flatZip = buildZip(
    `${CONNECTOR.source}-connector-flat.zip`, PKG_DIR, '.',
    'connector-meta.json'
  );

  console.log(`\n📦 产物（dist/workbuddy/connector/）：`);
  console.log(`   ${CONNECTOR.source}-connector.zip        ${mainZip.toFixed(1)}KB  标准版（带一层 ${CONNECTOR.source}/，按官方文档结构）`);
  console.log(`   ${CONNECTOR.source}-connector-flat.zip   ${flatZip.toFixed(1)}KB  备选版（文件直接在 zip 根）`);
  console.log(`   icon.png 64×64 ${(iconSize / 1024).toFixed(1)}KB | ${CONNECTOR_TOOLS.length} 个工具已写入引导技能`);
  console.log('\n💡 优先上传标准版；若平台提示找不到 connector-meta.json，改用 flat 版。');
  console.log('   提交说明里请写明：本地 stdio 只读文档服务，由 npx 启动，无公网端点、无需凭证。\n');
}

main().catch(err => {
  console.error('❌ 构建失败:', err.message);
  process.exit(1);
});
