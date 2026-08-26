# Multica macOS App - 项目记忆

## Skills

- [构建 Multica App](.claude/skills/build.md) - 使用本地 fork Pake 构建应用的正确方法

## 关键信息

- **本地 Pake fork**: `/Users/sanyi/Documents/Code/Pake`
- **支持特性**: `macTabbingId` - macOS 原生窗口标签页分组
- **注入脚本**: multica-inbox-comment-tools.user.js, multica-workspace-title.user.js, arc-window-preview.user.js

## 最近更新

- 恢复选中操作栏样式（toolbar 容器，z-index: 100）
- 修复发送按钮 z-index: 101 确保可见
- 修复备注框定位（requestAnimationFrame）
- 备注框最大宽度扩展到 680px
