// Code Screen satellite loader — docs/CORE_REDUCTION_PLAN.md
// Always-on: this file + node-graph-code-screen-model.js (patch normalize).
// On demand: ordered satellite scripts when Code Screen / Code Box is used
// (docs/GRAPHIFY_WINS_PLAN.md Track 1 peels).
//
// Important: do not load the satellite from boot-time bindNodeGraphCodeScreenEvents().
// That would re-pull the UI on every session.

// Main first (kinds + helpers), then peels that depend on them.
const nodeGraphCodeScreenUiScriptSrcs = Object.freeze([
  "./public/node-graph-code-screen.js?v=graphify-peel-1",
  "./public/node-graph-code-box-window.js?v=graphify-peel-1",
]);

let nodeGraphCodeScreenUiLoadPromise = null;
let nodeGraphCodeScreenEventsWanted = false;

function nodeGraphCodeScreenUiIsLoaded() {
  return document.documentElement.dataset.codeScreenUiLoaded === "true";
}

function nodeGraphCodeScreenLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-code-screen-ui-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Code Screen UI script failed: ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.codeScreenUi = "true";
    script.dataset.codeScreenUiSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function ensureNodeGraphCodeScreenUiLoaded() {
  if (nodeGraphCodeScreenUiIsLoaded()) {
    return Promise.resolve(true);
  }
  if (nodeGraphCodeScreenUiLoadPromise) {
    return nodeGraphCodeScreenUiLoadPromise;
  }
  nodeGraphCodeScreenUiLoadPromise = (async () => {
    try {
      for (const src of nodeGraphCodeScreenUiScriptSrcs) {
        await nodeGraphCodeScreenLoadScript(src);
      }
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
      return true;
    } catch (error) {
      nodeGraphCodeScreenUiLoadPromise = null;
      throw error;
    }
  })();
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
