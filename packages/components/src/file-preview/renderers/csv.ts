/**
 * CSV 渲染器：默认按表格显示（首行作为表头、带行号、表头吸顶），可切换为源文本。
 * 编码判定与文本渲染器一致（BOM → UTF-8 严格校验 → GBK），分隔符自动识别（, ; Tab）。
 * 大文件每次只解析、渲染 CSV_PAGE_SIZE 行，点击「加载更多」继续。
 */
import { CSV_PAGE_SIZE, resolveCsvMaxRows } from '../constant';
import type { CsvMode } from '../types';
import { createCsvRowReader, detectCsvDelimiter, type CsvRowReader } from '../utils/csv';
import { decodeTextBuffer, textRenderer } from './text';
import { createNoticeBar } from './notice-bar';
import type { PreviewRenderer, PreviewRendererInstance, RenderContext } from './types';

const NUMBER_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?%?$/;

function createButton(className: string, text: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

/** 表格视图 */
function renderTable(
  body: HTMLElement,
  reader: CsvRowReader,
  context: RenderContext,
  onSummary: (text: string) => void,
  onLimit: (rows: number) => void
) {
  const scroll = document.createElement('div');
  scroll.className = 'yss-file-preview-csv__scroll';
  const table = document.createElement('table');
  table.className = 'yss-file-preview-csv__table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const tbody = document.createElement('tbody');
  thead.appendChild(headRow);
  table.append(thead, tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  const rowNumber = context.csvRowNumber === true;
  /** 行号列占用的列数 */
  const offset = rowNumber ? 1 : 0;
  let columns = 0;
  let rowCount = 0;
  let more: HTMLElement | null = null;

  const ensureColumns = (count: number) => {
    if (columns === 0 && rowNumber && headRow.childElementCount === 0) {
      const index = document.createElement('th');
      index.className = 'yss-file-preview-csv__index';
      index.scope = 'col';
      index.textContent = '#';
      headRow.appendChild(index);
    }
    if (count <= columns) return;
    const added = count - columns;
    for (let i = 0; i < added; i += 1) {
      const th = document.createElement('th');
      th.scope = 'col';
      headRow.appendChild(th);
    }
    // 后面出现更长的行时，给已经渲染的行补齐单元格，保持表格边框整齐
    tbody.querySelectorAll('tr').forEach(tr => {
      for (let i = 0; i < added; i += 1) tr.appendChild(document.createElement('td'));
    });
    columns = count;
  };

  const [header] = reader.next(1);
  if (!header) {
    const empty = document.createElement('div');
    empty.className = 'yss-file-preview-csv__empty';
    empty.textContent = context.t('csvNoData');
    scroll.replaceChildren(empty);
    onSummary(context.t('csvSummary', { rows: 0, cols: 0 }));
    return () => undefined;
  }
  ensureColumns(header.length);
  header.forEach((cell, i) => {
    headRow.children[i + offset].textContent = cell;
  });

  const updateSummary = () => {
    const params = { rows: rowCount, cols: columns };
    onSummary(reader.done ? context.t('csvSummary', params) : context.t('csvPartial', params));
  };

  // 显示行数上限：0、负数、NaN 按默认值，Infinity 不限制，小数向下取整
  const maxRows = resolveCsvMaxRows(context.csvMaxRows);
  let limited = false;
  const appendRows = () => {
    const rows = reader.next(Math.min(CSV_PAGE_SIZE, maxRows - rowCount));
    ensureColumns(rows.reduce((max, row) => Math.max(max, row.length), 0));
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      rowCount += 1;
      const tr = document.createElement('tr');
      if (rowNumber) {
        const index = document.createElement('th');
        index.className = 'yss-file-preview-csv__index';
        index.scope = 'row';
        index.textContent = String(rowCount);
        tr.appendChild(index);
      }
      for (let i = 0; i < columns; i += 1) {
        const td = document.createElement('td');
        const value = row[i] ?? '';
        td.textContent = value;
        if (value && NUMBER_RE.test(value.trim())) td.className = 'yss-file-preview-csv__num';
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);
    if (rowCount === 0 && reader.done) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'yss-file-preview-csv__empty';
      td.colSpan = columns + offset;
      td.textContent = context.t('csvNoData');
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    updateSummary();
    if (reader.done) more?.remove();
    else if (rowCount >= maxRows && !limited) {
      limited = true;
      more?.remove();
      const tip = document.createElement('div');
      tip.className = 'yss-file-preview-csv__more yss-file-preview-csv__limit';
      tip.textContent = context.t('csvLimit', { rows: rowCount.toLocaleString(context.locale || undefined) });
      body.appendChild(tip);
      onLimit(rowCount);
    }
  };

  appendRows();
  let cleanup = () => undefined as void;
  if (!reader.done && !limited) {
    more = document.createElement('div');
    more.className = 'yss-file-preview-csv__more';
    const button = createButton('yss-file-preview-csv__more-btn', context.t('loadMore'), appendRows);
    more.appendChild(button);
    body.appendChild(more);
    cleanup = () => button.removeEventListener('click', appendRows);
  }
  return cleanup;
}

export const csvRenderer: PreviewRenderer = {
  types: ['csv'],
  create() {
    let wrapper: HTMLElement | null = null;
    let disposeView: (() => void) | null = null;
    let limitNotice: HTMLElement | null = null;

    const instance: PreviewRendererInstance = {
      async render(container, data, context) {
        const text = decodeTextBuffer(data, context.textEncoding);
        const delimiter = detectCsvDelimiter(text);
        let mode: CsvMode = context.csvMode === 'text' ? 'text' : 'table';

        wrapper = document.createElement('div');
        wrapper.className = 'yss-file-preview-csv';
        const bar = document.createElement('div');
        bar.className = 'yss-file-preview-csv__bar';
        const summary = document.createElement('span');
        summary.className = 'yss-file-preview-csv__summary';
        const body = document.createElement('div');
        body.className = 'yss-file-preview-csv__body';

        const toggle = createButton('yss-file-preview-csv__toggle', '', () => {
          mode = mode === 'table' ? 'text' : 'table';
          void show();
        });
        toggle.setAttribute('aria-pressed', 'false');
        bar.append(summary, toggle);
        wrapper.append(bar, body);
        container.appendChild(wrapper);

        const show = async () => {
          disposeView?.();
          limitNotice?.remove();
          limitNotice = null;
          body.replaceChildren();
          toggle.textContent = mode === 'table' ? context.t('csvViewSource') : context.t('csvViewTable');
          toggle.setAttribute('aria-pressed', String(mode === 'text'));
          if (mode === 'table') {
            disposeView = renderTable(body, createCsvRowReader(text, delimiter), context, value => {
              summary.textContent = value;
            }, rows => {
              limitNotice = createNoticeBar(context.t('csvLimitNotice', { rows: rows.toLocaleString(context.locale || undefined) }));
              wrapper?.insertBefore(limitNotice, body);
            });
          } else {
            summary.textContent = '';
            const source = textRenderer.create();
            await source.render(body, data, context);
            disposeView = () => source.destroy?.();
          }
        };
        await show();
      },
      destroy() {
        disposeView?.();
        disposeView = null;
        limitNotice?.remove();
        limitNotice = null;
        wrapper?.remove();
        wrapper = null;
      },
    };
    return instance;
  },
};

export default csvRenderer;
