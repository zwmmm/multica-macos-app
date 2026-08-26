// Pake inject script for https://multica.ai/.
// Adapted from the Multica++ userscript: it uses standard DOM APIs and needs no userscript runtime.

(function () {
  "use strict";

  const ROOT_ID = "mc-comment-tools";
  const STYLE_ID = "mc-comment-tools-style";
  const COMMENT_ID_PREFIX = "comment-";
  const MARK_CLASS = "mc-mark";
  const RESCAN_DELAY_MS = 180;
  const HIGHLIGHT_MS = 2200;
  const CHOICE_NOTE = "✅ 选择这个方案";

  let root;
  let timelineList;
  let countNode;
  let bottomButton;
  let timelineButton;
  let timelinePanel;
  let collapsed = true;
  let rescanTimer = 0;
  let activeCommentId = "";
  let lastIssueKey = "";
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
  let markCardsLayer;
  let sendButton;
  let toastNode;
  let selectionTimer = 0;
  let toastTimer = 0;

  function install() {
    injectStyle();
    buildUi();
    resetIssueTools();
    scheduleRescan();

    const observer = new MutationObserver((mutations) => {
      const onlyOwnUiChanged = mutations.every((mutation) => {
        const target = mutation.target;
        return target instanceof Element && target.closest(`#${ROOT_ID}`);
      });
      if (!onlyOwnUiChanged) scheduleRescan();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "style"],
    });

    window.addEventListener("popstate", scheduleRescan);
    window.setInterval(() => {
      const issueKey = getIssueKeyFromUrl(location.href);
      if (issueKey !== lastIssueKey) {
        lastIssueKey = issueKey;
        scheduleRescan();
      }
    }, 1000);
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

      .mc-tools-btn,
      .mc-timeline {
        position: fixed;
        z-index: 40;
        pointer-events: auto;
        border: 1px solid #27272a;
        background: #18181B;
        box-shadow: 0 12px 36px rgb(15 23 42 / 0.16);
        backdrop-filter: blur(10px);
      }

      .mc-tools-btn {
        right: 17px;
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
        bottom: 75px;
      }

      .mc-timeline-trigger {
        bottom: 123px;
      }

      .mc-mark-send {
        bottom: 171px;
        z-index: 101;
      }

      .mc-tools-btn:hover {
        transform: translateY(-1px);
        border-color: #3f3f46;
        background: #27272a;
      }

      .mc-tools-btn[data-active="true"] {
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

      .mc-timeline {
        right: 65px;
        bottom: 75px;
        width: min(240px, calc(100vw - 84px));
        max-height: min(54vh, 520px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 8px;
      }

      .mc-timeline[hidden] {
        display: none;
      }

      .mc-timeline-head {
        min-height: 36px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-bottom: 1px solid #27272a;
      }

      .mc-timeline-title {
        min-width: 0;
        flex: 1;
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        color: #f4f4f5;
      }

      .mc-timeline-count {
        color: #a1a1aa;
        font-weight: 500;
      }

      .mc-timeline-toggle {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #d4d4d8;
        cursor: pointer;
      }

      .mc-timeline-toggle:hover {
        background: #27272a;
      }

      .mc-timeline-list {
        min-height: 0;
        overflow: auto;
        padding: 6px;
      }

      .mc-timeline-item {
        width: 100%;
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 7px;
        align-items: stretch;
        border: 0;
        border-radius: 6px;
        padding: 6px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .mc-timeline-item:hover,
      .mc-timeline-item[data-active="true"] {
        background: #27272a;
      }

      .mc-timeline-dot {
        position: relative;
        width: 18px;
        min-height: 36px;
        align-self: stretch;
      }

      .mc-timeline-dot::before {
        content: "";
        position: absolute;
        left: 8px;
        top: 16px;
        bottom: -14px;
        width: 1px;
        background: #52525b;
      }

      .mc-timeline-item:last-child .mc-timeline-dot::before {
        display: none;
      }

      .mc-timeline-dot::after {
        content: "";
        position: absolute;
        left: 4px;
        top: 5px;
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #a1a1aa;
        box-shadow: 0 0 0 3px #3f3f46;
      }

      .mc-timeline-item[data-active="true"] .mc-timeline-dot::after {
        background: #2563eb;
        box-shadow: 0 0 0 3px rgb(37 99 235 / 0.18);
      }

      .mc-timeline-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        font-size: 11px;
        line-height: 15px;
        color: #a1a1aa;
      }

      .mc-timeline-index {
        min-width: 0;
        max-width: 88px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 0 1 auto;
        color: #e4e4e7;
        font-weight: 650;
      }

      .mc-timeline-time {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mc-timeline-preview {
        margin-top: 1px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        font-size: 12px;
        line-height: 16px;
        color: #f4f4f5;
        word-break: break-word;
      }

      .mc-comment-highlight {
        background-color: #1A1E25 !important;
        transition: background-color 180ms ease !important;
      }

      /* Selection toolbar mirroring the native Multica bubble menu
         (measured: bg oklch(0.235)=#262628, border white/10%, radius 10px,
         padding 4px, gap 1px, buttons 28x28 radius 8px, icons 14px white). */
      #mc-selection-toolbar {
        position: fixed;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 1px;
        padding: 4px;
        border-radius: 10px;
        background: #262628;
        border: 1px solid rgb(250 250 250 / 0.1);
        box-shadow: 0 4px 12px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(0 0 0 / 0.04);
        pointer-events: auto;
      }

      #mc-selection-toolbar[hidden] {
        display: none;
      }

      #mc-selection-toolbar button {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        padding: 0;
      }

      #mc-selection-toolbar button:hover {
        background: rgb(250 250 250 / 0.1);
      }

      #mc-selection-toolbar button svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 2;
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

      /* Author display rules override the UA [hidden] default, so hide explicitly. */
      .mc-tools-btn[hidden],
      .mc-mark-card[hidden] {
        display: none;
      }

      .mc-mark-popover {
        /* Fit content up to a cap; short quotes no longer stretch to full width. */
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
        /* The popover is max-content sized; the textarea's intrinsic cols
           width would otherwise dominate it. Track the quote width instead. */
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
        /* Full-viewport origin so absolute children map 1:1 to viewport coords. */
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
        width: 200px;
        /* Right padding leaves room for the hover action buttons. */
        padding: 5px 44px 5px 8px;
        border: 1px solid #3f3f46;
        border-radius: 8px;
        background: #18181B;
        color: #f4f4f5;
        font-size: 11px;
        line-height: 16px;
        box-shadow: 0 10px 30px rgb(15 23 42 / 0.2);
        cursor: default;
      }

      .mc-mark-card .mc-mark-card-note {
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        word-break: break-word;
      }

      .mc-mark-card-actions {
        position: absolute;
        right: 6px;
        /* Vertically centered on the first text line (16px line-height). */
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 120ms ease;
      }

      .mc-mark-card:hover .mc-mark-card-actions,
      .mc-mark-card:focus-within .mc-mark-card-actions {
        opacity: 1;
      }

      .mc-mark-card-btn {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 5px;
        background: #27272a;
        color: #e4e4e7;
        cursor: pointer;
        padding: 0;
      }

      .mc-mark-card-btn:hover {
        background: #3f3f46;
      }

      .mc-mark-card-btn svg {
        width: 11px;
        height: 11px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .mc-mark-send-btn {
        position: absolute;
        right: -30px;
        bottom: 0;
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #27272a;
        border-radius: 999px;
        background: #18181B;
        color: #e4e4e7;
        cursor: pointer;
      }

      .mc-mark-send-btn:hover {
        background: #27272a;
      }

      .mc-mark-send-btn svg {
        width: 13px;
        height: 13px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      #mc-toast {
        position: fixed;
        left: 50%;
        bottom: 34px;
        transform: translateX(-50%) translateY(8px);
        z-index: 12;
        padding: 8px 14px;
        border: 1px solid #27272a;
        border-radius: 8px;
        background: #18181B;
        color: #f4f4f5;
        font-family: var(--font-inter);
        font-size: 12px;
        opacity: 0;
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: none;
      }

      #mc-toast[data-show] {
        opacity: 1;
        transform: translateX(-50%);
      }

      mark.mc-mark {
        background-color: rgb(250 204 21 / 0.5);
        color: inherit;
      }

      mark.mc-mark.mc-mark-choice {
        background-color: rgb(74 222 128 / 0.45);
      }

      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} {
          color: #e5e7eb;
        }

        .mc-tools-btn,
        .mc-timeline {
          border-color: #27272a;
          background: #18181B;
          box-shadow: 0 12px 36px rgb(0 0 0 / 0.36);
        }

        .mc-tools-btn {
          color: #e2e8f0;
        }

        .mc-tools-btn:hover,
        .mc-timeline-toggle:hover,
        .mc-timeline-item:hover,
        .mc-timeline-item[data-active="true"] {
          background: #27272a;
        }

        .mc-timeline-head {
          border-bottom-color: #27272a;
        }

        .mc-timeline-title,
        .mc-timeline-index,
        .mc-timeline-preview {
          color: #e2e8f0;
        }

        .mc-timeline-count,
        .mc-timeline-toggle,
        .mc-timeline-meta,
        .mc-timeline-time {
          color: #94a3b8;
        }

        .mc-timeline-dot::before {
          background: #475569;
        }

        .mc-timeline-dot::after {
          background: #94a3b8;
          box-shadow: 0 0 0 3px #334155;
        }
      }

      @media (max-width: 720px) {
        .mc-tools-btn {
          right: 8px;
        }

        .mc-scroll-bottom-btn {
          bottom: 76px;
        }

        .mc-timeline-trigger {
          bottom: 124px;
        }

        .mc-mark-send {
          bottom: 172px;
        }

        .mc-timeline {
          right: 56px;
          bottom: 76px;
          width: min(220px, calc(100vw - 72px));
          max-height: 42vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    if (document.getElementById(ROOT_ID)) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.hidden = true;

    timelinePanel = document.createElement("section");
    timelinePanel.className = "mc-timeline";
    timelinePanel.setAttribute("aria-label", "评论时间线");
    timelinePanel.hidden = true;

    const head = document.createElement("div");
    head.className = "mc-timeline-head";

    const title = document.createElement("div");
    title.className = "mc-timeline-title";
    title.textContent = "评论时间线";

    countNode = document.createElement("span");
    countNode.className = "mc-timeline-count";
    countNode.textContent = "0";
    title.appendChild(document.createTextNode(" "));
    title.appendChild(countNode);

    const toggle = document.createElement("button");
    toggle.className = "mc-timeline-toggle";
    toggle.type = "button";
    toggle.title = "收起评论时间线";
    toggle.setAttribute("aria-label", "收起评论时间线");
    toggle.textContent = "×";
    toggle.addEventListener("click", () => {
      setTimelineCollapsed(true);
    });

    timelineList = document.createElement("div");
    timelineList.className = "mc-timeline-list";

    head.append(title, toggle);
    timelinePanel.append(head, timelineList);

    timelineButton = document.createElement("button");
    timelineButton.className = "mc-tools-btn mc-timeline-trigger";
    timelineButton.type = "button";
    timelineButton.hidden = true;
    timelineButton.title = "评论时间线";
    timelineButton.setAttribute("aria-label", "展开评论时间线");
    timelineButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>';
    timelineButton.addEventListener("click", () => {
      setTimelineCollapsed(!collapsed);
    });

    bottomButton = document.createElement("button");
    bottomButton.className = "mc-tools-btn mc-scroll-bottom-btn";
    bottomButton.type = "button";
    bottomButton.hidden = true;
    bottomButton.title = "滚动到底部";
    bottomButton.setAttribute("aria-label", "滚动到底部");
    bottomButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>';
    bottomButton.addEventListener("click", scrollToBottom);

    markCardsLayer = document.createElement("div");
    markCardsLayer.className = "mc-mark-cards";

    selectionToolbar = document.createElement("div");
    selectionToolbar.id = "mc-selection-toolbar";
    selectionToolbar.hidden = true;

    selectionBtn = document.createElement("button");
    selectionBtn.type = "button";
    selectionBtn.title = "标记选中文字";
    selectionBtn.setAttribute("aria-label", "标记选中文字");
    selectionBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
    selectionBtn.addEventListener("mousedown", (event) => event.preventDefault());
    selectionBtn.addEventListener("click", openMarkPopover);

    choiceBtn = document.createElement("button");
    choiceBtn.type = "button";
    choiceBtn.title = "选择这个方案";
    choiceBtn.setAttribute("aria-label", "选择这个方案");
    choiceBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25"></circle><path d="m8.4 12.2 2.4 2.4 4.8-5.2"></path></svg>';
    choiceBtn.addEventListener("mousedown", (event) => event.preventDefault());
    choiceBtn.addEventListener("click", commitChoiceMark);

    selectionToolbar.append(selectionBtn, choiceBtn);

    markPopover = document.createElement("div");
    markPopover.className = "mc-mark-popover";
    markPopover.hidden = true;
    const quotePreview = document.createElement("blockquote");
    quotePreview.className = "mc-mark-quote-preview";
    markPopoverInput = document.createElement("textarea");
    markPopoverInput.placeholder = "输入解释,⌘+回车发送标记…";
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

    toastNode = document.createElement("div");
    toastNode.id = "mc-toast";
    toastNode.setAttribute("role", "status");

    root.append(timelinePanel, timelineButton, bottomButton, markCardsLayer, selectionToolbar, markPopover, sendButton);
    document.body.appendChild(root);
    document.body.appendChild(toastNode);

    document.addEventListener("selectionchange", scheduleSelectionCheck);
    document.addEventListener("scroll", positionMarkOverlays, true);
    document.addEventListener("click", handleMarkClick, true);
    window.addEventListener("resize", positionMarkOverlays);
  }

  function scheduleRescan() {
    window.clearTimeout(rescanTimer);
    rescanTimer = window.setTimeout(rescan, RESCAN_DELAY_MS);
  }

  function rescan() {
    if (!timelineList) return;

    if (!isMarkablePage()) {
      resetIssueTools();
      return;
    }

    if (root) root.hidden = false;

    const pageKey = getIssueKeyFromUrl(location.href);
    if (pageKey !== marksPageKey) {
      marksPageKey = pageKey;
      clearMarks();
    }

    const comments = getCommentEntries();

    const hasComments = comments.length > 0;
    timelineButton.hidden = !hasComments;
    bottomButton.hidden = false;
    sendButton.hidden = marks.length === 0;
    timelinePanel.hidden = collapsed || !hasComments;
    countNode.textContent = String(comments.length);
    renderTimeline(comments);
    positionMarkOverlays();
  }

  function resetIssueTools() {
    if (root) root.hidden = true;
    if (timelineButton) timelineButton.hidden = true;
    if (bottomButton) bottomButton.hidden = true;
    if (timelinePanel) timelinePanel.hidden = true;
    if (timelineList) timelineList.replaceChildren();
    if (countNode) countNode.textContent = "0";
    activeCommentId = "";
    clearMarks();
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

  function setTimelineCollapsed(nextCollapsed) {
    collapsed = nextCollapsed;

    const hasComments = Number(countNode?.textContent || "0") > 0;
    if (timelinePanel) timelinePanel.hidden = collapsed || !hasComments;
    if (timelineButton) {
      timelineButton.dataset.active = String(!collapsed && hasComments);
      timelineButton.setAttribute("aria-label", collapsed ? "展开评论时间线" : "收起评论时间线");
      timelineButton.title = collapsed ? "评论时间线" : "收起评论时间线";
    }
  }

  function renderTimeline(comments) {
    const fragment = document.createDocumentFragment();

    comments.forEach((comment, index) => {
      const item = document.createElement("button");
      item.className = "mc-timeline-item";
      item.type = "button";
      item.dataset.commentId = comment.id;
      item.dataset.active = String(comment.id === activeCommentId);
      item.title = [comment.author, comment.time, comment.preview].filter(Boolean).join(" · ");
      item.setAttribute("aria-label", `定位到 ${comment.author || "评论"} ${comment.time || `#${index + 1}`}`);
      item.addEventListener("click", () => focusComment(comment.id));

      const dot = document.createElement("span");
      dot.className = "mc-timeline-dot";
      dot.setAttribute("aria-hidden", "true");

      const body = document.createElement("span");

      const meta = document.createElement("span");
      meta.className = "mc-timeline-meta";

      const actor = document.createElement("span");
      actor.className = "mc-timeline-index";
      actor.textContent = comment.author || `#${index + 1}`;

      const time = document.createElement("span");
      time.className = "mc-timeline-time";
      time.textContent = comment.time || `#${index + 1}`;

      const preview = document.createElement("span");
      preview.className = "mc-timeline-preview";
      preview.textContent = comment.preview || "无内容";

      meta.append(actor, time);
      body.append(meta, preview);
      item.append(dot, body);
      fragment.appendChild(item);
    });

    timelineList.replaceChildren(fragment);
  }

  function getCommentEntries() {
    const nodes = Array.from(document.querySelectorAll(`[id^="${COMMENT_ID_PREFIX}"]`))
      .filter(isValidCommentNode)
      .sort((a, b) => {
        const topDiff = a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        if (Math.abs(topDiff) > 1) return topDiff;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

    return nodes.map((node) => {
      const id = node.id.slice(COMMENT_ID_PREFIX.length);
      return {
        id,
        node,
        author: pickAuthor(node),
        time: pickTime(node),
        preview: pickPreview(node),
      };
    });
  }

  function isValidCommentNode(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.id || !node.id.startsWith(COMMENT_ID_PREFIX)) return false;
    if (node.closest(`#${ROOT_ID}`)) return false;
    if (!node.isConnected) return false;

    const rect = node.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) return false;
    if (getComputedStyle(node).display === "none") return false;

    const text = normalizeText(node.textContent);
    if (!text || text.length < 2) return false;

    return true;
  }

  function pickAuthor(node) {
    const preferred = Array.from(
      node.querySelectorAll('[class*="cursor-pointer"][class*="font-medium"], [class*="text-sm"][class*="font-medium"]')
    )
      .map((el) => normalizeText(el.textContent))
      .find((text) => text && text.length <= 48 && !looksLikeTime(text) && !looksLikeAction(text));

    if (preferred) return preferred;

    const candidates = Array.from(node.querySelectorAll("span, button, a"))
      .map((el) => normalizeText(el.textContent))
      .filter((text) => text && text.length <= 48 && !looksLikeTime(text) && !looksLikeAction(text));

    return candidates[0] || "";
  }

  function pickTime(node) {
    const timeEl = node.querySelector("time[datetime]");
    if (timeEl) {
      return normalizeText(timeEl.textContent) || timeEl.getAttribute("datetime") || "";
    }

    const candidates = Array.from(node.querySelectorAll("span, div, button"))
      .map((el) => normalizeText(el.textContent))
      .filter((text) => text && text.length <= 64 && looksLikeTime(text));

    return candidates[0] || "";
  }

  function pickPreview(node) {
    const contentNode =
      findCommentBodyNode(node) ||
      node.querySelector("p");

    const raw = normalizeText(contentNode?.textContent || node.textContent);
    const withoutActions = raw
      .replace(/\b(Copy|Edit|Delete|Resolve|Unresolve|Reply|Save|Cancel)\b/gi, " ")
      .replace(/\b(复制|编辑|删除|回复|保存|取消|解决|取消解决)\b/g, " ");

    return stripCommentChrome(withoutActions, pickAuthor(node), pickTime(node)).slice(0, 120);
  }

  function findCommentBodyNode(node) {
    const candidates = Array.from(node.querySelectorAll('[class*="leading-relaxed"], [class*="prose"]')).filter(
      (el) => {
        const text = normalizeText(el.textContent);
        if (!text || text.length < 2) return false;

        const rect = el.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        if (rect.top - nodeRect.top < 28) return false;

        return !looksLikeHeaderText(text);
      }
    );

    return candidates.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || null;
  }

  function stripCommentChrome(text, author, time) {
    let result = normalizeText(text);
    for (const value of [author, time]) {
      if (value) result = result.replace(new RegExp(`^${escapeRegExp(value)}\\s*`), "");
    }
    result = result.replace(/^#\d+\s*/, "");
    return normalizeText(result);
  }

  function looksLikeHeaderText(text) {
    const normalized = normalizeText(text);
    return normalized.length <= 80 && looksLikeTime(normalized);
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function focusComment(commentId) {
    const node = document.getElementById(`${COMMENT_ID_PREFIX}${commentId}`);
    if (!node) return;

    activeCommentId = commentId;
    updateActiveTimelineItem();

    const scrollContainer = findScrollContainer(node);
    scrollElementIntoContainer(node, scrollContainer);

    node.classList.add("mc-comment-highlight");
    window.setTimeout(() => {
      node.classList.remove("mc-comment-highlight");
    }, HIGHLIGHT_MS);
  }

  function updateActiveTimelineItem() {
    if (!timelineList) return;

    timelineList.querySelectorAll(".mc-timeline-item").forEach((item) => {
      item.dataset.active = String(item.dataset.commentId === activeCommentId);
    });
  }

  function scrollToBottom() {
    const comments = getCommentEntries();
    const lastComment = comments.at(-1)?.node || null;
    const container = lastComment ? findScrollContainer(lastComment) : findBestScrollable();

    if (container && container !== document.scrollingElement && container !== document.documentElement) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }

    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }

  function scrollElementIntoContainer(node, container) {
    if (!container || container === document.scrollingElement || container === document.documentElement) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const target =
      container.scrollTop +
      (nodeRect.top - containerRect.top) -
      Math.max(0, (container.clientHeight - nodeRect.height) / 2);

    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }

  function findScrollContainer(node) {
    let current = node.parentElement;
    while (current && current !== document.body) {
      if (isScrollable(current)) return current;
      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function findBestScrollable() {
    const scrollables = Array.from(document.querySelectorAll("body *"))
      .filter((el) => el instanceof HTMLElement && !el.closest(`#${ROOT_ID}`) && isScrollable(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const commentCount = el.querySelectorAll(`[id^="${COMMENT_ID_PREFIX}"]`).length;
        return {
          el,
          score:
            commentCount * 10000 +
            Math.max(0, rect.width) +
            Math.max(0, rect.height) +
            Math.max(0, rect.left),
        };
      })
      .sort((a, b) => b.score - a.score);

    return scrollables[0]?.el || document.scrollingElement || document.documentElement;
  }

  function isScrollable(el) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
    return el.scrollHeight > el.clientHeight + 24;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeTime(text) {
    return /(^|\b)(just now|now|\d+\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|yr|year|years)\b|today|yesterday|刚刚|\d+\s*(秒|分钟|小时|天|周|个月|年)前|今天|昨天|前天|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}:\d{2}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i.test(
      text
    );
  }

  function looksLikeAction(text) {
    return /^(copy|edit|delete|resolve|unresolve|reply|save|cancel|more|复制|编辑|删除|回复|保存|取消|更多|解决|取消解决)$/i.test(
      text
    );
  }

  function hideSelectionButtons() {
    if (selectionToolbar) selectionToolbar.hidden = true;
    if (selectionBtn) selectionBtn.hidden = true;
    if (choiceBtn) choiceBtn.hidden = true;
  }

  function scheduleSelectionCheck() {
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
    selectionToolbar.hidden = false;
    // The pair is laid out as one unit: selection first, choice beside it.
    // Clamping each button independently lets them collide when a full-line
    // selection pushes both against the viewport edge.
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
    if (holder.closest("input, textarea, [contenteditable]")) return null;

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

    if (!lastSelection) {
      // The selection was cleared (e.g. by the button click); restore it.
      const selection = document.getSelection();
      const pick = pickSelectableRange(selection);
      if (!pick) {
        selectionBtn.hidden = true;
        return;
      }
      lastSelection = pick;
    }

    // Highlight immediately on click; the note is edited afterwards.
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
    // The selectionchange from clearing the selection arrives after this and
    // updateSelectionButton bails while the popover is open, so hide now.
    hideSelectionButtons();
    // Wait for layout before positioning so offsetHeight is accurate.
    requestAnimationFrame(() => {
      positionMarkPopover();
      markPopoverInput.focus();
      markPopoverInput.select();
    });
  }

  function positionMarkPopover() {
    if (!pendingMark?.node?.isConnected) return;
    const rect = pendingMark.node.getBoundingClientRect();
    const width = Math.min(680, window.innerWidth - 32);
    const anchorLeft = rect.left + rect.width / 2;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, anchorLeft - width / 2)
    );
    // centerTop: horizontally centered on the highlight, popover above it.
    markPopover.style.left = `${Math.round(left)}px`;
    markPopover.style.top = `${Math.max(8, Math.round(rect.top) - markPopover.offsetHeight - 10)}px`;
  }

  function handlePopoverDismiss(event) {
    if (markPopover.hidden || !pendingMark) return;
    if (event.target instanceof Node && event.target.closest(markPopover)) return;
    if (event.target === selectionBtn) return;
    cancelPendingMark();
  }

  function cancelPendingMark() {
    if (!pendingMark) return;
    // A never-noted mark is discarded; an existing one only closes the editor.
    if (!pendingMark.note) removeMark(pendingMark);
    pendingMark = null;
    markPopover.hidden = true;
    hideSelectionButtons();
  }

  function commitPendingMark() {
    if (!pendingMark) return;
    const note = markPopoverInput.value.trim();
    if (!note) {
      // Empty note deletes the highlight instead of keeping a bare mark.
      cancelPendingMark();
      return;
    }

    pendingMark.note = note;
    renderMarkCard(pendingMark);
    pendingMark = null;
    markPopover.hidden = true;
    hideSelectionButtons();
    positionMarkCards();
  }

  function commitChoiceMark() {
    if (pendingMark) return;
    if (!lastSelection) {
      const selection = document.getSelection();
      const pick = pickSelectableRange(selection);
      if (!pick) {
        hideSelectionButtons();
        return;
      }
      lastSelection = pick;
    }

    const mark = createMark(lastSelection, CHOICE_NOTE);
    lastSelection = null;
    if (!mark) return;
    mark.node.classList.add("mc-mark-choice");
    document.getSelection()?.removeAllRanges();
    hideSelectionButtons();
    renderMarkCard(mark);
  }

  function removeMark(mark) {
    if (mark.node instanceof Element && mark.node.isConnected) unwrapMarkNode(mark.node);
    mark.card?.remove();
    const index = marks.indexOf(mark);
    if (index >= 0) marks.splice(index, 1);
    if (sendButton) sendButton.hidden = marks.length === 0;
  }

  function createMark(pick, note) {
    const range = pick.range;
    if (
      !(range.startContainer instanceof Node) || !range.startContainer.isConnected ||
      !(range.endContainer instanceof Node) || !range.endContainer.isConnected
    ) {
      showToast("页面内容已变化,标记失败");
      return null;
    }

    // extractContents + insert handles selections that cross element boundaries.
    const wrapper = makeMarkWrapper();
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    } catch (_error) {
      showToast("标记插入失败");
      return null;
    }

    markSeq += 1;
    const mark = {
      id: `mc-mark-${markSeq}`,
      note,
      quote: pick.text,
      node: wrapper,
    };
    marks.push(mark);
    if (sendButton) sendButton.hidden = false;

    return mark;
  }

  function makeMarkWrapper() {
    const wrapper = document.createElement("mark");
    wrapper.className = MARK_CLASS;
    wrapper.title = "点击编辑标记";
    return wrapper;
  }

  function handleMarkClick(event) {
    if (pendingMark) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const node = target.closest(`mark.${MARK_CLASS}`);
    if (!node || isUiNode(node)) return;
    const mark = marks.find((entry) => entry.node === node);
    if (!mark) return;

    event.preventDefault();
    event.stopPropagation();
    pendingMark = mark;
    openMarkEditor(mark);
  }

  function renderMarkCard(mark) {
    if (!markCardsLayer) return;
    // Re-committing an edited mark replaces its card instead of stacking one.
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
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (action === "edit") {
        if (pendingMark && pendingMark !== mark) cancelPendingMark();
        pendingMark = mark;
        openMarkEditor(mark);
      } else {
        removeMark(mark);
      }
    });
    return button;
  }

  function positionMarkOverlays() {
    if (markPopover && !markPopover.hidden && pendingMark) {
      positionMarkPopover();
    }
    positionMarkCards();
  }

  function positionMarkCards() {
    if (!markCardsLayer) return;
    for (const mark of marks) {
      if (!mark.card) continue;
      mark.card.hidden = !mark.node.isConnected;
      if (!mark.node.isConnected) continue;
      const rect = mark.node.getBoundingClientRect();
      mark.card.style.left = `${Math.round(
        Math.max(8, Math.min(window.innerWidth - 208, rect.left + rect.width / 2 - 100))
      )}px`;
      mark.card.style.top = `${Math.round(Math.max(8, rect.top - mark.card.offsetHeight - 8))}px`;
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
      if (mark.node instanceof Element && mark.node.isConnected) unwrapMarkNode(mark.node);
      mark.card?.remove();
    }
    marks = [];
    pendingMark = null;
    if (markCardsLayer) markCardsLayer.replaceChildren();
    if (markPopover) markPopover.hidden = true;
    hideSelectionButtons();
    if (sendButton) sendButton.hidden = true;
  }

  function unwrapMarkNode(node) {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
    parent.normalize();
  }

  function buildMarkComment(entries) {
    return entries
      .map((entry) => `> ${entry.quote}\n${entry.note}`)
      .join("\n\n---\n\n");
  }

  function buildMarkCommentMarkdown() {
    return buildMarkComment(marks);
  }

  // The comments API takes the issue UUID. The URL carries it directly when
  // the page was opened from a list link (/issues/<uuid>) but rewrites to the
  // human key (SCI-575) after redirect, so fall back to the UUID from the
  // page's own most recent /api/issues/<uuid> call.
  function findIssueUuid() {
    const fromUrl = location.pathname.match(/\/issues\/([0-9a-f-]{36})/);
    if (fromUrl) return fromUrl[1];

    let latest = "";
    for (const entry of performance.getEntriesByType("resource")) {
      const match = entry.name.match(/api\/issues\/([0-9a-f-]{36})/);
      if (match) latest = match[1];
    }
    return latest;
  }

  // Chat pages send through the session messages API instead.
  function findChatSessionId() {
    const fromUrl = new URLSearchParams(location.search).get("session");
    if (fromUrl && /^[0-9a-f-]{36}$/.test(fromUrl)) return fromUrl;
    for (const entry of performance.getEntriesByType("resource")) {
      const match = entry.name.match(/chat\/sessions\/([0-9a-f-]{36})/);
      if (match) return match[1];
    }
    return "";
  }

  // The API needs the CSRF token from the multica_csrf cookie plus the client
  // headers the web app sends. The token must be sliced by the cookie name's
  // exact length — off by one and the server answers 403 CSRF validation.
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
    const chatSessionId = findChatSessionId();
    let url;
    let body;
    if (chatSessionId) {
      url = `https://api.multica.ai/api/chat/sessions/${chatSessionId}/messages`;
      body = { content };
    } else {
      const issueId = findIssueUuid();
      if (!issueId) {
        try {
          await navigator.clipboard.writeText(content);
          showToast("未找到任务 ID,内容已复制到剪贴板");
        } catch (_error) {
          showToast("未找到任务 ID,且复制失败");
        }
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
      showToast(chatSessionId ? "消息已发送" : "评论已发送");
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
