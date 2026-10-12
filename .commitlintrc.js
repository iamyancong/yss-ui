/**
 * Commitlint 配置文件
 * 用于规范 Git Commit Message 格式
 *
 * Commit Message 格式：
 * <type>(<scope>): <subject>
 *
 * 示例：
 * feat(@yss-ui/components): Table 新增远程筛选功能
 * fix(@yss-ui/hooks): useFullscreen 修复 iOS 兼容性问题
 * docs(components): 更新 Table 组件文档
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // Type 枚举：限定 commit 类型
    'type-enum': [
      2,
      'always',
      [
        'feat', // ✨ 新功能
        'fix', // 🐞 Bug 修复
        'docs', // 📝 文档更新
        'style', // 💅 代码格式（不影响代码运行）
        'refactor', // 🛠 重构（既不是新功能也不是 bug 修复）
        'perf', // ⚡ 性能优化
        'test', // ✅ 测试相关
        'build', // 📦 构建系统或外部依赖
        'ci', // 🔧 CI 配置文件和脚本
        'chore', // 🔨 其他不修改 src 或测试文件的更改
        'revert', // ⏪ 回滚 commit
      ],
    ],

    // Scope 枚举：限定影响范围
    'scope-enum': [
      2,
      'always',
      [
        '@yss-ui/components', // 组件库
        '@yss-ui/hooks', // Hooks 库
        '@yss-ui/utils', // 工具库
        '@yss-ui/theme', // 主题配置
        '@yss-ui/create', // 微应用创建 CLI（含别名包 create-yss-app）
        'components', // 组件库（简写）
        'hooks', // Hooks 库（简写）
        'utils', // 工具库（简写）
        'theme', // 主题配置（简写）
        'create', // 微应用创建 CLI（简写）
        'docs', // 文档
        'scripts', // 脚本
        'config', // 配置文件
        'deps', // 依赖更新
        'release', // 版本发布
        'skills', // 技能配置
        'mcp', // MCP 文档服务
      ],
    ],

    // Subject 不能为空
    'subject-empty': [2, 'never'],

    // Subject 不能以句号结尾
    'subject-full-stop': [2, 'never', '.'],

    // Subject 大小写不限制（支持中文）
    'subject-case': [0],

    // Type 必须小写
    'type-case': [2, 'always', 'lower-case'],

    // Scope 必须小写（支持 @yss-ui/xxx 格式）
    'scope-case': [0],

    // Header 最大长度 100
    'header-max-length': [2, 'always', 100],

    // Body 每行最大长度 100
    'body-max-line-length': [2, 'always', 100],

    // Footer 每行最大长度 100
    'footer-max-line-length': [2, 'always', 100],
  },
};
