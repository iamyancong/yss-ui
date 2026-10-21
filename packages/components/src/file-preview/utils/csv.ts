/**
 * CSV 解析（RFC 4180）。
 * - 支持双引号包裹的字段、字段内的 "" 转义、逗号和换行
 * - 兼容 LF / CRLF / CR 换行，自动去掉开头的 BOM
 * - 不规则行（列数不一致）按原样返回，由渲染层补齐
 * - 逐行读取，大文件只解析当前需要显示的部分
 */

/** 支持自动识别的分隔符 */
export const CSV_DELIMITERS = [',', ';', '\t'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** 逐行读取器 */
export interface CsvRowReader {
  /** 使用的分隔符 */
  readonly delimiter: CsvDelimiter;
  /** 是否已读完 */
  readonly done: boolean;
  /** 读取接下来最多 count 行 */
  next(count: number): string[][];
}

const QUOTE = 34; // "
const LF = 10;
const CR = 13;

/** 去掉开头的 BOM */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 创建逐行读取器。
 * 空行（只有换行的行）会被跳过，文件末尾的换行不会产生多余的行。
 */
export function createCsvRowReader(source: string, delimiter: CsvDelimiter = ','): CsvRowReader {
  const text = stripBom(source);
  const length = text.length;
  const delimiterCode = delimiter.charCodeAt(0);
  let pos = 0;

  const readRow = (): string[] => {
    const row: string[] = [];
    let field = '';
    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === QUOTE && field === '') {
        // 引号字段：读到单独的闭合引号为止
        pos += 1;
        let start = pos;
        let value = '';
        while (pos < length) {
          const c = text.charCodeAt(pos);
          if (c === QUOTE) {
            if (text.charCodeAt(pos + 1) === QUOTE) {
              value += text.slice(start, pos + 1);
              pos += 2;
              start = pos;
              continue;
            }
            break;
          }
          pos += 1;
        }
        value += text.slice(start, pos);
        pos += 1; // 跳过闭合引号（未闭合时已到末尾）
        // 闭合引号后到分隔符/换行前的多余字符按原样保留（容错）
        const tailStart = pos;
        while (pos < length) {
          const c = text.charCodeAt(pos);
          if (c === delimiterCode || c === LF || c === CR) break;
          pos += 1;
        }
        field = value + text.slice(tailStart, pos);
        continue;
      }
      if (code === delimiterCode) {
        row.push(field);
        field = '';
        pos += 1;
        continue;
      }
      if (code === LF || code === CR) {
        pos += code === CR && text.charCodeAt(pos + 1) === LF ? 2 : 1;
        row.push(field);
        return row;
      }
      // 普通字段：一次读到分隔符、换行或引号
      const start = pos;
      while (pos < length) {
        const c = text.charCodeAt(pos);
        if (c === delimiterCode || c === LF || c === CR) break;
        pos += 1;
      }
      field += text.slice(start, pos);
    }
    row.push(field);
    return row;
  };

  return {
    delimiter,
    get done() {
      return pos >= length;
    },
    next(count: number) {
      const rows: string[][] = [];
      while (rows.length < count && pos < length) {
        const row = readRow();
        if (row.length === 1 && row[0] === '') continue;
        rows.push(row);
      }
      return rows;
    },
  };
}

/** 一次性解析全部内容 */
export function parseCsv(source: string, delimiter?: CsvDelimiter): string[][] {
  const text = stripBom(source);
  const reader = createCsvRowReader(text, delimiter ?? detectCsvDelimiter(text));
  return reader.next(Number.POSITIVE_INFINITY);
}

/**
 * 根据开头若干行识别分隔符：选择能把每行切成多列、且各行列数最一致的分隔符。
 * 都无法切分时返回逗号。
 */
export function detectCsvDelimiter(source: string, sampleRows = 20): CsvDelimiter {
  const sample = stripBom(source).slice(0, 64 * 1024);
  let best: CsvDelimiter = ',';
  let bestScore = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const rows = createCsvRowReader(sample, delimiter).next(sampleRows);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    let modeColumns = 1;
    let modeHits = 0;
    counts.forEach((hits, columns) => {
      if (hits > modeHits || (hits === modeHits && columns > modeColumns)) {
        modeColumns = columns;
        modeHits = hits;
      }
    });
    if (modeColumns < 2) continue;
    // 一致的行占比优先，其次是列数
    const score = (modeHits / rows.length) * 1000 + Math.min(modeColumns, 999);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}
