# @yss-ui/create

在本地生成 Vue 3 + TypeScript + Vite + qiankun 微前端子应用骨架。与 `yss-create-microapp` AI Skill 共用同一份核心代码，同参数下生成结果逐文件一致。

## 使用

```bash
npm create yss-app@latest
pnpm create yss-app
npx @yss-ui/create
```

交互模式只需填写应用中文名与英文名，激活路由、端口、接口前缀、代理目标会自动推导，并在预览表中标注来源。

标题会显示当前版本号。registry 上有更新的正式版时，交互模式会在第一个问题前实时查询并询问是否切换到新版本继续创建（默认「是」，直接回车即通过 `npx` 下载新版本并带上原参数继续；选「否」则用当前版本继续）；非交互模式在结尾打印提示框。`npm create yss-app` 不带 `@latest` 会复用本机缓存的旧版本，请始终带上 `@latest`。用 `--no-update-check` 或环境变量 `YSS_CREATE_NO_UPDATE_CHECK=1` 关闭检查；没有交互终端、`--json`、`--dry-run`、`--offline`、`CI=true` 时自动不检查。

## 模板与网络

默认模板为 GitHub 公开仓库 [iamyancong/microapp-template-vue3](https://github.com/iamyancong/microapp-template-vue3)（分支 `main`），无需凭据。使用其他模板：

```bash
npx @yss-ui/create --template-url https://git.example.com/fe/my-template.git
# 或
YSS_FRONTEND_TEMPLATE_URL=https://git.example.com/fe/my-template.git npx @yss-ui/create
```

非交互 / CI / AI Agent：

```bash
# 预检（不联网、不写盘），stdout 只输出一行 JSON
npx @yss-ui/create order-center --name-zh "订单中心" --dry-run --json

# 直接生成
npx @yss-ui/create order-center --name-zh "订单中心" --yes --json

# 先生成可审阅计划，再按计划执行
npx @yss-ui/create order-center --name-zh "订单中心" --plan-out ./plan.json
npx @yss-ui/create --apply ./plan.json
```

完整参数、推导规则与退出码见文档：[微应用创建 CLI](https://iamyancong.github.io/yss-ui/guide/create-app)，或运行 `npx @yss-ui/create --help`。

## 依赖版本对齐与 Lockfile

生成项目后，CLI 会自动扫描根目录 `package.json` 与 `packages/package.json` 中的所有 `@yss-ui/*` 依赖（如 `components`、`hooks`、`utils`、`skills-cli` 等），并将其对齐至当前 registry 上的最新版本（保留原有的 `^`、`~` 或精确版本前缀）。

- **镜像延迟保护**：若配置了 npmmirror 等镜像源，CLI 会检测镜像源与官方源的同步状态；若镜像尚未同步官方最新版，将自动退回镜像实际可用的最高版本，绝不写入镜像源装不到的版本。
- **Lockfile 维护**：检测到依赖升级后，若未选择生成后立即安装依赖，CLI 会自动执行 `pnpm install --lockfile-only` 刷新根目录 `pnpm-lock.yaml`；若执行失败或无 pnpm 环境，将主动删除旧 lockfile，避免留下不一致的锁定导致后续安装失败。
- **关闭对齐**：传入 `--no-sync-deps`（或在 plan/config 中设置 `syncDeps: false`）即可显式跳过依赖对齐，完全保留模板原写死版本。

## AI Skills 自动同步

生成后总是通过 `npx -y @yss-ui/skills-cli@latest sync` 把最新官方 AI Skills 同步到新项目，不再询问（需要联网，最长等 120 秒）；模板提供 `scripts/check-skills.mjs` 时会接着执行校验。同步明细不刷屏，只输出一行结果；同步失败只告警，不影响创建结果（可稍后在项目根目录手动执行同一命令）。

- 模板脚本自带的 skills 同步与 `Next steps` 由 CLI 统一接管：调用模板时固定追加 `--skip-skills --no-summary` 并设置环境变量 `YSS_CREATE_DRIVER=cli`，结尾只保留 CLI 的「后续快速开始」。
- `--offline` 自动跳过；无法联网的流水线可传 `--no-skills` 跳过。`--json` 输出新增 `skills: 'synced' | 'failed' | 'skipped'`。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 / 用户在确认处选否 |
| 1 | 未知错误 |
| 2 | 参数缺失、非法或拼写错误 |
| 3 | 目标目录已存在（不提供覆盖） |
| 4 | `--apply` 计划校验失败 |
| 5 | 模板拉取失败（无法访问 GitHub、仓库或分支不存在等） |
| 6 | 模板生成脚本失败 |
| 130 | 用户取消 |

## 隐私

不收集任何遥测数据，不上报使用信息。网络访问仅限拉取模板仓库、对齐 `@yss-ui/*` 依赖版本、同步 AI Skills（`@yss-ui/skills-cli`）、你显式选择的依赖安装，以及向当前 registry 发 GET 请求读取 `@yss-ui/create` 的最新版本号（公开元数据，不携带任何使用信息）。

## 许可证

MIT
