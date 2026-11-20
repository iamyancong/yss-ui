/**
 * @yss/mcp — YSS UI 文档 MCP Server（HTTP / SSE 远程模式）。
 *
 * 为内网服务器与多 IDE 提供基于标准 SSE (Server-Sent Events) 的远程 MCP 服务。
 */

const http = require('node:http');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { DocStore } = require('./store');
const { TOOL_DEFINITIONS, handleToolCall } = require('./tools');
const { version } = require('../package.json');

/**
 * 创建 MCP Server 逻辑实例。
 * @param {DocStore} store
 * @returns {Server}
 */
function createMcpServer(store) {
  const server = new Server({ name: 'yss-mcp', version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOL_DEFINITIONS }));

  server.setRequestHandler(CallToolRequestSchema, request => {
    const { name, arguments: args } = request.params;
    try {
      const text = handleToolCall(store, name, args || {});
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `工具执行失败: ${error.message}` }], isError: true };
    }
  });

  return server;
}

/**
 * 启动 HTTP / SSE MCP 服务器。
 * @param {object} options
 * @param {number} [options.port=3000]
 * @param {string} [options.host='0.0.0.0']
 * @returns {Promise<{ server: http.Server, port: number, close: () => Promise<void> }>}
 */
async function startHttpServer(options = {}) {
  const port = options.port || 3000;
  const host = options.host || '0.0.0.0';
  const store = new DocStore();

  /** 维护所有活跃的 SSE 会话 @type {Map<string, SSEServerTransport>} */
  const transports = new Map();

  const httpServer = http.createServer(async (req, res) => {
    // 设置通用跨域头，允许各类 AI IDE 或前端请求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 健康检查 / 状态接口
    if (pathname === '/' || pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify(
          {
            status: 'ok',
            name: 'yss-mcp',
            version,
            componentsVersion: store.index.componentsVersion,
            toolsCount: TOOL_DEFINITIONS.length,
            entriesCount: store.index.entries.length,
            endpoints: {
              sse: '/sse',
              message: '/message',
              health: '/health',
            },
          },
          null,
          2
        )
      );
      return;
    }

    // SSE 建立长连接端点
    if (pathname === '/sse' && req.method === 'GET') {
      const transport = new SSEServerTransport('/message', res);
      const mcpServer = createMcpServer(store);

      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
      };

      await mcpServer.connect(transport);
      return;
    }

    // 客户端下发 JSON-RPC 请求端点
    if (pathname === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId') || req.headers['x-session-id'];
      const transport = transports.get(sessionId);

      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Session not found: ${sessionId}`);
        return;
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  return new Promise((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, host, () => {
      resolve({
        server: httpServer,
        port,
        host,
        close: () => new Promise(res => httpServer.close(res)),
      });
    });
  });
}

module.exports = { startHttpServer };
