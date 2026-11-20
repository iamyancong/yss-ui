/**
 * inject-timestamps.js
 *
 * 在 Docker 构建阶段执行：
 * 读取 CI 预生成的 .file-timestamps.txt，将 lastUpdated 时间戳
 * 注入到每个 markdown 文件的 YAML frontmatter 中。
 *
 * Dumi 的 remarkMeta 插件会优先使用 frontmatter 中的 lastUpdated，
 * 从而完全不依赖 .git 目录。
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const TIMESTAMPS_FILE = path.join(ROOT_DIR, '.file-timestamps.txt');

/**
 * 解析时间戳文件
 * @returns {Map<string, number>} 文件路径 -> 时间戳（毫秒）的映射
 */
const parseTimestamps = () => {
  const map = new Map();

  if (!fs.existsSync(TIMESTAMPS_FILE)) {
    console.log('⚠️  未找到 .file-timestamps.txt，跳过时间戳注入');
    return map;
  }

  const content = fs.readFileSync(TIMESTAMPS_FILE, 'utf-8').trim();

  if (!content) {
    return map;
  }

  for (const line of content.split('\n')) {
    const [filePath, tsStr] = line.split('|');
    if (filePath && tsStr) {
      // git log --format=%at 返回秒级时间戳，dumi 需要毫秒级
      map.set(filePath, parseInt(tsStr, 10) * 1000);
    }
  }

  return map;
};

/**
 * 为 markdown 文件注入 lastUpdated 到 frontmatter
 * @param {string} filePath - 文件相对路径
 * @param {number} timestampMs - 毫秒级时间戳
 */
const injectTimestamp = (filePath, timestampMs) => {
  const absPath = path.join(ROOT_DIR, filePath);

  if (!fs.existsSync(absPath)) {
    return;
  }

  let content = fs.readFileSync(absPath, 'utf-8');

  // 检查是否已有 frontmatter
  if (content.startsWith('---')) {
    // 已有 frontmatter，在结束标记前插入 lastUpdated
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      const frontmatter = content.substring(3, endIndex);

      // 如果已经有 lastUpdated，替换它
      if (/lastUpdated\s*:/.test(frontmatter)) {
        const updatedFm = frontmatter.replace(/lastUpdated\s*:\s*\d+/, `lastUpdated: ${timestampMs}`);
        content = `---${updatedFm}---${content.substring(endIndex + 3)}`;
      } else {
        // 没有 lastUpdated，在 frontmatter 末尾追加
        content = `---${frontmatter}lastUpdated: ${timestampMs}\n---${content.substring(endIndex + 3)}`;
      }
    }
  } else {
    // 没有 frontmatter，创建一个
    content = `---\nlastUpdated: ${timestampMs}\n---\n${content}`;
  }

  fs.writeFileSync(absPath, content, 'utf-8');
};

/**
 * 主函数：读取时间戳并注入到所有文档
 */
const main = () => {
  console.log('📅 正在注入 lastUpdated 时间戳到文档 frontmatter...');

  const timestamps = parseTimestamps();

  if (timestamps.size === 0) {
    console.log('⚠️  没有时间戳数据，跳过注入');
    return;
  }

  let injected = 0;

  for (const [filePath, ts] of timestamps) {
    injectTimestamp(filePath, ts);
    injected++;
  }

  console.log(`✅ 已为 ${injected} 个文档注入 lastUpdated 时间戳`);
};

main();
