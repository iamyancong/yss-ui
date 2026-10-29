import type { YTableColumn } from '@yss-ui/components';

/** 加载态示例共用列，提供可稳定复现无结果的本地筛选。 */
export const columns: YTableColumn[] = [
  {
    field: 'date',
    title: '季度末',
    width: 160,
    filterable: true,
    filters: [{ label: '无匹配结果', value: 'none' }],
    filterMethod: () => false,
  },
  { field: 'status', title: '状态', width: 160 },
  { field: 'error', title: '模块错误', minWidth: 300 },
];

/** 一行数据与汇总行，用于比较不同表体高度。 */
export const rows = [{ id: '1', date: '2026-09-30', status: 'REJECTED', error: '上季度兼容结果 MISSING' }];

/** 汇总表尾不计入加载提示的居中区域。 */
export const footerData = [{ date: '合计', status: '1', error: '汇总' }];
