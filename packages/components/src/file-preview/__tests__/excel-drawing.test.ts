/**
 * 绘图部件：超链接协议白名单、批注、关系路径、损坏图表 XML。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLORS, type ThemeInfo } from '../excel/dml';
import {
  parseComments,
  parseDrawing,
  parseRels,
  parseSheetParts,
  resolvePath,
  safeUrl,
  type PartReader,
} from '../excel/drawing';

const theme: ThemeInfo = { colors: DEFAULT_THEME_COLORS };

describe('safeUrl', () => {
  it('只允许 http、https、mailto', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toMatch(/^http:/);
    expect(safeUrl('mailto:someone@example.com')).toMatch(/^mailto:/);
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl('file:///etc/passwd')).toBeUndefined();
    expect(safeUrl('ftp://example.com')).toBeUndefined();
    expect(safeUrl('#Sheet1!A1')).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});

describe('parseRels / resolvePath', () => {
  it('相对路径按目录解析；外部链接保持原样', () => {
    expect(resolvePath('xl/drawings', '../media/image1.png')).toBe('xl/media/image1.png');
    expect(resolvePath('xl/worksheets', '/xl/drawings/drawing1.xml')).toBe('xl/drawings/drawing1.xml');
    const rels = parseRels(
      `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/a.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`,
      'xl/drawings'
    );
    expect(rels.get('rId1')).toMatchObject({ target: 'xl/media/a.png', external: false, type: 'image' });
    expect(rels.get('rId2')).toMatchObject({ target: 'javascript:alert(1)', external: true });
  });
});

describe('parseComments', () => {
  it('读取作者与正文，去掉拼音标注', () => {
    const comments = parseComments(
      `<comments><authors><author>Tester</author></authors><commentList><comment ref="A1" authorId="0"><text><r><rPr/><t>Synthetic note</t></r></text></comment></commentList></comments>`
    );
    expect(comments).toEqual([{ row: 0, col: 0, author: 'Tester', text: 'Synthetic note' }]);
    expect(parseComments(null)).toEqual([]);
  });
});

describe('parseSheetParts 超链接', () => {
  it('javascript 协议被丢掉；https 与工作簿内位置保留', () => {
    const rels = parseRels(
      `<Relationships>
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#'Pictures'!D20" TargetMode="External"/>
      </Relationships>`,
      'xl/worksheets'
    );
    const parts = parseSheetParts(
      '<worksheet><sheetPr/></worksheet>',
      `<hyperlinks>
        <hyperlink ref="A3" r:id="rId1"/>
        <hyperlink ref="A5" r:id="rId2"/>
        <hyperlink ref="A6" r:id="rId3"/>
        <hyperlink ref="A7" location="Sheet1!A1"/>
      </hyperlinks>`,
      rels,
      theme
    );
    expect(parts.links.map(l => ({ url: l.url, location: l.location, row: l.row }))).toEqual([
      { url: 'https://example.com/', location: undefined, row: 2 },
      { url: undefined, location: "'Pictures'!D20", row: 5 },
      { url: undefined, location: 'Sheet1!A1', row: 6 },
    ]);
  });
});

describe('parseDrawing 损坏的图表 XML', () => {
  it('截断的 chartSpace 不画出缺数据的图', async () => {
    const files: Record<string, string> = {
      'xl/drawings/drawing1.xml': `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
          <xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
          <xdr:graphicFrame>
            <xdr:nvGraphicFramePr><xdr:cNvPr id="1" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
            <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></xdr:xfrm>
            <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
              <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
            </a:graphicData></a:graphic>
          </xdr:graphicFrame>
          <xdr:clientData/>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`,
      'xl/drawings/_rels/drawing1.xml.rels': `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`,
      'xl/charts/chart1.xml': `<?xml version="1.0"?><c:chartSpace xmlns:c="c"><c:chart><c:plotArea><c:barChart>`,
    };
    const reader: PartReader = {
      text: async p => files[p] ?? null,
      has: p => p in files,
    };
    const { objects } = await parseDrawing('xl/drawings/drawing1.xml', reader, theme);
    expect(objects).toHaveLength(1);
    expect(objects[0].item.type).toBe('chart');
    if (objects[0].item.type === 'chart') expect(objects[0].item.chart).toBeNull();
  });
});
