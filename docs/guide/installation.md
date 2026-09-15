---
title: 安装
description: YSS UI 安装指南
toc: content
---

# 安装

YSS UI 相关 NPM 包（如 `@yss-ui/components`、`@yss-ui/hooks`、`@yss-ui/utils`）已公开发布于 **npm 官方公共制品库**。

直接使用你偏好的包管理器进行安装即可。

---

## 源配置说明

通常情况下，使用 npm 官方公共源即可直接拉取 `@yss-ui/*` 依赖：

```bash
npm config set registry https://registry.npmjs.org/
```

如国内网络访问 npm 较慢，亦可使用 npmmirror 镜像源：

```bash
npm config set registry https://registry.npmmirror.com/
```

---

### 验证源配置

完成配置后，可执行以下命令验证源是否生效并能正常读取包信息：

```bash
# 查看当前生效的 registry
npm config get registry

# 查询组件库远端版本信息
npm view @yss-ui/components
```

---

## 环境准备

| 依赖项 | 版本要求 | 推荐版本 |
| --- | --- | --- |
| **Node.js** | `>= 22.10.0` | `22.17.1 LTS` |
| **包管理器** | `pnpm >= 8.6.0`（推荐） / `npm >= 9.0.0` | `pnpm 8.x` |
| **Vue** | `>= 3.3.0` | `3.4+` |

```bash
# 检查 Node.js 版本
node -v

# 检查 pnpm 版本
pnpm -v
```

---

## 安装组件库

完成源配置后，即可在业务项目中安装依赖：

### 核心组件库

`@yss-ui/components` 同包包含表格和表单能力，不需要另装 `@yss-ui/table`、`@yss-ui/formily` 或补装 VXE/Formily。新微应用采用根入口具名导入和局部注册；官方 Vite 插件及版本边界见[统一消费契约](/guide/unified-consumption)。


```bash
# 使用 pnpm（推荐）
pnpm add @yss-ui/components

# 使用 npm
npm install @yss-ui/components

# 使用 yarn
yarn add @yss-ui/components
```

### 扩展子包（按需安装）

根据业务场景安装对应的 Hooks、工具函数或主题包：

```bash
# 业务 Hooks 库（useTableHeight、useTreeHeight、useLoading 等）
pnpm add @yss-ui/hooks

# 通用工具函数库（formatDate、downloadBlob 等）
pnpm add @yss-ui/utils

# 主题与 Token 配置
pnpm add @yss-ui/theme
```

## 依赖与锁文件治理

YSS UI 会对 `YTable` / `YEditTable` 深度依赖的 `vxe-table` 与 `vxe-pc-ui` 使用经过验证的精确版本。业务应用仍必须提交 `pnpm-lock.yaml`，由锁文件固定完整依赖图：

```bash
# 本地首次安装或主动升级依赖
pnpm install

# CI / Docker 构建，只接受仓库已提交的锁文件
pnpm install --frozen-lockfile
```

不要把删除 `pnpm-lock.yaml` 作为常规故障排查手段。确需重建时，应在独立分支执行，审查锁文件 diff 并完成构建回归后再合并。

业务 workspace 根目录的 `overrides` 只用于尚未升级到修复版组件库时的临时止血，不作为长期依赖契约。pnpm 10 workspace 项目应写在根 `pnpm-workspace.yaml` 中，例如 `@yss-ui/components@1.5.16` 可临时使用：

```yaml
packages:
  - 'packages'

overrides:
  vxe-table: 4.19.10
  vxe-pc-ui: 4.14.32
```

使用旧版 pnpm 的非 workspace 项目，可在根 `package.json` 中配置 `pnpm.overrides`；无论采用哪种写法，override 都必须由最终应用的根项目统一管理。

升级到已精确锁定该组合的组件库版本并重新生成、验证锁文件后，应删除业务 override，避免业务配置长期掩盖组件库的真实依赖契约。

---

## 常见问题排查（FAQ）

### 1. 报错 `404 Not Found - @yss-ui/components`

- **原因**：当前生效的 Registry 可能指向了未同步的镜像源。
- **解决**：运行 `npm config get registry` 确认地址，建议直接指向官方源 `https://registry.npmjs.org/`。

### 2. 无法连接 / 请求超时

- **原因**：网络访问 npm 官方源较慢或存在波动。
- **解决**：可临时切换至国内镜像源（如 npmmirror）或配置代理：
  ```bash
  npm config set registry https://registry.npmmirror.com/
  ```

### 3. 切换源后依然拉取失败或读取旧缓存

- **原因**：本地包管理器缓存了旧的元数据或下载失败状态。
- **解决**：清理本地依赖缓存后重试：
  ```bash
  # pnpm 清理缓存
  pnpm store prune

  # npm 清理缓存
  npm cache clean --force

  # 重新安装
  pnpm install
  ```

### 4. 报错 `401 Unauthorized` / `403 Forbidden`

- **普通开发/拉包**：请确认 Registry 地址为 `npm-group`（公开拉取，无需登录）。
- **组件库发布**：仅组件库发布人员发包至 `npm-hosted` 时需要配置 Token，请参阅 [发版工作流指南](/guide/release-workflow)。

### 5. 报错 `ERR_PNPM_FETCH_404 .../<package>-<version>.tgz`

- **先看依赖来源**：使用 `pnpm why <package>` 和锁文件确认是谁选择了该版本；删除锁文件后，`^` / `~` 范围可能解析到新版本。
- **再查 Nexus 制品**：如果 `pnpm view <package>@<version> dist.tarball` 能返回地址，但该 tgz 请求为 404，说明 Registry 元数据与实际制品可用性不一致，需要 Nexus 管理员检查代理缓存、负缓存或 Blob 状态。
- **临时恢复**：仅在应用根配置 override，pnpm 10 workspace 项目写入 `pnpm-workspace.yaml`，并同时固定 `vxe-table` 与 `vxe-pc-ui` 到已验证且 Nexus 可下载的版本；不要把 override 写进待发布的组件依赖包，pnpm 不会把依赖包中的 override 传递给应用根。

---

## 相关链接

- [快速开始](/guide) - 组件库在 Vue 3 项目中的全局与按需接入
- [组件总览](/components) - 查看所有可用组件
- [Hooks 使用指南](/hooks) - 高频业务逻辑与高度自适应 Hooks
