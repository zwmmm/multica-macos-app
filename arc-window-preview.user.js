// ==UserScript==
// @name         Arc Window Preview
// @namespace    https://github.com/sanyi/userscripts
// @version      0.2.2
// @description  Intercept page navigation and window.open, then preview them in an Arc-inspired iframe panel.
// @author       sanyi
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HOST_ID = "arc-window-preview-host";
  const nativeOpen = window.open.bind(window);

  let host;
  let shadow;
  let frame;
  let panel;
  let address;
  let status;
  let currentUrl = "";
  let closeTimer = 0;
  let dragState = null;
  let dragFrame = 0;
  let resizeState = null;
  let resizeFrame = 0;
  let maximized = false;

  const icons = {
    close: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    reload: '<svg viewBox="0 0 24 24"><path d="M19 8a8 8 0 1 0 1 6M19 4v4h-4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>',
    maximize: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"/><path d="m4 9 5-5m6 0 5 5m0 6-5 5M9 20l-5-5"/></svg>',
  };

  function isPreviewableUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function normalizeUrl(value) {
    return new URL(String(value), location.href).href;
  }

  function createButton(action, label, icon) {
    return `<button type="button" data-action="${action}" aria-label="${label}" title="${label}">${icon}</button>`;
  }

  function ensureUi() {
    if (host && document.documentElement.contains(host)) return;
    if (!document.documentElement) {
      document.addEventListener("DOMContentLoaded", ensureUi, { once: true });
      return;
    }

    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: none;
          color-scheme: light dark;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        :host([data-open]) { display: block; }
        .backdrop {
          position: absolute;
          inset: 0;
          background: rgba(10, 12, 18, .22);
          backdrop-filter: blur(7px) saturate(115%);
          -webkit-backdrop-filter: blur(7px) saturate(115%);
          opacity: 0;
          transition: opacity 220ms ease;
        }
        .panel {
          --x: 0px;
          --y: 0px;
          position: absolute;
          left: max(18px, calc(50% - min(570px, calc(50vw - 18px))));
          top: max(18px, calc(50% - min(390px, calc(50vh - 18px))));
          width: min(1140px, calc(100vw - 36px));
          height: min(780px, calc(100vh - 36px));
          display: grid;
          grid-template-rows: 52px minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .42);
          border-radius: 20px;
          background: rgba(246, 246, 248, .88);
          box-shadow: 0 38px 100px rgba(8, 12, 24, .32), 0 8px 30px rgba(8, 12, 24, .18), inset 0 1px rgba(255, 255, 255, .72);
          opacity: 0;
          transform: translate(var(--x), calc(var(--y) + 28px)) scale(.94);
          transform-origin: var(--origin-x, 50%) var(--origin-y, 50%);
          transition: opacity 180ms ease, transform 420ms cubic-bezier(.2, .9, .2, 1.12), border-radius 280ms ease;
          will-change: transform, opacity;
        }
        :host([data-visible]) .backdrop { opacity: 1; }
        :host([data-visible]) .panel {
          opacity: 1;
          transform: translate(var(--x), var(--y)) scale(1);
        }
        :host([data-closing]) .backdrop { opacity: 0; }
        :host([data-closing]) .panel {
          opacity: 0;
          transform: translate(var(--x), calc(var(--y) + 16px)) scale(.97);
          transition-duration: 170ms;
          transition-timing-function: ease-in;
        }
        .panel.maximized {
          left: 8px;
          top: 8px;
          width: calc(100vw - 16px) !important;
          height: calc(100vh - 16px) !important;
          border-radius: 14px;
          --x: 0px !important;
          --y: 0px !important;
        }
        .panel.resizing {
          transition: none;
          box-shadow: 0 24px 64px rgba(8, 12, 24, .24), 0 6px 20px rgba(8, 12, 24, .14);
          will-change: width, height;
        }
        .panel.resizing iframe { pointer-events: none; }
        .panel.dragging {
          transition: none;
          box-shadow: 0 24px 64px rgba(8, 12, 24, .24), 0 6px 20px rgba(8, 12, 24, .14);
        }
        .panel.dragging iframe { pointer-events: none; }
        .toolbar {
          display: grid;
          grid-template-columns: auto auto minmax(90px, 1fr) auto;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(20, 24, 34, .09);
          background: linear-gradient(180deg, rgba(255,255,255,.78), rgba(241,242,246,.7));
          user-select: none;
          cursor: grab;
        }
        .toolbar.dragging { cursor: grabbing; }
        .traffic, .navigation, .actions { display: flex; align-items: center; gap: 4px; }
        button {
          box-sizing: border-box;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 9px;
          color: rgba(25, 28, 36, .74);
          background: transparent;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, transform 140ms ease;
        }
        button:hover { color: #161820; background: rgba(30, 34, 44, .085); }
        button:active { transform: scale(.9); }
        button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        .close {
          width: 13px;
          height: 13px;
          margin: 0 9px 0 4px;
          border-radius: 50%;
          color: transparent;
          background: #ff5f57;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.1);
        }
        .close:hover { color: rgba(88, 0, 0, .68); background: #ff5f57; }
        .close svg { width: 9px; height: 9px; stroke-width: 2.3; }
        .address {
          min-width: 0;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 14px;
          border: 1px solid rgba(20, 24, 34, .07);
          border-radius: 10px;
          color: rgba(25, 28, 36, .62);
          background: rgba(255, 255, 255, .62);
          box-shadow: inset 0 1px 2px rgba(15, 18, 26, .045), 0 1px rgba(255,255,255,.7);
          font-size: 12px;
          font-weight: 520;
          letter-spacing: .01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .viewport { position: relative; min-height: 0; background: #fff; }
        iframe { width: 100%; height: 100%; display: block; border: 0; background: #fff; }
        .resize-handle {
          position: absolute;
          right: 0;
          bottom: 0;
          z-index: 4;
          width: 26px;
          height: 26px;
          cursor: nwse-resize;
          touch-action: none;
        }
        .resize-handle::after {
          content: "";
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 8px;
          height: 8px;
          border-right: 1.5px solid rgba(70, 74, 86, .45);
          border-bottom: 1.5px solid rgba(70, 74, 86, .45);
          border-radius: 0 0 3px 0;
        }
        .loading {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease;
        }
        .loading.active { opacity: 1; }
        .loading::after {
          content: "";
          display: block;
          width: 34%;
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, transparent, #8b7cff, #55b9ff, transparent);
          animation: loading 1.1s ease-in-out infinite;
        }
        @keyframes loading { from { transform: translateX(-110%); } to { transform: translateX(300%); } }
        .status {
          position: absolute;
          right: 12px;
          bottom: 12px;
          max-width: min(430px, calc(100% - 24px));
          padding: 9px 12px;
          border-radius: 10px;
          color: rgba(255,255,255,.92);
          background: rgba(22, 25, 34, .82);
          box-shadow: 0 8px 30px rgba(0,0,0,.2);
          backdrop-filter: blur(12px);
          font-size: 12px;
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 160ms ease, transform 160ms ease;
          pointer-events: none;
        }
        .status.show { opacity: 1; transform: none; }
        @media (prefers-color-scheme: dark) {
          .panel { border-color: rgba(255,255,255,.14); background: rgba(36,38,45,.9); box-shadow: 0 38px 110px rgba(0,0,0,.55), inset 0 1px rgba(255,255,255,.12); }
          .toolbar { border-color: rgba(255,255,255,.08); background: linear-gradient(180deg, rgba(48,50,58,.94), rgba(37,39,46,.9)); }
          button { color: rgba(255,255,255,.7); }
          button:hover { color: #fff; background: rgba(255,255,255,.1); }
          .address { color: rgba(255,255,255,.64); border-color: rgba(255,255,255,.07); background: rgba(10,11,15,.28); box-shadow: inset 0 1px 2px rgba(0,0,0,.2); }
        }
        @media (max-width: 620px) {
          .panel { left: 8px; top: 8px; width: calc(100vw - 16px); height: calc(100vh - 16px); border-radius: 15px; }
          .resize-handle { display: none; }
          .toolbar { grid-template-columns: auto auto minmax(40px, 1fr) auto; padding-inline: 8px; gap: 3px; }
          .actions [data-action="copy"] { display: none; }
          button { width: 30px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .backdrop, .panel, .status { transition-duration: 1ms !important; animation-duration: 1ms !important; }
        }
      </style>
      <div class="backdrop" data-action="close"></div>
      <section class="panel" role="dialog" aria-modal="true" aria-label="网页预览">
        <header class="toolbar">
          <div class="traffic">${createButton("close", "关闭 (Esc / ⌘⇧X)", icons.close)}</div>
          <nav class="navigation">
            ${createButton("back", "后退", icons.back)}
            ${createButton("forward", "前进", icons.forward)}
            ${createButton("reload", "刷新", icons.reload)}
          </nav>
          <div class="address" title=""></div>
          <div class="actions">
            ${createButton("copy", "复制链接", icons.copy)}
            ${createButton("external", "在新标签页打开", icons.external)}
            ${createButton("maximize", "最大化", icons.maximize)}
          </div>
        </header>
        <main class="viewport">
          <div class="loading"></div>
          <iframe title="网页预览" referrerpolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write; fullscreen; autoplay"></iframe>
          <div class="status" role="status"></div>
        </main>
        <div class="resize-handle" aria-hidden="true"></div>
      </section>`;

    document.documentElement.append(host);
    panel = shadow.querySelector(".panel");
    frame = shadow.querySelector("iframe");
    address = shadow.querySelector(".address");
    status = shadow.querySelector(".status");

    shadow.addEventListener("click", handleUiClick);
    shadow.querySelector(".toolbar").addEventListener("pointerdown", startDrag);
    shadow.querySelector(".resize-handle").addEventListener("pointerdown", startResize);
    frame.addEventListener("load", () => {
      shadow.querySelector(".loading").classList.remove("active");
      bindFrameShortcuts();
    });
  }

  function showPreview(url, origin) {
    ensureUi();
    if (!host || !frame) return nativeOpen(url, "_blank", "noopener");

    window.clearTimeout(closeTimer);
    currentUrl = normalizeUrl(url);
    address.textContent = currentUrl;
    address.title = currentUrl;
    resetPanelPosition();
    setTransformOrigin(origin);
    shadow.querySelector(".loading").classList.add("active");
    frame.src = currentUrl;
    host.removeAttribute("data-closing");
    host.setAttribute("data-open", "");
    // Force the hidden starting state to render first. Unlike requestAnimationFrame,
    // this also works when the tab is currently in the background.
    void panel.offsetWidth;
    host.setAttribute("data-visible", "");
    document.addEventListener("keydown", handleKeydown, true);
    return createWindowProxy();
  }

  function closePreview() {
    if (!host || !host.hasAttribute("data-open")) return;
    host.removeAttribute("data-visible");
    host.setAttribute("data-closing", "");
    document.removeEventListener("keydown", handleKeydown, true);
    closeTimer = window.setTimeout(() => {
      host.removeAttribute("data-open");
      host.removeAttribute("data-closing");
      frame.src = "about:blank";
      currentUrl = "";
    }, 190);
  }

  function handleUiClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "close") closePreview();
    if (action === "back") navigateFrame("back");
    if (action === "forward") navigateFrame("forward");
    if (action === "reload") reloadFrame();
    if (action === "copy") copyCurrentUrl();
    if (action === "external") openExternally();
    if (action === "maximize") toggleMaximize(button);
  }

  function navigateFrame(direction) {
    try {
      frame.contentWindow.history[direction]();
    } catch (_error) {
      showStatus("受跨域限制，无法读取该页面的历史记录");
    }
  }

  function reloadFrame() {
    try {
      frame.contentWindow.location.reload();
    } catch (_error) {
      frame.src = currentUrl;
    }
    shadow.querySelector(".loading").classList.add("active");
  }

  async function copyCurrentUrl() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      showStatus("链接已复制");
    } catch (_error) {
      showStatus("复制失败，请在新标签页中复制地址");
    }
  }

  function openExternally() {
    if (!currentUrl) return;
    nativeOpen(currentUrl, "_blank", "noopener,noreferrer");
  }

  function toggleMaximize(button) {
    maximized = !maximized;
    panel.classList.toggle("maximized", maximized);
    button.innerHTML = maximized ? icons.restore : icons.maximize;
    button.title = maximized ? "还原" : "最大化";
    button.setAttribute("aria-label", button.title);
  }

  function resetPanelPosition() {
    maximized = false;
    panel.classList.remove("maximized");
    panel.style.setProperty("--x", "0px");
    panel.style.setProperty("--y", "0px");
    panel.style.removeProperty("width");
    panel.style.removeProperty("height");
    const maximizeButton = shadow.querySelector('[data-action="maximize"]');
    maximizeButton.innerHTML = icons.maximize;
    maximizeButton.title = "最大化";
    maximizeButton.setAttribute("aria-label", "最大化");
  }

  function setTransformOrigin(origin) {
    const x = origin && Number.isFinite(origin.x) ? origin.x : innerWidth / 2;
    const y = origin && Number.isFinite(origin.y) ? origin.y : innerHeight / 2;
    const rect = panel.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width, x - rect.left));
    const relativeY = Math.max(0, Math.min(rect.height, y - rect.top));
    panel.style.setProperty("--origin-x", `${relativeX}px`);
    panel.style.setProperty("--origin-y", `${relativeY}px`);
  }

  function startDrag(event) {
    if (maximized || event.button !== 0 || event.target.closest("button")) return;
    const toolbar = event.currentTarget;
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const x = parseFloat(style.getPropertyValue("--x")) || 0;
    const y = parseFloat(style.getPropertyValue("--y")) || 0;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x,
      y,
      nextX: x,
      nextY: y,
      baseLeft: rect.left - x,
      baseTop: rect.top - y,
    };
    panel.classList.add("dragging");
    toolbar.classList.add("dragging");
    toolbar.setPointerCapture(event.pointerId);
    toolbar.addEventListener("pointermove", dragPanel);
    toolbar.addEventListener("pointerup", stopDrag, { once: true });
    toolbar.addEventListener("pointercancel", stopDrag, { once: true });
  }

  function dragPanel(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const nextX = dragState.x + event.clientX - dragState.startX;
    const nextY = dragState.y + event.clientY - dragState.startY;
    dragState.nextX = Math.min(nextX, innerWidth - dragState.baseLeft - 100);
    dragState.nextY = Math.max(
      28 - dragState.baseTop,
      Math.min(nextY, innerHeight - dragState.baseTop - 60)
    );
    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (!dragState) return;
      panel.style.setProperty("--x", `${dragState.nextX}px`);
      panel.style.setProperty("--y", `${dragState.nextY}px`);
    });
  }

  function stopDrag(event) {
    const toolbar = event.currentTarget;
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    if (dragState) {
      panel.style.setProperty("--x", `${dragState.nextX}px`);
      panel.style.setProperty("--y", `${dragState.nextY}px`);
    }
    panel.classList.remove("dragging");
    toolbar.classList.remove("dragging");
    toolbar.removeEventListener("pointermove", dragPanel);
    dragState = null;
  }

  function startResize(event) {
    if (maximized || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const rect = panel.getBoundingClientRect();
    resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      nextWidth: rect.width,
      nextHeight: rect.height,
    };
    panel.classList.add("resizing");
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", resizePanel);
    handle.addEventListener("pointerup", stopResize, { once: true });
    handle.addEventListener("pointercancel", stopResize, { once: true });
  }

  function resizePanel(event) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    const rect = panel.getBoundingClientRect();
    const maxWidth = Math.max(360, innerWidth - rect.left - 8);
    const maxHeight = Math.max(260, innerHeight - rect.top - 8);
    resizeState.nextWidth = Math.max(360, Math.min(maxWidth, resizeState.width + event.clientX - resizeState.startX));
    resizeState.nextHeight = Math.max(260, Math.min(maxHeight, resizeState.height + event.clientY - resizeState.startY));
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!resizeState) return;
      panel.style.width = `${Math.round(resizeState.nextWidth)}px`;
      panel.style.height = `${Math.round(resizeState.nextHeight)}px`;
    });
  }

  function stopResize(event) {
    const handle = event.currentTarget;
    handle.removeEventListener("pointermove", resizePanel);
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
    }
    if (resizeState) {
      panel.style.width = `${Math.round(resizeState.nextWidth)}px`;
      panel.style.height = `${Math.round(resizeState.nextHeight)}px`;
    }
    panel.classList.remove("resizing");
    resizeState = null;
  }

  function showStatus(message) {
    status.textContent = message;
    status.classList.add("show");
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => status.classList.remove("show"), 1800);
  }

  function handleKeydown(event) {
    const closesWindow = event.key.toLowerCase() === "w" && (event.metaKey || event.ctrlKey) && !event.altKey;
    const closesPreviewFallback = event.key.toLowerCase() === "x" && event.shiftKey && (event.metaKey || event.ctrlKey) && !event.altKey;
    // Command+W is reserved by Chrome and is normally consumed before a page
    // receives keydown. Keep the best-effort handler, and provide Cmd+Shift+X
    // as the reliable page-level fallback.
    if (event.key === "Escape" || closesPreviewFallback || closesWindow) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePreview();
    }
  }

  function bindFrameShortcuts() {
    try {
      frame.contentWindow.document.removeEventListener("keydown", handleKeydown, true);
      frame.contentWindow.document.addEventListener("keydown", handleKeydown, true);
    } catch (_error) {
      // Cross-origin iframe documents cannot expose keyboard events to the parent page.
    }
  }

  function createWindowProxy() {
    let closed = false;
    return {
      get closed() { return closed || !host || !host.hasAttribute("data-open"); },
      close() { closed = true; closePreview(); },
      focus() { panel && panel.focus(); },
      blur() {},
      postMessage() {},
      get location() { return { href: currentUrl }; },
      set location(value) {
        if (isPreviewableUrl(value)) showPreview(value);
      },
    };
  }

  function originFromElement(element) {
    if (!element || !element.getBoundingClientRect) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function anchorFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof HTMLAnchorElement && node.href) return node;
    }
    return event.target instanceof Element ? event.target.closest("a[href]") : null;
  }

  function shouldInterceptAnchor(event, anchor) {
    if (!anchor || event.altKey || anchor.hasAttribute("download")) return false;
    if (!isPreviewableUrl(anchor.href)) return false;
    const target = (anchor.target || "").trim().toLowerCase();
    return target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
  }

  document.addEventListener("click", (event) => {
    const anchor = anchorFromEvent(event);
    if (!shouldInterceptAnchor(event, anchor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showPreview(anchor.href, { x: event.clientX, y: event.clientY });
  }, true);

  document.addEventListener("auxclick", (event) => {
    const anchor = anchorFromEvent(event);
    if (!shouldInterceptAnchor(event, anchor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showPreview(anchor.href, { x: event.clientX, y: event.clientY });
  }, true);

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    const anchor = anchorFromEvent(event);
    if (!shouldInterceptAnchor(event, anchor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showPreview(anchor.href, { x: event.clientX, y: event.clientY });
  }, true);

  window.open = function (url, target, features) {
    if (!isPreviewableUrl(url)) return nativeOpen(url, target, features);
    return showPreview(url, null);
  };

  // Hold Alt while clicking a link to bypass the preview and use the browser's default behavior.
  window.addEventListener("DOMContentLoaded", ensureUi, { once: true });
})();
