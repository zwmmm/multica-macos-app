// Pake inject script for https://multica.ai/.
// Adapted from the Multica++ userscript: it uses standard DOM APIs and needs no userscript runtime.

(function () {
  "use strict";

  const ROOT_ID = "mc-comment-tools";
  const STYLE_ID = "mc-comment-tools-style";
  const MARK_CLASS = "mc-mark";
  const CHOICE_NOTE = "✅ 选择这个方案";

  let root;
  let bottomButton;
  let marks = [];
  let pendingMark = null;
  let lastSelection = null;
  let markSeq = 0;
  let marksPageKey = "__unset__";
  let selectionToolbar;
  let selectionBtn;
  let choiceBtn;
  let markPopover;
  let markPopoverInput;
  let markPopoverAnchor = null;
  let markPopoverOffsetX = 0;
  let markPopoverOffsetY = 0;
  let markPopoverPlaced = false;
  let markCardsLayer;
  let markHighlightLayer;
  let sendButton;
  let actionGroup;
  let toastNode;
  let selectionTimer = 0;
  let toastTimer = 0;
  let overlayRaf = 0;

  function isEditableOrInput(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(
      node.closest(
        `#${ROOT_ID}, #mc-toast, #mc-selection-toolbar, input, textarea, select, [contenteditable], [role="textbox"], [role="searchbox"], .ProseMirror, .tiptap, .cm-editor, .monaco-editor`
      )
    );
  }

  function install() {
    injectStyle();
    buildUi();
    syncPageState();

    // Hook SPA navigation without polling or DOM observers
    const wrapHistory = (type) => {
      const orig = history[type];
      return function (...args) {
        const result = orig.apply(this, args);
        syncPageState();
        return result;
      };
    };
    history.pushState = wrapHistory("pushState");
    history.replaceState = wrapHistory("replaceState");
    window.addEventListener("popstate", syncPageState);

    document.addEventListener("selectionchange", scheduleSelectionCheck);
    document.addEventListener("scroll", schedulePositionMarkOverlays, { capture: true, passive: true });
    window.addEventListener("resize", schedulePositionMarkOverlays, { passive: true });
  }

  function syncPageState() {
    const pageKey = getIssueKeyFromUrl(location.href);
    if (!pageKey) {
      if (root) root.hidden = true;
      if (bottomButton) bottomButton.hidden = true;
      if (sendButton) sendButton.hidden = true;
      clearMarks();
      marksPageKey = "";
      return;
    }

    if (root) root.hidden = false;
    if (bottomButton) bottomButton.hidden = false;
    if (pageKey !== marksPageKey) {
      marksPageKey = pageKey;
      clearMarks();
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --font-inter: "Maple Mono CN", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      #${ROOT_ID} {
        color: hsl(220 14% 12%);
        font-family: var(--font-inter);
        pointer-events: none;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      .mc-tools-btn {
        z-index: 100;
        pointer-events: auto;
        border: 1px solid #27272a;
        background: #18181B;
        box-shadow: 0 12px 36px rgb(15 23 42 / 0.16);
        backdrop-filter: blur(10px);
        position: relative;
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        cursor: pointer;
        color: #e4e4e7;
        transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      }

      .mc-scroll-bottom-btn {
        order: 2;
      }

      .mc-mark-send {
        order: 1;
      }

      .mc-actions {
        position: fixed;
        right: 17px;
        bottom: 75px;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }

      .mc-actions > .mc-tools-btn {
        pointer-events: auto;
      }

      .mc-tools-btn:hover {
        transform: translateY(-1px);
        border-color: #3f3f46;
        background: #27272a;
      }

      .mc-tools-btn svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .mc-tools-btn[hidden],
      #mc-selection-toolbar[hidden],
      .mc-mark-card[hidden],
      #${ROOT_ID} [hidden] {
        display: none !important;
      }

      #mc-toast {
        position: fixed;
        left: 50%;
        bottom: 32px;
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
        z-index: 9999;
        font-family: var(--font-inter);
        font-size: 13px;
        font-weight: 500;
        color: #f4f4f5;
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 8px 14px;
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
      }

      #mc-toast[data-show] {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Selection toolbar mirroring the native compact bubble menu */
      #mc-selection-toolbar {
        position: fixed;
        z-index: 100;
        height: 28px;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border-radius: 7px;
        background: #232326;
        border: 1px solid rgb(250 250 250 / 0.12);
        box-shadow: 0 4px 14px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(0 0 0 / 0.1);
        pointer-events: auto;
      }

      #mc-selection-toolbar[hidden] {
        display: none;
      }

      #mc-selection-toolbar button {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 5px;
        background: transparent;
        color: #e4e4e7;
        cursor: pointer;
        padding: 0;
        transition: background 120ms ease, color 120ms ease;
      }

      #mc-selection-toolbar button:hover {
        background: rgb(250 250 250 / 0.12);
        color: #ffffff;
      }

      #mc-selection-toolbar button svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.8;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .mc-mark-popover,
      .mc-mark-cards {
        position: fixed;
        z-index: 100;
        pointer-events: auto;
        border: 1px solid #27272a;
        border-radius: 10px;
        background: #18181B;
        box-shadow: 0 14px 40px rgb(15 23 42 / 0.2);
        backdrop-filter: blur(10px);
        font-family: var(--font-inter);
      }

      .mc-mark-popover {
        width: max-content;
        min-width: 180px;
        max-width: min(680px, calc(100vw - 32px));
        padding: 8px;
      }

      .mc-mark-popover[hidden] {
        display: none;
      }

      .mc-mark-popover blockquote {
        margin: 0 0 8px;
        padding: 6px 8px;
        border-left: 3px solid #2563eb;
        border-radius: 4px;
        background: rgb(37 99 235 / 0.1);
        color: #d4d4d8;
        font-size: 12px;
        line-height: 17px;
        max-height: 66px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .mc-mark-popover textarea {
        display: block;
        width: auto;
        min-width: 100%;
        max-width: min(664px, calc(100vw - 48px));
        height: 66px;
        padding: 6px 8px;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        background: #09090B;
        color: #f4f4f5;
        font-family: inherit;
        font-size: 12px;
        line-height: 17px;
        resize: none;
        outline: none;
      }

      .mc-mark-popover textarea:focus {
        border-color: #2563eb;
      }

      .mc-mark-cards {
        inset: 0;
        pointer-events: none;
        border: 0;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      .mc-mark-card {
        position: absolute;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 90px;
        max-width: 260px;
        height: 28px;
        padding: 0 6px 0 8px;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        background: #18181B;
        color: #f4f4f5;
        font-size: 11px;
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
        cursor: default;
      }

      .mc-mark-card .mc-mark-card-note {
        flex: 1 1 auto;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 26px;
      }

      .mc-mark-card-actions {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .mc-mark-card-btn {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: #a1a1aa;
        cursor: pointer;
        padding: 0;
        transition: background 120ms ease, color 120ms ease;
      }

      .mc-mark-card-btn:hover {
        background: #27272a;
        color: #ffffff;
      }

      .mc-mark-card-btn svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .mc-mark-highlight-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 20;
      }

      .mc-mark-highlight {
        position: absolute;
        background: rgba(234, 179, 8, 0.22);
        border-bottom: 2px solid rgba(234, 179, 8, 0.6);
        border-radius: 2px;
        pointer-events: none;
      }

      .mc-mark-highlight[data-choice="true"] {
        background: rgb(74 222 128 / 0.25);
        border-bottom: 2px solid rgb(74 222 128 / 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.hidden = true;

    markHighlightLayer = document.createElement("div");
    markHighlightLayer.className = "mc-mark-highlight-layer";

    markCardsLayer = document.createElement("div");
    markCardsLayer.className = "mc-mark-cards";

    selectionToolbar = document.createElement("div");
    selectionToolbar.id = "mc-selection-toolbar";
    selectionToolbar.hidden = true;

    selectionBtn = document.createElement("button");
    selectionBtn.className = "mc-selection-btn";
    selectionBtn.type = "button";
    selectionBtn.title = "标记此段文本";
    selectionBtn.setAttribute("aria-label", "标记此段文本");
    selectionBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 11-6 6v3h9l3-3"></path><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"></path></svg>';
    selectionBtn.addEventListener("mousedown", (event) => event.preventDefault());
    selectionBtn.addEventListener("click", openMarkPopover);

    choiceBtn = document.createElement("button");
    choiceBtn.className = "mc-selection-btn";
    choiceBtn.type = "button";
    choiceBtn.title = "选择此方案";
    choiceBtn.setAttribute("aria-label", "选择此方案");
    choiceBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path><path d="m9 12 2 2 4-4"></path></svg>';
    choiceBtn.addEventListener("mousedown", (event) => event.preventDefault());
    choiceBtn.addEventListener("click", commitChoiceMark);

    selectionToolbar.append(selectionBtn, choiceBtn);

    markPopover = document.createElement("div");
    markPopover.className = "mc-mark-popover";
    markPopover.hidden = true;

    const quotePreview = document.createElement("blockquote");
    quotePreview.className = "mc-mark-quote-preview";

    markPopoverInput = document.createElement("textarea");
    markPopoverInput.placeholder = "输入批注内容... (Cmd/Ctrl+Enter 提交)";
    markPopoverInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commitPendingMark();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelPendingMark();
      }
    });
    markPopover.append(quotePreview, markPopoverInput);
    document.addEventListener("pointerdown", handlePopoverDismiss, true);

    sendButton = document.createElement("button");
    sendButton.className = "mc-tools-btn mc-mark-send";
    sendButton.type = "button";
    sendButton.hidden = true;
    sendButton.title = "发送标记评论";
    sendButton.setAttribute("aria-label", "发送标记评论");
    sendButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>';
    sendButton.addEventListener("click", sendMarkComment);

    bottomButton = document.createElement("button");
    bottomButton.className = "mc-tools-btn mc-scroll-bottom-btn";
    bottomButton.type = "button";
    bottomButton.title = "滚动到底部";
    bottomButton.setAttribute("aria-label", "滚动到底部");
    bottomButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>';
    bottomButton.addEventListener("click", scrollToBottom);

    actionGroup = document.createElement("div");
    actionGroup.className = "mc-actions";
    actionGroup.setAttribute("aria-label", "评论工具");
    actionGroup.append(sendButton, bottomButton);

    toastNode = document.createElement("div");
    toastNode.id = "mc-toast";
    toastNode.setAttribute("role", "status");

    root.append(markHighlightLayer, markCardsLayer, selectionToolbar, markPopover, actionGroup);
    document.body.appendChild(root);
    document.body.appendChild(toastNode);
  }

  function schedulePositionMarkOverlays() {
    if (marks.length === 0 && (!pendingMark || markPopover?.hidden)) return;
    if (overlayRaf) return;
    overlayRaf = window.requestAnimationFrame(() => {
      overlayRaf = 0;
      positionMarkOverlays();
    });
  }

  function isMarkablePage() {
    return Boolean(getIssueKeyFromUrl(location.href));
  }

  function getIssueKeyFromUrl(url) {
    try {
      const parsedUrl = new URL(url, location.origin);
      const issueKey = parsedUrl.searchParams.get("issue")?.trim() ||
        parsedUrl.pathname.match(/\/issues\/([^/?#]+)/)?.[1] || "";
      if (issueKey) return issueKey;
      if (/\/chat(\/|$)/.test(parsedUrl.pathname)) {
        return `chat:${parsedUrl.searchParams.get("session")?.trim() || ""}`;
      }
      return "";
    } catch (_error) {
      return "";
    }
  }

  function scrollToBottom() {
    const scrollable = findBestScrollable();
    if (scrollable && scrollable !== document.scrollingElement && scrollable !== document.documentElement) {
      scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: "smooth" });
      return;
    }

    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }

  function findBestScrollable() {
    const scrollables = Array.from(
      document.querySelectorAll("main, [role='main'], article, [data-scroll-container], [class*='overflow-y'], [class*='overflow-auto']")
    ).filter((el) => el instanceof HTMLElement && !el.closest(`#${ROOT_ID}`) && isScrollable(el));

    return scrollables[0] || document.scrollingElement || document.documentElement;
  }

  function isScrollable(el) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
    return el.scrollHeight > el.clientHeight + 24;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function hideSelectionButtons() {
    if (selectionToolbar) selectionToolbar.hidden = true;
    if (selectionBtn) selectionBtn.hidden = true;
    if (choiceBtn) choiceBtn.hidden = true;
  }

  function scheduleSelectionCheck() {
    const active = document.activeElement;
    if (active && isEditableOrInput(active)) {
      hideSelectionButtons();
      return;
    }
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) {
      hideSelectionButtons();
      return;
    }
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(updateSelectionButton, 140);
  }

  function updateSelectionButton() {
    if (!selectionToolbar) return;
    if (markPopover && !markPopover.hidden) return;
    if (!isMarkablePage()) {
      hideSelectionButtons();
      if (selectionToolbar) selectionToolbar.hidden = true;
      return;
    }

    const selection = document.getSelection();
    const pick = pickSelectableRange(selection);
    lastSelection = pick;
    if (!pick) {
      hideSelectionButtons();
      if (selectionToolbar) selectionToolbar.hidden = true;
      return;
    }

    const rect = pick.range.getBoundingClientRect();
    selectionBtn.hidden = false;
    choiceBtn.hidden = false;
    selectionToolbar.hidden = false;

    // Center toolbar horizontally directly above the selection (gap 6px)
    const toolbarWidth = selectionToolbar.offsetWidth || 56;
    const toolbarHeight = selectionToolbar.offsetHeight || 28;
    const centerX = (rect.left + rect.right) / 2;
    const left = Math.max(8, Math.min(window.innerWidth - toolbarWidth - 8, centerX - toolbarWidth / 2));
    const top = Math.max(8, rect.top - toolbarHeight - 6);

    selectionToolbar.style.left = `${Math.round(left)}px`;
    selectionToolbar.style.top = `${Math.round(top)}px`;
  }

  function pickSelectableRange(selection) {
    if (!selection || selection.rangeCount === 0) return null;
    if (selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    if (!range.commonAncestorContainer) return null;

    const holder = nodeAsElement(range.commonAncestorContainer);
    if (!holder) return null;
    if (isUiNode(holder) || !isMarkablePage()) return null;
    if (holder.closest("input, textarea")) return null;
    const editableRoot = holder.closest("[contenteditable]");
    if (editableRoot && editableRoot.querySelector(".is-editor-empty, [data-placeholder]")) return null;

    const text = normalizeText(range.toString());
    if (!text || text.length < 2 || text.length > 1200) return null;

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    return { range, rect, text };
  }

  function nodeAsElement(node) {
    return node instanceof Element ? node : node.parentElement;
  }

  function isUiNode(node) {
    return Boolean(node && node.closest(`#${ROOT_ID}, #mc-toast`));
  }

  function openMarkPopover() {
    if (pendingMark) return;

    markPopoverAnchor = selectionToolbar.getBoundingClientRect();

    if (!lastSelection) {
      const selection = document.getSelection();
      const pick = pickSelectableRange(selection);
      if (!pick) {
        selectionBtn.hidden = true;
        return;
      }
      lastSelection = pick;
    }

    const mark = createMark(lastSelection, "");
    lastSelection = null;
    if (!mark) return;
    document.getSelection()?.removeAllRanges();

    pendingMark = mark;
    openMarkEditor(mark);
  }

  function openMarkEditor(mark) {
    markPopover.querySelector(".mc-mark-quote-preview").textContent = mark.quote;
    markPopoverInput.value = mark.note;
    markPopover.hidden = false;
    markPopoverPlaced = false;
    hideSelectionButtons();
    positionMarkPopover();
    markPopoverInput.focus();
    markPopoverInput.select();
  }

  function positionMarkPopover() {
    if (!pendingMark?.range?.startContainer.isConnected) return;
    const rect = pendingMark.range.getBoundingClientRect();

    if (!markPopoverPlaced) {
      const width = markPopover.offsetWidth;
      const height = markPopover.offsetHeight;
      let left;
      let top;
      if (markPopoverAnchor) {
        left = Math.max(8, Math.min(window.innerWidth - width - 8, markPopoverAnchor.left));
        top = Math.max(8, Math.min(window.innerHeight - height - 8, markPopoverAnchor.top));
      } else {
        const anchorLeft = rect.left + rect.width / 2;
        left = Math.max(8, Math.min(window.innerWidth - width - 8, anchorLeft - width / 2));
        top = Math.max(8, Math.round(rect.top) - height - 10);
      }
      markPopoverOffsetX = Math.round(left) - rect.left;
      markPopoverOffsetY = Math.round(top) - rect.top;
      markPopoverPlaced = true;
      markPopoverAnchor = null;
    }

    markPopover.style.left = `${Math.round(rect.left + markPopoverOffsetX)}px`;
    markPopover.style.top = `${Math.round(rect.top + markPopoverOffsetY)}px`;
  }

  function handlePopoverDismiss(event) {
    if (markPopover.hidden || !pendingMark) return;
    if (event.target instanceof Node && event.target.closest(markPopover)) return;
    if (event.target === selectionBtn) return;
    cancelPendingMark();
  }

  function cancelPendingMark() {
    if (!pendingMark) return;
    if (!pendingMark.note) removeMark(pendingMark);
    pendingMark = null;
    markPopover.hidden = true;
    markPopoverInput.value = "";
    markPopoverAnchor = null;
    markPopoverPlaced = false;
    if (sendButton) sendButton.hidden = marks.length === 0;
  }

  function commitPendingMark() {
    if (!pendingMark) return;
    const note = markPopoverInput.value.trim();
    if (!note) {
      removeMark(pendingMark);
    } else {
      pendingMark.note = note;
      renderMarkCard(pendingMark);
    }
    pendingMark = null;
    markPopover.hidden = true;
    markPopoverInput.value = "";
    markPopoverAnchor = null;
    markPopoverPlaced = false;
    if (sendButton) sendButton.hidden = marks.length === 0;
  }

  function commitChoiceMark() {
    if (!lastSelection) {
      const selection = document.getSelection();
      const pick = pickSelectableRange(selection);
      if (!pick) return;
      lastSelection = pick;
    }

    const mark = createMark(lastSelection, CHOICE_NOTE, true);
    lastSelection = null;
    document.getSelection()?.removeAllRanges();
    hideSelectionButtons();

    if (mark) {
      renderMarkCard(mark);
      if (sendButton) sendButton.hidden = false;
      showToast("已添加方案选择标记");
    }
  }

  function removeMark(mark) {
    mark.range?.detach?.();
    mark.card?.remove();
    marks = marks.filter((m) => m.id !== mark.id);
    if (sendButton) sendButton.hidden = marks.length === 0;
    renderMarkHighlights();
    positionMarkCards();
  }

  function createMark(pick, note, choice = false) {
    markSeq += 1;
    const id = `mark-${markSeq}-${Date.now()}`;
    const anchor = buildAnchor(pick.range, pick.text);
    const mark = {
      id,
      note,
      quote: pick.text,
      choice,
      range: pick.range.cloneRange(),
      anchor,
    };
    marks.push(mark);
    renderMarkHighlights();
    return mark;
  }

  function buildAnchor(range, quote) {
    const root = nodeAsElement(range.commonAncestorContainer) || document.body;
    const path = [];
    let cur = root;
    while (cur && cur !== document.body) {
      path.unshift(cssSelectorFor(cur));
      cur = cur.parentElement;
    }
    return {
      path: path.join(" > "),
      quote,
    };
  }

  function cssSelectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    let sel = el.localName || "";
    if (el.className && typeof el.className === "string") {
      const classes = el.className.split(/\s+/).filter(Boolean);
      if (classes.length) sel += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
    }
    return sel;
  }

  function relocateMark(mark) {
    if (mark.range?.startContainer.isConnected) return;
    try {
      const root = mark.anchor?.path ? document.querySelector(mark.anchor.path) : null;
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const text = textNode.textContent || "";
        const idx = text.indexOf(mark.quote);
        if (idx !== -1) {
          const r = document.createRange();
          r.setStart(textNode, idx);
          r.setEnd(textNode, idx + mark.quote.length);
          mark.range = r;
          return true;
        }
      }
    } catch (_err) {}
    return false;
  }

  function renderMarkHighlights() {
    if (!markHighlightLayer) return;
    const boxes = [];
    for (const mark of marks) {
      const alive = mark.range?.startContainer.isConnected || relocateMark(mark);
      if (!alive) continue;
      const rects = Array.from(mark.range.getClientRects());
      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) continue;
        const box = document.createElement("div");
        box.className = "mc-mark-highlight";
        if (mark.choice) box.dataset.choice = "true";
        box.style.left = `${rect.left}px`;
        box.style.top = `${rect.top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        boxes.push(box);
      }
    }
    markHighlightLayer.replaceChildren(...boxes);
  }

  function renderMarkCard(mark) {
    if (!markCardsLayer) return;
    mark.card?.remove();

    const card = document.createElement("div");
    card.className = "mc-mark-card";
    card.dataset.markId = mark.id;

    const note = document.createElement("div");
    note.className = "mc-mark-card-note";
    note.textContent = mark.note;
    note.title = mark.note;

    const actions = document.createElement("div");
    actions.className = "mc-mark-card-actions";
    actions.append(createCardAction("edit", mark), createCardAction("delete", mark));

    card.append(note, actions);
    markCardsLayer.appendChild(card);
    mark.card = card;
    positionMarkCards();
  }

  function createCardAction(action, mark) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mc-mark-card-btn mc-mark-card-${action}`;
    const label = action === "edit" ? "编辑标记" : "删除标记";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML =
      action === "edit"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (action === "edit") {
        if (pendingMark && pendingMark !== mark) cancelPendingMark();
        markPopoverAnchor = null;
        pendingMark = mark;
        openMarkEditor(mark);
      } else {
        removeMark(mark);
      }
    });
    return button;
  }

  function positionMarkCards() {
    if (!markCardsLayer || marks.length === 0) return;
    for (const mark of marks) {
      if (!mark.card) continue;
      const alive = mark.range?.startContainer.isConnected || relocateMark(mark);
      mark.card.hidden = !alive;
      if (!alive) continue;
      const rect = mark.range.getBoundingClientRect();
      const cardWidth = mark.card.offsetWidth || 180;
      const cardHeight = mark.card.offsetHeight || 28;
      mark.card.style.left = `${Math.round(
        Math.max(8, Math.min(window.innerWidth - cardWidth - 8, rect.left + rect.width / 2 - cardWidth / 2))
      )}px`;
      mark.card.style.top = `${Math.round(Math.max(8, rect.top - cardHeight - 6))}px`;
    }
  }

  function positionMarkOverlays() {
    if (marks.length === 0 && (!pendingMark || markPopover?.hidden)) {
      return;
    }
    if (markPopover && !markPopover.hidden && pendingMark) {
      positionMarkPopover();
    }
    positionMarkCards();
    renderMarkHighlights();
  }

  function showToast(message) {
    if (!toastNode) return;
    toastNode.textContent = message;
    toastNode.setAttribute("data-show", "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastNode.removeAttribute("data-show"), 1800);
  }

  function clearMarks() {
    for (const mark of marks) {
      mark.card?.remove();
    }
    marks = [];
    pendingMark = null;
    markPopoverAnchor = null;
    if (markCardsLayer) markCardsLayer.replaceChildren();
    if (markPopover) markPopover.hidden = true;
    hideSelectionButtons();
    if (sendButton) sendButton.hidden = true;
    renderMarkHighlights();
  }

  function buildMarkComment(entries) {
    return entries
      .map((entry) => {
        const quote = entry.quote
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return `${quote}\n\n${entry.note}`;
      })
      .join("\n\n\n");
  }

  function buildMarkCommentMarkdown() {
    return buildMarkComment(marks);
  }

  function isChatPage() {
    return /\/chat(\/|$)/.test(location.pathname);
  }

  const issueUuidCache = new Map();

  async function findIssueUuid() {
    const fromUrl =
      location.pathname.match(/\/issues\/([0-9a-f-]{36})/i)?.[1] ||
      new URLSearchParams(location.search).get("issue")?.match(/^[0-9a-f-]{36}$/i)?.[0];
    if (fromUrl) return fromUrl;

    const identifier =
      new URLSearchParams(location.search).get("issue")?.trim() ||
      location.pathname.match(/\/issues\/([^/?#]+)/)?.[1]?.trim() ||
      "";
    if (!identifier) return "";

    if (issueUuidCache.has(identifier)) return issueUuidCache.get(identifier);

    try {
      const response = await fetch(`https://api.multica.ai/api/issues/${encodeURIComponent(identifier)}`, {
        method: "GET",
        credentials: "include",
        headers: buildCommentHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const uuid = data?.id || data?.data?.id || data?.issue?.id || "";
        if (uuid) {
          issueUuidCache.set(identifier, uuid);
          return uuid;
        }
      }
    } catch (_error) {
      // Fall through
    }
    return "";
  }

  function findChatSessionId() {
    if (!isChatPage()) return "";
    const fromUrl = new URLSearchParams(location.search).get("session");
    if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl)) return fromUrl;
    return "";
  }

  function buildCommentHeaders() {
    const row = document.cookie.split("; ").find((r) => r.startsWith("multica_csrf="));
    const csrf = row ? row.slice("multica_csrf=".length) : "";
    const headers = {
      "Content-Type": "application/json",
      "X-Client-OS": "macos",
      "X-Client-Platform": "web",
      "X-Request-ID": Math.random().toString(16).slice(2, 10),
    };
    if (csrf) headers["X-CSRF-Token"] = csrf;
    const workspaceSlug = location.pathname.split("/")[1];
    if (workspaceSlug) headers["X-Workspace-Slug"] = workspaceSlug;
    return headers;
  }

  async function sendMarkComment() {
    if (marks.length === 0) return;

    const content = buildMarkCommentMarkdown();
    const isChat = isChatPage();
    let url;
    let body;
    if (isChat) {
      const chatSessionId = findChatSessionId();
      if (!chatSessionId) {
        showToast("发送失败: 未找到 Chat 会话 ID");
        return;
      }
      url = `https://api.multica.ai/api/chat/sessions/${chatSessionId}/messages`;
      body = { content };
    } else {
      const issueId = await findIssueUuid();
      if (!issueId) {
        showToast("发送失败: 未找到任务 ID");
        return;
      }
      url = `https://api.multica.ai/api/issues/${issueId}/comments`;
      body = { content, type: "comment" };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: buildCommentHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        showToast(`发送失败 (HTTP ${response.status})`);
        return;
      }
      showToast(isChat ? "消息已发送" : "评论已发送");
      clearMarks();
    } catch (_error) {
      showToast("发送失败,请检查网络");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
