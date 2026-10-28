---
title: 文件预览 FilePreview
description: 在浏览器里直接预览 Word、Excel、PDF、TXT、CSV、Markdown 和常见图片，PPTX 可按需启用（实验性），支持页面内嵌、弹窗多文件切换与函数式调用，可注册自定义渲染器。
route: /components/file-preview
toc: content
---

# 文件预览 FilePreview

在浏览器里直接预览本地上传或服务端返回的文件，不需要后端转换。提供三种用法：

- `YFilePreview`：嵌在页面里预览单个文件；
- `YFilePreviewModal`：弹窗预览，可在多个文件之间切换；
- `useFilePreview`：不写模板，用函数打开预览弹窗。

```ts
import { YFilePreview, YFilePreviewModal, useFilePreview } from '@yss-ui/components/file-preview';
```

> 文件预览只从子路径 `@yss-ui/components/file-preview` 导出，不会进入组件库主入口和 Lite 入口，不使用的页面不会打包相关代码。

## 支持的格式

| 格式 | 渲染方式 | 依赖 |
| --- | --- | --- |
| `docx` | [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) 转成 HTML | `docx-preview` |
| `xlsx` / `xls` | [@vue-office/excel](https://github.com/501351981/vue-office) 渲染表格，可切换工作表；单元格文字按文件里保存的值和数字格式显示；图表、图片、形状、批注等叠在表格上方，见 [Excel 显示说明](#excel-显示说明) | `@vue-office/excel`、`vue-demi`、`numfmt`；图表按需加载 `echarts` |
| `pdf` | 浏览器自带的 PDF 查看器（iframe），查看器工具栏自带下载、打印、缩放 | 无 |
| `csv` | 表格显示：首行作为表头（滚动时吸顶），可横向滚动，行号列按需开启（`csvRowNumber`）；可随时切换为源文本 | 无 |
| `txt` / `md` | 纯文本显示 | 无 |
| 图片 | `<img>` 显示，默认适应容器（小图不放大），底部工具栏可缩放、1:1 / 适应切换、旋转、重置 | 无 |
| `pptx` | [@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer) 逐页绘制成 HTML，幻灯片纵向排列滚动查看 | 业务项目自行安装 `@aiden0z/pptx-renderer`，并调用 `registerPptxRenderer()`，见 [启用 PPTX 预览](#启用-pptx-预览) |

图片支持 `png`、`jpg`（`jpeg`）、`gif`、`webp`、`svg`、`bmp`、`ico`。PPTX 为实验性，默认不启用。

文本类文件（txt、csv、md）都会自动识别 UTF-8 / GBK 编码（以及带 BOM 或以西文为主的 UTF-16）。

**图片操作**：按钮缩放，或按住 `Ctrl` / `⌘` 滚动滚轮（触控板双指捏合）以指针位置为中心缩放，普通滚轮照常滚动；图片比区域大时可拖动平移，双击在适应窗口和原始尺寸之间切换。点击图片区域后可用键盘 `+` / `-` 缩放、`0` 重置、`r` / `R` 旋转，← → 仍用于弹窗翻页。SVG 也按图片加载（`<img src="blob:...">`），不会插入页面 DOM，其中的脚本和事件属性不会执行。

不支持：`doc`、`ppt` 等旧版办公格式（会提示由后端转换，见下文）、音视频、压缩包等。遇到这些格式会显示「暂不支持预览」，并提供下载按钮（可用 `unsupported` 插槽自定义）。Markdown 按原文显示，不渲染成 HTML。

## 安装

docx、Excel 的渲染依赖已写在 `@yss-ui/components` 的 `optionalDependencies` 里，和 ECharts、Monaco 一样，安装组件库时会自动安装，一般不需要额外操作：

| 依赖 | 版本 | 许可证 |
| --- | --- | --- |
| `docx-preview` | `^0.3.4` | Apache-2.0 |
| `@vue-office/excel` | `1.7.14`（锁定版本） | MIT |
| `vue-demi` | `^0.14.10` | MIT |
| `numfmt` | `3.2.6`（锁定版本） | MIT |

如果安装时用了 `--no-optional`（或 `--omit=optional`），需要预览 docx / Excel 时再手动安装：

```bash
pnpm add docx-preview@^0.3.4 @vue-office/excel@1.7.14 vue-demi@^0.14.10 numfmt@3.2.6
```

`numfmt` 用于按 Excel 规则显示数字格式（打开表格时按需加载，约 21KB gzip）；没有安装时表格照常显示，日期、百分比、小数位等常用格式改用简化实现，少数复杂格式可能与 Excel 不同。

Excel 图表按需加载已有的 `echarts`（组件库 `optionalDependencies`，一般会随安装带上，与 YEcharts 共用）。没有安装时表格照常显示，图表位置显示「安装 echarts 后可显示图表」。图表相关代码只在打开含图表的工作表时加载，不预览 Excel 图表的页面不会打进主包。使用 `--no-optional` 且需要显示图表时，再执行 `pnpm add echarts@^6.0.0`。

缺少依赖时不会报错白屏，组件会显示「缺少预览依赖」和对应的安装命令，并触发 `error` 事件（错误类型为 `MissingDependencyError`）。PDF、文本与图片预览不需要任何依赖。

`@aiden0z/pptx-renderer` **不会**随组件库安装（它是可选的 peer 依赖），见下一节。

## 启用 PPTX 预览

PPTX 是**实验性**能力，默认不启用：不使用 pptx 的项目不需要安装 `@aiden0z/pptx-renderer`，构建时也不会解析它。需要预览 `.pptx` 的项目按两步启用：

1. 在业务项目里安装依赖（锁定为已验证的版本）：

   ```bash
   pnpm add @aiden0z/pptx-renderer@1.4.0
   ```

2. 在应用入口（如 `main.ts`）调用一次 `registerPptxRenderer()`，之后创建的全部 `YFilePreview`、`YFilePreviewModal`、`useFilePreview` 都能预览 pptx：

   ```ts
   // main.ts
   import { registerPptxRenderer } from '@yss-ui/components/file-preview/pptx';

   registerPptxRenderer();
   ```

- 导入 `@yss-ui/components/file-preview/pptx` 本身没有副作用，必须调用 `registerPptxRenderer()` 才生效；
- `@aiden0z/pptx-renderer` 只在第一次预览 pptx 时按需加载，打包后是单独的异步分包（约 1.4MB，gzip 约 400KB，含它用到的 echarts 图表模块与 jszip），不预览 pptx 的页面不会加载；服务端渲染（SSR）时不会加载它；
- 没有启用时，`.pptx` 文件显示「暂不支持预览 pptx 格式」，提示「需安装 @aiden0z/pptx-renderer 并调用 registerPptxRenderer() 启用（实验性）」，并触发 `unsupported` 事件；
- 启用了但没有安装 `@aiden0z/pptx-renderer` 时，显示「缺少预览依赖」和安装命令，并触发 `error` 事件（`MissingDependencyError`）；
- 不要在业务代码里直接导入 `@aiden0z/pptx-renderer` 或使用它的 `PptxViewer`（加载与绘制由 `registerPptxRenderer()` 负责）；不需要 pptx 的项目不要安装它。

**为什么不随组件库打包**：大多数项目不需要预览 pptx。把它做成可选依赖，不用 pptx 的项目安装体积、构建时间和产物都不受影响；需要的项目自己安装并锁定版本，升级节奏由项目决定。

**显示方式**：幻灯片纵向排列，按 `presentation.xml` 里的幻灯片尺寸（16:9、4:3、自定义、竖版都按原比例）缩放到预览区域宽度，没有横向滚动条；窗口、弹窗、全屏切换时重新缩放，不重新解析。页与页之间留有间距和阴影，下方显示「第 n / 总数 页」，隐藏页标注「隐藏页」。先绘制前 3 页，其余页滚动到附近时再绘制，上百页的文稿也不会卡住页面。没有幻灯片时显示「演示文稿中没有幻灯片」；损坏、不是 PPTX 的文件显示「文件解析失败：文件已损坏或不是有效的 PPTX 文件」。

**效果限制**：渲染基于 @aiden0z/pptx-renderer，直接支持段落级与母版继承的文字样式、主题字体与主题色、表格样式（表头底色、镶边行）、组合、图片裁剪、渐变 / 阴影等形状效果、SmartArt（使用文件中保存的绘制结果）、柱 / 折线 / 饼等图表，以及文件内嵌的字体。仍不支持：动画与切换效果；少数复杂效果（3D、部分艺术字）与 PowerPoint 显示有差异；图表按文件中设置的字号显示（库把单独设置的图例、标题、坐标轴、数据标签字号少换算了 pt → px，组件已修正），分类轴标签放不下时依次折行、旋转 45°、隔几个显示，与 PowerPoint 的自动处理接近但换行与旋转位置可能略有不同，其余图表细节也可能略有差异；未内嵌的字体按浏览器所在系统安装的字体显示，缺少时回退到苹方 / 微软雅黑等系统中文字体，换行位置可能与 PowerPoint 略有不同。文件中链接到外部网址的图片、视频不会自动加载（避免预览时访问第三方地址），内嵌的不受影响。每个预览实例单独管理自己的图表与图片资源，同一页面同时打开多个 PPTX 预览互不影响，关闭时全部释放。对还原度有严格要求的场景，建议后端转换为 PDF 后预览，见 [旧格式与后端转换](#旧格式与后端转换)。

**图片**：浏览器（Chrome / Edge / Firefox）不能直接显示的图片格式，组件在交给 @aiden0z/pptx-renderer 之前统一预处理，页面上不会出现裂图图标：

| 文稿中的图片 | 显示效果 |
| --- | --- |
| 常见格式 | PNG、JPEG（含 CMYK）、GIF、BMP、WebP、SVG（含 PNG 备用图）原样显示 |
| TIFF | 组件内置解码，转成 PNG 显示（不需要额外依赖）。支持无压缩、LZW、Deflate、PackBits、JPEG 压缩；黑白 / 灰度 / 调色板 / RGB / CMYK |
| EMF（内嵌位图） | 显示其中的位图（常见于粘贴的截图） |
| EMF / WMF（矢量） | 默认显示「图片格式暂不支持（EMF）」占位；可选启用转换，见下方 `loadMetafile`。常见于从 Visio、Excel 粘贴的图 |
| 扩展名不符 | 按真实格式显示（如 `.png` 里是 JPEG） |
| 其他格式 | 「图片格式暂不支持（WDP）」——WDP、PICT、EPS 等 |
| 文件缺失 | 「图片缺失」 |
| 外部链接 | 「外部链接图片未加载」（不访问第三方地址） |
| 超过 1 亿像素 | 「图片过大，未显示」（可用 `maxImagePixels` 调整） |
| 解码失败 | 「图片无法显示」——空文件或浏览器无法解码 |

占位带图标和说明文字（随语言包切换），并作为图片的替代文字供读屏使用。

**大文件**：解压上限按文件大小放宽（单个条目至少 64MB、最多 256MB；解压后合计为文件大小的 8 倍，256MB ~ 1GB），50MB 以上、内嵌视频的文稿也能打开；超过上限时提示「文件内容超出预览上限，请下载后查看」。可通过 `zipLimits` 调整。

**许可证与体积**：@aiden0z/pptx-renderer 以 Apache-2.0 开源（[GitHub](https://github.com/aiden0z/pptx-renderer)），ESM，与框架无关（只操作 DOM）。它依赖 `echarts@6`、`jszip`、`mtx-decompressor`；其中 echarts 6 与 jszip 组件库的默认安装树里已有，额外安装约 6MB 磁盘（包本身约 5.6MB）。组件按 `~1.4.0` 声明可选 peer 依赖，已验证 1.4.0。

旧版 `.ppt` 不在此列，请按 [旧格式与后端转换](#旧格式与后端转换) 由后端转换为 PDF。

## Excel 显示说明

@vue-office/excel 自带的转换会把公式结果、日期和数字格式显示错（例如日期显示成「…GMT+0800 (中国标准时间)」、日期格式里的文字结果显示为「Invalid Date」、`0.45` 不按 `0%` 显示为 45%、`3` 不按 `0.0` 显示为 3.0、结果为 0 的单元格显示为空），列宽、字号、行高也整体偏小。组件在它交给表格之前，按文件里保存的值与格式重写单元格：

- **数字格式**：内置格式编号 0–49（随语言切换，如中文的 `yyyy/m/d`、`¥#,##0.00`）与 27–36 / 50–58 的中文日期格式，自定义格式的日期时间、`[h]:mm`、百分比、小数位、千分位、货币、负数红色、括号、`@` 文本、分数、科学计数、条件分段（`[>=100]`）、`yyyy"年"m"月"d"日"`、`上午/下午` 与 1904 日期系统；
- **单元格值**：公式显示文件里保存的计算结果，错误值（`#DIV/0!`、`#N/A` 等）、布尔值、富文本、超链接文字原样显示；
- **布局**：合并单元格（不再重影）、隐藏的行 / 列 / 工作表、冻结窗格、按 Excel 换算的列宽与行高（隐藏列上的换行不撑高行）、字号、对齐（未设置时数字右对齐）、主题颜色与 tint、下划线 / 删除线；打开时显示文件保存时的当前工作表；
- **xls**：读取旧版 Excel（BIFF8，Excel 97–2003）记录里的格式与公式结果，以及单元格样式（边框、填充、字体、对齐，含只有边框的空白单元格和合并区域的外框）。行、列整体设置的样式（没有单元格记录的位置）与富文本中的局部字体不显示。更早的 BIFF5 文件按 @vue-office/excel 原样显示。

**公式不会重新计算**。预览显示文件里保存的结果，以下情况会在表格上方给出提示：

| 情况 | 提示 |
| --- | --- |
| 没有保存结果 | 公式没有保存计算结果（openpyxl、部分导出工具只写公式）时显示「N 个公式单元格没有保存计算结果……」，这些单元格显示为空 |
| 打开时会重算 | 文件要求打开时重算（如 xlsxwriter 默认），或不是 Excel 保存的（没有计算引擎版本，如 LibreOffice）时显示「Excel / WPS 打开此文件时会重新计算公式，预览显示的是文件里保存的结果，个别单元格可能不同」 |

需要预览与 Excel 完全一致时，由生成文件的一方写入计算结果：xlsxwriter 的 `write_formula(..., value=结果)`，或生成后用 LibreOffice 重新计算并保存（`soffice --headless --convert-to xlsx`）。不同表格软件对个别公式的结果本身就可能不同（例如引用空单元格再与 `""` 比较），保存的结果取决于最后保存它的软件。**不引入公式计算引擎**，也不要为此换用别的表格预览库。

工作表里的图表、图片、形状、批注、超链接、条件格式和迷你图画在表格上方的叠加层，按单元格锚点定位，跟随滚动和冻结窗格。没有这些内容的表格不会加载叠加层。

| 能力 | 预览表现 |
| --- | --- |
| 图表 | 柱形 / 条形（簇状、堆积、百分比堆积）、折线、面积、饼图、圆环、散点、气泡、雷达、组合图、股票图、瀑布图、树状图、旭日图、直方图、箱线图、漏斗图用 echarts 绘制。3D 柱 / 线 / 饼 / 面积按 2D 显示。文件里写了图表边框则按文件显示，没有则不加框。线性 / 移动平均趋势线按虚线画出。没装 echarts 时显示「安装 echarts 后可显示图表」。曲面图、3D 曲面、地图图表显示「图表类型暂不支持预览」。损坏或截断的图表 XML 显示「图表无法显示」。同一工作表同时可见的图表大约最多 24 个，滚出视野的会释放 |
| 图片 | 内嵌 PNG / JPG 等直接显示；TIFF 转成 PNG；EMF 里带位图则抽出位图，没有位图的 EMF / WMF 显示占位；外链图片不加载，显示占位；缺失或过大的图片显示占位，不出现裂图。关闭预览时释放 Blob URL |
| 形状 | 常见预设几何、连接线、文本框；其他形状按矩形画。不支持渐变和阴影 |
| 批注 | 旧版批注显示单元格右上角红三角，悬停看正文。threadedComments 的回复不显示 |
| 超链接 | `http` / `https` / `mailto` 点击后在新窗口打开（`noopener`）；工作簿内位置（如 `Sheet1!A1`）可跳转。`javascript:` 等不安全协议会忽略 |
| 条件格式 | 突出显示单元格（cellIs）、文本包含 / 开头 / 结尾、空值 / 错误值、前 N 项、高于 / 低于平均值、重复 / 唯一值、色阶、数据条、图标集、发生日期（today / thisMonth 等）。不支持公式规则（expression），这类规则按没有条件格式显示 |
| 迷你图 | 折线、柱形 |
| OLE 嵌入对象 | 有 PNG / JPG 或带位图的 EMF 预览图则显示，否则显示「嵌入对象（progId）」占位 |
| 工作表 | 标签颜色、冻结窗格、隐藏行列（按文件收起，与 Excel 打开时一致；单元格内容仍保留。把鼠标移到隐藏行下方的行号上，单击可临时展开，不写回文件。锚点下的隐藏行 / 列按 0 宽度计算）、三种锚点（单元格、单单元格、绝对位置）。对象超出已用区域时会扩大表格行列数 |

仍不支持：富文本中的分段样式（按整格样式显示）、数字放不下时显示 `####`、`[DBNum1]` 等中文大写数字格式（按普通数字显示）、按工作表隐藏网格线、误差线、透视表 / 切片器 / 筛选下拉、条件格式公式规则、曲面图与地图图表。

## 缩放

xlsx / xls 和图片可以缩放。弹窗标题栏在业务操作区（`#actions`）和全屏按钮之间显示 `[ − ] [ 100% ▾ ] [ + ]`，下拉里有 50% / 75% / 100% / 125% / 150% / 200%、适应宽度和重置（100%）。窄屏（≤ 576px）只显示比例按钮，放大 / 缩小收进下拉。

| 操作 | 说明 |
| --- | --- |
| Ctrl / ⌘ + `=`、`-`、`0` | 放大、缩小（按 `zoomStep`）、恢复 100%。弹窗里任意位置可用（焦点在输入框时除外）；内嵌的 `YFilePreview` 需要焦点在预览区内 |
| Ctrl / ⌘ + 鼠标滚轮 | 每格按 `zoomStep` 缩放，以鼠标位置为中心，不会缩放整个页面 |
| 触控板双指捏合（含 Safari） | 跟手连续缩放，以指针位置为中心；表格在捏合过程中每帧按新比例真正重绘（行号列标、文字始终清晰），指针下的内容精确到像素不动 |
| 放大 / 缩小按钮、快捷键 | 表格约 150ms 平滑过渡，保持左上角；系统开启“减少动态效果”时直接跳到新比例 |
| 触摸屏双指捏合 | 连续缩放 |

- **Excel**：按比例重新绘制表格（行高、列宽、字号一起变），不是把画布拉伸，所以高清屏下文字和边框保持清晰；图表、图片、形状等叠加内容按同一比例定位和缩放，冻结窗格和滚动同步不变；缩放后左上角仍停在原来的单元格。大表格（约 2 万行以上）连续缩放时会稍等片刻再重绘。
- **图片**：标题栏控件与图片工具栏共用同一个比例，图片工具栏只保留适应窗口、旋转和重置。图片打开时先适应窗口，范围默认 5%–800%（设置了 `zoomMin` / `zoomMax` 时按设置）。
- **PDF** 用浏览器内置查看器显示，查看器自带缩放，不显示这个控件。docx、pptx、文本、CSV 暂不支持缩放。
- 比例按文件分别记住：切换到别的文件时用那个文件自己的比例（第一次打开为 `zoom` 或 `zoomFit` 指定的比例），切回来时恢复。
- 内嵌的 `YFilePreview` 不自带标题栏控件，用 `toolbar` 插槽参数或实例方法自己放按钮；此时图片继续显示自带的缩放按钮。

```vue
<YFilePreviewModal v-model:open="open" v-model:zoom="zoom" :files="files" :zoomable="['xlsx', 'xls']" />
```

## 代码演示

### 基础用法

切换不同格式查看效果（image 为图片；pptx 为实验性支持，本示例已调用 `registerPptxRenderer()` 启用），也可以把同一个文件放到弹窗里打开。

<code src="./demos/file-preview/basic.vue"></code>

### Excel 图表、图片与形状

用合成的 xlsx（无业务数据）查看叠加层：图表（柱形、折线、饼图、散点、雷达、组合图、多级分类、负值、日期轴；瀑布 / 树状 / 旭日 / 直方图 / 箱线 / 漏斗 / 股票图在文件里有这类图时同样绘制）、图片与三种锚点、形状、批注、超链接、条件格式和迷你图。没有安装 echarts 时图表位置显示占位。

<code src="./demos/file-preview/excel-objects.vue"></code>

### 弹窗多文件预览

`v-model:open` 控制显示，`v-model:index` 控制当前文件。多个文件时标题是文件切换下拉：点击文件名列出全部文件（类型图标、大小、当前文件打勾，不支持预览的格式会标出），10 个及以上可搜索，↑ ↓ / Home / End 选择、Enter 打开、Esc 只收起下拉。标题栏的 ‹ N / M › 按钮或键盘 ← → 切换，悬停翻页按钮会提示目标文件名；默认到第一个 / 最后一个文件时对应按钮禁用，设置 `loop` 后首尾相接。Esc 关闭，右上角可全屏（网页内铺满窗口，不调用浏览器全屏 API；全屏时 Esc 先退出全屏）。翻页按钮放在标题栏，不会遮挡文件内容；全屏切换、窗口缩放后内容会按新尺寸重新布局。 标题栏右侧的全屏、下载、关闭与左侧翻页按钮是同一套图标按钮（同尺寸、同颜色 Token、悬停背景、焦点环），悬停显示提示；标题栏里的提示与下拉挂在弹窗之上的浮层挂载层，全屏、页面滚动或窗口缩放时位置都正确。

<code src="./demos/file-preview/modal.vue"></code>

### 函数式调用

`useFilePreview` 不需要写模板，适合在表格操作列、按钮回调里使用。弹窗虽然挂在 `body` 下，但会继承调用位置的上下文：外层 `a-config-provider` 的主题（Token、明暗算法）、`prefixCls`、`componentSize`、`direction` 与语言包，`YConfigProvider` 的组件库语言包，以及 `app.provide` 和祖先组件 `provide` 的值（`slots` 里的组件同样能 `inject` 到）。

弹窗与预览的样式不依赖 antd 的类名前缀：`a-config-provider` 设置了 `prefix-cls`（如 `custom`）时，标题栏、满高内容区、全屏和翻页按钮的布局与默认前缀一致。

<code src="./demos/file-preview/imperative.vue"></code>

### 上传前预览

一个完整的上传列表示例（只用 Ant Design Vue 组件与主题 Token，跟随文档站明暗主题）：类型图标与图片缩略图、保留后缀的中间省略文件名（悬停显示全名）、大小与类型标签、悬停显示预览 / 下载 / 移除；旧版或不支持的格式禁用预览并给出提示。点击文件名用 `useFilePreview().openList()` 在可预览的文件中打开弹窗（弹窗继承外层 `ConfigProvider` 的暗色主题），标题下拉可在它们之间切换，标题栏的「移除」通过 `controller.update()` 同步列表。单个文件预览上限放宽为 50MB（`maxSize`），文件只在浏览器里读取，不会上传。没有本地文件时可点「添加示例文件」。

<code src="./demos/file-preview/upload.vue"></code>

## API

### YFilePreview Props

| 属性 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| source | 文件来源：URL、`File`、`Blob`、`ArrayBuffer`、`Uint8Array`，或懒加载函数 `FileSourceLoader` | `FileSource` | - |
| fileName | 文件名，用于识别类型和下载。`File` 会自动取 `name`，URL 会取路径最后一段 | `string` | - |
| fileType | 显式指定类型，优先级高于后缀和 MIME，仍会校验文件内容。可以是自定义渲染器注册的类型 | `FilePreviewFileType` | - |
| maxSize | 最大预览字节数 | `number` | `20 * 1024 * 1024` |
| textEncoding | 文本编码：`'auto'`、`'utf-8'`、`'gbk'` | `TextEncoding` | `'auto'` |
| csvMode | CSV 初始显示方式：`'table'` 表格、`'text'` 源文本。预览时也可以点右上角按钮切换 | `CsvMode` | `'table'` |
| csvRowNumber | CSV 表格是否显示行号列 | `boolean` | `false` |
| height | 预览区高度，数字按 px 处理 | `number \| string` | `'100%'` |
| showDownload | 是否允许下载：控制「文件过大」「暂不支持」「加载失败」等提示里的下载按钮；为 `false` 时 PDF 还会尽量隐藏内置查看器工具栏 | `boolean` | `true` |
| customDownload | 自定义下载（权限、留痕、签名 URL）。不调用 `ctx.defaultDownload()` 就不下载；设置后 PDF 隐藏内置查看器工具栏 | `(ctx: FilePreviewDownloadContext) => void \| Promise<void>` | - |
| zoom (v-model) | 缩放比例，`1` 为 100%。只对可以缩放的文件生效，每个文件单独记住比例，见 [缩放](#缩放) | `number` | - |
| zoomable | 是否允许缩放；传文件类型列表（如 `['xlsx', 'xls']`）只对这些类型开启 | `boolean \| FilePreviewFileType[]` | `true` |
| zoomMin / zoomMax | 缩放范围 | `number` | `0.5` / `2`（图片 `0.05` / `8`） |
| zoomStep | 放大 / 缩小按钮与快捷键的步长 | `number` | `0.1` |
| zoomFit | 第一次打开某个文件时的比例：`'width'` 适应宽度、`'page'` 适应整页、`'none'` 使用 `zoom`（没有设置时 Excel 为 100%，图片适应窗口） | `'width' \| 'page' \| 'none'` | `'none'` |

`source`、`fileName`、`fileType`、`maxSize`、`textEncoding`、`csvMode`、`csvRowNumber`、`showDownload` 任意一项变化，或 `customDownload` 从无到有（反之亦然）都会重新加载。缩放相关属性变化不会重新加载。

### YFilePreview Events

| 事件 | 说明 | 回调参数 |
| --- | --- | --- |
| loaded | 渲染完成 | `(payload: { fileName: string; fileType: FilePreviewFileType }) => void` |
| error | 加载、校验或渲染失败（含缺少依赖、文件过大、内容不一致） | `(error: Error) => void` |
| unsupported | 格式不支持 | `(type: string) => void` |
| update:zoom | 缩放比例变化 | `(zoom: number) => void` |
| zoom-change | 缩放比例变化（按钮、快捷键、滚轮、切换文件时恢复该文件的比例）；捏合过程中只更新显示的百分比，停下后触发一次 | `(zoom: number, info: { fileType: FilePreviewFileType \| null }) => void` |

### YFilePreview Slots

| 插槽 | 说明 | 参数 |
| --- | --- | --- |
| toolbar | 替换顶部工具栏 | `{ fileName, fileType, status, download, reload, zoom, setZoom, zoomIn, zoomOut, resetZoom, fitZoom }`，`zoom` 为 `FilePreviewZoomState` |
| loading | 自定义加载中 | - |
| unsupported | 自定义不支持格式的提示 | `{ type, download }` |
| error | 自定义错误提示 | `{ error, retry, download }` |

### YFilePreview 实例方法

通过 `ref` 调用：

| 方法 | 说明 | 类型 |
| --- | --- | --- |
| reload | 重新加载 | `() => Promise<void>` |
| download | 下载当前文件 | `() => Promise<void>` |
| getFileName | 当前文件名 | `() => string` |
| getFileType | 识别出的类型，未识别时为 `null` | `() => FilePreviewFileType \| null` |
| getStatus | 当前状态 | `() => FilePreviewStatus` |
| zoomState | 缩放状态（响应式）：`available` 当前文件能否缩放、`value` 当前比例、`min` / `max`、`canFit` 能否适应宽度 | `FilePreviewZoomState` |
| setZoom | 设置比例，超出范围时收敛 | `(zoom: number) => void` |
| zoomIn / zoomOut | 按 `zoomStep` 放大 / 缩小 | `() => void` |
| resetZoom | 恢复 100% | `() => void` |
| fitZoom | 适应宽度（默认）或整页 | `(mode?: 'width' \| 'page') => void` |

`FilePreviewStatus` 取值：`'idle' | 'loading' | 'ready' | 'oversize' | 'empty' | 'mismatch' | 'missing-dependency' | 'unsupported' | 'error'`。

### YFilePreviewModal Props

| 属性 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| open (v-model) | 是否显示 | `boolean` | `false` |
| files | 要预览的文件，可以是 `FileSource` 或 `FilePreviewItem` | `Array<FileSource \| FilePreviewItem>` | `[]` |
| index (v-model) | 当前文件下标，超出范围会自动修正 | `number` | `0` |
| width | 弹窗宽度 | `number \| string` | `'85vw'` |
| title | 标题，默认显示当前文件名；设置后固定显示该文本，不再显示文件切换下拉 | `string` | - |
| fileSwitcher | 多个文件时标题显示为文件切换下拉（类型图标 + 文件名 + 箭头，点击列出全部文件，10 个及以上可搜索）。只有一个文件或设置了 `title` 时显示普通标题；在下拉里选择文件与翻页一样触发 `update:index` / `change` | `boolean` | `true` |
| loop | 是否循环翻页。默认到第一个 / 最后一个文件时对应翻页按钮禁用、方向键无反应；为 `true` 且多于一个文件时首尾相接，按钮始终可用 | `boolean` | `false` |
| showDownload | 是否显示标题栏下载按钮。PDF 用浏览器内置查看器显示时不显示（查看器自带下载）；为 `false` 时还会尽量隐藏内置查看器工具栏 | `boolean` | `true` |
| keyboard | 是否启用键盘操作（← → 切换、Esc 关闭；全屏时 Esc 先退出全屏；缩放快捷键不受此项控制，用 `zoomable` 关闭）。多个弹窗叠加时只有最上层响应；焦点在输入框或 Excel 表格内时方向键留给它们自己 | `boolean` | `true` |
| maxSize | 最大预览字节数 | `number` | `20 * 1024 * 1024` |
| textEncoding | 文本编码 | `TextEncoding` | `'auto'` |
| csvMode | CSV 初始显示方式 | `CsvMode` | `'table'` |
| csvRowNumber | CSV 表格是否显示行号列 | `boolean` | `false` |
| getContainer | 弹窗挂载节点 | `() => HTMLElement` | - |
| customDownload | 自定义下载，同 `YFilePreview`；设置后 PDF 也显示标题栏下载按钮 | `(ctx: FilePreviewDownloadContext) => void \| Promise<void>` | - |
| zoom (v-model) / zoomable / zoomMin / zoomMax / zoomStep / zoomFit | 缩放，同 `YFilePreview`。可以缩放时标题栏显示缩放控件 | - | - |

`files` 可以随时修改（例如删除当前文件）：下标越界会自动收敛并触发 `update:index`，当前文件变了会触发 `change`，列表清空时自动关闭（触发 `update:open(false)` 和 `close`）。打开弹窗时不会触发 `change`。

### YFilePreviewModal Events

| 事件 | 说明 | 回调参数 |
| --- | --- | --- |
| update:open | 显示状态变化 | `(open: boolean) => void` |
| update:index | 当前下标变化 | `(index: number) => void` |
| change | 当前文件变化（翻页、列表变化、外部修改 `index`），`file` 是 `files` 里的原对象 | `(index: number, file: FilePreviewItem, ctx: FilePreviewContext) => void` |
| close | 弹窗关闭 | `() => void` |
| loaded | 当前文件渲染完成 | `(payload: FilePreviewLoadedPayload, ctx: FilePreviewContext) => void` |
| error | 当前文件加载或解析失败 | `(error: Error, ctx: FilePreviewContext) => void` |
| unsupported | 当前文件格式不支持 | `(type: string, ctx: FilePreviewContext) => void` |
| update:zoom | 缩放比例变化 | `(zoom: number) => void` |
| zoom-change | 缩放比例变化 | `(zoom: number, info: { fileType }, ctx: FilePreviewContext) => void` |

### YFilePreviewModal Slots

| 插槽 | 说明 | 参数 |
| --- | --- | --- |
| actions | 标题栏右侧的业务操作区（缩放控件、全屏、下载按钮之前） | `FilePreviewContext` |

### YFilePreviewModal 实例方法

| 方法 | 说明 | 类型 |
| --- | --- | --- |
| prev / next | 上一个 / 下一个文件 | `() => void` |
| goTo | 切换到指定下标 | `(index: number) => void` |
| download | 下载当前文件 | `() => Promise<void>` |
| reload | 重新加载当前文件（懒加载来源会重新请求） | `() => Promise<void>` |

### useFilePreview

```ts
const { open, openList, close, visible, fileList, currentIndex } = useFilePreview();

// 标题栏放「删除」：删除后把新列表交给弹窗，停在原下标显示下一个，删光自动关闭
const controller = openList(files.value, index, {
  slots: {
    actions: ({ file }) =>
      h(Button, { size: 'small', danger: true, onClick: () => {
        files.value = files.value.filter(item => item !== file);
        controller.update(files.value);
      } }, () => '删除'),
  },
});
const lastIndex = await controller.afterClose; // 关闭后刷新列表等
```

| 返回值 | 说明 | 类型 |
| --- | --- | --- |
| open | 预览单个文件 | `(file: FileSource \| FilePreviewItem, options?: UseFilePreviewOptions) => FilePreviewController` |
| openList | 预览多个文件，从 `startIndex` 开始（超出范围自动修正）；空列表不会打开，返回的句柄 `afterClose` 立即 resolve | `(files: Array<FileSource \| FilePreviewItem>, startIndex?: number, options?) => FilePreviewController` |
| close | 关闭弹窗 | `() => void` |
| visible | 是否显示（只读） | `Readonly<Ref<boolean>>` |
| fileList | 当前文件列表（只读，修改请用 `controller.update`） | `Readonly<Ref<readonly FilePreviewItem[]>>` |
| currentIndex | 当前下标（只读） | `Readonly<Ref<number>>` |

`UseFilePreviewOptions`：

| 选项 | 说明 | 类型 |
| --- | --- | --- |
| fileName / fileType | 仅 `open` 生效 | `string` / `FilePreviewFileType` |
| width 等 | 同 `YFilePreviewModal`：width、title、fileSwitcher、loop、maxSize、textEncoding、csvMode、csvRowNumber、showDownload、keyboard、customDownload、zoom、zoomable、zoomMin、zoomMax、zoomStep、zoomFit | - |
| onChange | 当前文件变化（翻页、`update` 后） | `(ctx: FilePreviewContext) => void` |
| onLoaded | 当前文件渲染完成 | `(payload: FilePreviewLoadedPayload, ctx: FilePreviewContext) => void` |
| onError | 当前文件加载或解析失败 | `(error: Error, ctx: FilePreviewContext) => void` |
| onClose | 本次打开结束，参数为最后的下标 | `(lastIndex: number) => void` |
| onZoomChange | 缩放比例变化 | `(zoom: number, info: { fileType }, ctx: FilePreviewContext) => void` |
| slots | 插槽 render 函数，目前支持 `actions` | `{ actions?: (ctx: FilePreviewContext) => VNodeChild }` |

`FilePreviewController`（只对本次打开有效，弹窗关闭或再次 `open` 之后调用不会有任何效果）：

| 成员 | 说明 | 类型 |
| --- | --- | --- |
| close | 关闭弹窗 | `() => void` |
| goTo / next / prev | 切换文件，会触发 `onChange`；`next` / `prev` 在首尾时不做任何事，打开时传了 `loop: true` 则循环 | `(index: number) => void` / `() => void` |
| update | 替换文件列表。不传 `index` 时停在原下标，越界自动收敛；列表为空时自动关闭 | `(files: Array<FileSource \| FilePreviewItem>, index?: number) => void` |
| index | 当前下标（关闭后为最后的下标） | `readonly number` |
| afterClose | 本次打开结束（关闭或被下一次 `open` 替换）时 resolve，值为最后的下标 | `Promise<number>` |

请在组件 `setup`（或 `<script setup>`）中调用 `useFilePreview()`：弹窗和 `slots` 渲染的内容继承调用位置的上下文——`appContext`（全局组件、指令、`app.provide` 注入的 router / pinia / i18n 等）与调用方组件的 `provide` 链（外层 `ConfigProvider` 的主题与语言、`YConfigProvider`、业务组件 `provide` 的值；`setup` 里在 `useFilePreview()` 之后才 `provide` 的值也能拿到）。调用方组件卸载时弹窗随之关闭并销毁。在 `setup` 之外调用时仍可打开弹窗，但不会继承这些上下文、也不会随组件自动销毁，开发环境会给出提示。

> 没有包在任何 `a-config-provider` 里时，ant-design-vue 会使用页面上最近一次渲染的 `ConfigProvider` 主题（ant-design-vue 自身的全局回退），需要固定主题时请在应用根部包一层 `a-config-provider`。

### 类型说明

**FilePreviewItem**

| 字段 | 说明 | 类型 |
| --- | --- | --- |
| source | 文件来源 | `FileSource` |
| fileName | 文件名；懒加载来源建议提供，否则加载完成前标题显示「未命名」 | `string` |
| fileType | 显式类型 | `FilePreviewFileType` |
| fileSize | 文件大小（字节），显示在文件切换下拉里。`File` / `Blob` / `ArrayBuffer` 会自动取，URL 与懒加载来源需要时可传入 | `number` |
| [key: string] | 业务字段（如 `id`），组件不会读取，会原样出现在 `ctx.file` 里 | `unknown` |

**FilePreviewContext**

插槽、事件、回调共用的当前文件上下文。单独使用 `YFilePreview` 时（`customDownload` 收到的参数）`index` 为 `0`、`total` 为 `1`，`prev / next / goTo / close` 不做任何事。

| 字段 | 说明 | 类型 |
| --- | --- | --- |
| file | 当前文件（`files` 里的原对象，可读取业务字段） | `FilePreviewItem` |
| index / total | 当前下标 / 文件总数 | `number` |
| status | 当前预览状态 | `FilePreviewStatus` |
| prev / next / goTo / close | 翻页、关闭 | `() => void` / `(index: number) => void` |
| download | 下载当前文件（会走 `customDownload`） | `() => Promise<void>` |
| reload | 重新加载当前文件 | `() => Promise<void>` |

`FilePreviewDownloadContext` 在此基础上多两个字段：

| 字段 | 说明 | 类型 |
| --- | --- | --- |
| data | 已读取的文件内容，预览成功后才有 | `ArrayBuffer` |
| defaultDownload | 默认下载；可传新来源（签名 URL、Blob）或文件名 | `(source?: FileSource, fileName?: string) => Promise<void>` |

> 在 `customDownload` 里请调用 `defaultDownload()`，不要调用 `ctx.download()`，否则会再次进入 `customDownload`。

```ts
// 权限校验 + 下载记录 + 签名 URL；不调用 defaultDownload() 就不会下载
const customDownload: FilePreviewCustomDownload = async ({ file, defaultDownload }) => {
  if (!canDownload.value) return message.warning('没有下载权限');
  await logDownload(file.id);
  await defaultDownload(await getSignedUrl(file.id));
};
```

**FileSourceLoader**

```ts
type FileSourceLoader = (ctx: { signal: AbortSignal; file: FilePreviewItem }) =>
  Promise<File | Blob | ArrayBuffer | string>;
```

- 文件显示时才调用；返回字符串时按 URL 加载（例如先换取签名 URL）；
- 切换文件、关闭弹窗、组件卸载时 `signal` 中止，迟到的结果会被丢弃；
- 弹窗里同一次打开内缓存成功结果，`reload()` 会重新调用；
- 返回内容后仍会检查 `maxSize`（返回 `Blob` / `File` 时不读取内容就能判断）；
- 抛出的错误进入加载失败状态，显示错误信息和「重试」。

```ts
// 同一个 loader 可以给多个文件复用，通过 ctx.file 读取业务字段，signal 交给请求实例
const loadById: FileSourceLoader = ({ file, signal }) =>
  request.get(`/api/files/${file.id}`, { responseType: 'blob', signal }).then(res => res.data);

openList(rows.map(row => ({ id: row.id, fileName: row.name, source: loadById })), index);
```

### 自定义渲染器

内置格式不够用时，可以注册渲染器。`create()` 每次渲染都会调用，返回独立的实例，避免多个预览互相影响：

```ts
import { registerPreviewRenderer } from '@yss-ui/components/file-preview';

registerPreviewRenderer({
  types: ['ofd'],
  create() {
    let root: HTMLElement | null = null;
    return {
      async render(container, data, ctx) {
        root = document.createElement('div');
        container.appendChild(root);
        if (ctx.signal.aborted) return;
        root.textContent = `${ctx.fileName}：${data.byteLength} 字节`;
      },
      destroy() {
        root?.remove();
        root = null;
      },
    };
  },
});
```

- `render(container, data, ctx)`：`container` 是本次渲染专用的空节点；`ctx` 包含 `fileName`、`fileType`、`textEncoding`、`csvMode`、`csvRowNumber`、`showDownload`、`signal`（取消信号）、`t`（国际化函数）、`appContext`、`locale`（当前语言，如 `zh-CN`，可用于按语言格式化日期数字）；
- 渲染内容自己要用方向键（例如表格选区）时，给根节点加 `data-preview-keyboard="self"`，弹窗在用户点进该区域后不再用方向键切换文件；
- `resize()`（可选）：预览区域尺寸变化后调用（全屏切换、窗口缩放、父容器变化，已防抖，渲染完成后才会调用）。内容随容器自适应的渲染器不需要实现，按初始化尺寸绘制 canvas 的渲染器在这里重新布局；
- `zoom`（可选）：缩放能力，渲染完成后读取。实现了才显示缩放控件、响应快捷键；`ctx.zoom` 是这个文件要使用的初始比例（可直接按它渲染），`ctx.externalZoomControl` 为 `true` 时标题栏已有缩放控件，渲染器不要再显示自己的放大 / 缩小按钮：

  ```ts
  import type { PreviewZoomController } from '@yss-ui/components/file-preview';

  let scale = ctx.zoom ?? 1;
  const zoom: PreviewZoomController = {
    get: () => scale,
    set: z => { scale = z; root.style.fontSize = `${14 * z}px`; }, // 已收敛到范围内，可防抖
    fit: mode => undefined, // 可选：计算并应用适应比例，返回应用后的比例
    range: { min: 0.5, max: 4 }, // 可选：没设置 zoomMin / zoomMax 时使用
    onChange: listener => () => {}, // 可选：渲染器自己改变比例时通知外壳
  };
  ```

- `destroy()`：切换文件、卸载组件时调用，需要清理自己创建的 DOM、URL 和事件；
- 注册内置类型（如 `pdf`）会覆盖内置渲染器；`unregisterPreviewRenderer(type)` 可以取消注册。

### PPTX 子路径（实验性）

从 `@yss-ui/components/file-preview/pptx` 导入，需要业务项目先 `pnpm add @aiden0z/pptx-renderer@1.4.0`，步骤见 [启用 PPTX 预览](#启用-pptx-预览)。主入口 `@yss-ui/components/file-preview` 不引用 @aiden0z/pptx-renderer。

```ts
import { registerPptxRenderer } from '@yss-ui/components/file-preview/pptx';

registerPptxRenderer(); // 在 main.ts 调用一次
```

| 导出 | 说明 | 类型 |
| --- | --- | --- |
| `registerPptxRenderer` | 启用 pptx 预览，返回取消注册的函数；重复调用以最后一次为准 | `(options?: PptxRendererOptions) => () => void` |
| `pptxRenderer` | 默认 pptx 渲染器，也可以自己传给 `registerPreviewRenderer` | `PreviewRenderer` |
| `createPptxRenderer` | 按配置创建 pptx 渲染器 | `(options?: PptxRendererOptions) => PreviewRenderer` |

`PptxRendererOptions.load`（可选）：自定义加载 @aiden0z/pptx-renderer 的函数，默认 `() => import('@aiden0z/pptx-renderer')`。依赖解析有特殊要求时（例如微前端由宿主提供），可以传 `load: () => import('@aiden0z/pptx-renderer')`，让业务项目自己的构建解析该依赖；返回的模块需要提供 `parseZip`、`buildPresentation`、`renderSlide`（类型 `PptxRendererLibrary`）。

`PptxRendererOptions` 的其他可选项：

| 参数 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `loadMetafile` | 显示矢量 EMF / WMF：按需加载 [rtf.js](https://github.com/tbluemel/rtf.js)（MIT）的 EMFJS / WMFJS 把它们转成 SVG。只在文稿里真的有 EMF / WMF 时才调用，format 为 `'emf'` 或 `'wmf'` | `(format: 'emf' \| 'wmf') => Promise<unknown>` | 不转换，显示占位 |
| `zipLimits` | 解压安全上限，与默认值合并（`maxEntries`、`maxEntryUncompressedBytes`、`maxTotalUncompressedBytes`、`maxMediaBytes`） | `PptxZipLimits` | 按文件大小放宽 |
| `maxImagePixels` | 单张图片的最大像素数（宽 × 高），超过时显示「图片过大，未显示」 | `number` | `100000000` |

启用 EMF / WMF 转换（实验性）：

```bash
pnpm add rtf.js@3.0.9
```

```ts
import { registerPptxRenderer } from '@yss-ui/components/file-preview/pptx';

registerPptxRenderer({
  // 只导入两个图元文件渲染器（各约 56KB，gzip 约 14KB），不导入 rtf.js 的 RTF 部分（约 2MB）
  loadMetafile: format =>
    format === 'emf' ? import('rtf.js/dist/EMFJS.bundle.min.js') : import('rtf.js/dist/WMFJS.bundle.min.js'),
});
```

TypeScript 项目需要为这两个文件补一行声明（rtf.js 只为包入口提供了类型）：

```ts
// env.d.ts
declare module 'rtf.js/dist/*';
```

rtf.js 的转换对简单的矢量图（矩形、椭圆、多边形、文字）与 WMF 效果较好；带复杂坐标变换的 EMF（例如部分软件导出的带 EMF+ 记录的图）可能显示不完整。对还原度有要求时建议后端转换为 PDF 后预览。

## 文件识别规则

1. 先看显式传入的 `fileType`，再看文件名后缀，都没有时看 MIME 类型；
2. 再检查文件内容是否与类型一致：docx / xlsx / pptx 必须是对应的 Office 压缩包（按包内 `word/`、`xl/`、`ppt/` 目录区分），pdf 必须以 `%PDF` 开头，xls 必须是旧版 Excel 二进制或 xlsx 压缩包，图片按文件头识别（PNG、JPEG、GIF、WebP、BMP、ICO；SVG 按文本内容的 `<svg` 根元素），文本不能是二进制文件；
3. 内容和类型对不上时（例如把 exe 改名成 docx），显示「文件类型与内容不一致」，不会继续解析。图片之间互相改后缀（如 PNG 存成 `.jpg`）不算不一致，按实际内容显示；
4. 没有后缀也没有 MIME 时，会根据内容识别 pdf / docx / xlsx / pptx / 图片。pptx 能被识别，但只有调用 `registerPptxRenderer()` 后才会渲染。

## 边界情况

| 情况 | 表现 |
| --- | --- |
| 文件超过 `maxSize` | 默认 20MB。不读取内容，显示「文件过大，无法预览」和「仍要下载」。URL 来源会先看 `Content-Length`，超限直接取消下载 |
| 空文件（0 字节） | 显示「文件内容为空」 |
| 文本超过 2MB | 先显示前 512KB，底部「加载更多」继续加载；按流式解码，中文不会在分段处乱码 |
| CSV 解析 | 按 RFC 4180：支持引号包裹的逗号、换行和 `""` 转义，兼容 CRLF，自动去掉 BOM；自动识别逗号、分号、Tab 分隔；空行跳过，列数不一致的行用空单元格补齐 |
| CSV 行数很多 | 每次渲染 1000 行，底部「加载更多」继续；只解析需要显示的部分 |
| CSV 行号 | 默认不显示（数据通常自带 id 列）；`csvRowNumber` 开启后行号列横向滚动时固定在左侧，列宽贴合内容，不会盖住第一列 |
| 默认下载 | 预览成功后直接保存已读取的内容，不重复请求；同源 URL 用 `<a download>`；跨域 URL 先 `fetch` 成 Blob 再保存（需要服务端允许 CORS，能预览就说明已允许），失败时在新标签页打开链接；文件过大的跨域 URL 直接打开链接，不读进内存 |
| PDF 与下载按钮 | 浏览器内置查看器的工具栏已有下载，`YFilePreviewModal` 标题栏不再重复显示下载按钮（注册了自定义 pdf 渲染器、或配置了 `customDownload` 时照常显示）。`showDownload=false` 或配置了 `customDownload`（内置查看器的下载无法拦截）时 iframe 地址追加 `#toolbar=0&navpanes=0`，见本节末尾「PDF 工具栏说明」 |
| 文本编码 | 默认 `auto`：有 BOM 按 BOM；没有 BOM 但一半字节是 0 的按 UTF-16（以西文为主的 UTF-16 文本）；否则检查前 64KB 是否为合法 UTF-8，不是则按 GBK。Big5、Shift_JIS 等其他编码和以中文为主的无 BOM UTF-16 识别不了 |
| 网络错误 / HTTP 非 2xx | 显示错误信息和「重试」按钮 |
| 快速切换文件 | 上一个文件的加载和渲染会被取消，不会覆盖新文件 |
| 组件卸载 / 弹窗关闭 | 取消进行中的加载，释放 Blob URL，清理渲染出的 DOM |
| Excel 公式结果 | 公式没有保存计算结果、或 Excel 打开时会重算时，表格上方显示提示，单元格按文件里保存的结果显示，见 [Excel 显示说明](#excel-显示说明) |
| Excel 图表 / 图片 / 形状 | 叠在表格上方按锚点定位；没装 echarts、曲面图 / 地图图表、损坏的图表 XML、缺失或外链图片、没有位图的 EMF 显示占位，见 [Excel 显示说明](#excel-显示说明) |
| Excel 批注 / 超链接 / 条件格式 | 旧版批注红三角可悬停；只打开 http / https / mailto；公式类条件格式（expression）不生效 |
| docx 特殊图片 | TIFF / EMF / WMF 浏览器无法显示，按原尺寸显示带格式名的占位（悬停与读屏为「图片格式暂不支持预览（EMF）」），不出现裂图 |
| docx 符号字体 | Symbol / Wingdings 字体的项目符号换成对应的 Unicode 符号（•、▪、➢、✓ 等），没有这些字体的系统（macOS、手机）不再显示方框 |
| 图片损坏 | 浏览器无法解码时显示「文件解析失败」与原因，可重试或下载 |
| 超大图片 | 如 8000×8000，适应窗口时按比例缩小显示；放大上限为原始尺寸的 8 倍，且显示尺寸不超过 32768px |
| pptx 未启用 | 显示「暂不支持预览 pptx 格式」，提示安装 @aiden0z/pptx-renderer 并调用 `registerPptxRenderer()`，见 [启用 PPTX 预览](#启用-pptx-预览) |
| pptx 幻灯片异常 | 没有幻灯片时显示「演示文稿中没有幻灯片」；损坏、缺少 `ppt/presentation.xml` 时显示「文件解析失败」，可重试或下载 |
| pptx 页数很多 | 先绘制前 3 页，其余页滚动到附近时才绘制；单页绘制失败只在该页显示「此页无法显示」 |
| pptx 图片问题 | TIFF 转 PNG 显示；EMF、WMF、缺失、外链等显示带说明文字的占位（如「图片格式暂不支持（EMF）」），不出现裂图，见 [启用 PPTX 预览](#启用-pptx-预览) 的「图片」 |
| pptx 文件过大 | 超出解压上限时显示「文件内容超出预览上限，请下载后查看」 |
| 旧版办公格式 | `doc`、`ppt`、`rtf`、`wps` 等显示「暂不支持预览」，并提示由后端转换为 PDF，见 [旧格式与后端转换](#旧格式与后端转换) |

**PDF 工具栏说明**：`showDownload=false` 时，PDF 的 iframe 地址会追加 PDF Open Parameters `#toolbar=0&navpanes=0`，各浏览器表现不同：

| 浏览器 | 表现 |
| --- | --- |
| Chrome / Edge（Chromium 内置查看器） | 隐藏顶部工具栏和侧边缩略图，看不到下载、打印按钮（已在 Chrome 实测） |
| Firefox（内置 pdf.js） | 不支持这些参数，工具栏照常显示（未实测） |
| Safari | 没有常驻工具栏，悬停时出现的缩放等按钮不受参数影响（未实测） |

这只是界面上不显示下载入口，**不是下载防护**：文件数据已经到了浏览器，用户仍然可以用右键菜单、`Ctrl/Cmd + S`、打印或开发者工具拿到文件。真正需要防下载时，请在服务端控制（例如只返回加水印的预览版或转成图片）。

## 旧格式与后端转换

`doc`、`ppt`、`rtf`、`wps` 等旧版或国产办公格式是二进制格式，浏览器端没有可靠的解析方案（`xls` 已由 Excel 渲染器支持）。这类文件建议由后端转换为 PDF 后再预览，常见做法：

- 自建转换服务：LibreOffice（`soffice --headless --convert-to pdf`）、OnlyOffice Document Server 的转换接口；
- 开源预览服务：如 kkFileView，直接提供转换后的 PDF 或预览地址；
- 云存储或文档服务自带的格式转换。

前端用懒加载来源 `FileSourceLoader` 请求转换结果，并把 `fileType` 设为 `'pdf'`：文件名保留原始的 `.doc`，标题照常显示，识别时以 `fileType` 为准。

```ts
const toPdfPreview = (row: { id: string; name: string }): FilePreviewItem => ({
  fileName: row.name, // 例如 合同.doc，标题显示原文件名
  fileType: 'pdf', // 转换后的内容是 PDF
  source: ({ signal }) =>
    fetch(`/api/files/${row.id}/preview?format=pdf`, { signal, credentials: 'include' }).then(res => {
      if (!res.ok) throw new Error(`转换失败（HTTP ${res.status}）`);
      return res.blob();
    }),
});

openList(rows.map(toPdfPreview), index);
```

转换耗时较长时，加载状态会一直显示到接口返回；接口报错会进入「文件解析失败」并可重试。下载原文件可以配合 `customDownload`，在回调里调用 `defaultDownload('/api/files/' + file.id)` 下载原始格式。

## 国际化

文案跟随 `YConfigProvider` 的 `locale` 或 `setGlobalLocale` 设置的语言，内置 `zh-CN`、`zh-TW`、`en-US`，命名空间为 `filePreview`（类型 `YssFilePreviewLocale`）。自定义文案时展开内置语言包再覆盖 `filePreview` 字段，详见 [ConfigProvider](/components/config-provider)。
