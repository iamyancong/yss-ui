import { computed, reactive, readonly, ref, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import XEUtils from 'xe-utils';
import { resolveTreeChildrenField, useSafeData } from '../hooks/useSafeData';

/** 类实例行，用于验证非纯对象副本的缓存与字段同步。 */
class RecordRow {
  name: string;
  status?: string;
  children?: RecordRow[];
  nodes?: RecordRow[];

  constructor(name: string, children?: RecordRow[]) {
    this.name = name;
    this.children = children;
  }
}

/**
 * 用响应式数据驱动 useSafeData。
 *
 * @param initial 初始行
 * @param childrenField 树子节点字段名
 */
const mountSafeData = (initial: any[], childrenField = 'children') => {
  const data = shallowRef(initial);
  const field = ref(childrenField);
  const safe = useSafeData(
    computed(() => data.value),
    computed(() => field.value)
  );
  return { data, field, safe };
};

describe('resolveTreeChildrenField', () => {
  it('缺省、children 与 childrenField 的优先级与 vxe 一致', () => {
    expect(resolveTreeChildrenField(undefined)).toBe('children');
    expect(resolveTreeChildrenField({})).toBe('children');
    expect(resolveTreeChildrenField({ childrenField: 'nodes' })).toBe('nodes');
    expect(resolveTreeChildrenField({ children: 'items', childrenField: 'nodes' })).toBe('items');
    expect(resolveTreeChildrenField({ children: '', childrenField: 'nodes' })).toBe('nodes');
  });
});

describe('useSafeData 行引用', () => {
  it('vxe 使用的路径读取在字段缺失时不抛错', () => {
    expect(XEUtils.get({ name: 'a' }, 'status')).toBeUndefined();
    expect(XEUtils.get({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(XEUtils.get({}, 'a.b')).toBeUndefined();
    expect(XEUtils.get({ a: undefined }, 'a.b')).toBeUndefined();
    expect(XEUtils.get({ 'a.b': 0, a: { b: 1 } }, 'a.b')).toBe(0);
  });

  it('缺字段和深路径列保持原行，不写入字面量键', () => {
    const row: { name: string; a: { b: number }; _X_ROW_KEY?: string } = { name: '张三', a: { b: 1 } };
    const { data, safe } = mountSafeData([row]);

    expect(safe.value).toBe(data.value);
    expect(safe.value[0]).toBe(row);
    expect(Object.prototype.hasOwnProperty.call(row, 'status')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, 'a.b')).toBe(false);

    row._X_ROW_KEY = 'row_1';
    data.value = [row];
    expect(safe.value[0]).toBe(row);
    expect(safe.value[0]._X_ROW_KEY).toBe('row_1');
  });

  it('同一批纯对象重新放入新数组时行引用不变', () => {
    const rows = [{ name: '张三' }, { name: '李四', a: { b: 2 } }];
    const { data, safe } = mountSafeData(rows);
    const first = safe.value;

    data.value = rows.slice();
    expect(safe.value).not.toBe(first);
    expect(safe.value[0]).toBe(rows[0]);
    expect(safe.value[1]).toBe(rows[1]);
    expect(Object.prototype.hasOwnProperty.call(safe.value[1], 'a.b')).toBe(false);
  });

  it('响应式纯对象按代理复用，字段变化直接体现在原对象上', () => {
    const state = reactive([{ name: '张三' }]);
    const safe = useSafeData(computed(() => state));

    expect(safe.value[0]).toBe(state[0]);
    state[0].name = '李四';
    expect(safe.value[0].name).toBe('李四');
  });

  it('浅拷贝出的新对象无法推断为同一行', () => {
    const row = { id: 1, name: '张三', _X_ROW_KEY: 'row_1' };
    const { data, safe } = mountSafeData([row]);
    const copy = { id: 1, name: '张三' };

    data.value = [copy];
    expect(safe.value[0]).toBe(copy);
    expect(safe.value[0]).not.toBe(row);
    expect(safe.value[0]._X_ROW_KEY).toBeUndefined();
  });

  it('类实例副本按源对象复用，并同步字段增删，同时保留行键', () => {
    const row = new RecordRow('张三');
    const { data, safe } = mountSafeData([row]);
    const clone = safe.value[0] as Record<string, any>;

    expect(clone).not.toBe(row);
    expect(clone.name).toBe('张三');
    clone._X_ROW_KEY = 'row_1';

    row.name = '李四';
    row.status = 'on';
    data.value = [row];
    expect(safe.value[0]).toBe(clone);
    expect(clone.name).toBe('李四');
    expect(clone.status).toBe('on');

    delete row.status;
    data.value = [row];
    expect(safe.value[0]).toBe(clone);
    expect(Object.prototype.hasOwnProperty.call(clone, 'status')).toBe(false);
    expect(clone._X_ROW_KEY).toBe('row_1');
  });

  it('reactive 代理和 toRaw 源对象命中同一份副本', () => {
    const row = new RecordRow('张三');
    const proxy = reactive(row);
    const data = ref<any[]>([proxy]);
    const safe = useSafeData(computed(() => data.value));
    const clone = safe.value[0] as Record<string, any>;
    clone._X_ROW_KEY = 'row_1';

    data.value = [row];
    expect(safe.value[0]).toBe(clone);
    expect(safe.value[0]._X_ROW_KEY).toBe('row_1');
    expect(safe.value[0].name).toBe('张三');
  });

  it('冻结对象和只读对象使用可写且稳定的副本', () => {
    const frozen = Object.freeze({ name: '冻结' });
    const locked = readonly({ name: '只读' });
    const { data, safe } = mountSafeData([frozen, locked]);
    const frozenClone = safe.value[0] as Record<string, any>;
    const lockedClone = safe.value[1] as Record<string, any>;

    frozenClone._X_ROW_KEY = 'frozen';
    lockedClone._X_ROW_KEY = 'locked';
    data.value = [frozen, locked];

    expect(safe.value[0]).toBe(frozenClone);
    expect(safe.value[1]).toBe(lockedClone);
    expect(frozenClone._X_ROW_KEY).toBe('frozen');
    expect(lockedClone._X_ROW_KEY).toBe('locked');
  });

  it('null 原型对象复用副本，空值和原数组在无需转换时原样返回', () => {
    const row = Object.create(null) as Record<string, any>;
    row.name = '空原型';
    const plain = { name: '纯对象' };
    const { data, safe } = mountSafeData([null as any, plain, row]);

    expect(safe.value[0]).toBeNull();
    expect(safe.value[1]).toBe(plain);
    expect(safe.value[2]).not.toBe(row);
    expect(safe.value[2].name).toBe('空原型');

    const clone = safe.value[2];
    data.value = [null as any, plain, row];
    expect(safe.value[2]).toBe(clone);
    expect(useSafeData(computed(() => [])).value).toEqual([]);
  });

  it('树子节点递归复用副本，纯对象子节点保持原引用', () => {
    const plainChild = { name: '纯子节点' };
    const plainParent = { name: '纯父节点', children: [plainChild] };
    const classChild = new RecordRow('类子节点');
    const classParent = new RecordRow('类父节点', [classChild]);
    const { data, safe } = mountSafeData([plainParent, classParent]);

    expect(safe.value[0]).toBe(plainParent);
    expect(safe.value[0].children[0]).toBe(plainChild);

    const parentClone = safe.value[1] as Record<string, any>;
    const childClone = parentClone.children[0] as Record<string, any>;
    expect(parentClone).not.toBe(classParent);
    expect(childClone).not.toBe(classChild);
    parentClone._X_ROW_KEY = 'parent';
    childClone._X_ROW_KEY = 'child';

    classParent.name = '父节点已改';
    classChild.status = 'on';
    data.value = [plainParent, classParent];
    expect(safe.value[1]).toBe(parentClone);
    expect(parentClone.name).toBe('父节点已改');
    expect(parentClone._X_ROW_KEY).toBe('parent');
    expect(parentClone.children[0]).toBe(childClone);
    expect(childClone.status).toBe('on');
    expect(childClone._X_ROW_KEY).toBe('child');

    delete classChild.status;
    data.value = [plainParent, classParent];
    expect(safe.value[1]).toBe(parentClone);
    expect(Object.prototype.hasOwnProperty.call(childClone, 'status')).toBe(false);
    expect(childClone._X_ROW_KEY).toBe('child');
  });

  it('自定义子节点字段才会递归，无关对象数组保持原引用', () => {
    const tag = { label: '标签' };
    const node = new RecordRow('节点');
    const row = new RecordRow('父节点');
    row.nodes = [node];
    (row as RecordRow & { tags: Array<{ label: string }> }).tags = [tag];
    const { data, field, safe } = mountSafeData([row], 'nodes');

    const clone = safe.value[0] as Record<string, any>;
    expect(clone.nodes[0]).not.toBe(node);
    expect(clone.tags[0]).toBe(tag);
    clone.nodes[0]._X_ROW_KEY = 'node';

    data.value = [row];
    expect(safe.value[0]).toBe(clone);
    expect(clone.nodes[0]._X_ROW_KEY).toBe('node');

    field.value = 'children';
    const retargeted = safe.value[0] as Record<string, any>;
    expect(retargeted).toBe(clone);
    expect(retargeted.nodes[0]).toBe(node);
  });

  it('循环子节点不会无限递归', () => {
    const parent: { name: string; children: any[] } = { name: '父', children: [] };
    const child: { name: string; children: any[] } = { name: '子', children: [parent] };
    parent.children = [child];
    const safe = useSafeData(computed(() => [parent]));

    expect(safe.value[0]).toBe(parent);
    expect(safe.value[0].children[0]).toBe(child);
    expect(safe.value[0].children[0].children[0]).toBe(parent);
  });

  it('类实例循环子节点复用同一副本', () => {
    const parent = new RecordRow('父');
    const child = new RecordRow('子');
    parent.children = [child];
    child.children = [parent];
    const safe = useSafeData(computed(() => [parent]));
    const clone = safe.value[0] as Record<string, any>;

    expect(clone).not.toBe(parent);
    expect(clone.children[0]).not.toBe(child);
    expect(clone.children[0].children[0]).toBe(clone);
  });

  it('一万行缺字段重复计算仍复用原行', () => {
    const rows = Array.from({ length: 10000 }, (_, index) => ({ id: String(index), name: `n${index}` }));
    const data = shallowRef(rows);
    const safe = useSafeData(computed(() => data.value));
    const first = safe.value;
    data.value = rows.slice();
    const second = safe.value;

    expect(first).toBe(rows);
    expect(second[0]).toBe(rows[0]);
    expect(second[9999]).toBe(rows[9999]);
  });
});
