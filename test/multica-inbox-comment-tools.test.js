const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("multica-inbox-comment-tools.user.js", "utf8");

test("quote preview and input are wired into the mark popover", () => {
  assert.match(source, /mc-mark-quote-preview/);
  assert.match(source, /markPopover\.append\(quotePreview, markPopoverInput\)/);
  assert.match(source, /positionMarkPopover\(\);\s*\n\s*markPopoverInput\.focus\(\)/);
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
    "> 这里有个问题\n建议改为异步加载\n\n---\n\n> 另一处\n需要补充测试"
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

test("clicking an existing highlight reopens the note editor", () => {
  assert.match(source, /target\.closest\(`mark\.\$\{MARK_CLASS\}`\)/);
  assert.match(source, /pendingMark = mark;\s*\n\s*openMarkEditor\(mark\)/);
});

test("sending drives the page comment composer", () => {
  assert.match(source, /findCommentComposer\(\)/);
  assert.match(source, /fillComposer\(composer, markdown\)/);
  assert.match(source, /submitComposer\(composer\)/);
  assert.match(source, /if \(submitted\) clearMarks\(\)/);
});

test("opening the mark editor hides the selection buttons", () => {
  assert.match(source, /markPopover\.hidden = false;\s*\n\s*\/\/ The selectionchange[\s\S]*?hideSelectionButtons\(\);/);
});

test("hover cards expose edit and delete actions", () => {
  assert.match(source, /createCardAction\("edit", mark\), createCardAction\("delete", mark\)/);
  assert.match(source, /\.mc-mark-card:hover \.mc-mark-card-actions/);
  assert.match(source, /\.mc-mark-card:focus-within \.mc-mark-card-actions/);
});

test("cards show only the note, dark-themed, z-index 1, no orange", () => {
  assert.doesNotMatch(source, /mc-mark-card-quote/);
  assert.match(source, /\.mc-mark-card \.mc-mark-card-note/);
  assert.match(source, /\.mc-mark-card \{[^}]*background:\s*#18181B/s);
  assert.match(source, /z-index:\s*11;/);
  assert.doesNotMatch(source, /z-index:\s*21474836/);
  // No orange accent anywhere in the mark UI.
  assert.doesNotMatch(source, /d97706/);
});

test("choice marks commit instantly with a preset note and green highlight", () => {
  assert.match(source, /const CHOICE_NOTE = "✅ 选择这个方案"/);
  assert.match(source, /createMark\(lastSelection, CHOICE_NOTE\)/);
  assert.match(source, /classList\.add\("mc-mark-choice"\)/);
  assert.match(source, /\.mc-mark-choice\s*\{/);
});

test("the choice button sits next to the mark button on selection", () => {
  assert.match(source, /id = "mc-choice-btn"/);
  // The pair is laid out relative to the mark button so the two can never
  // collide when clamped against the viewport edge.
  assert.match(source, /const selectionLeft = Math\.max\(8, Math\.min\(window\.innerWidth - 38, rect\.right - 15\)\)/);
  assert.match(source, /rightLeft \+ 30 <= window\.innerWidth - 8[\s\S]*?choiceBtn\.style\.left = `\$\{rightLeft\}px`/);
  assert.match(source, /#mc-choice-btn\[hidden\][\s\S]*?display:\s*none/);
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
  assert.match(source, /holder\.closest\("input, textarea, \[contenteditable\]"\)/);
});

test("hidden buttons stay hidden despite author display rules", () => {
  assert.match(source, /\.mc-tools-btn\[hidden\][\s\S]*?display:\s*none/);
  assert.match(source, /#mc-selection-btn\[hidden\][\s\S]*?display:\s*none/);
});
