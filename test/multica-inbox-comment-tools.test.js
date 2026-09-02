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

function makeFakeLayer() {
  return {
    children: [],
    replaceChildren(...kids) {
      this.children = kids;
    },
    appendChild(child) {
      this.children.push(child);
    },
  };
}

const fakeDocument = {
  createElement: () => ({
    style: {},
    dataset: {},
    append() {},
    appendChild(child) {
      return child;
    },
    addEventListener() {},
  }),
};

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
    "> 这里有个问题\n\n建议改为异步加载\n\n\n> 另一处\n\n需要补充测试"
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
  assert.match(source, /if \(!note\) \{\s*\n\s*removeMark\(pendingMark\);/);
});

test("deleting a mark detaches its range before repainting highlights", () => {
  assert.match(source, /function removeMark\(mark\)/);
  assert.match(source, /mark\.range\?\.detach\?\.\(\)/);
  assert.match(source, /renderMarkHighlights\(\)/);
});

test("highlights paint via an own overlay layer and relocate", () => {
  assert.match(source, /function renderMarkHighlights\(\)/);
  assert.match(source, /markHighlightLayer\.replaceChildren\(\.\.\.boxes\)/);
  assert.doesNotMatch(source, /CSS\.highlights/);
  assert.match(source, /function relocateMark\(mark\)/);
  assert.match(source, /function buildAnchor\(range, quote\)/);
});

test("sending posts to the API with cookie CSRF and chat-aware query", () => {
  assert.match(source, /function buildCommentHeaders\(\)/);
  assert.match(source, /headers\["X-CSRF-Token"\] = csrf/);
  assert.match(source, /isChat/);
  assert.match(source, /api\/issues\/\$\{issueId\}\/comments/);
  assert.match(source, /api\/chat\/sessions\/\$\{chatSessionId\}\/messages/);
});

test("opening the mark editor hides the selection buttons", () => {
  assert.match(source, /markPopover\.hidden = false;\s*\n\s*markPopoverPlaced = false;\s*\n\s*hideSelectionButtons\(\);/);
});

test("opening a new mark editor anchors the popover to the selection toolbar", () => {
  assert.match(source, /selectionToolbar\.getBoundingClientRect\(\)/);
  assert.match(source, /markPopoverAnchor/);
  assert.match(source, /if \(markPopoverAnchor\)/);
});

test("hover cards expose edit and delete actions", () => {
  assert.match(source, /mc-mark-card-actions/);
  assert.match(source, /createCardAction\("delete", mark\)/);
  assert.match(source, /createCardAction\("edit", mark\)/);
});

test("cards show only the note, dark-themed, z-index 100, no orange", () => {
  assert.doesNotMatch(source, /mc-mark-card-quote/);
  assert.match(source, /\.mc-mark-card-note/);
  assert.match(source, /\.mc-mark-card \{[^}]*background:\s*#18181b/si);
  assert.match(source, /z-index:\s*100;/);
});

test("choice marks commit instantly with a preset note and green highlight", () => {
  assert.match(source, /const CHOICE_NOTE = "✅ 选择这个方案"/);
  assert.match(source, /createMark\(lastSelection, CHOICE_NOTE, true\)/);
  assert.match(source, /function createMark\(pick, note, choice = false\)/);
  assert.match(source, /\.mc-mark-highlight\[data-choice="true"\]/);
});

test("the choice button sits next to the mark button on selection centered above", () => {
  assert.match(source, /choiceBtn = document\.createElement\("button"\)/);
  assert.match(source, /selectionToolbar\.append\(selectionBtn, choiceBtn\)/);
  assert.match(source, /selectionBtn\.hidden = false;\s*\n\s*choiceBtn\.hidden = false;\s*\n\s*selectionToolbar\.hidden = false;/);
  assert.match(source, /id = "mc-selection-toolbar"/);
  assert.match(source, /const centerX = \(rect\.left \+ rect\.right\) \/ 2;/);
  assert.match(source, /const left = Math\.max\(8, Math\.min\(window\.innerWidth - toolbarWidth - 8, centerX - toolbarWidth \/ 2\)\);/);
  assert.match(source, /selectionToolbar\.style\.left = `\$\{Math\.round\(left\)\}px`;/);
  assert.match(source, /selectionToolbar\.style\.top = `\$\{Math\.round\(top\)\}px`;/);
});

test("chat pages and issue pages are markable", () => {
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

test("selections inside inputs and own UI never trigger the mark button", () => {
  assert.match(source, /if \(isUiNode\(holder\) \|\| !isMarkablePage\(\)\) return null;/);
  assert.match(source, /holder\.closest\("input, textarea"\)/);
  assert.match(source, /\.is-editor-empty, \[data-placeholder\]/);
});

test("hidden buttons stay hidden despite author display rules", () => {
  assert.match(source, /\.mc-tools-btn\[hidden\]/);
  assert.match(source, /#mc-selection-toolbar\[hidden\]/);
});

test("right-side actions share one floating stack and collapse hidden items", () => {
  assert.match(source, /actionGroup\.className = "mc-actions"/);
  assert.match(source, /actionGroup\.append\(sendButton, bottomButton\)/);
  assert.match(source, /\.mc-actions\s*>\s*\.mc-tools-btn\s*\{/);
  assert.match(source, /display:\s*flex;/);
  assert.match(source, /gap:\s*8px;/);
});

test("zero MutationObserver and zero DOM polling loops in script", () => {
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /function isEditableOrInput\(/);
  assert.match(source, /if \(active && isEditableOrInput\(active\)\)/);
});
