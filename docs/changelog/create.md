# @yss-ui/create 更新日志

`@yss-ui/create` 与别名包 `create-yss-app` 版本同步，共用本更新日志。

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
