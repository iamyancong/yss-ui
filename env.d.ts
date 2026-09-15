/// <reference types="vite/client" />
declare module 'sortablejs';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}

declare module 'monaco-editor/min/vs/editor/editor.main.css';
declare module 'monaco-editor/esm/vs/basic-languages/*';
declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
declare module 'monaco-editor-nls';
declare module 'monaco-editor-nls/locale/*';
