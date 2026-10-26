<script setup lang="ts">
import { computed, useAttrs, type CSSProperties, type VNode } from 'vue';
import { Card as ACard } from 'ant-design-vue';
import type { YCardProps } from './types';

defineOptions({
  name: 'YCard',
  inheritAttrs: false,
});

/**
 * 组件 Props
 * @description 基于 Ant Design Card 扩展的卡片组件，提供更灵活的样式控制
 */
const props = withDefaults(defineProps<YCardProps>(), {
  padding: 16,
});

const attrs = useAttrs();
const ACardMeta = ACard.Meta;

/**
 * 同步卡片内部结构语义类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncCardClasses = (vnode: VNode) => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;
  const children = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  const candidates = Array.from(root.classList).filter(
    cls => cls !== 'y-card' && cls.endsWith('-card')
  );
  const cardPrefix =
    candidates.find(cls =>
      children.some(
        child => child.classList.contains(`${cls}-head`) || child.classList.contains(`${cls}-body`)
      )
    ) ?? candidates[0];
  if (!cardPrefix) return;

  for (const child of children) {
    if (child.classList.contains(`${cardPrefix}-head`)) {
      child.classList.add('y-card__head');
    } else if (child.classList.contains(`${cardPrefix}-body`)) {
      child.classList.add('y-card__body');
    }
  }
};

/**
 * 合并 bodyStyle 与便捷的 padding
 * @description 传入的 bodyStyle.padding 优先级更高
 */
const mergedBodyStyle = computed<CSSProperties | undefined>(() => {
  const padding =
    props.padding === null || props.padding === undefined
      ? undefined
      : typeof props.padding === 'number'
        ? `${props.padding}px`
        : props.padding;

  const base: CSSProperties = {};
  if (padding !== undefined && padding !== null) {
    base.padding = padding;
  }

  if (props.bodyStyle && typeof props.bodyStyle === 'object') {
    return { ...base, ...(props.bodyStyle as CSSProperties) };
  }

  return Object.keys(base).length ? base : undefined;
});

/**
 * 卡片类名
 * @description 支持业务层完全自定义类名
 */
const cardClasses = computed<string[]>(() => {
  const classes: string[] = ['y-card'];

  // 如果有自定义类名，添加到数组中
  if (props.className) {
    if (Array.isArray(props.className)) {
      classes.push(...props.className);
    } else {
      classes.push(props.className);
    }
  }

  // 添加外部传入的 class
  if (attrs.class) {
    const externalClass = attrs.class;
    if (Array.isArray(externalClass)) {
      classes.push(...externalClass);
    } else if (typeof externalClass === 'string') {
      classes.push(externalClass);
    }
  }

  return classes;
});

/**
 * 卡片样式
 * @description 支持业务层完全自定义样式
 */
const cardStyles = computed<CSSProperties>(() => {
  const styles: CSSProperties = {};

  // 合并自定义样式
  if (props.customStyle && typeof props.customStyle === 'object') {
    Object.assign(styles, props.customStyle);
  }

  // 合并外部传入的 style
  if (attrs.style && typeof attrs.style === 'object') {
    Object.assign(styles, attrs.style);
  }

  return styles;
});

/**
 * 需要透传给 ACard 的最终属性集合
 * @description 过滤掉自定义的 props，只传递 Ant Design Card 支持的属性
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardProps = computed<Record<string, any>>(() => {
  const {
    padding: _padding,
    bodyStyle: _bodyStyle,
    className: _className,
    customStyle: _customStyle,
    metaTitle: _metaTitle,
    metaDescription: _metaDescription,
    ...rest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = props as any;

  // 过滤掉 attrs 中的 class 和 style，避免重复应用
  const { class: _cls, style: _styl, ...restAttrs } = attrs || {};

  return {
    ...restAttrs,
    ...rest,
    bodyStyle: mergedBodyStyle.value,
  };
});

/**
 * Meta 相关：是否存在需渲染的内容（props 或具名插槽）
 */
const hasMetaContent = computed<boolean>(() => {
  return !!(
    (props.metaTitle && String(props.metaTitle).length > 0) ||
    (props.metaDescription && String(props.metaDescription).length > 0)
  );
});
</script>

<template>
  <ACard
    v-bind="cardProps"
    :class="cardClasses"
    :style="cardStyles"
    @vue:mounted="syncCardClasses"
    @vue:updated="syncCardClasses"
  >
    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>
    <template v-if="$slots.extra" #extra>
      <slot name="extra" />
    </template>
    <template v-if="$slots.cover" #cover>
      <slot name="cover" />
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
    <template v-if="$slots.tabBarExtraContent" #tabBarExtraContent>
      <slot name="tabBarExtraContent" />
    </template>

    <!-- Meta 区域：若提供任一 Meta 相关内容则渲染在内容顶部 -->
    <template
      v-if="
        $slots.meta ||
        $slots['meta-title'] ||
        $slots['meta-description'] ||
        $slots['meta-avatar'] ||
        hasMetaContent
      "
    >
      <slot v-if="$slots.meta" name="meta" />
      <ACardMeta v-else :title="props.metaTitle" :description="props.metaDescription">
        <template v-if="$slots['meta-avatar']" #avatar>
          <slot name="meta-avatar" />
        </template>
        <template v-if="$slots['meta-title']" #title>
          <slot name="meta-title" />
        </template>
        <template v-if="$slots['meta-description']" #description>
          <slot name="meta-description" />
        </template>
      </ACardMeta>
    </template>

    <slot />
  </ACard>
</template>

<style scoped lang="less">
@import url('./style.less');
</style>
