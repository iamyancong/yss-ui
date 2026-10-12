# @yss-ui/create 更新日志

`@yss-ui/create` 与别名包 `create-yss-app` 版本同步，共用本更新日志。

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
