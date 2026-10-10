import { computed, isReadonly, toRaw, type ComputedRef } from 'vue';

/** 非纯对象行的可复用副本，以及上次从源对象同步过的字段。 */
interface CachedRow {
  clone: Record<string, any>;
  sourceKeys: Set<PropertyKey>;
}

/** 单次规范化的上下文。缓存挂在 hook 实例上，栈只在一次计算内防循环引用。 */
interface NormalizeContext {
  childrenField: string;
  stack: WeakSet<object>;
  rowCache: WeakMap<object, CachedRow>;
}

const isPlainRow = (value: object): value is Record<string, any> => {
  return (
    Object.prototype.toString.call(value) === '[object Object]' && Object.getPrototypeOf(value) === Object.prototype
  );
};

/**
 * 纯对象且允许 vxe 写入行键时，直接复用业务行。
 * 冻结、只读、类实例和 null 原型对象需要可写副本。
 */
const shouldReuseSource = (value: object): value is Record<string, any> => {
  return isPlainRow(value) && Object.isExtensible(value) && !isReadonly(value);
};

/** 枚举源对象自身可枚举字段，包含 Symbol。 */
const enumerableOwnKeys = (source: object): PropertyKey[] => {
  const keys: PropertyKey[] = Object.keys(source);
  const symbols = Object.getOwnPropertySymbols(source).filter(symbol =>
    Object.prototype.propertyIsEnumerable.call(source, symbol)
  );
  return symbols.length > 0 ? keys.concat(symbols) : keys;
};

/**
 * 把一行转成可交给 vxe 的对象。
 * 可写纯对象原样返回；其余对象复用缓存副本，并同步字段增删。
 */
const normalizeRow = (item: unknown, context: NormalizeContext): unknown => {
  if (item === null || typeof item !== 'object') return item;

  const raw = toRaw(item);
  if (context.stack.has(raw)) {
    return context.rowCache.get(raw)?.clone ?? item;
  }

  context.stack.add(raw);
  try {
    if (shouldReuseSource(item)) {
      const children = item[context.childrenField];
      if (!Array.isArray(children)) return item;
      const nextChildren = normalizeList(children, context);
      if (nextChildren === children) return item;
      return syncClone(item, context, nextChildren);
    }
    return syncClone(item, context);
  } finally {
    context.stack.delete(raw);
  }
};

/**
 * 按原数组顺序规范化每一行。全部可复用时返回原数组，避免无意义复制。
 */
const normalizeList = (data: unknown[], context: NormalizeContext): unknown[] => {
  if (data.length === 0) return data;

  let nextData: unknown[] | null = null;
  data.forEach((item, index) => {
    const safeItem = normalizeRow(item, context);
    if (nextData) {
      nextData.push(safeItem);
      return;
    }
    if (safeItem !== item) {
      nextData = data.slice(0, index);
      nextData.push(safeItem);
    }
  });

  return nextData ?? data;
};

/**
 * 创建或复用源对象对应的普通副本。
 * 用源对象当前字段覆盖副本，删掉源上已不存在的旧字段，保留 vxe 写在副本上的行键等额外字段。
 */
const syncClone = (source: object, context: NormalizeContext, forcedChildren?: unknown[]): Record<string, any> => {
  const raw = toRaw(source);
  let cached = context.rowCache.get(raw);
  if (!cached) {
    cached = { clone: {}, sourceKeys: new Set() };
    context.rowCache.set(raw, cached);
  }

  const { clone } = cached;
  const nextKeys = new Set<PropertyKey>();
  enumerableOwnKeys(source).forEach(key => {
    const value = (source as any)[key];
    if (key === context.childrenField && Array.isArray(value)) {
      clone[key as string] = forcedChildren ?? normalizeList(value, context);
    } else {
      (clone as any)[key] = value;
    }
    nextKeys.add(key);
  });

  cached.sourceKeys.forEach(key => {
    if (!nextKeys.has(key)) delete (clone as any)[key];
  });
  cached.sourceKeys = nextKeys;
  return clone;
};

/**
 * 解析树子节点字段名，与 vxe-table `tree-config` 的读取顺序一致：`children` 优先于 `childrenField`。
 *
 * @param treeConfig 透传给表格的树配置
 * @returns 子节点字段名，缺省为 `children`
 */
export const resolveTreeChildrenField = (treeConfig: unknown): string => {
  if (!treeConfig || typeof treeConfig !== 'object') return 'children';
  const config = treeConfig as { children?: unknown; childrenField?: unknown };
  if (typeof config.children === 'string' && config.children) return config.children;
  if (typeof config.childrenField === 'string' && config.childrenField) return config.childrenField;
  return 'children';
};

/**
 * 规范化表格行，保证刷新时行身份稳定。
 *
 * vxe-table 4.19 通过 XEUtils.get 读取单元格。字段不存在，或深路径中间节点不存在时，返回 undefined，不会抛错。
 * 因此可写纯对象直接交给表格：缺字段和 `a.b` 这类深路径都不再克隆，vxe 写入的 `_X_ROW_KEY` 留在业务行上，
 * 事件回调拿到的也是业务对象。
 *
 * 类实例、冻结对象、只读对象和 null 原型对象仍转成普通对象，并按 toRaw(源对象) 缓存。
 * 同一源再次出现时复用副本，同步字段增删，同时保留副本上由 vxe 写入、源对象没有的行键。
 * 树子节点按 children 字段递归，循环引用在一次计算内打断。
 *
 * @param dataRef 分页后的行数据
 * @param childrenFieldRef 树子节点字段名，默认 `children`。这是内部参数，本函数没有从包入口导出。
 * @returns 可交给 vxe 的行数组
 */
export function useSafeData(
  dataRef: ComputedRef<any[]>,
  childrenFieldRef: ComputedRef<string> = computed(() => 'children')
): ComputedRef<any[]> {
  const rowCache = new WeakMap<object, CachedRow>();

  return computed(() => {
    const data = dataRef.value;
    if (!Array.isArray(data) || data.length === 0) return data;

    return normalizeList(data, {
      childrenField: childrenFieldRef.value || 'children',
      stack: new WeakSet(),
      rowCache,
    });
  });
}
