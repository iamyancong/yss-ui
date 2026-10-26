<script setup lang="ts">
import { Collapse as ACollapse, Descriptions as ADescriptions, Tooltip as ATooltip } from 'ant-design-vue';
import { computed, inject, nextTick, onMounted, ref, type CSSProperties, type VNode } from 'vue';
import {
  DETAIL_RENDER_END_MARK,
  DETAIL_RENDER_EVENT,
  DETAIL_RENDER_MEASURE,
  DETAIL_RENDER_START_MARK,
} from '../../constants/perf';
import { SLOTS_KEY } from '../../hooks/useFormilySlots';
import { defaultRender, toDetailSlotName, type DescriptionsViewProps, type ItemNode } from './constant';
import { useLocale } from '../../../locale/useLocale';
import { useDescriptionsData } from './hooks/useDescriptionsData';

defineOptions({ name: 'DescriptionsView' });

const props = withDefaults(defineProps<DescriptionsViewProps>(), {
  columns: 3,
  bordered: true,
  hideEmpty: false,
  emptyPlaceholder: '-',
  form: undefined,
  responsive: true,
  maxColumns: 3,
  minColumns: 1,
  minWidth: 260,
  labelWidth: 120,
  groupByHeader: true,
  valueRenderMap: () => ({}),
  groupHeaderComponents: () => ['GroupHeader'],
  preserveContainers: () => ['FormCollapse'],
  hideEmptyPanels: true,
  showTooltip: true,
  tooltipProps: () => ({}),
});

const { t } = useLocale('formily');
const detailLabels = computed(() => ({ yes: t('yes'), no: t('no'), arraySeparator: t('arraySeparator') }));
const rootSlots = inject<any>(SLOTS_KEY, null);
const rootRef = ref<HTMLElement | null>(null);

const { values, finalColumns, renderSections, toPanelKeys, getValue } = useDescriptionsData(props, rootRef);

const getFormInstance = () => props.form?.value || props.form;

const getField = (item: ItemNode) => {
  const form = getFormInstance();
  return form && typeof form.query === 'function' ? form.query(item.path).take() : null;
};

const resolveRenderText = (item: ItemNode, vals: any, field: any) => {
  const v = getValue(vals, item.path);
  const custom = props.valueRenderMap?.[item.component || ''];
  if (typeof item.previewFormat === 'function') return item.previewFormat(v, item, vals);
  if (custom) return custom({ value: v, item, values: vals });

  if (field) {
    // 覆盖静态的 enum, dataSource 是组件内置标准字典结构
    const dynamicEnum = field.dataSource || item.enum;
    // 覆盖静态的 componentProps, 获取 eval 后的动态 props
    const dynamicProps = field.componentProps || item.componentProps;
    return defaultRender(
      { ...item, enum: dynamicEnum, componentProps: dynamicProps },
      v,
      props.emptyPlaceholder,
      detailLabels.value
    );
  }

  return defaultRender(item, v, props.emptyPlaceholder, detailLabels.value);
};

const displayMetaMap = computed(() => {
  const vals = values.value;
  const metaMap = new Map<string, { title: string; text: any }>();

  const setItemMeta = (item: ItemNode) => {
    const field = getField(item);
    metaMap.set(item.path, {
      title: field?.title ?? item.title,
      text: resolveRenderText(item, vals, field),
    });
  };

  renderSections.value.forEach(section => {
    if (section.kind === 'groups') {
      section.groups.forEach(group => {
        group.items.forEach(setItemMeta);
      });
      return;
    }

    section.panels.forEach(panel => {
      panel.groups.forEach(group => {
        group.items.forEach(setItemMeta);
      });
    });
  });

  return metaMap;
});

const getItemMeta = (item: ItemNode) =>
  displayMetaMap.value.get(item.path) ?? {
    title: item.title,
    text: resolveRenderText(item, values.value, getField(item)),
  };

/** Tooltip 弹层内容区默认样式：限制最大宽高，超出时滚动展示 */
const defaultTooltipOverlayInnerStyle: CSSProperties = {
  // minWidth: '420px',
  maxHeight: '360px',
  overflow: 'auto',
  wordBreak: 'break-all',
};

/** 计算合并后的 Tooltip Props，支持由外部扩展或覆盖默认样式 */
const mergedTooltipProps = computed(() => {
  const { overlayInnerStyle, ...rest } = props.tooltipProps || {};
  return {
    ...rest,
    overlayInnerStyle: {
      ...defaultTooltipOverlayInnerStyle,
      ...(overlayInnerStyle || {}),
    },
  };
});

const emitDetailPerf = async () => {
  await nextTick();
  if (typeof window === 'undefined' || typeof window.performance === 'undefined') return;

  try {
    window.performance.mark(DETAIL_RENDER_END_MARK);
    window.performance.measure(DETAIL_RENDER_MEASURE, DETAIL_RENDER_START_MARK, DETAIL_RENDER_END_MARK);
    const measures = window.performance.getEntriesByName(DETAIL_RENDER_MEASURE);
    const latestMeasure = measures[measures.length - 1];
    window.dispatchEvent(
      new CustomEvent(DETAIL_RENDER_EVENT, {
        detail: { duration: latestMeasure?.duration ?? 0 },
      })
    );
  } catch (error) {
    // 忽略不存在起始埋点的场景，例如非抽屉首屏查看态渲染
  } finally {
    window.performance.clearMarks(DETAIL_RENDER_START_MARK);
    window.performance.clearMarks(DETAIL_RENDER_END_MARK);
    window.performance.clearMeasures(DETAIL_RENDER_MEASURE);
  }
};

onMounted(() => {
  void emitDetailPerf();
});

/**
 * 同步 Descriptions 内部结构类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncDescriptionsClasses = (vnode: VNode) => {
  const root = vnode.el;
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll<HTMLElement>('.yss-descriptions').forEach(descEl => {
    const descPrefix = Array.from(descEl.classList).find(
      cls => cls !== 'yss-descriptions' && cls.endsWith('-descriptions')
    );
    if (!descPrefix) return;
    descEl.querySelectorAll<HTMLElement>(`.${descPrefix}-view`).forEach(viewEl => {
      viewEl.classList.add('yss-descriptions__view');
    });
    descEl.querySelectorAll<HTMLElement>(`.${descPrefix}-item-content`).forEach(contentEl => {
      contentEl.classList.add('yss-descriptions__item-content');
    });
  });
};
</script>

<template>
  <div
    ref="rootRef"
    style="width: 100%"
    @vue:mounted="syncDescriptionsClasses"
    @vue:updated="syncDescriptionsClasses"
  >
    <!-- 线性分组段 -->
    <template v-for="sec in renderSections" :key="sec.key">
      <template v-if="sec.kind === 'groups'">
        <div v-for="g in sec.groups" :key="g.key" class="yss-desc-group">
          <div v-if="g.title || g.description" class="yss-desc-group__header">
            <div class="yss-desc-group__title">{{ g.title }}</div>
            <div v-if="g.description" class="yss-desc-group__desc">{{ g.description }}</div>
          </div>

          <component
            :is="ADescriptions"
            class="yss-descriptions"
            :column="finalColumns"
            :bordered="bordered"
            size="middle"
          >
            <component
              :is="(ADescriptions as any).Item"
              v-for="it in g.items"
              :key="it.path"
              :label="getItemMeta(it).title"
              :span="it.span"
              :label-style="labelWidth ? { width: labelWidth + 'px' } : undefined"
            >
              <template v-if="rootSlots && rootSlots[toDetailSlotName(it.path)]">
                <component
                  :is="rootSlots[toDetailSlotName(it.path)]"
                  :value="getValue(values, it.path)"
                  :item="it"
                  :values="values"
                />
              </template>
              <template v-else>
                <component :is="ATooltip" v-if="showTooltip" v-bind="mergedTooltipProps" :title="getItemMeta(it).text">
                  <span class="yss-desc-ellipsis">{{ getItemMeta(it).text }}</span>
                </component>
                <span v-else class="yss-desc-ellipsis">{{ getItemMeta(it).text }}</span>
              </template>
            </component>
          </component>
        </div>
      </template>

      <!-- 折叠面板段 -->
      <template v-else>
        <component :is="ACollapse" :accordion="false" :default-active-key="toPanelKeys((sec as any).panels)">
          <component :is="(ACollapse as any).Panel" v-for="(p, pi) in (sec as any).panels" :key="pi" :header="p.header">
            <div v-for="g in p.groups" :key="g.key" class="yss-desc-group">
              <div v-if="g.title || g.description" class="yss-desc-group__header">
                <div class="yss-desc-group__title">{{ g.title }}</div>
                <div v-if="g.description" class="yss-desc-group__desc">{{ g.description }}</div>
              </div>
              <component
                :is="ADescriptions"
                class="yss-descriptions"
                :column="finalColumns"
                :bordered="bordered"
                size="middle"
              >
                <component
                  :is="(ADescriptions as any).Item"
                  v-for="it in g.items"
                  :key="it.path"
                  :label="getItemMeta(it).title"
                  :span="it.span"
                  :label-style="labelWidth ? { width: labelWidth + 'px' } : undefined"
                >
                  <template v-if="rootSlots && rootSlots[toDetailSlotName(it.path)]">
                    <component
                      :is="rootSlots[toDetailSlotName(it.path)]"
                      :value="getValue(values, it.path)"
                      :item="it"
                      :values="values"
                    />
                  </template>
                  <template v-else>
                    <component
                      :is="ATooltip"
                      v-if="showTooltip"
                      v-bind="mergedTooltipProps"
                      :title="getItemMeta(it).text"
                    >
                      <span class="yss-desc-ellipsis">{{ getItemMeta(it).text }}</span>
                    </component>
                    <span v-else class="yss-desc-ellipsis">{{ getItemMeta(it).text }}</span>
                  </template>
                </component>
              </component>
            </div>
          </component>
        </component>
      </template>
    </template>
  </div>
</template>

<style scoped lang="less">
@import url('./style.less');
</style>
