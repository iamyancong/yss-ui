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

> `npm create yss-app` 不带 `@latest` 时，npx 会直接复用本机缓存里的旧版本，请始终带上 `@latest`。CLI 启动时会显示当前版本号，并检查是否有新版本，详见下方常见问题「运行的不是最新版本」。

可直接通过位置参数传递项目英文名：

```bash
pnpm create yss-app my-order-app
```

### 模板来源与网络要求

默认模板为 GitHub 公开仓库 [iamyancong/microapp-template-vue3](https://github.com/iamyancong/microapp-template-vue3)（分支 `main`）：

```text
https://github.com/iamyancong/microapp-template-vue3.git
```

- 公开仓库，无需凭据，只要能访问 GitHub 即可。
- 使用需要凭据的私有模板时，交互模式下 git 会在终端询问账号密码；`--yes` / `--json` / CI 等非交互模式不会询问，没有凭据时立即失败（退出码 5）。
- 需要使用其他模板时，优先级为：`--template-url` > 环境变量 `YSS_FRONTEND_TEMPLATE_URL` > 默认 GitHub 地址，分支用 `--template-branch` 覆盖。

```bash
YSS_FRONTEND_TEMPLATE_URL=https://git.example.com/fe/my-template.git pnpm create yss-app
```

---

## 交互式创建流程

在终端执行命令后，CLI 会启动友好的分步向导（基于 `@clack/prompts`）。标题会显示当前版本（如 `YSS 微应用创建 v1.2.0`）；如果 registry 上有更新的版本，会在第一个问题前提示「当前 1.2.0 → 最新 1.3.0」并询问是否切换。默认选「否」，直接回车就继续用当前版本；选「是」会通过 `npx` 下载新版本，带上本次参数接着走创建流程。

1. **应用中文名**：例如 `订单中心`、`资产管理平台`（必填）。
2. **应用英文名**：例如 `order-center`、`crm`（必填，以小写字母开头，支持中划线）。
3. **激活路由**：自动由英文名推导小驼峰路由（如 `/orderCenter`），可直接按回车采纳。
4. **本地开发端口**：默认自动从 `8081` 向上探测空闲端口，若已被占用会自动提示并推荐下一个可用端口（如 `8082`）。
5. **接口请求前缀 (apiBase)**：默认自动推导为 `/api${activeRule}`。
6. **代理目标 (proxyTarget)**：自动读取环境变量 `YSS_PROXY_TARGET` 或系统测试环境预设地址。
7. **项目描述**：可选；OpenAPI 文档地址不在向导中询问，需要时通过 `--openapi-url` 传入。
8. **参数预览与确认**：向导会在终端表格中完整展示所有字段、配置值与来源（用户指定、自动推导、环境变量、默认预设），经用户二次确认后开始写入。
9. **后续可选动作**：交互式询问是否立即安装依赖、同步官方 AI Skills 规范及初始化 Git 仓库。

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
| `--openapi-url <url>` | URL | OpenAPI JSON 文档接口地址（交互向导不询问，仅通过参数传入） | 可选 |
| `--template-url <url>` | URL | 模板仓库地址（http / https / file） | 优先级：`--template-url` > `YSS_FRONTEND_TEMPLATE_URL` > 默认 GitHub 地址 |
| `--template-branch <name>` | 字符串 | 模板分支 | `main` |
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
| `--no-sync-deps` | 布尔 | 不自动对齐 `@yss-ui/*` 依赖最新版本（保留模板写死版本） | 默认自动对齐最新版本 |
| `--no-update-check` | 布尔 | 不检查新版本；也可设置环境变量 `YSS_CREATE_NO_UPDATE_CHECK=1` | 没有交互终端、`--json`、`--dry-run`、`--offline`、`CI=true` 时自动不检查 |
| `-v, --version` | 布尔 | 打印当前 CLI 版本号 | - |

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

预检输出格式（所有 JSON 输出，包括失败结果，都带 `cliVersion`）：

```json
{
  "ok": true,
  "cliVersion": "1.2.0",
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
| `5` | `TEMPLATE_SYNC_FAILED` | 模板仓库拉取或缓存校验失败（无法访问 GitHub、无仓库权限或凭据、分支不存在、remote 不符） | 按报错中的诊断处理：检查能否访问 GitHub，或用 `--template-url` / `YSS_FRONTEND_TEMPLATE_URL` 指定其他模板 |
| `6` | `SCAFFOLD_FAILED` | 模板工程内部生成脚本执行报错 | 检查模板脚本报错日志 |
| `130` | `CANCELLED` | 用户在交互过程中按下 Ctrl+C 取消 | 退出操作，未写入任何脏数据 |

---

## 常见问题 (FAQ)

### 1. 为什么默认端口会变成 8082 或更高？
当本地已有其他微应用或进程占用了 `8081` 端口时，CLI 内置的探测引擎会自动向上探测首个空闲端口并自动适配，避免启动时端口冲突报错。

### 2. 目标目录已存在时能否强制 `--overwrite` 覆盖？
**不能**。为了保障开发者本地代码绝对安全，CLI 遵循零风险原则，发现目标目录存在时会立即终止（退出码 3），防止误操作清空或覆盖既有工作区。

### 3. 本地离线开发时如何拉取模板？
CLI 支持 `--prefer-offline` 与 `--offline` 模式。只要本地先前联网执行过一次，即可直接复用位于临时目录的模板缓存，无需再访问模板仓库。

### 4. CLI 与雨燕平台的关系是什么？
- `@yss-ui/create` **专注于本地前端工程骨架的秒级初始化**，包含微前端环境配置、API 对接代理与 AI 研发生态集成。
- 如果需要创建企业 GitLab 远程仓库、申请流水线集成以及一键全流程发布部署，请配合使用 **雨燕云研发生态平台**。

### 5. 运行的不是最新版本？

典型现象：已经发布了新版本，执行后仍看到旧版本的行为（例如 1.0.0 才有的「OpenAPI 文档地址」提问）。

**先确认版本**：交互模式的标题会显示版本号（如 `YSS 微应用创建 v1.2.0`），也可以直接查：

```bash
npx create-yss-app@latest --version
```

**常见原因与处理：**

- **没带 `@latest`**：`npm create yss-app` 不带版本时，npx 只要在本机缓存里找到能用的版本就直接运行，不会查 registry 上有没有新版。请改用 `npm create yss-app@latest`。
- **镜像同步有延迟**：用 `npm config get registry` 查看当前源。如果是 npmmirror 等镜像，新版本可能要过一段时间才同步过来，可以临时指定官方源：

  ```bash
  npm create yss-app@latest --registry=https://registry.npmjs.org/
  ```

- **全局装过旧版本**：全局安装的 `create-yss-app` 可能优先于 npx 下载的版本，删掉即可：

  ```bash
  npm rm -g create-yss-app @yss-ui/create
  ```

- **npx 缓存里有旧版本**：清理 npx 缓存后重新执行：

  ```bash
  rm -rf ~/.npm/_npx
  ```

  Windows 下删除 `%LocalAppData%\npm-cache\_npx` 目录。

**新版本提示**：CLI 启动时会在后台查询当前 registry（`npm_config_registry`，默认 `https://registry.npmjs.org/`）上 `@yss-ui/create`（`create-yss-app` 的实现包，两者版本同步）的最新版本。

- 交互模式：在第一个问题前等待查询结果（命中缓存时立即返回，否则最多 1.5 秒）。有新版本时询问是否切换，默认「否」；选「是」才会通过 `npx` 下载新版本并带上本次参数继续创建，不会未经确认自动升级。Windows 下参数含空格或特殊字符时不提供切换，改为结尾提示。
- 非交互模式（如 `--yes`）：不等查询结果；流程结束时如果已经查到更新的正式版，打印提示框「发现新版本：当前 1.2.0 → 最新 1.3.0，下次请用 npm create yss-app@latest」。
- 预发布版（版本号带 `-`，如 `1.3.0-beta.1`）不算新版本。
- 查到的最新版本号会在系统临时目录缓存 24 小时（`yss-create-update-check.json`），同一天创建多个项目不会重复联网；切换 registry 后会重新查询。
- 超时、离线或请求失败时直接跳过，不影响创建。
- 以下情况不检查也不提示：没有交互终端、`--json`、`--dry-run`、`--offline`、`CI=true`、`--no-update-check`，或设置了环境变量 `YSS_CREATE_NO_UPDATE_CHECK=1`。

> 1.1.0 及更早版本没有新版本提示。如果本机缓存的是这些版本，需要先按上面的方法清理一次。

### 6. 生成后依赖版本对齐与 Lockfile 维护

在模板项目骨架生成完成后，CLI 会自动扫描根目录 `package.json` 与 `packages/package.json` 中的全部 `@yss-ui/*` 依赖项（例如 `@yss-ui/components`、`@yss-ui/hooks`、`@yss-ui/utils`、`@yss-ui/skills-cli` 等），向当前配置的 npm registry 查询并升级至最新稳定版本。

- **保留原有前缀**：原来是 `^` 的保留 `^`，原来是 `~` 的保留 `~`，原来是精确版本的保留精确版本。
- **镜像延迟保护**：使用私有源或 npmmirror 镜像时，CLI 会同时比对官方 npmjs 源与项目镜像源。若官方已发布新版但镜像尚未同步，CLI 坚决不写入镜像不存在的版本，而是安全回退到当前镜像可用的最高版本并输出提醒，保证后续依赖安装必定成功。
- **Lockfile 自动同步**：依赖版本变更后，若未选择自动安装依赖，CLI 会在本地尝试执行 `pnpm install --lockfile-only --ignore-scripts` 刷新 `pnpm-lock.yaml`；若执行失败或本地缺失 pnpm，将自动清理旧的 `pnpm-lock.yaml`，防止遗留版本冲突的脏锁文件导致后续安装报错。
- **显式关闭**：传递 `--no-sync-deps` 开关（或在 Plan 配置中设置 `syncDeps: false`）可完全跳过对齐。
