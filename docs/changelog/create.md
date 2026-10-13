# @yss-ui/create 更新日志

`@yss-ui/create` 与别名包 `create-yss-app` 版本同步，共用本更新日志。

## v1.3.0

`2026-10-12`

### ⚠️ 行为变化与升级说明

| 项 | 旧行为 | 新行为 | 升级建议 |
| --- | --- | --- | --- |
| @yss-ui/* 依赖版本 | 直接沿用模板写死的固定依赖版本（可能滞后） | 骨架生成后自动扫描两份 package.json 中的 `@yss-ui/*` 并对齐当前 registry 最新版本，保留原前缀 | 如需保持模板写死版本，传入 `--no-sync-deps` 或设置 `syncDeps: false` |
| pnpm-lock.yaml 锁文件 | 沿用模板锁文件，可能锁定在旧版本 | 依赖更新后若未选 install，自动执行 `pnpm install --lockfile-only` 刷新；刷新失败或无 pnpm 时自动删除旧锁文件 | 避免脏锁文件导致后续 `--frozen-lockfile` 报错；按提示在首次使用前执行 `pnpm install` |

### 🚀 Features

- **依赖最新版本自动对齐**：新增 `core/deps.mjs`，在模板骨架生成后并发查询 registry 对齐 `@yss-ui/*` 最新稳定版本；支持 `npm_config_registry` > `.npmrc` > 官方源优先级 (#53)。
- **镜像延迟与回退保护**：当使用 npmmirror 等镜像且镜像尚未同步官方新版本时，自动退回镜像实际可用的最高版本并输出提醒，绝不写入装不到的版本 (#53)。
- **超时与离线容错**：单包 5s 超时、总体 15s 超时；网络不可达或 404 保留原版本并 warn，退出码保持 0；`--offline` 模式完全跳过网络请求；支持 `--no-sync-deps` 显式关闭 (#53)。
- **Lockfile 协同维护**：依赖变更时自动刷新锁文件或安全清理旧锁文件，防止版本不一致 (#53)。
- **输出与机器模式增强**：预览表新增「依赖版本」配置项；终端逐条打印升级日志；`--json` 输出新增 `dependencyUpdates` 与 `lockfile` 字段 (#53)。

## v1.2.0

`2026-10-12`

### 🚀 Features

- **启动时显示版本号**：交互模式标题显示版本（如 `YSS 微应用创建 v1.2.0`）；非交互模式在 stderr 打印 `create-yss-app v1.2.0`；所有 `--json` 输出（含失败结果）新增 `cliVersion` 字段 (#52)。
- **新版本提示与切换**：启动时在后台查询当前 registry 上 `@yss-ui/create` 的最新版本 (#52)。
  - 交互模式：第一个问题前提示「当前 1.2.0 → 最新 1.3.0」并询问是否切换，默认「否」；选「是」通过 `npx` 下载新版本，带上原参数接着创建。不会未经确认自动升级。
  - 非交互模式：不等结果；流程结束时如果已查到新版本，打印提示框「下次请用 npm create yss-app@latest」。
  - 预发布版（版本号带 `-`）不算新版本；最新版本号在本地缓存 24 小时，切换 registry 后重新查询。
  - 查询超时 1.5 秒，离线或请求失败时直接跳过。
  - 没有交互终端、`--json`、`--dry-run`、`--offline`、`CI=true` 时不检查；新增 `--no-update-check` 参数，也可设置 `YSS_CREATE_NO_UPDATE_CHECK=1` 手动关闭。
  - 只发 GET 请求读取公开的版本元数据，不上报任何信息。

### 📝 Docs

- 别名包 `create-yss-app` 同步发布 1.2.0，README 补充「请始终带上 `@latest`」。1.1.0 的别名包依赖固定解析到 `@yss-ui/create@1.1.0`，不同步发版的话，npx 缓存过 1.1.0 的用户执行 `npm create yss-app@latest` 仍会跑旧版本。
- 常见问题新增「运行的不是最新版本」：如何确认版本、镜像同步延迟时临时指定官方源、删除全局安装的旧版本、清理 npx 缓存 (#52)。

> 1.1.0 及更早版本没有新版本检查。本机缓存了这些版本时（例如执行 `npm create yss-app` 仍出现 OpenAPI 提问），需要先执行 `rm -rf ~/.npm/_npx` 清理一次，并改用 `npm create yss-app@latest`。

## v1.1.0

`2026-10-12`

> 1.0.0 的默认模板地址不可用，默认流程必定失败，请直接升级到 1.1.0+。版本号为次版本是因为与组件库等包同批发布。

### ⚠️ 行为变化与升级说明

| 项 | 旧行为 | 新行为 | 升级建议 |
| --- | --- | --- | --- |
| 默认模板地址 | `https://github.com/ycwang-dev/yss-frontend-template.git`（不存在） | GitHub 公开仓库 `https://github.com/iamyancong/microapp-template-vue3.git`，分支 `main` | 无需凭据，能访问 GitHub 即可；其他模板用 `--template-url` / `YSS_FRONTEND_TEMPLATE_URL` 覆盖 |
| OpenAPI 地址 | 交互向导会询问 | 不再询问 | 需要时通过 `--openapi-url` 传入 |
| 非交互模式的 git 凭据 | 缺少凭据时 git 可能在终端等待输入 | `--yes` / `--json` / CI 等非交互模式禁用 git 终端提示，缺少凭据立即失败（退出码 5） | 使用私有模板时，CI 中提前配置 git 凭据 |
| 交互模式进度展示 | 转圈动画 | 逐行输出进度，git 需要账号密码时可直接在终端输入 | 无需调整 |

### 🐛 Bug Fixes

- **模板拉取报错**：报错只保留 git 的真实失败原因，不再重复打印 clone 命令和「正克隆到…」进度；附一句诊断（认证失败 / 仓库不存在 / 分支不存在 / 无法连接），并提示检查能否访问 GitHub，或用 `--template-url` / `YSS_FRONTEND_TEMPLATE_URL` 指定其他模板。退出码保持 5 (#51)。
- **出错时转圈不收尾**：交互模式下模板拉取失败后不再残留转圈状态 (#51)。

---

## v1.0.0

`2026-10-10`

### 🚀 Features

- **初始发布**: 企业级微应用一键脚手架 CLI (`@yss-ui/create` 与别名包 `create-yss-app`)。
- **activeRule 规则统一**: 统一为雨燕驼峰命名规则，支持从应用英文名自动推导单段路由；名称含数字导致驼峰不合法时自动退回短横线形式（`app-1 → /app-1`、`crm2 → /crm-2`）。
- **模板共享核心**: 与 `yss-create-microapp` AI Skill 共享零外部依赖 core 模块，生成结果逐文件一致。
- **自动化支持**: 支持 `--dry-run`、`--json`、`--plan-out` 与 `--apply` 离线可审阅计划执行。
  - `--json` 时 stdout 只输出一行 JSON，CLI 日志与模板脚本输出全部走 stderr。
  - `--plan-out` 只写出计划文件、不拉模板、不生成项目；由 `--apply` 执行。
  - `--apply` 校验 sha256 后仍会按当前规则重新校验全部参数；计划文件损坏/缺失、签名不符、参数非法、目标目录已存在统一退出码 4。
- **参数严格校验**: 未知或拼错的参数（如 `--dryrun`）、多余位置参数、`--pm` 非 `pnpm|npm|yarn` 均退出码 2。
- **无遥测**: 不收集任何数据。
