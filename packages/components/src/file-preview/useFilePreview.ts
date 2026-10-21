/**
 * 命令式打开文件预览弹窗。
 *
 * 弹窗不在调用方的组件树里（挂到 body），但渲染时继承调用方组件的上下文：
 * - appContext：全局组件、指令、app.provide（router、pinia、i18n 等）；
 * - 调用方位置上的 provide 链：外层 a-config-provider（主题 / Token / 算法、prefixCls、componentSize、direction、
 *   antd 语言包）、YConfigProvider（组件库语言包，含 filePreview 文案），以及业务组件 provide 的值，
 *   slots 渲染的内容同样能 inject 到。
 * 做法：用调用方实例的 provides（原型链上包含所有祖先 provide 与 app.provide）作为弹窗根节点的 appContext.provides。
 *
 * 每次调用 useFilePreview() 拥有独立的弹窗实例；open / openList 返回只对本次打开有效的控制句柄。
 * 调用方组件卸载时弹窗随之关闭并销毁。
 */
import {
  computed,
  defineComponent,
  getCurrentInstance,
  getCurrentScope,
  h,
  onScopeDispose,
  ref,
  render,
  shallowRef,
  type AppContext,
  type ComponentInternalInstance,
  type VNode,
} from 'vue';
import FilePreviewModal from './FilePreviewModal.vue';
import type {
  FilePreviewContext,
  FilePreviewController,
  FilePreviewItem,
  FilePreviewLoadedPayload,
  FilePreviewModalExpose,
  FileSource,
  UseFilePreviewOptions,
  UseFilePreviewReturn,
} from './types';
import { normalizePreviewItem } from './utils/item';

/** 关闭动画结束后再卸载弹窗 */
const CLOSE_ANIMATION_MS = 300;

type ModalOptions = Omit<UseFilePreviewOptions, 'fileName' | 'fileType'>;

/** 一次 open / openList 调用 */
interface PreviewSession {
  options: ModalOptions;
  finished: boolean;
  lastIndex: number;
  resolve: (index: number) => void;
}

const clampIndex = (index: number, length: number) =>
  length === 0 ? 0 : Math.min(Math.max(Math.trunc(index) || 0, 0), length - 1);

/** 组件实例上的 provide 链（Vue 内部字段，未出现在公开类型里） */
type InstanceWithProvides = ComponentInternalInstance & { provides?: Record<string | symbol, unknown> };

/**
 * 以调用方实例为起点的渲染上下文：app 级配置照旧，provides 换成调用方位置上的 provide 链。
 * 打开时再读取：调用方在 useFilePreview() 之后才 provide 的值也能拿到
 */
const createRenderContext = (instance: InstanceWithProvides | null): AppContext | null => {
  if (!instance) return null;
  const { appContext } = instance;
  const provides = instance.provides ?? appContext.provides;
  return { ...appContext, provides } as AppContext;
};

export function useFilePreview(): UseFilePreviewReturn {
  const instance = getCurrentInstance() as InstanceWithProvides | null;
  if (!instance && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[YFilePreview] useFilePreview() 应在组件 setup 中调用：在 setup 之外调用时弹窗不会继承 ConfigProvider 主题、' +
        '国际化与 provide 的值，调用方卸载时也不会自动关闭。'
    );
  }

  const visible = ref(false);
  const fileList = shallowRef<FilePreviewItem[]>([]);
  const currentIndex = ref(0);
  const modalRef = shallowRef<FilePreviewModalExpose | null>(null);

  let session: PreviewSession | null = null;
  let host: HTMLElement | null = null;
  let unmountTimer: ReturnType<typeof setTimeout> | null = null;

  const clearUnmountTimer = () => {
    if (unmountTimer !== null) {
      clearTimeout(unmountTimer);
      unmountTimer = null;
    }
  };

  /** 结束一次打开：调用 onClose 并 resolve afterClose，只执行一次 */
  const finish = (target: PreviewSession | null) => {
    if (!target || target.finished) return;
    target.finished = true;
    target.lastIndex = currentIndex.value;
    target.options.onClose?.(target.lastIndex);
    target.resolve(target.lastIndex);
  };

  const unmount = () => {
    clearUnmountTimer();
    finish(session);
    session = null;
    if (host) {
      render(null, host);
      host.remove();
      host = null;
    }
    visible.value = false;
    fileList.value = [];
    currentIndex.value = 0;
  };

  const close = () => {
    if (!visible.value && !host) return;
    finish(session);
    visible.value = false;
    clearUnmountTimer();
    unmountTimer = setTimeout(unmount, CLOSE_ANIMATION_MS);
  };

  const ModalHost = defineComponent({
    name: 'YFilePreviewImperativeHost',
    setup() {
      return () => {
        const options = session?.options ?? {};
        const { customDownload, onChange, onLoaded, onError, slots, onClose: _onClose, ...modalProps } = options;
        const attrs: Record<string, unknown> = {
          ...modalProps,
          ref: modalRef,
          open: visible.value,
          files: fileList.value,
          index: currentIndex.value,
          customDownload,
          'onUpdate:open': (value: boolean) => {
            if (!value) close();
          },
          'onUpdate:index': (value: number) => {
            currentIndex.value = value;
          },
          onChange: (_index: number, _file: FilePreviewItem, ctx: FilePreviewContext) => onChange?.(ctx),
          onLoaded: (payload: FilePreviewLoadedPayload, ctx: FilePreviewContext) => onLoaded?.(payload, ctx),
          onError: (error: Error, ctx: FilePreviewContext) => onError?.(error, ctx),
        };
        return h(FilePreviewModal, attrs, { ...slots });
      };
    },
  });

  const createController = (owner: PreviewSession, afterClose: Promise<number>): FilePreviewController => {
    const active = () => session === owner && !owner.finished;
    return {
      close: () => {
        if (active()) close();
      },
      goTo: index => {
        if (active()) modalRef.value?.goTo(index);
      },
      next: () => {
        if (active()) modalRef.value?.next();
      },
      prev: () => {
        if (active()) modalRef.value?.prev();
      },
      update: (files, index) => {
        if (!active()) return;
        const next = files.map((file: FileSource | FilePreviewItem) => normalizePreviewItem(file));
        fileList.value = next;
        if (index !== undefined) currentIndex.value = clampIndex(index, next.length);
      },
      get index() {
        return active() ? currentIndex.value : owner.lastIndex;
      },
      afterClose,
    };
  };

  const show = (items: FilePreviewItem[], index: number, options: ModalOptions): FilePreviewController => {
    let resolve!: (index: number) => void;
    const afterClose = new Promise<number>(r => {
      resolve = r;
    });
    const owner: PreviewSession = { options, finished: false, lastIndex: 0, resolve };
    const controller = createController(owner, afterClose);

    if (typeof document === 'undefined' || items.length === 0) {
      finish(owner);
      return controller;
    }
    // 再次打开会替换上一次：上一次的 onClose / afterClose 在这里结束
    finish(session);
    // 关闭动画期间再次打开：取消待执行的卸载，复用同一个弹窗
    clearUnmountTimer();
    session = owner;
    fileList.value = items;
    currentIndex.value = clampIndex(index, items.length);
    owner.lastIndex = currentIndex.value;
    visible.value = true;

    if (!host) {
      host = document.createElement('div');
      document.body.appendChild(host);
      const vnode: VNode = h(ModalHost);
      vnode.appContext = createRenderContext(instance);
      render(vnode, host);
    }
    return controller;
  };

  const open: UseFilePreviewReturn['open'] = (file, options = {}) => {
    const { fileName, fileType, ...rest } = options;
    return show([normalizePreviewItem(file, { fileName, fileType })], 0, rest);
  };

  const openList: UseFilePreviewReturn['openList'] = (files, startIndex = 0, options = {}) =>
    show(
      files.map((file: FileSource | FilePreviewItem) => normalizePreviewItem(file)),
      startIndex,
      options
    );

  if (getCurrentScope()) {
    onScopeDispose(unmount);
  }

  return {
    visible: computed(() => visible.value),
    fileList: computed(() => fileList.value),
    currentIndex: computed(() => currentIndex.value),
    open,
    openList,
    close,
  };
}

export default useFilePreview;
