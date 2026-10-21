import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CSV_PAGE_SIZE } from '../constant';
import { csvRenderer } from '../renderers/csv';
import type { RenderContext } from '../renderers/types';
import { textBuffer } from './helpers';

const createContext = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  fileName: 'data.csv',
  fileType: 'csv',
  textEncoding: 'auto',
  signal: new AbortController().signal,
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  appContext: null,
  ...overrides,
});

const cells = (row: Element) => [...row.children].map(cell => cell.textContent);

describe('CSV 表格渲染器', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it('首行作为表头，默认不显示行号，不规则行补齐，数字右对齐', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('name,qty\n"Smith, J",12\nshort\nx,1,extra\n'), createContext());
    expect(container.querySelector('.yss-file-preview-csv__index')).toBeNull();
    const headRow = container.querySelector('thead tr')!;
    expect(cells(headRow)).toEqual(['name', 'qty', '']);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map(cells)).toEqual([
      ['Smith, J', '12', ''],
      ['short', '', ''],
      ['x', '1', 'extra'],
    ]);
    expect(rows[0].children[1].className).toContain('yss-file-preview-csv__num');
    expect(container.querySelector('.yss-file-preview-csv__summary')!.textContent).toBe(
      'csvSummary:{"rows":3,"cols":3}'
    );
    // 每一行的单元格数一致
    expect(new Set(rows.map(row => row.children.length)).size).toBe(1);
    // 内容只作为文本写入
    instance.destroy?.();
    expect(container.innerHTML).toBe('');
  });

  it('csvRowNumber=true 时显示吸左的行号列，表头和数据列都不错位', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('id,name\n7,a\nshort\n'), createContext({ csvRowNumber: true }));
    const headRow = container.querySelector('thead tr')!;
    expect(cells(headRow)).toEqual(['#', 'id', 'name']);
    expect(headRow.children[0].className).toBe('yss-file-preview-csv__index');
    expect(headRow.children[1].className).not.toContain('yss-file-preview-csv__index');
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.map(cells)).toEqual([
      ['1', '7', 'a'],
      ['2', 'short', ''],
    ]);
    expect(rows[0].children[0].tagName).toBe('TH');
    expect(rows[0].children[0].getAttribute('scope')).toBe('row');
  });

  it('只有表头 + 行号时，空数据提示横跨所有列', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('a,b\n'), createContext({ csvRowNumber: true }));
    expect(container.querySelector<HTMLTableCellElement>('tbody .yss-file-preview-csv__empty')!.colSpan).toBe(3);
    const plain = csvRenderer.create();
    const box = document.createElement('div');
    await plain.render(box, textBuffer('a,b\n'), createContext());
    expect(box.querySelector<HTMLTableCellElement>('tbody .yss-file-preview-csv__empty')!.colSpan).toBe(2);
  });

  it('单元格内容不会被当作 HTML 解析', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('a\n<img src=x onerror=alert(1)>\n'), createContext());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('tbody td')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('GBK 编码、分号分隔自动识别', async () => {
    const gbk = new Uint8Array([
      208, 213, 195, 251, 59, 179, 199, 202, 208, 10, 213, 197, 200, 253, 59, 177, 177, 190, 169, 10,
    ]).buffer;
    const instance = csvRenderer.create();
    await instance.render(container, gbk, createContext());
    expect(cells(container.querySelector('thead tr')!)).toEqual(['姓名', '城市']);
    expect(cells(container.querySelector('tbody tr')!)).toEqual(['张三', '北京']);
  });

  it('只有表头时提示没有数据行', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('a,b,c\r\n'), createContext());
    expect(cells(container.querySelector('thead tr')!)).toEqual(['a', 'b', 'c']);
    expect(container.querySelector('tbody .yss-file-preview-csv__empty')!.textContent).toBe('csvNoData');
  });

  it('大文件每次渲染固定行数，加载更多后继续', async () => {
    const total = CSV_PAGE_SIZE * 2 + 5;
    const text = ['id,value', ...Array.from({ length: total }, (_, i) => `${i + 1},v${i + 1}`)].join('\n');
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer(text), createContext());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(CSV_PAGE_SIZE);
    const summary = container.querySelector('.yss-file-preview-csv__summary')!;
    expect(summary.textContent).toBe(`csvPartial:{"rows":${CSV_PAGE_SIZE},"cols":2}`);
    const more = () => container.querySelector<HTMLButtonElement>('.yss-file-preview-csv__more-btn');
    more()!.click();
    more()!.click();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(total);
    expect(more()).toBeNull();
    expect(summary.textContent).toBe(`csvSummary:{"rows":${total},"cols":2}`);
    expect(cells(container.querySelector('tbody tr:last-child')!)).toEqual([String(total), `v${total}`]);
  });

  it('加载更多时出现更长的行，已渲染的行也会补齐单元格', async () => {
    const text = ['a,b', ...Array.from({ length: CSV_PAGE_SIZE }, (_, i) => `${i},x`), '1,2,3,4'].join('\n');
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer(text), createContext());
    container.querySelector<HTMLButtonElement>('.yss-file-preview-csv__more-btn')!.click();
    expect(container.querySelector('thead tr')!.children).toHaveLength(4);
    const lengths = new Set([...container.querySelectorAll('tbody tr')].map(tr => tr.children.length));
    expect([...lengths]).toEqual([4]);
  });

  it('可以在表格与源文本之间切换，csvMode=text 时默认显示源文本', async () => {
    const instance = csvRenderer.create();
    await instance.render(container, textBuffer('a,b\n1,2\n'), createContext({ csvMode: 'text' }));
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.yss-file-preview-text__content')!.textContent).toBe('a,b\n1,2\n');
    const toggle = container.querySelector<HTMLButtonElement>('.yss-file-preview-csv__toggle')!;
    expect(toggle.textContent).toBe('csvViewTable');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    await Promise.resolve();
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('.yss-file-preview-text__content')).toBeNull();
    expect(toggle.textContent).toBe('csvViewSource');
    instance.destroy?.();
    expect(container.innerHTML).toBe('');
  });
});
