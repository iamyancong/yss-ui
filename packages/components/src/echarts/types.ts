import type { ECharts, EChartsCoreOption, EChartsInitOpts, SetOptionOpts } from 'echarts/core';

/**
 * YEcharts 组件对外 Props 类型
 */
export interface YEchartsProps {
  /**
   * ECharts 配置项
   */
  options?: EChartsCoreOption;
  /**
   * 宽度（默认 100%）。可传入数字或任意 CSS 宽度值
   */
  width?: number | string;
  /**
   * 高度（默认 300）
   */
  height?: number | string;
  /**
   * 主题（light/dark 或自定义主题名）。变更后将重建实例
   */
  theme?: 'light' | 'dark' | string;
  /**
   * 渲染器（canvas/svg）。变更后将重建实例
   */
  renderer?: 'canvas' | 'svg';
  /**
   * 自动响应式（使用 ResizeObserver 监听容器尺寸变化）
   */
  autoresize?: boolean;
  /**
   * 是否启用暗黑模式（将合入 option.darkMode）
   */
  darkMode?: boolean;
  /**
   * init 额外配置，透传至 echarts.init 第三个参数
   */
  initOptions?: EChartsInitOpts;
  /**
   * setOption 附加参数（如 replaceMerge、lazyUpdate 等）
   */
  setOptionOpts?: SetOptionOpts;
}

/**
 * 组件暴露的方法
 */
export interface YEchartsExpose {
  /** 获取原始 ECharts 实例 */
  getInstance: () => ECharts | null;
  /** 手动触发 resize */
  resize: () => void;
  /** 设置配置项 */
  setOption: (option: EChartsCoreOption | undefined, notMerge?: boolean, setOptionOpts?: SetOptionOpts) => void;
  /** 销毁实例 */
  dispose: () => void;
}
