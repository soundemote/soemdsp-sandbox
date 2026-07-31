// Code Screen satellite loader — docs/CORE_REDUCTION_PLAN.md
// Always-on: this file + node-graph-code-screen-model.js (patch normalize).
// On demand: node-graph-code-screen.js (~258KB) when Code Screen / Code Box is used.
//
// Important: do not load the satellite from boot-time bindNodeGraphCodeScreenEvents().
// That would re-pull 258KB on every session.

const nodeGraphCodeScreenUiScriptSrc = "./public/node-graph-code-screen.js?v=core-reduction-1";

let nodeGraphCodeScreenUiLoadPromise = null;
let nodeGraphCodeScreenEventsWanted = false;

function nodeGraphCodeScreenUiIsLoaded() {
  return document.documentElement.dataset.codeScreenUiLoaded === "true";
}

function ensureNodeGraphCodeScreenUiLoaded() {
  if (nodeGraphCodeScreenUiIsLoaded()) {
    return Promise.resolve(true);
  }
  if (nodeGraphCodeScreenUiLoadPromise) {
    return nodeGraphCodeScreenUiLoadPromise;
  }
  nodeGraphCodeScreenUiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-code-screen-ui="true"]');
    const finish = () => {
      document.documentElement.dataset.codeScreenUiLoaded = "true";
      // Full script defines bindNodeGraphCodeScreenEvents — run once if boot asked.
      if (nodeGraphCodeScreenEventsWanted && typeof globalThis.bindNodeGraphCodeScreenEvents === "function"
        && !globalThis.bindNodeGraphCodeScreenEvents.__isCodeScreenLoaderStub) {
        try {
          globalThis.bindNodeGraphCodeScreenEvents();
        } catch (error) {
          console.warn("[code-screen] bind after load", error);
        }
      }
      resolve(true);
    };
    if (existing) {
      if (nodeGraphCodeScreenUiIsLoaded()) {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => {
        nodeGraphCodeScreenUiLoadPromise = null;
        reject(new Error("Code Screen UI script failed"));
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = nodeGraphCodeScreenUiScriptSrc;
    script.async = false;
    script.dataset.codeScreenUi = "true";
    script.onload = finish;
    script.onerror = () => {
      nodeGraphCodeScreenUiLoadPromise = null;
      reject(new Error(`Failed to load ${nodeGraphCodeScreenUiScriptSrc}`));
    };
    document.head.appendChild(script);
  });
  return nodeGraphCodeScreenUiLoadPromise;
}

function nodeGraphCodeScreenCallAfterLoad(name, args = []) {
  return ensureNodeGraphCodeScreenUiLoaded().then(() => {
    const fn = typeof globalThis[name] === "function" ? globalThis[name] : null;
    if (!fn || fn.__isCodeScreenLoaderStub) {
      console.warn(`[code-screen] missing ${name} after load`);
      return undefined;
    }
    return fn(...args);
  }).catch((error) => {
    console.warn("[code-screen]", error);
    return undefined;
  });
}

function nodeGraphCodeScreenDefineLoaderStub(name, options = {}) {
  if (name === "bindNodeGraphCodeScreenEvents") {
    // Boot may call this — remember only; do not fetch the satellite yet.
    const stub = function bindNodeGraphCodeScreenEventsStub() {
      nodeGraphCodeScreenEventsWanted = true;
      if (nodeGraphCodeScreenUiIsLoaded()
        && typeof globalThis.bindNodeGraphCodeScreenEvents === "function"
        && !globalThis.bindNodeGraphCodeScreenEvents.__isCodeScreenLoaderStub) {
        return globalThis.bindNodeGraphCodeScreenEvents();
      }
    };
    stub.__isCodeScreenLoaderStub = true;
    globalThis.bindNodeGraphCodeScreenEvents = stub;
    return;
  }
  if (name === "closeNodeGraphCodeBoxWindow") {
    // Safe without satellite: hide the window if present.
    const stub = function closeNodeGraphCodeBoxWindowStub() {
      if (nodeGraphCodeScreenUiIsLoaded()
        && typeof globalThis.closeNodeGraphCodeBoxWindow === "function"
        && !globalThis.closeNodeGraphCodeBoxWindow.__isCodeScreenLoaderStub) {
        return globalThis.closeNodeGraphCodeBoxWindow();
      }
      const win = document.getElementById("nodeCodeBoxWindow");
      if (win) {
        win.hidden = true;
      }
    };
    stub.__isCodeScreenLoaderStub = true;
    globalThis.closeNodeGraphCodeBoxWindow = stub;
    return;
  }
  if (name === "applyNodeGraphCodeBoxWindowSize") {
    // Registry may call applySize before satellite exists — soft no-op.
    const stub = function applyNodeGraphCodeBoxWindowSizeStub(size) {
      if (nodeGraphCodeScreenUiIsLoaded()
        && typeof globalThis.applyNodeGraphCodeBoxWindowSize === "function"
        && !globalThis.applyNodeGraphCodeBoxWindowSize.__isCodeScreenLoaderStub) {
        return globalThis.applyNodeGraphCodeBoxWindowSize(size);
      }
      return size;
    };
    stub.__isCodeScreenLoaderStub = true;
    globalThis.applyNodeGraphCodeBoxWindowSize = stub;
    return;
  }
  const stub = function nodeGraphCodeScreenLoaderStub(...args) {
    return nodeGraphCodeScreenCallAfterLoad(name, args);
  };
  stub.__isCodeScreenLoaderStub = true;
  if (typeof globalThis[name] !== "function" || globalThis[name].__isCodeScreenLoaderStub) {
    globalThis[name] = stub;
  }
}

[
  "bindNodeGraphCodeScreenEvents",
  "renderNodeGraphCodeScreen",
  "openNodeGraphCodeBoxWindowFromHeader",
  "openNodeGraphCodeBoxWindowFullScreen",
  "openNodeGraphCodeBoxWindowForNode",
  "closeNodeGraphCodeBoxWindow",
  "applyNodeGraphCodeBoxWindowCode",
  "applyNodeGraphCodeBoxWindowTitle",
  "scheduleNodeGraphCodeBoxWindowTitleApply",
  "scheduleNodeGraphCodeBoxWindowPortsApply",
  "applyNodeGraphCodeBoxWindowPorts",
  "handleNodeGraphCodeBoxWindowSourceInput",
  "updateNodeGraphCodeBoxWindowEditorChrome",
  "applyNodeGraphCodeBoxWindowSize",
].forEach((name) => nodeGraphCodeScreenDefineLoaderStub(name));
