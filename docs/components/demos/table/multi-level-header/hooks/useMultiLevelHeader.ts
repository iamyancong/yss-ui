import { type YTableColumn } from '@yss-ui/components';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  ACCOUNTS,
  ALL_SCHEMES,
  CHANGE_GROUPS,
  LEFT_LEAF_COUNT,
  RISK_SECTIONS,
  buildValueField,
  type SchemeOption,
} from '../constant';

/** 表格行数据。 */
export type RiskRow = Record<string, string> & {
  /** 行主键 */
  id: string;
  /** 风险分组编码 */
  sectionCode: string;
  /** 风险指标名称 */
  itemName: string;
};

/** vxe-table spanMethod 入参（Demo 中用到的字段；行类型由 vxe 推断为通用对象）。 */
interface SpanParams {
  row: any;
  column: { field?: string };
  visibleData?: any[];
}

export interface UseMultiLevelHeaderReturn {
  /** 多级表头列配置（随可见方案动态重建） */
  columns: ComputedRef<YTableColumn[]>;
  /** 表格数据 */
  tableData: ComputedRef<RiskRow[]>;
  /** 当前可见方案 */
  visibleSchemes: Ref<SchemeOption[]>;
  /** 表头合并规则（配合 show-custom-header 使用） */
  mergeHeaderCells: ComputedRef<HeaderMerge[]>;
  /** 风险分组列纵向合并 */
  spanMethod: (params: SpanParams) => { rowspan: number; colspan: number } | undefined;
  /** 追加 / 移除第三个方案，验证动态列重建后分组顺序稳定 */
  toggleScheme: () => void;
}

/** 表头合并项（row 为表头行索引，col 为叶子列索引）。 */
export interface HeaderMerge {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

/** 计算列树深度（表头行数）。 */
const getDepth = (columns: YTableColumn[]): number =>
  Math.max(0, ...columns.map(col => (col.children?.length ? getDepth(col.children) + 1 : 1)));

/**
 * 按列树生成 show-custom-header 模式下的表头合并规则：
 * - 分组横向合并其覆盖的全部叶子列；
 * - 叶子列始终落在最后一行，子树较浅的分组纵向拉伸补齐（如「跨期变化数额」占两行、「整体」在第三行）。
 *
 * @param columns 列树
 * @param depth 表头总行数
 * @returns 合并规则
 */
const buildHeaderMerges = (columns: YTableColumn[], depth = getDepth(columns)): HeaderMerge[] => {
  const merges: HeaderMerge[] = [];
  let leafIndex = 0;
  const walk = (nodes: YTableColumn[], row: number) => {
    nodes.forEach(node => {
      if (!node.children?.length) {
        // 顶层（或浅层）叶子列纵向占满剩余表头行
        if (depth - row > 1) merges.push({ row, col: leafIndex, rowspan: depth - row, colspan: 1 });
        leafIndex += 1;
        return;
      }
      const start = leafIndex;
      // 子树深度不足时由分组向下拉伸，保证子节点（叶子列）落在最后一行
      const rowspan = depth - row - getDepth(node.children);
      walk(node.children, row + rowspan);
      const colspan = leafIndex - start;
      if (rowspan > 1 || colspan > 1) merges.push({ row, col: start, rowspan, colspan });
    });
  };
  walk(columns, 0);
  return merges;
};

/** 生成稳定的 Mock 数值，方便核对「方案 × 日期 × 账户」字段是否对位。 */
const mockValue = (sectionIdx: number, itemIdx: number, schemeIdx: number, dateIdx: number): number =>
  (sectionIdx + 1) * 100 + itemIdx * 7 + schemeIdx * 13 + dateIdx * 3 + 0.25;

/**
 * 构建多级表头列：
 * - 左侧固定分组：方案名称 → 报告日期 → [风险分组, 风险指标]
 * - 方案分组：方案编号 → 报告日期 → 账户
 * - 跨期变化：分组标题 → 账户
 */
const buildColumns = (schemes: SchemeOption[]): YTableColumn[] => [
  {
    title: '方案名称',
    headerAlign: 'right',
    fixed: 'left',
    children: [
      {
        title: '报告日期',
        headerAlign: 'right',
        children: [
          {
            field: 'sectionCode',
            title: '账户名称',
            width: 260,
            headerAlign: 'right',
            filterable: true,
            filters: RISK_SECTIONS.map(section => ({ label: section.subTitle, value: section.code })),
            filterMethod: ({ value, row }: { value: string; row: RiskRow }) => row.sectionCode === value,
          },
          { field: 'itemName', title: '', width: 220 },
        ],
      },
    ],
  },
  ...schemes.map<YTableColumn>(scheme => ({
    title: scheme.code,
    headerAlign: 'left',
    children: scheme.dates.map<YTableColumn>(date => ({
      title: date,
      headerAlign: 'left',
      children: ACCOUNTS.map<YTableColumn>(account => ({
        field: buildValueField(scheme.code, date, account.code),
        title: account.name,
        minWidth: 110,
        align: 'right',
        headerAlign: 'left',
      })),
    })),
  })),
  ...CHANGE_GROUPS.map<YTableColumn>(group => ({
    title: group.title,
    headerAlign: 'left',
    children: ACCOUNTS.map<YTableColumn>(account => ({
      field: `${group.key}_${account.code}`,
      title: account.name,
      minWidth: 120,
      align: 'right',
      headerAlign: 'left',
    })),
  })),
];

/** 按方案 × 日期 × 账户生成行数据。 */
const buildRows = (schemes: SchemeOption[]): RiskRow[] =>
  RISK_SECTIONS.flatMap((section, sectionIdx) =>
    section.items.map((itemName, itemIdx) => {
      const row: RiskRow = { id: `${section.code}-${itemIdx}`, sectionCode: section.code, itemName };
      schemes.forEach((scheme, schemeIdx) => {
        scheme.dates.forEach((date, dateIdx) => {
          ACCOUNTS.forEach(account => {
            row[buildValueField(scheme.code, date, account.code)] = mockValue(
              sectionIdx,
              itemIdx,
              schemeIdx,
              dateIdx
            ).toFixed(2);
          });
        });
      });
      // 跨期变化：首个方案的最新报告日期 vs 最早报告日期
      const base = mockValue(sectionIdx, itemIdx, 0, (schemes[0]?.dates.length || 1) - 1);
      const latest = mockValue(sectionIdx, itemIdx, 0, 0);
      ACCOUNTS.forEach(account => {
        row[`changeAmount_${account.code}`] = (latest - base).toFixed(2);
        row[`changeRate_${account.code}`] = `${(((latest - base) / base) * 100).toFixed(2)}%`;
      });
      return row;
    })
  );

/**
 * 多级表头 Demo 逻辑。
 * @returns 列配置、数据、合并规则与方案切换方法
 */
export const useMultiLevelHeader = (): UseMultiLevelHeaderReturn => {
  const visibleSchemes = ref<SchemeOption[]>(ALL_SCHEMES.slice(0, 2));

  const columns = computed(() => buildColumns(visibleSchemes.value));
  const tableData = computed(() => buildRows(visibleSchemes.value));

  const mergeHeaderCells = computed<HeaderMerge[]>(() => {
    const depth = getDepth(columns.value);
    return [
      ...buildHeaderMerges(columns.value, depth),
      // 最后一行表头中「账户名称」横跨左侧两个叶子列（风险分组 + 风险指标）
      { row: depth - 1, col: 0, rowspan: 1, colspan: LEFT_LEAF_COUNT },
    ];
  });

  const spanMethod = ({ row, column, visibleData }: SpanParams) => {
    if (column.field !== 'sectionCode') return undefined;
    const list = visibleData?.length ? visibleData : tableData.value;
    const index = list.indexOf(row);
    if (index > 0 && list[index - 1].sectionCode === row.sectionCode) {
      return { rowspan: 0, colspan: 0 };
    }
    let rowspan = 1;
    while (list[index + rowspan]?.sectionCode === row.sectionCode) rowspan += 1;
    return { rowspan, colspan: 1 };
  };

  const toggleScheme = () => {
    visibleSchemes.value =
      visibleSchemes.value.length < ALL_SCHEMES.length ? ALL_SCHEMES.slice() : ALL_SCHEMES.slice(0, 2);
  };

  return { columns, tableData, visibleSchemes, mergeHeaderCells, spanMethod, toggleScheme };
};
