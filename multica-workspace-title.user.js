// ==UserScript==
// @name         Multica Workspace Title
// @namespace    https://github.com/sanyi/userscripts
// @version      0.3.0
// @description  Rewrite document.title to "工作区 · 页面名" so macOS window tabs show the workspace name.
// @author       sanyi
// @match        https://multica.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const WS_TRIGGER = '[data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]';

  function workspaceName() {
    const trigger = document.querySelector(WS_TRIGGER);
    if (!trigger) return "";
    // 文本为 "SSciOne" 形式：首字符是 logo 字母，其余为工作区名
    const text = trigger.textContent.trim();
    return text.length > 1 ? text.slice(1) : text;
  }

  // 页面自带 "页面名 | Multica" 格式；已合成的 title 里工作区与页面以 " · " 分隔
  function pageTitle(raw) {
    const composed = raw.lastIndexOf("·");
    if (composed > 0) return raw.slice(composed + 1).trim();
    const index = raw.lastIndexOf("|");
    return index > 0 ? raw.slice(0, index).trim() : raw.trim();
  }

  function composeTitle(raw) {
    if (!raw) return raw;
    const page = pageTitle(raw);
    if (!page) return raw;
    const workspace = workspaceName();
    return workspace ? workspace + " · " + page : raw;
  }

  function rewrite() {
    const raw = document.title;
    if (!raw) return;
    const next = composeTitle(raw);
    // 用 document.title 赋值而不是改 <title> 节点：
    // WKWebView 只对赋值路径触发 title KVO，宿主窗口（macOS tab 标题）才会跟着更新。
    if (next !== raw) document.title = next;
  }

  function start() {
    if (!document.head) {
      // document-start 时 head 可能尚未解析；等下一个节点插入再试
      if (document.documentElement) {
        const bootstrap = new MutationObserver((_mutations, observer) => {
          if (document.head) {
            observer.disconnect();
            start();
          }
        });
        bootstrap.observe(document.documentElement, { childList: true, subtree: true });
      } else {
        document.addEventListener("readystatechange", start, { once: true });
      }
      return;
    }

    let scheduled = false;
    // SPA 路由时会整个替换 <title> 元素，所以观察整个 head：
    // 新 title 的插入与旧 title 的文本修改都能捕获。
    const observer = new MutationObserver((mutations) => {
      const touched = mutations.some(
        (m) =>
          [...m.addedNodes].some((node) => node.nodeName === "TITLE") ||
          m.target.nodeName === "TITLE" ||
          (m.type === "characterData" &&
            m.target.parentNode &&
            m.target.parentNode.nodeName === "TITLE"),
      );
      if (!touched || scheduled) return;
      scheduled = true;
      // 异步重写：回调里同步改 title 会再次触发自身（死循环）
      Promise.resolve().then(() => {
        scheduled = false;
        rewrite();
      });
    });
    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    rewrite();
  }

  start();
})();
