/**
 * zip 替换条目往返、prepareForExcelJs 清空绘图并去掉批注关系。
 */
import { describe, expect, it } from 'vitest';
import { prepareForExcelJs } from '../excel/xlsx';
import { listZipEntries, readZipEntry, readZipText, replaceZipEntries } from '../excel/zip';
import { loadFixture } from './helpers';

describe('replaceZipEntries', () => {
  it('替换指定条目后仍能按中央目录读回，其余条目保留', async () => {
    const original = loadFixture('xlsx-display.xlsx');
    const entries = listZipEntries(original)!;
    expect(entries.size).toBeGreaterThan(3);
    const replacements = new Map<string, Uint8Array>([['xl/workbook.xml', new TextEncoder().encode('<workbook/>')]]);
    const out = replaceZipEntries(original, entries, replacements)!;
    const after = listZipEntries(out)!;
    expect(await readZipText(out, after, 'xl/workbook.xml')).toBe('<workbook/>');
    const styles = await readZipText(out, after, 'xl/styles.xml');
    expect(styles).toContain('styleSheet');
  });
});

describe('readZipEntry 解压上限', () => {
  it('解压结果超过目录声明的大小时中止并返回 null（防 zip 炸弹）；未声明大小时照常读取', async () => {
    const data = loadFixture('xlsx-display.xlsx');
    const entries = listZipEntries(data)!;
    const styles = entries.get('xl/styles.xml')!;
    expect(styles.method).toBe(8);
    const full = await readZipEntry(data, styles);
    expect(full?.byteLength).toBe(styles.size);
    expect(await readZipEntry(data, { ...styles, size: 16 })).toBeNull();
    const unknown = await readZipEntry(data, { ...styles, size: 0 });
    expect(unknown?.byteLength).toBe(styles.size);
  });
});

describe('prepareForExcelJs', () => {
  it('清空绘图 XML，去掉批注关系；原文件仍可被自己的解析使用', async () => {
    const original = loadFixture('xlsx-objects.xlsx');
    const prepared = await prepareForExcelJs(original);
    expect(prepared).not.toBeNull();
    expect(prepared).not.toBe(original);
    const after = listZipEntries(prepared!)!;
    const drawing = await readZipText(prepared!, after, 'xl/drawings/drawing1.xml');
    expect(drawing).toContain('xdr:wsDr');
    expect(drawing).not.toMatch(/<(?:\w+:)?(?:pic|sp|graphicFrame)\b/);
    const rels = [...after.keys()].filter(n => n.includes('worksheets/_rels/'));
    for (const path of rels) {
      const text = await readZipText(prepared!, after, path);
      expect(text ?? '').not.toMatch(/\/comments"/);
    }
    const untouched = listZipEntries(original)!;
    const rawDrawing = await readZipText(original, untouched, 'xl/drawings/drawing1.xml');
    expect(rawDrawing).toMatch(/pic|twoCellAnchor/);
  });

  it('没有需要改写的条目时返回 null', async () => {
    expect(await prepareForExcelJs(loadFixture('xlsx-display.xlsx'))).toBeNull();
  });
});
