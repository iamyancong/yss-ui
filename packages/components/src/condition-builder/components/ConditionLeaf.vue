<script setup lang="ts">
import type { VNode } from 'vue';
import { AutoComplete as AAutoComplete, Button as AButton, Select as ASelect } from 'ant-design-vue';
import type { ConditionBuilderContext } from '../hooks/useConditionBuilderContext';

defineOptions({ name: 'ConditionLeaf' });

const props = defineProps<{
  child: any;
  idx: number;
  disabled: boolean;
  canAddChildGroup: boolean;
  ctx: ConditionBuilderContext;
}>();

/**
 * 同步叶子节点内输入控件边框盒类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncLeafControlClasses = (vnode: VNode) => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;
  const controls = root.querySelectorAll<HTMLElement>('.field-select, .operator-select, .value-input');
  controls.forEach(control => {
    const selectorChild = Array.from(control.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        Array.from(child.classList).some(cls => cls.endsWith('-select-selector'))
    );
    if (selectorChild) {
      selectorChild.classList.add('y-condition-builder__control-box');
    } else {
      control.classList.add('y-condition-builder__control-box');
    }
  });
};
</script>

<template>
  <div
    class="simple-condition"
    @vue:mounted="syncLeafControlClasses"
    @vue:updated="syncLeafControlClasses"
  >
    <!-- 字段选择 (下拉选择模式) -->
    <ASelect
      v-if="props.ctx.props.fieldMode === 'select'"
      :value="child.field || undefined"
      :options="props.ctx.fieldOptions.value"
      :placeholder="props.ctx.t('fieldPlaceholder')"
      size="small"
      class="field-select"
      :class="{ 'is-error': props.ctx.errors.value[idx]?.field }"
      :disabled="disabled"
      show-search
      :filter-option="props.ctx.state.filterFieldOption"
      allow-clear
      @change="(val: any) => props.ctx.state.handleFieldChange(idx, val)"
      @blur="props.ctx.state.emitBlur"
    />

    <!-- 字段选择 (自动补全模式) -->
    <AAutoComplete
      v-else
      :value="props.ctx.state.getFieldLabel(child.field)"
      :options="props.ctx.fieldOptions.value"
      :placeholder="props.ctx.t('fieldPlaceholder')"
      size="small"
      class="field-select"
      :class="{ 'is-error': props.ctx.errors.value[idx]?.field }"
      :disabled="disabled"
      allow-clear
      @search="props.ctx.state.onSearchFields"
      @change="(val: any) => props.ctx.state.handleFieldChange(idx, val)"
      @blur="props.ctx.state.emitBlur"
    />

    <!-- 操作符选择 -->
    <ASelect
      :value="child.operator || undefined"
      :options="props.ctx.state.getOperatorOptionsSync(idx)"
      :placeholder="props.ctx.t('operatorPlaceholder')"
      size="small"
      class="operator-select"
      :class="{ 'is-error': props.ctx.errors.value[idx]?.operator }"
      :disabled="disabled || !child.field"
      @dropdown-visible-change="(vis: boolean) => vis && props.ctx.state.refreshOperatorOptions(idx)"
      @change="(val: any) => props.ctx.state.handleOperatorChange(idx, val)"
      @blur="props.ctx.state.emitBlur"
    />

    <!-- BETWEEN 操作符 -->
    <div v-if="props.ctx.state.getOperatorKind(idx) === 'between'" class="between-inputs">
      <AAutoComplete
        :value="props.ctx.state.getValueLabel(idx, props.ctx.state.betweenValues.value[idx]?.[0])"
        :options="props.ctx.valueOptionsMap.value[`${props.ctx.rootRef.value.children[idx]?.id}`] || []"
        :placeholder="props.ctx.t('startPlaceholder')"
        size="small"
        class="value-input between-input"
        :class="{ 'is-error': props.ctx.errors.value[idx]?.value }"
        :disabled="disabled"
        allow-clear
        @search="q => props.ctx.state.onSearchValues(idx, q)"
        @change="(val: any) => props.ctx.state.handleValueChange(idx, 0, val, 'between')"
        @dropdown-visible-change="(vis: boolean) => vis && props.ctx.state.onSearchValues(idx, '')"
        @blur="props.ctx.state.emitBlur"
      />
      <span class="between-separator">{{ props.ctx.t('betweenSeparator') }}</span>
      <AAutoComplete
        :value="props.ctx.state.getValueLabel(idx, props.ctx.state.betweenValues.value[idx]?.[1])"
        :options="props.ctx.valueOptionsMap.value[`${props.ctx.rootRef.value.children[idx]?.id}`] || []"
        :placeholder="props.ctx.t('endPlaceholder')"
        size="small"
        class="value-input between-input"
        :class="{ 'is-error': props.ctx.errors.value[idx]?.value }"
        :disabled="disabled"
        allow-clear
        @search="q => props.ctx.state.onSearchValues(idx, q)"
        @change="(val: any) => props.ctx.state.handleValueChange(idx, 1, val, 'between')"
        @dropdown-visible-change="(vis: boolean) => vis && props.ctx.state.onSearchValues(idx, '')"
        @blur="props.ctx.state.emitBlur"
      />
    </div>

    <!-- 多选值输入 -->
    <ASelect
      v-else-if="props.ctx.state.getOperatorKind(idx) === 'multiple'"
      :value="child.value"
      :options="props.ctx.valueOptionsMap.value[`${props.ctx.rootRef.value.children[idx]?.id}`] || []"
      :placeholder="props.ctx.t('selectPlaceholder')"
      size="small"
      class="value-input"
      :class="{ 'is-error': props.ctx.errors.value[idx]?.value }"
      mode="tags"
      :disabled="disabled"
      allow-clear
      max-tag-count="responsive"
      @search="q => props.ctx.state.onSearchValues(idx, q)"
      @change="(val: any) => props.ctx.state.handleValueChange(idx, -1, val, 'multiple')"
      @dropdown-visible-change="(vis: boolean) => vis && props.ctx.state.onSearchValues(idx, '')"
      @blur="props.ctx.state.emitBlur"
    />

    <!-- 普通值输入 -->
    <AAutoComplete
      v-else-if="props.ctx.state.getOperatorKind(idx) !== 'none'"
      :value="props.ctx.state.getValueLabel(idx, child.value)"
      :options="props.ctx.valueOptionsMap.value[`${props.ctx.rootRef.value.children[idx]?.id}`] || []"
      :placeholder="props.ctx.t('inputPlaceholder')"
      size="small"
      class="value-input"
      :class="{ 'is-error': props.ctx.errors.value[idx]?.value }"
      :disabled="disabled"
      allow-clear
      @search="q => props.ctx.state.onSearchValues(idx, q)"
      @change="(val: any) => props.ctx.state.handleValueChange(idx, -1, val, 'single')"
      @dropdown-visible-change="(vis: boolean) => vis && props.ctx.state.onSearchValues(idx, '')"
      @blur="props.ctx.state.emitBlur"
    />

    <!-- 操作按钮 -->
    <div class="condition-actions">
      <AButton
        type="text"
        size="small"
        class="action-btn add-btn"
        :title="props.ctx.t('addSibling')"
        :disabled="disabled"
        @click="props.ctx.state.addLeafAfter(idx)"
      >
        <template #icon>
          <span>+</span>
        </template>
      </AButton>
      <AButton
        v-if="props.ctx.state.shouldShowRemoveButton(idx)"
        type="text"
        size="small"
        class="action-btn remove-btn"
        :title="props.ctx.t('remove')"
        :disabled="disabled"
        @click="props.ctx.state.onRemove([idx])"
      >
        <template #icon>
          <span>-</span>
        </template>
      </AButton>
      <AButton
        type="text"
        size="small"
        class="action-btn group-btn"
        :disabled="disabled || !canAddChildGroup"
        :title="props.ctx.t('addChild')"
        @click="props.ctx.state.addChildGroup(idx)"
      >
        {{ props.ctx.t('childGroup') }}
      </AButton>
    </div>
  </div>
</template>
