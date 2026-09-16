---
title: 统一入口与 Vite 消费契约
description: 统一说明 YSS UI 根入口、官方 Vite 插件、稳定入口和 MCP 消费契约。
toc: content
---

# 统一入口与 Vite 消费契约

## 当前发布状态

截至 `2026-09-15`，`@yss-ui/components@1.7.0`、`@yss-ui/mcp@0.3.0` 和 `@yss-ui/skills@1.5.0` 已发布。下方“2026-09-15 验收结果”保留为发布前候选包的历史证据；其中“尚未发布”和“package.json 为 1.6.7”只描述当时的采集环境，不是当前安装状态。

## 业务接入

组件仍只需安装 `@yss-ui/components`，页面维持根入口具名导入：

```ts
import { YButton, YTable, YFormily } from '@yss-ui/components';
```

Vite 6 项目在构建配置加入自 1.7.0 起已发布的同包插件：

```ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { yssUi } from '@yss-ui/components/vite';

export default defineConfig({ plugins: [vue(), yssUi()] });
```

不需要独立 table/formily 功能包，不需要补装 VXE/Formily，也不在 main.ts 全量注册 YSS UI。业务直接使用第三方 API 时，仍声明对应直接依赖。`lite`、`table`、`formily`、`monaco`、`echarts`、`sheet` 和 locale 子路径继续保留，使用前核对目标包 exports。

旧项目可以先仅升级组件库；接入官方插件时移除旧的产物解析插件及整包 optimizeDeps.include，禁止两个方案同时运行；官方插件会对已知旧入口插件和旧预构建器显式报错。默认安装和动态整包导入保持全量语义。模板提供版本检测适配器：`1.6.6/1.6.7` 继续旧配置；发现公开 `./vite` 后使用官方插件，官方插件加载错误不会静默降级。

## 产物与公共状态

- 同一 Rollup 构建图生成根入口、子路径和稳定的 `entries/<公开符号>`。业务无需直接使用 entries。
- 插件使用 Babel AST 和 Vue SFC parser 处理具名导入、别名、具名再导出；保留类型、默认安装、命名空间与动态整包语义。
- `dist/consumption.json` 从真实导出生成符号、入口与 CSS 映射；`plugin.vite` 表示官方插件已完成验证的范围，`plugin.vitePeer` 和顶层 `peerDependencies.vite` 表示包管理器兼容范围。当前官方插件完整验收范围为 Vite 6，实际 peer 范围兼容 `^5.4.10 || ^6.0.0`；Vite 5 仅完成包管理器解析验证，未完成浏览器验收。未安装 Vite 时不会强制补装，范围外版本仍需单独核验。
- 每个产物 chunk 关联自己的 CSS。表格样式进入表格闭包；异步引擎样式保持动态边界。
- 插件仅将官方 `@yss-ui/components/style.css` 和 `@yss-ui/components/dist/style.css` 转换为 Ant Design Vue reset 基础样式，不转换业务 CSS。
- 保留旧 dist 文件和全量 CSS；同一图复用 locale、组件实现与引擎注册，根入口/子路径身份已在浏览器断言。
- 生产输出 `yss-consumption-modules.json`，记录业务源码归属的真实 chunk。预算脚本据此处理 Rollup 合并后的匿名页面块，缺少入口仍失败。

## Skills、MCP 和 Agent

`packages/components/consumption-policy.json` 是消费规则源；编译产物补充真实入口映射，MCP 索引读取规则和公开 exports。修改能力时同时更新政策、导出与测试。

`get_consumption_contract({ componentsVersion })` 仅对当前索引核验过的版本及明确记录的旧版本给出能力；未知版本要求读取目标包 exports 和 consumption.json。组件文档、Demo 与代码生成规则附带索引版本及业务消费说明，文档站样式不能直接当作业务配置。

Skills 只修改 packages/skills，运行同步脚本生成文档和模板副本。模板仅同步 app 分类。回归包含旧版、新模板、混合入口、Button-only、表格表单页及未知版本，检查变换后的代码和配置；这是确定性契约测试，不代表已完成多个模型的端到端能力评测。

## 2026-09-15 验收结果

原始汇总见 [JSON 证据](./consumption-evidence/2026-09-15.json)。这是发布前候选包验收快照：采集时源码 package.json 仍为 1.6.7，candidate 指本次源码 tarball，baseline 指 registry 的 1.6.7，不能用版本字符串混淆二者；当前 1.7.0 已发布。

### JS/CSS 静态闭包

外部临时目录通过 pnpm 8.10.0 真实安装；Node 22.17.1、Vue 3.5.20、Ant Design Vue 4.2.6、Vite 6.0.5。两个用例使用相同依赖约束、相同 fixture 和配套 YSS 包，候选接入官方插件，基线保留全量 CSS。单位为字节，各资源分别压缩后求和，不包括 HTML。

| 页面闭包 | 基线 raw / gzip / Brotli | 候选 raw / gzip / Brotli |
| --- | --- | --- |
| Button/Card 首屏 | 1,064,413 / 249,581 / 207,269 | 385,794 / 128,962 / 110,290 |
| Table/EditTable | 2,690,112 / 744,608 / 596,996 | 2,555,629 / 713,984 / 574,196 |
| Formily | 2,188,223 / 570,887 / 473,261 | 1,526,846 / 455,377 / 380,377 |
| 延迟 ECharts | 2,193,617 / 629,565 / 515,545 | 1,515,050 / 509,019 / 418,642 |

各页面闭包含共享模块，不能将各行累加为总包。模块归属检查确认 Button/Card 不含 Formily/VXE/Monaco/ECharts/Univer；表格闭包不含 Formily，表单闭包不含 VXE。不是简单按 chunk 名称推断。

候选生产 preview 的 Button 首屏记录 3 个 resource 请求、129,862 字节 transferSize；开发记录 18 个请求、5,777,373 字节 transferSize。包含资源响应头及 favicon 请求，不包含主 HTML navigation；开发源码未经生产压缩，不能与生产压缩值直接比较。dev/preview 的表格、表单和 ECharts canvas 均实际渲染，无 pageerror；HMR 修改模板后保留窗口标识，没有整页刷新。开发消费者还验证了首次打开才挂载的 Formily 弹窗及销毁后重开。

### 项目兼容

- 模板普通、JSP、JSP 主题及 standalone 构建通过，预算未放宽。普通默认 Demo 的闭包为 raw 2,958,801、gzip 902,621、Brotli 772,234 字节；默认页确实使用 Table/Formily，不能作为 Button-only。
- 模板开发浏览器确认官方模式、缺失导出为 0、locale 共享，85 个请求、11.796 MB decodedBodySize，pageerror 为 0。这是源码加载量，不是生产首次传输。截图确认混合表格/表单显示正常；通过 UI 从简体中文切换 English，确认重载后表单、列头和分页翻译更新且无 pageerror。
- 委外估值包含当前在途改动的隔离副本，分别完成仅升级与官方插件两种生产构建。全站产物总量约为 21.75/21.68 MiB raw（含所有动态页面），不用于推断首屏收益。
- 老项目开发模式，以及两种生产产物（仅升级/官方插件）下，工作台、估值任务和日志 Monaco 页面均成功加载并卸载重挂。实际 StandardDataSheetPanel 使用工作簿 fixture 单独验证，canvas 为 1438×611，卸载重挂通过；这项是业务面板级验证，不代表所有估值后端操作已验收。
- 老项目业务 ECharts 5.6.0 继续通过自己的 echarts/core、charts、components 等入口预构建。组件库 ECharts 6 随 YEcharts 的动态闭包加载；没有新增跨主版本 dedupe。

### 类型与质量限制

仓库 `vue-tsc` 和质量门禁通过。本轮收敛 `CompatibleFormilyFormItem` 的导出类型，并将 ECharts 类型导入改为 `echarts/core`。

外部消费者显式启用 `--skipLibCheck false` 的扩展检查，新旧产物均报告 379 项错误，涉及 Ant Design Vue、Formily 等依赖声明；严格声明验收尚未通过，不能将仓库类型检查通过等同于消费者声明完全兼容。证据中的基础检查另有新旧各 189 项结果，两种检查范围不同，不能混算。`skipLibCheck: true` 可以跳过依赖声明检查，但会降低检查覆盖，并非本库强制要求。严格检查项目应单独验证其 TypeScript、Vue 与依赖版本组合。

上述性能数据采集时源码尚未提交、推送或发布，因此最终版本仍需用 registry tarball 复核接入；当前 1.7.0 已完成发布。发版检测按已提交差异执行，工作区阶段的无待发包结果不代表无需发布。

## Issue #25：安装成本

本轮不改变 VXE/Formily 为硬依赖的兼容目标。两次全新安装均有 340 个不同的包名/版本组合；重复版本相同：xe-utils 3.9.1/4.0.13、nanoid 3.3.19/5.1.11、tslib 2.3.0/2.8.1。不能直接强制合并跨主版本依赖。

本机 node_modules 分配块从 764,948 KiB 到 766,328 KiB，增加 1,380 KiB；包含 Vite 等开发依赖，不是网络下载量。新增稳定入口、样式和独立 Node 解析工具，同时保留旧产物，安装占用略增符合预期。不存在“Button-only 未安装 VXE”的验收结论，#25 原有安装减重目标未完成；本轮完成的是加载边界优化和安装成本披露。

完整依赖边保存在真实安装的 installation-lock.yaml，直接依赖在 installation-tree.json，物理版本清单在 installation-report.json。pnpm 8 对这个依赖图执行 list --depth Infinity 会超过字符串长度上限，因此保留完整 lockfile 图，不把截断输出冒充完整树。

## Issue #24：官方 renderer 评估

对照版本为官方 `@vxe-ui/plugin-render-antd@4.4.1`。来源：[官方仓库](https://github.com/x-extends/vxe-ui-plugins)、[npm 包](https://www.npmjs.com/package/@vxe-ui/plugin-render-antd)。不引入生产依赖。

隔离浏览器试验：原生 VXE 编辑调用 AInput renderer 3 次；随后编辑 YEditTable，调用次数仍为 3，而 YEditTable 的 updateRow 次数为 1。其原因是 EditTableColumn 已提供 #edit 插槽，实际编辑由 EditCellEditor 和 editorProps/editorEvents 管理。仅注册官方插件不能减少现有维护代码。

| 对照项 | 当前评估与接入要求 |
| --- | --- |
| 布尔 Select | 原生 ASelect 与 YSS 的布尔值转换不是同一契约，需要逐项验证 true/false 与空值，不能按外观替换 |
| 多选 / tags | YSS 已有 tags、数组值和创建逻辑；官方 props 透传不等于行为适配完成 |
| 动态候选 | YSS 按行解析编辑器和选项，需保留行依赖更新及异步竞态处理 |
| 日期值 | 必须保留 valueFormat、空值与业务字符串日期约定，不能由 renderer 默认值推断 |
| 校验与错误提示 | VXE 校验触发、YSS 单元格错误气泡及清错时机需要共同适配 |
| updateRow | 已执行浏览器验证；这是 YSS 显式事件，官方 renderer 不能自动提供 |
| 字典展示 | YSS 非编辑态 isTransform、formatter、标签映射仍需保留 |
| 浮层 | popup 容器、滚动跟随、点击外部 autoClear 必须在微应用中回归 |
| 虚拟滚动 | 编辑行回收、焦点和 detached target 要单独验证，官方更新活跃不构成兼容证明 |
| 自定义插槽 | 已确认现有 #edit 优先；表头/单元格/筛选/展开插槽均需保留 |

上表除明确标记的调用与事件试验外是源码契约评估，尚未完成 renderer 适配后的全行为运行矩阵。直接注册增加依赖且没有删除自研代码，未满足“行为兼容、维护代码净减少、加载无退化”三条件，本轮结论为不正式接入。后续若推进，应先抽取独立编辑适配层进行 A/B 验收，而不是修改 YEditTable 公共 API。

## 交付复核

- 本轮重新通过完整 `pnpm quality`、8 项插件测试，tarball 验收补充历史 JS 路径存在性断言。
- 新增已知旧插件/预构建器与官方插件并存时报错的防护，避免插件顺序决定消费行为。
- 隔离 pnpm 8.10.0 lockfile 解析确认：未声明 Vite 时没有引入 Vite；Vite 5.4.21 在原 `^6.0.0` peer 范围下产生新增警告，调整为 `^5.4.10 || ^6.0.0` 后消除。此项只验证包管理器解析，不代表官方插件完成 Vite 5 浏览器验收。Formily 传递依赖的 Vue 2 peer 警告仍存在，不能声称整个依赖树在严格 peer 模式下通过。
- 对此前隔离 candidate 重跑严格声明检查，仍有 379 项错误；发布后的最终 tarball 仍须复验。
- Issue #23 按文档契约修复处理；#24 按评估后不采用处理；#25 保留安装依赖是兼容性决策，按不计划实施 optional/peer 化处理，不能声明原安装减重验收完成。

## 复现命令

```bash
pnpm test:consumption-plugin
pnpm test:consumption -- /tmp/yss-consumer-candidate
node scripts/check-consumption.mjs /tmp/yss-consumer-baseline --baseline
# 分别在 consumer 内启动 dev 和 preview 后：
python3 scripts/check-consumption-browser.py --consumer /tmp/yss-consumer-candidate/consumer --output /tmp/yss-browser
# 在隔离消费者预先安装 TypeScript 5.9.2 后执行（当前会因上述声明问题失败）：
pnpm test:consumption-types -- /tmp/yss-consumer-candidate/consumer
pnpm quality
pnpm sync:skills-docs
pnpm validate:skills
node scripts/release-changed.js patch --dry
node scripts/release-changed.js minor --dry
```

官方 renderer 隔离用例见 `scripts/fixtures/plugin-render-antd/README.md`。所有安装验收目录必须在工作区外；同目录重复安装会留下 pnpm 旧包或开发缓存，安装体积比较应使用全新目录。
