#!/usr/bin/env node

/**
 * Skills 静态安全扫描（Tier 1b）：确定性、零模型依赖、不执行被扫代码。
 *
 * 设计参考 awesome-llm-apps agent_skills/evals 的 skill_scanner.py，
 * 检查对齐 OWASP Agentic Skills Top 10 中与本仓库相关的攻击面：
 * 远程脚本管道执行、混淆载荷、凭据读取、环境变量倾倒、
 * 未锁版本安装、安装诱导（install lure）与「凭据 + 网络」外传组合。
 *
 * 判级约定：
 * - CRITICAL 令扫描失败（exit 1）；WARN / INFO 仅提示。
 * - Markdown 代码块与 examples/ 内的示例代码中的 WARN 降级为 INFO
 *   （说明性片段，不是给 Agent 的指令）；CRITICAL 永不降级——
 *   真实供应链攻击恰恰藏在「Prerequisites」代码块里。
 * - 行内包含 skillscan:allow 标记的行跳过（供文档描述攻击模式时抑制自匹配）。
 *
 * 用法：node scripts/scan-skills-security.js [--json]
 */

const fs = require('fs');
const path = require('path');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '..');

/** Skill 源码目录。 */
const SKILLS_DIR = path.join(ROOT_DIR, 'packages/skills');

/** 参与扫描的文件后缀。 */
const SCAN_EXTS = new Set([
  '.md',
  '.markdown',
  '.py',
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.vue',
  '.rb',
  '.pl',
  '.txt',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
]);

/** 跳过的目录名。 */
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', 'fixtures']);

/** 单文件扫描上限（字节）。 */
const MAX_FILE_BYTES = 1_000_000;

/** 抑制标记（运行时拼接，避免本文件被扫描时自匹配）。 */
const SUPPRESS_MARKER = 'skillscan' + ':allow';

/** 严重级别排序权重。 */
const SEV_RANK = { CRITICAL: 3, WARN: 2, INFO: 1 };

/**
 * 命中即告警的模式表。
 * 每项: { rx, check, severity, message }
 */
const LINE_PATTERNS = [
  // --- 远程脚本管道执行 ---
  {
    rx: /(?:curl|wget)\b[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:ba|z|da|fi)?sh\b/, // skillscan:allow
    check: 'EXEC01',
    severity: 'CRITICAL',
    message: '远程脚本直接管道进 shell 执行（curl/wget | sh）',
  },
  {
    rx: /base64\s+(?:-d|-D|--decode)\b[^\n]{0,120}\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, // skillscan:allow
    check: 'EXEC02',
    severity: 'CRITICAL',
    message: 'base64 解码结果管道进 shell 执行',
  },
  {
    rx: /\|\s*base64\s+(?:-d|-D|--decode)\b[^\n]{0,80}\|\s*(?:python3?|node|perl|ruby)\b/, // skillscan:allow
    check: 'EXEC02',
    severity: 'CRITICAL',
    message: 'base64 解码结果管道进解释器执行',
  },
  // --- 混淆载荷执行 ---
  {
    rx: /(?:\bexec|\beval|\bcompile)\s*\([^\n]{0,160}(?:b64decode|base64|fromhex|codecs\.decode|rot13)/, // skillscan:allow
    check: 'OBF02',
    severity: 'CRITICAL',
    message: '对解码数据（base64/hex/rot13）执行 exec/eval——典型分阶段载荷',
  },
  {
    rx: /(?:\beval|new\s+Function)\s*\([^\n]{0,160}(?:atob|Buffer\.from)\s*\(/, // skillscan:allow
    check: 'OBF02',
    severity: 'CRITICAL',
    message: 'JavaScript 对解码数据执行 eval/Function——典型分阶段载荷',
  },
  {
    rx: /(?:python3?|node)\s+-[ce]\s+[^\n]{0,60}(?:b64decode|base64|atob)/, // skillscan:allow
    check: 'OBF02',
    severity: 'CRITICAL',
    message: '解释器单行命令解码内嵌数据',
  },
  // --- 凭据读取 ---
  {
    rx: /~\/\.ssh\b|\/\.ssh\/|id_rsa\b|id_ed25519\b/, // skillscan:allow
    check: 'CRED01',
    severity: 'CRITICAL',
    message: '读取 SSH 密钥材料（.ssh 目录、id_rsa、id_ed25519）',
  },
  {
    rx: /\.aws\/credentials|\.aws\/config/, // skillscan:allow
    check: 'CRED01',
    severity: 'CRITICAL',
    message: '读取 AWS 凭据文件',
  },
  {
    rx: /security\s+(?:find-generic-password|find-internet-password|dump-keychain)/i,
    check: 'CRED01',
    severity: 'CRITICAL',
    message: '脚本查询 macOS 钥匙串',
  },
  {
    rx: /\.netrc\b|\.npmrc\b|\.pypirc\b/, // skillscan:allow
    check: 'CRED01',
    severity: 'WARN',
    message: '触碰含凭据的点文件（netrc/npmrc/pypirc）',
  },
  {
    rx: /dict\(os\.environ\)|os\.environ\.items\(\)|os\.environ\.copy\(\)/,
    check: 'CRED02',
    severity: 'WARN',
    message: '一次性枚举整个进程环境变量',
  },
  {
    rx: /JSON\.stringify\(process\.env\)|Object\.(?:entries|keys)\(process\.env\)/,
    check: 'CRED02',
    severity: 'WARN',
    message: '序列化整个进程环境变量',
  },
  {
    rx: /(?<![\w-])printenv\b|\benv\s*\|\s*(?:curl|nc|base64)/, // skillscan:allow
    check: 'CRED02',
    severity: 'WARN',
    message: '在 shell 中倾倒进程环境变量',
  },
  // --- 私网 IP、内部域名与敏感凭据 ---
  {
    rx: /(?<![\w.-])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?![\w.-])/, // skillscan:allow
    check: 'SEC01',
    severity: 'CRITICAL',
    message: '出现内网/私有 IP 地址（10.x.x.x / 172.16-31.x.x / 192.168.x.x）',
  },
  {
    rx: new RegExp('(?:[a-zA-Z0-9_-]+\\.)*' + 'dm' + '\\.com', 'i'), // skillscan:allow
    check: 'SEC02',
    severity: 'CRITICAL',
    message: '出现公司内部系统或代码托管/镜像域名',
  },
  {
    rx: /_authToken\s*=|npmToken\.[a-zA-Z0-9_\-]+/i, // skillscan:allow
    check: 'CRED03',
    severity: 'CRITICAL',
    message: '触碰 npm 认证 Token 或凭据字段',
  },
  // --- 未锁版本安装 ---
  {
    rx: /\bpip3?\s+install\b(?![^\n#]*(?:==|--require-hashes|-r\s|-e\s|\.\s*$))/, // skillscan:allow
    check: 'PIN01',
    severity: 'WARN',
    message: '未锁版本的 pip install——版本漂移可能引入被投毒的发布',
  },
];

/** 网络调用模式（用于未声明网络 + 外传组合判断）。 */
const NET_PATTERNS = [
  { rx: /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp|urllib3?|websockets?|socket)\b/, label: 'Python 网络库导入' },
  {
    rx: /\burllib\.request\b|\bhttp\.client\b|\bsocket\.(?:socket|create_connection)\b/,
    label: 'Python 网络 API 调用',
  },
  { rx: /\bfetch\s*\(|\baxios\b|\bXMLHttpRequest\b|new\s+WebSocket\s*\(/, label: 'JavaScript 网络 API 调用' },
  { rx: /\b(?:curl|wget)\s+(?:-[A-Za-z-]+\s+)*["']?https?:\/\//, label: 'curl/wget 调用' },
  { rx: /\b(?:nc|ncat|netcat)\s+[\w.-]+\s+\d{2,5}\b/, label: '裸 netcat 连接' },
];

/** 凭据触碰模式的 check id 集合（用于外传组合判断）。 */
const CRED_CHECKS = new Set(['CRED01', 'CRED02']);

/** 长 base64 字面量。 */
const LONG_B64_RE = /[A-Za-z0-9+/]{120,}={0,2}/g;
const HEX_ONLY_RE = /^[0-9a-fA-F]+$/;

/** 安装诱导检测：标题 + 20 行内的远程拉取命令。 */
const LURE_HEADING_RE =
  /^#{1,6}\s.*(?:prerequisite|installation|install|setup|set\s?up|before you begin|getting started|activation|activate|first run|initiali[sz]|前置条件|安装|初始化|激活|首次运行)/i;
const FETCH_CMD_RE = /\b(?:curl|wget|iwr|irm|invoke-webrequest)\b[^\n]*https?:\/\//i; // skillscan:allow

/**
 * 递归收集 skill 目录（含 SKILL.md 的目录）。
 *
 * @returns {string[]} skill 目录绝对路径列表
 */
function discoverSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
    .map(entry => path.join(SKILLS_DIR, entry.name))
    .sort();
}

/**
 * 递归收集 skill 内参与扫描的文件。
 *
 * @param {string} dirPath 目录
 * @returns {string[]} 文件绝对路径列表
 */
function collectScanFiles(dirPath) {
  const result = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      result.push(...collectScanFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SCAN_EXTS.has(ext) && path.basename(dirPath) !== 'scripts') continue;
    try {
      if (fs.statSync(fullPath).size > MAX_FILE_BYTES) continue;
    } catch {
      continue;
    }
    result.push(fullPath);
  }
  return result;
}

/**
 * 扫描单个 skill 目录。
 *
 * @param {string} skillDir skill 目录绝对路径
 * @returns {Array<object>} 告警列表
 */
function scanSkill(skillDir) {
  const skillName = path.basename(skillDir);
  const findings = [];

  const add = (check, severity, filePath, line, message, evidence) => {
    findings.push({
      skill: skillName,
      check,
      severity,
      file: path.relative(skillDir, filePath),
      line,
      message,
      evidence: String(evidence || '')
        .trim()
        .slice(0, 160),
    });
  };

  // --- SKILL.md 安装诱导检测 ---
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMdText = fs.readFileSync(skillMdPath, 'utf8');
  {
    let inFence = false;
    let lureWindowUntil = -1;
    const lines = skillMdText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineNo = i + 1;
      if (line.includes(SUPPRESS_MARKER)) continue;
      if (line.trimStart().startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (!inFence && LURE_HEADING_RE.test(line)) {
        lureWindowUntil = lineNo + 20;
      }
      if (inFence && FETCH_CMD_RE.test(line)) {
        if (lineNo <= lureWindowUntil) {
          add(
            'LURE01',
            'CRITICAL',
            skillMdPath,
            lineNo,
            '安装/前置条件章节要求拉取并执行远程脚本——供应链攻击的首要投递向量',
            line
          );
        } else {
          add('LURE02', 'WARN', skillMdPath, lineNo, 'SKILL.md 含拉取远程内容的命令，请核实目标并锁定版本', line);
        }
      }
    }
  }

  // --- 逐文件模式扫描 ---
  for (const filePath of collectScanFiles(skillDir)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(skillDir, filePath);
    const isMarkdown = /\.(?:md|markdown)$/i.test(filePath);
    const isExample = relPath.split(path.sep)[0] === 'examples';
    let fileHasNet = false;
    let fileHasCred = false;
    let inDocFence = false;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineNo = i + 1;
      if (isMarkdown && line.trimStart().startsWith('```')) {
        inDocFence = !inDocFence;
        continue;
      }
      if (line.includes(SUPPRESS_MARKER)) continue;

      // Markdown 代码块与 examples/ 中的 WARN 视为说明性片段降级为 INFO
      const illustrative = inDocFence || isExample;
      const docSeverity = severity => (illustrative && severity === 'WARN' ? 'INFO' : severity);
      const docMessage = (severity, message) =>
        illustrative && severity === 'WARN' ? `${message}（位于示例代码中，请确认仅为演示）` : message;

      for (const { rx, check, severity, message } of LINE_PATTERNS) {
        if (!rx.test(line)) continue;
        add(check, docSeverity(severity), filePath, lineNo, docMessage(severity, message), line);
        if (CRED_CHECKS.has(check)) fileHasCred = true;
      }

      for (const token of line.match(LONG_B64_RE) || []) {
        if (HEX_ONLY_RE.test(token)) continue;
        add(
          'OBF01',
          docSeverity('WARN'),
          filePath,
          lineNo,
          docMessage('WARN', `疑似 base64 编码载荷（${token.length} 字符）——编码内容会躲过人工审查，请先解码确认`),
          `${token.slice(0, 60)}...`
        );
      }

      for (const { rx, label } of NET_PATTERNS) {
        if (!rx.test(line)) continue;
        fileHasNet = true;
        if (filePath !== skillMdPath) {
          add(
            'NET01',
            illustrative ? 'INFO' : 'WARN',
            filePath,
            lineNo,
            `脚本发起网络调用（${label}）${illustrative ? '（示例代码）' : '，本仓库 skill 默认应离线运行'}`,
            line
          );
        }
      }
    }

    if (fileHasNet && fileHasCred) {
      add(
        'EXFIL01',
        'CRITICAL',
        filePath,
        0,
        '同一文件既触碰凭据/环境变量又发起网络调用——标准外传形态，请逐行审查',
        ''
      );
    }
  }

  // 去重并按严重级别排序
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = `${finding.check}|${finding.file}|${finding.line}|${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  unique.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return unique;
}

/** 执行全量 skill 安全扫描。 */
function main() {
  const asJson = process.argv.includes('--json');
  const skills = discoverSkills();
  const allFindings = [];
  for (const skillDir of skills) {
    allFindings.push(...scanSkill(skillDir));
  }

  const counts = { CRITICAL: 0, WARN: 0, INFO: 0 };
  for (const finding of allFindings) {
    counts[finding.severity] += 1;
  }

  if (asJson) {
    console.log(JSON.stringify({ skillsScanned: skills.length, findings: allFindings, summary: counts }, null, 2));
  } else {
    for (const finding of allFindings) {
      const location = finding.line
        ? `${finding.skill}/${finding.file}:${finding.line}`
        : `${finding.skill}/${finding.file}`;
      console.log(
        `[${finding.severity}] ${finding.check} ${location}\n    ${finding.message}${finding.evidence ? `\n    > ${finding.evidence}` : ''}`
      );
    }
    console.log(
      `\n共扫描 ${skills.length} 个 skill：${counts.CRITICAL} CRITICAL, ${counts.WARN} WARN, ${counts.INFO} INFO`
    );
    if (counts.CRITICAL > 0) {
      console.error('❌ 存在 CRITICAL 告警，人工逐行审查前不得同步/发布这些 skill。');
    } else {
      console.log('✅ 无 CRITICAL 告警。模式扫描通过不代表内容安全，新增 skill 仍需通读 SKILL.md。');
    }
  }
  process.exit(counts.CRITICAL > 0 ? 1 : 0);
}

main();
