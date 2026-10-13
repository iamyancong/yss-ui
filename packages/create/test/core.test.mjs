import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  customizeEnvFiles,
  DEFAULT_PORT,
  DEFAULT_PROXY_TARGET,
  DEFAULT_TEMPLATE_URL,
  normalizeSubAppActiveRule,
  resolveOptions,
  TEMPLATE_URL_PROTOCOLS,
  toActiveRule,
  validateActiveRule,
  validateAppName,
  validateHttpUrl,
} from '../src/core/index.mjs';

describe('@yss-ui/create core 单元测试', () => {
  describe('validateAppName', () => {
    it('正确格式通过校验', () => {
      expect(validateAppName('order-center')).toBeNull();
      expect(validateAppName('crm')).toBeNull();
      expect(validateAppName('data-source-service')).toBeNull();
      expect(validateAppName('app123')).toBeNull();
    });

    it('非法格式拒绝并给出中文提示', () => {
      expect(validateAppName('')).toContain('不能为空');
      expect(validateAppName('1order')).toContain('必须以小写字母开头');
      expect(validateAppName('OrderCenter')).toContain('必须以小写字母开头');
      expect(validateAppName('-order')).toContain('必须以小写字母开头');
      expect(validateAppName('order-')).toContain('必须以小写字母开头');
      expect(validateAppName('order_center')).toContain('必须以小写字母开头');
    });
  });

  describe('validateActiveRule', () => {
    it('正例：驼峰与短横线单段路径通过', () => {
      expect(validateActiveRule('/orderCenter')).toBeNull();
      expect(validateActiveRule('/dmDataSource')).toBeNull();
      expect(validateActiveRule('/data-service')).toBeNull();
      expect(validateActiveRule('/crm')).toBeNull();
    });

    it('反例：大写开头、数字开头、多段路径、无斜杠、下划线拒绝', () => {
      expect(validateActiveRule('/OrderCenter')).toContain('必须以 / 开头且仅有一段路径');
      expect(validateActiveRule('/1order')).toContain('必须以 / 开头且仅有一段路径');
      expect(validateActiveRule('/a/b')).toContain('必须以 / 开头且仅有一段路径');
      expect(validateActiveRule('order')).toContain('必须以 / 开头且仅有一段路径');
      expect(validateActiveRule('/order_center')).toContain('必须以 / 开头且仅有一段路径');
      expect(validateActiveRule('')).toContain('不能为空');
    });
  });

  describe('toActiveRule', () => {
    it('应用名自动转换为小驼峰单段路由', () => {
      expect(toActiveRule('order-center')).toBe('/orderCenter');
      expect(toActiveRule('dm-data-source')).toBe('/dmDataSource');
      expect(toActiveRule('data-service')).toBe('/dataService');
      expect(toActiveRule('crm')).toBe('/crm');
      expect(toActiveRule('order-center2')).toBe('/orderCenter2');
    });

    it('驼峰推导不合法时退回短横线形式，含数字首段补短横线', () => {
      expect(toActiveRule('app-1')).toBe('/app-1');
      expect(toActiveRule('crm2')).toBe('/crm-2');
      expect(toActiveRule('crm2-admin')).toBe('/crm-2-admin');
      expect(toActiveRule('a1b2')).toBe('/a-1b2');
    });

    it('任意合法 appName 推导出的 activeRule 都能通过校验', () => {
      const names = ['app-1', 'crm2', 'crm2-admin', 'a1b2', 'x9-y8-z7', 'order-center', 'v2'];
      for (const name of names) {
        expect(validateAppName(name)).toBeNull();
        expect(validateActiveRule(toActiveRule(name))).toBeNull();
      }
    });
  });

  describe('validateHttpUrl 协议白名单', () => {
    it('proxy-target / openapi-url 只接受 HTTP(S)，拒绝 file:', () => {
      expect(validateHttpUrl('http://127.0.0.1:3000', 'proxy-target')).toBe('http://127.0.0.1:3000');
      expect(validateHttpUrl('https://gw.test.internal', 'proxy-target')).toBe('https://gw.test.internal');
      expect(() => validateHttpUrl('file:///etc/passwd', 'proxy-target')).toThrowError(/proxy-target/);
      expect(() => validateHttpUrl('ftp://host', 'proxy-target')).toThrowError(/proxy-target/);
      expect(() => validateHttpUrl('not a url', 'proxy-target')).toThrowError(/proxy-target/);
    });

    it('template-url 额外允许 file:', () => {
      expect(validateHttpUrl('file:///tmp/repo', 'template-url', TEMPLATE_URL_PROTOCOLS)).toBe('file:///tmp/repo');
    });

    it('resolveOptions 对 proxyTarget 拒绝 file: 协议', async () => {
      await expect(
        resolveOptions({ name: 'crm', nameZh: '客户', proxyTarget: 'file:///tmp/x' }, { probePort: false })
      ).rejects.toMatchObject({ code: 'INVALID_URL', exitCode: 2 });
    });
  });

  describe('resolveOptions 与优先级测试', () => {
    const originalEnv = process.env.YSS_PROXY_TARGET;

    beforeEach(() => {
      delete process.env.YSS_PROXY_TARGET;
    });

    afterEach(() => {
      if (originalEnv) {
        process.env.YSS_PROXY_TARGET = originalEnv;
      } else {
        delete process.env.YSS_PROXY_TARGET;
      }
    });

    it('显式参数最高优先级', async () => {
      process.env.YSS_PROXY_TARGET = 'http://env-proxy.internal:8080';
      const result = await resolveOptions(
        {
          name: 'order-center',
          nameZh: '订单中心',
          activeRule: '/customRule',
          port: 9000,
          proxyTarget: 'http://user-proxy.internal:9999',
        },
        { probePort: false }
      );

      expect(result.resolved.name).toBe('order-center');
      expect(result.sources.name).toBe('user');
      expect(result.resolved.activeRule).toBe('/customRule');
      expect(result.sources.activeRule).toBe('user');
      expect(result.resolved.port).toBe(9000);
      expect(result.sources.port).toBe('user');
      expect(result.resolved.proxyTarget).toBe('http://user-proxy.internal:9999');
      expect(result.sources.proxyTarget).toBe('user');
    });

    it('环境变量次优先于常量默认值', async () => {
      process.env.YSS_PROXY_TARGET = 'http://env-proxy.internal:8080';
      const result = await resolveOptions(
        {
          name: 'order-center',
          nameZh: '订单中心',
        },
        { probePort: false }
      );

      expect(result.resolved.proxyTarget).toBe('http://env-proxy.internal:8080');
      expect(result.sources.proxyTarget).toBe('env');
    });

    it('templateUrl 在运行时读取 YSS_FRONTEND_TEMPLATE_URL，未设置时回落常量并标记 default', async () => {
      const originalTemplateEnv = process.env.YSS_FRONTEND_TEMPLATE_URL;
      try {
        process.env.YSS_FRONTEND_TEMPLATE_URL = 'https://git.internal/tpl.git';
        const withEnv = await resolveOptions({ name: 'crm', nameZh: '客户' }, { probePort: false });
        expect(withEnv.resolved.templateUrl).toBe('https://git.internal/tpl.git');
        expect(withEnv.sources.templateUrl).toBe('env');

        delete process.env.YSS_FRONTEND_TEMPLATE_URL;
        const withoutEnv = await resolveOptions({ name: 'crm', nameZh: '客户' }, { probePort: false });
        expect(withoutEnv.resolved.templateUrl).toBe(DEFAULT_TEMPLATE_URL);
        expect(withoutEnv.sources.templateUrl).toBe('default');
      } finally {
        if (originalTemplateEnv === undefined) delete process.env.YSS_FRONTEND_TEMPLATE_URL;
        else process.env.YSS_FRONTEND_TEMPLATE_URL = originalTemplateEnv;
      }
    });

    it('未设置环境变量与参数时取常量默认值', async () => {
      const result = await resolveOptions(
        {
          name: 'order-center',
          nameZh: '订单中心',
        },
        { probePort: false }
      );

      expect(result.resolved.proxyTarget).toBe(DEFAULT_PROXY_TARGET);
      expect(result.sources.proxyTarget).toBe('default');
      expect(result.resolved.activeRule).toBe('/orderCenter');
      expect(result.sources.activeRule).toBe('derived');
      expect(result.resolved.apiBase).toBe('/api/orderCenter');
      expect(result.sources.apiBase).toBe('derived');
      expect(result.resolved.port).toBe(DEFAULT_PORT);
      expect(result.sources.port).toBe('default');
      expect(result.resolved.fullActiveRule).toBe('/subApp/orderCenter');
    });

    it('显式传入 port 时来源标记为 user 且跳过 probeFreePort 探测', async () => {
      const server = net.createServer();
      let portOccupied = false;
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(DEFAULT_PORT, '127.0.0.1', () => {
            portOccupied = true;
            resolve();
          });
        });
      } catch {
        portOccupied = true;
      }

      try {
        if (portOccupied) {
          // 未传 port 且开启探测时：探测到 8081 被占用，推导下一个可用端口并记录警告
          const withoutPort = await resolveOptions({ name: 'crm', nameZh: '客户' });
          expect(withoutPort.sources.port).toBe('derived');
          expect(withoutPort.resolved.port).toBeGreaterThan(DEFAULT_PORT);
          expect(withoutPort.warnings.some(w => w.includes('已被占用'))).toBe(true);

          // 显式传 port 时：直接使用用户端口，来源标记为 user，跳过探测且不产生占用警告
          const withPort = await resolveOptions({ name: 'crm', nameZh: '客户', port: 18081 });
          expect(withPort.sources.port).toBe('user');
          expect(withPort.resolved.port).toBe(18081);
          expect(withPort.warnings.some(w => w.includes('已被占用'))).toBe(false);
        } else {
          const withPort = await resolveOptions({ name: 'crm', nameZh: '客户', port: 18081 });
          expect(withPort.sources.port).toBe('user');
          expect(withPort.resolved.port).toBe(18081);
        }
      } finally {
        if (server.listening) {
          await new Promise(resolve => server.close(resolve));
        }
      }
    });

    it('未传 port 时可通过 probePort: false 显式关闭探测并回退默认端口', async () => {
      const result = await resolveOptions(
        { name: 'order-center', nameZh: '订单中心' },
        { probePort: false }
      );
      expect(result.resolved.port).toBe(DEFAULT_PORT);
      expect(result.sources.port).toBe('default');
      expect(result.warnings.some(w => w.includes('已被占用'))).toBe(false);
    });
  });

  describe('normalizeSubAppActiveRule 规范化测试', () => {
    it('正确为单段路由补齐 /subApp 前缀', () => {
      expect(normalizeSubAppActiveRule('/entrusted', 'entrusted')).toBe('/subApp/entrusted');
      expect(normalizeSubAppActiveRule('entrusted', 'entrusted')).toBe('/subApp/entrusted');
      expect(normalizeSubAppActiveRule('/subApp/entrusted', 'entrusted')).toBe('/subApp/entrusted');
      expect(normalizeSubAppActiveRule('', 'my-app')).toBe('/subApp/my-app');
    });
  });

  describe('customizeEnvFiles 覆盖所有 .env.* 文件的改写', () => {
    it('验证模板已有的 .env* 文件全部改写，消除残留并保留特殊变量与注释', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-env-test-'));
      const pkgDir = path.join(tempRoot, 'packages');
      await fs.mkdir(pkgDir, { recursive: true });

      // 准备模板原始的 6 个文件
      const rawTemplates = {
        '.env.development': `VITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=/api/dataSource\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\n`,
        '.env.development.jsp-theme': `VITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=/api/dataSource\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\nVITE_JSP_THEME=classic-blue\n`,
        '.env.production': `VITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=/api/dataSource\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\nVITE_STANDALONE_DEPLOY=false\nVITE_STANDALONE_LAYOUT=true\n`,
        '.env.production.jsp': `VITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=mdm\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\nVITE_IS_JSP=true\nVITE_STANDALONE_DEPLOY=false\n`,
        '.env.production.jsp-theme': `VITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=mdm\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\nVITE_IS_JSP=true\nVITE_JSP_THEME=classic-blue\n`,
        '.env.production.standalone': `# 独立部署专用环境变量\n# 通过 pnpm build:standalone 触发\n\nVITE_SUB_APP_NAME=dataSource\nVITE_API_BASE_URL=/api/dataSource\nVITE_ACTIVE_RULE=/subApp/dataSource\nVITE_PROXY_TARGET=http://localhost:3000\n\n# 独立部署标志\nVITE_STANDALONE_DEPLOY=true\n# 独立部署时是否强制显示布局菜单\nVITE_STANDALONE_LAYOUT=true\n`,
      };

      for (const [name, content] of Object.entries(rawTemplates)) {
        await fs.writeFile(path.join(pkgDir, name), content, 'utf8');
      }

      await customizeEnvFiles(tempRoot, {
        appName: 'entrusted',
        apiBase: '/api/entrusted',
        fullActiveRule: '/subApp/entrusted',
        proxyTarget: 'http://127.0.0.1:8000',
      });

      for (const name of Object.keys(rawTemplates)) {
        const updated = await fs.readFile(path.join(pkgDir, name), 'utf8');
        expect(updated).toContain('VITE_SUB_APP_NAME=entrusted');
        expect(updated).toContain('VITE_API_BASE_URL=/api/entrusted');
        expect(updated).toContain('VITE_ACTIVE_RULE=/subApp/entrusted');
        expect(updated).toContain('VITE_PROXY_TARGET=http://127.0.0.1:8000');
        expect(updated).not.toContain('dataSource');
        expect(updated).not.toContain('VITE_API_BASE_URL=mdm');
      }

      // 验证独立部署与 JSP 专有变量完整保留
      const standaloneContent = await fs.readFile(path.join(pkgDir, '.env.production.standalone'), 'utf8');
      expect(standaloneContent).toContain('# 独立部署专用环境变量');
      expect(standaloneContent).toContain('VITE_STANDALONE_DEPLOY=true');

      const jspContent = await fs.readFile(path.join(pkgDir, '.env.production.jsp'), 'utf8');
      expect(jspContent).toContain('VITE_IS_JSP=true');

      await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it('验证不会生成模板里没有的文件（如模板未包含 .env.production.standalone 时绝不凭空创建）', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yss-env-test-sparse-'));
      const pkgDir = path.join(tempRoot, 'packages');
      await fs.mkdir(pkgDir, { recursive: true });

      // 仅提供基础的 .env.development 与 .env.production，故意省略 .env.production.standalone 等文件
      await fs.writeFile(
        path.join(pkgDir, '.env.development'),
        'VITE_SUB_APP_NAME=old\nVITE_API_BASE_URL=/api/old\nVITE_ACTIVE_RULE=/subApp/old\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(pkgDir, '.env.production'),
        'VITE_SUB_APP_NAME=old\nVITE_API_BASE_URL=/api/old\nVITE_ACTIVE_RULE=/subApp/old\n',
        'utf8'
      );

      await customizeEnvFiles(tempRoot, {
        appName: 'my-microapp',
        apiBase: '/api/my-microapp',
        fullActiveRule: '/subApp/my-microapp',
        proxyTarget: 'http://127.0.0.1:3000',
      });

      const files = await fs.readdir(pkgDir);
      expect(files.sort()).toEqual(['.env.development', '.env.production']);

      // 明确验证缺失的 standalone 与 jsp 配置文件绝不会被凭空创建
      await expect(fs.access(path.join(pkgDir, '.env.production.standalone'))).rejects.toThrow();
      await expect(fs.access(path.join(pkgDir, '.env.production.jsp'))).rejects.toThrow();

      // 已存在的文件被正确改写
      const devContent = await fs.readFile(path.join(pkgDir, '.env.development'), 'utf8');
      expect(devContent).toContain('VITE_SUB_APP_NAME=my-microapp');
      expect(devContent).toContain('VITE_API_BASE_URL=/api/my-microapp');
      expect(devContent).toContain('VITE_ACTIVE_RULE=/subApp/my-microapp');
      expect(devContent).not.toContain('old');

      await fs.rm(tempRoot, { recursive: true, force: true });
    });
  });
});
