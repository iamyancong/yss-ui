#!/usr/bin/env node

/**
 * @file pack-workbuddy-expert.mjs
 * @description 一键打包 YSS 微应用全生命周期架构专家包，严格遵循 WorkBuddy 开放平台专家包规范
 *              （https://open.workbuddy.cn/docs/expert）。产出规范的 .codebuddy-plugin/plugin.json +
 *              agents/ + avatars/ 结构，内置 packages/skills 全量业务技能与 yss-ui MCP 离线契约数据，
 *              打包前在本地复刻平台开包硬规则做预检。执行：pnpm pack:expert
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const OUTPUT_BASE_DIR = path.join(REPO_ROOT, 'dist', 'workbuddy');
const EXPERT_DIR_NAME = 'yss-microapp-expert';
const EXPERT_TARGET_DIR = path.join(OUTPUT_BASE_DIR, EXPERT_DIR_NAME);
const ZIP_FILE_PATH = path.join(OUTPUT_BASE_DIR, `${EXPERT_DIR_NAME}.zip`);

// 全量打包策略：packages/skills 下除 evals / rules 外的所有技能都进包。
// 专家包是独立分发的 zip，平台只扫描包内资源，不会去开源仓库拉取；SKILL.md 里的
// `../xxx/SKILL.md` 同级引用会被平台判为「必需资源」，缺一个就驳回「内置文件缺失」。
// resolveSkillClosure() 仍会做一次传递依赖闭包解析，作为以后新增引用的兜底。
const SKILL_EXCLUDES = new Set(['evals', 'rules']);

// yss-ui MCP 的离线契约数据（真实组件文档 / Schema），随包分发，供专家直接查阅。
// 注意：MCP 服务本体依赖 @modelcontextprotocol/sdk，node_modules 不会进包，
// 把 bin/lib 打进专家包在用户机器上根本跑不起来，因此只内置「可查数据」，
// 并在 Agent 人设里指引优先读取。实时 MCP 需按官方文档单独声明依赖。
const MCP_SOURCE_DATA_DIR = path.join(REPO_ROOT, 'packages', 'mcp', 'data');
const MCP_SOURCE_README = path.join(REPO_ROOT, 'packages', 'mcp', 'README.md');
const MCP_REF_DIR_NAME = 'references/yss-ui-mcp';
const MCP_DATA_FILES = ['index.json', 'schemas.json', 'coverage-summary.json'];
const MCP_TOOLS = [
  'get_consumption_contract', 'list_components', 'get_component_docs', 'get_demo',
  'search_docs', 'list_skills', 'get_skill', 'get_codegen_rules',
  'get_component_schema', 'get_test_coverage'
];
const MCP_PACKAGE = '@yss-ui/mcp@0.11.0';

// 是否让专家包自带自定义 MCP（.mcp.json）。默认关闭：专家通过市场连接器获得 MCP 能力更稳妥。
// 一旦声明，用户召唤专家前会被强制引导连接，连不上会卡住对话。
const DECLARE_MCP_DEPENDENCY = false;

// 阶段 4 回连开关：连接器 yss-ui-docs 在开放平台审核上架后，把它改为 true 重新打包，
// 专家召唤时就会自动引导用户连接该连接器（dependencies.connectors 引用已上架 source）。
// 现在保持 false，避免引用一个尚不存在的 source 导致引导失败。
const CONNECTOR_SOURCE = 'yss-ui-docs';
const DECLARE_CONNECTOR_DEPENDENCY = false;

/**
 * 开放平台展示字段（硬规则参见 https://open.workbuddy.cn/docs/expert）
 *
 * 注意：官方网页示例与官方模板 zip 中的 defaultInitPrompt 与 quickPrompts[0]
 * 并不一致，但平台开包解析是硬校验「必须与第一条完全一致」，因此这里把
 * QUICK_PROMPTS 作为唯一来源，defaultInitPrompt 由其派生，杜绝文案漂移。
 */
const EXPERT_VERSION = '1.1.0';
const DISPLAY_NAME = {
  en: 'YSS Frontend Architect',
  zh: 'YSS 前端架构师'
};
const PROFESSION = {
  en: 'Micro-Frontend Engineering Expert',
  zh: '微应用工程专家'
};
const DESCRIPTION_EN =
  'Enterprise micro-frontend architect for YSS UI covering scaffolding, OpenAPI codegen, UI standards and QA gates.';
const DISPLAY_DESCRIPTION = {
  en: 'Enterprise-grade YSS micro-frontend architect covering dry-run scaffolding, OpenAPI codegen, standards-compliant UI development, BigInt safety and automated QA gates.',
  // 47 字，官方要求 40-50 字
  zh: '专注 YSS 微前端体系的架构专家，负责脚手架预检、接口生成、规范开发、大数防截断与质量自测。'
};
const TAGS = [
  { en: 'YSS UI', zh: 'YSS UI' },
  { en: 'Micro Frontend', zh: '微前端' },
  { en: 'OpenAPI / Orval', zh: '接口生成' }
];
const QUICK_PROMPTS = [
  {
    en: 'Scaffold a new YSS micro-app with dry-run check',
    zh: '通过官方脚手架初始化一个新的微应用工程（带预检）'
  },
  {
    en: 'Generate strongly-typed API code from openapi.json and build CRUD page',
    zh: '读取 openapi.json 通过 pnpm generate:api 生成接口并开发 CRUD 列表页'
  },
  {
    en: 'Review code against YSS UI module separation and BigInt safety standards',
    zh: '按照 YSS UI 规范审查当前页面的组件行数、大数安全与 MCP 组件真实性'
  }
];
const VALID_CATEGORY_IDS = new Set([
  '01-ProductDesign', '02-Engineering', '03-GameSpatial', '04-DataAI',
  '05-MarketingGrowth', '06-ContentCreative', '07-SalesCommerce',
  '08-FinanceInvestment', '09-OperationsHR', '10-ProjectQuality',
  '11-SecurityCompliance', '12-IndustryConsultant', '13-TencentZone',
  '14-WorldWise', '15-Education'
]);

/**
 * 递归复制目录
 */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

const SKILLS_SOURCE_DIR = path.join(REPO_ROOT, 'packages', 'skills');
// 匹配 ../xxx/SKILL.md、../../xxx/SKILL.md 等同级技能引用；平台把它们视为「必需资源」
const SKILL_REF_RE = new RegExp('(?:[.][.]/)+([a-z0-9][a-z0-9-]*)/SKILL[.]md', 'g');

/**
 * 取 packages/skills 下的全部业务技能（排除 evals / rules 等非技能目录）。
 * 只要目录里没有 SKILL.md 就视为非法技能，直接终止打包，避免产出不合规的声明。
 */
async function getAllAvailableSkills() {
  const entries = await fs.readdir(SKILLS_SOURCE_DIR, { withFileTypes: true });
  const skills = entries
    .filter(entry => entry.isDirectory() && !SKILL_EXCLUDES.has(entry.name))
    .map(entry => entry.name)
    .sort();

  for (const name of skills) {
    try {
      await fs.access(path.join(SKILLS_SOURCE_DIR, name, 'SKILL.md'));
    } catch {
      throw new Error(`技能缺少 SKILL.md: packages/skills/${name}`);
    }
  }
  return skills;
}

/**
 * 递归列出目录下的所有 Markdown 文件
 */
async function collectMarkdownFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdownFiles(full)));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * 解析技能引用的传递依赖闭包：从种子技能出发，扫描其目录下所有 .md 中的
 * `../xxx/SKILL.md` 引用，把被引用的技能一并纳入，直到收敛。
 * 专家包是独立分发的 zip，平台只扫描包内资源，包外（开源仓库）有这些技能不算数。
 */
async function resolveSkillClosure(seedSkills) {
  const closure = new Set(seedSkills);
  const queue = [...seedSkills];

  while (queue.length) {
    const name = queue.shift();
    const dir = path.join(SKILLS_SOURCE_DIR, name);
    let files;
    try {
      files = await collectMarkdownFiles(dir);
    } catch {
      throw new Error(`技能目录不存在: packages/skills/${name}`);
    }
    if (!files.some(file => path.basename(file) === 'SKILL.md')) {
      throw new Error(`技能缺少 SKILL.md: packages/skills/${name}`);
    }
    for (const file of files) {
      const text = await fs.readFile(file, 'utf-8');
      for (const match of text.matchAll(SKILL_REF_RE)) {
        const dep = match[1];
        if (!closure.has(dep)) {
          closure.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return [...closure].sort();
}

/**
 * 生成专家核心 System Prompt (全生命周期 6 大阶段)
 */
function generateSystemPromptContent(skills) {
  return `# 角色设定：YSS 微应用企业级前端架构专家

你是具备 YSS 官方规范与工业级工程化思维的资深前端架构专家，主技术栈为 **Vue 3 (<script setup lang="ts">) + TypeScript + Vite + qiankun 微前端体系 + @yss-ui/components**。

你不是通用的代码片段生成器。你拥有完整的 **SOP 技能库（${skills.length} 个专项技能）** 与 **YSS UI 组件真实契约数据**，严格遵循**从脚手架初始化、OpenAPI 契约代码生成、标准业务开发、接口联调大数防御、质量自测到规范提交与雨燕运维**的全生命周期工作流。

---

## 核心思考原则（查阅为先，拒绝臆造）

1. **严禁凭记忆猜测组件 API**：编写任何组件或表单配置前，必须先用 Grep / Read 查阅随包内置的离线契约数据
   \`references/yss-ui-mcp/data/schemas.json\`（组件属性、事件、插槽约束）与
   \`references/yss-ui-mcp/data/index.json\`（组件文档与官方 Demo 索引）；
   若当前会话已连接 \`yss-ui MCP\` 连接器，也可优先调用 \`get_component_docs\`、\`get_component_schema\`、\`get_demo\`。
   严格禁止编造未在这些数据中出现的属性、事件或插槽；查不到就明确告知「文档未提供」。
2. **严禁臆造组件**：已封装组件为 \`YButton\`、\`YCard\`、\`YTable\`、\`YEditTable\`、\`YTree\`、\`YSplitPane\`、\`YFormily\`、\`YConditionBuilder\`、\`YFileImport\`、\`YConfigProvider\`、\`YMonthCalendar\`、\`YCron\` 以及按需的 \`YMonaco\` / \`YEcharts\` / \`YSheet\`；
   未封装组件必须从 \`ant-design-vue\` 导入（如 \`Modal\`、\`Drawer\`、\`Popconfirm\`、\`Input\`），**严禁臆造 \`YModal\`、\`YDrawer\`、\`YInput\`、\`YPopconfirm\`**。

---

## 全生命周期 6 大标准作业准则（SOP）

### 阶段 1：工程初始化（微应用脚手架）
- **触发意图**：从零搭建新工程、新建微前端子应用、微应用骨架搭建。
- **执行规范**：
  1. 必须使用 YSS 官方脚手架，调用 \`create-yss-app\` 流程：优先通过 \`npx -y @yss-ui/create "<appName>" --dry-run --json\` 执行参数预检；
  2. 向用户呈报预检确认表（应用英文名、中文名、激活路由小驼峰、端口号、目标路径），**严禁在未经确认前私自写空文件或手搓未遵循微应用结构的临时工程**；
  3. 用户确认后正式落盘，并在新工程中执行 \`npx -y @yss-ui/skills-cli@latest sync\` 同步最新 AI 资产。

### 阶段 2：契约驱动与 API 生成（Server 层）
- **触发意图**：提供或更新了 \`openapi.json\`、Swagger、新增后端接口。
- **执行规范**：
  1. **禁止在业务代码中手写 axios 请求与假数据**；
  2. 前端 Server 层代码必须通过 \`pnpm generate:api\`（基于 Orval 管道）自动生成；
  3. 业务层统一从生成的产物具名导入 API 函数与 \`schemas\` 类型定义；
  4. **信赖 \`mutator.ts\` 响应契约**：接口已被拦截器解包，\`await\` 成功即业务成功，**严禁使用 \`if (res?.success)\` 冗余判断**；未配置 \`skipErrorHandler\` 时禁止在 \`catch\` 里重复弹 \`message.error\`。

### 阶段 3：YSS UI 规范业务开发（UI 与交互层）
- **触发意图**：列表查询、CRUD、动态表单、左树右表、详情弹窗。
- **执行规范**：
  1. **先查契约数据**：按上文「查阅为先」原则核对真实属性，禁止凭记忆写配置；
  2. **严禁臆造组件**：已封装组件（\`YTable\`、\`YFormily\`、\`YTree\`、\`YSplitPane\`、\`YCard\` 等）；未封装组件必须用 \`ant-design-vue\`（如 \`Modal\`、\`Drawer\`、\`Popconfirm\`）；**严禁臆造 \`YModal\`、\`YDrawer\`、\`YInput\`**；
  3. **页面模块化硬约束（关注点分离）**：主组件 \`index.vue\` 仅组合 Hooks 与模板，**代码行数原则上必须 ≤ 150 行**。超标必须严格拆解：
     - 常量、列配置、静态 Schema → \`constant.ts\`
     - 状态管理、数据请求、副作用 → \`hooks/useXxxList.ts\` / \`hooks/useXxxForm.ts\`
     - 模块样式 → \`style.less\`（SFC 内必须用 scoped + \`@import './style.less';\`，禁止在 TS 脚本内 import 样式）；
  4. **表单开发规范**：表单优先使用 \`YFormily\` + JSON Schema，严禁业务层直接引入 \`@formily/antdv\` UI。

### 阶段 4：接口联调与高危防御（数据通信层）
- **执行规范**：
  1. **雪花 ID / 大数精度防御**：后端 Long/BigInt ID（已由 json-bigint 字符串化），在组件传参、回显、详情查询时，**一律按 string 透传，严禁使用 \`Number(id)\`、\`parseInt(id)\`、\`+id\` 等任何数字转换**，避免生产 ID 截断事故；
  2. **文件导出与下载规范**：导出 Excel/CSV/PDF 等文件流时，必须优先使用 \`handleBlobResponse(res.data, res.headers)\`，自动处理文件名编码与二进制流转换；若生成方法缺少 blob 配置，必须显式传递 \`{ responseType: 'blob' }\`；
  3. **主题与样式 Token**：严禁硬编码 \`#1890ff\` 等品牌色及交互色阶，必须统一使用语义化 CSS 变量（如 \`--primary-color\`），透明态使用 \`color-mix\` 派生。

### 阶段 5：质量自测与门禁（验证层）
- **执行规范**：
  1. 代码改动完成后，主动运行并核验工程门禁：
     \`\`\`bash
     pnpm type-check
     pnpm lint:check
     \`\`\`
  2. **原型对照验收**：若根据原型图或旧系统复刻，必须先提取包含布局、表格自适应高度（\`useTableHeight\`）、操作列按钮权限（\`actionConfig\`）的验收清单，并在实现后逐项比对交付。

### 阶段 6：提交与部署运维（交付层）
- **执行规范**：
  1. **代码提交**：遵循 Conventional Commits 规范（\`type(scope): subject\`），使用中文简要说明变更背景；
  2. **雨燕部署运维**：若涉及环境部署、微应用配置检查，优先通过 \`yuyan-mcp-server\` 闭环，不得向用户索取任何账号密码与私钥。

---

## 快速路由表（按需检索技能）

- 新建工程/脚手架初始化 → \`skills/create-yss-app/SKILL.md\`
- OpenAPI 与 Orval 接口生成 → \`skills/api-integration/SKILL.md\`
- 整页业务架构与 CRUD 页面 → \`skills/yss-ui-business-page-generation/SKILL.md\`
- 数据表格与远程分页 → \`skills/ytable-usage/SKILL.md\` + \`skills/page-list-module/SKILL.md\`
- 表格自适应高度 → \`skills/use-table-height/SKILL.md\`
- 动态表单与联动 → \`skills/yss-formily/SKILL.md\` + \`skills/formily-linkage-effects/SKILL.md\`
- 文件与报表导出下载 → \`skills/file-export-download/SKILL.md\`
- 主题换肤与 Token 规范 → \`skills/theme-token-usage/SKILL.md\`
- 规范化 Git 提交 → \`skills/frontend-commit/SKILL.md\`

---

## 随包内置的 YSS UI 组件契约数据

\`references/yss-ui-mcp/data/\` 下是 ${MCP_PACKAGE} 生成的离线快照：
- \`schemas.json\`：组件属性、事件、插槽的结构化约束，写代码前必查；
- \`index.json\`：组件文档、官方 Demo 源码与技能索引；
- \`coverage-summary.json\`：文档覆盖率，用于判断某个组件是否有权威资料。

这些是只读参考数据，不依赖网络、不要求安装 node_modules。若需要实时查询能力，
可在 WorkBuddy 客户端把 \`${MCP_PACKAGE}\` 配置为自定义 MCP 连接器（stdio，\`npx -y ${MCP_PACKAGE}\`）。

---

## 内置全部业务技能清单（${skills.length} 个）

\`\`\`text
${skills.map(s => `skills/${s}/SKILL.md`).join('\n')}
\`\`\`
`;
}

/**
 * 生成带 YAML Frontmatter 的 Agent Markdown (WorkBuddy 专家标准)
 */
function generateAgentMarkdown(skills) {
  const frontmatter = `---
name: yss-microapp-expert
description: YSS 微应用企业级前端架构专家，覆盖从脚手架初始化、OpenAPI 契约生成 Server 层代码、YSS UI 业务规范开发、大数精度防御到自测提交的全生命周期闭环。
displayName:
  zh: ${DISPLAY_NAME.zh}
  en: ${DISPLAY_NAME.en}
profession:
  zh: ${PROFESSION.zh}
  en: ${PROFESSION.en}
maxTurns: 100
skills:
${skills.map(s => `  - ${s}`).join('\n')}
---

`;

  return frontmatter + generateSystemPromptContent(skills);
}

/**
 * 生成 WorkBuddy 开放平台标准 .codebuddy-plugin/plugin.json
 * 展示字段全部来自顶部常量，避免与 expert.json 等其它元数据重复维护。
 */
function generateCodebuddyPluginJson(skills) {
  const pluginJson = {
    name: EXPERT_DIR_NAME,
    version: EXPERT_VERSION,
    description: DESCRIPTION_EN,
    author: {
      name: 'YSS UI Team',
      email: 'wangyancong@yss.com.cn'
    },
    agents: [`./agents/${EXPERT_DIR_NAME}.md`],
    skills: skills.map(skill => `./skills/${skill}`),
    expertType: 'agent',
    agentName: EXPERT_DIR_NAME,
    displayName: { ...DISPLAY_NAME },
    profession: { ...PROFESSION },
    displayDescription: DISPLAY_DESCRIPTION,
    avatar: 'avatars/expert.png',
    categoryId: '02-Engineering',
    // 平台硬校验：defaultInitPrompt.zh/en 必须与 quickPrompts[0].zh/en 完全一致
    defaultInitPrompt: { ...QUICK_PROMPTS[0] },
    plugin: EXPERT_DIR_NAME,
    tags: TAGS.map(tag => ({ ...tag })),
    quickPrompts: QUICK_PROMPTS.map(prompt => ({ ...prompt }))
  };

  // 1) 自定义 MCP（.mcp.json）：默认关闭
  if (DECLARE_MCP_DEPENDENCY) {
    pluginJson.dependencies = { mcpServers: './.mcp.json' };
  }
  // 2) 引用已上架的连接器：连接器审核通过后把 DECLARE_CONNECTOR_DEPENDENCY 置 true
  if (DECLARE_CONNECTOR_DEPENDENCY) {
    pluginJson.dependencies = {
      ...(pluginJson.dependencies || {}),
      connectors: [CONNECTOR_SOURCE]
    };
  }
  return pluginJson;
}

// 说明：expert.json / manifest.json / prompts/ / connectors/mcp-config.json 都不是开放平台规范结构。
// 平台开包第一步只认 zip 根下的 .codebuddy-plugin/plugin.json；一旦改回上面那种旧结构，
// 就会报「未找到 .codebuddy-plugin/plugin.json，请确保该路径文件存在」。
// 另外 connectors/mcp-config.json 里的 packages/mcp/bin/yss-mcp.js 是仓库内相对路径，
// 用户机器上不存在，声明了也连不上，因此本脚本不产出这些文件。

/**
 * 复制 yss-ui MCP 的离线契约数据到 references/yss-ui-mcp/data/。
 * 只复制数据、不复制 bin/lib：MCP 服务依赖 @modelcontextprotocol/sdk，专家包内没有
 * node_modules，在用户机器上无法启动；把可执行代码塞进包里只会增加无效文件与审核噪音。
 */
async function copyMcpReferenceData() {
  const destDir = path.join(EXPERT_TARGET_DIR, MCP_REF_DIR_NAME, 'data');
  await fs.mkdir(destDir, { recursive: true });
  for (const file of MCP_DATA_FILES) {
    await fs.copyFile(path.join(MCP_SOURCE_DATA_DIR, file), path.join(destDir, file));
  }
  // MCP 官方说明（工具清单、与 Skills 的协同约束），作为只读知识一并内置
  await fs.copyFile(
    MCP_SOURCE_README,
    path.join(EXPERT_TARGET_DIR, MCP_REF_DIR_NAME, 'MCP-TOOLS.md')
  );
  await fs.writeFile(
    path.join(EXPERT_TARGET_DIR, MCP_REF_DIR_NAME, 'README.md'),
    generateMcpReferenceReadme(),
    'utf-8'
  );
}

function generateMcpReferenceReadme() {
  return `# YSS UI 组件契约数据（离线快照）

数据来自仓库 \`packages/mcp/data\`，由 ${MCP_PACKAGE} 生成，随专家包一起分发：

| 文件 | 用途 |
|---|---|
| \`data/index.json\` | 组件文档、官方 Demo 源码与技能索引 |
| \`data/schemas.json\` | 组件属性、事件、插槽的结构化约束 |
| \`data/coverage-summary.json\` | 文档覆盖率，判断某组件是否有权威资料 |
| \`MCP-TOOLS.md\` | @yss-ui/mcp 官方说明：工具清单与 Skills 协同约束 |

## 实时 MCP 可提供的工具（配置连接器后可用）

${MCP_TOOLS.map(tool => `- \`${tool}\``).join('\n')}

未配置连接器时，直接用 \`data/\` 下的离线快照完成同等查询即可。

## 怎么用

专家在写任何 YSS UI 组件配置前，应先用 Grep / Read 检索 \`data/schemas.json\` 与
\`data/index.json\`，确认属性、事件、插槽真实存在；查不到就明确告知「文档未提供」，
严禁凭记忆编造 API。这些数据是只读快照，不依赖网络，也不需要在用户机器上安装依赖。

## 关于实时 MCP

本包**没有**内置可运行的 MCP Server：\`@yss-ui/mcp\` 是 stdio 服务且依赖
\`@modelcontextprotocol/sdk\`，专家包里没有 node_modules，复制 bin/lib 过去也启动不了。
如需实时查询，两种方式：

1. 在 WorkBuddy 客户端把 \`npx -y ${MCP_PACKAGE}\` 配置为自定义 MCP 连接器；
2. 部署远程 HTTP/SSE 版 MCP 后，按官方文档在插件根目录放 \`.mcp.json\`
   并由 \`plugin.json\` 的 \`dependencies.mcpServers\` 指向它
   （脚本顶部 \`DECLARE_MCP_DEPENDENCY\` 开关，官方文档 https://open.workbuddy.cn/docs/expert）。
`;
}

/**
 * 可选：运行时 MCP 依赖配置。仅在 DECLARE_MCP_DEPENDENCY 打开时产出。
 * 注意官方 .mcp.json 示例为远程 url / type / headers 形式；stdio 形式请自行验证
 * 客户端兼容性后再启用，否则召唤专家时的连接引导可能失败。
 */
function generateMcpJson() {
  return {
    mcpServers: {
      'yss-ui': {
        command: 'npx',
        args: ['-y', MCP_PACKAGE],
        'x-workbuddy': {
          displayName: { zh: 'YSS UI 组件文档', en: 'YSS UI Component Docs' },
          description: {
            zh: '连接后可查询 YSS UI 组件真实文档、Schema 约束与官方 Demo，避免臆造 API。',
            en: 'Query real YSS UI component docs, schemas and demos instead of guessing APIs.'
          },
          auth: { type: 'none' }
        }
      }
    }
  };
}

/**
 * 生成 README.md
 */
function generateReadme(skills) {
  return `# YSS 微应用全生命周期架构专家 (WorkBuddy 专家包 v${EXPERT_VERSION})

本专家包专为 **WorkBuddy / AI IDE 平台** 定制开发，适配 Vue 3 + TypeScript + Vite + qiankun 微前端体系与 @yss-ui 组件库生态。
内置 **全部 ${skills.length} 个业务技能** 与 **YSS UI 组件离线契约数据**，是独立分发的 zip，不依赖开源仓库中的任何外部文件。

## 🎯 核心解决的问题
传统的“前端开发专家”往往只是代码生成器，无法融入真实企业级微前端工程。本专家具备**全生命周期 6 大闭环 SOP**：
1. **脚手架规范初始化**：必须走 \`create-yss-app\` 预检确认，杜绝随意手搓空工程；
2. **契约驱动 API 生成**：认准 \`openapi.json\`，通过 \`pnpm generate:api\` (Orval) 自动化生成 Server 层代码，禁止业务层手写 axios；
3. **YSS UI 标准开发**：先查随包的组件契约数据（或已连接的 yss-ui MCP）核对真实 API，主组件严格 ≤ 150 行，关注点高度分离；
4. **高危行为防御**：严格防止雪花 ID 精度丢失（大数 ID 一律字符串透传）、Blob 文件流标准化下载；
5. **本地质量门禁自测**：严格执行 \`pnpm type-check\` 与 \`pnpm lint:check\`；
6. **交付与运维**：Conventional Commits 提交规范及雨燕平台协同。

## 📦 目录结构
\`\`\`text
yss-microapp-expert/
├── .codebuddy-plugin/
│   └── plugin.json               # WorkBuddy 开放平台开包解析核心文件 (必选)
├── agents/
│   └── yss-microapp-expert.md    # 专家人设定义与 6 大阶段 SOP
├── avatars/
│   └── expert.png                # 专家头像
├── skills/                       # ${skills.length} 个业务技能（全量收录，引用全部闭合）
│   ├── create-yss-app/
│   ├── api-integration/
│   ├── yss-ui-business-page-generation/
│   └── ...
├── references/
│   └── yss-ui-mcp/
│       ├── data/index.json        # 组件文档、Demo 与技能索引（离线）
│       ├── data/schemas.json      # 组件属性 / 事件 / 插槽约束（离线）
│       ├── data/coverage-summary.json
│       ├── MCP-TOOLS.md          # @yss-ui/mcp 工具清单与协同约束
│       └── README.md              # 数据用法与实时 MCP 接入说明
└── README.md                     # 说明文档
\`\`\`

> 包内不产出 \`expert.json\` / \`manifest.json\` / \`prompts/\` / \`connectors/\`：它们不是
> 开放平台规范结构，平台开包第一步只认 \`.codebuddy-plugin/plugin.json\`。

## ✅ 上传前自检

本包由 \`scripts/pack-workbuddy-expert.mjs\` 生成，打包前会自动按开放平台硬规则预检：
zip 根目录存在 \`.codebuddy-plugin/plugin.json\`、tags / quickPrompts 各固定 3 个、
defaultInitPrompt 中英文与 quickPrompts[0] 完全一致、displayDescription.zh 为 40-50 字、
头像为 512×512 PNG 且不超过 500KB、每个技能含 SKILL.md 且与声明一一对应、
包内技能之间的同级相对引用全部闭合（全量收录，无死链）、MCP 离线数据齐全，确保不会再出现
「未找到 plugin.json」或「内置文件缺失」。

## 🔌 关于 MCP

包内 \`references/yss-ui-mcp/data/\` 是 \`@yss-ui/mcp\` 生成的真实组件文档与 Schema 快照，
专家可直接读取，无需联网、无需安装依赖。MCP 服务本体（bin/lib）依赖
\`@modelcontextprotocol/sdk\`，专家包内没有 node_modules，复制过去也跑不起来，因此未内置。
需要实时 MCP 时，请在客户端配置 \`npx -y ${MCP_PACKAGE}\`，或部署远程 MCP 后按官方文档
通过 \`.mcp.json\` + \`plugin.json\` 的 \`dependencies.mcpServers\` 声明依赖。
`;
}

/**
 * 读取 PNG 的 IHDR 宽高（不依赖第三方库）
 */
async function readPngSize(file) {
  const handle = await fs.open(file, 'r');
  try {
    const header = Buffer.alloc(24);
    await handle.read(header, 0, 24, 0);
    if (header.toString('ascii', 1, 4) !== 'PNG') {
      throw new Error(`不是 PNG 文件: ${file}`);
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

/**
 * 生成合规头像：512×512 PNG、≤500KB（开放平台硬要求）
 */
async function prepareAvatar() {
  const src = path.join(REPO_ROOT, 'public', 'branding', 'yss-logo-mark-ai.png');
  const dest = path.join(EXPERT_TARGET_DIR, 'avatars', 'expert.png');
  const { width, height } = await readPngSize(src);

  if (width === 512 && height === 512) {
    await fs.copyFile(src, dest);
  } else {
    // macOS 自带 sips；其它平台请手工准备 512×512 PNG
    try {
      execFileSync('sips', ['-z', '512', '512', src, '--out', dest], { stdio: 'ignore' });
      console.log(`   ↳ 头像已从 ${width}×${height} 缩放为 512×512`);
    } catch (err) {
      throw new Error(
        `头像需 512×512 PNG，当前为 ${width}×${height}；当前系统缺少 sips，请手工转换 ${src} 后重试`
      );
    }
  }

  const size = (await fs.stat(dest)).size;
  const actual = await readPngSize(dest);
  if (actual.width !== 512 || actual.height !== 512) {
    throw new Error(`头像尺寸不合规: ${actual.width}×${actual.height}`);
  }
  if (size > 500 * 1024) {
    throw new Error(`头像超过 500KB: ${(size / 1024).toFixed(1)}KB`);
  }
  return { ...actual, size };
}

/**
 * 打包前预检：把开放平台开包解析的硬规则搬到本地，避免每次靠平台报错来调试
 */
async function assertExpertPackage() {
  const errors = [];
  const fail = msg => errors.push(msg);
  const pjPath = path.join(EXPERT_TARGET_DIR, '.codebuddy-plugin', 'plugin.json');

  let pj;
  try {
    pj = JSON.parse(await fs.readFile(pjPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `缺少或无法解析 .codebuddy-plugin/plugin.json（平台会报「未找到 .codebuddy-plugin/plugin.json」）: ${err.message}`
    );
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(pj.name)) fail('name 必须为 kebab-case');
  if (pj.plugin !== pj.name) fail('plugin 必须与 name 一致');
  if (!/^\d+\.\d+\.\d+$/.test(pj.version)) fail('version 必须为语义化版本');
  if (/[\u4e00-\u9fa5]/.test(pj.description || '')) fail('description 须为英文一句话');
  if (!VALID_CATEGORY_IDS.has(pj.categoryId)) fail(`categoryId 不合法: ${pj.categoryId}`);

  for (const field of ['displayName', 'profession', 'displayDescription', 'defaultInitPrompt']) {
    if (!pj[field]?.en || !pj[field]?.zh) fail(`${field} 必须同时包含 en 与 zh`);
  }

  const zhLen = [...(pj.displayDescription?.zh || '')].length;
  if (zhLen < 40 || zhLen > 50) fail(`displayDescription.zh 须 40-50 字，当前 ${zhLen} 字`);

  if (!Array.isArray(pj.tags) || pj.tags.length !== 3) {
    fail(`tags 须固定 3 个，当前 ${pj.tags?.length ?? 0} 个`);
  } else {
    pj.tags.forEach((tag, i) => {
      if (!tag?.en || !tag?.zh) fail(`tags[${i}] 必须同时包含 en 与 zh`);
    });
  }

  if (!Array.isArray(pj.quickPrompts) || pj.quickPrompts.length !== 3) {
    fail(`quickPrompts 须固定 3 个，当前 ${pj.quickPrompts?.length ?? 0} 个`);
  } else {
    pj.quickPrompts.forEach((prompt, i) => {
      if (!prompt?.en || !prompt?.zh) fail(`quickPrompts[${i}] 必须同时包含 en 与 zh`);
    });
  }

  const first = Array.isArray(pj.quickPrompts) ? pj.quickPrompts[0] : undefined;
  if (pj.defaultInitPrompt?.zh !== first?.zh) fail('defaultInitPrompt.zh 必须与 quickPrompts[0].zh 一致');
  if (pj.defaultInitPrompt?.en !== first?.en) fail('defaultInitPrompt.en 必须与 quickPrompts[0].en 一致');

  // Agent 定义文件
  const agentFile = path.join(EXPERT_TARGET_DIR, 'agents', `${pj.agentName}.md`);
  try {
    const agentMd = await fs.readFile(agentFile, 'utf-8');
    const frontmatter = agentMd.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
    if (!frontmatter.includes(`name: ${pj.agentName}`)) {
      fail('Agent MD frontmatter 的 name 须与 agentName 一致');
    }
    if (/^tools:/m.test(frontmatter)) fail('Agent MD frontmatter 禁止声明 tools');
  } catch {
    fail(`Agent 定义文件缺失: agents/${pj.agentName}.md`);
  }

  // 资源路径
  const resources = [
    ...(pj.agents || []),
    ...(pj.skills || []).map(skill => `${skill}/SKILL.md`)
  ];
  for (const rel of resources) {
    try {
      await fs.access(path.join(EXPERT_TARGET_DIR, rel.replace(/^\.\//, '')));
    } catch {
      fail(`资源缺失: ${rel}`);
    }
  }

  // 技能引用完整性（平台「内置文件缺失」检查项）
  const skillsDir = path.join(EXPERT_TARGET_DIR, 'skills');
  try {
    const declared = new Set(
      (pj.skills || []).map(s => (s.startsWith('./') ? s.slice(2) : s).replace('skills/', ''))
    );
    const packaged = (await fs.readdir(skillsDir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    for (const name of packaged) {
      if (!declared.has(name)) fail(`技能目录未在 plugin.json 声明: skills/${name}`);
    }
    // 扫描包内全部 .md（含 README / Agent MD），任何悬空相对引用都拦下
    for (const file of await collectMarkdownFiles(EXPERT_TARGET_DIR)) {
      const text = await fs.readFile(file, 'utf-8');
      for (const match of text.matchAll(SKILL_REF_RE)) {
        const target = path.resolve(path.dirname(file), match[0]);
        try {
          await fs.access(target);
        } catch {
          fail(`技能引用缺失: ${path.relative(EXPERT_TARGET_DIR, file)} → ${match[0]}`);
        }
      }
    }
  } catch (err) {
    fail(`技能引用检查失败: ${err.message}`);
  }

  // 随包内置的 MCP 离线契约数据（专家人设里引用了这些路径，缺一个就是死链）
  for (const file of MCP_DATA_FILES) {
    const rel = `${MCP_REF_DIR_NAME}/data/${file}`;
    try {
      await fs.access(path.join(EXPERT_TARGET_DIR, rel));
    } catch {
      fail(`MCP 离线契约数据缺失: ${rel}`);
    }
  }
  try {
    await fs.access(path.join(EXPERT_TARGET_DIR, MCP_REF_DIR_NAME, 'MCP-TOOLS.md'));
  } catch {
    fail(`MCP 工具说明缺失: ${MCP_REF_DIR_NAME}/MCP-TOOLS.md`);
  }

  // 可选 MCP 依赖声明一致性
  if (DECLARE_MCP_DEPENDENCY) {
    if (pj.dependencies?.mcpServers !== './.mcp.json') {
      fail('开启 DECLARE_MCP_DEPENDENCY 后，plugin.json 须声明 dependencies.mcpServers = ./.mcp.json');
    }
    try {
      const mcp = JSON.parse(await fs.readFile(path.join(EXPERT_TARGET_DIR, '.mcp.json'), 'utf-8'));
      if (!mcp.mcpServers || !Object.keys(mcp.mcpServers).length) {
        fail('.mcp.json 未声明任何 mcpServers');
      }
    } catch (err) {
      fail(`.mcp.json 缺失或无法解析: ${err.message}`);
    }
  } else if (pj.dependencies && !DECLARE_CONNECTOR_DEPENDENCY) {
    fail('未开启 DECLARE_MCP_DEPENDENCY，plugin.json 却出现了 dependencies');
  }
  if (DECLARE_CONNECTOR_DEPENDENCY) {
    if (!Array.isArray(pj.dependencies?.connectors) || !pj.dependencies.connectors.includes(CONNECTOR_SOURCE)) {
      fail(`开启连接器回连后，dependencies.connectors 须包含 ${CONNECTOR_SOURCE}`);
    }
  }

  // 头像
  try {
    const avatarPath = path.join(EXPERT_TARGET_DIR, pj.avatar || '');
    const { width, height } = await readPngSize(avatarPath);
    const { size } = await fs.stat(avatarPath);
    if (width !== 512 || height !== 512) fail(`头像须 512×512，当前 ${width}×${height}`);
    if (size > 500 * 1024) fail(`头像须 ≤500KB，当前 ${(size / 1024).toFixed(1)}KB`);
  } catch (err) {
    fail(`头像不合规: ${err.message}`);
  }

  if (errors.length) {
    throw new Error('专家包未通过开放平台规则预检：\n  - ' + errors.join('\n  - '));
  }
  console.log('✅ 预检通过：展示字段、头像、全量技能声明、包内引用闭包与 MCP 离线数据均合规');
}

/**
 * 打包后复核 zip 根目录条目：平台开包第一步找的就是
 * `.codebuddy-plugin/plugin.json`，多套一层目录或漏掉隐藏目录都会解析失败。
 */
function assertZipRoot() {
  const entries = execFileSync('unzip', ['-Z1', ZIP_FILE_PATH], { encoding: 'utf-8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const required = [
    '.codebuddy-plugin/plugin.json',
    `agents/${EXPERT_DIR_NAME}.md`,
    'avatars/expert.png'
  ];
  const missing = required.filter(entry => !entries.includes(entry));
  if (missing.length) {
    throw new Error(`zip 根目录缺少必需文件（平台会报解析失败）: ${missing.join(', ')}`);
  }
  const nested = entries.find(entry =>
    entry.endsWith('/.codebuddy-plugin/plugin.json') && entry !== '.codebuddy-plugin/plugin.json'
  );
  if (nested) {
    throw new Error(`zip 多套了一层顶层目录: ${nested}；平台只认包根下的 .codebuddy-plugin/plugin.json`);
  }
  console.log('✅ zip 结构复核通过：.codebuddy-plugin/plugin.json 位于包根目录');
}

async function main() {
  console.log('🚀 开始构建符合 WorkBuddy 规范的 YSS 专家包（全量技能 + MCP 离线契约数据）...');

  // 0. 全量收录 packages/skills 下的业务技能，再做一次传递依赖闭包解析兜底
  const allSkills = await getAllAvailableSkills();
  const skills = await resolveSkillClosure(allSkills);
  console.log(`🔗 全量技能 ${allSkills.length} 个 → 闭包解析后 ${skills.length} 个（额外补入 ${skills.length - allSkills.length} 个被引用技能）`);

  // 1. 清理并准备输出目录
  await fs.rm(EXPERT_TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(EXPERT_TARGET_DIR, { recursive: true });
  await fs.mkdir(path.join(EXPERT_TARGET_DIR, '.codebuddy-plugin'), { recursive: true });
  await fs.mkdir(path.join(EXPERT_TARGET_DIR, 'agents'), { recursive: true });
  await fs.mkdir(path.join(EXPERT_TARGET_DIR, 'avatars'), { recursive: true });
  await fs.mkdir(path.join(EXPERT_TARGET_DIR, 'skills'), { recursive: true });
  await fs.mkdir(path.join(EXPERT_TARGET_DIR, MCP_REF_DIR_NAME, 'data'), { recursive: true });

  // 2. 写入 .codebuddy-plugin/plugin.json (核心！解决平台解析报错)
  console.log('📝 写入 .codebuddy-plugin/plugin.json...');
  const pluginJson = generateCodebuddyPluginJson(skills);
  await fs.writeFile(
    path.join(EXPERT_TARGET_DIR, '.codebuddy-plugin', 'plugin.json'),
    JSON.stringify(pluginJson, null, 2),
    'utf-8'
  );

  // 3. 写入 agents/yss-microapp-expert.md (专家标准人设)
  console.log('📝 写入 agents/yss-microapp-expert.md...');
  await fs.writeFile(
    path.join(EXPERT_TARGET_DIR, 'agents', 'yss-microapp-expert.md'),
    generateAgentMarkdown(skills),
    'utf-8'
  );

  // 4. 生成合规头像（512×512 PNG、≤500KB）
  console.log('🖼 生成专家头像...');
  const avatar = await prepareAvatar();

  // 5. 复制闭包内的全部 Skills（含 SKILL.md 引用到的技能，缺一不可）
  console.log(`📦 复制业务 Skills (${skills.length} 个)...`);
  for (const skillName of skills) {
    const srcSkillPath = path.join(REPO_ROOT, 'packages', 'skills', skillName);
    const destSkillPath = path.join(EXPERT_TARGET_DIR, 'skills', skillName);

    try {
      await fs.access(srcSkillPath);
      await copyDir(srcSkillPath, destSkillPath);
      console.log(`   ✔ 拷贝技能: ${skillName}`);
    } catch (err) {
      throw new Error(`技能目录缺失，拒绝打包: packages/skills/${skillName}（${err.message}）`);
    }
  }

  // 6. 内置 yss-ui MCP 的离线契约数据（真实组件文档 / Schema，不含跑不起来的服务代码）
  console.log(`🔌 复制 MCP 离线契约数据 (${MCP_DATA_FILES.length} 个文件)...`);
  await copyMcpReferenceData();

  // 7. 写入 README.md
  console.log('📝 写入说明文档 (README.md)...');
  await fs.writeFile(path.join(EXPERT_TARGET_DIR, 'README.md'), generateReadme(skills), 'utf-8');

  // 8. 可选：运行时 MCP 依赖（默认关闭，确认有可用远程 MCP 后再打开）
  if (DECLARE_MCP_DEPENDENCY) {
    await fs.writeFile(
      path.join(EXPERT_TARGET_DIR, '.mcp.json'),
      JSON.stringify(generateMcpJson(), null, 2),
      'utf-8'
    );
  }

  // 9. 打包前按开放平台硬规则做本地预检（不通过则不产出 zip）
  await assertExpertPackage();

  // 10. 打包成 .zip 压缩文件
  console.log('🗜 正在生成 zip 压缩包...');
  await fs.rm(ZIP_FILE_PATH, { force: true });
  
  // 在 EXPERT_TARGET_DIR 目录内打包，确保解压后直接是包根内容（含 .codebuddy-plugin）
  execFileSync('zip', ['-q', '-r', '-X', ZIP_FILE_PATH, '.', '-x', '*.DS_Store'], {
    cwd: EXPERT_TARGET_DIR
  });

  // 11. 打包后复核 zip 根目录，确保 .codebuddy-plugin/plugin.json 一定在包根
  assertZipRoot();

  // 12. 检查并打印结果
  const zipStat = await fs.stat(ZIP_FILE_PATH);
  const zipSizeKB = (zipStat.size / 1024).toFixed(1);

  console.log('\n🎉 打包完成，可直接上传开放平台！');
  console.log(`📁 专家源文件目录: ${EXPERT_TARGET_DIR}`);
  console.log(`📦 生成的 Zip 路径: ${ZIP_FILE_PATH}`);
  console.log(`🏷 版本: ${EXPERT_VERSION} | 技能: ${skills.length} 个 | MCP 离线数据: ${MCP_DATA_FILES.length} 个 | 头像: ${avatar.width}×${avatar.height} ${(avatar.size / 1024).toFixed(1)}KB`);
  console.log(`⚖ 压缩包大小: ${zipSizeKB} KB`);
  console.log('💡 上传入口: 开放平台 → 发布管理 → 专家 → 发布专家 → 配置专家\n');
}

main().catch((err) => {
  console.error('❌ 打包失败:', err);
  process.exit(1);
});
