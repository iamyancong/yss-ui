# @yss-ui/skills-cli

YSS UI AI Skills 同步与 IDE 适配 CLI：一键拉取最新开发技能规范（`@yss-ui/skills`），自动配置到业务项目及各主流 AI IDE。

## 为什么需要它

在 AI 辅助开发中，规范分散、IDE 繁多、配置手动维护繁琐是常见痛点：
- 不同的 AI IDE（Codex、Antigravity、Cursor、Claude Code、Trae 等）读取 Skills 的路径各不相同；
- 团队成员难以确保本地 AI 技能与组件库最新发版保持一致；
- 手动配置 `.cursorrules` 或 `.agents/rules` 容易遗漏关键约束。

`@yss-ui/skills-cli`（命令 `yss-skills`）提供**全自动、跨 IDE、零配置**的技能同步方案：
1. **自动拉取**：从 NPM Registry（公网或企业私服）下载最新 `@yss-ui/skills`；
2. **规范主仓**：将业务技能同步至 `.agents/skills/`（AI Coding Agent 标准规范主目录）；
3. **多 IDE 适配**：按 Skill 粒度自动为 `.cursor/skills`、`.claude/skills`、`.trae/skills`、`.agent/skills` 建立安全软链接（Windows 降级为拷贝），绝不覆盖或删除用户自建的第三方 Skills；
4. **规则注入**：自动更新 `.cursorrules` 与 `.agents/rules/yss-ai-skills.md` 发现入口；
5. **清单安全追踪**：通过 `.yss-skills-manifest.json` 跟踪已托管技能，废弃技能自动清理，非 YSS 技能安全保留。

## 快速使用

### 1. 一键同步（推荐，无需全局安装）

在你的业务前端项目根目录下直接运行：

```bash
npx -y @yss-ui/skills-cli sync
```

### 2. 全局安装使用

```bash
# 全局安装
npm install -g @yss-ui/skills-cli

# 在任何业务项目中运行
yss-skills sync
```

## CLI 命令与选项

```bash
yss-skills sync [options]
```

| 选项 | 简写 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `--force` | `-f` | `false` | 强制覆盖本地已存在的同名技能 |
| `--all` | `-a` | `false` | 同步全部技能（包含组件库维护者专用技能，如发版、文档构建等） |
| `--global` | `-g` | `false` | 同时同步至用户级全局 AI IDE 目录（`~/.agents/skills`, `~/.cursor/skills` 等） |
| `--global-only` | — | `false` | 仅同步用户级全局 AI IDE 目录，不同步当前项目 |
| `--no-links` | — | `false` | 跳过为其他 IDE 创建兼容符号链接 |
| `--local` | — | `false` | 使用本地 monorepo 中的 `packages/skills` 源码（仅供组件库维护者使用） |

> **说明**：微应用创建技能（`yss-create-microapp`）已纳入默认业务技能分类，默认执行 `sync` 即可开箱即用，无需传 `--all`。

### 常见使用示例

```bash
# 标准业务项目同步（仅同步业务向 Skills）
npx -y @yss-ui/skills-cli sync

# 强制刷新当前项目的所有 Skills 与软链
npx -y @yss-ui/skills-cli sync --force

# 同步至个人电脑全局 AI IDE（所有项目共享生效）
npx -y @yss-ui/skills-cli sync --global-only

# 组件库维护者：从本地源码同步至全局 IDE
npx -y @yss-ui/skills-cli sync --local --global-only
```

## 多 IDE 适配机制

`@yss-ui/skills-cli` 遵循单一事实源架构：

```
project-root/
├── .agents/skills/                   # 核心主目录（单一事实源）
│   ├── page-list-module/
│   ├── page-form-module/
│   └── ...
├── .cursor/skills/                   # Cursor 软链接 -> .agents/skills/*
├── .claude/skills/                   # Claude Code 软链接 -> .agents/skills/*
├── .trae/skills/                     # Trae 软链接 -> .agents/skills/*
├── .agent/skills/                    # 兼容链接
├── .cursorrules                      # 自动注入 YSS AI SKILLS 清单
└── .agents/rules/yss-ai-skills.md    # 自动注入 Antigravity / Agent Rules
```

- **非破坏性**：若 `.cursor/skills/` 目录下已有你自定义的其他技能，CLI 只管理属于 YSS UI 的技能项，不会影响其他文件。
- **跨平台支持**：macOS / Linux 默认使用相对路径符号链接；Windows 系统自动降级为安全文件拷贝。

## 企业私服配置

如果你的团队使用内网 Nexus 或 Verdaccio 私服，可通过以下方式指定源：

1. **环境变量**：
   ```bash
   YSS_SKILLS_REGISTRY=http://your-registry:8081/repository/npm-group/ npx -y @yss-ui/skills-cli sync
   ```
2. **项目级 `.npmrc`**：
   ```ini
   registry=http://your-registry:8081/repository/npm-group/
   ```

## 团队最佳协作实践

1. **Git 忽略项**：建议在业务项目的 `.gitignore` 中加入技能目录，由开发成员本地按需 sync：
   ```gitignore
   .agents/skills
   .agent/skills
   .cursor/skills
   .claude/skills
   .trae/skills
   .yss-skills-manifest.json
   ```
2. **共享规则**：将生成的 `.cursorrules` 与 `.agents/rules/` 提交至 Git 仓库，确保团队所有成员共享统一的 AI 提示词与规范入口。
