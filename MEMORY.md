# Multica macOS App - 项目记忆

## Skills

- [构建 Multica App](.claude/skills/build.md) - 使用本地 fork Pake 构建应用的正确方法

## 关键信息

- **Pake CLI**: 使用官方 `npx pake-cli`（PR 已合并到上游，无需本地 fork）
- **多标签页支持**: `multiWindow: true` - Pake 默认复用 bundle identifier (`ai.multica.desktop`) 启用 macOS 原生标签页分组
- **注入脚本**: multica-inbox-comment-tools.user.js, multica-workspace-title.user.js, arc-window-preview.user.js

## 最近更新

- 彻底移除对 performance 全局网络记录的嗅探，按路由严格区分 Chat 与 Issue 请求
- Issue UUID 解析支持通过 `api/issues/${identifier}` 接口精准查询
- 未获取到有效 ID 时直接提示失败，防止误发
- 标注卡片操作按钮外置到右上角，移除内边距挤压
- 优化评论 Markdown 格式（去除列表标记，引用与回答空行隔离，多标注空行分割）
