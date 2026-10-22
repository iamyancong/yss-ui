/**
 * 用 ECharts 画 Excel 图表。只在工作表里有图表时由 ./overlay.ts 动态加载；
 * ECharts 是可选依赖，没有安装时抛出 MissingDependencyError（叠加层改为显示占位卡片与安装提示）。
 */
import { MissingDependencyError } from '../errors';
import type { ChartModel } from './chart';
import { buildChartOption, type MultiLevelPlan, type NumberFormatter } from './chart-option';

interface EChartsLike {
  setOption(option: unknown, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
  isDisposed(): boolean;
  convertToPixel(finder: unknown, value: unknown): number | number[];
  on?(event: string, cb: () => void): void;
  getModel?(): { getComponent(type: string, index: number): { axis?: AxisLike } | undefined } | undefined;
}

interface AxisLike {
  scale: { getExtent(): [number, number] };
  getGlobalExtent(): [number, number];
  dataToCoord(v: number): number;
  toGlobalCoord(v: number): number;
}

interface EChartsRuntime {
  init(dom: HTMLElement, theme?: unknown, opts?: Record<string, unknown>): EChartsLike;
}

let runtime: Promise<EChartsRuntime> | null = null;

/** 按需加载 ECharts（只注册 Excel 图表用到的图表类型与组件） */
export function loadECharts(): Promise<EChartsRuntime> {
  if (!runtime) {
    runtime = (async () => {
      try {
        const [core, charts, components, renderers] = await Promise.all([
          import('echarts/core'),
          import('echarts/charts'),
          import('echarts/components'),
          import('echarts/renderers'),
        ]);
        core.use([
          charts.BarChart,
          charts.LineChart,
          charts.PieChart,
          charts.ScatterChart,
          charts.RadarChart,
          charts.TreemapChart,
          charts.SunburstChart,
          charts.FunnelChart,
          charts.BoxplotChart,
          charts.CandlestickChart,
          components.GridComponent,
          components.LegendComponent,
          components.TitleComponent,
          components.TooltipComponent,
          components.GraphicComponent,
          renderers.CanvasRenderer,
        ]);
        return core as unknown as EChartsRuntime;
      } catch (err) {
        runtime = null;
        throw new MissingDependencyError('echarts', err);
      }
    })();
  }
  return runtime;
}

export interface RenderedChart {
  dispose(): void;
}

/** 多级分类的外层分组：按坐标画在内层标签下面 */
function multiLevelGraphics(chart: EChartsLike, plan: MultiLevelPlan, count: number, option: Record<string, any>) {
  const finder = { xAxisIndex: plan.axisIndex };
  const px = (i: number) => {
    const v = chart.convertToPixel(finder, i);
    return typeof v === 'number' ? v : Array.isArray(v) ? v[0] : NaN;
  };
  if (count < 1) return [];
  const x0 = px(0);
  const band = count > 1 ? (px(count - 1) - x0) / (count - 1) : 40;
  const axis = (option.xAxis as any[])[plan.axisIndex];
  const valueAxisIndex = (option.series as any[]).find(s => (s.xAxisIndex ?? 0) === plan.axisIndex)?.yAxisIndex ?? 0;
  let y: number;
  const zero = chart.convertToPixel({ yAxisIndex: valueAxisIndex }, 0);
  const atZero = axis?.axisLine?.onZero !== false && typeof zero === 'number' && Number.isFinite(zero);
  if (atZero) y = zero as number;
  else {
    const yAxis = (option.yAxis as any[])[valueAxisIndex];
    const bottomValue = yAxis?.inverse ? yAxis?.max : yAxis?.min;
    const v = chart.convertToPixel({ yAxisIndex: valueAxisIndex }, bottomValue ?? 0);
    y = typeof v === 'number' ? v : 0;
  }
  const elements: unknown[] = [];
  plan.levels.forEach((groups, li) => {
    const top = y + plan.innerHeight + li * plan.rowHeight;
    groups.forEach(g => {
      const left = x0 + (g.start - 0.5) * band;
      const right = x0 + (g.end + 0.5) * band;
      elements.push({
        type: 'text',
        silent: true,
        z: 5,
        x: (left + right) / 2,
        y: top + plan.rowHeight / 2,
        style: {
          text: g.text,
          fill: plan.color,
          font: `${plan.fontSize}px ${plan.fontFamily}`,
          align: 'center',
          verticalAlign: 'middle',
          width: Math.max(10, right - left - 4),
          overflow: 'truncate',
        },
      });
    });
  });
  return elements;
}

/**
 * Excel 的分类轴在值轴交叉于 0（crosses=autoZero、tickLblPos=nextTo）时，标签紧贴 0 刻度线；
 * ECharts 的 onZero 只移动轴线，标签仍在绘图区边缘，这里用负的 margin 把标签移到轴线旁。
 */
function alignLabelsToZero(chart: EChartsLike, option: Record<string, any>): boolean {
  const model = chart.getModel?.();
  if (!model) return false;
  let changed = false;
  const patch: Record<string, unknown[]> = {};
  for (const key of ['xAxis', 'yAxis'] as const) {
    const axes = (option[key] as any[]) ?? [];
    patch[key] = axes.map((ax, i) => {
      if (ax?.type !== 'category' || ax.axisLine?.onZero === false || ax.axisLabel?.show === false) return {};
      const otherKey = key === 'xAxis' ? 'yAxis' : 'xAxis';
      const series = ((option.series as any[]) ?? []).find(s => (s[`${key}Index`] ?? 0) === i);
      if (!series) return {};
      const other = model.getComponent(otherKey, series[`${otherKey}Index`] ?? 0)?.axis;
      if (!other) return {};
      const [min, max] = other.scale.getExtent();
      if (!(min <= 0 && max >= 0) || min === max) return {};
      const zero = other.toGlobalCoord(other.dataToCoord(0));
      const [a, b] = other.getGlobalExtent();
      const far = ax.position === 'top' || ax.position === 'left' ? Math.min(a, b) : Math.max(a, b);
      const offset = Math.abs(far - zero);
      if (!(offset > 0.5)) return {};
      changed = true;
      // 标签压在柱形上面（与 Excel 相同）
      return { z: 5, axisLabel: { margin: (ax.axisLabel?.margin ?? 8) - offset } };
    });
  }
  if (changed) chart.setOption(patch);
  return changed;
}

/** 在 dom 里画图表；dom 需要已有尺寸 */
export async function renderChart(dom: HTMLElement, model: ChartModel, format: NumberFormatter, fontFamily?: string): Promise<RenderedChart> {
  const echarts = await loadECharts();
  const width = dom.clientWidth || 400;
  const height = dom.clientHeight || 300;
  const { option, multiLevel } = buildChartOption(model, { width, height, format, fontFamily });
  const chart = echarts.init(dom, undefined, { renderer: 'canvas', width, height });
  chart.setOption(option, true);
  try {
    alignLabelsToZero(chart, option);
  } catch {
    // 对不齐时保留 ECharts 的默认位置
  }
  if (multiLevel) {
    const count = ((option.xAxis as any[])[multiLevel.axisIndex]?.data ?? []).length;
    try {
      chart.setOption({ graphic: { elements: multiLevelGraphics(chart, multiLevel, count, option) } });
    } catch {
      // 外层分组画不出来时只显示内层标签
    }
  }
  return {
    dispose() {
      if (!chart.isDisposed()) chart.dispose();
    },
  };
}
