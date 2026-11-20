/**
 * @file workbuddy-assets.config.mjs
 * @description WorkBuddy 开放平台三类资产（技能市场 / 连接器 / 专家）的唯一数据源。
 *              改这里即可，三个打包脚本都从本文件读取配置，避免文案与分组漂移。
 *              规范：https://open.workbuddy.cn/docs/skill 、https://open.workbuddy.cn/docs/connector
 */

export const AUTHOR = 'YSS UI Team';
export const SKILL_VERSION = '1.0.0';

/** 内部流程类技能：不对外发布，也不内联进任何市场技能包。 */
export const EXCLUDED_SKILLS = [
  'sync-internal-dev',
  'java-backend-commit',
  'skill-development',
  'release-workflow',
  'release-management',
  'yss-create-microapp'
];

/**
 * 场景化聚合：34 个公开技能 → 10 个市场技能。
 * primary 作为包根 SKILL.md 的正文，support 与依赖闭包一起放进 references/deps/。
 * 组内引用天然闭合（所有成员目录平铺在同一层），只有指向 EXCLUDED_SKILLS 的引用会被改写。
 */
export const SKILL_GROUPS = [
  {
    name: 'yss-microapp-scaffold',
    displayName: { zh: 'YSS 微应用工程初始化', en: 'YSS Micro-App Scaffolding' },
    description: '新建或初始化 YSS 微前端微应用工程时使用；覆盖官方脚手架参数预检、工程骨架与 Vue 3 编码基线。触发词：新建微应用、脚手架、初始化工程、create-yss-app、页面骨架。',
    descriptionZh: '用官方脚手架规范创建 YSS 微前端子应用，含参数预检、工程骨架与 Vue 3 编码基线。',
    descriptionEn: 'Scaffold YSS micro-frontend apps with official CLI dry-run checks, project skeleton and Vue 3 baselines.',
    examplesZh: [
      '帮我新建一个名为 user-center 的微前端子应用工程',
      '初始化微应用前先做一次脚手架参数预检',
      '新工程的页面骨架应该按什么结构组织'
    ],
    examplesEn: [
      'Scaffold a new micro-app named user-center',
      'Run a dry-run parameter check before creating the app',
      'How should the page skeleton of a new project be organized'
    ],
    primary: 'create-yss-app',
    support: ['page-skeleton', 'vue3-best-practices']
  },
  {
    name: 'yss-openapi-integration',
    displayName: { zh: 'YSS OpenAPI 接口集成', en: 'YSS OpenAPI Integration' },
    description: '根据 openapi.json 生成前端 Server 层代码并在业务页面中集成 Orval API；覆盖 mutator 响应契约、大数精度、加载与错误处理。触发词：openapi、generate:api、接口生成、联调、已有工程开发。',
    descriptionZh: '契约驱动生成强类型 API 并在业务页面正确集成，覆盖 mutator 契约与大数精度防御。',
    descriptionEn: 'Generate strongly-typed APIs from openapi.json and integrate them into YSS pages with mutator and BigInt safety.',
    examplesZh: [
      '读取 openapi.json 生成接口并开发一个 CRUD 列表页',
      '接口返回后还需要判断 res.success 吗',
      '现有工程里新增一个业务页面该从哪一步开始'
    ],
    examplesEn: [
      'Generate API code from openapi.json and build a CRUD page',
      'Do I still need to check res.success after an await',
      'Where to start when adding a page to an existing app'
    ],
    primary: 'api-integration',
    support: ['yss-frontend-dev']
  },
  {
    name: 'yss-business-page',
    displayName: { zh: 'YSS 业务页面与 CRUD 架构', en: 'YSS Business Page Builder' },
    description: '从需求或原型生成完整 YSS 业务页面；覆盖主组件 ≤150 行拆分、模块划分、组件开发规范与原型对照验收。触发词：业务页面、CRUD、整页开发、页面模块拆分、原型复刻。',
    descriptionZh: '按 YSS UI 规范生成整页业务架构，强制主组件拆分、模块边界与原型对照验收。',
    descriptionEn: 'Build complete YSS business pages with strict module separation, component rules and prototype-based acceptance.',
    examplesZh: [
      '根据原型图生成一个客户信息管理页面',
      '主组件超过 150 行应该怎么拆分',
      '实现后帮我逐项核对原型验收清单'
    ],
    examplesEn: [
      'Generate a customer management page from this prototype',
      'How to split a main component over 150 lines',
      'Check my implementation against the prototype checklist'
    ],
    primary: 'yss-ui-business-page-generation',
    support: ['component-development', 'prototype-page-acceptance']
  },
  {
    name: 'yss-table-list',
    displayName: { zh: 'YSS 表格与列表页', en: 'YSS Table & List Pages' },
    description: '开发 YTable 列表页、远程分页、操作列、可编辑表格与自适应高度；覆盖列配置、字典翻译、工具栏与表格实例方法。触发词：YTable、列表页、远程分页、action-config、useTableHeight。',
    descriptionZh: '标准表格与列表页开发指南，覆盖远程分页、操作列、可编辑表格与容器自适应高度。',
    descriptionEn: 'Build YTable list pages with remote pagination, action columns, editable tables and adaptive height.',
    examplesZh: [
      '做一个带远程分页和操作列的 YTable 列表',
      '表格高度要自适应容器该用哪个 Hook',
      '实现一个可编辑表格并回显字典列'
    ],
    examplesEn: [
      'Build a YTable list with remote pagination and action column',
      'Which hook makes the table fit the container height',
      'Implement an editable table with dictionary columns'
    ],
    primary: 'ytable-usage',
    support: ['page-list-module', 'yedit-table-usage', 'use-table-height']
  },
  {
    name: 'yss-formily-forms',
    displayName: { zh: 'YSS 表单与 Formily', en: 'YSS Formily Forms' },
    description: '使用 YFormily + JSON Schema 开发新增、编辑、查看三态表单；覆盖字段联动、副作用、分步表单、查看态插槽与回显大数防御。触发词：YFormily、动态表单、字段联动、三态表单、分步表单。',
    descriptionZh: '表单开发全流程指南，覆盖 JSON Schema、字段联动、查看态、分步表单与回显安全。',
    descriptionEn: 'Develop YFormily JSON Schema forms with linkage effects, detail mode, step flows and safe data echo.',
    examplesZh: [
      '实现一个用户编辑弹窗，支持条件显隐联动',
      '表单查看态只读应该怎么用 mode 切换',
      '做一个分步表单并避免雪花 ID 回显丢精度'
    ],
    examplesEn: [
      'Build a user edit dialog with conditional field linkage',
      'How to switch a form to read-only detail mode',
      'Create a step form without losing BigInt IDs on echo'
    ],
    primary: 'yss-formily',
    support: [
      'formily-foundation',
      'formily-linkage-effects',
      'formily-mode-slot-detail',
      'formily-step-flow',
      'page-form-module'
    ]
  },
  {
    name: 'yss-component-selection',
    displayName: { zh: 'YSS 组件选型与复合组件', en: 'YSS Component Selection' },
    description: '按 YSS UI 真实导出选择组件与导入路径，开发左树右表、条件构造器、URL 状态与轮询任务；严禁臆造 Y 前缀组件。触发词：组件选型、YTree、YConditionBuilder、左树右表、轮询。',
    descriptionZh: '按真实组件清单选型并实现树、条件构造、URL 状态与轮询等复合交互，杜绝臆造组件。',
    descriptionEn: 'Pick real YSS UI components and build tree layouts, condition builders, URL state and polling tasks.',
    examplesZh: [
      '左侧组织树右侧表格的联动页面怎么搭',
      '写一个条件构造器查询表单',
      '把筛选条件同步到 URL 并支持定时刷新'
    ],
    examplesEn: [
      'Build a page with an org tree on the left and a table on the right',
      'Implement a condition builder query form',
      'Sync filters to the URL and poll for updates'
    ],
    primary: 'component-selection-imports',
    support: [
      'ytree-usage',
      'use-tree-height',
      'ycondition-builder-usage',
      'use-url-state',
      'use-polling-task'
    ]
  },
  {
    name: 'yss-file-io',
    displayName: { zh: 'YSS 文件导入与导出', en: 'YSS File Import & Export' },
    description: '处理 Excel/CSV 文件导出、模板导入与在线表格；覆盖 Blob 响应解析、文件名编码、responseType 与页签数据读写。触发词：导出 Excel、文件下载、导入模板、YFileImport、YSheet。',
    descriptionZh: '标准化文件导入导出，覆盖 Blob 下载、文件名编码、导入模板与在线表格数据处理。',
    descriptionEn: 'Handle file exports and imports with Blob responses, filename decoding, upload templates and sheet data.',
    examplesZh: [
      '给列表页加一个导出 Excel 按钮',
      '下载接口返回乱码文件名怎么处理',
      '实现 Excel 模板导入并校验表头'
    ],
    examplesEn: [
      'Add an Excel export button to the list page',
      'Fix garbled filenames from a blob download',
      'Implement Excel template import with header validation'
    ],
    primary: 'file-export-download',
    support: ['yfile-import-usage', 'ysheet-usage']
  },
  {
    name: 'yss-theme-token',
    displayName: { zh: 'YSS 主题与样式 Token', en: 'YSS Theme Tokens' },
    description: '按语义化 CSS 变量与主题 Token 规范编写样式，禁止硬编码品牌色与交互色阶。触发词：主题换肤、CSS 变量、色值、color-mix、硬编码颜色。',
    descriptionZh: '用语义化 CSS 变量与主题 Token 写样式，杜绝硬编码品牌色与交互色阶。',
    descriptionEn: 'Write styles with semantic CSS variables and theme tokens instead of hardcoded colors.',
    examplesZh: [
      '把页面里的硬编码蓝色改成主题变量',
      '透明态颜色应该怎么从主色派生',
      '检查一下这段代码有没有违反 Token 规范'
    ],
    examplesEn: [
      'Replace hardcoded blue with theme variables',
      'How to derive translucent colors from the primary token',
      'Audit this code for token compliance'
    ],
    primary: 'theme-token-usage',
    support: []
  },
  {
    name: 'yss-quality-gate',
    displayName: { zh: 'YSS 质量自测与规范提交', en: 'YSS Quality Gate & Commits' },
    description: '代码交付前运行类型检查与 lint 门禁、编写组件测试、按 Conventional Commits 提交并生成变更记录。触发词：type-check、lint、组件测试、提交规范、changelog。',
    descriptionZh: '交付前质量门禁与提交规范：类型检查、lint、组件测试、约定式提交与变更记录。',
    descriptionEn: 'Run type-check and lint gates, component tests, Conventional Commits and changelog generation before delivery.',
    examplesZh: [
      '改完代码后帮我跑一遍质量门禁',
      '按规范生成这次改动的提交信息',
      '为这个表单组件补一组单元测试'
    ],
    examplesEn: [
      'Run the quality gates after my changes',
      'Generate a conventional commit message for this change',
      'Add unit tests for this form component'
    ],
    primary: 'frontend-commit',
    support: ['component-testing', 'commit-linting', 'changelog-generation']
  },
  {
    name: 'yss-docs-i18n',
    displayName: { zh: 'YSS 文档与国际化', en: 'YSS Docs & i18n' },
    description: '维护项目文档与多语言词条；覆盖文档结构、文案一致性、locale 资源组织与中英文回退。触发词：写文档、README、国际化、i18n、多语言词条。',
    descriptionZh: '文档与国际化规范，覆盖文档结构、文案一致性、locale 资源与中英文回退。',
    descriptionEn: 'Documentation and i18n conventions covering structure, wording consistency and locale fallbacks.',
    examplesZh: [
      '给这个模块补一份使用文档',
      '新增一条文案时国际化词条怎么放',
      '检查项目里缺失的英文翻译'
    ],
    examplesEn: [
      'Write usage docs for this module',
      'Where should a new i18n entry live',
      'Find missing English translations in the project'
    ],
    primary: 'documentation',
    support: ['i18n-locale-management']
  }
];

/** 连接器：MCP + Skill / stdio，由 WorkBuddy 通过 npx 拉起已发布的 npm 包。 */
export const CONNECTOR = {
  // source 必须全局唯一；提交前请在开放平台确认未被占用
  source: 'yss-ui-docs',
  type: 'mcp',
  version: '1.0.0',
  name: 'YSS UI 组件文档',
  nameZh: 'YSS UI 组件文档',
  nameEn: 'YSS UI Component Docs',
  description: 'Query real YSS UI component docs, schemas, demos and codegen rules without guessing APIs.',
  descriptionZh: '查询 YSS UI 组件真实文档、Schema 约束、官方 Demo 与代码生成规则，避免臆造 API。',
  descriptionEn: 'Query real YSS UI component docs, schemas, official demos and codegen rules instead of guessing APIs.',
  examplesZh: [
    '查一下 YTable 支持哪些列配置属性',
    '给我 formily/modes 的官方 Demo 源码',
    '列出 YSS UI 真实导出的全部组件'
  ],
  examplesEn: [
    'What column props does YTable support',
    'Show me the official formily/modes demo source',
    'List all components actually exported by YSS UI'
  ],
  // 本机 WorkBuddy 5.11.3 ≥ 5.0.0，可声明 runtime 让平台托管 Node
  mcpServerKey: 'yss-ui-docs',
  npmPackage: '@yss-ui/mcp@0.11.0',
  minWorkbuddyVersion: '5.0.0',
  runtime: { type: 'node', version: '>=18.0.0' },
  timeout: 30000,
  iconSource: 'public/branding/yss-logo-mark-ai.png',
  guideSkillName: 'yss-ui-docs-guide'
};

/**
 * 连接器引导技能里的 MCP 工具说明。
 * 打包时会与 packages/mcp/lib/tools.js 的 TOOL_DEFINITIONS 做名称一致性校验，防止升级 MCP 后文档漂移。
 */
export const CONNECTOR_TOOLS = [
  {
    name: 'get_consumption_contract',
    summary: '查询单包安装、根入口导入、样式与官方 Vite 插件契约；未知版本不推断新能力。',
    params: [{ name: 'componentsVersion', type: 'string', required: false, desc: '目标项目实际安装的 components 精确版本' }]
  },
  {
    name: 'list_components',
    summary: '列出 YSS UI 全部组件、Hooks 与工具函数；生成业务代码前先确认组件真实存在。',
    params: []
  },
  {
    name: 'get_component_docs',
    summary: '获取组件/Hook 文档（props、events、slots、methods）；写任何组件配置前必查。',
    params: [
      { name: 'name', type: 'string', required: true, desc: '组件名，支持 YTable / y-table / 表格 / useTableHeight 等写法' },
      { name: 'section', type: 'string', required: false, desc: 'api（默认）或 full（完整文档）' }
    ]
  },
  {
    name: 'get_demo',
    summary: '获取组件官方 Demo 完整源码；不传 demo 时列出该组件全部可用 Demo。',
    params: [
      { name: 'component', type: 'string', required: true, desc: '组件名' },
      { name: 'demo', type: 'string', required: false, desc: 'Demo 标识，由列表获得' }
    ]
  },
  {
    name: 'search_docs',
    summary: '在全部组件文档与 Skills 中按关键词全文搜索（支持中文），返回相关章节片段。',
    params: [
      { name: 'query', type: 'string', required: true, desc: '查询语句，如「表单编辑回显」或 editConfig' },
      { name: 'limit', type: 'number', required: false, desc: '返回条数，默认 5' }
    ]
  },
  {
    name: 'list_skills',
    summary: '列出全部 YSS UI 开发 Skills 及其触发场景描述。',
    params: []
  },
  {
    name: 'get_skill',
    summary: '获取指定 Skill 完整内容，可附带 references / scripts 或读取指定附属文件。',
    params: [
      { name: 'name', type: 'string', required: true, desc: 'Skill 名称，如 page-form-module' },
      { name: 'include', type: 'string[]', required: false, desc: '可选附带内容：references / scripts' },
      { name: 'file', type: 'string', required: false, desc: 'references 或 scripts 下的具体相对路径' }
    ]
  },
  {
    name: 'get_codegen_rules',
    summary: '获取 YSS UI 业务代码生成硬规则（样式导入、SFC 结构、主题 Token、大数精度等）。生成代码前必读一次。',
    params: []
  },
  {
    name: 'get_component_schema',
    summary: '获取组件精确的结构化 JSON Schema（Props 约束、枚举、默认值、Emits、Slots），杜绝属性名幻觉。',
    params: [
      { name: 'name', type: 'string', required: true, desc: '组件名' },
      { name: 'detail', type: 'string', required: false, desc: 'core（默认）或 all' }
    ]
  },
  {
    name: 'get_test_coverage',
    summary: '获取组件库自动化测试覆盖率矩阵与模块健康度；不传组件名返回全库概览。',
    params: [{ name: 'component', type: 'string', required: false, desc: '组件或模块名，如 table / useUrlState' }]
  }
];

/**
 * 连接器市场上架受限（个人开发者需企业认证）时的替代资产：
 * 把 @yss-ui/mcp 的离线契约数据做成一个独立技能包，用户安装后即可查真实组件 API，
 * 不依赖任何 MCP 连接。它不进入 SKILL_GROUPS —— 其 SKILL.md 由打包脚本生成，
 * 不从 packages/skills 取主正文，因此不参与「公开技能分组覆盖」自检。
 */
export const DOCS_SKILL = {
  name: 'yss-ui-component-docs',
  displayName: { zh: 'YSS UI 组件文档速查', en: 'YSS UI Component Docs Lookup' },
  description: '查询 YSS UI 组件真实 API、Schema 约束与官方 Demo 源码时使用；内置离线契约数据，无需连接 MCP。触发词：组件属性、Props、Schema、Demo、YTable 配置、组件清单、防臆造。',
  descriptionZh: '内置 YSS UI 组件离线契约数据，随时核对真实属性、事件、插槽与官方 Demo，杜绝臆造 API。',
  descriptionEn: 'Look up real YSS UI component props, events, slots and official demos from bundled offline contract data.',
  examplesZh: [
    'YTable 的 columns 到底支持哪些配置项',
    '给我 formily/modes 的官方 Demo 源码',
    '列出 YSS UI 真实导出的全部组件'
  ],
  examplesEn: [
    'Which column props does YTable actually support',
    'Show the official formily/modes demo source',
    'List all components really exported by YSS UI'
  ],
  dataDir: 'packages/mcp/data',
  dataFiles: ['index.json', 'schemas.json', 'coverage-summary.json'],
  mcpPackage: '@yss-ui/mcp@0.11.0'
};
