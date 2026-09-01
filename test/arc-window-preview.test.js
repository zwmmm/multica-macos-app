const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

class TestAnchorElement {}

function loadPreviewScript(options = {}) {
  const listeners = new Map();
  let nativeOpenCalls = 0;
  const lastNativeOpenArgs = [];
  const shellOpenCalls = [];
  const invokeCalls = [];

  class Element {}

  const document = {
    documentElement: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const window = {
    open(...args) {
      nativeOpenCalls += 1;
      lastNativeOpenArgs.push(args);
      return null;
    },
    addEventListener() {},
    clearTimeout() {},
  };
  window.window = window;

  if (options.withTauriShell) {
    window.__TAURI__ = {
      shell: {
        open: async (url) => {
          shellOpenCalls.push(url);
        },
      },
    };
  }

  if (options.withTauriInvoke) {
    window.__TAURI_INVOKE__ = (cmd, args) => {
      invokeCalls.push({ cmd, args });
    };
  }

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
    auxclick(event) {
      for (const listener of listeners.get("auxclick") || []) listener(event);
    },
    mousedown(event) {
      for (const listener of listeners.get("mousedown") || []) listener(event);
    },
    nativeOpenCalls() {
      return nativeOpenCalls;
    },
    lastNativeOpenArgs() {
      return lastNativeOpenArgs;
    },
    shellOpenCalls() {
      return shellOpenCalls;
    },
    invokeCalls() {
      return invokeCalls;
    },
    windowOpen: window.open,
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

test("keeps a normal left-click navigation on multica links on its default path", () => {
  const preview = loadPreviewScript();
  const event = createClick();

  preview.click(event);

  assert.equal(event.defaultPrevented, undefined);
  assert.equal(event.immediatePropagationStopped, undefined);
  assert.equal(preview.nativeOpenCalls(), 0);
});

test("intercepts multica links that request a new browsing context", () => {
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

test("intercepts external links and opens them via Tauri shell when available", () => {
  for (const event of [
    createClick({ href: "https://github.com/tw93/Pake" }),
    createClick({ href: "https://github.com/zwmmm/multica-macos-app", anchor: { target: "_blank" } }),
    createClick({ href: "https://google.com/search?q=test", event: { metaKey: true } }),
    createClick({ href: "https://evil-multica.ai/phishing" }),
  ]) {
    const preview = loadPreviewScript({ withTauriShell: true });
    preview.click(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(preview.shellOpenCalls().length, 1);
    assert.equal(preview.nativeOpenCalls(), 0);
  }
});

test("intercepts external links and falls back to nativeOpen when Tauri is not present", () => {
  const preview = loadPreviewScript();
  const event = createClick({ href: "https://github.com/tw93/Pake" });

  preview.click(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediatePropagationStopped, true);
  assert.equal(preview.nativeOpenCalls(), 1);
});

test("window.open with external URL routes to Tauri shell", () => {
  const preview = loadPreviewScript({ withTauriShell: true });
  preview.windowOpen("https://github.com/tw93/Pake", "_blank");

  assert.equal(preview.shellOpenCalls().length, 1);
  assert.equal(preview.shellOpenCalls()[0], "https://github.com/tw93/Pake");
  assert.equal(preview.nativeOpenCalls(), 0);
});

test("window.open with multica URL routes to new native tab", () => {
  const preview = loadPreviewScript({ withTauriShell: true });
  preview.windowOpen("https://multica.ai/workspace/task-1", "_blank");

  assert.equal(preview.shellOpenCalls().length, 0);
  assert.equal(preview.nativeOpenCalls(), 1);
  assert.equal(preview.lastNativeOpenArgs()[0][0], "https://multica.ai/workspace/task-1");
  assert.equal(preview.lastNativeOpenArgs()[0][1], "_blank");
});

test("keeps explicit bypasses and non-http links on their default path", () => {
  for (const event of [
    createClick({ event: { altKey: true }, href: "https://github.com" }),
    createClick({ download: true, href: "https://github.com/archive.zip" }),
    createClick({ href: "mailto:hello@example.com" }),
    createClick({ href: "javascript:void(0)" }),
    createClick({ event: { button: 2 }, href: "https://github.com" }),
  ]) {
    const preview = loadPreviewScript({ withTauriShell: true });
    preview.click(event);
    assert.equal(event.defaultPrevented, undefined);
    assert.equal(preview.shellOpenCalls().length, 0);
    assert.equal(preview.nativeOpenCalls(), 0);
  }
});
