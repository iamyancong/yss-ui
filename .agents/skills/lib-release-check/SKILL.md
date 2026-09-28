---
name: lib-release-check
description: 在准备提交、发布或 CI 排查时执行 yss-ui 门禁检查与预检，保障 AGENTS.md 规范与 quality 全绿。
---

# 发版预检与门禁检查

## 触发条件

- 准备提交代码、准备合并 PR 或准备执行正式发版发布前。
- 运行发版 dry-run 检查待发包及 changelog 是否就绪。
- 排查本地或 CI 质量门禁（`pnpm quality`、`check:agents-size` 等）失败问题。

## 不适用场景

- 本地日常单功能开发阶段的快速试跑，无需执行全量发版预检。
- 业务微应用消费端项目的发版或依赖集成。
- 纯业务页面开发与业务逻辑调试。

## 硬约束（禁止/必须）

- **待发包预检（Dry-Run）**：
  - 必须首先通过 dry-run 检测本次涉及哪些待发包：
    ```bash
    node scripts/release-changed.js patch --dry
    ```
    （或按发版计划指定 `minor` / `major`）。
  - dry-run 输出结果中**严禁出现 `Missing changelog for package ...` 报错**；所有检测到的待发包必须在对应 `docs/changelog/*.md` 中具备目标版本的完整记录。
- **Changelog 完整性核实**：
  - 必须逐一核验各待发包对应的日志文件：`docs/changelog/components.md`、`hooks.md`、`utils.md` 等。
  - **Skills 变更强制要求**：若变更涉及 `packages/skills/**`，**必须**同步更新 `docs/changelog/skills.md` 的目标版本记录，严禁只补 components 或 mcp 日志。
  - **MCP 联动发版检查**：`@yss-ui/components` 发生发布时通常会派生驱动 `@yss-ui/mcp` 跟发，发版脚本会自动检查 mcp 索引与日志，若有运行时变更必须补齐 `docs/changelog/mcp.md`。
- **首页产品定位保护（硬约束）**：
  - `scripts/lib/home-release-positioning.js` 中的 `HOME_PRODUCT_HIGHLIGHTS` 是首页长期产品总体介绍，不是单次发版摘要。
  - 发版前及更新 changelog 时，**禁止修改 `HOME_PRODUCT_HIGHLIGHTS`**；禁止根据本次 diff 自动改写 `highlight`。
  - 只有用户明确要求“调整首页产品定位/总体介绍”时方可调整，并同步更新 `scripts/generate-home-releases.test.js` 快照。
- **AGENTS.md 尺寸门禁（CI 强制，≤ 100 行）**：
  - 仓库宪法 `AGENTS.md` 行数必须严格保持在 100 行以内。
  - 提交前必须执行：
    ```bash
    node scripts/check-agents-size.js
    ```
    严禁在 `AGENTS.md` 中堆砌百科内容，超出部分必须迁移至对应 Skill 或 `docs/`。
- **全量质量门禁（必须全绿通过）**：
  - 提交与发版前必须执行 `pnpm quality`，所有检查项必须全绿通过。
  - `pnpm quality` 集成了以下全部门禁：
    1. 代码风格：`pnpm lint:ci` 与 `pnpm lint:style:check`
    2. 类型检查：`pnpm type-check`
    3. 单元测试与覆盖率：`pnpm test:coverage`
    4. Node 原生测试套件：`pnpm test:node`
    5. 消费端打包与使用契约：`pnpm test:package-consumer` 与 `pnpm test:consumption:built`
    6. Skills 规范校验：`pnpm validate:skills`
    7. 文档规范校验：`pnpm validate:docs`
    8. Dumi 文档构建检查：`pnpm build:docs:check`

## 标准代码骨架

发版前完整预检操作流程与排查命令：

```bash
# -------------------------------------------------------------
# 步骤 1：AGENTS.md 尺寸硬约束预检（≤ 100 行）
# -------------------------------------------------------------
node scripts/check-agents-size.js

# -------------------------------------------------------------
# 步骤 2：检测待发包与更新日志预检（dry-run）
# -------------------------------------------------------------
# 默认 patch，如果为特性发布使用 minor，破坏性变更使用 major
node scripts/release-changed.js patch --dry

# 若输出提示待发包缺失 changelog，需前往 docs/changelog/<pkg>.md 补齐
# 若修改了 packages/skills，检查 docs/changelog/skills.md

# -------------------------------------------------------------
# 步骤 3：Skills 文档同步与首页快照校验
# -------------------------------------------------------------
pnpm sync:skills-docs
pnpm test:home-releases

# -------------------------------------------------------------
# 步骤 4：全量质量门禁检查（必须全绿）
# -------------------------------------------------------------
pnpm quality
```

### 标准 Changelog 块示例 (`docs/changelog/xxx.md`)

```markdown
## v1.7.5
`2026-09-28`

### ✨ Features

- **ComponentName**: 新增基础能力与插槽支持。

### 🐞 Bug Fixes

- **HookName**: 修复在特定边界条件下的状态异常。

---
```

## 交付检查清单

- [ ] 执行 `node scripts/check-agents-size.js` 检查通过，`AGENTS.md` ≤ 100 行。
- [ ] 执行 `node scripts/release-changed.js patch --dry` 识别出所有变更包，无 `Missing changelog` 报错。
- [ ] 涉及 `packages/skills/**` 的修改已同步更新 `docs/changelog/skills.md` 目标版本记录。
- [ ] 确认未修改 `scripts/lib/home-release-positioning.js` 的 `HOME_PRODUCT_HIGHLIGHTS`，`pnpm test:home-releases` 测试通过。
- [ ] 执行 `pnpm sync:skills-docs` 保持文档最新。
- [ ] 执行 `pnpm quality` 全量门禁全绿（包含 lint、type-check、test、package-consumer、validate:skills、validate:docs、build:docs:check）。
- [ ] 工作区无未暂存的临时生成文件或调试代码。

## 失败兜底策略

- **Dry-run 报告 `Missing changelog for package @yss-ui/xxx`**：
  - 观察 dry-run 输出的目标版本号（例如 `v1.7.5`），在 `docs/changelog/<pkg>.md` 顶部按标准骨架补充对应版本的改动记录。
- **`check-agents-size.js` 报错超出 100 行限制**：
  - 检查 `AGENTS.md` 中的冗余内容，将具体工作流或组件开发细节剥离到对应 Skill，保持宪法文件紧凑精炼。
- **`pnpm validate:skills` 校验报错**：
  - 运行 `node scripts/validate-skills.js` 查看具体错误输出。
  - 常见原因包括：缺少必选段落标题、frontmatter 含有非法字段、`packages/skills` 未在 `skills.config.json` 注册，或修改后未运行 `pnpm sync:skills-docs`。
- **`test:package-consumer` 或 `test:consumption:built` 报错**：
  - 检查是否缺少预打包产物，先执行 `pnpm build:packages:publishable` 重新编译后再跑测试。
- **`pnpm test:home-releases` 报错**：
  - 检查是否在生成 release 时误改了产品定位文案，执行 `git checkout scripts/lib/home-release-positioning.js` 还原。
