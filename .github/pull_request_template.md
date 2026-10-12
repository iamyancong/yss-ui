## 📝 变更说明 (PR Description)

<!-- 简要描述本 PR 解决的问题或新增的特性，关联的 Issue 编号 (如 Fixes #50) -->

- 关联 Issue: 

## 🔍 变更类型 (Change Type)

- [ ] 🐛 Bug 修复 (patch)
- [ ] ✨ 新功能 (minor)
- [ ] 💥 破坏性改动 / 行为微调 (需补充升级说明)
- [ ] 📚 文档 / Skills / 规则更新
- [ ] 🛠️ 重构 / 工具链 / 依赖更新

## 🛡️ 发版与行为变化检查清单 (Release & Behavior Checklist)

- [ ] **敏感行为文件检查**：是否修改了 `scripts/release-behavior-allowlist.json` 监控的敏感核心文件？如有，已通过行为契约测试与 bump 评估。
- [ ] **行为变化与升级说明**：若本 PR 包含存量行为调整或升级注意项，已在对应 `docs/changelog/*.md` 中补录 `### ⚠️ 行为变化与升级说明` 小节。
- [ ] **后续项追踪 (Follow-up Tracking)**：若有拆分或延期实现的子需求，已新建关联 Issue 并在代码/测试中标记 `TODO (#IssueId)`。
- [ ] **API 快照校验**：公开 API 契约未被破坏，已通过 `node scripts/check-api-snapshot.mjs`。
- [ ] **Skills 一致性**：若改动涉及导出或规范，已通过 `pnpm validate:skills`。

## ✅ 质量门禁 (Quality Gate)

- [ ] 本地执行 `pnpm quality` 全绿通过。
