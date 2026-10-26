import { mount, type VueWrapper } from '@vue/test-utils';
import { ConfigProvider, Card } from 'ant-design-vue';
import { defineComponent, getCurrentInstance, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableHeight } from '../index';
import {
  ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION,
  resolveConfigProviderPrefixCls,
} from '../resolveConfigProviderPrefixCls';

vi.mock('@vueuse/core', () => ({
  useResizeObserver: () => {},
}));

const wrappers: VueWrapper[] = [];

const createRect = (height: number, width = 300): DOMRect =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (
      this.classList.contains('custom-card-head') ||
      this.classList.contains('ant-card-head') ||
      this.classList.contains('y-card__head')
    ) {
      return createRect(56);
    }
    if (
      this.classList.contains('custom-card-body') ||
      this.classList.contains('ant-card-body') ||
      this.classList.contains('y-card__body')
    ) {
      return createRect(500);
    }
    // 业务自定义 .order-card-head / .order-card-body 使用不同高度，验证绝不会被误扣或误定位
    if (this.classList.contains('order-card-head')) {
      return createRect(80);
    }
    if (this.classList.contains('order-card-body')) {
      return createRect(320);
    }
    // 外层 Card 根节点给 600，验证 ref 绑在 Card 上时实际测量的是 500 的 Card Body 而非 600 的外层
    if (
      this.classList.contains('y-card') ||
      this.classList.contains('ant-card') ||
      this.classList.contains('custom-card')
    ) {
      return createRect(600);
    }
    return createRect(500);
  });
});

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('useTableHeight Card 识别与自定义 prefixCls', () => {
  it('锁住 ant-design-vue ConfigProvider 内部 Symbol("configProvider") 注入名称契约', () => {
    let matchedSymbolDesc: string | undefined;
    let resolvedCardPrefix: string | undefined;

    const Probe = defineComponent({
      setup() {
        const instance = getCurrentInstance() as unknown as { provides?: Record<PropertyKey, unknown> } | null;
        let cur = instance?.provides;
        while (cur && !matchedSymbolDesc) {
          const cpSym = Object.getOwnPropertySymbols(cur).find(
            s => s.description === ANTD_CONFIG_PROVIDER_SYMBOL_DESCRIPTION
          );
          if (cpSym) {
            matchedSymbolDesc = cpSym.description;
          }
          cur = Object.getPrototypeOf(cur);
        }
        resolvedCardPrefix = resolveConfigProviderPrefixCls('card');
        return () => h('div');
      },
    });

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () => h(Probe));
        },
      })
    );
    wrappers.push(wrapper);

    expect(matchedSymbolDesc).toBe('configProvider');
    expect(resolvedCardPrefix).toBe('custom-card');
  });

  it('在 ConfigProvider prefixCls="custom" 下准确扣除 custom-card-head 高度并定位 custom-card-body', async () => {
    let tableHeight = ref(0);

    const InnerTableHost = defineComponent({
      name: 'InnerTableHost',
      setup() {
        const cardRef = ref();
        ({ tableHeight } = useTableHeight(cardRef, {
          minHeight: 100,
          defaultHeight: 200,
          withPagination: true,
        }));
        return () =>
          h(
            Card,
            { ref: cardRef, title: '用户列表', class: 'y-card' },
            {
              default: () => h('div', { class: 'table-placeholder' }, 'table'),
            }
          );
      },
    });

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () => h(InnerTableHost));
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    // 500 (custom-card-body) - 56 (custom-card-head) - 48 (pagination) = 396
    expect(wrapper.find('.custom-card').exists()).toBe(true);
    expect(wrapper.find('.custom-card-head').exists()).toBe(true);
    expect(wrapper.find('.custom-card-body').exists()).toBe(true);
    expect(wrapper.find('.ant-card').exists()).toBe(false);
    expect(tableHeight.value).toBe(396);
  });

  it('当 tableAreaRef 为 custom-card 内部普通容器时，仍能向上识别 custom-card 并扣除头部高度', async () => {
    let tableHeight = ref(0);

    const InnerHost = defineComponent({
      setup() {
        const areaRef = ref<HTMLDivElement>();
        ({ tableHeight } = useTableHeight(areaRef, {
          minHeight: 100,
          defaultHeight: 200,
        }));
        return () =>
          h(
            Card,
            { title: '卡片标题' },
            {
              default: () => h('div', { ref: areaRef, class: 'inner-table-area' }),
            }
          );
      },
    });

    const wrapper = mount(
      defineComponent({
        render() {
          return h(ConfigProvider, { prefixCls: 'custom' }, () => h(InnerHost));
        },
      }),
      { attachTo: document.body }
    );
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    // 500 (areaRef) - 56 (custom-card-head) = 444
    expect(tableHeight.value).toBe(444);
  });

  it('默认前缀的 .ant-card 带标题时，准确扣除 .ant-card-head 高度', async () => {
    let tableHeight = ref(0);

    const DefaultCardHost = defineComponent({
      setup() {
        const areaRef = ref<HTMLDivElement>();
        ({ tableHeight } = useTableHeight(areaRef, {
          minHeight: 100,
          defaultHeight: 200,
          withPagination: true,
        }));
        return () =>
          h(
            Card,
            { title: '默认前缀卡片' },
            {
              default: () => h('div', { ref: areaRef, class: 'default-table-area' }),
            }
          );
      },
    });

    const wrapper = mount(DefaultCardHost, { attachTo: document.body });
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    expect(wrapper.find('.ant-card').exists()).toBe(true);
    expect(wrapper.find('.ant-card-head').exists()).toBe(true);
    // 500 (areaRef) - 56 (ant-card-head) - 48 (pagination) = 396
    expect(tableHeight.value).toBe(396);
  });

  it('ref 直接绑在 YCard 组件实例上时，自动定位内部 Card Body (.y-card__body) 并扣除标题高度', async () => {
    let tableHeight = ref(0);

    const YCardStub = defineComponent({
      name: 'YCardStub',
      setup(_, { slots }) {
        return () =>
          h('div', { class: ['y-card', 'order-card', 'ant-card'] }, [
            h('div', { class: ['ant-card-head', 'y-card__head'] }, '标题'),
            h('div', { class: ['ant-card-body', 'y-card__body'] }, slots.default?.()),
          ]);
      },
    });

    const Host = defineComponent({
      setup() {
        const yCardRef = ref();
        ({ tableHeight } = useTableHeight(yCardRef, {
          minHeight: 100,
          defaultHeight: 200,
        }));
        return () => h(YCardStub, { ref: yCardRef }, () => h('div', { class: 'table-content' }));
      },
    });

    const wrapper = mount(Host, { attachTo: document.body });
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    // 若未定位到 y-card__body，则会按外层 y-card (600) 计算得到 544；定位到 y-card__body (500) 后扣除 head (56) = 444
    expect(tableHeight.value).toBe(444);
  });

  it('不在任何 Card 容器内时，直接按目标容器高度计算且不扣除卡片头部', async () => {
    let tableHeight = ref(0);

    const PlainHost = defineComponent({
      setup() {
        const areaRef = ref<HTMLDivElement>();
        ({ tableHeight } = useTableHeight(areaRef, {
          minHeight: 100,
          defaultHeight: 200,
          withToolbar: true,
        }));
        return () =>
          h('div', { class: 'page-wrapper' }, [
            h('div', { ref: areaRef, class: 'plain-table-area' }),
          ]);
      },
    });

    const wrapper = mount(PlainHost, { attachTo: document.body });
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    // 500 (areaRef) - 48 (toolbar) = 452
    expect(tableHeight.value).toBe(452);
  });

  it('外层是业务自定义 .order-card（含 .order-card-head 与 .order-card-body）时，不能被误认成 Card', async () => {
    let innerTableHeight = ref(0);
    let directRefTableHeight = ref(0);

    const BusinessCardHost = defineComponent({
      setup() {
        const innerAreaRef = ref<HTMLDivElement>();
        const orderCardRef = ref<HTMLDivElement>();
        ({ tableHeight: innerTableHeight } = useTableHeight(innerAreaRef, {
          minHeight: 100,
          defaultHeight: 200,
        }));
        ({ tableHeight: directRefTableHeight } = useTableHeight(orderCardRef, {
          minHeight: 100,
          defaultHeight: 200,
        }));
        return () =>
          h('div', { ref: orderCardRef, class: 'order-card' }, [
            h('div', { class: 'order-card-head' }, '业务订单标题'),
            h('div', { class: 'order-card-body' }, [
              h('div', { ref: innerAreaRef, class: 'order-table-area' }),
            ]),
          ]);
      },
    });

    const wrapper = mount(BusinessCardHost, { attachTo: document.body });
    wrappers.push(wrapper);

    await nextTick();
    await nextTick();

    // 1) innerAreaRef 位于 .order-card 内：不能误扣 .order-card-head (80)，应保持 500
    expect(innerTableHeight.value).toBe(500);
    // 2) ref 直接绑在 .order-card 上：不能误定位到 .order-card-body (320) 或扣除 .order-card-head (80)，应保持 500
    expect(directRefTableHeight.value).toBe(500);
  });
});
