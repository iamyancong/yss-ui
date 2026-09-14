import type { YssLocaleName } from './types';

/** VXE 是引擎级单例，最后发起的请求生效。 */
let languageRevision = 0;

/** 注册并切换 VXE 词典；仅在表格使用或显式调用时加载引擎。 */
export async function syncVxeLanguage(locale: YssLocaleName | string): Promise<void> {
  const revision = ++languageRevision;
  const language =
    locale === 'en-US' || locale === 'en' ? 'en-US' : locale === 'zh-TW' || locale === 'zh-HK' ? 'zh-TW' : 'zh-CN';
  try {
    const [{ VxeUI }, dictionary] = await Promise.all([
      import('vxe-pc-ui'),
      language === 'en-US'
        ? import('vxe-pc-ui/es/language/en-US')
        : language === 'zh-TW'
          ? import('vxe-pc-ui/es/language/zh-TW')
          : import('vxe-pc-ui/es/language/zh-CN'),
    ]);
    if (revision !== languageRevision) return;
    VxeUI.setI18n(language, dictionary.default);
    VxeUI.setLanguage(language);
  } catch (error) {
    // 优雅降级：未引入或未安装 vxe-pc-ui 时不阻断全局切换流程
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[YSS UI] 同步 VXE 语言包失败或未安装 vxe-pc-ui:', error);
    }
  }
}
