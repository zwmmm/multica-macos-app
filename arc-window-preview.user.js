// ==UserScript==
// @name         Arc Window Preview
// @namespace    https://github.com/sanyi/userscripts
// @version      0.4.0
// @description  Route external links to the default system browser via Tauri shell, and open multica.ai _blank links/Cmd-clicks as native new tabs.
// @author       sanyi
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const nativeOpen = window.open.bind(window);

  function isHttpOrHttps(urlObj) {
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  }

  function isMulticaUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      if (!isHttpOrHttps(url)) return false;
      return /(^|\.)multica\.ai$/i.test(url.hostname);
    } catch (_error) {
      return false;
    }
  }

  function isExternalHttpUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      if (!isHttpOrHttps(url)) return false;
      return !/(^|\.)multica\.ai$/i.test(url.hostname);
    } catch (_error) {
      return false;
    }
  }

  // The host app merges new windows into the current window's tab set
  // (macTabbingId), so a plain window.open lands in a native tab.
  function openAsTab(url) {
    nativeOpen(String(url), "_blank", "noopener");
  }

  // Open external links directly in the macOS default browser using Tauri shell API
  function openExternal(url) {
    const targetUrl = String(url);
    if (typeof window !== "undefined") {
      if (window.__TAURI__?.shell?.open) {
        window.__TAURI__.shell.open(targetUrl).catch(() => {});
        return;
      }
      if (typeof window.__TAURI_INVOKE__ === "function") {
        try {
          window.__TAURI_INVOKE__("tauri", {
            __tauriModule: "Shell",
            message: { cmd: "open", path: targetUrl },
          });
          return;
        } catch (_error) {}
      }
    }
    nativeOpen(targetUrl, "_blank", "noopener");
  }

  function anchorFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof HTMLAnchorElement && node.href) return node;
    }
    return event.target instanceof Element ? event.target.closest("a[href]") : null;
  }

  function handleAnchorClick(event) {
    // Hold Alt or right-click to bypass interception
    if (event.altKey || event.button === 2) return;
    const anchor = anchorFromEvent(event);
    if (!anchor || anchor.hasAttribute("download")) return;

    const href = anchor.href;
    if (!href) return;

    // 1. External URLs -> always open in system default browser
    if (isExternalHttpUrl(href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openExternal(href);
      return;
    }

    // 2. Multica URLs -> check if user/link requests a new tab/window
    if (isMulticaUrl(href)) {
      const target = (anchor.target || "").trim().toLowerCase();
      const wantsNewContext = target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
      if (wantsNewContext) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openAsTab(href);
      }
    }
  }

  document.addEventListener("click", handleAnchorClick, true);
  document.addEventListener("auxclick", handleAnchorClick, true);
  document.addEventListener("mousedown", (event) => {
    if (event.button === 1) handleAnchorClick(event);
  }, true);

  // Intercept window.open calls:
  // - External URLs -> open in default OS browser
  // - Multica URLs wanting new context -> open as native tab
  // - Empty / other protocols -> fall back to nativeOpen
  window.open = function (url, target, features) {
    if (url === undefined || url === null || String(url) === "") {
      return nativeOpen(url, target, features);
    }
    if (isExternalHttpUrl(url)) {
      openExternal(url);
      return null;
    }
    if (isMulticaUrl(url)) {
      const wantsNewContext =
        target === undefined || target === null || String(target).trim() === "" ||
        String(target).trim().toLowerCase() === "_blank";
      if (wantsNewContext) {
        return nativeOpen(String(url), "_blank", "noopener");
      }
    }
    return nativeOpen(url, target, features);
  };
})();
