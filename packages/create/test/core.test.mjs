import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PORT,
  DEFAULT_PROXY_TARGET,
  DEFAULT_TEMPLATE_URL,
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
    });
  });
});
