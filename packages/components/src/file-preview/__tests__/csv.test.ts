import { describe, expect, it } from 'vitest';
import { createCsvRowReader, detectCsvDelimiter, parseCsv, stripBom } from '../utils/csv';

describe('CSV 解析（RFC 4180）', () => {
  it('普通字段、空单元格与末尾换行', () => {
    expect(parseCsv('a,b,c\n1,,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
    expect(parseCsv(',\n')).toEqual([['', '']]);
    expect(parseCsv('a,b,')).toEqual([['a', 'b', '']]);
  });

  it('引号字段：逗号、换行、转义引号、空引号', () => {
    const text = 'name,note\n"Smith, J","He said ""hi""\nsecond line"\n"",x\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Smith, J', 'He said "hi"\nsecond line'],
      ['', 'x'],
    ]);
    expect(parseCsv('"""quoted"""')).toEqual([['"quoted"']]);
  });

  it('CRLF、CR 换行与 BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('"x\r\ny",z\r\n')).toEqual([['x\r\ny', 'z']]);
    expect(stripBom('\uFEFFabc')).toBe('abc');
  });

  it('不规则行按原样返回，空行被跳过', () => {
    expect(parseCsv('a,b,c\n1\n\n1,2,3,4\n\n')).toEqual([['a', 'b', 'c'], ['1'], ['1', '2', '3', '4']]);
  });

  it('容错：未闭合的引号读到结尾，闭合引号后的多余字符保留，字段中间的引号按普通字符', () => {
    expect(parseCsv('"abc,def\nxyz')).toEqual([['abc,def\nxyz']]);
    expect(parseCsv('"ab"cd,e')).toEqual([['abcd', 'e']]);
    expect(parseCsv('5" screen,ok')).toEqual([['5" screen', 'ok']]);
  });

  it('自动识别分隔符：逗号、分号、Tab，引号内的分隔符不计入', () => {
    expect(detectCsvDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectCsvDelimiter('a;b;c\n1,5;2,5;3')).toBe(';');
    expect(detectCsvDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectCsvDelimiter('"x;y;z",b\n"1;2;3",c')).toBe(',');
    expect(detectCsvDelimiter('single column\nvalue')).toBe(',');
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('逐行读取：按需解析，done 状态正确', () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `${i},"v${i}"`).join('\n');
    const reader = createCsvRowReader(lines, ',');
    expect(reader.next(1000)).toHaveLength(1000);
    expect(reader.done).toBe(false);
    expect(reader.next(1000)[0]).toEqual(['1000', 'v1000']);
    const rest = reader.next(1000);
    expect(rest).toHaveLength(500);
    expect(rest.at(-1)).toEqual(['2499', 'v2499']);
    expect(reader.done).toBe(true);
    expect(reader.next(10)).toEqual([]);
  });
});
