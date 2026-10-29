/**
 * 解析并生成 x-spreadsheet 数据，分段送出：Worker 里用 postMessage 逐段传回主线程，
 * 每段反序列化都很短，主线程不会被一整张大表卡住（见 ./worker.ts、./worker-client.ts）；
 * 不能用 Worker 时在主线程运行同样的流程（见 ./index.ts）。
 */
import type { XsRow, XsSheet } from './apply';
import { buildSheet, parseWorkbook, visibleSheetModels } from './build';
import type { DrawingItem } from './drawing';
import { createCellFormatter, loadNumfmt } from './format';
import type { WorkbookModel } from './model';

export interface BuildRequest {
  data: ArrayBuffer;
  xls: boolean;
  locale: string;
  /** 单元格总数上限，超过时截断；默认不限制 */
  maxCells?: number;
}

export type BuildMessage =
  /** 一个工作表除行以外的部分（样式、列、合并、冻结） */
  | { type: 'sheet'; index: number; sheet: XsSheet }
  /** 该工作表的一段行 */
  | { type: 'rows'; index: number; rows: Record<string, XsRow> }
  /** 全部送出；model 不含函数（图片读取在主线程重新接上） */
  | { type: 'done'; model: WorkbookModel }
  /** 这个文件不能直接读取，改用 @vue-office/excel 自己的读取 */
  | { type: 'none' }
  | { type: 'error'; message: string }
  /** 进度（0~1）：解析约占 80%，生成数据约占 20% */
  | { type: 'progress'; value: number };

export type TextMeasure = (text: string, fontPx: number, fontName?: string, bold?: boolean) => number;

/** 文字测量：页面里用 canvas，Worker 里用 OffscreenCanvas；都没有时不测量（换行行按一行估算） */
export function createTextMeasure(): TextMeasure | undefined {
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  try {
    if (typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    else if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return undefined;
  const c = ctx;
  return (text, px, name, bold) => {
    c.font = `${bold ? 'bold ' : ''}${px}px ${name ? `"${name}", ` : ''}sans-serif`;
    return c.measureText(text).width;
  };
}

/** 每条消息的行数：约几万个单元格，主线程反序列化一条只要几十毫秒 */
const ROWS_PER_MESSAGE = 2000;

export interface RunBuildOptions {
  measure?: TextMeasure;
  /** 主线程上运行：解析分段、工作表之间让出主线程 */
  yieldToMain?: boolean;
  signal?: AbortSignal;
  /** 传回的模型不带单元格（没有图表、迷你图等需要引用单元格的内容时）；Worker 里为 true，减少传输 */
  slim?: boolean;
}

/** 进度里解析所占的比例 */
const PARSE_SHARE = 0.8;

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export async function runBuild(
  req: BuildRequest,
  post: (message: BuildMessage) => void,
  options: RunBuildOptions = {}
): Promise<void> {
  const { measure, signal } = options;
  // 进度按百分比变化时才送出，避免消息过多
  let lastPercent = -1;
  const progress = (value: number) => {
    const percent = Math.floor(Math.min(1, Math.max(0, value)) * 100);
    if (percent <= lastPercent) return;
    lastPercent = percent;
    post({ type: 'progress', value: percent / 100 });
  };
  const [model, lib] = await Promise.all([
    parseWorkbook(req.data, {
      xls: req.xls,
      locale: req.locale,
      signal,
      yieldRows: !!options.yieldToMain,
      maxCells: req.maxCells,
      onProgress: f => progress(f * PARSE_SHARE),
    }).catch(() => null),
    loadNumfmt(),
  ]);
  if (signal?.aborted) return;
  if (!model) {
    post({ type: 'none' });
    return;
  }
  const formatter = createCellFormatter(lib, { locale: req.locale, date1904: model.date1904 });
  const mdw = measure ? Math.round(measure('0', (model.defaultFont.sz * 4) / 3, model.defaultFont.name)) || 7 : 7;
  const sheets = visibleSheetModels(model);
  for (let index = 0; index < sheets.length; index++) {
    if (options.yieldToMain) {
      await nextTask();
      if (signal?.aborted) return;
    }
    const built = buildSheet(sheets[index], model, { formatter, mdw, measure });
    const { rows, ...head } = built;
    post({ type: 'sheet', index, sheet: { ...head, rows: { len: rows.len } } as XsSheet });
    let batch: Record<string, XsRow> = {};
    let n = 0;
    for (const key of Object.keys(rows)) {
      if (key === 'len') continue;
      batch[key] = rows[key] as XsRow;
      if (++n >= ROWS_PER_MESSAGE) {
        post({ type: 'rows', index, rows: batch });
        batch = {};
        n = 0;
      }
    }
    if (n) post({ type: 'rows', index, rows: batch });
    progress(PARSE_SHARE + ((1 - PARSE_SHARE) * (index + 1)) / sheets.length);
  }
  post({ type: 'done', model: options.slim ? slimModel(model) : model });
}

const hasChart = (items: DrawingItem[]): boolean =>
  items.some(o => o.type === 'chart' || (o.type === 'group' && hasChart(o.children)));

/** 图表、迷你图按引用读取单元格（可能是别的工作表）；都没有时模型里的单元格（已经写进表格数据）不再传回 */
function slimModel(model: WorkbookModel): WorkbookModel {
  const needsCells = model.sheets.some(
    s => !!s.extras && (s.extras.sparklines.length > 0 || hasChart(s.extras.objects.map(o => o.item)))
  );
  if (needsCells) return model;
  return { ...model, sheets: model.sheets.map(s => ({ ...s, cells: new Map() })) };
}

/** 收集 runBuild 送出的消息，拼回完整的数据 */
export function createAssembler() {
  const sheets: XsSheet[] = [];
  let model: WorkbookModel | null = null;
  let status: 'pending' | 'done' | 'none' = 'pending';
  return {
    post(message: BuildMessage) {
      switch (message.type) {
        case 'sheet':
          sheets[message.index] = message.sheet;
          break;
        case 'rows':
          Object.assign(sheets[message.index].rows, message.rows);
          break;
        case 'done':
          model = message.model;
          status = 'done';
          break;
        case 'none':
          status = 'none';
          break;
        default:
          break;
      }
    },
    get status() {
      return status;
    },
    result(): { model: WorkbookModel; sheets: XsSheet[] } | null {
      return status === 'done' && model ? { model, sheets } : null;
    },
  };
}
