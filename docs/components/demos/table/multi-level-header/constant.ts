/**
 * 方案配置：一级表头为方案编号，二级表头为报告日期（通常由接口动态返回）。
 */
export interface SchemeOption {
  /** 方案编号（一级表头） */
  code: string;
  /** 报告日期列表（二级表头） */
  dates: string[];
}

/**
 * 账户配置：三级表头（叶子列），每个「方案 × 日期」下按账户展开。
 */
export interface AccountOption {
  /** 账户编码（参与拼接数据字段名） */
  code: string;
  /** 账户名称（三级表头标题） */
  name: string;
}

/**
 * 风险分组：左侧第一列，相同分组的行纵向合并。
 */
export interface RiskSection {
  /** 分组编码（用于筛选与行合并） */
  code: string;
  /** 英文名 */
  title: string;
  /** 中文副标题 */
  subTitle: string;
  /** 分组下的风险指标 */
  items: string[];
}

/** 全部可选方案（Demo 中通过按钮切换可见方案，演示动态列重建后顺序保持稳定）。 */
export const ALL_SCHEMES: SchemeOption[] = [
  { code: 'UC000001', dates: ['2026-06-30', '2026-03-31', '2025-12-31'] },
  { code: '20260930V1', dates: ['2026-06-30', '2026-03-31', '2025-12-31'] },
  { code: 'UC000002', dates: ['2026-06-30', '2026-03-31'] },
];

/** 账户维度（三级表头）。 */
export const ACCOUNTS: AccountOption[] = [{ code: 'TOTAL', name: '整体' }];

/** 风险分组与指标（表体行）。 */
export const RISK_SECTIONS: RiskSection[] = [
  {
    code: 'MARKET_ASSET',
    title: 'Market Risk (Asset)',
    subTitle: '投资资产市场风险',
    items: ['利率上升风险', '利率下降风险', '信用利差风险', '权益价格风险', '房地产风险', '货币风险'].map(
      name => `市场风险：${name}`
    ),
  },
  {
    code: 'MARKET_LIABILITY',
    title: 'Market Risk (Liability Offset Ratio)',
    subTitle: '市场风险负债吸收系数',
    items: ['利率上升风险', '利率下降风险', '信用利差风险', '权益价格风险', '房地产风险', '货币风险'].map(
      name => `负债吸收系数：${name}`
    ),
  },
];

/** 跨期变化汇总列（一级表头，二级为空，三级为账户）。 */
export const CHANGE_GROUPS = [
  { key: 'changeAmount', title: '跨期变化数额' },
  { key: 'changeRate', title: '跨期变化幅度' },
] as const;

/** 左侧固定区叶子列数量（风险分组 + 风险指标）。 */
export const LEFT_LEAF_COUNT = 2;

/** 金额单位。 */
export const AMOUNT_UNIT = '亿港元';

/**
 * 拼接数值列字段名：方案 × 日期 × 账户。
 * @param scheme 方案编号
 * @param date 报告日期
 * @param account 账户编码
 * @returns 数据字段名（不含 `.`，避免被 vxe-table 当作嵌套路径）
 */
export const buildValueField = (scheme: string, date: string, account: string): string =>
  `v_${scheme}_${date.replace(/-/g, '')}_${account}`;
