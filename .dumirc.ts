import { defineConfig } from 'dumi';
import * as path from 'path';

const rawBasePath = process.env.DOCS_BASE_PATH || '/';
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;

export default defineConfig({
  base: normalizedBasePath,
  publicPath: normalizedBasePath,
  // 按官方推荐方式启用 Vue 预设
  presets: ['@dumijs/preset-vue'],
  vue: {
    // 按官方建议，若项目本身 strictNullChecks=true，请单独为 Vue 解析提供 tsconfig
    tsconfigPath: path.resolve(__dirname, './tsconfig.vue.json'),
    checkerOptions: {
      exclude: /node_modules/,
    },
  },
  // 启用自动 API 表格解析，入口从组件导出开始
  // apiParser: {},
  // // 配置入口，自动 API 表将从这里开始解析
  // resolve: {
  //   entryFile: './packages/components/src/index.ts',
  // },
  // 内部组件依赖无法在公开沙箱安装，关闭浏览器端即时编译能力
  live: false,
  // 开启静态导出，确保 GitHub Pages 或 Nginx 刷新页面不 404
  exportStatic: {},
  // 注入全局环境，供客户端组件读取
  define: {
    'process.env.DOCS_BASE_PATH': JSON.stringify(normalizedBasePath),
  },
  outputPath: 'dist-docs',
  // 设置 favicon
  favicons: [
    `${normalizedBasePath}favicon.svg`, // 现代浏览器优先
  ],
  links: [
    { rel: 'icon', href: `${normalizedBasePath}favicon.svg`, type: 'image/svg+xml' },
    { rel: 'stylesheet', href: `${normalizedBasePath}styles/yss-theme-vars.css` },
    // 首页 Hero 标题图为 LCP 元素，提前预加载
    { rel: 'preload', as: 'image', href: `${normalizedBasePath}branding/hero-title.webp`, type: 'image/webp' },
  ],
  themeConfig: {
    // name: 'YSS UI',
    logo: `${normalizedBasePath}branding/yss-logo-mark-ai.webp`,
    logoDark: `${normalizedBasePath}branding/yss-logo-mark-ai-dark.webp`,
    nav: [
      { title: '指南', link: '/guide', icon: 'compass', accent: 'sky' },
      { title: '组件', link: '/components', icon: 'grid', accent: 'violet' },
      { title: 'Hooks', link: '/hooks', icon: 'nodes', accent: 'cyan' },
      // { title: '资源', link: '/resources' },
      { title: 'Skills', link: '/skills', badge: 'AI', /* highlight: true, */ icon: 'spark', accent: 'emerald' },
      { title: '工具', link: '/utils', icon: 'toolbox', accent: 'amber' },
      { title: '更新日志', link: '/changelog', /* badge: 'NEW', */ icon: 'pulse', accent: 'rose' },
    ],
    prefersColor: {
      default: 'auto',
      switch: true,
    },
    sidebar: {
      '/guide': [
        {
          title: '介绍',
          children: [
            { title: '快速开始', link: '/guide' },
            { title: '安装', link: '/guide/installation' },
          ],
        },
        {
          title: 'AI 工具集成',
          children: [
            { title: 'Skills 技能同步', link: '/guide/ai-skills' },
            { title: 'MCP Server 查询', link: '/guide/mcp' },
            { title: 'LLMs.txt 全量文档', link: '/guide/llms' },
          ],
        },
        {
          title: '工程与质量',
          children: [{ title: '测试覆盖矩阵', link: '/guide/test-coverage' }],
        },
      ],
      '/components': [
        {
          title: '介绍',
          children: [{ title: 'Overview 组件总览', link: '/components' }],
        },
        {
          title: '通用组件',
          children: [
            { title: 'Button 按钮', link: '/components/button' },
            { title: 'Card 卡片', link: '/components/card' },
            { title: 'ConfigProvider 全局配置', link: '/components/config-provider' },
            { title: 'SplitPane 分割面板', link: '/components/split-pane' },
            { title: 'Tree 树形控件', link: '/components/tree' },
            { title: 'MonthCalendar 月日历', link: '/components/month-calendar', frontmatter: { badge: 'v1.5.2' } },
          ],
        },
        {
          title: '表单组件',
          children: [
            { title: 'Formily 表单', link: '/components/formily' },
            { title: 'Monaco 代码编辑器', link: '/components/monaco' },
            { title: 'Cron 表达式', link: '/components/cron' },
          ],
        },
        {
          title: '表格组件',
          children: [
            { title: 'Table 表格', link: '/components/table' },
            { title: 'EditTable 编辑表格', link: '/components/edit-table' },
            { title: 'Sheet 协同表格', link: '/components/sheet' },
          ],
        },
        {
          title: '图表组件',
          children: [{ title: 'Echarts 图表', link: '/components/echarts' }],
        },
        {
          title: '业务组件',
          children: [
            { title: 'ConditionBuilder 条件构建器', link: '/components/condition-builder' },
            { title: 'FileImport 文件导入', link: '/components/file-import' },
          ],
        },
      ],
      '/utils': [
        {
          title: '工具集介绍',
          children: [{ title: '快速开始', link: '/utils' }],
        },
        {
          title: '日期格式化',
          children: [{ title: 'formatDate', link: '/utils/format' }],
        },
        {
          title: '文件下载',
          children: [{ title: 'downloadBlob', link: '/utils/download' }],
        },
        {
          title: '认证相关',
          children: [{ title: 'clearAuthInfo', link: '/utils/auth' }],
        },
        {
          title: '剪贴板',
          children: [{ title: 'copyToClipboard', link: '/utils/clipboard' }],
        },
        {
          title: 'URL',
          children: [{ title: 'getUrlData', link: '/utils/url' }],
        },
      ],
      '/hooks': [
        {
          title: 'Hooks 介绍',
          children: [{ title: '快速开始', link: '/hooks' }],
        },
        {
          title: 'DOM',
          children: [
            { title: 'useFullscreen', link: '/hooks/use-fullscreen' },
            { title: 'useTreeHeight', link: '/hooks/use-tree-height' },
            { title: 'useTableHeight', link: '/hooks/use-table-height' },
          ],
        },
        {
          title: '状态管理',
          children: [
            { title: 'useLoading', link: '/hooks/use-loading' },
            { title: 'usePollingTask', link: '/hooks/use-polling-task' },
            { title: 'useUrlState', link: '/hooks/use-url-state' },
          ],
        },
      ],
      '/changelog': [
        {
          title: '更新日志',
          children: [
            { title: '综合日志', link: '/changelog' },
            { title: 'Components 组件库', link: '/changelog/components' },
            { title: 'Hooks 钩子', link: '/changelog/hooks' },
            { title: 'Skills 技能', link: '/changelog/skills' },
            { title: 'MCP 文档服务', link: '/changelog/mcp' },
            { title: 'Utils 工具库', link: '/changelog/utils' },
          ],
        },
      ],
      '/skills': [
        {
          title: '介绍',
          children: [{ title: '快速上手', link: '/skills' }],
        },
        {
          title: '业务开发',
          children: [
            { title: 'YSS Create Microapp', link: '/skills/yss-create-microapp' },
            { title: 'YSS UI Business Page Generation', link: '/skills/yss-ui-business-page-generation' },
            { title: 'Theme Token Usage', link: '/skills/theme-token-usage' },
            { title: 'Component Selection Imports', link: '/skills/component-selection-imports' },
            { title: 'Page Module Development', link: '/skills/page-module-development' },
            { title: 'Page Skeleton', link: '/skills/page-skeleton' },
            { title: 'Page List Module', link: '/skills/page-list-module' },
            { title: 'Page Form Module', link: '/skills/page-form-module' },
            { title: 'YTable Usage', link: '/skills/ytable-usage' },
            { title: 'YEditTable Usage', link: '/skills/yedit-table-usage' },
            { title: 'YTree Usage', link: '/skills/ytree-usage' },
            { title: 'YSheet Usage', link: '/skills/ysheet-usage' },
            { title: 'YConditionBuilder Usage', link: '/skills/ycondition-builder-usage' },
            { title: 'YFileImport Usage', link: '/skills/yfile-import-usage' },
            { title: 'Prototype Page Acceptance', link: '/skills/prototype-page-acceptance' },
            { title: 'API Integration', link: '/skills/api-integration' },
            { title: 'File Export Download', link: '/skills/file-export-download' },
            { title: 'Vue3 Best Practices', link: '/skills/vue3-best-practices' },
            { title: 'I18n Locale Management', link: '/skills/i18n-locale-management' },
            { title: 'Frontend Commit', link: '/skills/frontend-commit' },
            { title: 'Java Backend Commit', link: '/skills/java-backend-commit' },
            { title: 'useTableHeight', link: '/skills/use-table-height' },
            { title: 'useTreeHeight', link: '/skills/use-tree-height' },
            { title: 'useUrlState', link: '/skills/use-url-state' },
            { title: 'usePollingTask', link: '/skills/use-polling-task' },
          ],
        },
        {
          title: 'Formily',
          children: [
            { title: 'YssFormily 表单开发', link: '/skills/yss-formily' },
            { title: 'Formily Foundation', link: '/skills/formily-foundation' },
            { title: 'Formily Linkage Effects', link: '/skills/formily-linkage-effects' },
            { title: 'Formily Mode Slot Detail', link: '/skills/formily-mode-slot-detail' },
            { title: 'Formily Step Flow', link: '/skills/formily-step-flow' },
          ],
        },
        // {
        //   title: '维护类', // 组件库自身skills不展示
        //   children: [
        //     { title: 'Component Development', link: '/skills/component-development' },
        //     { title: 'Documentation', link: '/skills/documentation' },
        //     { title: 'Commit Linting', link: '/skills/commit-linting' },
        //     { title: 'Changelog Generation', link: '/skills/changelog-generation' },
        //     { title: 'Release Management', link: '/skills/release-management' },
        //     { title: 'Release Workflow', link: '/skills/release-workflow' },
        //   ],
        // },
      ],
    },
    footer: false,
  },
  styles: [
    `
    :root {
      --yss-doc-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      --yss-doc-panel-radius: 26px;
    }

    .dumi-default-header,
    .dumi-default-sidebar,
    .dumi-default-content .markdown :where(h1, h2, h3, h4, h5, h6, p, li, blockquote, table, thead, tbody, tr, th, td, strong, em, summary),
    .dumi-default-toc,
    .dumi-default-navbar,
    .dumi-default-footer,
    .dumi-default-content-footer,
    .dumi-default-search-bar,
    .dumi-default-search-modal,
    .dumi-default-search-result {
      font-family: var(--yss-doc-font-family);
    }

    /* Header 区域布局优化（实际结构由自定义 Header slot 控制） */
    .dumi-default-header-content {
      max-width: 1920px !important;
      padding: 0 20px !important;
    }
    .dumi-default-header-left {
      width: auto !important;
      min-width: 0;
      display: flex;
      align-items: center;
    }
    .dumi-default-header-right {
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    @media (max-width: 1200px) {
      .dumi-default-header-right { gap: 4px; padding-left: 8px; }
    }
    @media (max-width: 960px) {
      .dumi-default-header-right { gap: 2px; padding-left: 4px; }
      .dumi-default-header-right-aside { gap: 4px; }
    }

    .dumi-default-doc-layout > main {
      max-width: 1920px !important;
      justify-content: center;
      align-items: flex-start;
      padding: 14px 16px 0 !important;
    }

    .dumi-default-sidebar {
      padding-top: 0 !important;
    }
    .dumi-default-sidebar > dl > dd > a {
      font-size: 14px !important;
    }
    .dumi-default-toc { /* 右侧锚点导航由 .dumi/theme/slots/Toc 控制视觉 */
      width: 100%;
    }
    @media (min-width: 1440px) {
      .dumi-default-doc-layout .dumi-default-content { max-width: 1360px; }
      .dumi-default-doc-layout-toc-wrapper { width: 260px; }
    }
    @media (min-width: 1440px) {
      body[data-route-root="hooks"] .dumi-default-doc-layout .dumi-default-content,
      body[data-route-root="skills"] .dumi-default-doc-layout .dumi-default-content {
        max-width: 1460px;
      }
    }
    body[data-route-root="hooks"] .dumi-default-content,
    body[data-route-root="skills"] .dumi-default-content {
      padding-left: 36px !important;
      padding-right: 36px !important;
    }

    /* 中间文档内容区 */
    .dumi-default-doc-layout .dumi-default-content {
      box-sizing: border-box;
      padding: 52px 56px 80px !important;
      border-radius: var(--yss-doc-panel-radius) !important;
      overflow: hidden;
      color: var(--yss-doc-text-body);
      font-size: 15px;
      line-height: 1.82;
    }

    .dumi-default-content h1,
    .dumi-default-content h2,
    .dumi-default-content h3,
    .dumi-default-content h4 {
      color: var(--yss-doc-text-primary);
      font-weight: 700;
      letter-spacing: 0;
    }

    .dumi-default-content h1 {
      margin: 0 0 22px;
      font-size: 34px;
      line-height: 1.25;
    }

    .dumi-default-content h2 {
      margin: 36px 0 14px;
      font-size: 28px;
      line-height: 1.32;
    }

    .dumi-default-content h3 {
      margin: 30px 0 12px;
      font-size: 21px;
      line-height: 1.4;
    }

    .dumi-default-content p,
    .dumi-default-content li {
      color: var(--yss-doc-text-body);
    }

    .dumi-default-content li {
      margin: 6px 0;
      padding-left: 2px;
    }

    .dumi-default-content li::marker {
      color: var(--yss-doc-text-muted);
    }

    .dumi-default-content strong {
      color: var(--yss-doc-text-primary);
      font-weight: 700;
    }

    html .dumi-default-doc-layout .dumi-default-content .markdown a {
      color: var(--yss-doc-link);
      text-underline-offset: 3px;
    }

    html .dumi-default-doc-layout .dumi-default-content .markdown a:hover {
      color: var(--yss-doc-link-hover);
    }

    .dumi-default-content .markdown blockquote {
      border-color: var(--yss-doc-border);
      color: var(--yss-doc-text-secondary);
    }

    .dumi-default-content .markdown blockquote p,
    .dumi-default-content .markdown blockquote li {
      color: inherit;
    }

    .dumi-default-content .markdown :not(pre) > code {
      padding: 2px 7px;
      border: 1px solid var(--yss-doc-border);
      border-radius: 5px;
      background: var(--yss-doc-code-bg);
      color: var(--yss-doc-code-text);
      font-size: 0.88em;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    /* API 表格首列不换行，自适应内容宽度 */
    .dumi-default-content .markdown table {
      table-layout: auto;
      margin: 22px 0 34px;
      border-color: var(--yss-doc-border);
      color: var(--yss-doc-text-body);
      font-size: 14px;
    }

    .dumi-default-content .markdown table th {
      background: var(--yss-doc-surface-muted);
      color: var(--yss-doc-text-primary);
      font-weight: 700;
    }

    .dumi-default-content .markdown table th,
    .dumi-default-content .markdown table td {
      padding: 13px 18px;
      border-color: var(--yss-doc-border);
    }

    .dumi-default-content .markdown table td {
      color: var(--yss-doc-text-body);
    }

    .dumi-default-content .markdown table th:first-child,
    .dumi-default-content .markdown table td:first-child {
      white-space: nowrap;
      width: 1%;
    }

    @media (max-width: 1200px) {
      .dumi-default-doc-layout .dumi-default-content {
        padding: 40px 34px 64px !important;
      }
    }

    @media (max-width: 768px) {
      .dumi-default-doc-layout > main {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: 100%;
        min-width: 0;
        max-width: 100% !important;
        padding: 10px 10px 0 !important;
        overflow-x: hidden;
      }

      .dumi-default-doc-layout .dumi-default-content {
        flex: 0 0 auto !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 30px 22px 52px !important;
        border-radius: 0 !important;
        font-size: 14px;
      }

      .dumi-default-content h1,
      .dumi-default-content h2,
      .dumi-default-content h3 {
        overflow-wrap: anywhere;
        word-break: normal;
      }

      .dumi-default-content h1 { font-size: 28px; }
      .dumi-default-content h2 { font-size: 24px; }
      .dumi-default-content h3 { font-size: 19px; }
    }

    /* 右侧 TOC 页面控制台样式在 .dumi/theme/slots/Toc 内维护 */

    /* Demo 容器样式 */
    .demo-container {
      background: var(--demo-bg-container);
      color: var(--demo-text-primary);
    }
    
    /* 通用状态标签样式 */
    .status-tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    
    .status-active {
      background: var(--demo-success-bg);
      color: var(--demo-success-color);
      border: 1px solid var(--demo-success-border);
    }
    
    .status-inactive {
      background: var(--demo-error-bg);
      color: var(--demo-error-color);
      border: 1px solid var(--demo-error-border);
    }

    /* 通用辅助文本样式 */
    .demo-hint-text {
      color: var(--demo-text-muted);
    }

    .demo-surface {
      background: var(--demo-bg-surface);
    }

    /* 暗色相关样式已迁移到 /public/styles/yss-theme-vars.css */

    /* 暗色相关样式迁移到 /public/styles/yss-theme-vars.css */
    `,
  ],
  // 如需全局样式可在此继续追加 stylesheet（避免与上方 links 重复）
  alias: {
    '@yss-ui/components/locale': path.resolve(__dirname, 'packages/components/src/locale'),
    '@yss-ui/components$': path.resolve(__dirname, 'packages/components/src/docs-entry.ts'),
    '@yss-ui/components/sheet': path.resolve(__dirname, 'packages/components/src/sheet/docs-exports.ts'),
    '@yss-ui/components/lite': path.resolve(__dirname, 'packages/components/src/lite.ts'),
    '@yss-ui/utils': path.resolve(__dirname, 'packages/utils/src'),
    '@yss-ui/hooks': path.resolve(__dirname, 'packages/hooks/src'),
    '@yss-ui/theme': path.resolve(__dirname, 'packages/theme/src'),
  },
});
