const fs = require('fs');
const path = require('path');

// 动态导入 TypeScript 配置文件
const { register } = require('esbuild-register/dist/node');
register({ target: 'node16' });
const dumiConfig = require('../.dumirc.ts').default;

// 配置
const BASE_URL = process.env.DOCS_BASE_URL || 'https://iamyancong.github.io/yss-ui'; // 默认适配 GitHub Pages
const DOCS_DIR = path.join(__dirname, '../docs');
const OUTPUT_DIR = path.join(__dirname, '../public');
const SKILLS_DIR = path.join(__dirname, '../packages/skills');
const SKILLS_CONFIG_PATH = path.join(SKILLS_DIR, 'skills.config.json');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 将 link 路径转换为完整 URL
 * @param {string} link - Dumi link (如 '/hooks/use-fullscreen')
 * @returns {string} - 完整 URL
 */
function getLinkUrl(link) {
  return `${BASE_URL}${link}`;
}

/**
 * 将 link 路径转换为文档文件路径
 * @param {string} link - Dumi link
 * @returns {string} - 文件路径
 */
function linkToFilePath(link) {
  // 移除开头的 '/'
  const pathWithoutSlash = link.replace(/^\//, '');
  const [category, ...rest] = pathWithoutSlash.split('/');
  const fileName = rest.join('/');

  const directPath = path.join(DOCS_DIR, category, `${fileName}.md`);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // 特殊处理 hooks - 部分文件名是驼峰，但 URL 是 kebab-case（kebab 文件已在上方直接命中）
  if (category === 'hooks') {
    const camelCaseName = fileName
      .split('-')
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
    return path.join(DOCS_DIR, category, `${camelCaseName}.md`);
  }

  // dumi 会将驼峰文件名映射为 kebab-case 路由，如 editTable.md -> /components/edit-table
  const camelCaseFileName = fileName
    .split('/')
    .map(segment => segment.replace(/-([a-z])/g, (_, char) => char.toUpperCase()))
    .join('/');
  return path.join(DOCS_DIR, category, `${camelCaseFileName}.md`);
}

/**
 * 从 sidebar 配置中提取分类及子项
 * @param {Array} sidebarConfig - sidebar 配置数组
 * @returns {Object} - { title: string, children: Array<{title, link}> }[]
 */
function extractCategories(sidebarConfig) {
  return sidebarConfig
    .filter(category => category.children && category.children.length > 0)
    .map(category => ({
      title: category.title,
      children: category.children.map(item => ({
        title: item.title,
        link: item.link,
      })),
    }));
}

/**
 * 按 skills.config.json 分类读取全部 Skill。
 *
 * @returns {Array<{category: string, skills: string[]}>} Skill 分类列表
 */
function getSkillCategories() {
  const config = JSON.parse(fs.readFileSync(SKILLS_CONFIG_PATH, 'utf8'));
  const knownSkills = new Set(
    fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
      .map(entry => entry.name)
  );
  const assigned = new Set();
  const categories = [];

  for (const [category, skills] of Object.entries(config.categories || {})) {
    const validSkills = (skills || []).filter(skill => knownSkills.has(skill) && !assigned.has(skill));
    validSkills.forEach(skill => assigned.add(skill));
    if (validSkills.length > 0) categories.push({ category, skills: validSkills });
  }

  const unassigned = [...knownSkills].filter(skill => !assigned.has(skill)).sort();
  if (unassigned.length > 0) categories.push({ category: 'other', skills: unassigned });
  return categories;
}

/**
 * 读取 Skill 的中文说明。
 *
 * @param {string} skill Skill 名称
 * @returns {string} frontmatter description
 */
function getSkillDescription(skill) {
  const content = fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8');
  return content.match(/^---\n[\s\S]*?^description:\s*(.+)$/m)?.[1]?.trim() || '';
}

// 从 dumirc 中提取配置
const componentsConfig = extractCategories(dumiConfig.themeConfig.sidebar['/components'] || []);
const utilsConfig = extractCategories(dumiConfig.themeConfig.sidebar['/utils'] || []);
const hooksConfig = extractCategories(dumiConfig.themeConfig.sidebar['/hooks'] || []);

// 生成 llms.txt（简版）
function generateLlmsTxt() {
  const lines = [];

  // 标题和简介
  lines.push('# YSS UI');
  lines.push('');
  lines.push('YSS UI 是基于 Vue 3、Ant Design Vue 与 VXE-Table 的企业级中后台组件库');
  lines.push('');
  lines.push('## 技术栈');
  lines.push('');
  lines.push('- Vue 3 - 渐进式 JavaScript 框架');
  lines.push('- Ant Design Vue - 企业级 UI 设计语言和 Vue 实现');
  lines.push('- VXE-Table - 强大的表格组件');
  lines.push('- Formily - 强大的表单解决方案');
  lines.push('- TypeScript - 类型安全');
  lines.push('');
  lines.push('## 特性');
  lines.push('');
  lines.push('- 🚀 Vue3 原生支持 - 使用 Composition API 和 `<script setup>` 语法');
  lines.push('- 💪 TypeScript 友好 - 完整的类型定义和智能提示');
  lines.push('- 🎨 高度可定制 - 支持插槽、渲染器等多种自定义方式');
  lines.push('- ⚡ 性能优化 - 基于虚拟滚动和性能优化');
  lines.push('- 🛠 企业级功能 - 支持编辑、筛选、排序、拖拽等企业级功能');
  lines.push('');

  // 组件
  lines.push('## 组件');
  lines.push('');
  componentsConfig.forEach(category => {
    lines.push(`### ${category.title}`);
    lines.push('');
    category.children.forEach(item => {
      lines.push(`- ${item.title}: ${getLinkUrl(item.link)}`);
    });
    lines.push('');
  });

  // 工具函数
  lines.push('## 工具函数');
  lines.push('');
  utilsConfig.forEach(category => {
    category.children.forEach(item => {
      lines.push(`- ${item.title}: ${getLinkUrl(item.link)}`);
    });
  });
  lines.push('');

  // Hooks
  lines.push('## Hooks');
  lines.push('');
  hooksConfig.forEach(category => {
    category.children.forEach(item => {
      // 过滤掉"快速开始"等介绍性页面
      if (!item.link.endsWith('/hooks')) {
        lines.push(`- ${item.title}: ${getLinkUrl(item.link)}`);
      }
    });
  });
  lines.push('');

  // Skills
  lines.push('## Skills');
  lines.push('');
  getSkillCategories().forEach(({ category, skills }) => {
    lines.push(`### ${category}`);
    lines.push('');
    skills.forEach(skill => {
      const description = getSkillDescription(skill);
      lines.push(`- ${skill}: ${getLinkUrl(`/skills/${skill}`)}${description ? ` — ${description}` : ''}`);
    });
    lines.push('');
  });

  // 指南
  lines.push('## 指南');
  lines.push('');
  lines.push(`- 快速开始: ${BASE_URL}/guide`);
  lines.push(`- 安装指南: ${BASE_URL}/guide/installation`);
  lines.push(`- JSP 项目接入: ${BASE_URL}/guide/jsp`);
  lines.push(`- AI 工具集成（Skills 技能同步）: ${BASE_URL}/guide/ai-skills`);
  lines.push(`- AI 工具集成（MCP Server 查询）: ${BASE_URL}/guide/mcp`);
  lines.push(`- AI 工具集成（LLMs.txt 全量文档）: ${BASE_URL}/guide/llms`);
  lines.push('');

  // 其他资源
  lines.push('## 其他资源');
  lines.push('');
  lines.push(`- 更新日志: ${BASE_URL}/changelog`);
  lines.push(`- 资源: ${BASE_URL}/resources`);
  lines.push('');

  return lines.join('\n');
}

// 生成 llms-full.txt（完整版）
function generateLlmsFullTxt() {
  const lines = [];

  // LLM Code Generation Guidelines（AI 代码生成规范）
  const codeGenGuidelines = `
## 🤖 LLM Code Generation Guidelines (AI 代码生成规范)

> **本节内容专为 AI 工具（Cursor、Windsurf、Claude、Gemini 等）设计**，用于规范在业务层生成 YSS UI 代码时的最佳实践。

### 样式导入规范 (Critical)

**禁止**在业务代码中使用以下方式导入样式：
\`\`\`typescript
// ❌ 错误写法 - 会导致样式污染
import './style.less';
\`\`\`

**必须**使用 scoped 样式块：
\`\`\`vue
<!-- ✅ 正确写法 - 样式隔离 -->
<style scoped lang="less">
@import './style.less';
</style>
\`\`\`

**说明**：
- 文档 Demo 中的 \`import './style.less'\` 是为兼容 Dumi 文档工具，**业务层请勿模仿**
- 使用 \`<style scoped>\` 可确保样式仅作用于当前组件，避免全局污染

### Vue SFC 结构规范

\`\`\`vue
<script setup lang="ts">
// 1. 组件和类型导入
import { YTable, YButton } from '@yss-ui/components';
import type { YTableColumn } from '@yss-ui/components';

// 2. 业务逻辑 hooks（按需）
import { useXxx } from './hooks/useXxx';

// 3. 常量和类型定义（建议抽离到 constant.ts）
// 4. 响应式状态
// 5. 计算属性
// 6. 方法
// 7. 生命周期
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped lang="less">
/* 组件样式（使用 scoped 隔离） */
@import './style.less'; /* 如有独立样式文件 */
</style>
\`\`\`

### 模块化原则

- 组件代码超过 150 行时，拆分为 \`index.vue\` + \`constant.ts\` + \`hooks/\` + \`style.less\`
- 常量、类型、配置抽离到 \`constant.ts\`
- 业务逻辑抽离到 \`hooks/useXxx.ts\`
- 样式抽离到 \`style.less\`，在 \`<style scoped>\` 中 \`@import\`

---

`;

  // 先添加 LLM 代码生成规范
  const consumption = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../packages/components/consumption-policy.json'), 'utf8')
  );
  lines.push(
    '## 统一消费契约\n\n' +
      consumption.agentRules.map(rule => '- ' + rule).join('\n') +
      '\n\n插件最低版本：' +
      consumption.plugin.introducedIn
  );
  lines.push(codeGenGuidelines.trim());
  lines.push('');

  // 再添加简版内容
  lines.push(generateLlmsTxt());
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('# 完整文档');
  lines.push('');
  // 添加组件完整文档
  lines.push('## 组件详细文档');
  lines.push('');

  componentsConfig.forEach(category => {
    lines.push(`### ${category.title}`);
    lines.push('');

    category.children.forEach(item => {
      const mdPath = linkToFilePath(item.link);
      if (fs.existsSync(mdPath)) {
        lines.push(`#### ${item.title}`);
        lines.push('');
        const content = fs.readFileSync(mdPath, 'utf-8');
        // 移除 frontmatter
        const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        lines.push(cleanContent.trim());
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    });
  });

  // 添加工具函数完整文档
  lines.push('## 工具函数详细文档');
  lines.push('');

  utilsConfig.forEach(category => {
    category.children.forEach(item => {
      const mdPath = linkToFilePath(item.link);
      if (fs.existsSync(mdPath)) {
        lines.push(`### ${item.title}`);
        lines.push('');
        const content = fs.readFileSync(mdPath, 'utf-8');
        const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        lines.push(cleanContent.trim());
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    });
  });

  // 添加 Hooks 完整文档
  lines.push('## Hooks 详细文档');
  lines.push('');

  hooksConfig.forEach(category => {
    category.children.forEach(item => {
      // 过滤掉"快速开始"等介绍性页面
      if (!item.link.endsWith('/hooks')) {
        const mdPath = linkToFilePath(item.link);
        if (fs.existsSync(mdPath)) {
          lines.push(`### ${item.title}`);
          lines.push('');
          const content = fs.readFileSync(mdPath, 'utf-8');
          const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
          lines.push(cleanContent.trim());
          lines.push('');
          lines.push('---');
          lines.push('');
        }
      }
    });
  });

  // 添加 Skills 完整文档（packages/skills 为唯一真相源）
  lines.push('## Skills 详细文档');
  lines.push('');

  getSkillCategories().forEach(({ category, skills }) => {
    lines.push(`### ${category}`);
    lines.push('');
    skills.forEach(skill => {
      const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');
      const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
      lines.push(`#### ${skill}`);
      lines.push('');
      lines.push(cleanContent.trim());
      lines.push('');
      lines.push('---');
      lines.push('');
    });
  });

  // 添加指南文档
  lines.push('## 指南文档');
  lines.push('');

  const guidePath = path.join(DOCS_DIR, 'guide', 'index.md');
  if (fs.existsSync(guidePath)) {
    const content = fs.readFileSync(guidePath, 'utf-8');
    const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    lines.push(cleanContent.trim());
    lines.push('');
  }

  return lines.join('\n');
}

// 主函数
function main() {
  console.log('🚀 开始生成 LLMs.txt 文件...');

  try {
    // 生成 llms.txt
    const llmsTxt = generateLlmsTxt();
    const llmsTxtPath = path.join(OUTPUT_DIR, 'llms.txt');
    fs.writeFileSync(llmsTxtPath, llmsTxt, 'utf-8');
    console.log(`✅ 已生成 llms.txt (${llmsTxt.length} 字符)`);

    // 生成 llms-full.txt
    const llmsFullTxt = generateLlmsFullTxt();
    const llmsFullTxtPath = path.join(OUTPUT_DIR, 'llms-full.txt');
    fs.writeFileSync(llmsFullTxtPath, llmsFullTxt, 'utf-8');
    console.log(`✅ 已生成 llms-full.txt (${llmsFullTxt.length} 字符)`);

    console.log('');
    console.log('📝 文件已生成到 public 目录：');
    console.log(`   - ${llmsTxtPath}`);
    console.log(`   - ${llmsFullTxtPath}`);
    console.log('');
    console.log('🎉 完成！');
  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateLlmsTxt, generateLlmsFullTxt };
