/** Footer 链接数据。 */
export interface FooterLink {
  label: string;
  href: string;
  description?: string;
  external?: boolean;
}

/** Footer 资源分组。 */
export interface FooterSection {
  key: 'guides' | 'dependencies' | 'network';
  title: string;
  eyebrow: string;
  description: string;
  links: FooterLink[];
}

/** Footer 资源目录数据。 */
export const FOOTER_SECTIONS: FooterSection[] = [
  {
    key: 'guides',
    title: '指南与生态',
    eyebrow: 'Guides',
    description: '从接入到页面交付，快速找到对应文档。',
    links: [
      { label: '快速上手', href: '/guide', description: '安装、配置与首个页面' },
      { label: '基础组件', href: '/components/button', description: '组件示例与 API 索引' },
      { label: 'Hooks API', href: '/hooks', description: '页面骨架与复用逻辑' },
      { label: 'AI 开发辅助', href: '/skills', description: '可调用的研发工作流' },
    ],
  },
  {
    key: 'dependencies',
    title: '核心依赖',
    eyebrow: 'Dependencies',
    description: '了解 YSS UI 背后的表单与组件能力。',
    links: [
      {
        label: 'Formily 官网',
        href: 'https://formilyjs.org/zh-CN/',
        description: '表单解决方案与生态',
        external: true,
      },
      {
        label: 'Formily Core 引擎',
        href: 'https://core.formilyjs.org/zh-CN/',
        description: '响应式表单核心',
        external: true,
      },
      {
        label: 'Ant Design Vue 适配器',
        href: 'https://antdv.formilyjs.org/guide/',
        description: '组件库适配层',
        external: true,
      },
      {
        label: 'Vue 框架绑定层',
        href: 'https://vue.formilyjs.org/api/components/field.html',
        description: 'Vue 3 字段与状态绑定',
        external: true,
      },
    ],
  },
  {
    key: 'network',
    title: '友情链接',
    eyebrow: 'Network',
    description: '深入查阅相关组件库与工程工具。',
    links: [
      {
        label: '前端研发体系官网',
        href: 'https://iamyancong.github.io/',
        description: 'YSS UI、脚手架、雨燕平台与演进路线',
        external: true,
      },
      {
        label: 'Ant Design Vue',
        href: 'https://www.antdv.com/components/button-cn',
        description: 'Vue 企业级 UI 组件库',
        external: true,
      },
      {
        label: 'Vxe Table V4',
        href: 'https://vxetable.cn/#/',
        description: '高性能 Vue 表格方案',
        external: true,
      },
      {
        label: 'Vite 官方中文文档',
        href: 'https://cn.vitejs.dev/',
        description: '下一代前端开发与构建工具',
        external: true,
      },
    ],
  },
];

/** 文档页 Footer 标题文案。 */
export interface FooterDocsHeading {
  title: string;
  description: string;
}

/**
 * 文档页 Footer 标题按板块场景切换：
 * 指南页正文即"快速上手"，Footer 标题改为引导读者走向组件与 Hooks，避免同屏重复。
 */
export const FOOTER_DOCS_HEADINGS: Record<'guide' | 'default', FooterDocsHeading> = {
  guide: {
    title: '读完指南，开始构建',
    description: '组件、Hooks 与 AI Skills，都在这一份资源目录。',
  },
  default: {
    title: '快速上手，持续集成',
    description: '文档、依赖与工程生态，集中于同一个资源目录。',
  },
};

/** 首页 Footer 滚动带条目，tone 对应四条产品线的章节色。 */
export interface FooterMarqueeItem {
  label: string;
  tone: 'blue' | 'cyan' | 'green' | 'purple';
}

/** 首页 Footer 滚动带展示的产品能力关键词。 */
export const FOOTER_MARQUEE_ITEMS: FooterMarqueeItem[] = [
  { label: 'YTable', tone: 'blue' },
  { label: 'YFormily', tone: 'blue' },
  { label: 'YEditTable', tone: 'blue' },
  { label: 'YTree', tone: 'blue' },
  { label: 'YSheet', tone: 'blue' },
  { label: 'YEcharts', tone: 'blue' },
  { label: 'YMonaco', tone: 'blue' },
  { label: 'useTableHeight', tone: 'cyan' },
  { label: 'useTreeHeight', tone: 'cyan' },
  { label: 'useFullscreen', tone: 'cyan' },
  { label: 'useLoading', tone: 'cyan' },
  { label: 'formatDate', tone: 'green' },
  { label: 'downloadBlob', tone: 'green' },
  { label: 'copyToClipboard', tone: 'green' },
  { label: '20+ AI Skills', tone: 'purple' },
];

/** 当前版权年份。 */
export const CURRENT_YEAR = new Date().getFullYear();
