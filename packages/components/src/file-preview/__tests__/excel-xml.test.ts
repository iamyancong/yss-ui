/**
 * 小型 XML 解析器：图表 / 绘图 OOXML 在 Node 环境也能解析。
 */
import { describe, expect, it } from 'vitest';
import { boolVal, child, childrenOf, find, findAll, numVal, parseXml, path, textContent, unwrapAlternate, val } from '../excel/xml';

describe('parseXml', () => {
  it('去掉命名空间前缀，保留带前缀的属性，解码文字', () => {
    const root = parseXml(`<c:chartSpace xmlns:c="c" r:id="rId1"><c:title a="1">A&amp;B</c:title></c:chartSpace>`);
    expect(root).toMatchObject({ name: 'chartSpace', prefix: 'c', attrs: { 'xmlns:c': 'c', 'r:id': 'rId1' } });
    expect(child(root, 'title')?.text).toBe('A&B');
    expect(child(root, 'title')?.attrs.a).toBe('1');
  });

  it('忽略注释、处理指令，读取 CDATA 与自闭合元素', () => {
    const root = parseXml(`<?xml version="1.0"?><!--x--><root><a/><![CDATA[<raw>]]></root>`);
    expect(root?.name).toBe('root');
    expect(child(root, 'a')?.children).toEqual([]);
    expect(root?.text).toBe('<raw>');
  });

  it('空值、截断标签返回已解析部分，不抛异常', () => {
    expect(parseXml(null)).toBeNull();
    expect(parseXml('')).toBeNull();
    const truncated = parseXml('<c:chartSpace><c:chart><c:title><c:tx>');
    expect(truncated?.name).toBe('chartSpace');
    expect(find(truncated, 'tx')).toBeTruthy();
  });

  it('不匹配的结束标签忽略；展开 mc:AlternateContent', () => {
    const root = parseXml(
      `<a:lst><mc:AlternateContent xmlns:mc="mc"><mc:Choice Requires="x"><c:sp name="ok"/></mc:Choice><mc:Fallback><c:sp name="old"/></mc:Fallback></mc:AlternateContent></a:lst>`
    );
    const items = unwrapAlternate(root?.children ?? []);
    expect(items).toHaveLength(1);
    expect(items[0].attrs.name).toBe('ok');
  });

  it('path / findAll / val / boolVal / numVal / 段落文字', () => {
    const root = parseXml(
      `<c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:gapWidth val="150"/><c:varyColors/></c:barChart></c:plotArea><c:title><a:p><a:t>Hello</a:t></a:p><a:p><a:t>World</a:t></a:p></c:title></c:chart>`
    );
    expect(path(root, 'plotArea', 'barChart')?.name).toBe('barChart');
    expect(val(path(root, 'plotArea', 'barChart'), 'barDir')).toBe('col');
    expect(numVal(path(root, 'plotArea', 'barChart'), 'gapWidth')).toBe(150);
    expect(boolVal(path(root, 'plotArea', 'barChart'), 'varyColors')).toBe(true);
    expect(boolVal(root, 'missing', false)).toBe(false);
    expect(childrenOf(path(root, 'plotArea'), 'barChart')).toHaveLength(1);
    expect(findAll(root, 'p')).toHaveLength(2);
    expect(textContent(child(root, 'title'))).toBe('Hello\nWorld');
    expect(textContent(parseXml('<cx:txData><cx:v>Waterfall (chartex)</cx:v></cx:txData>'))).toBe('Waterfall (chartex)');
  });
});
