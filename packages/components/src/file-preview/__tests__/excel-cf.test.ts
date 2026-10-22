/**
 * 条件格式：支持的规则按保存的值计算；expression 记为未支持。
 */
import { describe, expect, it } from 'vitest';
import { computeConditionalFormats, parseDxfs, sheetColor } from '../excel/cf';
import { createSheetModel, setCell } from '../excel/model';
import { parseXml } from '../excel/xml';

const theme = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4'];

const sheetOf = (values: Array<number | string | null>) => {
  const sheet = createSheetModel('s');
  values.forEach((v, i) => {
    if (v === null) setCell(sheet, i, 0, { t: 'z', v: null, fmt: 'General' });
    else if (typeof v === 'number') setCell(sheet, i, 0, { t: 'n', v, fmt: 'General' });
    else setCell(sheet, i, 0, { t: 's', v, fmt: 'General' });
  });
  return sheet;
};

describe('sheetColor / parseDxfs', () => {
  it('rgb / theme / indexed 颜色', () => {
    expect(sheetColor(parseXml(`<color rgb="FFFF0000"/>`), theme)).toBe('#FF0000');
    expect(sheetColor(parseXml(`<color theme="4"/>`), theme)).toBe('#4472C4');
    expect(sheetColor(parseXml(`<color indexed="2"/>`), theme)).toBe('#FF0000');
    expect(sheetColor(parseXml(`<color auto="1"/>`), theme)).toBeUndefined();
  });

  it('dxf 取填充色和字体', () => {
    const dxfs = parseDxfs(
      `<dxfs count="1"><dxf><font><color rgb="FF9C0006"/><b/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs>`,
      theme
    );
    expect(dxfs[0]).toMatchObject({ color: '#9C0006', bg: '#FFC7CE', bold: true });
  });
});

describe('computeConditionalFormats', () => {
  it('cellIs 小于 0 命中负数', () => {
    const sheet = sheetOf([-2, 0, 3]);
    const r = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A3"><cfRule type="cellIs" operator="lessThan" dxfId="0" priority="1"><formula>0</formula></cfRule></conditionalFormatting>`,
      sheet,
      [{ bg: '#FFC7CE' }],
      theme
    );
    expect(r?.styles.get('0,0')?.bg).toBe('#FFC7CE');
    expect(r?.styles.has('1,0')).toBe(false);
  });

  it('色阶与数据条（含负值）', () => {
    const sheet = sheetOf([0, 50, 100, -10]);
    const scale = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A3"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/><color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale></cfRule></conditionalFormatting>`,
      sheet,
      [],
      theme
    );
    expect(scale?.styles.get('0,0')?.bg).toBe('#F8696B');
    expect(scale?.styles.get('2,0')?.bg).toBe('#63BE7B');
    const bars = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A4"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF638EC6"/></dataBar></cfRule></conditionalFormatting>`,
      sheet,
      [],
      theme
    );
    expect(bars?.bars.length).toBe(4);
    expect(bars?.bars.some(b => b.negative)).toBe(true);
  });

  it('文本、空值、重复值、前 N 项、高于平均', () => {
    const sheet = sheetOf(['apple', 'banana', 'apple', 1, 9, 9]);
    const text = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A3"><cfRule type="containsText" operator="containsText" text="app" dxfId="0" priority="1"/></conditionalFormatting>`,
      sheet,
      [{ bold: true }],
      theme
    );
    expect(text?.styles.get('0,0')?.bold).toBe(true);
    expect(text?.styles.get('1,0')?.bold).toBeUndefined();
    const dup = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A3"><cfRule type="duplicateValues" dxfId="0" priority="1"/></conditionalFormatting>`,
      sheet,
      [{ italic: true }],
      theme
    );
    expect(dup?.styles.get('0,0')?.italic).toBe(true);
    const top = computeConditionalFormats(
      `<conditionalFormatting sqref="A4:A6"><cfRule type="top10" rank="1" dxfId="0" priority="1"/></conditionalFormatting>`,
      sheet,
      [{ bg: '#EEE' }],
      theme
    );
    expect(top?.styles.get('4,0')?.bg).toBe('#EEE');
  });

  it('expression 记为未支持，不影响已支持的规则', () => {
    const sheet = sheetOf([1, 2]);
    const r = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A2"><cfRule type="expression" dxfId="0" priority="1"><formula>MOD(A1,2)=0</formula></cfRule><cfRule type="cellIs" operator="greaterThan" dxfId="0" priority="4"><formula>0</formula></cfRule></conditionalFormatting>`,
      sheet,
      [{ bg: '#DDD' }],
      theme
    );
    expect(r?.unsupported).toBe(1);
    expect(r?.styles.get('0,0')?.bg).toBe('#DDD');
  });

  it('图标集按百分位落到三档', () => {
    const sheet = sheetOf([0, 50, 100]);
    const r = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A3"><cfRule type="iconSet" priority="1"><iconSet iconSet="3Arrows"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting>`,
      sheet,
      [],
      theme
    );
    expect(r?.icons).toHaveLength(3);
    expect(r?.icons[0].glyph).toBe('▼');
    expect(r?.icons[2].glyph).toBe('▲');
  });

  it('timePeriod today 命中当天的序列日期', () => {
    const epoch = Date.UTC(1899, 11, 30);
    const today = new Date();
    const serial = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - epoch) / 86400000);
    const sheet = sheetOf([serial, serial - 10]);
    const r = computeConditionalFormats(
      `<conditionalFormatting sqref="A1:A2"><cfRule type="timePeriod" timePeriod="today" dxfId="0" priority="1"/></conditionalFormatting>`,
      sheet,
      [{ bg: '#CCE5FF' }],
      theme
    );
    expect(r?.styles.get('0,0')?.bg).toBe('#CCE5FF');
    expect(r?.styles.has('1,0')).toBe(false);
  });
});
