const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startHttpServer } = require('./serve');

test('startHttpServer 正常启动并响应 /health 接口', async () => {
  const instance = await startHttpServer({ port: 3456, host: '127.0.0.1' });
  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:3456/health', resp => {
        let data = '';
        resp.on('data', chunk => (data += chunk));
        resp.on('end', () => resolve({ statusCode: resp.statusCode, body: JSON.parse(data) }));
        resp.on('error', reject);
      });
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.name, 'yss-mcp');
    assert.equal(res.body.endpoints.sse, '/sse');
    assert.equal(res.body.endpoints.message, '/message');
  } finally {
    await instance.close();
  }
});
