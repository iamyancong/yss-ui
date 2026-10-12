import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { EXIT_CODES, probeFreePort, YssCreateError } from '../src/core/index.mjs';

describe('probeFreePort 端口探测', () => {
  it('端口未被占用时直接返回起始端口', async () => {
    // 探测一个高位随机空闲端口
    const port = await probeFreePort(18080, '127.0.0.1', 10);
    expect(port).toBeGreaterThanOrEqual(18080);
  });

  it('起始端口被占用时自动向上递增找到空闲端口', async () => {
    const server = net.createServer();
    const testPort = 19100;

    await new Promise(resolve => {
      server.listen(testPort, '127.0.0.1', () => resolve());
    });

    try {
      const freePort = await probeFreePort(testPort, '127.0.0.1', 10);
      expect(freePort).toBe(testPort + 1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('探测范围内所有端口均被占用时抛出带错误码的异常', async () => {
    const startPort = 19200;
    const max = 2;
    const server1 = net.createServer();
    const server2 = net.createServer();

    await new Promise(resolve => server1.listen(startPort, '127.0.0.1', resolve));
    await new Promise(resolve => server2.listen(startPort + 1, '127.0.0.1', resolve));

    try {
      await expect(probeFreePort(startPort, '127.0.0.1', max)).rejects.toThrowError(YssCreateError);
      try {
        await probeFreePort(startPort, '127.0.0.1', max);
      } catch (error) {
        expect(error.exitCode).toBe(EXIT_CODES.INVALID_ARGUMENTS);
        expect(error.code).toBe('PORT_EXHAUSTED');
      }
    } finally {
      await new Promise(resolve => server1.close(resolve));
      await new Promise(resolve => server2.close(resolve));
    }
  });
});
