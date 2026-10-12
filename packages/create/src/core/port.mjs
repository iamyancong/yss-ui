/**
 * @fileoverview 端口空闲探测服务。
 * 纯 Node 原生 net 模块实现，零第三方依赖。
 */

import net from 'node:net';
import { EXIT_CODES } from './constants.mjs';
import { YssCreateError } from './errors.mjs';

/**
 * 检测指定主机的单端口是否可用。
 *
 * @param {number} port 目标端口
 * @param {string} host 绑定主机
 * @returns {Promise<boolean>} 是否可用
 */
const checkPortAvailable = (port, host) => {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
};

/**
 * 从起始端口向上探测首个空闲端口。
 *
 * @param {number} [start=8081] 起始探测端口
 * @param {string} [host='127.0.0.1'] 探测主机地址
 * @param {number} [max=50] 最大向上探测范围
 * @returns {Promise<number>} 可用的空闲端口
 */
export const probeFreePort = async (start = 8081, host = '127.0.0.1', max = 50) => {
  for (let offset = 0; offset < max; offset += 1) {
    const port = start + offset;
    const available = await checkPortAvailable(port, host);
    if (available) {
      return port;
    }
  }

  throw new YssCreateError(`未能在 [${start}, ${start + max - 1}] 范围内找到可用端口，所有端口均被占用`, {
    code: 'PORT_EXHAUSTED',
    exitCode: EXIT_CODES.INVALID_ARGUMENTS,
    hint: '请手动通过 --port <端口号> 指定其他空闲端口',
  });
};
