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

      #mc-selection-toolbar {
        position: fixed;
        z-index: 90;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .mc-selection-btn {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #27272a;
        border-radius: 999px;
        background: #18181b;
        color: #e4e4e7;
        cursor: pointer;
        box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
        backdrop-filter: blur(10px);
        transition: transform 120ms ease, background 120ms ease;
      }

      .mc-selection-btn:hover {
        transform: translateY(-1px);
        background: #27272a;
      }

      .mc-selection-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .mc-mark-popover {
        position: fixed;
        z-index: 95;
        pointer-events: auto;
        width: 280px;
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 8px;
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mc-mark-quote-preview {
        font-size: 11px;
        color: #a1a1aa;
        border-left: 2px solid #3f3f46;
        padding-left: 6px;
        white-space: pre-wrap;
        max-height: 48px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mc-mark-input {
        width: 100%;
        min-height: 54px;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 6px;
        color: #f4f4f5;
        font-family: inherit;
        font-size: 12px;
        padding: 6px 8px;
        resize: none;
        outline: none;
      }

      .mc-mark-input:focus {
        border-color: #52525b;
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
        background: rgba(34, 197, 94, 0.22);
        border-bottom: 2px solid rgba(34, 197, 94, 0.6);
      }

      .mc-mark-cards-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 100;
      }

      .mc-mark-card {
        position: absolute;
        pointer-events: auto;
        width: 220px;
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 8px 10px;
        box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
        color: #f4f4f5;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: opacity 120ms ease;
      }

      .mc-mark-card-note {
        word-break: break-word;
        line-height: 1.4;
      }

      .mc-mark-card-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }

      .mc-mark-card-btn {
        background: transparent;
        border: 0;
        color: #a1a1aa;
        cursor: pointer;
        padding: 2px 4px;
        font-size: 11px;
        border-radius: 4px;
      }

      .mc-mark-card-btn:hover {
        color: #f4f4f5;
        background: #27272a;
      }

      .mc-mark-card-btn.mc-mark-card-del:hover {
        color: #ef4444;
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
    markCardsLayer.className = "mc-mark-cards-layer";

    selectionToolbar = document.createElement("div");
    selectionToolbar.id = "mc-selection-toolbar";
    selectionToolbar.hidden = true;

    selectionBtn = document.createElement("button");
    selectionBtn.className = "mc-selection-btn";
    selectionBtn.type = "button";
    selectionBtn.title = "标记此段文本";
    selectionBtn.setAttribute("aria-label", "标记此段文本");
    selectionBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
    selectionBtn.addEventListener("mousedown", (event) => event.preventDefault());
    selectionBtn.addEventListener("click", openMarkPopover);

    choiceBtn = document.createElement("button");
    choiceBtn.className = "mc-selection-btn";
    choiceBtn.type = "button";
    choiceBtn.title = "选择此方案";
    choiceBtn.setAttribute("aria-label", "选择此方案");
    choiceBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    choiceBtn.addEventListener("mousedown", (event) => event.preventDefault());
    choiceBtn.addEventListener("click", commitChoiceMark);

    selectionToolbar.append(selectionBtn, choiceBtn);

    markPopover = document.createElement("div");
    markPopover.className = "mc-mark-popover";
    markPopover.hidden = true;

    const quotePreview = document.createElement("div");
    quotePreview.className = "mc-mark-quote-preview";

    markPopoverInput = document.createElement("textarea");
    markPopoverInput.className = "mc-mark-input";
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
      return;
    }

    const selection = document.getSelection();
    const pick = pickSelectableRange(selection);
    lastSelection = pick;
    if (!pick) {
      hideSelectionButtons();
      return;
    }

    const rect = pick.range.getBoundingClientRect();
    selectionBtn.hidden = false;
    choiceBtn.hidden = false;
    selectionToolbar.hidden = false;
    const top = `${Math.max(8, rect.top - 36)}px`;
    const selectionLeft = Math.max(8, Math.min(window.innerWidth - 38, rect.right - 15));
    selectionToolbar.style.left = `${selectionLeft}px`;
    selectionToolbar.style.top = top;
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
      renderMarkCards();
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
      renderMarkCards();
      if (sendButton) sendButton.hidden = false;
      showToast("已添加方案选择标记");
    }
  }

  function removeMark(mark) {
    mark.range?.detach?.();
    mark.card?.remove();
    marks = marks.filter((m) => m.id !== mark.id);
    if (sendButton) sendButton.hidden = marks.length === 0;
    renderMarkCards();
    renderMarkHighlights();
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
          return;
        }
      }
    } catch (_err) {}
  }

  function renderMarkHighlights() {
    if (!markHighlightLayer) return;
    markHighlightLayer.replaceChildren();

    marks.forEach((mark) => {
      relocateMark(mark);
      if (!mark.range?.startContainer.isConnected) return;
      const rects = Array.from(mark.range.getClientRects());
      rects.forEach((rect) => {
        if (rect.width === 0 || rect.height === 0) return;
        const hl = document.createElement("div");
        hl.className = "mc-mark-highlight";
        hl.dataset.choice = String(mark.choice);
        hl.style.left = `${rect.left}px`;
        hl.style.top = `${rect.top}px`;
        hl.style.width = `${rect.width}px`;
        hl.style.height = `${rect.height}px`;
        markHighlightLayer.appendChild(hl);
      });
    });
  }

  function renderMarkCards() {
    if (!markCardsLayer) return;
    markCardsLayer.replaceChildren();

    marks.forEach((mark) => {
      if (!mark.note) return;
      relocateMark(mark);
      if (!mark.range?.startContainer.isConnected) return;

      const card = document.createElement("div");
      card.className = "mc-mark-card";
      card.dataset.markId = mark.id;

      const note = document.createElement("div");
      note.className = "mc-mark-card-note";
      note.textContent = mark.note;

      const actions = document.createElement("div");
      actions.className = "mc-mark-card-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "mc-mark-card-btn";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", () => {
        pendingMark = mark;
        openMarkEditor(mark);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "mc-mark-card-btn mc-mark-card-del";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => removeMark(mark));

      actions.append(editBtn, delBtn);
      card.append(note, actions);
      markCardsLayer.appendChild(card);
      mark.card = card;
    });

    positionMarkCards();
  }

  function positionMarkCards() {
    marks.forEach((mark) => {
      if (!mark.card || !mark.range?.startContainer.isConnected) return;
      const rect = mark.range.getBoundingClientRect();
      const card = mark.card;
      const width = card.offsetWidth || 220;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right + 12));
      const top = Math.max(8, rect.top);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    });
  }

  function positionMarkOverlays() {
    renderMarkHighlights();
    positionMarkCards();
    if (pendingMark && !markPopover.hidden) {
      positionMarkPopover();
    }
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

  async function sendMarkComment() {
    if (marks.length === 0) return;

    const issueKey = getIssueKeyFromUrl(location.href);
    if (!issueKey) {
      showToast("未检测到当前 Issue");
      return;
    }

    const content = buildMarkCommentMarkdown();
    if (!content) return;

    sendButton.disabled = true;
    showToast("正在发送评论...");

    try {
      const isChat = issueKey.startsWith("chat:");
      const sessionId = isChat ? issueKey.slice(5) : null;
      const csrfToken = getCsrfToken();
      const workspaceSlug = getWorkspaceSlug();

      const url = isChat
        ? `/api/workspaces/${workspaceSlug}/chat/${sessionId}/messages`
        : `/api/workspaces/${workspaceSlug}/issues/${issueKey}/comments`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          content,
          body: content,
          text: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      showToast("评论发送成功！");
      clearMarks();
    } catch (err) {
      showToast(`发送失败: ${err.message || "网络错误"}`);
    } finally {
      sendButton.disabled = false;
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)(?:csrf_token|XSRF-TOKEN|csrfToken)=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getWorkspaceSlug() {
    const path = location.pathname;
    const parts = path.split("/").filter(Boolean);
    return parts[0] || "default";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
