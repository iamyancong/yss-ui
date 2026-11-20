import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');
const mcpPkgPath = path.join(rootDir, 'packages/mcp/package.json');
const publicPluginsDir = path.join(rootDir, 'public/plugins');
const outputIndexPath = path.join(publicPluginsDir, 'index.json');
const faviconSource = path.join(rootDir, 'public/favicon.svg');
const faviconTarget = path.join(publicPluginsDir, 'favicon.svg');

if (!fs.existsSync(publicPluginsDir)) {
  fs.mkdirSync(publicPluginsDir, { recursive: true });
}

// 拷贝 favicon 图标以支持相对路径解析
if (fs.existsSync(faviconSource)) {
  fs.copyFileSync(faviconSource, faviconTarget);
}

const mcpPkg = JSON.parse(fs.readFileSync(mcpPkgPath, 'utf-8'));
const version = mcpPkg.version || '0.11.0';

const indexPayload = {
  format: 1,
  title: {
    en: 'YSS UI Official Plugins',
    zh: 'YSS UI 官方插件源',
  },
  description: {
    en: 'Official MCP tools and developer skills for YSS UI Vue3 component library',
    zh: 'YSS UI 官方组件库文档查询、Schema 校验与代码生成 MCP 插件',
  },
  plugins: [
    {
      name: '@yss-ui/mcp',
      title: {
        en: 'YSS UI Assistant',
        zh: 'YSS UI 研发助手',
      },
      description: {
        en: 'Provide YSS UI component API retrieval, demo examples and codegen rules via MCP',
        zh: '提供 YSS UI 组件检索、Demo 示例、Schema 校验与代码生成规则 MCP 工具',
      },
      icon: 'favicon.svg',
      author: 'iamyancong',
      homepage: 'https://iamyancong.github.io/yss-ui/',
      repository: {
        url: 'https://github.com/iamyancong/yss-ui',
        directory: 'packages/mcp',
      },
      versions: [
        {
          version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: {
            type: 'npm',
          },
        },
      ],
    },
  ],
};

fs.writeFileSync(outputIndexPath, JSON.stringify(indexPayload, null, 2) + '\n', 'utf-8');
console.log(`[build-dsh-index] 成功生成 DeepSeek Harness 插件索引: ${outputIndexPath}`);
console.log(`[build-dsh-index] 目标 URL: https://iamyancong.github.io/yss-ui/plugins/index.json`);
