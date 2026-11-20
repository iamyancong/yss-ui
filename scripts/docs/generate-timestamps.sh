#!/bin/sh
# ============================================================================
# generate-timestamps.sh
# 在 CI 阶段执行：遍历 docs/ 下所有 .md 文件，提取 git 最后提交时间戳
# 输出格式：每行 "<文件相对路径>|<unix_timestamp>"
# 生成的 .file-timestamps.txt 会随代码一起发送到 Docker 构建上下文
# ============================================================================

set -e

OUTPUT_FILE=".file-timestamps.txt"

echo "📅 正在生成文档时间戳文件..."

# 清空输出文件
> "$OUTPUT_FILE"

# 遍历 docs 目录下所有 .md 文件
find docs -name "*.md" -type f | sort | while read -r file; do
  # 获取该文件最后一次 git 提交的 unix 时间戳
  ts=$(git log -1 --format=%at -- "$file" 2>/dev/null || echo "")
  if [ -n "$ts" ] && [ "$ts" != "" ]; then
    echo "${file}|${ts}" >> "$OUTPUT_FILE"
  fi
done

count=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
echo "✅ 已生成 ${count} 条时间戳记录 -> ${OUTPUT_FILE}"
