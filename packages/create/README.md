# @yss-ui/create

在本地生成 Vue 3 + TypeScript + Vite + qiankun 微前端子应用骨架。与 `yss-create-microapp` AI Skill 共用同一份核心代码，同参数下生成结果逐文件一致。

## 使用

```bash
npm create yss-app@latest
pnpm create yss-app
npx @yss-ui/create
```

交互模式只需填写应用中文名与英文名，激活路由、端口、接口前缀、代理目标会自动推导，并在预览表中标注来源。

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
| 5 | 模板拉取失败 |
| 6 | 模板生成脚本失败 |
| 130 | 用户取消 |

## 隐私

不收集任何遥测数据，不上报使用信息。网络访问仅限拉取模板仓库，以及你显式选择的依赖安装与 `@yss-ui/skills-cli` 同步。

## 许可证

MIT
