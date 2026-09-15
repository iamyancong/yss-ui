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
  skills: [],
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
  store.index.consumptionContract = {
    ...JSON.parse(fs.readFileSync(path.join(__dirname, '../../components/consumption-policy.json'), 'utf8')),
    componentsVersion: '1.7.1',
    subpaths: ['.', './vite', './table', './formily'],
  };
  const current = JSON.parse(handleToolCall(store, 'get_consumption_contract', { componentsVersion: '1.7.1' }));
  assert.equal(current.plugin.entry, '@yss-ui/components/vite');
  assert.match(handleToolCall(store, 'get_consumption_contract', { componentsVersion: '1.7.2' }), /未经当前索引验证/);
});
