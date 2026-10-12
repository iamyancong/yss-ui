# @yss-ui/create

在本地生成 Vue 3 + TypeScript + Vite + qiankun 微前端子应用骨架。与 `yss-create-microapp` AI Skill 共用同一份核心代码，同参数下生成结果逐文件一致。

## 使用

```bash
npm create yss-app@latest
pnpm create yss-app
npx @yss-ui/create
```

交互模式只需填写应用中文名与英文名，激活路由、端口、接口前缀、代理目标会自动推导，并在预览表中标注来源。

标题会显示当前版本号。registry 上有更新的正式版时，会在流程结束后打印提示框（只提示、不自动升级，最新版本号缓存 24 小时）。`npm create yss-app` 不带 `@latest` 会复用本机缓存的旧版本，请始终带上 `@latest`。用 `--no-update-check` 或环境变量 `YSS_CREATE_NO_UPDATE_CHECK=1` 关闭检查；没有交互终端、`--json`、`--dry-run`、`--offline`、`CI=true` 时自动不检查。

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

不收集任何遥测数据，不上报使用信息。网络访问仅限拉取模板仓库、你显式选择的依赖安装与 `@yss-ui/skills-cli` 同步，以及向当前 registry 发 GET 请求读取 `@yss-ui/create` 的最新版本号（公开元数据，不携带任何使用信息，24 小时内最多一次）。

## 许可证

MIT
