#!/usr/bin/env node

const command = process.argv[2];

if (command === 'install') {
  const { run } = require('../lib/install');
  run(process.argv.slice(3)).catch(error => {
    console.error(`安装失败: ${error.message}`);
    process.exit(1);
  });
} else if (command === 'serve') {
  const { startHttpServer } = require('../lib/serve');
  const args = process.argv.slice(3);
  let port = 3000;
  let host = '0.0.0.0';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[i + 1], 10) || port;
      i++;
    } else if (args[i] === '--host' || args[i] === '-h') {
      host = args[i + 1] || host;
      i++;
    }
  }

  startHttpServer({ port, host })
    .then(({ port, host }) => {
      console.log(`yss-mcp HTTP/SSE 服务已就绪: http://${host}:${port}`);
      console.log(`  - 健康检查: http://${host}:${port}/health`);
      console.log(`  - SSE 端点: http://${host}:${port}/sse`);
    })
    .catch(error => {
      console.error(`yss-mcp 服务启动失败: ${error.message}`);
      process.exit(1);
    });
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`yss-mcp — YSS UI 文档 MCP Server

用法:
  yss-mcp                     启动 stdio MCP Server（供本地 AI 工具调用，默认）
  yss-mcp serve               启动远程 HTTP/SSE MCP Server（供内网服务器部署）
    --port, -p <端口>         监听端口（默认 3000）
    --host, -h <主机>         监听地址（默认 0.0.0.0）
  yss-mcp install             交互式安装到 12 个主流 AI 工具（Cursor/Codex/Claude Code/Antigravity 等）
  yss-mcp install <目标...>   直接安装，如: yss-mcp install cursor codex --global
  yss-mcp help                显示本帮助`);
} else {
  const { main } = require('../lib/server');
  main().catch(error => {
    console.error(`yss-mcp 启动失败: ${error.message}`);
    process.exit(1);
  });
}
