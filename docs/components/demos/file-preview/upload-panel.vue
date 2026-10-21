<template>
  <div class="demo-upload" :style="cssVars">
    <a-upload-dragger
      class="demo-upload__dragger"
      multiple
      :show-upload-list="false"
      :before-upload="beforeUpload"
      :accept="ACCEPT"
    >
      <div class="demo-upload__drop">
        <span class="demo-upload__drop-icon"><CloudUploadOutlined aria-hidden="true" /></span>
        <p class="demo-upload__drop-title">点击或拖拽文件到此区域</p>
        <p class="demo-upload__drop-hint">
          支持 PDF、Word、Excel、PPT、图片、TXT / CSV / Markdown · 单个文件预览上限 {{ MAX_MB }}MB · 最多
          {{ MAX_COUNT }} 个
        </p>
      </div>
    </a-upload-dragger>

    <div class="demo-upload__bar">
      <span class="demo-upload__summary">
        <template v-if="items.length"
          >已选择 {{ items.length }} / {{ MAX_COUNT }} 个文件 · 共 {{ formatSize(totalSize) }}</template
        >
        <template v-else>文件只在浏览器本地读取，不会上传</template>
      </span>
      <a-space :size="4">
        <a-button size="small" type="link" :loading="loadingSamples" @click="addSamples">添加示例文件</a-button>
        <a-button v-if="items.length" size="small" type="link" danger @click="clearAll">全部清空</a-button>
      </a-space>
    </div>

    <ul v-if="items.length" class="demo-upload__list" aria-label="待上传文件">
      <li
        v-for="(item, index) in items"
        :key="item.uid"
        class="demo-upload__item"
        :class="{ 'is-disabled': !item.previewable }"
      >
        <span class="demo-upload__thumb" :data-kind="item.kind">
          <img v-if="item.thumb" :src="item.thumb" alt="" />
          <component :is="kindIcon(item.kind)" v-else aria-hidden="true" :style="{ color: kindColor(item.kind) }" />
        </span>

        <div class="demo-upload__main">
          <a-tooltip :title="item.name" placement="topLeft" :mouse-enter-delay="0.4">
            <button
              type="button"
              class="demo-upload__name"
              :disabled="!item.previewable"
              :aria-label="item.previewable ? `预览 ${item.name}` : item.name"
              @click="preview(index)"
            >
              <span class="demo-upload__stem">{{ item.stem }}</span>
              <span class="demo-upload__ext">{{ item.ext }}</span>
            </button>
          </a-tooltip>
          <div class="demo-upload__meta">
            <span>{{ formatSize(item.file.size) }}</span>
            <a-tag :bordered="false" class="demo-upload__tag" :color="item.previewable ? undefined : 'warning'">
              {{ item.label }}
            </a-tag>
            <span v-if="!item.previewable" class="demo-upload__hint">{{ item.hint }}</span>
          </div>
        </div>

        <div class="demo-upload__actions">
          <a-tooltip :title="item.previewable ? '预览' : item.hint">
            <a-button
              type="text"
              size="small"
              :disabled="!item.previewable"
              :aria-label="`预览 ${item.name}`"
              @click="preview(index)"
            >
              <template #icon><EyeOutlined /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip title="下载">
            <a-button type="text" size="small" :aria-label="`下载 ${item.name}`" @click="download(item)">
              <template #icon><DownloadOutlined /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip title="移除">
            <a-button type="text" size="small" danger :aria-label="`移除 ${item.name}`" @click="remove(index)">
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </a-tooltip>
        </div>
      </li>
    </ul>

    <a-empty
      v-else
      class="demo-upload__empty"
      :image="simpleImage"
      description="还没有文件，拖入文件或添加示例文件试试"
    />

    <div class="demo-upload__footer">
      <a-button :disabled="!items.length" @click="clearAll">取消</a-button>
      <a-button type="primary" :disabled="!items.length" @click="submit">确认上传</a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FileZipOutlined,
} from '@ant-design/icons-vue';
import {
  SUPPORTED_FILE_TYPES,
  useFilePreview,
  type FilePreviewController,
  type FilePreviewItem,
} from '@yss-ui/components/file-preview';
import { registerPptxRenderer } from '@yss-ui/components/file-preview/pptx';
import {
  Button as AButton,
  Empty,
  Empty as AEmpty,
  message,
  Space as ASpace,
  Tag as ATag,
  theme,
  Tooltip as ATooltip,
  UploadDragger as AUploadDragger,
  type UploadProps,
} from 'ant-design-vue';
import { computed, h, onBeforeUnmount, ref, type Component } from 'vue';
import { sampleFiles, sampleUrl } from './samples';

// .pptx 预览为实验性能力，业务项目在 main.ts 调用一次即可
registerPptxRenderer();

/** 单个文件预览上限：超过的文件不加入列表；弹窗 maxSize 同步放宽（组件默认 20MB） */
const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_COUNT = 20;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.csv,.md';

type Kind = 'pdf' | 'word' | 'excel' | 'ppt' | 'image' | 'csv' | 'markdown' | 'text' | 'archive' | 'unknown';

interface UploadItem {
  uid: string;
  file: File;
  name: string;
  stem: string;
  ext: string;
  kind: Kind;
  label: string;
  previewable: boolean;
  hint: string;
  thumb: string;
}

const KINDS: Record<string, { kind: Kind; label: string }> = {
  pdf: { kind: 'pdf', label: 'PDF' },
  docx: { kind: 'word', label: 'Word' },
  doc: { kind: 'word', label: 'Word 97-2003' },
  xlsx: { kind: 'excel', label: 'Excel' },
  xls: { kind: 'excel', label: 'Excel 97-2003' },
  pptx: { kind: 'ppt', label: 'PPT' },
  ppt: { kind: 'ppt', label: 'PPT 97-2003' },
  png: { kind: 'image', label: 'PNG' },
  jpg: { kind: 'image', label: 'JPG' },
  jpeg: { kind: 'image', label: 'JPG' },
  gif: { kind: 'image', label: 'GIF' },
  webp: { kind: 'image', label: 'WebP' },
  svg: { kind: 'image', label: 'SVG' },
  txt: { kind: 'text', label: 'TXT' },
  csv: { kind: 'csv', label: 'CSV' },
  md: { kind: 'markdown', label: 'Markdown' },
  zip: { kind: 'archive', label: 'ZIP' },
};
/** 浏览器无法直接解析的旧版 / 国产办公格式：建议后端转换为 PDF 后预览 */
const LEGACY = ['doc', 'ppt', 'pps', 'rtf', 'wps', 'dps', 'et'];
/** 能直接预览的类型：内置类型 + 上面启用的 pptx */
const PREVIEWABLE: readonly string[] = [...SUPPORTED_FILE_TYPES, 'jpeg', 'pptx'];

const ICONS: Record<Kind, Component> = {
  pdf: FilePdfOutlined,
  word: FileWordOutlined,
  excel: FileExcelOutlined,
  ppt: FilePptOutlined,
  image: FileImageOutlined,
  csv: FileExcelOutlined,
  markdown: FileMarkdownOutlined,
  text: FileTextOutlined,
  archive: FileZipOutlined,
  unknown: FileOutlined,
};

const { token } = theme.useToken();

/** 文件类别色取自主题 Token 的预设色板（随明暗主题变化），只用于区分类别 */
const kindColor = (kind: Kind) => {
  const t = token.value as unknown as Record<string, string>;
  const map: Record<Kind, string> = {
    pdf: t.red,
    word: t.blue,
    excel: t.green,
    ppt: t.orange,
    image: t.purple,
    csv: t.cyan,
    markdown: t.geekblue,
    text: t.colorTextSecondary,
    archive: t.gold,
    unknown: t.colorTextTertiary,
  };
  return map[kind];
};
const kindIcon = (kind: Kind) => ICONS[kind];

/** 布局用到的颜色、圆角全部来自主题 Token */
const cssVars = computed(() => {
  const t = token.value;
  return {
    '--demo-up-bg': t.colorBgContainer,
    '--demo-up-fill': t.colorFillQuaternary,
    '--demo-up-fill-hover': t.colorFillTertiary,
    '--demo-up-border': t.colorBorderSecondary,
    '--demo-up-primary': t.colorPrimary,
    '--demo-up-primary-bg': t.colorPrimaryBg,
    '--demo-up-text': t.colorText,
    '--demo-up-text-secondary': t.colorTextSecondary,
    '--demo-up-text-tertiary': t.colorTextTertiary,
    '--demo-up-disabled': t.colorTextDisabled,
    '--demo-up-radius': `${t.borderRadiusLG}px`,
    '--demo-up-radius-sm': `${t.borderRadius}px`,
    '--demo-up-focus': t.colorPrimaryBorder,
  } as Record<string, string>;
});

const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE;

const items = ref<UploadItem[]>([]);
const loadingSamples = ref(false);

const totalSize = computed(() => items.value.reduce((sum, item) => sum + item.file.size, 0));

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const splitName = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
};

let seq = 0;
const toItem = (file: File): UploadItem => {
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  const info = KINDS[ext] ?? { kind: 'unknown' as Kind, label: ext ? ext.toUpperCase() : '未知格式' };
  const previewable = PREVIEWABLE.includes(ext);
  const legacy = LEGACY.includes(ext);
  return {
    uid: `f-${(seq += 1)}`,
    file,
    name: file.name,
    ...splitName(file.name),
    kind: info.kind,
    label: info.label,
    previewable,
    hint: previewable ? '' : legacy ? '旧版格式，需后端转换为 PDF 后预览' : '该格式不支持在线预览',
    thumb: info.kind === 'image' && previewable ? URL.createObjectURL(file) : '',
  };
};

const addFiles = (files: File[]) => {
  const room = MAX_COUNT - items.value.length;
  if (room <= 0) {
    message.warning(`最多 ${MAX_COUNT} 个文件`);
    return;
  }
  const accepted = files.filter(file => {
    if (file.size > MAX_BYTES) {
      message.error(`${file.name} 超过单个文件预览上限 ${MAX_MB}MB`);
      return false;
    }
    return true;
  });
  if (accepted.length > room) message.warning(`最多 ${MAX_COUNT} 个文件，已忽略多出的 ${accepted.length - room} 个`);
  items.value = [...items.value, ...accepted.slice(0, room).map(toItem)];
};

/** 阻止自动上传，只在浏览器本地读取 */
const beforeUpload: UploadProps['beforeUpload'] = (_file, fileList) => {
  // 多选时 beforeUpload 对每个文件调用一次，只在第一个文件时整体处理
  if (_file === fileList[0]) addFiles(fileList as unknown as File[]);
  return false;
};

/** 示例文件：从文档站读取通用样例，另造一个长文件名、一个旧版格式与一个压缩包 */
const addSamples = async () => {
  loadingSamples.value = true;
  try {
    const remote: Array<[string, string]> = [
      [sampleUrl('sample.pdf'), 'sample.pdf'],
      [sampleUrl('sample.docx'), '年度工作总结与下一阶段计划（含附录、数据口径说明与参考资料）.docx'],
      [sampleUrl('sample.xlsx'), 'sample.xlsx'],
      [sampleUrl('sample.pptx'), 'sample.pptx'],
      [sampleUrl('sample.png'), 'sample.png'],
    ];
    const fetched = await Promise.all(
      remote.map(async ([url, name]) => new File([await (await fetch(url)).blob()], name))
    );
    const text = (content: string | ArrayBuffer, name: string) => new File([content], name);
    addFiles([
      ...fetched,
      text(sampleFiles.csv.source, sampleFiles.csv.fileName),
      text(sampleFiles.txt.source, sampleFiles.txt.fileName),
      text('# 说明\n\n- 支持 Markdown 源文本预览\n', 'README.md'),
      text('旧版 Word 文档示例', 'legacy-document.doc'),
      text('PK', 'archive.zip'),
    ]);
  } catch {
    message.error('示例文件加载失败');
  } finally {
    loadingSamples.value = false;
  }
};

/**
 * 函数式预览：useFilePreview 打开的弹窗继承这里的上下文（外层 ConfigProvider 的明暗主题、语言包、provide），
 * 不需要在模板里放弹窗组件
 */
const { openList } = useFilePreview();
let controller: FilePreviewController | null = null;

const previewable = computed(() => items.value.filter(item => item.previewable));
/** 只传可预览的文件：标题下拉在它们之间切换，← → 翻页；uid 是业务字段，会原样出现在 ctx.file 里 */
const toPreviewItems = () =>
  previewable.value.map<FilePreviewItem>(item => ({
    source: item.file,
    fileName: item.name,
    fileSize: item.file.size,
    uid: item.uid,
  }));

/** 点击文件：在可预览的文件中定位到它；标题栏放一个「移除」，删除后弹窗停在原位置显示下一个 */
const preview = (index: number) => {
  const target = items.value[index];
  if (!target?.previewable) return;
  controller = openList(
    toPreviewItems(),
    previewable.value.findIndex(item => item.uid === target.uid),
    {
      maxSize: MAX_BYTES,
      slots: {
        actions: ({ file }) =>
          h(AButton, { size: 'small', danger: true, onClick: () => removeByUid(file.uid as string) }, () => '移除'),
      },
    }
  );
};

const download = (item: UploadItem) => {
  const url = URL.createObjectURL(item.file);
  const link = document.createElement('a');
  link.href = url;
  link.download = item.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const release = (item: UploadItem) => {
  if (item.thumb) URL.revokeObjectURL(item.thumb);
};

const remove = (index: number) => {
  const [removed] = items.value.splice(index, 1);
  if (removed) release(removed);
  // 弹窗开着时同步列表（关闭后调用不会有任何效果）
  controller?.update(toPreviewItems());
};

const removeByUid = (uid: string) => {
  const index = items.value.findIndex(item => item.uid === uid);
  if (index >= 0) remove(index);
};

const clearAll = () => {
  items.value.forEach(release);
  items.value = [];
  controller?.update([]);
};

const submit = () => {
  message.success(`已提交 ${items.value.length} 个文件（示例不会真正上传）`);
};

onBeforeUnmount(clearAll);
</script>

<style scoped>
.demo-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--demo-up-text);
}

.demo-upload__dragger :deep(.ant-upload-drag) {
  border-radius: var(--demo-up-radius);
}

.demo-upload__drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
}

.demo-upload__drop-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
  font-size: 24px;
  color: var(--demo-up-primary);
  background: var(--demo-up-primary-bg);
  border-radius: 50%;
}

.demo-upload__drop-title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--demo-up-text);
}

.demo-upload__drop-hint {
  margin: 0;
  font-size: 13px;
  color: var(--demo-up-text-tertiary);
}

.demo-upload__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--demo-up-text-secondary);
}

.demo-upload__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.demo-upload__item {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 8px 12px;
  background: var(--demo-up-fill);
  border: 1px solid transparent;
  border-radius: var(--demo-up-radius);
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.demo-upload__item:hover,
.demo-upload__item:focus-within {
  background: var(--demo-up-fill-hover);
  border-color: var(--demo-up-border);
}

.demo-upload__thumb {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  font-size: 22px;
  background: var(--demo-up-bg);
  border-radius: var(--demo-up-radius-sm);
}

.demo-upload__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.demo-upload__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 文件名：中间省略，保留后缀 */
.demo-upload__name {
  display: inline-flex;
  max-width: 100%;
  padding: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--demo-up-text);
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 2px;
}

.demo-upload__name:hover:not(:disabled) {
  color: var(--demo-up-primary);
}

.demo-upload__name:focus-visible {
  outline: 2px solid var(--demo-up-focus);
  outline-offset: 2px;
}

.demo-upload__name:disabled {
  cursor: default;
}

.demo-upload__stem {
  min-width: 1.5em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-upload__ext {
  flex-shrink: 0;
}

.demo-upload__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--demo-up-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.demo-upload__tag {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
}

.demo-upload__hint {
  color: var(--demo-up-text-tertiary);
}

.demo-upload__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

/* 悬停或键盘聚焦时显示操作；触屏设备始终显示 */
.demo-upload__item:hover .demo-upload__actions,
.demo-upload__item:focus-within .demo-upload__actions {
  opacity: 1;
}

@media (hover: none) {
  .demo-upload__actions {
    opacity: 1;
  }
}

.demo-upload__empty {
  padding: 16px 0;
  margin: 0;
  background: var(--demo-up-fill);
  border-radius: var(--demo-up-radius);
}

.demo-upload__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
