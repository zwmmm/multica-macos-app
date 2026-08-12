# Multica macOS App

使用 [Pake](https://github.com/tw93/pake) 将 Multica 打包为 macOS 应用。

内置功能：

- Multica Inbox 评论辅助工具
- Arc 风格的新窗口链接预览
- 普通链接保持默认跳转
- 拦截 `target="_blank"`、`window.open`、Command/Ctrl/Shift 点击和中键点击

## 环境要求

- macOS（当前 Release 为 Apple Silicon `arm64`）
- Node.js 22 或更高版本
- Rust 工具链

## 构建

```bash
npm test
npm run build:app
npm run build:dmg
```

DMG 构建产物默认复制到项目根目录的 `Multica.dmg`，安装包通过 GitHub Releases 发布，不纳入 Git 历史。
