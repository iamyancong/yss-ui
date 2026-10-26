import { defineComponent, h, type Component, type VNode } from 'vue';
import { isVoidField } from '@formily/core';
import { FormItem as AntdvFormItem } from '@formily/antdv';
import { connect, mapProps } from '@formily/vue';
import {
  ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION,
  resolveConfigProviderPrefixCls,
} from '../../utils/resolveConfigProviderPrefixCls';
import { resolveFormItemFeedbackText } from './formItemFeedback';

export { ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION };

/**
 * 从当前组件上下文解析 Ant Design Vue ConfigProvider 的 prefixCls
 * @description 未找到组件级 ConfigProvider 时返回 undefined，交由 @formily/antdv 内部 globalConfig() 处理（兼容 ConfigProvider.config 全局前缀）
 */
export const resolveFormItemPrefixCls = (customPrefixCls?: string): string | undefined =>
  resolveConfigProviderPrefixCls('formily-form-item', customPrefixCls);

/**
 * 为 FormItem 根节点及其 label/control 子节点同步组件自有语义类名
 */
export const syncFormItemElementClasses = (root: Element | null | undefined): void => {
  if (!(root instanceof HTMLElement)) return;
  root.classList.add('yss-formily-item');
  Array.from(root.children).forEach(child => {
    if (!(child instanceof HTMLElement)) return;
    const classes = Array.from(child.classList);
    if (classes.some(cls => cls.endsWith('-form-item-label'))) {
      child.classList.add('yss-formily-item__label');
    } else if (classes.some(cls => cls.endsWith('-form-item-control'))) {
      child.classList.add('yss-formily-item__control');
    }
  });
};

const syncFormItemVNodeClasses = (vnode: VNode): void => {
  syncFormItemElementClasses(vnode.el as Element | null);
};

/**
 * 兼容自定义 ConfigProvider prefixCls 并注入 yss-formily-item 语义类名的 BaseItem 包装器
 */
const CompatibleBaseItem = defineComponent({
  name: 'FormItem',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => {
      const p = resolveFormItemPrefixCls(attrs.prefixCls as string | undefined);
      return h(
        AntdvFormItem.BaseItem as Component,
        {
          ...attrs,
          ...(p ? { prefixCls: p } : {}),
          class: ['yss-formily-item', attrs.class],
          onVnodeMounted: syncFormItemVNodeClasses,
          onVnodeUpdated: syncFormItemVNodeClasses,
        },
        slots
      );
    };
  },
});

/**
 * 修复 @formily/antdv FormItem 多消息重复拼接，统一必填反馈展示语义，并兼容自定义 prefixCls。
 */
export const CompatibleFormilyFormItem: Component & { BaseItem: any } = Object.assign(
  connect(
    CompatibleBaseItem,
    mapProps(
      { validateStatus: true, title: 'label', required: true },
      (props, field) => {
        if (isVoidField(field) || !field) return props;
        if (field.validating || props.feedbackText) return props;
        return {
          feedbackText: resolveFormItemFeedbackText(field),
          extra: props.extra || field.description,
        };
      },
      (props, field) => {
        if (isVoidField(field) || !field) return props;
        const decoratorFeedbackStatus = Array.isArray(field.decorator) ? field.decorator[1]?.feedbackStatus : undefined;
        return {
          feedbackStatus:
            field.validateStatus === 'validating' ? 'pending' : decoratorFeedbackStatus || field.validateStatus,
        };
      },
      (props, field) => {
        if (isVoidField(field) || !field) return props;
        const fieldAsterisk = field.required && field.pattern !== 'readPretty';
        return {
          asterisk: 'asterisk' in props ? props.asterisk : fieldAsterisk,
        };
      }
    )
  ),
  { BaseItem: CompatibleBaseItem }
);
