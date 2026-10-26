<script setup lang="ts">
/**
 * YCron 组件
 * @description Cron 表达式可视化编辑器，支持左右分栏布局
 */
import { watch, computed } from 'vue';
import { Radio, InputNumber, Select, SelectOption, Button, Tooltip } from 'ant-design-vue';
import { CalendarOutlined, ClockCircleOutlined, FieldTimeOutlined } from '@ant-design/icons-vue';
import { useLocale } from '../locale/useLocale';
import { DIMENSION_CONFIGS, WEEK_OPTIONS, generateOptions, type DayMode } from './constant';
import { useCronState } from './hooks/useCronState';
import type { CronDimension } from './types';
import { copyToClipboard } from '@yss-ui/utils';

defineOptions({ name: 'YCron' });

const { currentLocale } = useLocale('cron');

const props = withDefaults(
  defineProps<{
    /** 绑定值（Cron 表达式） */
    modelValue?: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示秒 */
    showSecond?: boolean;
    /** 是否显示年 */
    showYear?: boolean;
  }>(),
  {
    modelValue: '',
    disabled: false,
    showSecond: true,
    showYear: true,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

// 状态管理
const { activeDimension, cronState, dayMode, cronExpression, parseExpression, reset } = useCronState(props.modelValue);

const resolvedWeekOptions = computed(() => {
  const weeks = (currentLocale.value?.cron as any)?.weeks;
  if (!Array.isArray(weeks) || weeks.length < 7) return WEEK_OPTIONS;
  return [
    { label: weeks[0], value: 'SUN', num: 1 },
    { label: weeks[1], value: 'MON', num: 2 },
    { label: weeks[2], value: 'TUE', num: 3 },
    { label: weeks[3], value: 'WED', num: 4 },
    { label: weeks[4], value: 'THU', num: 5 },
    { label: weeks[5], value: 'FRI', num: 6 },
    { label: weeks[6], value: 'SAT', num: 7 },
  ];
});

const resolvedDimensionConfigs = computed(() => {
  const dim = (currentLocale.value?.cron as any)?.dimensions;
  return DIMENSION_CONFIGS.map(config => ({
    ...config,
    label: (dim as any)?.[config.key] ?? config.label,
  }));
});

const controls = computed(() => (currentLocale.value?.cron as any)?.controls);

// 监听外部值变化
watch(
  () => props.modelValue,
  newVal => {
    if (newVal && newVal !== cronExpression.value) {
      parseExpression(newVal);
    }
  }
);

// 监听内部表达式变化，同步到外部（immediate 确保初始化时也同步）
watch(
  cronExpression,
  newVal => {
    emit('update:modelValue', newVal);
    emit('change', newVal);
  },
  { immediate: true }
);

/**
 * 获取当前维度的配置
 */
const currentDimensionConfig = computed(() => {
  return resolvedDimensionConfigs.value.find(c => c.key === activeDimension.value);
});

/**
 * 获取当前维度的选项列表
 */
const currentOptions = computed(() => {
  const config = currentDimensionConfig.value;
  if (!config) return [];
  return generateOptions(config.min, config.max);
});

/**
 * 获取当前维度的状态
 */
const currentState = computed(() => {
  return cronState.value[activeDimension.value];
});

/**
 * 更新当前维度的模式
 */
const updateMode = (mode: string) => {
  (cronState.value[activeDimension.value] as any).mode = mode;
};

/**
 * 更新当前维度的间隔配置
 */
const updateInterval = (field: 'intervalStart' | 'intervalStep', value: number | null) => {
  if (value !== null) {
    (cronState.value[activeDimension.value] as any)[field] = value;
  }
};

/**
 * 更新当前维度的指定值
 */
const updateSpecific = (values: unknown) => {
  (cronState.value[activeDimension.value] as any).specificValues = values as number[];
};

/**
 * 更新当前维度的范围配置
 */
const updateRange = (field: 'rangeStart' | 'rangeEnd', value: number | null) => {
  if (value !== null) {
    (cronState.value[activeDimension.value] as any)[field] = value;
  }
};

/**
 * 天维度的模式更新
 */
const updateDayMode = (mode: DayMode) => {
  dayMode.value = mode;
};

/**
 * 导航维度列表（过滤掉不显示的维度）
 */
const navDimensions = computed(() => {
  return resolvedDimensionConfigs.value.filter(config => {
    if (config.key === 'second' && !props.showSecond) return false;
    if (config.key === 'year' && !props.showYear) return false;
    return true;
  });
});

/**
 * 处理导航点击
 */
const handleNavClick = (dimension: CronDimension) => {
  activeDimension.value = dimension;
};

/**
 * 复制表达式到剪贴板
 */
const copyExpression = async () => {
  await copyToClipboard(cronExpression.value);
};
</script>

<template>
  <div class="y-cron" :class="{ 'y-cron--disabled': disabled }">
    <!-- 主体区域 -->
    <div class="y-cron__body">
      <!-- 左侧导航 -->
      <div class="y-cron__nav">
        <div
          v-for="config in navDimensions"
          :key="config.key"
          class="y-cron__nav-item"
          :class="{ 'y-cron__nav-item--active': activeDimension === config.key }"
          @click="handleNavClick(config.key)"
        >
          <CalendarOutlined v-if="['day', 'month', 'year'].includes(config.key)" class="y-cron__nav-item-icon" />
          <ClockCircleOutlined v-else-if="['hour', 'minute'].includes(config.key)" class="y-cron__nav-item-icon" />
          <FieldTimeOutlined v-else class="y-cron__nav-item-icon" />
          {{ config.label }}
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="y-cron__content">
        <!-- 秒/分/时/月/年 通用配置 -->
        <template v-if="activeDimension !== 'day'">
          <!-- 每一个 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': currentState.mode === 'every' }">
            <label class="y-cron__radio-label" @click="updateMode('every')">
              <Radio :checked="currentState.mode === 'every'" :disabled="disabled" />
              {{ controls?.everyPrefix }}{{ currentDimensionConfig?.label }}
            </label>
          </div>

          <!-- 间隔 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': currentState.mode === 'interval' }">
            <label class="y-cron__radio-label" @click="updateMode('interval')">
              <Radio :checked="currentState.mode === 'interval'" :disabled="disabled" />
              {{ controls?.everyInterval }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="currentState.intervalStep"
                :min="1"
                :max="currentDimensionConfig?.max"
                :disabled="disabled || currentState.mode !== 'interval'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => updateInterval('intervalStep', v as number | null)"
              />
              <span class="control-text">{{ currentDimensionConfig?.label }} {{ controls?.from }}</span>
              <InputNumber
                :value="currentState.intervalStart"
                :min="currentDimensionConfig?.min"
                :max="currentDimensionConfig?.max"
                :disabled="disabled || currentState.mode !== 'interval'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => updateInterval('intervalStart', v as number | null)"
              />
              <span class="control-text">{{ currentDimensionConfig?.label }}{{ controls?.start }}</span>
            </div>
          </div>

          <!-- 指定 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': currentState.mode === 'specific' }">
            <label class="y-cron__radio-label" @click="updateMode('specific')">
              <Radio :checked="currentState.mode === 'specific'" :disabled="disabled" />
              {{ controls?.specificPrefix }}{{ currentDimensionConfig?.label }}
            </label>
            <div class="y-cron__controls">
              <Select
                :value="currentState.specificValues"
                mode="multiple"
                :disabled="disabled || currentState.mode !== 'specific'"
                :placeholder="controls?.selectPlaceholder"
                style="min-width: 200px"
                size="small"
                class="y-cron__select"
                @update:value="updateSpecific"
              >
                <SelectOption v-for="opt in currentOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectOption>
              </Select>
            </div>
          </div>

          <!-- 范围 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': currentState.mode === 'range' }">
            <label class="y-cron__radio-label" @click="updateMode('range')">
              <Radio :checked="currentState.mode === 'range'" :disabled="disabled" />
              {{ controls?.rangePrefix }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="currentState.rangeStart"
                :min="currentDimensionConfig?.min"
                :max="currentDimensionConfig?.max"
                :disabled="disabled || currentState.mode !== 'range'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => updateRange('rangeStart', v as number | null)"
              />
              <span class="control-text">{{ controls?.to }}</span>
              <InputNumber
                :value="currentState.rangeEnd"
                :min="currentDimensionConfig?.min"
                :max="currentDimensionConfig?.max"
                :disabled="disabled || currentState.mode !== 'range'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => updateRange('rangeEnd', v as number | null)"
              />
              <span class="control-text">{{ currentDimensionConfig?.label }}</span>
            </div>
          </div>
        </template>

        <!-- 天维度特殊配置 -->
        <template v-else>
          <!-- 每一天 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'every' }">
            <label class="y-cron__radio-label" @click="updateDayMode('every')">
              <Radio :checked="dayMode === 'every'" :disabled="disabled" />
              {{ controls?.every }}{{ controls?.day }}
            </label>
          </div>

          <!-- 每隔 N 周 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'weekInterval' }">
            <label class="y-cron__radio-label" @click="updateDayMode('weekInterval')">
              <Radio :checked="dayMode === 'weekInterval'" :disabled="disabled" />
              {{ controls?.interval }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="cronState.day.weekIntervalStep"
                :min="1"
                :max="7"
                :disabled="disabled || dayMode !== 'weekInterval'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.weekIntervalStep = v as number)"
              />
              <span class="control-text">{{ controls?.week }} {{ controls?.from }}</span>
              <Select
                :value="cronState.day.weekIntervalStart"
                :disabled="disabled || dayMode !== 'weekInterval'"
                style="width: 100px"
                size="small"
                class="y-cron__select"
                @update:value="(v: unknown) => (cronState.day.weekIntervalStart = v as number)"
              >
                <SelectOption v-for="opt in resolvedWeekOptions" :key="opt.num" :value="opt.num">
                  {{ opt.label }}
                </SelectOption>
              </Select>
              <span class="control-text">{{ controls?.start }}</span>
            </div>
          </div>

          <!-- 每隔 N 天 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'dayInterval' }">
            <label class="y-cron__radio-label" @click="updateDayMode('dayInterval')">
              <Radio :checked="dayMode === 'dayInterval'" :disabled="disabled" />
              {{ controls?.interval }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="cronState.day.intervalStep"
                :min="1"
                :max="31"
                :disabled="disabled || dayMode !== 'dayInterval'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.intervalStep = v as number)"
              />
              <span class="control-text">{{ controls?.day }} {{ controls?.from }}</span>
              <InputNumber
                :value="cronState.day.intervalStart"
                :min="1"
                :max="31"
                :disabled="disabled || dayMode !== 'dayInterval'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.intervalStart = v as number)"
              />
              <span class="control-text">{{ controls?.dayStartSuffix }}</span>
            </div>
          </div>

          <!-- 指定星期 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'weekSpecific' }">
            <label class="y-cron__radio-label" @click="updateDayMode('weekSpecific')">
              <Radio :checked="dayMode === 'weekSpecific'" :disabled="disabled" />
              {{ controls?.specificWeek }}
            </label>
            <div class="y-cron__controls">
              <Select
                :value="cronState.day.weekSpecificValues"
                mode="multiple"
                :disabled="disabled || dayMode !== 'weekSpecific'"
                :placeholder="controls?.selectPlaceholder"
                style="min-width: 200px"
                size="small"
                class="y-cron__select"
                @update:value="(v: unknown) => (cronState.day.weekSpecificValues = v as string[])"
              >
                <SelectOption v-for="opt in resolvedWeekOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectOption>
              </Select>
            </div>
          </div>

          <!-- 指定日期 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'daySpecific' }">
            <label class="y-cron__radio-label" @click="updateDayMode('daySpecific')">
              <Radio :checked="dayMode === 'daySpecific'" :disabled="disabled" />
              {{ controls?.specificDay }}
            </label>
            <div class="y-cron__controls">
              <Select
                :value="cronState.day.specificValues"
                mode="multiple"
                :disabled="disabled || dayMode !== 'daySpecific'"
                :placeholder="controls?.selectPlaceholder"
                style="min-width: 200px"
                size="small"
                class="y-cron__select"
                @update:value="(v: unknown) => (cronState.day.specificValues = v as number[])"
              >
                <SelectOption v-for="i in 31" :key="i" :value="i"> {{ i }}{{ controls?.daySuffix }} </SelectOption>
              </Select>
            </div>
          </div>

          <!-- 本月最后一天 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'lastDay' }">
            <label class="y-cron__radio-label" @click="updateDayMode('lastDay')">
              <Radio :checked="dayMode === 'lastDay'" :disabled="disabled" />
              {{ controls?.lastDayOfMonth }}
            </label>
          </div>

          <!-- 本月最后一个工作日 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'lastWeekday' }">
            <label class="y-cron__radio-label" @click="updateDayMode('lastWeekday')">
              <Radio :checked="dayMode === 'lastWeekday'" :disabled="disabled" />
              {{ controls?.lastWeekdayOfMonth }}
            </label>
          </div>

          <!-- 本月最后一个星期 X -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'lastWeekOfMonth' }">
            <label class="y-cron__radio-label" @click="updateDayMode('lastWeekOfMonth')">
              <Radio :checked="dayMode === 'lastWeekOfMonth'" :disabled="disabled" />
              {{ controls?.lastWeekOfMonthPrefix }}
            </label>
            <div class="y-cron__controls">
              <Select
                :value="cronState.day.lastWeekOfMonth"
                :disabled="disabled || dayMode !== 'lastWeekOfMonth'"
                style="width: 100px"
                size="small"
                class="y-cron__select"
                @update:value="(v: unknown) => (cronState.day.lastWeekOfMonth = v as number)"
              >
                <SelectOption v-for="opt in resolvedWeekOptions" :key="opt.num" :value="opt.num">
                  {{ opt.label }}
                </SelectOption>
              </Select>
            </div>
          </div>

          <!-- 月底前 N 天 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'beforeEnd' }">
            <label class="y-cron__radio-label" @click="updateDayMode('beforeEnd')">
              <Radio :checked="dayMode === 'beforeEnd'" :disabled="disabled" />
              {{ controls?.beforeEndOfMonth }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="cronState.day.daysBeforeEnd"
                :min="1"
                :max="31"
                :disabled="disabled || dayMode !== 'beforeEnd'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.daysBeforeEnd = v as number)"
              />
              <span class="control-text">{{ controls?.day }}</span>
            </div>
          </div>

          <!-- 最近工作日 -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'nearestWeekday' }">
            <label class="y-cron__radio-label" @click="updateDayMode('nearestWeekday')">
              <Radio :checked="dayMode === 'nearestWeekday'" :disabled="disabled" />
              {{ controls?.nearestWeekdayDistance }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="cronState.day.nearestWeekday"
                :min="1"
                :max="31"
                :disabled="disabled || dayMode !== 'nearestWeekday'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.nearestWeekday = v as number)"
              />
              <span class="control-text">{{ controls?.nearestWeekdaySuffix }}</span>
            </div>
          </div>

          <!-- 第 N 个星期 X -->
          <div class="y-cron__option" :class="{ 'y-cron__option--selected': dayMode === 'nthWeekday' }">
            <label class="y-cron__radio-label" @click="updateDayMode('nthWeekday')">
              <Radio :checked="dayMode === 'nthWeekday'" :disabled="disabled" />
              {{ controls?.nthWeekdayPrefix }}
            </label>
            <div class="y-cron__controls">
              <InputNumber
                :value="cronState.day.nthWeekday.nth"
                :min="1"
                :max="5"
                :disabled="disabled || dayMode !== 'nthWeekday'"
                size="small"
                class="y-cron__input-number"
                @update:value="(v: unknown) => v !== null && (cronState.day.nthWeekday.nth = v as number)"
              />
              <span class="control-text">{{ controls?.nthWeekdayUnit }}</span>
              <Select
                :value="cronState.day.nthWeekday.day"
                :disabled="disabled || dayMode !== 'nthWeekday'"
                style="width: 100px"
                size="small"
                class="y-cron__select"
                @update:value="(v: unknown) => (cronState.day.nthWeekday.day = v as number)"
              >
                <SelectOption v-for="opt in resolvedWeekOptions" :key="opt.num" :value="opt.num">
                  {{ opt.label }}
                </SelectOption>
              </Select>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 底部表达式 -->
    <div class="y-cron__footer">
      <div class="y-cron__expression">
        <span class="y-cron__expression-label">{{ controls?.expression }}</span>
        <Tooltip :title="cronExpression" placement="topLeft">
          <span class="y-cron__expression-value" @click="copyExpression">
            {{ cronExpression }}
          </span>
        </Tooltip>
      </div>
      <div class="y-cron__actions">
        <Button size="small" @click="reset">{{ controls?.reset }}</Button>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
@import url('./style.less');
</style>
