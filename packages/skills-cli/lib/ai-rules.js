const fs = require('node:fs');
const path = require('node:path');

/**
 * 校验并规范化单份源文件文本。
 *
 * @param {string} text 源文本内容
 * @param {string} [fileName] 源文件名（用于报错提示）
 * @returns {string} 规范化后的文本
 */
function normalizeSource(text, fileName = '') {
  if (typeof text !== 'string') {
    const fileMsg = fileName ? `源文件 ${fileName}` : '源文件';
    throw new Error(`${fileMsg} 不是有效的字符串`);
  }

  // 去除 UTF-8 BOM
  let cleaned = text.replace(/^\uFEFF/, '');
  // CRLF/CR -> LF
  cleaned = cleaned.replace(/\r\n|\r/g, '\n');
  // 去除每行行尾空白字符
  cleaned = cleaned.replace(/[ \t]+$/gm, '');
  // 去除首尾连续空行
  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');

  if (!cleaned.trim()) {
    const fileMsg = fileName ? `源文件 ${fileName}` : '源文件';
    throw new Error(`${fileMsg} 内容为空`);
  }

  return cleaned;
}

/**
 * 读取 targets.json 及其引用的所有规则源文件。
 *
 * @param {string} rulesDir 规则源目录绝对路径
 * @returns {{ config: object, sources: Record<string, string> }} 规则源数据
 */
function loadRulesSource(rulesDir) {
  if (!rulesDir || !fs.existsSync(rulesDir)) {
    throw new Error(`规则源目录不存在: ${rulesDir}`);
  }

  const targetsPath = path.join(rulesDir, 'targets.json');
  if (!fs.existsSync(targetsPath)) {
    throw new Error(`找不到 targets.json 配置文件: ${targetsPath}`);
  }

  let config;
  try {
    const raw = fs.readFileSync(targetsPath, 'utf8');
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`解析 targets.json 失败: ${err.message}`);
  }

  if (!config.targets || typeof config.targets !== 'object' || Array.isArray(config.targets)) {
    throw new Error('targets.json 缺少有效的 targets 对象');
  }

  if (
    !config.marker ||
    typeof config.marker !== 'object' ||
    !config.marker.start ||
    !config.marker.end ||
    config.marker.start === config.marker.end
  ) {
    throw new Error('targets.json 缺少合法 marker 配置或 marker.start 与 marker.end 相同');
  }

  const validModes = new Set(['marker-block', 'file', 'text']);
  const neededSources = new Set();

  for (const [name, target] of Object.entries(config.targets)) {
    if (!target || typeof target !== 'object') {
      throw new Error(`Target "${name}" 配置必须为对象`);
    }

    if (!validModes.has(target.mode)) {
      throw new Error(`Target "${name}" 的 mode "${target.mode}" 无效，只支持 marker-block, file, text`);
    }

    if (target.mode === 'file' || target.mode === 'marker-block') {
      if (!target.path || typeof target.path !== 'string') {
        throw new Error(`Target "${name}" 缺少有效的 path 属性`);
      }
    }

    if (!Array.isArray(target.sources) || target.sources.length === 0) {
      throw new Error(`Target "${name}" 的 sources 为空或不是数组`);
    }

    for (const src of target.sources) {
      if (!src || typeof src !== 'string') {
        throw new Error(`Target "${name}" 的 sources 包含无效文件名`);
      }
      neededSources.add(src);
    }
  }

  const sources = {};
  for (const srcName of neededSources) {
    const srcPath = path.join(rulesDir, srcName);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Target 引用的源文件不存在: ${srcName} (${srcPath})`);
    }
    sources[srcName] = fs.readFileSync(srcPath, 'utf8');
  }

  return { config, sources };
}

/**
 * 序列化 YAML frontmatter。
 *
 * @param {Record<string, unknown>} frontmatter 元数据对象
 * @returns {string} 序列化后的 frontmatter 文本（包含头尾分隔符及尾部空行）
 */
function serializeFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') return '';

  const lines = [];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (typeof val === 'boolean' || typeof val === 'number') {
      lines.push(`${key}: ${val}`);
    } else if (typeof val === 'string') {
      const needsQuotes = /[:#"'`]|^\s|\s$/.test(val);
      lines.push(`${key}: ${needsQuotes ? JSON.stringify(val) : val}`);
    } else {
      throw new Error(`frontmatter 属性 "${key}" 的值类型不受支持: ${val === null ? 'null' : typeof val}`);
    }
  }

  if (lines.length === 0) return '';
  return `---\n${lines.join('\n')}\n---\n\n`;
}

/**
 * 渲染指定 target 的规则产物。
 *
 * @param {string} name Target 名称
 * @param {{ config: object, sources: Record<string, string> }} rulesSource 规则源数据
 * @param {{ skillRoot?: string, header?: string, frontmatter?: Record<string, unknown>, overrides?: Record<string, object>, targetOverride?: object }} [options] 渲染选项
 * @returns {string} 渲染结果字符串
 */
function renderTarget(name, { config, sources }, options = {}) {
  const availableTargets = Object.keys(config?.targets || {});
  const baseTarget = config?.targets?.[name];
  const targetOverride = options.targetOverride || (options.overrides && options.overrides[name]);

  if (!baseTarget && !targetOverride) {
    throw new Error(`未知 target: "${name}"，可用 target 包括: ${availableTargets.join(', ')}`);
  }

  const target = Object.assign({}, baseTarget, targetOverride);

  if (target.mode === 'marker-block') {
    if (target.frontmatter || options.frontmatter) {
      throw new Error('mode 为 marker-block 的 target 不支持配置 frontmatter');
    }
  }

  const normalizedParts = [];
  for (const srcName of target.sources || []) {
    const raw = sources[srcName];
    if (typeof raw !== 'string') {
      throw new Error(`未加载源文件: ${srcName}`);
    }
    normalizedParts.push(normalizeSource(raw, srcName));
  }

  let body = normalizedParts.join('\n\n');

  // 占位符替换：skillRoot
  const rawSkillRoot = options.skillRoot !== undefined ? options.skillRoot : config.skillRoot || '.agents/skills';
  const skillRoot = String(rawSkillRoot).replace(/\\/g, '/').replace(/\/+$/, '');
  body = body.split('{{skillRoot}}').join(skillRoot);

  // 占位符有效性检查：不得遗留任何 {{...}} 占位符
  const leftoverMatches = body.match(/\{\{[^}]*\}\}/g);
  if (leftoverMatches && leftoverMatches.length > 0) {
    const uniqueLeftovers = [...new Set(leftoverMatches)];
    throw new Error(`存在未解析的占位符: ${uniqueLeftovers.join(', ')}`);
  }

  // 拼接 header（放在正文前）
  const header = options.header !== undefined ? options.header : target.header;
  if (header && typeof header === 'string' && header.trim()) {
    const normHeader = normalizeSource(header, 'header');
    body = `${normHeader}\n\n${body}`;
  }

  // 拼接 frontmatter（放在最前）
  const frontmatter = options.frontmatter !== undefined ? options.frontmatter : target.frontmatter;
  if (frontmatter && typeof frontmatter === 'object' && Object.keys(frontmatter).length > 0) {
    const fmText = serializeFrontmatter(frontmatter);
    body = `${fmText}${body}`;
  }

  // marker-block 包装
  if (target.mode === 'marker-block') {
    const marker = config.marker || { start: '<!-- YSS-UI:START -->', end: '<!-- YSS-UI:END -->' };
    body = `${marker.start}\n${body}\n${marker.end}\n`;
  }

  // 确保统一以单个 \n 结尾
  return body.replace(/\n*$/, '\n');
}

/**
 * 将生成的 marker-block 写入或更新到已有文本中。
 *
 * @param {string} existing 现有文件内容
 * @param {string} block 待写入的 marker block 内容
 * @param {{ start: string, end: string }} marker 标记对象
 * @returns {string} 注入/更新后的文本内容
 */
function applyMarkerBlock(existing, block, marker) {
  if (!marker || !marker.start || !marker.end) {
    throw new Error('applyMarkerBlock 必须提供有效的 marker.start 和 marker.end');
  }

  const normalizedBlock = block.replace(/\n*$/, '\n');

  if (!existing || !existing.trim()) {
    return normalizedBlock;
  }

  const startMatches = existing.split(marker.start).length - 1;
  const endMatches = existing.split(marker.end).length - 1;

  if (startMatches >= 2 || endMatches >= 2) {
    throw new Error(`existing 内容中包含重复的 marker（start 出现 ${startMatches} 次，end 出现 ${endMatches} 次）`);
  }

  if (startMatches === 0 && endMatches === 0) {
    // 尚无标记：在末尾追加，与原内容之间恰好空一行
    const isCRLF = existing.includes('\r\n');
    const eol = isCRLF ? '\r\n' : '\n';
    const trimmedExisting = existing.replace(/(\r?\n)+$/, '');
    if (!trimmedExisting) {
      return normalizedBlock;
    }
    return `${trimmedExisting}${eol}${eol}${normalizedBlock}`;
  }

  if (startMatches === 1 && endMatches === 1) {
    const startIndex = existing.indexOf(marker.start);
    const endIndex = existing.indexOf(marker.end);

    if (endIndex < startIndex) {
      throw new Error('marker 损坏: marker.end 出现在 marker.start 之前');
    }

    let replaceEnd = endIndex + marker.end.length;
    // 如果 marker.end 后面紧随单个换行符，将其一并纳入被替换范围
    if (existing.slice(replaceEnd, replaceEnd + 2) === '\r\n') {
      replaceEnd += 2;
    } else if (existing.slice(replaceEnd, replaceEnd + 1) === '\n') {
      replaceEnd += 1;
    }

    const before = existing.slice(0, startIndex);
    const after = existing.slice(replaceEnd);
    return `${before}${normalizedBlock}${after}`;
  }

  throw new Error('marker 损坏: 仅发现 marker.start 或 marker.end 单边标记');
}

/**
 * 完整加载源并渲染指定 target 的便捷封装。
 *
 * @param {string} name Target 名称
 * @param {{ rulesDir: string, skillRoot?: string, header?: string, frontmatter?: Record<string, unknown>, overrides?: Record<string, object> }} options 选项
 * @returns {string} 渲染结果
 */
function render(name, options = {}) {
  const { rulesDir, ...renderOptions } = options;
  if (!rulesDir) {
    throw new Error('render 便捷封装必须提供 rulesDir 参数');
  }
  const rulesSource = loadRulesSource(rulesDir);
  return renderTarget(name, rulesSource, renderOptions);
}

module.exports = {
  loadRulesSource,
  normalizeSource,
  serializeFrontmatter,
  renderTarget,
  applyMarkerBlock,
  render,
};
