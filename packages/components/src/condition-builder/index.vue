<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue';
import type { YConditionBuilderProps, YConditionExpose } from './types';
import type { ConditionGroup } from '@yss-ui/components';
import { useConditionBuilderContext } from './hooks/useConditionBuilderContext';
import ConditionLeaf from './components/ConditionLeaf.vue';

defineOptions({ name: 'YConditionBuilder' });

const props = withDefaults(
  defineProps<YConditionBuilderProps & { andText?: string; orText?: string; isRoot?: boolean; depth?: number }>(),
  {
    maxDepth: 3,
    operatorOptions: undefined,
    andText: undefined,
    orText: undefined,
    isRoot: true,
    disabled: false,
    depth: 1,
    strictMode: true,
    fieldMode: 'autocomplete',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: ConditionGroup): void;
  (e: 'change', v: ConditionGroup): void;
  (e: 'validate', valid: boolean): void;
  (e: 'blur', v: ConditionGroup): void;
  (e: 'remove'): void;
}>();

const ctx = useConditionBuilderContext(props, emit);

defineExpose<YConditionExpose>({
  validate: ctx.validate,
  getValue: ctx.getValue,
  setValue: ctx.setValue,
  addLeaf: ctx.addLeaf,
  addGroup: ctx.addGroup,
  remove: ctx.remove,
});
</script>

<template>
  <div class="condition-builder">
    <div
      class="condition-group"
      :class="{
        'is-root': isRoot,
        'operator-and': ctx.rootRef.value.logicalOp === 'AND',
        'operator-or': ctx.rootRef.value.logicalOp === 'OR',
        'has-multiple-conditions': isRoot && ctx.rootRef.value.children.length > 1,
        'is-disabled': props.disabled,
      }"
    >
      <div
        v-if="!isRoot || (isRoot && ctx.rootRef.value.children.length > 1)"
        :class="[
          'logic-operator',
          ctx.rootRef.value.logicalOp === 'AND' ? 'operator-and' : 'operator-or',
          { 'is-disabled': props.disabled },
        ]"
      >
        <div
          :class="['logic-btn', ctx.rootRef.value.logicalOp === 'AND' ? 'logic-and' : 'logic-or']"
          @click="!props.disabled && ctx.state.onToggleRoot()"
        >
          {{ ctx.rootRef.value.logicalOp === 'AND' ? ctx.resolvedAndText.value : ctx.resolvedOrText.value }}
        </div>
      </div>

      <div class="condition-content">
        <div class="condition-items">
          <div
            v-for="(child, idx) in ctx.rootRef.value.children"
            :key="child.id"
            class="condition-item"
            :class="{ 'is-group': child.type === 'GROUP' }"
          >
            <ConditionLeaf
              v-if="child.type === 'LEAF'"
              :child="child"
              :idx="idx"
              :disabled="props.disabled"
              :can-add-child-group="props.depth < props.maxDepth + 2"
              :ctx="ctx"
            />

            <YConditionBuilder
              v-else-if="child.type === 'GROUP'"
              :ref="(el: any) => ctx.setNestedRef(el, idx)"
              :model-value="child as any"
              :operator-options="props.operatorOptions"
              :get-operators="props.getOperators"
              :load-fields="ctx.loadFieldsWrapper"
              :load-values="props.loadValues"
              :max-depth="props.maxDepth"
              :and-text="ctx.resolvedAndText.value"
              :or-text="ctx.resolvedOrText.value"
              :is-root="false"
              :disabled="props.disabled"
              :field-mode="props.fieldMode"
              :depth="props.depth + 1"
              @update:model-value="(val: any) => ctx.handleNestedChange(val, idx)"
              @blur="ctx.state.emitBlur"
              @remove="ctx.state.onRemove([idx])"
            />
          </div>
        </div>

        <div v-if="isRoot && ctx.rootRef.value.children.length === 0" class="root-actions">
          <AButton type="primary" size="small" @click="ctx.addLeaf()">
            <template #icon>
              <span>+</span>
            </template>
            {{ ctx.t('addCondition') }}
          </AButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less">
@import url('./style.less');
</style>
