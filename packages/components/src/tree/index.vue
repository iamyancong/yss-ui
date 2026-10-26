<template>
  <div
    ref="rootElRef"
    class="y-tree"
    @vue:mounted="syncTreeVNodeClasses"
    @vue:updated="syncTreeVNodeClasses"
  >
    <div v-if="hasHeader" class="y-tree__header">
      <slot name="header-left" />
      <slot name="search">
        <AInput
          v-if="props.filterable"
          v-model:value="internalSearch"
          allow-clear
          :placeholder="resolvedSearchPlaceholder"
          size="small"
          v-bind="props.searchProps || {}"
        />
      </slot>
      <slot name="header-right" />
    </div>
    <ASpin :spinning="props.loading" :tip="resolvedLoadingTip" wrapper-class-name="y-tree__spin">
      <div class="y-tree__body" :class="{ 'y-tree__body--loading': props.loading && !hasTreeData }">
        <ATree
          ref="treeRef"
          v-bind="forwardedTreeProps"
          :tree-data="renderedTreeData"
          :field-names="fieldNames"
          @select="onTreeSelect"
        >
          <!-- 透传 antdv Tree 的内置插槽：title / switcherIcon / icon -->
          <template v-if="$slots.title" #title="scope">
            <slot name="title" v-bind="scope" />
          </template>
          <template v-else #title="treeNode">
            <div class="y-tree__title">
              <slot name="node-prefix" :node="getNodeData(treeNode)" />
              <slot name="node-title" :node="getNodeData(treeNode)" :text="getTitle(treeNode)">
                <ATooltip
                  :title="isOverflow(String(getNodeKey(treeNode))) ? getTitle(treeNode) : undefined"
                  :mouse-enter-delay="tooltipMouseEnterDelay"
                  :get-popup-container="getPopupContainer"
                >
                  <span :ref="setTextRef(String(getNodeKey(treeNode)))" class="y-tree__text">{{
                    getTitle(treeNode)
                  }}</span>
                </ATooltip>
              </slot>
              <slot name="node-suffix" :node="getNodeData(treeNode)" />
              <ADropdown
                v-if="getActions(treeNode).length"
                :trigger="dropdownTriggers"
                @click.stop="handleMoreClick(getNodeKey(treeNode), treeNode, $event)"
              >
                <template #overlay>
                  <AMenu>
                    <AMenuItem
                      v-for="a in getActions(treeNode)"
                      :key="a.key"
                      :disabled="a.disabled"
                      :danger="a.danger"
                      @click="onAction(a.key, treeNode)"
                    >
                      <template v-if="a.icon">
                        <component :is="a.icon" />
                      </template>
                      {{ a.label }}
                    </AMenuItem>
                  </AMenu>
                </template>
                <MoreOutlined
                  class="y-tree__more"
                  @click.stop="handleMoreClick(getNodeKey(treeNode), treeNode, $event)"
                />
              </ADropdown>
            </div>
          </template>
          <template v-if="$slots.switcherIcon" #switcherIcon="scope">
            <slot name="switcherIcon" v-bind="scope" />
          </template>
          <template v-if="$slots.icon" #icon="scope">
            <slot name="icon" v-bind="scope" />
          </template>
          <!-- 默认插槽占位（外层可用作自定义描述等，但 ATree 不消费 default） -->
          <slot />
        </ATree>
      </div>
    </ASpin>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useSlots, useAttrs, type VNode } from 'vue';
import type { PropType } from 'vue';
import {
  Tree as ATree,
  Input as AInput,
  Dropdown as ADropdown,
  Menu as AMenu,
  MenuItem as AMenuItem,
  Tooltip as ATooltip,
  Spin as ASpin,
} from 'ant-design-vue';
import { MoreOutlined } from '@ant-design/icons-vue';
import type { YTreeActionItem, YTreeFieldNames, YTreeKey } from './types';
import { useEllipsisTooltip } from './hooks/useEllipsisTooltip';
import { useTreeSearch } from './hooks/useTreeSearch';
import { useLocale } from '../locale/useLocale';

defineOptions({
  name: 'YTree',
  inheritAttrs: false,
});

const { t } = useLocale('tree');

/**
 * AntDV Tree 节点类型定义
 */
interface TreeNode {
  dataRef?: any;
  key?: string | number;
  [key: string]: any;
}

const attrs = useAttrs();

/**
 * 过滤后的透传属性
 * 由于组件内部显式绑定了 @select="onTreeSelect"，需要从 $attrs 中过滤掉 onSelect
 * 否则外部传入的 @select 会通过 $attrs 再次绑定，导致 ATree 收到数组类型的 onSelect
 */
const filteredAttrs = computed(() => {
  const { onSelect: _onSelect, ...rest } = attrs || {};
  return rest;
});

const treeRef = ref<InstanceType<typeof ATree> | null>(null);
const rootElRef = ref<HTMLElement | null>(null);

/**
 * 同步树组件内部结构语义类名（兼容自定义 ConfigProvider prefixCls）
 */
const syncTreeElementClasses = (root: HTMLElement | null | undefined): void => {
  if (!root) return;
  const spinEl = root.querySelector<HTMLElement>('.y-tree__spin');
  if (spinEl) {
    const nestedClass = Array.from(spinEl.classList).find(cls => cls.endsWith('-spin-nested-loading'));
    const spinPrefix = nestedClass ? nestedClass.slice(0, -'-spin-nested-loading'.length) : 'ant';
    spinEl.querySelectorAll<HTMLElement>(`.${spinPrefix}-spin-container`).forEach(el => {
      if (!el.classList.contains('y-tree__spin-container')) {
        el.classList.add('y-tree__spin-container');
      }
    });
  }

  const bodyEl = root.querySelector<HTMLElement>('.y-tree__body');
  if (!bodyEl) return;
  const isTreePrefixWithSubNodes = (el: HTMLElement, cls: string): boolean =>
    Boolean(el.querySelector(`.${cls}-list, .${cls}-treenode, .${cls}-node-content-wrapper`));

  const treeDivs = Array.from(bodyEl.querySelectorAll<HTMLElement>('div')).filter(el =>
    Array.from(el.classList).some(
      cls => cls !== 'y-tree' && cls !== 'y-tree__tree' && cls.endsWith('-tree')
    )
  );
  const treeRoot =
    treeDivs.find(el =>
      Array.from(el.classList).some(
        cls =>
          cls !== 'y-tree' &&
          cls !== 'y-tree__tree' &&
          cls.endsWith('-tree') &&
          isTreePrefixWithSubNodes(el, cls)
      )
    ) ?? treeDivs[0];
  if (!treeRoot) return;
  const treeCandidates = Array.from(treeRoot.classList).filter(
    cls => cls !== 'y-tree' && cls !== 'y-tree__tree' && cls.endsWith('-tree')
  );
  const treePrefix =
    treeCandidates.find(cls => isTreePrefixWithSubNodes(treeRoot, cls)) ?? treeCandidates[0];
  if (!treePrefix) return;

  if (!treeRoot.classList.contains('y-tree__tree')) {
    treeRoot.classList.add('y-tree__tree');
  }
  treeRoot.querySelectorAll<HTMLElement>(`.${treePrefix}-title`).forEach(el => {
    if (!el.classList.contains('y-tree__node-title')) {
      el.classList.add('y-tree__node-title');
    }
  });
  treeRoot.querySelectorAll<HTMLElement>(`.${treePrefix}-switcher`).forEach(el => {
    if (!el.classList.contains('y-tree__switcher')) {
      el.classList.add('y-tree__switcher');
    }
  });
  treeRoot.querySelectorAll<HTMLElement>(`.${treePrefix}-node-content-wrapper`).forEach(el => {
    if (!el.classList.contains('y-tree__node-content')) {
      el.classList.add('y-tree__node-content');
    }
    const isSelected = el.classList.contains(`${treePrefix}-node-selected`);
    if (isSelected && !el.classList.contains('y-tree__node-selected')) {
      el.classList.add('y-tree__node-selected');
    } else if (!isSelected && el.classList.contains('y-tree__node-selected')) {
      el.classList.remove('y-tree__node-selected');
    }
  });
};

const syncTreeVNodeClasses = (vnode: VNode): void => {
  if (vnode.el instanceof HTMLElement) {
    syncTreeElementClasses(vnode.el);
  }
};

let treeObserver: MutationObserver | null = null;
let treeSyncRafId: number | null = null;

const scheduleTreeClassSync = (): void => {
  if (treeSyncRafId !== null) return;
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    treeSyncRafId = window.requestAnimationFrame(() => {
      treeSyncRafId = null;
      syncTreeElementClasses(rootElRef.value);
    });
  } else {
    syncTreeElementClasses(rootElRef.value);
  }
};

onMounted(() => {
  if (rootElRef.value && typeof MutationObserver !== 'undefined') {
    syncTreeElementClasses(rootElRef.value);
    treeObserver = new MutationObserver(mutations => {
      const hasRelevantMutation = mutations.some(m => {
        if (m.type === 'childList') {
          return m.addedNodes.length > 0;
        }
        if (m.type === 'attributes' && m.target instanceof HTMLElement) {
          const classes = Array.from(m.target.classList);
          const isContentWrapper = classes.some(c => c.endsWith('-node-content-wrapper'));
          if (!isContentWrapper) return false;
          const isAntSelected = classes.some(
            c => c !== 'y-tree__node-selected' && c.endsWith('-node-selected')
          );
          const isYSelected = m.target.classList.contains('y-tree__node-selected');
          return !m.target.classList.contains('y-tree__node-content') || isAntSelected !== isYSelected;
        }
        return false;
      });
      if (hasRelevantMutation) {
        scheduleTreeClassSync();
      }
    });
    treeObserver.observe(rootElRef.value, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }
});

onBeforeUnmount(() => {
  if (treeSyncRafId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(treeSyncRafId);
    treeSyncRafId = null;
  }
  treeObserver?.disconnect();
  treeObserver = null;
});

const props = defineProps({
  treeData: {
    type: Array as PropType<any[]>,
    default: (): any[] => [],
  },
  height: Number,
  itemHeight: Number,
  virtual: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined,
  },
  fieldNames: {
    type: Object as PropType<YTreeFieldNames>,
    default: (): YTreeFieldNames => ({ title: 'title', key: 'key', children: 'children' }),
  },
  filterable: {
    type: Boolean,
    default: true,
  },
  searchValue: {
    type: String,
    default: '',
  },
  searchProps: {
    type: Object as PropType<Record<string, any>>,
    default: undefined,
  },
  ellipsisTooltip: {
    type: Boolean,
    default: true,
  },
  tooltipDelay: {
    type: Number,
    default: 500,
  },
  showActions: {
    type: Boolean,
    default: true,
  },
  getNodeActions: {
    type: Function as PropType<(node: any) => YTreeActionItem[]>,
    default: (_node: any) => [] as YTreeActionItem[],
  },
  actionTrigger: {
    type: [String, Array] as PropType<'hover' | 'click' | 'contextmenu' | Array<'hover' | 'click' | 'contextmenu'>>,
    default: 'click',
  },
  selectOnActionClick: {
    type: Boolean,
    default: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  loadingTip: {
    type: String,
    default: undefined,
  },
  selectedKeys: Array as PropType<YTreeKey[]>,
  expandedKeys: Array as PropType<YTreeKey[]>,
  checkedKeys: [Array, Object] as PropType<YTreeKey[] | { checked: YTreeKey[]; halfChecked: YTreeKey[] }>,
  loadedKeys: Array as PropType<YTreeKey[]>,
  defaultSelectedKeys: Array as PropType<YTreeKey[]>,
  defaultExpandedKeys: Array as PropType<YTreeKey[]>,
  defaultCheckedKeys: Array as PropType<YTreeKey[]>,
  selectable: {
    type: Boolean,
    default: true,
  },
  blockNode: {
    type: Boolean,
    default: true,
  },
  rootClassName: String,
  rootStyle: Object as PropType<Record<string, any>>,
  direction: String as PropType<'ltr' | 'rtl'>,
});

const emits = defineEmits<{
  (e: 'action', payload: { key: string; node: any }): void;
  (e: 'update:searchValue', value: string): void;
  (e: 'update:selectedKeys', keys: (string | number)[]): void;
  (e: 'select', selectedKeys: (string | number)[], info: { node: any; selected: boolean }): void;
}>();

/**
 * 下拉菜单触发方式
 * 支持单个或数组形式
 */
const dropdownTriggers = computed<Array<'hover' | 'click' | 'contextmenu'>>(() => {
  const trigger = props.actionTrigger;
  return Array.isArray(trigger) ? trigger : [trigger];
});

/**
 * 内部选中状态（支持非受控模式）
 * 当外部传入 selectedKeys 时使用外部值，否则使用内部状态
 */
const internalSelectedKeys = ref<(string | number)[]>([]);

/**
 * 计算实际使用的 selectedKeys
 * 优先使用外部传入的 selectedKeys，否则使用内部状态
 */
const actualSelectedKeys = computed(() => {
  return props.selectedKeys ?? internalSelectedKeys.value;
});

/**
 * 更新选中状态
 * 同时更新内部状态和触发外部事件
 */
const updateSelectedKeys = (keys: (string | number)[], nodeData: any) => {
  internalSelectedKeys.value = keys;
  emits('update:selectedKeys', keys);
  emits('select', keys, { node: nodeData, selected: true });
};

type RequiredFieldNames = { title: string; key: string; children: string };

/**
 * 字段名称配置
 * 提供默认值，确保字段映射正确
 */
const resolvedLoadingTip = computed(() => props.loadingTip ?? t('loadingTip'));
const resolvedSearchPlaceholder = computed(() => {
  return (props.searchProps?.placeholder as string) ?? t('searchPlaceholder');
});

const fieldNames = computed<RequiredFieldNames>(() => ({
  title: props.fieldNames?.title || 'title',
  key: props.fieldNames?.key || 'key',
  children: props.fieldNames?.children || 'children',
}));

// 使用 hook 处理搜索逻辑
const { internalSearch, visibleSource } = useTreeSearch(props, emits, fieldNames);

/**
 * 透传给 ATree 的 props
 * 排除 YTree 自定义 props，保留 ant-design-vue Tree 原生 props
 */
const passThroughProps = computed(() => {
  const {
    treeData: _treeData,
    fieldNames: _fieldNames,
    selectedKeys: _selectedKeys,
    filterable: _filterable,
    searchValue: _searchValue,
    searchProps: _searchProps,
    ellipsisTooltip: _ellipsisTooltip,
    tooltipDelay: _tooltipDelay,
    showActions: _showActions,
    getNodeActions: _getNodeActions,
    actionTrigger: _actionTrigger,
    selectOnActionClick: _selectOnActionClick,
    loading: _loading,
    loadingTip: _loadingTip,
    ...rest
  } = props;
  return {
    ...rest,
    selectedKeys: actualSelectedKeys.value,
  };
});

/**
 * 透传给 ATree 的完整属性
 * @description `$attrs` 中包含未显式声明的 AntDV Tree 原生属性和事件，需继续透传给内部 ATree。
 */
const forwardedTreeProps = computed(() => ({
  ...filteredAttrs.value,
  ...passThroughProps.value,
}));

/**
 * 渲染给 ATree 的数据
 * 保持 title 为原始值，避免塞 VNode
 */
const renderedTreeData = computed(() => {
  return visibleSource.value;
});

/**
 * 是否有树数据
 * 用于边界值处理：loading + 无数据时显示占位高度
 */
const hasTreeData = computed(() => {
  return Array.isArray(renderedTreeData.value) && renderedTreeData.value.length > 0;
});

const rootSlots = useSlots();

/**
 * 是否显示头部区域
 * 当有搜索框或自定义插槽时显示
 */
const hasHeader = computed(() => {
  return !!props.filterable || !!rootSlots['header-left'] || !!rootSlots['search'] || !!rootSlots['header-right'];
});

/**
 * 获取节点数据
 * 优先从 dataRef 获取，否则直接使用 node
 * @param node - 树节点对象
 * @returns 节点数据
 */
const getNodeData = (node: TreeNode): any => {
  return node.dataRef || node;
};

/**
 * 获取节点 key
 * @param node - 树节点对象
 * @returns 节点 key，如果不存在则返回空字符串
 */
const getNodeKey = (node: TreeNode): string | number => {
  const data = getNodeData(node);
  const f = fieldNames.value;
  const key = data?.[f.key] ?? data?.key;
  // 如果 key 不存在，返回空字符串（string 类型，符合 string | number）
  if (key === undefined || key === null) {
    return '';
  }
  return key;
};

/**
 * 获取节点标题
 * @param node - 树节点对象
 * @returns 节点标题文本
 */
const getTitle = (node: TreeNode): string => {
  const f = fieldNames.value;
  const data = getNodeData(node);
  const title = data?.[f.title] ?? data?.title;
  return String(title || '');
};

/**
 * 获取节点操作项列表
 * @param node - 树节点对象
 * @returns 操作项数组
 */
const getActions = (node: TreeNode): YTreeActionItem[] => {
  if (!props.showActions || !props.getNodeActions) {
    return [];
  }

  try {
    const data = getNodeData(node);
    return props.getNodeActions(data);
  } catch (e) {
    return [];
  }
};

/**
 * 处理 ATree 的 select 事件
 * 同步更新内部选中状态并触发外部事件
 * @param keys - 选中的节点 keys
 * @param info - 选中信息
 */
const onTreeSelect = (
  keys: (string | number)[],
  info: { node: any; selected: boolean; selectedNodes: any[]; nativeEvent: MouseEvent }
): void => {
  internalSelectedKeys.value = keys;
  emits('select', keys, info);
};

/**
 * 处理操作项点击事件
 * @param key - 操作项 key
 * @param node - 树节点对象
 */
const onAction = (key: string, node: TreeNode): void => {
  const data = getNodeData(node);
  emits('action', { key, node: data });
};

/**
 * 处理"更多"按钮点击事件
 * 根据 selectOnActionClick 配置决定是否自动选中当前节点
 * @param key - 节点 key
 * @param node - 树节点对象
 * @param event - 鼠标事件
 */
const handleMoreClick = (key: string | number, node: TreeNode, event: MouseEvent): void => {
  // 阻止事件冒泡，避免触发树节点的点击事件
  event.stopPropagation();

  // 如果不需要自动选中，直接返回
  if (!props.selectOnActionClick) {
    return;
  }

  // 如果树不可选中，直接返回
  if (!props.selectable) {
    return;
  }

  // 获取当前实际选中的节点 keys
  const currentSelectedKeys = actualSelectedKeys.value;
  const keyStr = String(key);
  const isSelected = currentSelectedKeys.some(k => String(k) === keyStr || k === key);

  // 如果节点未选中，更新选中状态
  if (!isSelected) {
    const nodeData = getNodeData(node);
    updateSelectedKeys([key], nodeData);
  }
};

// 文字省略浮层（按节点 key 维护）
const { setTextRef, isOverflow } = useEllipsisTooltip(computed(() => !!props.ellipsisTooltip));

/**
 * Tooltip 鼠标进入延迟时间（秒）
 */
const tooltipMouseEnterDelay = computed(() => (props.tooltipDelay || 0) / 1000);

/**
 * 获取弹层挂载容器
 * 默认挂载到 body
 */
const getPopupContainer = (): HTMLElement => {
  return document.body;
};
</script>
<style lang="less">
@import url('./index.less');
</style>
