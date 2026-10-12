---
title: 微应用创建 CLI
description: 使用 @yss-ui/create（别名 create-yss-app）快速初始化 Vue 3 + TypeScript 企业级微应用工程
toc: content
---

# 微应用创建 CLI

`@yss-ui/create`（支持别名 `create-yss-app`）是 YSS UI 官方提供的轻量级微前端子应用初始化工具。基于纯 ESM 架构设计，秒级生成开箱即用的 Vue 3 + TypeScript + Vite + qiankun 标准工程骨架。

## 快速上手

推荐使用 npm / pnpm / yarn 的内置 create 命令：

```bash
# 使用 npm
npm create yss-app@latest

# 使用 pnpm (推荐)
pnpm create yss-app

# 使用 npx 直接运行
npx @yss-ui/create
```

可直接通过位置参数传递项目英文名：

```bash
pnpm create yss-app my-order-app
```

---

## 交互式创建流程

在终端执行命令后，CLI 会启动友好的分步向导（基于 `@clack/prompts`）：

1. **应用中文名**：例如 `订单中心`、`资产管理平台`（必填）。
2. **应用英文名**：例如 `order-center`、`crm`（必填，以小写字母开头，支持中划线）。
3. **激活路由**：自动由英文名推导小驼峰路由（如 `/orderCenter`），可直接按回车采纳。
4. **本地开发端口**：默认自动从 `8081` 向上探测空闲端口，若已被占用会自动提示并推荐下一个可用端口（如 `8082`）。
5. **接口请求前缀 (apiBase)**：默认自动推导为 `/api${activeRule}`。
6. **代理目标 (proxyTarget)**：自动读取环境变量 `YSS_PROXY_TARGET` 或系统测试环境预设地址。
7. **参数预览与确认**：向导会在终端表格中完整展示所有字段、配置值与来源（用户指定、自动推导、环境变量、默认预设），经用户二次确认后开始写入。
8. **后续可选动作**：交互式询问是否立即安装依赖、同步官方 AI Skills 规范及初始化 Git 仓库。

---

## 命令行参数规格

| 参数 | 类型 | 说明与规范 | 默认值 / 推导规则 |
|---|---|---|---|
| `--name <str>` | 字符串 | 应用英文名（小写字母开头，支持数字与中划线，如 `order-center`） | 可使用首个位置参数替代 |
| `--name-zh <str>` | 字符串 | 应用中文名称（如 `订单中心`） | 交互时提问；非交互必填 |
| `--active-rule </route>` | 字符串 | 微前端激活路由，单段路径（小驼峰推荐或短横线） | 默认由 `name` 推导为小驼峰，如 `/orderCenter`；驼峰不合法时退回短横线（`app-1 → /app-1`、`crm2 → /crm-2`） |
| `--port <number>` | 数字 | 本地 Vite 启动端口（1~65535） | 默认从 8081 自动向上探测空闲端口 |
| `--api-base </api/path>` | 字符串 | 后端接口请求前缀（必须以 `/` 开头） | 默认推导为 `/api${activeRule}` |
| `--proxy-target <url>` | URL | 本地开发服务器代理目标 | 优先级：`--proxy-target` > `YSS_PROXY_TARGET` > 常量 |
| `--target-dir <dir>` | 路径 | 项目生成的父级目录 | 默认当前工作目录 `process.cwd()` |
| `--description <str>` | 字符串 | 项目描述（同步写入 `micro-config.json` 与 `package.json`） | 默认为空 |
| `--openapi-url <url>` | URL | OpenAPI JSON 文档接口地址 | 可选 |
| `-y, --yes` | 布尔 | 全自动非交互模式，未显式指定的参数均采纳推导与预设 | - |
| `--dry-run` | 布尔 | 预检解析参数与路径校验，不拉取模板、不写盘 | - |
| `--json` | 布尔 | 机器可读模式：stdout 仅输出一行 JSON，CLI 日志与模板脚本输出全部转走 stderr | - |
| `--plan-out <file>` | 路径 | 只将推导出的配置写入执行计划文件（含 sha256 防误改签名），**不拉模板、不生成项目** | - |
| `--apply <file>` | 路径 | 读取计划文件，校验签名并按当前规则重新校验全部参数后执行创建；失败一律退出码 4 | - |
| `--config <file\|->` | 路径 | 从 JSON 配置文件或标准输入读取参数 | - |
| `--install / --no-install` | 布尔 | 创建完成后是否自动安装依赖 | 交互模式询问；非交互默认否 |
| `--skills / --no-skills` | 布尔 | 创建完成后是否自动同步 `@yss-ui/skills` 规范 | 交互模式询问；非交互默认否 |
| `--git / --no-git` | 布尔 | 创建完成后是否自动初始化 Git 并生成首个 commit | 交互模式询问；非交互默认否 |
| `--pm <pnpm\|npm\|yarn>` | 字符串 | 指定包管理器，其他值退出码 2 | 默认根据 `npm_config_user_agent` 检测，兜底 pnpm |

> 参数采用严格解析：未知或拼错的参数（如 `--dryrun`）、多余的位置参数都会立即报错并以退出码 2 结束，不会静默忽略后继续拉取模板。

---

## 自动化与 AI Agent 模式

为了方便在 CI/CD 流水线、Shell 脚本或 AI Agent（如 Claude Code、Cursor、雨燕平台）中全自动调用，CLI 提供了完善的非交互与机器交互接口。

### 1. 全自动非交互模式 (`--yes`)

在非 TTY 终端或指定 `--yes` 时，CLI 自动跳过全部交互提问：

```bash
npx @yss-ui/create order-center \
  --name-zh "订单中心" \
  --yes
```

### 2. 机器模式 (`--json`)

与 `--dry-run` 或直接生成结合，stdout 输出标准 JSON：

```bash
# 预检
npx @yss-ui/create order-center --name-zh "订单中心" --dry-run --json
```

预检输出格式：

```json
{
  "ok": true,
  "resolved": {
    "name": "order-center",
    "nameZh": "订单中心",
    "activeRule": "/orderCenter",
    "port": 8081,
    "apiBase": "/api/orderCenter",
    "proxyTarget": "http://127.0.0.1:3000"
  },
  "sources": {
    "name": "user",
    "nameZh": "user",
    "activeRule": "derived",
    "port": "default",
    "proxyTarget": "default"
  },
  "warnings": [],
  "targetPath": "/Users/workspace/order-center"
}
```

### 3. 可审阅计划模式 (`--plan-out` 与 `--apply`)

在对安全性与变更审查要求极高的场景下，可先生成带 sha256 签名的 Plan 文件供人工审阅，审阅通过后再执行落地：

```bash
# 步骤 1: 生成计划（只写文件，不拉模板、不生成项目）
npx @yss-ui/create order-center --name-zh "订单中心" --plan-out ./plan.json

# 步骤 2: 审阅 plan.json 后执行
npx @yss-ui/create --apply ./plan.json
```

`--apply` 的校验顺序：计划文件可读且为合法 JSON → 结构与版本正确 → sha256 与内容一致 → **按当前规则重新校验全部参数**（hash 只能防误改，重算 hash 无法绕过参数校验）→ `targetPath` 与参数推导一致 → 目标目录不存在。任一环节失败均退出码 4，`--json` 下 `code` 分别为 `PLAN_INVALID`、`PLAN_MISMATCH`、`PLAN_INVALID_OPTIONS`、`PLAN_TARGET_EXISTS`。

---

## 退出码规范

| 退出码 | 标识 | 含义与原因 | 处置建议 |
|---|---|---|---|
| `0` | `SUCCESS` | 创建成功，或用户在交互确认处主动选择否 | 正常完成 |
| `1` | `UNKNOWN_ERROR` | 未知系统或未捕获运行时错误 | 检查报错堆栈 |
| `2` | `INVALID_ARGUMENTS` | 参数缺失、格式不合法、未知/拼错参数或端口完全耗尽 | 检查参数格式（如 `name` 需字母开头，`activeRule` 需单段路径），`--help` 查看全部参数 |
| `3` | `TARGET_EXISTS` | 目标项目目录已存在（交互 / `--yes` / `--dry-run` 流程） | CLI **坚决不提供强制覆盖**；请更换项目英文名或指定其他父目录 |
| `4` | `PLAN_MISMATCH` | `--apply` 流程中计划文件损坏或缺失、签名不符、参数未通过重新校验、目标目录已存在 | 重新执行 `--plan-out` 生成有效计划文件 |
| `5` | `TEMPLATE_SYNC_FAILED` | 模板仓库拉取或缓存校验失败（网络异常或 remote 不符） | 检查网络连接，或清除本地临时缓存 |
| `6` | `SCAFFOLD_FAILED` | 模板工程内部生成脚本执行报错 | 检查模板脚本报错日志 |
| `130` | `CANCELLED` | 用户在交互过程中按下 Ctrl+C 取消 | 退出操作，未写入任何脏数据 |

---

## 常见问题 (FAQ)

### 1. 为什么默认端口会变成 8082 或更高？
当本地已有其他微应用或进程占用了 `8081` 端口时，CLI 内置的探测引擎会自动向上探测首个空闲端口并自动适配，避免启动时端口冲突报错。

### 2. 目标目录已存在时能否强制 `--overwrite` 覆盖？
**不能**。为了保障开发者本地代码绝对安全，CLI 遵循零风险原则，发现目标目录存在时会立即终止（退出码 3），防止误操作清空或覆盖既有工作区。

### 3. 本地离线开发时如何拉取模板？
CLI 支持 `--prefer-offline` 与 `--offline` 模式。只要本地先前执行过一次，即可直接复用位于临时目录的模板缓存，无需访问远端 GitHub。

### 4. CLI 与雨燕平台的关系是什么？
- `@yss-ui/create` **专注于本地前端工程骨架的秒级初始化**，包含微前端环境配置、API 对接代理与 AI 研发生态集成。
- 如果需要创建企业 GitLab 远程仓库、申请流水线集成以及一键全流程发布部署，请配合使用 **雨燕云研发生态平台**。
