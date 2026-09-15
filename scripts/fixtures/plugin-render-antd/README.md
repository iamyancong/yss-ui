# 官方 renderer 隔离试验

只用于 Issue #24 评估，不是业务推荐写法，也不会作为运行时依赖发布。

1. 先运行根目录 `pnpm test:consumption -- /tmp/yss-consumer`，获得真实 tarball 消费项目。
2. 在该临时目录的 `consumer` 内安装固定试验版本：`pnpm add @vxe-ui/plugin-render-antd@4.4.1`。
3. 把本目录 `src` 和 `index.html` 复制到临时消费项目，沿用其官方 Vite 插件配置。
4. 启动 `pnpm exec vite --host 127.0.0.1 --port 4194`。
5. 在组件库目录运行 `python3 scripts/fixtures/plugin-render-antd/verify.py --output /tmp/yss-renderer-report`。需要 Python Playwright 与本机 Chrome。

试验通过替换 renderer 方法计数判断真实调用。计数是普通对象，避免在 render 中写响应式状态导致递归更新。测试装饰器会产生 VXE 重复注册警告，正式使用不包含这个装饰器。

断言：原生 VXE 编辑会调用官方 renderer；YEditTable 仍走自己的插槽并产生 `updateRow`，不会增加官方 renderer 调用次数。这是拒绝直接替换的证据，不代表所有编辑行为已完成迁移验证。
