# Multica App 构建

## 重要提示

**必须使用本地 fork 的 Pake，不要使用 `npx pake-cli`**

- 本地 Pake 位置: `/Users/sanyi/Documents/Code/Pake`
- 全局安装版本 (`pnpm link --global`): `/Users/sanyi/Library/pnpm/pake`
- **必需分支**: `feat/macos-window-tabbing`（包含 macTabbingId、NSWindow tabbingMode、lone-window tab bar 三叉补丁；`main` 上没有这些）。构建前确认：`git -C /Users/sanyi/Documents/Code/Pake branch --show-current`
- Pake 工作区的脏文件属正常状态：`dist/cli.js`（macTabbingId 补丁）、`src-tauri/src/inject/custom.js`（每次构建由 CLI 重新生成拼接注入脚本），不要还原它们。

## 构建步骤

```bash
cd /Users/sanyi/Documents/Code/multica-macos-app
npm test                 # 先跑测试（node --test test/*.test.js）
npm run build:app        # 或 build:dmg
```

构建日志特征：`> pake-cli@x.y.z build /Users/sanyi/Documents/Code/Pake` —— 必须指向本地 checkout，若指向别处说明全局链接断了，回 `/Users/sanyi/Documents/Code/Pake` 执行 `pnpm build && pnpm link --global`。

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
