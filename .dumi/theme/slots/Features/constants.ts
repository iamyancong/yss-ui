import generatedReleases from './generated-releases.json';
import type { FeatureCard, FeatureCardPreview, FeatureCardVariant, HomeReleaseItem } from './types';

/** 首页能力卡片默认强调色。 */
export const TONE_ACCENT_MAP: Record<string, string> = {
  blue: '#4f7cff',
  cyan: '#2bb8c8',
  green: '#3ea778',
  purple: '#7568ff',
  amber: '#d89a3d',
};

/** 组件工作台预览数据。 */
export const COMPONENT_PREVIEW_ROWS = [
  { name: 'YTable', scene: '数据列表', status: '稳定', tone: 'blue' },
  { name: 'YFormily', scene: 'Schema 表单', status: '核心', tone: 'cyan' },
  { name: 'YTree', scene: '树形筛选', status: '稳定', tone: 'green' },
] as const;

/** 组件展厅左侧目录节点。 */
export const COMPONENT_TREE_NODES = ['页面容器', '数据展示', '表单录入', '业务反馈'] as const;

/** 组件展厅业务表格数据。 */
export const COMPONENT_SHOWCASE_ROWS = [
  { name: '客户主数据治理', owner: '数据平台主管', status: '运行中', progress: '86%' },
  { name: '指标口径管理', owner: '产品研发组', status: '待验收', progress: '64%' },
  { name: '资产目录升级', owner: '应用交付组', status: '已完成', progress: '100%' },
] as const;

/** 组件展厅近七日交付趋势。 */
export const COMPONENT_DELIVERY_TREND = [
  { label: '周一', value: 54 },
  { label: '周二', value: 68 },
  { label: '周三', value: 61 },
  { label: '周四', value: 82 },
  { label: '周五', value: 74 },
  { label: '周六', value: 91 },
  { label: '今日', value: 100 },
] as const;

/** 组件展厅 Schema 表单字段。 */
export const COMPONENT_FORM_FIELDS = ['方案名称', '业务域', '交付日期'] as const;

/** Hooks 代码预览。 */
export const HOOK_CODE_LINES = [
  'const { tableHeight, isReady } =',
  '  useTableHeight(tableAreaRef, {',
  '    withPagination: true,',
  '    withToolbar: true,',
  '  });',
] as const;

/** Hooks 展厅的真实公开能力。 */
export const HOOK_MECHANICS = [
  { key: 'table', label: 'useTableHeight', detail: '表格高度' },
  { key: 'tree', label: 'useTreeHeight', detail: '树区域高度' },
  { key: 'fullscreen', label: 'useFullscreen', detail: '全屏状态' },
  { key: 'loading', label: 'useLoading', detail: '异步加载态' },
] as const;

/** Utils 动作预览。 */
export const UTILITY_ACTIONS = [
  { key: 'format', label: '格式化', detail: '日期与业务字段' },
  { key: 'download', label: '下载', detail: 'Blob 与文件流' },
  { key: 'auth', label: '鉴权', detail: '认证信息管理' },
  { key: 'link', label: 'URL', detail: '参数解析与过滤' },
  { key: 'copy', label: '剪贴板', detail: '安全复制与降级' },
] as const;

/** Utils 展厅输入与输出示例。 */
export const UTILITY_RESULT_ROWS = [
  { label: 'createdAt', value: '2026-08-11 10:30:00' },
  { label: 'fileName', value: '交付清单.xlsx' },
  { label: 'workspace', value: 'product-center' },
] as const;

/** AI 生态三条集成通道（Skills / MCP / LLMs.txt）。 */
export const AI_CHANNELS = [
  {
    key: 'skills',
    name: 'Skills 技能同步',
    detail: '30 个开发规范常驻项目，AI 按标准骨架生成',
    command: 'npx @yss-ui/skills-cli sync',
    level: '必装',
    levelKey: 'must',
  },
  {
    key: 'mcp',
    name: 'MCP Server 查询',
    detail: '编码时按需精准查询组件 API 与 Demo 源码',
    command: 'npx -y @yss-ui/mcp install',
    level: '推荐搭配',
    levelKey: 'plus',
  },
  {
    key: 'llms',
    name: 'LLMs.txt 全量文档',
    detail: '全量文档一次性喂给 AI，任何工具都能接入',
    command: 'GET /llms-full.txt',
    level: '兜底',
    levelKey: 'backup',
  },
] as const;

/** AI 会话演示：三条通道协同生成一个标准列表页。 */
export const AI_SESSION_LINES = [
  { key: 'prompt', kind: 'prompt', source: 'YOU', text: '生成一个标准列表页' },
  { key: 'skill', kind: 'call', source: 'SKILL', text: '命中 page-list-module 开发规范' },
  { key: 'docs', kind: 'call', source: 'MCP', text: 'get_component_docs · YTable 真实 API' },
  { key: 'demo', kind: 'call', source: 'MCP', text: 'get_demo · table/action 官方示例' },
  { key: 'gen', kind: 'result', source: 'AGENT', text: '生成 index.vue · hooks · style.less' },
] as const;

/** 首页数据指标带。 */
export const HOME_STATS = [
  { key: 'components', value: 13, suffix: '+', label: '企业级业务组件', detail: '表格 · 表单 · 图表' },
  { key: 'hooks', value: 6, suffix: '', label: '页面级 Hooks', detail: '高度 · 全屏 · 加载态' },
  { key: 'skills', value: 30, suffix: '', label: 'AI Skills 规范', detail: '触发评测 + 安全扫描' },
  { key: 'mcp', value: 7, suffix: '', label: 'MCP 查询工具', detail: '离线索引 · 版本对齐' },
  { key: 'demos', value: 171, suffix: '+', label: '官方 Demo 索引', detail: 'AI 可直接取用源码' },
] as const;

/** 首页快速接入：新建微应用路径（一条命令）。 */
export const HOME_CREATE_APP_STEP = {
  key: 'create-app',
  title: '新建微应用工程',
  badge: '一键脚手架',
  detail: '秒级生成 Vue 3 + TypeScript + qiankun 标准子应用骨架，已内置组件库与 AI 研发生态。',
  command: 'npm create yss-app@latest',
  link: '/guide/create-app',
  linkText: '微应用 CLI 指南',
} as const;

/** 首页快速接入的三条命令（已有项目接入路径）。 */
export const HOME_QUICKSTART_STEPS = [
  {
    key: 'install',
    title: '安装组件库',
    detail: 'Vue 3 + Ant Design Vue 项目即装即用，13+ 企业级业务组件。',
    command: 'pnpm add @yss-ui/components',
    link: '/guide/installation',
    linkText: '安装指南',
  },
  {
    key: 'skills',
    title: '同步 AI Skills',
    detail: '30 个开发规范装进项目，AI 生成代码时自动按标准骨架执行。',
    command: 'npx @yss-ui/skills-cli sync',
    link: '/guide/ai-skills',
    linkText: 'Skills 指南',
  },
  {
    key: 'mcp',
    title: '接入 MCP 查询',
    detail: 'AI 编码时按需精准查询真实组件 API 与官方 Demo 源码。',
    command: 'npx -y @yss-ui/mcp install',
    link: '/guide/mcp',
    linkText: 'MCP 指南',
  },
] as const;

/** MCP 一键安装器覆盖的 AI 工具清单。 */
export const HOME_AI_TOOLS = [
  { name: 'Cursor', kind: 'IDE' },
  { name: 'Claude Code', kind: 'CLI' },
  { name: 'Codex', kind: 'CLI / IDE' },
  { name: 'Antigravity', kind: 'IDE' },
  { name: 'Windsurf', kind: 'IDE' },
  { name: 'Trae', kind: 'IDE' },
  { name: 'Qoder', kind: 'IDE' },
  { name: 'Kiro', kind: 'IDE' },
  { name: 'VS Code Copilot', kind: '插件' },
  { name: 'Cline', kind: '插件' },
  { name: 'Gemini CLI', kind: 'CLI' },
  { name: 'Copilot CLI', kind: 'CLI' },
] as const;

/** 首页版本动态（由 scripts/generate-home-releases.js 在构建期从 docs/changelog 自动提取生成）。 */
export const HOME_RELEASES: readonly HomeReleaseItem[] = generatedReleases as HomeReleaseItem[];

/** 将十六进制颜色转换成 RGB 通道。 */
export const toRgb = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map(char => char + char)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '79 124 255';

  const value = Number.parseInt(full, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
};

/** 判断卡片链接是否为外部地址。 */
export const isExternalLink = (link?: string): boolean => Boolean(link && /^(\w+:)\/\/|^(mailto|tel):/.test(link));

/** 获取卡片布局层级并兼容旧数据。 */
export const resolveVariant = (card: FeatureCard, index: number): FeatureCardVariant => {
  if (card.variant) return card.variant;
  if (index === 0) return 'anchor';
  if (index === 3) return 'workflow';
  return 'support';
};

/** 获取卡片预览类型并兼容旧数据。 */
export const resolvePreview = (card: FeatureCard, index: number): FeatureCardPreview => {
  if (card.preview) return card.preview;
  return (['component-table', 'hook-code', 'utility-actions', 'skill-flow'] as const)[index] || 'component-table';
};
