/**
 * #62 / #64 边界值：大小阈值（恰好等于 / ±1）、无效的属性值、URL 的 Content-Length、
 * Excel 提示条阈值与截断（恰好等于 / ±1）、不可信的 <dimension>、解析进度、空表 / 多表 / 损坏文件、Worker 不可用 / 出错 / 中止。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXCEL_MAX_CELLS,
  DEFAULT_EXCEL_WARN_CELLS,
  DEFAULT_LARGE_FILE_WARN_SIZE,
  DEFAULT_MAX_FILE_SIZE,
  resolveLargeFileWarnSize,
  resolveMaxSize,
} from '../constant';
import { FileLoadError } from '../errors';
import { parseWorkbook, placeholderXlsx } from '../excel/build';
import { createAssembler, runBuild, type BuildMessage } from '../excel/build-runner';
import { excelNoticeOf, resolveExcelLimits } from '../excel/limits';
import { createCellBudget } from '../excel/model';
import { parseXlsxModel } from '../excel/xlsx';
import { createStoredZip, listZipEntries } from '../excel/zip';
import { loadFileData } from '../hooks/useFileData';
import { loadFixture, textBuffer } from './helpers';

const factory = vi.hoisted(() => ({ create: null as null | (() => Worker | null) }));
vi.mock('../excel/worker-factory', () => ({ createExcelWorker: () => factory.create?.() ?? null }));

const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;
const bytes = (n: number) => new Uint8Array(n).buffer as ArrayBuffer;

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** 生成 xlsx：每个工作表给出 sheetData 里的内容与可选的 dimension */
function makeXlsx(sheets: Array<{ rows: string; ref?: string; state?: string }>): ArrayBuffer {
  const files: Array<[string, string]> = [
    [
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
    ],
    [
      '_rels/.rels',
      `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>${sheets
        .map(
          (s, i) =>
            `<sheet name="S${i + 1}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`
        )
        .join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<Relationships xmlns="${PKG}">${sheets
        .map(
          (_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('')}<Relationship Id="rS" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`,
    ],
  ];
  sheets.forEach((s, i) =>
    files.push([
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${NS}">${s.ref ? `<dimension ref="${s.ref}"/>` : ''}<sheetData>${s.rows}</sheetData></worksheet>`,
    ])
  );
  return createStoredZip(files);
}

const numberRows = (rows: number, cols: number) => {
  let out = '';
  for (let r = 1; r <= rows; r++) {
    out += `<row r="${r}">`;
    for (let c = 0; c < cols; c++) out += `<c r="${String.fromCharCode(65 + c)}${r}"><v>${r * c}</v></c>`;
    out += '</row>';
  }
  return out;
};

describe('属性值规范化', () => {
  it('maxSize：正数照用，Infinity 不限制；0 / 负数 / NaN / 非数字按默认 20MB', () => {
    expect(resolveMaxSize(1)).toBe(1);
    expect(resolveMaxSize(Infinity)).toBe(Infinity);
    for (const v of [0, -1, NaN, undefined, null, '10', -Infinity])
      expect(resolveMaxSize(v)).toBe(DEFAULT_MAX_FILE_SIZE);
  });

  it('largeFileWarnSize：未传按默认 10MB；0 / 负数 / NaN / Infinity 不按大小提示', () => {
    expect(resolveLargeFileWarnSize(undefined)).toBe(DEFAULT_LARGE_FILE_WARN_SIZE);
    expect(resolveLargeFileWarnSize(1)).toBe(1);
    for (const v of [0, -1, NaN, Infinity, -Infinity, '10']) expect(resolveLargeFileWarnSize(v)).toBe(Infinity);
  });

  it('excelMaxCells：0 / 负数 / NaN 按默认；warn 大于 max 时取 max；Infinity 不限制', () => {
    for (const v of [0, -1, NaN, { warn: 0, max: -5 }, { warn: NaN }])
      expect(resolveExcelLimits(v)).toMatchObject({
        warnCells: DEFAULT_EXCEL_WARN_CELLS,
        maxCells: DEFAULT_EXCEL_MAX_CELLS,
      });
    expect(resolveExcelLimits({ warn: 500, max: 100 })).toMatchObject({ warnCells: 100, maxCells: 100 });
    expect(resolveExcelLimits(Infinity)).toMatchObject({ maxCells: Infinity, warnCells: DEFAULT_EXCEL_WARN_CELLS });
    for (const v of [0, -1, NaN, Infinity]) expect(resolveExcelLimits(undefined, v).warnSize).toBe(Infinity);
  });
});

describe('loadFileData 大小边界', () => {
  const max = 1000;
  it.each([
    [max - 1, 'ok'],
    [max, 'ok'],
    [max + 1, 'oversize'],
    [0, 'ok'],
  ])('ArrayBuffer / TypedArray / Blob 大小 %i → %s', async (size, kind) => {
    for (const source of [
      bytes(size),
      new Uint8Array(size) as unknown as ArrayBuffer,
      new Blob([new Uint8Array(size)]),
    ]) {
      const res = await loadFileData(source, { maxSize: max, t });
      expect(res.kind).toBe(kind);
      expect(res.size).toBe(size);
    }
  });

  it('maxSize 为 Infinity 时不限制', async () => {
    expect((await loadFileData(bytes(5000), { maxSize: Infinity, t })).kind).toBe('ok');
  });

  it('开始前已中止：不读取，抛 AbortError', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(loadFileData('https://x/a.xlsx', { maxSize: max, t, signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('URL：Content-Length 与错误', () => {
  const max = 1000;
  let pulled = 0;
  let cancelled = false;
  /** 分块输出 total 字节；记录读出的字节数与是否被取消 */
  const stream = (total: number, chunk = 100, signal?: AbortSignal) => {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      async pull(c) {
        if (signal) await new Promise(r => setTimeout(r, 1));
        if (signal?.aborted) {
          c.error(new DOMException('Aborted', 'AbortError'));
          return;
        }
        if (sent >= total) {
          c.close();
          return;
        }
        const n = Math.min(chunk, total - sent);
        sent += n;
        pulled += n;
        c.enqueue(new Uint8Array(n));
      },
      cancel() {
        cancelled = true;
      },
    });
  };
  const serve = (body: BodyInit | null, headers: Record<string, string> = {}, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status, headers }))
    );

  beforeEach(() => {
    pulled = 0;
    cancelled = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [max - 1, 'ok'],
    [max, 'ok'],
    [max + 1, 'oversize'],
  ])('Content-Length 正确，大小 %i → %s；超过时不读内容', async (size, kind) => {
    serve(stream(size), { 'content-length': String(size) });
    const res = await loadFileData('https://x/a.bin', { maxSize: max, t });
    expect(res.kind).toBe(kind);
    expect(res.size).toBe(size);
    if (kind === 'oversize') expect(pulled).toBeLessThanOrEqual(100);
  });

  it.each([
    ['没有 Content-Length', {}],
    ['Content-Length 偏小', { 'content-length': '10' }],
    ['Content-Length 不是数字', { 'content-length': 'abc' }],
    ['Content-Length 为空', { 'content-length': '' }],
  ])('%s：边读边计数，超过 maxSize 立即取消', async (_, headers) => {
    serve(stream(100_000), headers as Record<string, string>);
    const res = await loadFileData('https://x/a.bin', { maxSize: max, t });
    expect(res.kind).toBe('oversize');
    expect(res.size).toBeGreaterThan(max);
    expect(pulled).toBeLessThanOrEqual(max + 200);
    expect(cancelled).toBe(true);
  });

  it('没有 Content-Length、恰好等于 maxSize：完整读取', async () => {
    serve(stream(max, 7));
    const res = await loadFileData('https://x/a.bin', { maxSize: max, t });
    expect(res).toMatchObject({ kind: 'ok', size: max });
    expect((res as { buffer: ArrayBuffer }).buffer.byteLength).toBe(max);
  });

  it('Content-Length 偏大（声明超过上限，实际很小）：按声明的大小只提供下载', async () => {
    serve(stream(10), { 'content-length': String(max + 1) });
    expect((await loadFileData('https://x/a.bin', { maxSize: max, t })).kind).toBe('oversize');
  });

  it('0 字节响应', async () => {
    serve(null, { 'content-length': '0' });
    expect(await loadFileData('https://x/a.bin', { maxSize: max, t })).toMatchObject({ kind: 'ok', size: 0 });
  });

  it.each([404, 500, 503])('HTTP %i → FileLoadError 带状态码', async status => {
    serve('err', {}, status);
    const err = await loadFileData('https://x/a.bin', { maxSize: max, t }).catch(e => e);
    expect(err).toBeInstanceOf(FileLoadError);
    expect(err.status).toBe(status);
  });

  it('网络错误、超时（TimeoutError）→ 网络错误，不会一直加载', async () => {
    for (const reason of [new TypeError('Failed to fetch'), new DOMException('timeout', 'TimeoutError')]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(reason))
      );
      const err = await loadFileData('https://x/a.bin', { maxSize: max, t }).catch(e => e);
      expect(err).toBeInstanceOf(FileLoadError);
      expect(err.message).toBe('networkError');
    }
  });

  it('下载中途中止 → AbortError，不再继续读', async () => {
    const ctrl = new AbortController();
    serve(stream(max, 10, ctrl.signal));
    const p = loadFileData('https://x/a.bin', { maxSize: max, t, signal: ctrl.signal });
    await new Promise(r => setTimeout(r, 0));
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(pulled).toBeLessThan(max);
  });
});

describe('Excel 提示条阈值：恰好等于 / ±1', () => {
  const d = resolveExcelLimits();
  it('单元格数：恰好等于 warn 不提示，+1 显示「文件较大」', () => {
    expect(excelNoticeOf({ cells: DEFAULT_EXCEL_WARN_CELLS - 1 }, 0, d)).toBeNull();
    expect(excelNoticeOf({ cells: DEFAULT_EXCEL_WARN_CELLS }, 0, d)).toBeNull();
    expect(excelNoticeOf({ cells: DEFAULT_EXCEL_WARN_CELLS + 1 }, 0, d)).toEqual({
      kind: 'cells',
      cells: DEFAULT_EXCEL_WARN_CELLS + 1,
    });
  });
  it('文件大小：恰好等于不提示，+1 提示；读不到单元格数时只按大小', () => {
    expect(excelNoticeOf({ cells: 1 }, DEFAULT_LARGE_FILE_WARN_SIZE, d)).toBeNull();
    expect(excelNoticeOf({ cells: 1 }, DEFAULT_LARGE_FILE_WARN_SIZE + 1, d)).toEqual({ kind: 'size' });
    expect(excelNoticeOf({}, DEFAULT_LARGE_FILE_WARN_SIZE + 1, d)).toEqual({ kind: 'size' });
    expect(excelNoticeOf({}, DEFAULT_LARGE_FILE_WARN_SIZE, d)).toBeNull();
  });
  it('截断优先于「文件较大」；多个工作表截断时报告第一个与其余数量', () => {
    const cut = [
      { sheet: 'A', rows: 10 },
      { sheet: 'B', rows: 0 },
    ];
    expect(excelNoticeOf({ cells: 9e9, truncated: cut }, 9e9, d)).toEqual({
      kind: 'truncated',
      sheet: 'A',
      rows: 10,
      more: 1,
    });
  });
  it('阈值为 Infinity：不提示（不限制）', () => {
    const l = resolveExcelLimits({ warn: Infinity, max: Infinity }, Infinity);
    expect(excelNoticeOf({ cells: 1e9 }, 1e12, l)).toBeNull();
  });
});

describe('Excel 截断：按实际读到的单元格数', () => {
  const cellsOf = (m: { sheets: Array<{ cells: Map<number, Map<number, unknown>> }> }) =>
    m.sheets.reduce((n, s) => n + [...s.cells.values()].reduce((k, r) => k + r.size, 0), 0);

  it('默认上限 500 万；恰好等于上限不截断，-1 截断在整行处，+1 不截断', async () => {
    expect(DEFAULT_EXCEL_MAX_CELLS).toBe(5_000_000);
    const data = makeXlsx([{ rows: numberRows(100, 10) }]);
    const exact = (await parseWorkbook(data, { xls: false, maxCells: 1000 }))!;
    expect(exact.sheets[0].truncatedRows).toBeUndefined();
    expect(exact.cellCount).toBe(1000);
    const more = (await parseWorkbook(data, { xls: false, maxCells: 1001 }))!;
    expect(more.sheets[0].truncatedRows).toBeUndefined();
    const less = (await parseWorkbook(data, { xls: false, maxCells: 999 }))!;
    // 第 100 行只读到 9 格：整行不显示，保留前 99 行
    expect(less.sheets[0].truncatedRows).toBe(99);
    expect(cellsOf(less)).toBe(990);
    expect(less.cellCount).toBe(990);
  });

  it('上限落在行边界：前 N 行完整保留', async () => {
    const data = makeXlsx([{ rows: numberRows(100, 10) }]);
    const m = (await parseWorkbook(data, { xls: false, maxCells: 500 }))!;
    expect(m.sheets[0].truncatedRows).toBe(50);
    expect(cellsOf(m)).toBe(500);
  });

  it('多个工作表共用上限：之后的工作表不再读取单元格', async () => {
    const data = makeXlsx([{ rows: numberRows(10, 10) }, { rows: numberRows(10, 10) }, { rows: numberRows(10, 10) }]);
    const m = (await parseWorkbook(data, { xls: false, maxCells: 150 }))!;
    expect(m.sheets.map(s => s.truncatedRows)).toEqual([undefined, 5, 0]);
    expect(cellsOf(m)).toBe(150);
  });

  it('截断后合并区域、行高截到最后一行', async () => {
    const rows = numberRows(10, 2).replace('<row r="9">', '<row r="9" ht="30" customHeight="1">');
    const data = makeXlsx([{ rows }]);
    const zip = new TextDecoder().decode(new Uint8Array(data));
    expect(zip).toContain('ht="30"');
    const m = (await parseWorkbook(data, { xls: false, maxCells: 10 }))!;
    expect(m.sheets[0].truncatedRows).toBe(5);
    expect([...m.sheets[0].rowHeights.keys()].every(r => r < 5)).toBe(true);
  });

  it('不可信的 <dimension>（只写 A1 / 写成整张表 / 超出 Excel 范围）不影响读取与提示', async () => {
    for (const ref of ['A1', 'A1:XFD1048576', 'A1:ZZZZ99999999', 'garbage']) {
      const data = makeXlsx([{ rows: numberRows(3, 3), ref }]);
      const m = (await parseWorkbook(data, { xls: false, maxCells: DEFAULT_EXCEL_MAX_CELLS }))!;
      expect(m.cellCount).toBe(9);
      expect(m.sheets[0].truncatedRows).toBeUndefined();
      expect(excelNoticeOf({ cells: m.cellCount }, data.byteLength, resolveExcelLimits())).toBeNull();
    }
  });

  it('超出 Excel 行列范围的单元格不显示（行号写成很大的值）', async () => {
    const data = makeXlsx([
      { rows: '<row r="1"><c r="A1"><v>1</v></c></row><row r="99999999"><c r="A99999999"><v>2</v></c></row>' },
    ]);
    const m = (await parseWorkbook(data, { xls: false }))!;
    expect([...m.sheets[0].cells.keys()]).toEqual([0]);
  });

  it('runBuild 送出进度：单调递增，最后为 1；按 maxCells 截断', async () => {
    const data = makeXlsx([{ rows: numberRows(3000, 4) }, { rows: numberRows(10, 2) }]);
    const messages: BuildMessage[] = [];
    await runBuild({ data, xls: false, locale: 'zh-CN', maxCells: 6000 }, m => messages.push(m));
    const values = messages.filter(m => m.type === 'progress').map(m => (m as { value: number }).value);
    expect(values.length).toBeGreaterThan(1);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    expect(values[values.length - 1]).toBe(1);
    const done = messages.find(m => m.type === 'done') as Extract<BuildMessage, { type: 'done' }>;
    expect(done.model.sheets[0].truncatedRows).toBe(1500);
    expect(done.model.sheets[1].truncatedRows).toBe(0);
    // assembler 忽略进度消息
    const assembler = createAssembler();
    for (const m of messages) assembler.post(m);
    expect(assembler.result()!.sheets).toHaveLength(2);
  });
});

describe('空表、多表、损坏文件', () => {
  it('空工作表与 200 个工作表：能直接生成数据', async () => {
    const empty = makeXlsx([{ rows: '' }]);
    const model = await parseWorkbook(empty, { xls: false });
    expect(model?.sheets).toHaveLength(1);
    const many = makeXlsx(Array.from({ length: 200 }, (_, i) => ({ rows: numberRows(1, (i % 3) + 1) })));
    const assembler = createAssembler();
    await runBuild({ data: many, xls: false, locale: 'zh-CN' }, assembler.post);
    expect(assembler.result()!.sheets).toHaveLength(200);
  });

  it('隐藏的工作表不显示；全部隐藏时全部显示', async () => {
    const run = async (data: ArrayBuffer) => {
      const a = createAssembler();
      await runBuild({ data, xls: false, locale: 'zh-CN' }, a.post);
      return a.result()!.sheets.map(s => s.name);
    };
    expect(await run(makeXlsx([{ rows: '' }, { rows: '', state: 'hidden' }]))).toEqual(['S1']);
    expect(
      await run(
        makeXlsx([
          { rows: '', state: 'hidden' },
          { rows: '', state: 'veryHidden' },
        ])
      )
    ).toEqual(['S1', 'S2']);
  });

  const good = () => makeXlsx([{ rows: numberRows(50, 5) }]);
  const xls = () => loadFixture('xls-styles.xls');
  it.each([
    ['0 字节 xlsx', () => bytes(0), false],
    ['只有 PK 头', () => textBuffer('PK\u0003\u0004'), false],
    ['xlsx 截断一半', () => good().slice(0, good().byteLength >> 1), false],
    ['xlsx 去掉最后 1 字节', () => good().slice(0, good().byteLength - 1), false],
    ['随机字节', () => new Uint8Array(4096).map((_, i) => (i * 7919) & 255).buffer as ArrayBuffer, false],
    ['0 字节 xls', () => bytes(0), true],
    ['xls 截断一半', () => xls().slice(0, xls().byteLength >> 1), true],
    ['xls 只有 OLE 头', () => xls().slice(0, 512), true],
    ['把 xlsx 当成 xls', () => good(), true],
  ])('%s：解析不抛错', async (_, make, isXls) => {
    const data = make();
    const messages: BuildMessage[] = [];
    await expect(runBuild({ data, xls: isXls, locale: 'zh-CN' }, m => messages.push(m))).resolves.toBeUndefined();
    expect(['none', 'done']).toContain(messages[messages.length - 1].type);
  });

  it('占位 xlsx 是能读取的空工作簿', async () => {
    const data = placeholderXlsx();
    expect(listZipEntries(data)!.has('xl/workbook.xml')).toBe(true);
    const model = await parseXlsxModel(data, { budget: createCellBudget(DEFAULT_EXCEL_MAX_CELLS) });
    expect(model!.cellCount).toBeLessThan(10);
  });
});

describe('Worker：不可用、出错、中止', () => {
  afterEach(() => {
    factory.create = null;
  });

  /** 在当前线程里运行 runBuild 的替身 Worker；mode 控制出错方式 */
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((e: MessageEvent<BuildMessage>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    constructor(private mode: 'ok' | 'crash' | 'error-message' | 'crash-midway' | 'hang' | 'messageerror') {
      FakeWorker.instances.push(this);
    }
    postMessage(req: { data: ArrayBuffer; xls: boolean; locale: string }) {
      const emit = (m: BuildMessage) =>
        !this.terminated && this.onmessage?.({ data: structuredClone(m) } as MessageEvent);
      setTimeout(() => {
        if (this.mode === 'hang') return;
        if (this.mode === 'crash') return this.onerror?.({ preventDefault() {} } as ErrorEvent);
        if (this.mode === 'messageerror') return this.onmessageerror?.();
        if (this.mode === 'error-message') return emit({ type: 'error', message: 'boom' });
        let n = 0;
        void runBuild(req, m => {
          if (this.mode === 'crash-midway' && ++n === 2) {
            this.onerror?.({ preventDefault() {} } as ErrorEvent);
            this.terminated = true;
          }
          emit(m);
        });
      }, 0);
    }
    terminate() {
      this.terminated = true;
    }
  }

  const data = () => makeXlsx([{ rows: numberRows(30, 4) }]);
  const fixup = async (signal?: AbortSignal) => {
    const { prepareExcelFixup } = await import('../excel');
    return prepareExcelFixup({ data: data(), xls: false, signal });
  };

  it('Worker 正常：在 Worker 里生成，完成后 terminate', async () => {
    FakeWorker.instances = [];
    factory.create = () => new FakeWorker('ok') as unknown as Worker;
    const f = await fixup();
    expect(f.direct).toBe('worker');
    expect(FakeWorker.instances[0].terminated).toBe(true);
    f.dispose?.();
  });

  it.each(['crash', 'error-message', 'crash-midway', 'messageerror'] as const)(
    'Worker %s → 改在主线程生成，并 terminate',
    async mode => {
      FakeWorker.instances = [];
      factory.create = () => new FakeWorker(mode) as unknown as Worker;
      const f = await fixup();
      expect(f.direct).toBe('main');
      expect(FakeWorker.instances[0].terminated).toBe(true);
      f.dispose?.();
    }
  );

  it('没有 Worker / 创建失败（含 CSP 禁止 blob: Worker）→ 主线程', async () => {
    factory.create = () => null;
    const f = await fixup();
    expect(f.direct).toBe('main');
    f.dispose?.();
  });

  it('解析中中止：立即 terminate，不再回退到主线程', async () => {
    FakeWorker.instances = [];
    factory.create = () => new FakeWorker('hang') as unknown as Worker;
    const ctrl = new AbortController();
    const p = fixup(ctrl.signal);
    await new Promise(r => setTimeout(r, 5));
    ctrl.abort();
    const f = await p;
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    // 中止后不在主线程重新解析
    expect(f.direct).toBe(false);
    f.dispose?.();
  });

  it('损坏的 xlsx / xls：直接生成失败，改用 @vue-office/excel 自己的读取，不抛错', async () => {
    const { prepareExcelFixup } = await import('../excel');
    for (const [d, xls] of [
      [data().slice(0, 200), false],
      [bytes(0), false],
      [loadFixture('xls-styles.xls').slice(0, 600), true],
    ] as const) {
      const f = await prepareExcelFixup({ data: d, xls });
      expect(f.direct).toBe(false);
      f.dispose?.();
    }
  });

  it('开始前已中止：不创建 Worker', async () => {
    const create = vi.fn(() => new FakeWorker('ok') as unknown as Worker);
    factory.create = create;
    const ctrl = new AbortController();
    ctrl.abort();
    (await fixup(ctrl.signal)).dispose?.();
    expect(create).not.toHaveBeenCalled();
  });

  it('连续 20 次开始又中止：每个 Worker 都被 terminate', async () => {
    FakeWorker.instances = [];
    factory.create = () => new FakeWorker('hang') as unknown as Worker;
    const runs: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      const ctrl = new AbortController();
      runs.push(fixup(ctrl.signal).then(f => f.dispose?.()));
      await new Promise(r => setTimeout(r, 0));
      ctrl.abort();
    }
    await Promise.all(runs);
    expect(FakeWorker.instances.length).toBe(20);
    expect(FakeWorker.instances.every(w => w.terminated)).toBe(true);
  });
});
