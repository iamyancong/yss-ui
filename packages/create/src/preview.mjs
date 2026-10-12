/**
 * @fileoverview 参数预览表格式化与控制台渲染。
 */

import pc from 'picocolors';

/** 来源标识到中文的映射。 */
export const SOURCE_LABELS = {
  user: '用户指定',
  derived: '自动推导',
  default: '默认预设',
  env: '环境变量',
};

/**
 * 格式化参数预览表格字符串。
 *
 * @param {Record<string, any>} resolved 规范化后的配置
 * @param {Record<string, 'user' | 'derived' | 'default' | 'env'>} sources 字段来源
 * @param {string} targetPath 最终生成路径
 * @returns {string} 格式化后的表格字符串
 */
export const formatPreviewTable = (resolved, sources, targetPath) => {
  const rows = [
    {
      field: '应用中文名',
      value: String(resolved.nameZh || resolved.appNameZh || '(未设置)'),
      source: sources.nameZh || 'default',
    },
    {
      field: '应用英文名',
      value: String(resolved.name || resolved.appName || '(未设置)'),
      source: sources.name || 'default',
    },
    { field: '激活路由', value: String(resolved.activeRule || ''), source: sources.activeRule || 'default' },
    { field: '开发端口', value: String(resolved.port ?? ''), source: sources.port || 'default' },
    { field: '接口前缀', value: String(resolved.apiBase || ''), source: sources.apiBase || 'default' },
    { field: '代理目标', value: String(resolved.proxyTarget || ''), source: sources.proxyTarget || 'default' },
    { field: '项目描述', value: String(resolved.description || '(无)'), source: sources.description || 'default' },
    { field: '生成目录', value: String(targetPath || ''), source: sources.targetDir || 'default' },
  ];

  const col1Width = 14;
  const col2Width = Math.max(...rows.map(r => r.value.length), 20);
  const col3Width = 10;

  const header = `${pc.bold('配置项'.padEnd(col1Width))} ${pc.bold('配置值'.padEnd(col2Width))} ${pc.bold('来源')}`;
  const divider = '─'.repeat(col1Width + col2Width + col3Width + 4);

  const lines = rows.map(r => {
    const fieldCol = r.field.padEnd(col1Width);
    const valCol = r.value.padEnd(col2Width);
    const sourceText = SOURCE_LABELS[r.source] || r.source;
    let coloredSource = sourceText;
    if (r.source === 'user') coloredSource = pc.green(sourceText);
    else if (r.source === 'derived') coloredSource = pc.cyan(sourceText);
    else if (r.source === 'env') coloredSource = pc.yellow(sourceText);
    else coloredSource = pc.dim(sourceText);

    return `${fieldCol} ${valCol} ${coloredSource}`;
  });

  return [header, divider, ...lines].join('\n');
};
