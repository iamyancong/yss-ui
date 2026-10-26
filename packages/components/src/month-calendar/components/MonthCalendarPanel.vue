<script setup lang="ts">
import { computed, type VNode } from 'vue';
import { Calendar as ACalendar, Spin as ASpin } from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/calendar/locale/zh_CN';
import zhTW from 'ant-design-vue/es/calendar/locale/zh_TW';
import enUS from 'ant-design-vue/es/calendar/locale/en_US';
import type { Dayjs } from 'dayjs';
import { MONTH_CALENDAR_WEEKDAYS } from '../constant';
import MonthCalendarCell from './MonthCalendarCell.vue';
import MonthCalendarDateLabel from './MonthCalendarDateLabel.vue';
import type {
  YMonthCalendarCellContext,
  YMonthCalendarPointerPayload,
  YMonthCalendarProps,
  YMonthCalendarTodayIndicator,
} from '../types';
import { useLocale } from '../../locale/useLocale';

defineOptions({ name: 'YMonthCalendarPanel' });

const props = defineProps<{
  calendarValue: Dayjs;
  displayMonth: Dayjs;
  selectedValue?: Dayjs;
  loading: boolean;
  loadingTip: string;
  showOutsideDays: boolean;
  contextMenuEnabled: boolean;
  todayText: string;
  todayIndicator: YMonthCalendarTodayIndicator;
  getCellContext: (date: Dayjs) => YMonthCalendarCellContext;
  cellClassName?: YMonthCalendarProps['cellClassName'];
  cellStyle?: YMonthCalendarProps['cellStyle'];
}>();

const { currentLocale, localeName } = useLocale('monthCalendar');

const calendarLocale = computed(() => ({ 'zh-CN': zhCN, 'zh-TW': zhTW, 'en-US': enUS })[localeName.value]);

const resolvedWeekdays = computed(() => {
  const weekdays = currentLocale.value?.monthCalendar?.weekdays;
  if (Array.isArray(weekdays) && weekdays.length === 7) return weekdays;
  return MONTH_CALENDAR_WEEKDAYS;
});

const emit = defineEmits<{
  click: [payload: YMonthCalendarPointerPayload];
  dblclick: [payload: YMonthCalendarPointerPayload];
  contextmenu: [payload: YMonthCalendarPointerPayload];
  keydown: [event: KeyboardEvent, context: YMonthCalendarCellContext];
}>();

/** 判断当前日期是否进入 Tab 键焦点序列。 */
const isFocusable = (date: Dayjs): boolean => {
  const context = props.getCellContext(date);
  return context.isSelected || (!props.selectedValue && date.isSame(props.displayMonth.startOf('month'), 'day'));
};

const PANEL_SUFFIX_MAP: ReadonlyArray<readonly [string, string]> = [
  ['-spin-container', 'y-month-calendar__spin-container'],
  ['-picker-calendar', 'y-month-calendar__calendar'],
  ['-picker-panel-container', 'y-month-calendar__panel-container'],
  ['-picker-panel', 'y-month-calendar__panel'],
  ['-picker-date-panel', 'y-month-calendar__date-panel'],
  ['-picker-body', 'y-month-calendar__picker-body'],
  ['-picker-content', 'y-month-calendar__picker-content'],
  ['-picker-cell', 'y-month-calendar__picker-cell'],
  ['-picker-cell-inner', 'y-month-calendar__picker-cell-inner'],
  ['-picker-calendar-date', 'y-month-calendar__calendar-date'],
  ['-picker-calendar-date-content', 'y-month-calendar__calendar-date-content'],
  ['-picker-calendar-date-value', 'y-month-calendar__calendar-date-value'],
];

/**
 * 同步日历面板内部结构类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncPanelClasses = (vnode: VNode): void => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;
  const spinEl = root.querySelector<HTMLElement>('.y-month-calendar__spin');
  if (!spinEl) return;
  const nestedClass = Array.from(spinEl.classList).find(cls => cls.endsWith('-spin-nested-loading'));
  const prefix = nestedClass ? nestedClass.slice(0, -'-spin-nested-loading'.length) : 'ant';

  for (const [suffix, semanticClass] of PANEL_SUFFIX_MAP) {
    spinEl.querySelectorAll<HTMLElement>(`.${prefix}${suffix}`).forEach(el => {
      el.classList.add(semanticClass);
    });
  }
};
</script>

<template>
  <div class="y-month-calendar__body-scroll">
    <div
      class="y-month-calendar__body"
      @vue:mounted="syncPanelClasses"
      @vue:updated="syncPanelClasses"
    >
      <div class="y-month-calendar__weekdays">
        <div v-for="(label, index) in resolvedWeekdays" :key="index">
          <slot name="weekday" :index="index" :label="label">{{ label }}</slot>
        </div>
      </div>
      <ASpin :spinning="loading" :tip="loadingTip" wrapper-class-name="y-month-calendar__spin">
        <slot v-if="loading" name="loading" />
        <ACalendar
          :key="displayMonth.format('YYYY-MM')"
          :value="calendarValue"
          :fullscreen="true"
          :locale="calendarLocale"
        >
          <template #headerRender />
          <template #dateFullCellRender="{ current }">
            <MonthCalendarCell
              :context="getCellContext(current)"
              :context-menu-enabled="contextMenuEnabled"
              :show-content="showOutsideDays || getCellContext(current).isCurrentMonth"
              :focusable="isFocusable(current)"
              :loading="loading"
              :custom-class="cellClassName?.(getCellContext(current))"
              :custom-style="cellStyle?.(getCellContext(current))"
              @click="emit('click', $event)"
              @dblclick="emit('dblclick', $event)"
              @contextmenu="emit('contextmenu', $event)"
              @keydown="emit('keydown', $event, getCellContext(current))"
            >
              <slot name="date-cell" v-bind="getCellContext(current)">
                <MonthCalendarDateLabel
                  :date-label="current.format('DD')"
                  :is-today="getCellContext(current).isToday"
                  :today-text="todayText"
                  :today-indicator="todayIndicator"
                />
              </slot>
              <slot name="date-cell-extra" v-bind="getCellContext(current)" />
            </MonthCalendarCell>
          </template>
        </ACalendar>
      </ASpin>
    </div>
  </div>
</template>
