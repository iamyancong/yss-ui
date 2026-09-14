#!/usr/bin/env node

/**
 * 测试覆盖矩阵生成脚本。
 *
 * 扫描 packages/{components,hooks,utils,theme} 下各模块与组件源码，
 * 探测对应的单元测试文件（__tests__/*.test.ts），并融合读取 Vitest
 * 生成的 coverage/coverage-summary.json（若存在）。
 *
 * 产出物：
 * 1. docs/guide/test-coverage.md：供 Dumi 渲染的测试覆盖矩阵与健康度看板。
 * 2. packages/mcp/data/coverage-summary.json：供 @yss-ui/mcp 离线查询。
 *
 * 容错设计：
 * 若 coverage-summary.json 缺失，自动降级为静态测试文件探测矩阵，绝不阻断构建流程。
 */

const fs = require('fs');
const path = require('path');

/** 仓库根目录。 */
const ROOT_DIR = path.join(__dirname, '..');

/** 覆盖率汇总文件路径。 */
const COVERAGE_SUMMARY_PATH = path.join(ROOT_DIR, 'coverage/coverage-summary.json');

/** 输出 Markdown 文档路径。 */
const OUTPUT_MD_PATH = path.join(ROOT_DIR, 'docs/guide/test-coverage.md');

/** 输出 MCP 数据文件路径。 */
const OUTPUT_JSON_PATH = path.join(ROOT_DIR, 'packages/mcp/data/coverage-summary.json');

/** 扫描包配置。 */
const PACKAGES_CONFIG = [
  {
    name: 'components',
    title: 'UI 组件（@yss-ui/components）',
    srcDir: path.join(ROOT_DIR, 'packages/components/src'),
    prefix: 'packages/components/src',
    mode: 'directory',
  },
  {
    name: 'hooks',
    title: 'Composables（@yss-ui/hooks）',
    srcDir: path.join(ROOT_DIR, 'packages/hooks/src'),
    prefix: 'packages/hooks/src',
    mode: 'directory',
  },
  {
    name: 'utils',
    title: '工具函数（@yss-ui/utils）',
    srcDir: path.join(ROOT_DIR, 'packages/utils/src'),
    prefix: 'packages/utils/src',
    mode: 'flat',
  },
  {
    name: 'theme',
    title: '主题规范（@yss-ui/theme）',
    srcDir: path.join(ROOT_DIR, 'packages/theme/src'),
    prefix: 'packages/theme/src',
    mode: 'flat',
  },
];

/**
 * 递归收集目录下的测试文件。
 *
 * @param {string} dirPath 目录路径
 * @returns {string[]} 相对路径列表
 */
function findTestFiles(dirPath) {
  const testFiles = [];
  if (!fs.existsSync(dirPath)) return testFiles;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      testFiles.push(...findTestFiles(fullPath));
    } else if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
      testFiles.push(path.relative(ROOT_DIR, fullPath));
    }
  }
  return testFiles;
}

/**
 * 扫描模块并提取测试与覆盖率指标。
 *
 * @param {object|null} rawCoverage 原始 coverage-summary.json 数据
 * @returns {object} 矩阵汇总数据
 */
function buildMatrix(rawCoverage) {
  const result = {
    generatedAt: new Date().toISOString(),
    hasCoverageReport: Boolean(rawCoverage && rawCoverage.total),
    totalMetrics: rawCoverage?.total
      ? {
          lines: rawCoverage.total.lines.pct,
          statements: rawCoverage.total.statements.pct,
          functions: rawCoverage.total.functions.pct,
          branches: rawCoverage.total.branches.pct,
        }
      : null,
    packages: [],
  };

  for (const pkg of PACKAGES_CONFIG) {
    if (!fs.existsSync(pkg.srcDir)) continue;

    const modules = [];
    const entries = fs.readdirSync(pkg.srcDir, { withFileTypes: true });

    // 收集 package 顶层 __tests__ 测试文件
    const topTestsDir = path.join(pkg.srcDir, '__tests__');
    const topTests = fs.existsSync(topTestsDir) ? findTestFiles(topTestsDir) : [];

    if (pkg.mode === 'directory') {
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__tests__') {
          continue;
        }

        if (entry.isDirectory()) {
          const moduleName = entry.name;
          const moduleDir = path.join(pkg.srcDir, moduleName);
          const ownTests = findTestFiles(moduleDir);

          // 匹配顶层 __tests__ 中与该模块名相关的测试文件
          const matchedTopTests = topTests.filter(t =>
            path.basename(t).toLowerCase().includes(moduleName.toLowerCase())
          );
          const testFiles = Array.from(new Set([...ownTests, ...matchedTopTests]));

          let linesTotal = 0;
          let linesCovered = 0;
          let branchesTotal = 0;
          let branchesCovered = 0;
          let functionsTotal = 0;
          let functionsCovered = 0;
          let sourceFileCount = 0;

          if (rawCoverage) {
            for (const [filePath, stats] of Object.entries(rawCoverage)) {
              if (filePath === 'total') continue;
              const relPath = path.relative(ROOT_DIR, filePath);
              if (relPath.startsWith(path.join(pkg.prefix, moduleName))) {
                if (stats.lines) {
                  linesTotal += stats.lines.total || 0;
                  linesCovered += stats.lines.covered || 0;
                }
                if (stats.branches) {
                  branchesTotal += stats.branches.total || 0;
                  branchesCovered += stats.branches.covered || 0;
                }
                if (stats.functions) {
                  functionsTotal += stats.functions.total || 0;
                  functionsCovered += stats.functions.covered || 0;
                }
                sourceFileCount += 1;
              }
            }
          }

          const linePct = linesTotal > 0 ? Number(((linesCovered / linesTotal) * 100).toFixed(2)) : 0;
          const branchPct = branchesTotal > 0 ? Number(((branchesCovered / branchesTotal) * 100).toFixed(2)) : 0;
          const functionPct = functionsTotal > 0 ? Number(((functionsCovered / functionsTotal) * 100).toFixed(2)) : 0;

          modules.push({
            name: moduleName,
            path: path.relative(ROOT_DIR, moduleDir),
            testFiles,
            testCount: testFiles.length,
            sourceFileCount,
            lines: { total: linesTotal, covered: linesCovered, pct: linePct },
            branches: { total: branchesTotal, covered: branchesCovered, pct: branchPct },
            functions: { total: functionsTotal, covered: functionsCovered, pct: functionPct },
            hasTest: testFiles.length > 0,
          });
        }
      }
    } else {
      // flat 平铺模式：按单个文件统计
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(ts|vue|js)$/.test(entry.name) || entry.name.includes('.d.ts')) {
          continue;
        }

        const fileName = entry.name;
        const baseName = fileName.replace(/\.(ts|vue|js)$/, '');
        if (baseName === 'index') continue; // 忽略仅导出入口

        const filePath = path.join(pkg.srcDir, fileName);
        const relFilePath = path.relative(ROOT_DIR, filePath);

        // 查找测试文件中是否包含此模块
        const matchedTopTests = topTests.filter(t => path.basename(t).toLowerCase().includes(baseName.toLowerCase()));

        let linesTotal = 0;
        let linesCovered = 0;
        let branchesTotal = 0;
        let branchesCovered = 0;
        let functionsTotal = 0;
        let functionsCovered = 0;

        if (rawCoverage) {
          for (const [covPath, stats] of Object.entries(rawCoverage)) {
            if (covPath === 'total') continue;
            if (path.relative(ROOT_DIR, covPath) === relFilePath) {
              linesTotal = stats.lines?.total || 0;
              linesCovered = stats.lines?.covered || 0;
              branchesTotal = stats.branches?.total || 0;
              branchesCovered = stats.branches?.covered || 0;
              functionsTotal = stats.functions?.total || 0;
              functionsCovered = stats.functions?.covered || 0;
              break;
            }
          }
        }

        const linePct = linesTotal > 0 ? Number(((linesCovered / linesTotal) * 100).toFixed(2)) : 0;
        const branchPct = branchesTotal > 0 ? Number(((branchesCovered / branchesTotal) * 100).toFixed(2)) : 0;
        const functionPct = functionsTotal > 0 ? Number(((functionsCovered / functionsTotal) * 100).toFixed(2)) : 0;

        modules.push({
          name: baseName,
          path: relFilePath,
          testFiles: matchedTopTests,
          testCount: matchedTopTests.length,
          sourceFileCount: 1,
          lines: { total: linesTotal, covered: linesCovered, pct: linePct },
          branches: { total: branchesTotal, covered: branchesCovered, pct: branchPct },
          functions: { total: functionsTotal, covered: functionsCovered, pct: functionPct },
          hasTest: matchedTopTests.length > 0,
        });
      }
    }

    result.packages.push({
      id: pkg.name,
      title: pkg.title,
      modules: modules.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return result;
}

/**
 * 确定覆盖率状态 Badge。
 *
 * @param {object} mod 模块信息
 * @param {boolean} hasReport 是否有真实报告
 * @returns {string} 状态文案
 */
function getStatusBadge(mod, hasReport) {
  if (!hasReport) {
    return mod.hasTest ? '`✅ 已有单测`' : '`🔴 缺失单测`';
  }
  if (mod.lines.pct >= 80) return '`🟢 优秀 (' + mod.lines.pct + '%)`';
  if (mod.lines.pct >= 50) return '`🟡 良好 (' + mod.lines.pct + '%)`';
  if (mod.lines.pct > 0) return '`🟠 偏低 (' + mod.lines.pct + '%)`';
  return mod.hasTest ? '`🟠 未统计 (' + mod.testCount + '测)`' : '`🔴 待补单测`';
}

/**
 * 生成 Markdown 页面内容。
 *
 * @param {object} matrix 矩阵数据
 * @returns {string} markdown 内容
 */
function renderMarkdown(matrix) {
  const lines = [
    '---',
    'title: 测试覆盖矩阵',
    'description: YSS UI 组件库与基础模块自动化测试覆盖率及健壮度大盘',
    'toc: content',
    '---',
    '',
    '# 测试覆盖矩阵',
    '',
    '展示 YSS UI 核心组件、Hooks 与工具模块的自动化测试（Unit / Component Test）覆盖情况。',
    '',
  ];

  if (!matrix.hasCoverageReport) {
    lines.push(
      '> 💡 **提示**：当前尚未找到 `coverage/coverage-summary.json` 覆盖率数据，已降级展示**静态单测探测视图**。在本地或 CI 执行 `pnpm test:coverage` 后重新生成即可显示精准行/分支覆盖率。',
      ''
    );
  } else if (matrix.totalMetrics) {
    lines.push(
      '## 总体覆盖率大盘',
      '',
      '| 指标类别 | 全库综合覆盖率 | 目标阈值 | 状态 |',
      '| :--- | :--- | :--- | :--- |',
      `| **行覆盖率 (Lines)** | **${matrix.totalMetrics.lines}%** | 45% | ${matrix.totalMetrics.lines >= 45 ? '✅ 达标' : '⚠️ 需提升'} |`,
      `| **分支覆盖率 (Branches)** | **${matrix.totalMetrics.branches}%** | 62% | ${matrix.totalMetrics.branches >= 62 ? '✅ 达标' : '⚠️ 需提升'} |`,
      `| **函数覆盖率 (Functions)** | **${matrix.totalMetrics.functions}%** | 48% | ${matrix.totalMetrics.functions >= 48 ? '✅ 达标' : '⚠️ 需提升'} |`,
      `| **语句覆盖率 (Statements)** | **${matrix.totalMetrics.statements}%** | 45% | ${matrix.totalMetrics.statements >= 45 ? '✅ 达标' : '⚠️ 需提升'} |`,
      ''
    );
  }

  for (const pkg of matrix.packages) {
    lines.push(`## ${pkg.title}`, '');
    lines.push('| 模块 / 组件 | 测试文件数 | 行覆盖率 (Lines) | 分支覆盖率 (Branches) | 状态 | 测试文件清单 |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const mod of pkg.modules) {
      const status = getStatusBadge(mod, matrix.hasCoverageReport);
      const lineStr = matrix.hasCoverageReport ? `${mod.lines.pct}% (${mod.lines.covered}/${mod.lines.total})` : '-';
      const branchStr = matrix.hasCoverageReport ? `${mod.branches.pct}%` : '-';
      const testList =
        mod.testFiles.length > 0 ? mod.testFiles.map(f => `\`${path.basename(f)}\``).join('<br/>') : '*(暂无)*';

      lines.push(`| **${mod.name}** | ${mod.testCount} | ${lineStr} | ${branchStr} | ${status} | ${testList} |`);
    }
    lines.push('');
  }

  lines.push(
    '## 待补充测试清单 (Backlog)',
    '',
    '供 Maintainer 与 Coding Agent（通过 `component-testing` 技能）作为测试补充依据：',
    ''
  );

  const missingTests = [];
  for (const pkg of matrix.packages) {
    for (const mod of pkg.modules) {
      if (!mod.hasTest || (matrix.hasCoverageReport && mod.lines.pct < 50)) {
        missingTests.push({ pkg: pkg.title, name: mod.name, pct: mod.lines.pct, hasTest: mod.hasTest });
      }
    }
  }

  if (missingTests.length === 0) {
    lines.push('🎉 全量组件与模块测试状态良好，无严重覆盖盲区！');
  } else {
    for (const item of missingTests) {
      const reason = !item.hasTest ? '尚未建立单测' : `行覆盖率偏低 (${item.pct}%)`;
      lines.push(`- **${item.name}**（${item.pkg}）：${reason}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/** 主执行函数。 */
function main() {
  let rawCoverage = null;
  if (fs.existsSync(COVERAGE_SUMMARY_PATH)) {
    try {
      rawCoverage = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY_PATH, 'utf8'));
    } catch (e) {
      console.warn('⚠️ 读取 coverage-summary.json 失败，降级为静态模式:', e.message);
    }
  }

  const matrix = buildMatrix(rawCoverage);

  // 1. 输出 Markdown 文档
  fs.mkdirSync(path.dirname(OUTPUT_MD_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_MD_PATH, renderMarkdown(matrix), 'utf8');
  console.log(`✅ 已生成测试覆盖矩阵文档: ${path.relative(ROOT_DIR, OUTPUT_MD_PATH)}`);

  // 2. 输出 MCP JSON 数据
  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(matrix, null, 2), 'utf8');
  console.log(`✅ 已生成 MCP 测试覆盖率快照: ${path.relative(ROOT_DIR, OUTPUT_JSON_PATH)}`);
}

main();
