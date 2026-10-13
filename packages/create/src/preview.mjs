/**
 * @fileoverview 参数预览表格式化与控制台渲染。
 */

import pc from 'picocolors';
import { pathExists, resolveProjectRegistry } from './core/index.mjs';

/** 模板尚未拉取、无法预判 registry 时的展示文案。 */
export const REGISTRY_PENDING_LABEL = '以模板 .npmrc 为准';

/** 来源标识到中文的映射。 */
export const SOURCE_LABELS = {
  user: '用户指定',
  derived: '自动推导',
  default: '默认预设',
  env: '环境变量',
};

/**
 * 预判依赖对齐将使用的 registry，与生成后的实际解析规则一致：
 * npm_config_registry > 项目 .npmrc（复制自模板根目录，这里读模板缓存）> 官方源。
 *
 * @param {Record<string, any>} resolved 规范化后的配置
 * @param {Record<string, string | undefined>} [env=process.env] 环境变量
 * @returns {Promise<string>} registry 地址；模板未拉取且无环境变量时返回 REGISTRY_PENDING_LABEL
 */
export const resolvePreviewRegistry = async (resolved, env = process.env) => {
  const hasEnvRegistry = Boolean(env.npm_config_registry && env.npm_config_registry.trim());
  if (!hasEnvRegistry && !(resolved.cacheDir && (await pathExists(resolved.cacheDir)))) {
    return REGISTRY_PENDING_LABEL;
  }
  return resolveProjectRegistry(resolved.cacheDir || '', env);
};

/**
 * 格式化参数预览表格字符串。
 *
 * @param {Record<string, any>} resolved 规范化后的配置
 * @param {Record<string, 'user' | 'derived' | 'default' | 'env'>} sources 字段来源
 * @param {string} targetPath 最终生成路径
 * @param {{ registry?: string }} [options] 由 resolvePreviewRegistry 预判的 registry
 * @returns {string} 格式化后的表格字符串
 */
export const formatPreviewTable = (resolved, sources, targetPath, options = {}) => {
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
    {
      field: '依赖版本',
      value: resolved.offline
        ? 'offline 跳过'
        : resolved.syncDeps === false
          ? '跳过对齐 (保持模板原样)'
          : `生成后对齐最新 (registry: ${options.registry || REGISTRY_PENDING_LABEL})`,
      source: sources.syncDeps || 'default',
    },
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
