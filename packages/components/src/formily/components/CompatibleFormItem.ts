import type { Component } from 'vue';
import { isVoidField } from '@formily/core';
import { FormItem as AntdvFormItem } from '@formily/antdv';
import { connect, mapProps } from '@formily/vue';
import { resolveFormItemFeedbackText } from './formItemFeedback';

/**
 * 修复 @formily/antdv FormItem 多消息重复拼接，并统一必填反馈展示语义。
 */
export const CompatibleFormilyFormItem: Component & { BaseItem: any } = Object.assign(
  connect(
    AntdvFormItem.BaseItem,
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
  { BaseItem: AntdvFormItem.BaseItem }
);
