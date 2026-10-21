const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DocStore } = require('./store');
const { TOOL_DEFINITIONS, handleToolCall } = require('./tools');

const INDEX_PATH = path.join(__dirname, '../data/index.json');

const MOCK_INDEX = {
  componentsVersion: '1.6.7',
  generatedAt: '2026-09-14T00:00:00.000Z',
  entries: [
    {
      id: 'table',
      type: 'component',
      title: 'Table 表格',
      category: '数据展示',
      description: '通用表格组件',
      doc: '## API\n\n表格 API',
      demos: [],
    },
  ],
  skills: [
    {
      name: 'yss-create-microapp',
      category: 'app',
      description: '在本地创建微应用脚手架工程',
      content: '# Skill: yss-create-microapp\n\n创建本地微应用项目脚手架',
      references: [],
      scripts: [
        {
          path: 'create.mjs',
          size: 1024,
          firstLineComment: '脚手架入口',
          content: '// 脚手架入口\nconsole.log(1);',
        },
      ],
      hasReferences: false,
      hasScripts: true,
      requiresLocalInstall: true,
    },
    {
      name: 'yss-ui-business-page-generation',
      category: 'app',
      description: '指导生成或改造 Vue3 YSS UI 业务页面',
      content: '# Skill: yss-ui-business-page-generation\n\n指导生成业务页面',
      references: [
        {
          path: 'references/hooks-map.md',
          content: '# Hooks 映射表\n\nhooks-map.md 内容',
        },
      ],
      scripts: [
        {
          path: 'page-script.mjs',
          size: 1024,
          firstLineComment: '页面辅助脚本',
          content: '// 页面辅助脚本\nconsole.log(2);',
        },
      ],
      hasReferences: true,
      hasScripts: true,
      requiresLocalInstall: true,
    },
    {
      name: 'ytable-usage',
      category: 'app',
      description: '指导使用 YTable 表格',
      content: '# Skill: ytable-usage\n\n指导使用表格',
      references: [],
      scripts: [],
      hasReferences: false,
      hasScripts: false,
      requiresLocalInstall: false,
    },
  ],
  codegenRules: '',
  schemas: {
    table: {
      name: 'table',
      file: 'packages/components/src/table/table.vue',
      propsCount: 56,
      props: {
        columns: { name: 'columns', tsType: 'YTableColumn[]', type: 'Array', isCore: true },
        actionConfig: { name: 'actionConfig', tsType: 'YTableActionConfig', type: 'Object', isCore: true },
        extraProp: { name: 'extraProp', tsType: 'any', type: 'any', isCore: false },
      },
      emits: [{ name: 'current-row-change', type: '(row: any) => void', description: '当前行选中变化' }],
      slots: [],
    },
  },
  coverage: {
    hasCoverageReport: true,
    totalMetrics: { lines: 85.5, branches: 75, functions: 82, statements: 80 },
    packages: [
      {
        title: '@yss-ui/components',
        modules: [
          {
            name: 'table',
            hasTest: true,
            testCount: 1,
            lines: { pct: 88, covered: 88, total: 100 },
            branches: { pct: 80, covered: 80, total: 100 },
            functions: { pct: 90, covered: 90, total: 100 },
            testFiles: ['action-column.component.test.ts'],
          },
        ],
      },
    ],
  },
};

const store = fs.existsSync(INDEX_PATH) ? new DocStore(INDEX_PATH) : new DocStore(MOCK_INDEX);
// 干净环境或 CI 未生成 coverage-summary.json 时回退 mock 覆盖率数据，确保单测独立自洽
if (!store.index.coverage) {
  store.index.coverage = MOCK_INDEX.coverage;
}
// 干净环境或 CI 未生成 index.json 时回退 mock skills 数据
if (!store.index.skills || store.index.skills.length === 0) {
  store.index.skills = MOCK_INDEX.skills;
}

test('MCP 工具定义包含新增工具', () => {
  const toolNames = TOOL_DEFINITIONS.map(t => t.name);
  assert.ok(toolNames.includes('get_component_schema'), '应包含 get_component_schema');
  assert.ok(toolNames.includes('get_test_coverage'), '应包含 get_test_coverage');
  assert.ok(toolNames.includes('list_components'), '应包含 list_components');
});

test('list_components 输出包含组件及单测覆盖率标记', () => {
  const result = handleToolCall(store, 'list_components');
  assert.ok(result.includes('组件（@yss-ui/components）'), '应包含组件章节');
  assert.ok(result.includes('Table 表格'), '应包含 Table 表格');
  assert.ok(result.includes('测试覆盖:'), '应包含测试覆盖标记');
});

test('get_component_schema 核心属性与全量属性查询', () => {
  // 1. 默认 core 模式
  const coreResult = handleToolCall(store, 'get_component_schema', { name: 'YTable' });
  assert.ok(coreResult.includes('# table 组件 Schema'), '应匹配 table 组件');
  assert.ok(coreResult.includes('columns'), 'coreProps 应包含 columns');
  assert.ok(coreResult.includes('actionConfig'), 'coreProps 应包含 actionConfig');
  assert.ok(coreResult.includes('Emits 事件'), '应包含 Emits 事件');
  assert.ok(coreResult.includes('current-row-change'), '应包含 current-row-change 事件');

  // 2. detail = 'all' 模式
  const allResult = handleToolCall(store, 'get_component_schema', { name: 'table', detail: 'all' });
  assert.ok(allResult.includes('包含底层透传属性'), '说明应提示全量属性');

  // 3. 不存在的组件
  const notFound = handleToolCall(store, 'get_component_schema', { name: 'NonExistentComponent' });
  assert.ok(notFound.includes('未找到组件'), '未收录组件应友好提示');
});

test('getComponentSchema 优先精确匹配同前缀组件', () => {
  const localStore = new DocStore({
    ...MOCK_INDEX,
    entries: [],
    schemas: {
      'file-preview-modal': { name: 'file-preview-modal', props: {}, emits: [], slots: [] },
      'file-preview': { name: 'file-preview', props: {}, emits: [], slots: [] },
    },
  });
  assert.equal(localStore.getComponentSchema('YFilePreview').name, 'file-preview');
  assert.equal(localStore.getComponentSchema('FilePreviewModal').name, 'file-preview-modal');
  assert.equal(localStore.getComponentSchema('preview').name, 'file-preview-modal');
});

test('get_test_coverage 大盘与单组件查询', () => {
  // 1. 大盘概览
  const overview = handleToolCall(store, 'get_test_coverage');
  assert.ok(overview.includes('自动化测试覆盖率概览'), '应包含概览标题');
  assert.ok(overview.includes('全库行覆盖率:'), '应展示全库行覆盖率');

  // 2. 指定单个组件
  const tableCoverage = handleToolCall(store, 'get_test_coverage', { component: 'table' });
  assert.ok(tableCoverage.includes('table 测试覆盖率'), '应包含 table 测试覆盖');
  assert.ok(tableCoverage.includes('行覆盖率 (Lines)'), '应包含行覆盖率指标');
  assert.ok(tableCoverage.includes('action-column.component.test.ts'), '应列出单测文件');

  // 3. 不存在的模块
  const notFound = handleToolCall(store, 'get_test_coverage', { component: 'unknown-module-xyz' });
  assert.ok(notFound.includes('未找到模块'), '不存在模块应友好提示');
});

test('消费契约区分旧版本、当前源码和未知版本', () => {
  const store = new DocStore(MOCK_INDEX);
  store.index.consumptionContract = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../components/consumption-policy.json'), 'utf8')
  );
  const old = handleToolCall(store, 'get_consumption_contract', { componentsVersion: '1.6.7' });
  assert.match(old, /"pluginAvailable": false/);
  assert.match(old, /table/);
  assert.match(handleToolCall(store, 'get_consumption_contract', { componentsVersion: '9.9.9' }), /未经当前索引验证/);
  assert.match(handleToolCall(store, 'get_consumption_contract'), /单包/);
  assert.match(handleToolCall(store, 'get_component_docs', { name: 'table' }), /索引组件版本/);
});

test('已核验当前版本可以提供插件契约，后续未知版本不能外推', () => {
  const store = new DocStore(MOCK_INDEX);
  const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../../components/consumption-policy.json'), 'utf8'));
  store.index.consumptionContract = {
    ...policy,
    componentsVersion: '1.7.1',
    peerDependencies: { vite: policy.plugin.vitePeer },
    subpaths: ['.', './vite', './table', './formily'],
  };
  const current = JSON.parse(handleToolCall(store, 'get_consumption_contract', { componentsVersion: '1.7.1' }));
  assert.equal(current.plugin.entry, '@yss-ui/components/vite');
  assert.equal(current.plugin.vitePeer, '^5.4.10 || ^6.0.0');
  assert.equal(current.peerDependencies.vite, current.plugin.vitePeer);
  assert.match(handleToolCall(store, 'get_consumption_contract', { componentsVersion: '1.7.2' }), /未经当前索引验证/);
});

test('list_skills 包含技能分类与 references/scripts 附属标记', () => {
  const result = handleToolCall(store, 'list_skills');
  assert.ok(result.includes('## app') || result.includes('## library'), '应包含分类');
  assert.match(result, /references:/, '有 references 的 skill 应打上标记');
});

test('get_skill 支持 include 与精确 file 查询', () => {
  // 1. 基础查询：带附属资源提示
  const baseResult = handleToolCall(store, 'get_skill', { name: 'yss-ui-business-page-generation' });
  assert.ok(baseResult.includes('# Skill: yss-ui-business-page-generation'), '应返回 skill 标题');
  assert.ok(baseResult.includes('💡 附属资源'), '应包含附属资源提示');

  // 2. include: ['references'] 模式
  const refResult = handleToolCall(store, 'get_skill', {
    name: 'yss-ui-business-page-generation',
    include: ['references'],
  });
  assert.ok(refResult.includes('📚 参考文档（References）'), '应展示 references 章节');
  assert.ok(refResult.includes('hooks-map.md'), '应展示 references/hooks-map.md 内容');

  // 3. file 参数精准查询单个 reference 文件
  const singleFileResult = handleToolCall(store, 'get_skill', {
    name: 'yss-ui-business-page-generation',
    file: 'references/hooks-map.md',
  });
  assert.ok(singleFileResult.includes('hooks-map.md'), '应展示指定文件');

  // 4. file 参数必须完全匹配，传 x/hooks-map.md 不得被模糊匹配命中
  const prefixWrongFile = handleToolCall(store, 'get_skill', {
    name: 'yss-ui-business-page-generation',
    file: 'x/hooks-map.md',
  });
  assert.ok(prefixWrongFile.includes('未找到'), '前缀不匹配的路径不得被 endsWith 模糊命中');

  // 5. file 参数查询不存在的文件应友好提示并列出可用文件
  const notFoundFile = handleToolCall(store, 'get_skill', {
    name: 'yss-ui-business-page-generation',
    file: 'non-existent-doc.md',
  });
  assert.ok(notFoundFile.includes('未找到'), '未找到文件应提示');
  assert.ok(notFoundFile.includes('可用附属文件'), '应列出可用附属文件');
});

test('needsLocalInstall 能准确识别带脚本与纯文档 Skill', () => {
  const { needsLocalInstall } = require('./store');
  assert.equal(needsLocalInstall({ requiresLocalInstall: true }), true);
  assert.equal(needsLocalInstall({ scripts: [{ path: 'create.mjs' }] }), true);
  assert.equal(needsLocalInstall({ requiresLocalInstall: false, scripts: [] }), false);
  assert.equal(needsLocalInstall(null), false);
});

test('带脚本的 Skill 在 list_skills 中标注「需本地安装 Skills」，纯文档型 Skill 输出不变', () => {
  const result = handleToolCall(store, 'list_skills');
  // 带有脚本的 skill（如 yss-create-microapp 或 mock 中的 yss-ui-business-page-generation）
  assert.match(result, /需本地安装 Skills/, '带脚本的 Skill 应打上「需本地安装 Skills」标记');
  // 纯文档型 Skill（如 ytable-usage）不应包含该标记
  const ytableLine = result.split('\n').find(line => line.includes('ytable-usage'));
  assert.ok(ytableLine, '列表中应包含 ytable-usage');
  assert.ok(!ytableLine.includes('需本地安装 Skills'), '纯文档型 Skill 不应标注「需本地安装 Skills」');
});

test('带脚本的 Skill 在 get_skill 前置输出安装指引，且仅脚手架 Skill 推荐 CLI', () => {
  // 1. yss-create-microapp: 推荐 CLI 方式免装 Skills，且脚本路径为 scripts/create.mjs（无重复 scripts/）
  const microappResult = handleToolCall(store, 'get_skill', { name: 'yss-create-microapp' });
  assert.ok(microappResult.includes('⚠️ **前置提示**'), 'yss-create-microapp 应包含前置提示');
  assert.ok(microappResult.includes('npx @yss-ui/create'), 'yss-create-microapp 应推荐优先使用 CLI 方式');
  assert.ok(
    microappResult.includes('`scripts/create.mjs`'),
    '脚本路径应为 scripts/create.mjs，不得出现 scripts/scripts'
  );
  assert.ok(!microappResult.includes('scripts/scripts/create.mjs'), '不得出现重复的 scripts/scripts/ 前缀');
  assert.ok(microappResult.includes('npx -y @yss-ui/skills-cli sync'), '应提示脚本方式使用 skills-cli 安装');
  assert.ok(microappResult.includes('禁止自行编写替代脚本'), '应包含严禁自行编写替代脚本的警告');

  // 2. 其他带脚本的 Skill（如 mock 中的 yss-ui-business-page-generation）: 有前置提示与 sync 引导，但绝对不得推荐 @yss-ui/create
  const mockStore = new DocStore(MOCK_INDEX);
  const otherResult = handleToolCall(mockStore, 'get_skill', { name: 'yss-ui-business-page-generation' });
  assert.ok(otherResult.includes('⚠️ **前置提示**'), '其他带脚本 Skill 也应有前置提示');
  assert.ok(otherResult.includes('npx -y @yss-ui/skills-cli sync'), '其他带脚本 Skill 应提示 skills-cli sync');
  assert.ok(!otherResult.includes('@yss-ui/create'), '其他非微应用脚手架 Skill 绝对不得出现 @yss-ui/create 推荐');

  // 3. 纯文档型 Skill（如 ytable-usage）无前置 banner
  const docResult = handleToolCall(store, 'get_skill', { name: 'ytable-usage' });
  assert.ok(!docResult.includes('⚠️ **前置提示**'), '纯文档型 Skill 不应输出前置提示');
  assert.ok(docResult.startsWith('# Skill: ytable-usage'), '纯文档型 Skill 应直接以标题开头');
});

test('search_docs 命中带脚本 Skill 时在来源标注「（需本地安装 Skills）」，纯文档型不标注', () => {
  const mockStore = new DocStore(MOCK_INDEX);
  // 1. 命中带脚本的 skill
  const hits = mockStore.search('创建微应用', 5);
  assert.ok(hits.length > 0, '搜索应命中微应用');
  const microappHit = hits.find(h => h.source.includes('yss-create-microapp'));
  assert.ok(microappHit, '结果列表中应包含 yss-create-microapp');
  assert.equal(microappHit.source, 'skill: yss-create-microapp（需本地安装 Skills）');

  // 2. 命中纯文档型的 skill
  const tableHits = mockStore.search('使用表格', 5);
  assert.ok(tableHits.length > 0, '搜索应命中表格');
  const tableHit = tableHits.find(h => h.source.includes('ytable-usage'));
  assert.ok(tableHit, '结果列表中应包含 ytable-usage');
  assert.equal(tableHit.source, 'skill: ytable-usage');
});

test('FilePreview 的文档、Schema 与消费契约都说明 pptx 子路径的启用方式', () => {
  const real = fs.existsSync(INDEX_PATH) ? new DocStore(INDEX_PATH) : null;
  if (!real) return;
  const contract = real.index.consumptionContract;
  assert.ok(contract.subpaths.includes('./file-preview/pptx'), '消费契约缺少 file-preview/pptx 子路径');
  const feature = contract.optionalFeatures.find(item => item.id === 'file-preview-pptx');
  assert.equal(feature.subpath, '@yss-ui/components/file-preview/pptx');
  assert.equal(feature.peerDependency.name, '@aiden0z/pptx-renderer');
  assert.equal(feature.peerDependency.range, '~1.4.0');
  assert.ok(contract.agentRules.some(rule => rule.includes('registerPptxRenderer()')));

  for (const output of [
    handleToolCall(real, 'get_component_docs', { name: 'FilePreview' }),
    handleToolCall(real, 'get_component_docs', { name: 'YFilePreview', section: 'full' }),
    handleToolCall(real, 'get_component_schema', { name: 'YFilePreview' }),
    handleToolCall(real, 'get_component_schema', { name: 'YFilePreviewModal' }),
  ]) {
    assert.match(output, /@yss-ui\/components\/file-preview\/pptx/);
    assert.match(output, /registerPptxRenderer\(\)/);
    assert.match(output, /pnpm add @aiden0z\/pptx-renderer@1\.4\.0/);
    assert.match(output, /直接导入 @aiden0z\/pptx-renderer/);
    assert.doesNotMatch(output, /pptx-preview/);
  }
  // 其他组件不附带 pptx 说明
  assert.doesNotMatch(handleToolCall(real, 'get_component_docs', { name: 'YTable' }), /registerPptxRenderer/);

  const skill = handleToolCall(real, 'get_skill', { name: 'component-selection-imports' });
  assert.match(skill, /文件预览 PPTX（实验性 opt-in）/);
  assert.match(skill, /registerPptxRenderer\(\)/);
  assert.match(handleToolCall(real, 'search_docs', { query: 'registerPptxRenderer' }), /pptx/i);
});
