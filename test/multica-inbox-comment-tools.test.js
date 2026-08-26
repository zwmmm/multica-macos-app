const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("multica-inbox-comment-tools.user.js", "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function createHighlightRegistry() {
  const entries = new Map();
  return {
    entries,
    api: {
      delete: (name) => entries.delete(name),
      set: (name, highlight) => entries.set(name, highlight),
    },
  };
}

test("quote preview and input are wired into the mark popover", () => {
  assert.match(source, /mc-mark-quote-preview/);
  assert.match(source, /markPopover\.append\(quotePreview, markPopoverInput\)/);
  assert.match(source, /positionMarkPopover\(\);[\s\S]*?markPopoverInput\.focus\(\)/);
});

test("building the comment pairs each quote with its note", () => {
  const match = source.match(/function buildMarkComment\(entries\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "buildMarkComment should exist");

  const buildMarkComment = new Function("entries", match[1].replace(/^[\s\S]*?return /, "return "));
  const markdown = buildMarkComment([
    { quote: "这里有个问题", note: "建议改为异步加载" },
    { quote: "另一处", note: "需要补充测试" },
  ]);

  assert.equal(
    markdown,
    "- > 这里有个问题\n  建议改为异步加载\n\n- > 另一处\n  需要补充测试"
  );
});

test("popover textarea commits on Cmd/Ctrl+Enter", () => {
  assert.match(source, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(source, /commitPendingMark\(\)/);
});

test("highlight is created on icon click, before the note exists", () => {
  assert.match(source, /const mark = createMark\(lastSelection, ""\)/);
});

test("empty note deletes the highlight", () => {
  assert.match(source, /if \(!note\) \{\s*\n\s*\/\/ Empty note deletes the highlight[\s\S]*?cancelPendingMark\(\);/);
});

test("deleting a mark detaches its range before repainting highlights", () => {
  assert.match(source, /function removeMark\(mark\) \{[\s\S]*?mark\.range = null;[\s\S]*?mark\.anchor = null;[\s\S]*?applyHighlights\(\);/);
  assert.match(source, /CSS\.highlights\.set\("mc-mark", markHighlight\)/);
});

test("highlights paint via the CSS Custom Highlight API and relocate", () => {
  assert.match(source, /markHighlight = ranges\.length > 0 \? new Highlight\(\.\.\.ranges\) : null/);
  assert.match(source, /::highlight\(mc-mark\)/);
  assert.match(source, /function relocateMark\(mark\)/);
  assert.match(source, /function buildAnchor\(range, quote\)/);
  assert.doesNotMatch(source, /extractContents\(\)/);
});

test("sending posts to the API with cookie CSRF, chat-aware", () => {
  assert.match(source, /slice\("multica_csrf="\.length\)/);
  assert.match(source, /headers\["X-CSRF-Token"\] = csrf/);
  assert.match(source, /headers\["X-Workspace-Slug"\] = workspaceSlug/);
  assert.match(source, /function findChatSessionId\(\)/);
  assert.match(source, /chat\/sessions\/\$\{chatSessionId\}\/messages/);
  assert.match(source, /showToast\(chatSessionId \? "消息已发送" : "评论已发送"\);\s*\n\s*clearMarks\(\);/);
});

test("opening the mark editor hides the selection buttons", () => {
  assert.match(source, /markPopover\.hidden = false;\s*\n\s*\/\/ The selectionchange[\s\S]*?hideSelectionButtons\(\);/);
});

test("opening a new mark editor anchors the popover to the selection toolbar", () => {
  assert.match(source, /selectionToolbar\.getBoundingClientRect\(\)/);
  assert.match(source, /markPopoverAnchor/);
  assert.match(source, /if \(markPopoverAnchor\)/);
});

test("hover cards expose edit and delete actions", () => {
  assert.match(source, /createCardAction\("edit", mark\), createCardAction\("delete", mark\)/);
  assert.match(source, /\.mc-mark-card:hover \.mc-mark-card-actions/);
  assert.match(source, /\.mc-mark-card:focus-within \.mc-mark-card-actions/);
});

test("cards show only the note, dark-themed, z-index 100, no orange", () => {
  assert.doesNotMatch(source, /mc-mark-card-quote/);
  assert.match(source, /\.mc-mark-card \.mc-mark-card-note/);
  assert.match(source, /\.mc-mark-card \{[^}]*background:\s*#18181B/s);
  assert.match(source, /z-index:\s*100;/);
  assert.doesNotMatch(source, /z-index:\s*21474836/);
  // No orange accent anywhere in the mark UI.
  assert.doesNotMatch(source, /d97706/);
});

test("choice marks commit instantly with a preset note and green highlight", () => {
  assert.match(source, /const CHOICE_NOTE = "✅ 选择这个方案"/);
  assert.match(source, /createMark\(lastSelection, CHOICE_NOTE, true\)/);
  assert.match(source, /function createMark\(pick, note, choice = false\)/);
  assert.match(source, /::highlight\(mc-mark-choice\)/);
});

test("choice marks enter the green registry on their first paint", () => {
  class FakeNode {}
  class FakeHighlight {
    constructor(...ranges) {
      this.ranges = ranges;
    }
  }
  const registry = createHighlightRegistry();
  const range = {
    startContainer: Object.assign(new FakeNode(), { isConnected: true }),
    endContainer: Object.assign(new FakeNode(), { isConnected: true }),
  };
  const run = new Function(
    "Node",
    "Highlight",
    "CSS",
    "range",
    `
      let marks = [];
      let markSeq = 0;
      let markHighlight = null;
      let choiceHighlight = null;
      let sendButton = null;
      let pendingMark = null;
      let lastSelection = { range, text: "方案 A" };
      const CHOICE_NOTE = "选择这个方案";
      const document = { getSelection: () => ({ removeAllRanges() {} }) };
      const buildAnchor = () => null;
      const showToast = () => {};
      const hideSelectionButtons = () => {};
      const renderMarkCard = () => {};
      const relocateMark = () => false;
      ${extractFunction("applyHighlights")}
      ${extractFunction("createMark")}
      ${extractFunction("commitChoiceMark")}
      commitChoiceMark();
    `
  );

  run(FakeNode, FakeHighlight, { highlights: registry.api }, range);
  assert.deepEqual(registry.entries.get("mc-mark")?.ranges ?? [], []);
  assert.deepEqual(registry.entries.get("mc-mark-choice")?.ranges ?? [], [range]);
});

test("deleting the last mark removes its highlight registry entries", () => {
  class FakeHighlight {
    constructor(...ranges) {
      this.ranges = ranges;
    }
  }
  const registry = createHighlightRegistry();
  const mark = {
    anchor: { quote: "方案 A" },
    card: { remove() {} },
    choice: false,
    range: { startContainer: { isConnected: true } },
  };
  registry.entries.set("mc-mark", new FakeHighlight(mark.range));
  const run = new Function(
    "Highlight",
    "CSS",
    "mark",
    `
      let marks = [mark];
      let markHighlight = null;
      let choiceHighlight = null;
      let sendButton = null;
      const relocateMark = () => false;
      ${extractFunction("applyHighlights")}
      ${extractFunction("removeMark")}
      removeMark(mark);
    `
  );

  run(FakeHighlight, { highlights: registry.api }, mark);
  assert.equal(registry.entries.has("mc-mark"), false);
  assert.equal(registry.entries.has("mc-mark-choice"), false);
  assert.equal(mark.range, null);
  assert.equal(mark.anchor, null);
});

test("the choice button sits next to the mark button on selection", () => {
  assert.match(source, /choiceBtn = document\.createElement\("button"\)/);
  assert.match(source, /selectionToolbar\.append\(selectionBtn, choiceBtn\)/);
  assert.match(source, /selectionBtn\.hidden = false;\s*\n\s*choiceBtn\.hidden = false;\s*\n\s*selectionToolbar\.hidden = false;/);
  assert.match(source, /id = "mc-selection-toolbar"/);
  // The toolbar is laid out relative to the selection.
  assert.match(source, /const selectionLeft = Math\.max\(8, Math\.min\(window\.innerWidth - 38, rect\.right - 15\)\)/);
  assert.match(source, /selectionToolbar\.style\.left = `\$\{selectionLeft\}px`/);
  assert.match(source, /#mc-selection-toolbar\[hidden\][\s\S]*?display:\s*none/);
});

test("chat pages are markable", () => {
  const match = source.match(/function getIssueKeyFromUrl\(url\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "getIssueKeyFromUrl should exist");

  const body = match[1]
    .replace(/location\.origin/g, '"https://multica.ai"')
    .replace(/^[\s\S]*?try\s*\{/, "try {")
    .replace(/\}\s*catch[\s\S]*$/, '} catch (_error) { return ""; }');
  const fn = new Function("url", "URL", body);

  assert.equal(
    fn("https://multica.ai/zlc-devteam/chat?session=01a02f24-5632-7245-b3ab-13bf80f21ecb", URL),
    "chat:01a02f24-5632-7245-b3ab-13bf80f21ecb"
  );
  assert.equal(fn("https://multica.ai/zlc-devteam/inbox?issue=ABC-1", URL), "ABC-1");
  assert.equal(fn("https://multica.ai/zlc-devteam/inbox", URL), "");
});

test("leaving the issue page clears marks", () => {
  assert.match(source, /activeCommentId = "";\s*\n\s*clearMarks\(\)/);
});

test("selections inside inputs and own UI never trigger the mark button", () => {
  assert.match(source, /if \(isUiNode\(holder\) \|\| !isMarkablePage\(\)\) return null;/);
  assert.match(source, /holder\.closest\("input, textarea"\)/);
  // Read-only ProseMirror previews stay markable; real editors carry a
  // placeholder and are excluded.
  assert.match(source, /\.is-editor-empty, \[data-placeholder\]/);
});

test("hidden buttons stay hidden despite author display rules", () => {
  assert.match(source, /\.mc-tools-btn\[hidden\][\s\S]*?display:\s*none/);
  assert.match(source, /#mc-selection-toolbar\[hidden\][\s\S]*?display:\s*none/);
});

test("right-side actions share one floating stack and collapse hidden items", () => {
  assert.match(source, /actionGroup\.className = "mc-actions"/);
  assert.match(source, /actionGroup\.append\(sendButton, timelineButton, bottomButton\)/);
  assert.match(source, /\.mc-actions\s*>\s*\.mc-tools-btn\s*\{/);
  assert.match(source, /display:\s*flex;/);
  assert.match(source, /gap:\s*8px;/);
});
