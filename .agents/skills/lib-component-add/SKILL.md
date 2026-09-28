---
name: lib-component-add
description: 指导在 yss-ui monorepo 中新增组件、Hook 或工具函数的脚手架流程，覆盖目录规范、SFC 结构、模块化拆分与验证命令。
---

# 新增组件、Hook 与工具函数

## 触发条件

- 在 `packages/components`、`packages/hooks` 或 `packages/utils` 中新增组件、Hook 或工具函数。
- 搭建新功能的基础脚手架目录结构、类型声明、入口导出及初始代码。

## 不适用场景

- 使用已有组件或 Hook 开发业务页面：使用业务层 Skill（如 `yss-ui-business-page-generation` 等）。
- 仅修改现有组件的内部实现或公开 API：使用 `component-development`。
- 为已开发完成的组件或 Hook 补充 Dumi 文档、Demo 或更新日志：使用 `lib-docs-sync`。

## 硬约束（禁止/必须）

- **命名规范**：
  - 组件目录必须使用 kebab-case 命名（例如 `edit-table`、`condition-builder`）。
  - Hook 目录必须使用 camelCase 命名且必须以 `use` 开头（例如 `useFullscreen`、`useTableHeight`）。
  - 工具函数文件必须放在 `packages/utils/src/` 下，使用 camelCase 命名（例如 `format.ts`、`download.ts`）。
- **类型文件强制命名**：
  - 所有类型定义文件统一命名为 `types.ts`，**严禁命名为 `type.ts`**。
- **组件模块化拆分（强制执行）**：
  - 当组件代码超过 150 行或包含多个独立职责时，**必须**进行模块化拆分：`index.vue`、`types.ts`、`constant.ts`、`hooks/`、`style.less`。
  - `index.vue`（主组件）：职责必须单一，仅负责**组合 hooks** 和**渲染视图**，代码量控制在 150 行以内。
  - `constant.ts`：必须包含 TypeScript 类型定义（或从 `types.ts` re-export）、枚举、配置映射对象、纯数据转换函数、固定常量及静态表格列配置；禁止在主组件中直接定义超过 1 行的常量/配置。
  - `hooks/`：所有状态管理（`ref`、`reactive`、`computed`）、API 请求逻辑、副作用（`watch`、`watchEffect`）和复杂事件处理必须封装到 `hooks/` 下独立文件；禁止在主组件中直接编写 API 调用逻辑。
  - `style.less`：所有组件样式必须抽离到独立 `style.less`，禁止在主组件中堆砌大段样式。
- **Vue SFC 结构顺序**：
  - Vue 单文件组件结构顺序必须严格遵循：`<script setup lang="ts">` → `<template>` → `<style scoped lang="less">`。
- **统一导出注册**：
  - 新组件必须在 `packages/components/src/index.ts` 中注册导出（运行时组件与 TypeScript 类型）。
  - 新 Hook 必须在 `packages/hooks/src/index.ts` 中导出。
  - 新工具函数必须在 `packages/utils/src/index.ts` 中导出。
- **注释与质量约束**：
  - 所有新增的对外导出函数、Hook、接口、类型与常量必须包含规范的中文 JSDoc 注释。
  - 禁止使用已废弃的 Vue 2 API、CommonJS 或不必要的 `any` 类型。
- **本地验证命令**：
  - 脚手架搭建与代码编写完成后，必须依次执行：
    ```bash
    pnpm type-check && pnpm build:components && pnpm lint
    ```

## 标准代码骨架

### 1. 组件目录结构与代码骨架

```text
packages/components/src/example-component/
├── index.vue          # 主组件（仅负责组合 logic 与 render，≤ 150 行）
├── types.ts           # Props、Emits、Slots 等类型声明（禁止命名为 type.ts）
├── constant.ts        # 常量配置、枚举映射、纯函数
├── hooks/             # 业务状态逻辑拆分
│   └── useExampleState.ts
└── style.less         # 抽离的 Less 样式文件
```

#### `types.ts`

```typescript
/** Example 组件 Props 声明 */
export interface ExampleProps {
  /** 当前输入或绑定值 */
  modelValue?: string;
  /** 是否禁用状态 */
  disabled?: boolean;
}

/** Example 组件 Emits 声明 */
export interface ExampleEmits {
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}
```

#### `constant.ts`

```typescript
import type { ExampleProps } from './types';

/** 默认配置项 */
export const DEFAULT_EXAMPLE_CONFIG = {
  placeholder: '请输入内容',
} as const;

/** 数据格式化辅助函数 */
export function formatExampleLabel(label: string): string {
  return label.trim();
}
```

#### `hooks/useExampleState.ts`

```typescript
import { computed, ref } from 'vue';
import type { ExampleProps } from '../types';

/**
 * 管理 Example 组件内部交互状态
 *
 * @param props 组件 Props
 */
export function useExampleState(props: ExampleProps) {
  const internalValue = ref(props.modelValue ?? '');

  const displayValue = computed(() => {
    return `[Formatted] ${internalValue.value}`;
  });

  const updateValue = (val: string) => {
    internalValue.value = val;
  };

  return {
    internalValue,
    displayValue,
    updateValue,
  };
}
```

#### `index.vue`（SFC 标准顺序：script setup → template → style）

```vue
<script setup lang="ts">
import { useExampleState } from './hooks/useExampleState';
import type { ExampleEmits, ExampleProps } from './types';

defineOptions({ name: 'YExample' });

const props = withDefaults(defineProps<ExampleProps>(), {
  modelValue: '',
  disabled: false,
});

const emit = defineEmits<ExampleEmits>();

const { displayValue, updateValue } = useExampleState(props);

const handleInput = (val: string) => {
  updateValue(val);
  emit('update:modelValue', val);
  emit('change', val);
};
</script>

<template>
  <div class="y-example" :class="{ 'is-disabled': disabled }">
    <span class="y-example__display">{{ displayValue }}</span>
  </div>
</template>

<style scoped lang="less">
@import './style.less';
</style>
```

#### `packages/components/src/index.ts` 导出

```typescript
export { default as YExample } from './example-component/index.vue';
export type { ExampleProps, ExampleEmits } from './example-component/types';
```

---

### 2. Hook 目录结构与代码骨架

```text
packages/hooks/src/useExample/
├── index.ts           # Hook 核心实现
└── types.ts           # Hook 参数及返回值类型（禁止 type.ts）
```

#### `packages/hooks/src/useExample/types.ts`

```typescript
import type { Ref } from 'vue';

/** useExample 配置项 */
export interface UseExampleOptions {
  /** 初始状态值 */
  initialValue?: boolean;
}

/** useExample 返回值契约 */
export interface UseExampleReturn {
  /** 当前状态 */
  state: Ref<boolean>;
  /** 切换状态方法 */
  toggle: () => void;
}
```

#### `packages/hooks/src/useExample/index.ts`

```typescript
import { ref } from 'vue';
import type { UseExampleOptions, UseExampleReturn } from './types';

/**
 * 示例 Hook：管理布尔开关状态
 *
 * @param options 配置参数
 * @returns 状态与控制方法
 */
export function useExample(options: UseExampleOptions = {}): UseExampleReturn {
  const state = ref(Boolean(options.initialValue));

  const toggle = () => {
    state.value = !state.value;
  };

  return {
    state,
    toggle,
  };
}

export type * from './types';
```

#### `packages/hooks/src/index.ts` 导出

```typescript
export { useExample } from './useExample';
export type { UseExampleOptions, UseExampleReturn } from './useExample/types';
```

---

### 3. 工具函数代码骨架

```text
packages/utils/src/exampleFormat.ts
```

#### `packages/utils/src/exampleFormat.ts`

```typescript
/**
 * 格式化目标文本为标准展示格式
 *
 * @param input 原始字符串输入
 * @param defaultValue 空值时回退文本，默认为 '-'
 * @returns 格式化后的结果
 */
export function exampleFormat(input?: string | null, defaultValue = '-'): string {
  if (!input || !input.trim()) {
    return defaultValue;
  }
  return input.trim();
}
```

#### `packages/utils/src/index.ts` 导出

```typescript
export { exampleFormat } from './exampleFormat';
```

## 交付检查清单

- [ ] 目录名符合规范：组件使用 kebab-case，Hook 使用 `useXxx`（camelCase）。
- [ ] 类型文件统一命名为 `types.ts`（严禁命名为 `type.ts`）。
- [ ] 超过 150 行或多职责的组件已拆分为 `index.vue`、`types.ts`、`constant.ts`、`hooks/`、`style.less`。
- [ ] SFC 结构严格遵循 `<script setup>` → `<template>` → `<style>` 顺序。
- [ ] 样式抽离至 `style.less`，无内联或未经主题 Token 约束的固定色彩。
- [ ] 模块已在对应包的入口导出（`components/src/index.ts`、`hooks/src/index.ts` 或 `utils/src/index.ts`）。
- [ ] 所有导出符号包含清晰的中文 JSDoc 说明。
- [ ] 本地验证通过：`pnpm type-check && pnpm build:components && pnpm lint`。

## 失败兜底策略

- **类型检查报错 (`pnpm type-check`)**：
  - 检查 Props 声明是否使用了正确的 TypeScript 泛型语法，避免混合使用运行时 `props` 配置与 `defineProps<T>()`。
  - 检查组件中引用 `types.ts` 是否统一使用了 `import type`，避免将纯类型作为运行时变量导入。
- **组件构建报错 (`pnpm build:components`)**：
  - 检查 `packages/components/src/index.ts` 中的路径拼写是否精确对应目录名。
  - 检查 Less 文件中是否有相对路径引入错误或未解析的 Less 变量。
- **文件行数超标**：
  - 如果组件或主逻辑文件超过 150 行，检查是否混入了静态 column 配置或枚举，立即迁移到 `constant.ts`；状态与方法抽离到 `hooks/`。
