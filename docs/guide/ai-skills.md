---
title: AI 工具集成（Skills 技能同步）
description: 把 YSS UI 开发规范同步到业务项目，让 AI 按标准骨架生成代码
toc: content
---

# Skills 技能同步

把 30+ 个 YSS UI 开发技能规范（SKILL.md）同步进业务项目，AI 生成代码时自动按规范执行——**这是三种 AI 集成方式中优先级最高的一个，所有用 AI 写 YSS UI 业务代码的项目都应安装**。

## 三种集成方式怎么选

| 方式 | 一句话定位 | 何时使用 |
| --- | --- | --- |
| **Skills 技能同步**（本页） | 把开发规范装进项目，AI 生成代码时按需触发标准骨架与硬约束 | 必装，所有 AI 辅助开发的业务项目 |
| [MCP Server 查询](/guide/mcp) | AI 编码时按需精准查询组件 API、Demo 源码 | 推荐搭配，工具支持 MCP 时启用 |
| [LLMs.txt 全量文档](/guide/llms) | 把全量文档一次性喂给 AI | 兜底，工具不支持 MCP / 临时会话 |

三者不冲突：**Skills 管"怎么写才对"（规范），MCP 管"API 到底长什么样"（数据），LLMs.txt 是无法使用前两者时的替代**。推荐组合 = Skills + MCP。

## 什么是 Skills

每个 skill 是一份带触发条件的开发规范（`SKILL.md`），包含六个标准章节：触发条件、不适用场景、硬约束（禁止/必须）、标准代码骨架、交付检查清单、失败兜底策略。例如：

- `page-list-module`：标准列表页（查询重置、远程分页、YTable 工具栏、批量操作）；
- `page-form-module`：新增/编辑/查看表单模块（mode 0/1/2、数据回显、弹窗销毁、列表刷新）；
- `yss-formily` + formily 四件套：表单基础 / 联动 / 三态插槽 / 分步流程；
- `api-integration`：Orval API 对接（mutator 错误契约、长整型精度）；
- `theme-token-usage`：主题 Token 与换肤（禁止硬编码色值）；
- `yss-create-microapp`：新建本地微应用（已纳入默认同步，一键生成标准微前端子应用骨架）。

完整清单与内容见 [Skills 文档区](/skills)。所有 skill 经过仓库级质量门禁（结构校验、触发路由评测、安全扫描）后才会发布。

## 安装与同步

### 方式一：通过官方 npm CLI 同步（推荐业务项目全量集成）

在业务项目根目录执行：

```bash
npx @yss-ui/skills-cli sync
```

### 方式二：通过 skills.sh 公开分发安装（跨生态 / 独立安装）

支持通过 Vercel 维护的开源规范 [skills.sh](https://www.skills.sh) 安装官方业务技能：

```bash
# 安装全量公开业务技能
npx skills add iamyancong/yss-ui-skills

# 仅安装顶层脚手架技能
npx skills add iamyancong/yss-ui-skills --skill create-yss-app

# 仅安装前端业务开发编排总线
npx skills add iamyancong/yss-ui-skills --skill yss-frontend-dev
```

CLI 同步命令包含以下完整处理流程：

1. 从 npm registry（公网或内网私服）拉取最新 `@yss-ui/skills` 包；
2. 同步业务向技能到 `.agents/skills/`（Codex / Agent Skills 标准主目录）；
3. 自动更新 `.cursorrules` 中的 `YSS AI SKILLS` 区块（AI 的技能发现清单）；
4. 自动更新 `.agents/rules/`（Antigravity 风格规则）；
5. 为兼容旧工具与其他 IDE，按 Skill 粒度创建软链：`.agent/skills`、`.cursor/skills`、`.trae/skills`、`.claude/skills`（Windows 降级为拷贝），不会删除目标目录中的第三方 Skills。

常用选项：

| 选项 | 说明 |
| --- | --- |
| `--force` / `-f` | 强制覆盖本地已存在的同名技能 |
| `--all` / `-a` | 同步全部技能（含组件库维护者专用技能，业务项目一般不需要） |
| `--local` | 使用 yss-ui monorepo 当前 `packages/skills`，仅供源码仓库维护者使用 |
| `--global` / `-g` | 同时更新 Codex / Agents、Cursor、Claude 与 Trae 的用户级 Skills 目录 |
| `--global-only` | 只更新用户级 AI IDE 目录，隐含 `--global` |
| `--no-links` | 跳过为其他 IDE 创建软链 |

> **建议**：把 `.agents/skills`、`.agent/skills`、`.cursor/skills`、`.trae/skills`、`.claude/skills` 加入业务项目的 `.gitignore`，让每位成员本地各自 sync；`.cursorrules` 则提交进仓库共享。

> 从旧版升级时，CLI 会保留 `.agent/skills` 作为兼容链接。仅当执行用户级同步时，才会根据 `.yss-skills-manifest.json` 清理旧 `~/.codex/skills` 中由 YSS CLI 管理的同名项；其他用户 Skill 不受影响。

### 组件库维护者保持本机 Skills 最新

在 yss-ui 源码仓库执行：

```bash
pnpm sync:skills:ides
```

该命令固定使用当前 `packages/skills` 作为单一事实源，并把各用户级 IDE 中的 YSS Skills 建成逐项软链。Codex 与通用 Agents 统一使用 `~/.agents/skills`，不再向 `~/.codex/skills` 重复安装。之后只要源码发生变化，各 IDE 会直接读取同一份最新内容；非 YSS Skills 不受影响。Windows 会使用覆盖拷贝，需要在源码更新后重新执行命令。

源码仓内单独执行 `pnpm sync:skills`时，会同步包括组件库维护技能在内的全部 Skills；项目级 `.agents/skills` 直接链接当前 `packages/skills`，避免在组件库内生成第二份实体副本。

## 触发机制

Codex 会直接扫描 `.agents/skills`；其他 AI 工具可读取 `.cursorrules`、`.agents/rules` 或对应兼容目录中的技能清单。当用户请求命中某个 skill 的 description 时，先读取对应 `SKILL.md` 再动手写代码。两种触发方式：

- **自动路由**：说"生成一个标准列表页"，AI 应命中 `page-list-module`；
- **显式点名**：说"按 page-form-module 的规范实现这个编辑弹窗"，强制走指定规范。

## 如何验证生效

1. **清单检查**：确认 `.cursorrules` 中存在 `YSS AI SKILLS START/END` 区块且列出技能；`.agents/skills/` 下有对应目录。
2. **触发检查**：对 AI 说"实现一个新增/编辑/查看共用的表单弹窗"，观察它是否先读取 `page-form-module/SKILL.md`（Cursor 会显示读文件记录）再生成代码。
3. **行为检查**：生成的代码应符合 skill 硬约束（如：不出现 `import './style.less'` 裸导入、不重复 `message.error`、表格用 `useTableHeight`）。若 AI 未触发，显式点名 skill 名称即可。

## 更新与版本

`@yss-ui/skills` 随组件库发版更新（见 [Skills 更新日志](/changelog/skills)）。业务项目每次执行 `npx @yss-ui/skills-cli sync` 都会从 registry 获取最新包；同步器通过清单自动清理已移除的 YSS Skills，不影响其他来源的 Skills。组件库维护者使用 `pnpm sync:skills:ides` 后，用户级 IDE 目录会直接跟随仓库源码。

## 常见问题

### Q: Skills 和 MCP 的 `get_skill` 工具重复吗？

**A:** 不重复。同步到本地的 Skills 是 AI 的**常驻上下文入口**（清单写进 `.cursorrules`，无需任何工具调用即可发现）；MCP 的 `list_skills` / `get_skill` 是**查询通道**，适合未同步 Skills 的环境或跨项目查阅。两者数据同源，本地同步的触发更稳定。

### Q: 同步后 AI 仍不按规范生成？

**A:** 依次排查：`.cursorrules` 是否被工具读取（部分工具需在设置中启用 rules 文件）；请求的说法是否命中 skill 的触发词（可显式点名 skill）；会话过长时规则可能被截断，开新会话重试。
