import { useLocalizedActions } from './useLocalizedActions';
import type { Ref } from 'vue';
import { nextTick, reactive, toRef } from 'vue';
import type { MonacoApi, YMonacoDiffProps } from '../type';
import { isNginxLanguage, normalizeMonacoLanguage, resolveMonacoTheme } from '../utils/customLanguages';
import { tryFormatNginx } from '../utils/nginxFormat';
import { tryFormatSql } from '../utils/sqlFormat';
import { useMonacoLoader } from './useMonacoLoader';
import { useFullscreen } from './useFullscreen';
import * as Diff from 'diff';

/**
 * 内部轻量防抖函数，避免 Monaco 跨域依赖外部重型表格工具库 (xe-utils)
 */
const debounce = <T extends (...args: any[]) => void>(fn: T, delay = 200): T => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  }) as T;
};

/**
 * useDiffEditor - 管理 Monaco DiffEditor 的按需加载与实例生命周期
 */
export const useDiffEditor = (
  containerRef: Ref<HTMLDivElement | null>,
  wrapperRef: Ref<HTMLDivElement | null>,
  props: YMonacoDiffProps,
  emit: (evt: string, ...args: any[]) => void
) => {
  let monaco: MonacoApi | null = null;
  let diffEditor: any = null;
  const addLocalizedAction = useLocalizedActions(() => diffEditor);
  let originalModel: any = null;
  let modifiedModel: any = null;
  const state = reactive({ isCreating: false, isFullscreen: false });

  // 全屏控制
  let fullscreenApi: ReturnType<typeof useFullscreen> | null = null;
  const fullscreenContextKeyRef = { current: null as any };

  // 统一使用与普通编辑器相同的装载器，避免重复加载/竞态
  const { ensureMonaco, ensureContributions, ensureLanguageContribution } = useMonacoLoader(props as unknown as any);

  /** 计算生效的主题 */
  const getEffectiveTheme = (theme?: string) => {
    const language = originalModel?.getLanguageId?.() || modifiedModel?.getLanguageId?.() || props.language;
    return resolveMonacoTheme(theme || 'vs', language);
  };

  const defaultOptions = {
    readOnly: !!props.readonly,
    automaticLayout: !!props.autoLayout,
    renderSideBySide: true,
    renderIndicators: true, // 确保显示 +/- 指示器
    minimap: { enabled: false },
    folding: true,
    showFoldingControls: 'always',
    foldingStrategy: 'indentation',
    theme: getEffectiveTheme(props.theme),
  } as Record<string, unknown>;

  const buildOptions = (): Record<string, unknown> => {
    return { ...defaultOptions, ...(props.options ?? {}) };
  };

  const normalizeLanguage = (lang?: string) => (lang || '').trim().toLowerCase();

  const shouldFormatOnMount = (lang?: string): boolean => {
    if (props.logMode) return false;
    if (props.formatOnMount === false) return false;
    const target = normalizeLanguage(lang);
    if (!target) return false;
    const allowList =
      Array.isArray(props.formatLanguages) && props.formatLanguages.length > 0 ? props.formatLanguages : ['sql'];
    return allowList.some(item => {
      const normalized = normalizeLanguage(item);
      return !!normalized && (target === normalized || target.endsWith(normalized));
    });
  };

  const tryFormatJson = (text: string): string | null => {
    if (!text) return text as unknown as string;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return null;
    }
  };

  const tryFormatByLanguage = async (language: string, text: string): Promise<string | null> => {
    const lang = normalizeLanguage(language);
    if (lang === 'sql' || lang.endsWith('sql')) {
      return await tryFormatSql(text);
    }
    if (lang === 'json') {
      return tryFormatJson(text);
    }
    if (isNginxLanguage(lang)) {
      return await tryFormatNginx(text);
    }
    return null;
  };

  const formatModelByLanguage = async (mdl: any, lang: string) => {
    if (!mdl) return;
    const before = mdl.getValue?.() ?? '';
    if (!before.trim()) return;
    const formatted = await tryFormatByLanguage(lang, before);
    if (formatted && formatted !== before) {
      mdl.setValue?.(formatted);
    }
  };

  const formatOnMountIfNeeded = async () => {
    const lang = originalModel?.getLanguageId?.() || modifiedModel?.getLanguageId?.() || props.language || '';
    if (!shouldFormatOnMount(lang)) return;
    await nextTick();
    await Promise.all([formatModelByLanguage(originalModel, lang), formatModelByLanguage(modifiedModel, lang)]);
  };

  const create = async () => {
    if (state.isCreating) return;
    state.isCreating = true;
    try {
      const m = await ensureMonaco();
      monaco = m;
      // 保持与普通编辑器一致：先装载常用贡献，再装载语言
      await ensureContributions();
      await ensureLanguageContribution(m, props.language ?? 'javascript');

      // 禁用默认的诊断（Validation），防止 Monaco 尝试加载 Worker 导致报错
      try {
        m.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });
        m.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });
        m.languages.json?.jsonDefaults?.setDiagnosticsOptions({ validate: false });
      } catch {
        /* ignore */
      }

      await nextTick();
      const el = containerRef.value;
      if (!el) return;

      const modelLanguage = normalizeMonacoLanguage(props.language ?? 'javascript');
      originalModel = (m as any).editor.createModel(props.original ?? '', modelLanguage);
      modifiedModel = (m as any).editor.createModel(props.value ?? '', modelLanguage);
      diffEditor = (m as any).editor.createDiffEditor(el, buildOptions());
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });

      // 监听内容变化，触发主线程 Diff
      // 注意：不再依赖 diffEditor.onDidUpdateDiff，因为它依赖 Worker
      const currentOriginalModel = diffEditor.getOriginalEditor().getModel();
      const currentModifiedModel = diffEditor.getModifiedEditor().getModel();

      if (currentOriginalModel && currentModifiedModel) {
        const d1 = currentOriginalModel.onDidChangeContent(() => updateDiffDecorations());
        const d2 = currentModifiedModel.onDidChangeContent(() => updateDiffDecorations());
        contentDispose = () => {
          d1.dispose();
          d2.dispose();
        };
      }

      // 初始化触发
      setTimeout(() => {
        updateDiffDecorations();
      }, 100);

      // 全屏支持：优先使用 wrapperRef，兜底使用 containerRef
      const fsTarget = wrapperRef.value ? wrapperRef : containerRef;
      fullscreenApi = useFullscreen(
        fsTarget,
        () => layout(),
        fs => (state.isFullscreen = fs),
        props.fullscreenZIndex ?? 10000,
        props.fullscreenTransition ?? true
      );

      const addFullscreenActions = () => {
        if (!monaco || !diffEditor) return;
        try {
          // 在原始编辑器和修改后编辑器都注册 ContextKey
          // 注意：DiffEditor 两个编辑器的 ContextKeyService 可能是独立的，也可能是共享的
          // 这里的做法是尝试在 diffEditor（整体）或 modifiedEditor 上创建
          const modifiedEditor = diffEditor.getModifiedEditor();
          fullscreenContextKeyRef.current = modifiedEditor.createContextKey?.('yssIsFullscreen', false) ?? null;
          fullscreenApi?.setContextKey?.(fullscreenContextKeyRef.current);
        } catch {
          fullscreenContextKeyRef.current = null;
        }

        const runFullscreen = () => toggleFullscreen();
        const commonOrder = 1.5;

        // 向 DiffEditor 注册动作，Monaco 会自动分发到子编辑器
        addLocalizedAction({
          id: 'yss-enter-fullscreen',
          label: 'enterFullscreen',
          precondition: '!yssIsFullscreen',
          contextMenuOrder: commonOrder,
          contextMenuGroupId: 'editor/context', // 放在右键菜单
          keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.F11],
          run: runFullscreen,
        });

        addLocalizedAction({
          id: 'yss-exit-fullscreen',
          label: 'exitFullscreen',
          precondition: 'yssIsFullscreen',
          contextMenuOrder: commonOrder,
          contextMenuGroupId: 'editor/context',
          keybindings: [(monaco as any).KeyMod.CtrlCmd | (monaco as any).KeyCode.F11, (monaco as any).KeyCode.Escape],
          run: runFullscreen,
        });
      };
      addFullscreenActions();

      // value 变化通知
      modifiedModel?.onDidChangeContent?.(() => {
        const val = modifiedModel.getValue?.();
        emit('update:value', val);
        emit('change', val);

        // 全屏下强制刷新布局
        if (state.isFullscreen) {
          try {
            // resolveFullscreenTarget 逻辑内联简化，或者复用 useFullscreen 内部逻辑（但无法直接访问）
            // 这里简单调用 updateRect，useFullscreen 内部会处理 target
            requestAnimationFrame(() => fullscreenApi?.updateRect?.());
          } catch {}
        }
      });

      // 初始化后自动格式化一次（默认 SQL，两侧同时执行）
      await formatOnMountIfNeeded();
    } finally {
      state.isCreating = false;
    }
  };

  const dispose = () => {
    if (contentDispose) {
      contentDispose();
      contentDispose = null;
    }
    if (diffEditor) {
      diffEditor.dispose();
    }
    originalModel?.dispose?.();
    modifiedModel?.dispose?.();
    diffEditor = null;
    originalModel = null;
    modifiedModel = null;
  };

  const getInstance = () => diffEditor;

  // 存储装饰器 ID 用于清理

  let originalDecorations: string[] = [];
  let modifiedDecorations: string[] = [];
  // 防止重复监听
  let contentDispose: (() => void) | null = null;

  /**
   * 更新 Diff 装饰器（防抖 200ms）
   * 避免快速输入时频繁计算 Diff 阻塞主线程
   */
  const updateDiffDecorations = debounce(() => {
    if (!diffEditor) return;

    const originalModel = diffEditor.getOriginalEditor().getModel();
    const modifiedModel = diffEditor.getModifiedEditor().getModel();
    if (!originalModel || !modifiedModel) return;

    // 使用 diff 库进行主线程 Diff 计算
    // 这绕过了 Monaco Worker 失败的问题，确保能在任何环境下显示差异背景
    const originalText = originalModel.getValue();
    const modifiedText = modifiedModel.getValue();

    // diffLines 返回变化数组
    const diffResult = Diff.diffLines(originalText, modifiedText, { ignoreWhitespace: true });

    const newOriginalDecos: any[] = [];
    const newModifiedDecos: any[] = [];

    // 追踪行号
    let originalLine = 1;
    let modifiedLine = 1;

    diffResult.forEach((part: any) => {
      const count = part.count || 0;

      if (part.added) {
        // 新增：在右侧（Modified）显示绿色
        newModifiedDecos.push({
          range: {
            startLineNumber: modifiedLine,
            startColumn: 1,
            endLineNumber: modifiedLine + count - 1,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'yss-diff-line-insert', // 确保这个类在 CSS 中定义且 !important
            marginClassName: 'yss-diff-gutter-insert',
            zIndex: 10,
          },
        });
        modifiedLine += count;
      } else if (part.removed) {
        // 删除：在左侧（Original）显示红色
        newOriginalDecos.push({
          range: {
            startLineNumber: originalLine,
            startColumn: 1,
            endLineNumber: originalLine + count - 1,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'yss-diff-line-delete',
            marginClassName: 'yss-diff-gutter-delete',
            zIndex: 10,
          },
        });
        originalLine += count;
      } else {
        // 无变化：两边行号同时增加
        originalLine += count;
        modifiedLine += count;
      }
    });

    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();

    originalDecorations = originalEditor.deltaDecorations(originalDecorations, newOriginalDecos);
    modifiedDecorations = modifiedEditor.deltaDecorations(modifiedDecorations, newModifiedDecos);
  }, 200);

  const setOriginal = (val: string) => {
    if (!originalModel) return;
    if (originalModel.getValue?.() === val) return;
    originalModel.setValue?.(val ?? '');
  };

  const setValue = (val: string) => {
    if (!modifiedModel) return;
    if (modifiedModel.getValue?.() === val) return;
    modifiedModel.setValue?.(val ?? '');
  };

  const setLanguage = async (lang: string) => {
    if (!monaco) return;
    const m = monaco as any;
    const language = normalizeMonacoLanguage(lang);
    const o = originalModel?.getValue?.() ?? '';
    const n = modifiedModel?.getValue?.() ?? '';
    // 确保目标语言贡献已加载
    await ensureLanguageContribution(monaco as MonacoApi, language);
    const oModel = m.editor.createModel(o, language);
    const nModel = m.editor.createModel(n, language);
    diffEditor?.setModel?.({ original: oModel, modified: nModel });
    originalModel?.dispose?.();
    modifiedModel?.dispose?.();
    originalModel = oModel;
    modifiedModel = nModel;
  };

  const setTheme = (theme: string) => {
    if (!monaco) return;
    (monaco as any).editor.setTheme(getEffectiveTheme(theme));
    // 主题切换时重新渲染装饰器
    updateDiffDecorations();
  };

  const layout = () => {
    diffEditor?.layout?.();
  };

  /**
   * 切换全屏
   */
  const toggleFullscreen = async () => {
    // 简单解析 target，默认为 document.documentElement (useFullscreen 内部默认值)
    // 如果 props.fullscreenTarget 有值，则传递
    fullscreenApi?.toggle({
      contextKey: fullscreenContextKeyRef.current,
      target: props.fullscreenTarget,
    });
    state.isFullscreen = !!fullscreenApi?.isFullscreen;
    layout();

    if (state.isFullscreen) {
      await nextTick();
      try {
        // useFullscreen 内部会处理 target
        const target = props.fullscreenTarget;
        const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
        fullscreenApi?.updateRect(targetEl as HTMLElement | undefined);
        layout();
      } catch {}
    }
  };

  return {
    create,
    dispose,
    getInstance,
    setOriginal,
    setValue,
    setLanguage,
    setTheme,
    layout,
    toggleFullscreen,
    isFullscreen: toRef(state, 'isFullscreen'),
  } as const;
};
