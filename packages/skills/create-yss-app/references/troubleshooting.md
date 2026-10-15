# 常见问题与排障指南

本文档收录在使用 `create-yss-app` 或 `@yss-ui/create` 创建微应用时的常见问题、排查思路与处理方案。

## 1. 退出码快速对照

- **Exit 2（参数校验失败）**：
  - 现象：提示参数格式非法或缺少必填项。
  - 处理：核对英文名是否符合规范（小写字母开头、短横线连接），不要靠猜测不断盲目重试。
- **Exit 3（目标目录已存在）**：
  - 现象：`Target directory already exists`。
  - 处理：为避免误覆盖已有代码，CLI 会主动拒绝执行。请换一个目标目录名称或指定新的父目录。
- **Exit 4（端口探测冲突）**：
  - 现象：从 8081 起探测端口失败或超出上限。
  - 处理：可手动传入 `--port <customPort>` 指定特定空闲端口。
- **Exit 5（模板拉取失败）**：
  - 现象：Git clone 超时或认证失败。
  - 处理：
    1. 检查网络及 GitHub 可达性；
    2. 若网络受限，改用内置离线工具 `yss-create-microapp`。
- **Exit 130（用户取消）**：
  - 现象：在交互中按下了 `Ctrl + C`。
  - 处理：属于安全退出，不会产生任何脏文件或半途目录。

## 2. 运行时与基座集成问题

### 依赖安装或对齐失败
- 检查当前 npm registry 是否配置正确（推荐使用企业内部镜像源或淘宝源）。
- 锁文件冲突时，可尝试删除 `node_modules` 与 `pnpm-lock.yaml` 后重新 `pnpm install`。

### 代理跨域与 404
- 检查 `vite.config.ts` 中的 `server.proxy` 配置；
- 确认后端网关服务正常存活且 `proxyTarget` 填写的协议与端口准确（如 `http://gateway.dev:8080`）。

### qiankun 主应用无法加载微应用
- 确保在基座中注册的 `activeRule` 与子应用的 `micro-config.json` 中的 `activeRule` 严格一致；
- 确保子应用在本地启动后，访问其 entry（如 `http://localhost:8081/`）能正常响应 HTML。
