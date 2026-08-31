# Multica macOS App - 项目记忆

## Skills

- [构建 Multica App](.claude/skills/build.md) - 使用本地 fork Pake 构建应用的正确方法

## 关键信息

- **Pake CLI**: 使用官方 `npx pake-cli`（PR 已合并到上游，无需本地 fork）
- **多标签页支持**: `multiWindow: true` - Pake 默认复用 bundle identifier (`ai.multica.desktop`) 启用 macOS 原生标签页分组
- **注入脚本**: multica-inbox-comment-tools.user.js, multica-workspace-title.user.js, arc-window-preview.user.js

## 最近更新

- 恢复选中操作栏样式（toolbar 容器，z-index: 100）
- 修复发送按钮 z-index: 101 确保可见
- 修复备注框定位（requestAnimationFrame）
- 备注框最大宽度扩展到 680px
