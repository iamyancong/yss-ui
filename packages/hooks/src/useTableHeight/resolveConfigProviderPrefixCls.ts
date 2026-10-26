import { getCurrentInstance } from 'vue';

/** Ant Design Vue ConfigProvider 注入的内部 Symbol 描述名称 */
export const ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION = 'configProvider';

/**
 * 从当前 Vue 组件实例上下文的 provides 原型链中解析 Ant Design Vue ConfigProvider 的 prefixCls
 * @param suffixCls 组件后缀类名（如 'card'、'formily-form-item'）
 * @param customizePrefixCls 显式传入的自定义 prefixCls
 * @returns 解析到的类名前缀；若未挂载组件级 ConfigProvider 则返回 undefined
 */
export const resolveConfigProviderPrefixCls = (
  suffixCls?: string,
  customizePrefixCls?: string
): string | undefined => {
  if (customizePrefixCls) return customizePrefixCls;
  const instance = getCurrentInstance() as unknown as { provides?: Record<PropertyKey, unknown> } | null;
  let cur = instance?.provides;
  while (cur) {
    const symbols = Object.getOwnPropertySymbols(cur);
    const cpSymbol = symbols.find(sym => sym.description === ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION);
    if (cpSymbol) {
      const cp = cur[cpSymbol] as
        | { getPrefixCls?: (suffixCls?: string, customizePrefixCls?: string) => string }
        | undefined;
      if (typeof cp?.getPrefixCls === 'function') {
        const resolved = cp.getPrefixCls(suffixCls, customizePrefixCls);
        if (resolved) return resolved;
      }
    }
    cur = Object.getPrototypeOf(cur);
  }
  return undefined;
};
