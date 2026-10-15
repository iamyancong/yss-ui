# 参数详解与推导规约

本参考文档详细说明 `@yss-ui/create` CLI 与 `create-yss-app` Skill 所支持的各项参数、默认值规则与格式约束。

## 1. 核心参数清单

| 参数名 | 对应命令行选项 | 类型 | 必填 | 默认值 / 推导规则 |
|---|---|---|---|---|
| `appName` | 第一个位置参数 | string | 是 | 无（必须为合规短横线命名） |
| `appNameZh` | `--name-zh` | string | 是 | 无（中文名称） |
| `activeRule` | `--active-rule` | string | 否 | 由 `appName` 推导单段小驼峰，以 `/` 开头（如 `/orderCenter`） |
| `port` | `--port` | number | 否 | 从 `8081` 起自动向上探测首个空闲端口 |
| `apiBase` | `--api-base` | string | 否 | `/api${activeRule}` |
| `proxyTarget` | `--proxy-target` | string | 否 | 优先级：命令行参数 > 环境变量 `YSS_PROXY_TARGET` > 测试网关占位 |
| `targetDir` | `--target-dir` | string | 否 | 当前执行命令所在的根目录 |

## 2. 校验与格式规则

### 应用英文名 (`appName`)
- 必须以英文字母开头；
- 仅支持小写字母、数字及中划线 `-`；
- 不能以中划线结尾；
- 合法示例：`order-center`、`crm-v2`、`user-auth`；
- 非法示例：`1order`、`OrderCenter`、`order_center`、`order-`。

### 激活路由 (`activeRule`)
- 必须以 `/` 开头的单段有效路径；
- 推荐使用小驼峰格式（如 `/orderCenter`）；
- 允许短横线兼容格式（如 `/order-center`）；
- 禁止多级嵌套路径（如 `/a/b`）；
- 默认推导映射：`order-center` $\to$ `/orderCenter`，`crm` $\to$ `/crm`。
