"""合成 xlsx 边界用例（无任何业务数据）。python3 make_xlsx.py → ../xlsx-*.xlsx"""
import io, os, re, zipfile, struct, zlib
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, DoughnutChart, AreaChart, ScatterChart, RadarChart, Reference, Series
from openpyxl.chart.label import DataLabelList
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import TwoCellAnchor, OneCellAnchor, AbsoluteAnchor, AnchorMarker
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule, FormulaRule
from openpyxl.styles import PatternFill, Font
from PIL import Image as PILImage, ImageDraw

OUT = os.path.dirname(os.path.abspath(__file__))  # 生成到本目录
E2P = 9525

def png(w, h, color, text=''):
    im = PILImage.new('RGB', (w, h), color)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=(0, 0, 0))
    d.line([0, 0, w, h], fill=(255, 255, 255), width=3)
    if text: d.text((8, 8), text, fill=(0, 0, 0))
    b = io.BytesIO(); im.save(b, 'PNG'); b.seek(0); return b

def table(ws, r0=1):
    ws.cell(r0, 1, 'Region'); ws.cell(r0, 2, 'Item'); ws.cell(r0, 3, 'Alpha'); ws.cell(r0, 4, 'Beta'); ws.cell(r0, 5, 'Gamma')
    rows = [('North', 'A', 12, 8, -3), (None, 'B', 7, 11, 4), (None, 'C', -5, 6, 9), ('South', 'D', 15, -2, 6), (None, 'E', 9, 13, -7), (None, 'F', 4, 5, 2)]
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            if v is not None: ws.cell(r0 + 1 + i, 1 + j, v)
    return r0 + 1, r0 + len(rows)

def charts_book():
    wb = Workbook(); ws = wb.active; ws.title = 'Charts'
    a, b = table(ws)
    for c in range(3, 6):
        for r in range(a, b + 1): ws.cell(r, c).number_format = '0.0'
    data = Reference(ws, min_col=3, max_col=5, min_row=1, max_row=b)
    cats = Reference(ws, min_col=2, min_row=a, max_row=b)
    multi = Reference(ws, min_col=1, max_col=2, min_row=a, max_row=b)
    def place(ch, cell, w=14, h=7.5):
        ch.width, ch.height = w, h; ws.add_chart(ch, cell)
    def bar(title, grouping='clustered', d='col', overlap=None, catref=cats):
        ch = BarChart(); ch.type = d; ch.grouping = grouping; ch.title = title
        if overlap is not None: ch.overlap = overlap
        ch.add_data(data, titles_from_data=True); ch.set_categories(catref); return ch
    place(bar('Clustered column'), 'H2')
    place(bar('Stacked column', 'stacked', overlap=100), 'Q2')
    place(bar('Percent stacked', 'percentStacked', overlap=100), 'H18')
    hb = bar('Horizontal bar', d='bar'); place(hb, 'Q18')
    ml = bar('Multi-level categories', catref=multi); place(ml, 'H34')
    ln = LineChart(); ln.title = 'Line'; ln.add_data(data, titles_from_data=True); ln.set_categories(cats); place(ln, 'Q34')
    ar = AreaChart(); ar.title = 'Area'; ar.grouping = 'stacked'; ar.add_data(Reference(ws, min_col=3, max_col=4, min_row=1, max_row=b), titles_from_data=True); ar.set_categories(cats); place(ar, 'H50')
    pie = PieChart(); pie.title = 'Pie'; pie.add_data(Reference(ws, min_col=4, min_row=1, max_row=b), titles_from_data=True); pie.set_categories(cats)
    pie.dataLabels = DataLabelList(); pie.dataLabels.showPercent = True; place(pie, 'Q50', 10)
    dn = DoughnutChart(); dn.title = 'Doughnut'; dn.add_data(Reference(ws, min_col=4, min_row=1, max_row=b), titles_from_data=True); dn.set_categories(cats); place(dn, 'X50', 10)
    sc = ScatterChart(); sc.title = 'Scatter'; sc.style = 13
    for col in (4, 5):
        s = Series(Reference(ws, min_col=col, min_row=a, max_row=b), Reference(ws, min_col=3, min_row=a, max_row=b), title=ws.cell(1, col).value); s.marker.symbol = 'circle'; s.graphicalProperties.line.noFill = True; sc.series.append(s)
    place(sc, 'H66')
    combo = bar('Combo bar + line'); l2 = LineChart(); l2.add_data(Reference(ws, min_col=5, min_row=1, max_row=b), titles_from_data=True); l2.y_axis.axId = 200; l2.y_axis.crosses = 'max'; combo.y_axis.title = 'Left'; combo += l2
    combo.series = combo.series[:2]; place(combo, 'Q66')
    rd = RadarChart(); rd.title = 'Radar'; rd.add_data(data, titles_from_data=True); rd.set_categories(cats); place(rd, 'X66', 10)
    lbl = bar('Data labels'); lbl.dataLabels = DataLabelList(); lbl.dataLabels.showVal = True; place(lbl, 'X2', 10)
    # 日期轴
    ws2 = wb.create_sheet('Dates')
    import datetime
    for i in range(12):
        ws2.cell(i + 2, 1, datetime.date(2024, 1 + i, 1)).number_format = 'yyyy-mm'; ws2.cell(i + 2, 2, (i * 7) % 11 + 3)
    ws2['A1'] = 'Month'; ws2['B1'] = 'Value'
    dl = LineChart(); dl.title = 'Date axis'; dl.add_data(Reference(ws2, min_col=2, min_row=1, max_row=13), titles_from_data=True); dl.set_categories(Reference(ws2, min_col=1, min_row=2, max_row=13)); dl.x_axis.number_format = 'yyyy-mm'
    dl.width, dl.height = 16, 7.5; ws2.add_chart(dl, 'D2')
    # 空系列
    ws2['H20'] = 'Empty'; e = BarChart(); e.title = 'Empty series'; e.add_data(Reference(ws2, min_col=8, min_row=20, max_row=26), titles_from_data=True); ws2.add_chart(e, 'D20')
    wb.save(f'{OUT}/xlsx-charts.xlsx')

def objects_book():
    wb = Workbook(); ws = wb.active; ws.title = 'Pictures'
    ws.freeze_panes = 'B3'
    ws.sheet_properties.tabColor = 'FF4472C4'
    for r in range(1, 41):
        for c in range(1, 9): ws.cell(r, c, f'R{r}C{c}')
    ws.row_dimensions[10].hidden = True
    ws.column_dimensions['C'].width = 22
    img = XLImage(png(160, 90, (91, 155, 213), 'one-cell')); img.anchor = 'D5'; ws.add_image(img)
    img2 = XLImage(png(200, 120, (237, 125, 49), 'two-cell (over hidden row)'))
    img2.anchor = TwoCellAnchor(_from=AnchorMarker(col=1, row=8, colOff=E2P * 10, rowOff=E2P * 5), to=AnchorMarker(col=4, row=14, colOff=0, rowOff=0)); ws.add_image(img2)
    img3 = XLImage(png(120, 60, (112, 173, 71), 'absolute'))
    img3.anchor = AbsoluteAnchor(pos=XDRPoint2D(E2P * 700, E2P * 60), ext=XDRPositiveSize2D(E2P * 120, E2P * 60)); ws.add_image(img3)
    far = XLImage(png(150, 80, (165, 165, 165), 'beyond used range')); far.anchor = 'P60'; ws.add_image(far)
    frozen = XLImage(png(60, 30, (255, 192, 0), 'frozen')); frozen.anchor = 'A1'; ws.add_image(frozen)
    # 批注、链接、条件格式
    ws2 = wb.create_sheet('Notes & links')
    ws2.sheet_properties.tabColor = 'FFC00000'
    ws2['A1'] = 'Has comment'; ws2['A1'].comment = Comment('Synthetic note\nsecond line', 'Tester')
    ws2['A3'] = 'https link'; ws2['A3'].hyperlink = 'https://example.com/'; ws2['A3'].font = Font(color='0563C1', underline='single')
    ws2['A4'] = 'mailto link'; ws2['A4'].hyperlink = 'mailto:someone@example.com'
    ws2['A5'] = 'javascript link (blocked)'; ws2['A5'].hyperlink = 'javascript:alert(1)'
    ws2['A6'] = 'internal link'; ws2['A6'].hyperlink = "#'Pictures'!D20"
    for i in range(10):
        ws2.cell(i + 2, 3, i * 10); ws2.cell(i + 2, 4, (i * 37) % 100); ws2.cell(i + 2, 5, i - 5)
    ws2.conditional_formatting.add('C2:C11', DataBarRule(start_type='min', end_type='max', color='FF638EC6'))
    ws2.conditional_formatting.add('D2:D11', ColorScaleRule(start_type='min', start_color='FFF8696B', mid_type='percentile', mid_value=50, mid_color='FFFFEB84', end_type='max', end_color='FF63BE7B'))
    ws2.conditional_formatting.add('E2:E11', CellIsRule(operator='lessThan', formula=['0'], fill=PatternFill('solid', bgColor='FFFFC7CE'), font=Font(color='FF9C0006')))
    ws2.conditional_formatting.add('E2:E11', FormulaRule(formula=['MOD(E2,2)=0'], fill=PatternFill('solid', bgColor='FFDDDDDD')))
    # 公式与错误值（缓存值由下面的 XML 替换写入）
    ws3 = wb.create_sheet('Formulas')
    ws3['A1'] = 1; ws3['A2'] = 2; ws3['A3'] = '=A1+A2'; ws3['A4'] = '=1/0'; ws3['A5'] = '=NA()'; ws3['A6'] = '=SUM(A1:A2)*10'
    path = f'{OUT}/xlsx-objects.xlsx'; wb.save(path)
    patch_objects(path)

SPARK = '''<extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup displayEmptyCellsAs="gap" markers="1"><x14:colorSeries rgb="FF376092"/><x14:colorMarkers rgb="FFD00000"/><x14:sparklines><x14:sparkline><xm:f>'Notes &amp; links'!C2:D11</xm:f><xm:sqref>G2</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup><x14:sparklineGroup type="column"><x14:colorSeries rgb="FF70AD47"/><x14:colorNegative rgb="FFC00000"/><x14:sparklines><x14:sparkline><xm:f>'Notes &amp; links'!E2:E11</xm:f><xm:sqref>G3</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext></extLst>'''

SHAPES = '''<xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>7</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="90" name="Rounded"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Text box shape</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor><xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>13</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="91" name="Star"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="star5"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor><xdr:twoCellAnchor><xdr:from><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="92" name="Line"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr><xdr:spPr><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="28575"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></xdr:spPr></xdr:cxnSp><xdr:clientData/></xdr:twoCellAnchor>'''

def patch_objects(path):
    zin = zipfile.ZipFile(path); items = {n: zin.read(n) for n in zin.namelist()}; zin.close()
    # 迷你图
    for n in items:
        if n.startswith('xl/worksheets/sheet2'):
            s = items[n].decode(); s = s.replace('</worksheet>', SPARK + '</worksheet>'); items[n] = s.encode()
        if n.startswith('xl/worksheets/sheet3'):
            s = items[n].decode()
            s = re.sub(r'<c r="A4"([^>]*)><f>1/0</f><v>[^<]*</v></c>|<c r="A4"([^>]*)><f>1/0</f><v\s*/></c>|<c r="A4"([^>]*)><f>1/0</f></c>', '<c r="A4" t="e"><f>1/0</f><v>#DIV/0!</v></c>', s)
            s = re.sub(r'<c r="A5"[^>]*><f>NA\(\)</f>(<v[^>]*>[^<]*</v>|<v\s*/>)?</c>', '<c r="A5" t="e"><f>NA()</f><v>#N/A</v></c>', s)
            s = re.sub(r'<c r="A3"[^>]*><f>A1\+A2</f>(<v[^>]*>[^<]*</v>|<v\s*/>)?</c>', '<c r="A3"><f>A1+A2</f><v>3</v></c>', s)
            s = re.sub(r'<c r="A6"[^>]*><f>SUM\(A1:A2\)\*10</f>(<v[^>]*>[^<]*</v>|<v\s*/>)?</c>', '<c r="A6"><f>SUM(A1:A2)*10</f><v>30</v></c>', s)
            items[n] = s.encode()
    # 形状
    d = items['xl/drawings/drawing1.xml'].decode()
    # openpyxl 写的是不带前缀的 <wsDr xmlns=...>（exceljs 读不了，正好用来测这种情况）
    d = d.replace('<wsDr xmlns=', '<wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns=', 1)
    d = d.replace('</wsDr>', SHAPES + '</wsDr>'); items['xl/drawings/drawing1.xml'] = d.encode()
    write(path, items)

def write(path, items):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, b in items.items(): z.writestr(n, b)

def broken_book():
    """坏的图表 XML、缺失的图片、缺失的 rels、chartex、未知图表类型、很多图表"""
    wb = Workbook(); ws = wb.active; ws.title = 'Broken'
    a, b = table(ws)
    data = Reference(ws, min_col=3, max_col=5, min_row=1, max_row=b); cats = Reference(ws, min_col=2, min_row=a, max_row=b)
    for i, cell in enumerate(['H2', 'Q2', 'H18']):
        ch = BarChart(); ch.title = f'Chart {i + 1}'; ch.add_data(data, titles_from_data=True); ch.set_categories(cats); ws.add_chart(ch, cell)
    img = XLImage(png(100, 60, (200, 0, 0), 'missing')); img.anchor = 'B20'; ws.add_image(img)
    ws2 = wb.create_sheet('Many charts')
    a2, b2 = table(ws2)
    d2 = Reference(ws2, min_col=3, max_col=4, min_row=1, max_row=b2)
    for i in range(60):
        ch = LineChart(); ch.title = f'#{i + 1}'; ch.add_data(d2, titles_from_data=True); ch.width, ch.height = 6, 4
        ws2.add_chart(ch, f'{"HKNQTWZ"[i % 6] if i % 6 < 6 else "H"}{2 + (i // 6) * 9}')
    path = f'{OUT}/xlsx-broken.xlsx'; wb.save(path)
    zin = zipfile.ZipFile(path); items = {n: zin.read(n) for n in zin.namelist()}; zin.close()
    charts = sorted(n for n in items if re.match(r'xl/charts/chart\d+\.xml$', n))
    first = [n for n in charts if n.endswith('chart1.xml')][0]
    items[first] = items[first][: len(items[first]) // 2]  # 截断的 XML
    c2 = [n for n in charts if n.endswith('chart2.xml')][0]
    items[c2] = re.sub(rb'<barChart>.*</barChart>', b'<surfaceChart><wireframe val="0"/></surfaceChart>', items[c2], flags=re.S)  # 不支持的类型
    for n in list(items):
        if n.startswith('xl/media/'): del items[n]  # 图片缺失
    # 第三个图表改成 chartex（cx:chart）
    c3 = [n for n in charts if n.endswith('chart3.xml')][0]
    items[c3] = b'<?xml version="1.0" encoding="UTF-8"?><cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><cx:chart><cx:title><cx:tx><cx:txData><cx:v>Waterfall (chartex)</cx:v></cx:txData></cx:tx></cx:title><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="waterfall"/></cx:plotAreaRegion></cx:plotArea></cx:chart></cx:chartSpace>'
    write(path, items)

def ole_book():
    wb = Workbook(); ws = wb.active; ws.title = 'OLE'
    ws['A1'] = 'Embedded object below (preview EMF without bitmap → placeholder)'
    path = f'{OUT}/xlsx-ole.xlsx'; wb.save(path)
    zin = zipfile.ZipFile(path); items = {n: zin.read(n) for n in zin.namelist()}; zin.close()
    emf = struct.pack('<II', 1, 108) + b'\0' * 100  # 只有头的 EMF
    items['xl/media/image1.emf'] = emf
    items['xl/embeddings/oleObject1.bin'] = b'\0' * 64
    rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/oleObject1.bin"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.emf"/></Relationships>'
    items['xl/worksheets/_rels/sheet1.xml.rels'] = rels.encode()
    s = items['xl/worksheets/sheet1.xml'].decode()
    if 'xmlns:r=' not in s: s = s.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
    s = s.replace('</worksheet>', '<oleObjects><oleObject progId="Package" shapeId="1025" r:id="rId1"><objectPr defaultSize="0" r:id="rId2"><anchor moveWithCells="1"><from><xdr:col xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">1</xdr:col><xdr:colOff xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">0</xdr:colOff><xdr:row xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">2</xdr:row><xdr:rowOff xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">0</xdr:rowOff></from><to><xdr:col xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">3</xdr:col><xdr:colOff xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">0</xdr:colOff><xdr:row xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">6</xdr:row><xdr:rowOff xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">0</xdr:rowOff></to></anchor></objectPr></oleObject></oleObjects></worksheet>')
    items['xl/worksheets/sheet1.xml'] = s.encode()
    ct = items['[Content_Types].xml'].decode()
    ct = ct.replace('</Types>', '<Default Extension="emf" ContentType="image/x-emf"/><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/></Types>')
    items['[Content_Types].xml'] = ct.encode()
    write(path, items)

if __name__ == '__main__':
    charts_book(); objects_book(); broken_book(); ole_book()
    print('ok')
