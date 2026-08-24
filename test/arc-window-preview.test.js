const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

class TestAnchorElement {}

function loadPreviewScript() {
  const listeners = new Map();
  let nativeOpenCalls = 0;

  class Element {}

  const document = {
    documentElement: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const window = {
    open() {
      nativeOpenCalls += 1;
      return null;
    },
    addEventListener() {},
    clearTimeout() {},
  };
  window.window = window;

  const context = vm.createContext({
    document,
    Element,
    HTMLAnchorElement: TestAnchorElement,
    location: { href: "https://multica.ai/inbox" },
    URL,
    window,
  });
  vm.runInContext(fs.readFileSync("arc-window-preview.user.js", "utf8"), context);

  return {
    click(event) {
      for (const listener of listeners.get("click") || []) listener(event);
    },
    nativeOpenCalls() {
      return nativeOpenCalls;
    },
  };
}

function createClick(overrides = {}) {
  const anchor = Object.assign(new TestAnchorElement(), {
    href: overrides.href || "https://multica.ai/zlc-devteam/issues/SCI-1",
    hasAttribute(name) {
      return name === "download" && Boolean(overrides.download);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 20, height: 20 };
    },
  });
  return {
    altKey: false,
    button: 0,
    clientX: 10,
    clientY: 10,
    composedPath: () => [Object.assign(anchor, overrides.anchor)],
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    ...overrides.event,
  };
}

test("keeps a normal left-click navigation on its default path", () => {
  const preview = loadPreviewScript();
  const event = createClick();

  preview.click(event);

  assert.equal(event.defaultPrevented, undefined);
  assert.equal(event.immediatePropagationStopped, undefined);
  assert.equal(preview.nativeOpenCalls(), 0);
});

test("intercepts links that request a new browsing context", () => {
  for (const event of [
    createClick({ anchor: { target: "_blank" } }),
    createClick({ event: { metaKey: true } }),
    createClick({ event: { ctrlKey: true } }),
    createClick({ event: { shiftKey: true } }),
  ]) {
    const preview = loadPreviewScript();
    preview.click(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(preview.nativeOpenCalls(), 1);
  }
});

test("keeps explicit bypasses and non-page links on their default path", () => {
  for (const event of [
    createClick({ event: { altKey: true } }),
    createClick({ download: true }),
    createClick({ href: "mailto:hello@example.com" }),
    createClick({ event: { button: 2 } }),
  ]) {
    const preview = loadPreviewScript();
    preview.click(event);
    assert.equal(event.defaultPrevented, undefined);
    assert.equal(preview.nativeOpenCalls(), 0);
  }
});

test("keeps non-multica links on their default path", () => {
  for (const event of [
    createClick({ anchor: { target: "_blank" }, href: "https://example.com/page" }),
    createClick({ href: "https://github.com/tw93/Pake", event: { metaKey: true } }),
    createClick({ href: "https://evil-multica.ai/login", anchor: { target: "_blank" } }),
  ]) {
    const preview = loadPreviewScript();
    preview.click(event);
    assert.equal(event.defaultPrevented, undefined);
    assert.equal(preview.nativeOpenCalls(), 0);
  }
});

test("dragging disables transform animation and iframe hit testing", () => {
  const source = fs.readFileSync("arc-window-preview.user.js", "utf8");

  assert.match(source, /\.panel\.dragging\s*\{[^}]*transition:\s*none/s);
  assert.match(source, /\.panel\.dragging iframe\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(source, /dragFrame\s*=\s*requestAnimationFrame/);
});
