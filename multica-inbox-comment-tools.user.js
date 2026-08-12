// Pake inject script for https://multica.ai/.
// Adapted from the Multica++ userscript: it uses standard DOM APIs and needs no userscript runtime.

(function () {
  "use strict";

  const ROOT_ID = "mc-comment-tools";
  const STYLE_ID = "mc-comment-tools-style";
  const COMMENT_ID_PREFIX = "comment-";
  const RESCAN_DELAY_MS = 180;
  const HIGHLIGHT_MS = 2200;

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

    root.append(timelinePanel, timelineButton, bottomButton);
    document.body.appendChild(root);
  }

  function scheduleRescan() {
    window.clearTimeout(rescanTimer);
    rescanTimer = window.setTimeout(rescan, RESCAN_DELAY_MS);
  }

  function rescan() {
    if (!timelineList) return;

    if (!isIssueDetailPage()) {
      resetIssueTools();
      return;
    }

    if (root) root.hidden = false;

    const comments = getCommentEntries();

    const hasComments = comments.length > 0;
    timelineButton.hidden = !hasComments;
    bottomButton.hidden = false;
    timelinePanel.hidden = collapsed || !hasComments;
    countNode.textContent = String(comments.length);
    renderTimeline(comments);
  }

  function resetIssueTools() {
    if (root) root.hidden = true;
    if (timelineButton) timelineButton.hidden = true;
    if (bottomButton) bottomButton.hidden = true;
    if (timelinePanel) timelinePanel.hidden = true;
    if (timelineList) timelineList.replaceChildren();
    if (countNode) countNode.textContent = "0";
    activeCommentId = "";
  }

  function isIssueDetailPage() {
    return isIssueDetailUrl(location.href);
  }

  function isIssueDetailUrl(url) {
    return Boolean(getIssueKeyFromUrl(url));
  }

  function getIssueKeyFromUrl(url) {
    try {
      const parsedUrl = new URL(url, location.origin);
      const pathIssueKey = parsedUrl.pathname.match(/\/issues\/([^/?#]+)/)?.[1] || "";
      return parsedUrl.searchParams.get("issue")?.trim() || pathIssueKey;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
