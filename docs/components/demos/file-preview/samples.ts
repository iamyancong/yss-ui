/**
 * FilePreview 演示用的通用示例文件（位于 public/file-preview）。
 */
// define 注入的值可能带引号，与 .dumi/theme/utils.ts 的处理保持一致
const rawBase = (process.env.DOCS_BASE_PATH || '/').replace(/^["']|["']$/g, '').trim() || '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export const sampleUrl = (name: string) => `${base}file-preview/${name}`;

export const sampleFiles = {
  docx: { source: sampleUrl('sample.docx'), fileName: 'sample.docx' },
  xlsx: { source: sampleUrl('sample.xlsx'), fileName: 'sample.xlsx' },
  pdf: { source: sampleUrl('sample.pdf'), fileName: 'sample.pdf' },
  image: { source: sampleUrl('sample.png'), fileName: 'sample.png' },
  pptx: { source: sampleUrl('sample.pptx'), fileName: 'sample.pptx' },
  txt: {
    source: new TextEncoder().encode(
      'YFilePreview 示例文本\n\n' +
        '支持 docx、xlsx、xls、pdf、txt、csv、md 和常见图片；pptx 为实验性，需单独启用。\n' +
        '文本默认按 UTF-8 解码，识别失败时自动改用 GBK。\n' +
        '超过 2MB 的文本会分段显示，可点击「加载更多」。\n'
    ).buffer,
    fileName: 'readme.txt',
  },
  csv: {
    source: new TextEncoder().encode(
      'id,name,price,note\n1,Apple,3.5,"Red, sweet"\n2,Banana,2.1,\n3,Cherry,8.0,"Small ""stone"" fruit"\n4,Grape,6.4,Seedless\n'
    ).buffer,
    fileName: 'products.csv',
  },
};

/** 弹窗多文件演示额外用到的 JPG 图片 */
export const sampleJpg = { source: sampleUrl('sample.jpg'), fileName: 'sample.jpg' };

/** Excel 图表 / 图片 / 形状演示用的合成文件（无业务数据） */
export const excelObjectSamples = {
  charts: { source: sampleUrl('xlsx-charts.xlsx'), fileName: 'xlsx-charts.xlsx' },
  objects: { source: sampleUrl('xlsx-objects.xlsx'), fileName: 'xlsx-objects.xlsx' },
};
