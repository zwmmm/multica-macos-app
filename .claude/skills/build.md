# Multica App 构建

## 重要提示

**必须使用本地 fork 的 Pake，不要使用 `npx pake-cli`**

本地 Pake 位置: `/Users/sanyi/Documents/Code/Pake`
全局安装版本: `/Users/sanyi/Library/pnpm/pake`

## 构建步骤

1. **先构建本地 Pake CLI**（如果需要）:
   ```bash
   cd /Users/sanyi/Documents/Code/Pake
   pnpm build
   pnpm link --global
   ```

2. **构建 Multica App**:
   ```bash
   cd /Users/sanyi/Documents/Code/multica-macos-app
   killall Multica  # 关闭正在运行的实例
   npm run build:app
   ```

## 配置文件

`pake.config.json` 包含关键配置：
- `macTabbingId: "multica"` - macOS 原生窗口标签页分组（fork 特性）
- `inject: [...]` - 注入的 userscript 文件

`package.json` 脚本使用本地 pake：
```json
"build:app": "pake --config pake.config.json"
```

## 常见问题

**问题**: 使用 `npx pake-cli` 会使用官方版本，缺少 `macTabbingId` 支持
**解决**: 确保 `package.json` 使用 `pake` 而不是 `npx pake-cli`

## 验证构建

```bash
npm test  # 运行测试
```

## 构建 DMG

```bash
npm run build:dmg
```
