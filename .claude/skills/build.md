# Multica App 构建

## 重要提示

**使用官方 `npx pake-cli` 构建，无需本地 fork**

- 标签页功能已合并到 Pake 官方仓库：配置 `"multiWindow": true` 即可自动基于 bundle identifier 启用 macOS 原生标签页分组。
- 窗口与标签页标题联动：通过注入脚本 `multica-workspace-title.user.js` 更新 `document.title`，Pake 监听到后会自动调用 `window.set_title` 同步标签标题。

## 构建步骤

```bash
cd /Users/sanyi/Documents/Code/multica-macos-app
npm test                 # 先跑测试（node --test test/*.test.js）
npm run build:app        # 或 build:dmg（内部调用 pnpm dlx github:tw93/Pake --config pake.config.json）
```

## 版本号（发新版本时）

两个文件要同步改：
- `package.json` → `"version"`
- `pake.config.json` → `"appVersion"`

## 替换本机 App

```bash
pgrep -x Multica && osascript -e 'quit app "Multica"'; sleep 1
rm -rf /Applications/Multica.app
ditto "<项目根>/Multica.app" /Applications/Multica.app   # 用 ditto 保属性
codesign --verify /Applications/Multica.app              # 必须 OK
open -a Multica
```

## 验证产物

- 版本：`/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" <bundle>/Contents/Info.plist`
- 注入脚本已嵌入二进制：`grep -a -c "<脚本内独有标识>" <bundle>/Contents/MacOS/pake-multica`（如 `mc-comment-tools`、`Workspace Title`）
- 多标签页可用性（无头验证）：AppleScript 点 File→New Window 两次后，AX window 数应保持 1、且 Window 菜单出现多条同名条目=标签合并成功

## 行为注意（非 bug）

- 单窗口时 tab bar 隐藏是 fork 的刻意设计（beddeae）；第二个窗口合并进来后 bar 才出现。
- 标签页标题来自 `multica-workspace-title.user.js`：观察 `<title>` 元素变化后用 **document.title 赋值**触发 WKWebView title KVO 更新窗口/标签名。脚本经 custom.js 拼接嵌入二进制；曾逐一比对过发布版与新构建的二进制符号与注入内容完全一致——若线上发现标题不刷新，优先怀疑运行实例状态（如强制退出后的会话），而不是构建产物。

## 发布 GitHub Release

1. `npm run build:dmg` → 项目根目录得到 `Multica.dmg`
2. 改名为 `Multica-<version>-arm64.dmg`
3. 更新根目录 `SHA256SUMS.txt`：`shasum -a 256 Multica-<version>-arm64.dmg > SHA256SUMS.txt`（保持文件名行格式）
4. 提交全部改动（含 SHA256SUMS.txt；DMG 本身不入库）
5. push 后：`gh release create v<version>` ，资产传 DMG + SHA256SUMS.txt，标题 `Multica <version>`，正文格式参照历史 release：中文 Changes 列表 + "> Apple Silicon (arm64) build. The app uses an ad-hoc signature and is not notarized." + Full Changelog compare 链接
