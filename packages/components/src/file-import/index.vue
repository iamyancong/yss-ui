<script setup lang="ts">
import { CloudUploadOutlined } from '@ant-design/icons-vue';
import { Modal, Upload } from 'ant-design-vue';
import { computed, useSlots } from 'vue';
import { useLocale } from '../locale/useLocale';
import YButton from '../button/index.vue';
import type { YFileImportEmit } from './constant';
import { useFileImport } from './hooks/useFileImport';
import type { YFileImportProps } from './types';

defineOptions({ name: 'YFileImport' });

const { t } = useLocale('fileImport');

/** Upload 拖拽区域组件。 */
const UploadDragger = Upload.Dragger;
const props = withDefaults(defineProps<YFileImportProps>(), {
  modelValue: false,
  title: '导入',
  width: '50%',
  fileTypeList: () => ['xls', 'xlsx', 'csv'],
  accept: '',
  multiple: false,
  drag: true,
  action: '',
  autoUpload: false,
  loadings: () => [],
  importResult: () => ({ successkey: '1', failkey: '', success: 2, fail: 0, total: 2 }),
  modalProps: () => ({}),
  uploadProps: () => ({}),
  showDownloadTemplate: true,
  showCancel: true,
  showUploadTip: true,
  showNextStep: true,
  showLastStep: true,
  draggerText: '',
  texts: () => ({}),
});

const modalTitle = computed(() => {
  return props.title && props.title !== '导入' ? props.title : t('title');
});
const emit = defineEmits<YFileImportEmit>();
const slots = useSlots();
const {
  beforeUploadIntercept,
  close,
  draggerProps,
  emitDownloadTemplate,
  emitExportErrorData,
  emitFinalImport,
  fileList,
  finalAccept,
  getContainer,
  getImportResult,
  handleCancel,
  handleFileChange,
  handleLastStep,
  handleNextStep,
  hasFooterLeft,
  isLoading,
  isSelectFileStep,
  isUploadStep,
  mergedTexts,
  modalPassThrough,
  open,
  reset,
  showFailBtn,
  showSuccessBtn,
  uploadTipText,
  visible,
} = useFileImport(props, emit, slots);

defineExpose({ open, close, reset });
</script>
<template>
  <Modal
    :open="visible"
    :title="modalTitle"
    :width="width"
    v-bind="modalPassThrough"
    :get-container="getContainer"
    @cancel="handleCancel"
  >
    <div v-if="visible" class="y-file-import">
      <div v-if="isSelectFileStep" class="y-file-import__uploader">
        <slot name="uploader" :file-list="fileList" :accept="finalAccept" :multiple="multiple">
          <UploadDragger
            v-bind="draggerProps"
            class="y-file-import__dragger"
            :file-list="fileList"
            :accept="finalAccept"
            :multiple="multiple"
            :before-upload="beforeUploadIntercept"
            @change="handleFileChange"
          >
            <div class="y-file-import__dragger-inner">
              <CloudUploadOutlined class="y-file-import__dragger-icon" />
              <div class="y-file-import__dragger-text">
                <template v-if="draggerText">{{ draggerText }}</template>
                <template v-else
                  >{{ t('draggerText') }} <em>{{ t('draggerClick') }}</em></template
                >
              </div>
              <div v-if="showUploadTip && uploadTipText" class="y-file-import__tip">{{ uploadTipText }}</div>
            </div>
          </UploadDragger>
        </slot>
      </div>

      <div v-if="isUploadStep" class="y-file-import__result">
        <slot name="result" :result="importResult">
          <span>
            {{
              t('resultSummary', {
                total: getImportResult('total') ?? 0,
                success: getImportResult('success') ?? 0,
                fail: getImportResult('fail') ?? 0,
              })
            }}
          </span>
        </slot>
      </div>
    </div>

    <template #footer>
      <div class="y-file-import__footer">
        <div v-if="hasFooterLeft" class="y-file-import__footer-left">
          <YButton v-if="showDownloadTemplate" :loading="isLoading('downloadTemplate')" @click="emitDownloadTemplate">
            {{ mergedTexts.downloadTemplate }}
          </YButton>
          <slot name="footerLeft" />
        </div>
        <div class="y-file-import__footer-right">
          <YButton v-if="showCancel" @click="handleCancel">{{ mergedTexts.cancel }}</YButton>
          <YButton
            v-if="showNextStep && isSelectFileStep"
            type="primary"
            :loading="isLoading('nextStep')"
            @click="handleNextStep"
          >
            {{ mergedTexts.nextStep }}
          </YButton>
          <YButton v-if="showLastStep && isUploadStep" @click="handleLastStep">{{ mergedTexts.lastStep }}</YButton>
          <YButton v-if="showSuccessBtn" type="primary" :loading="isLoading('finalImport')" @click="emitFinalImport">
            {{ mergedTexts.confirmImport }}
          </YButton>
          <YButton
            v-if="showFailBtn"
            :danger="true"
            :loading="isLoading('exportErrorData')"
            @click="emitExportErrorData"
          >
            {{ mergedTexts.exportErrorData }}
          </YButton>
          <slot name="footerRight" />
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped lang="less">
@import url('./style.less');
</style>
