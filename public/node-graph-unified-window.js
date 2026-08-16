// Unified floating window: one conceptual master panel with many pages.
//
// Architecture (keep this simple — do not re-introduce dual open/seat paths):
//
//   • Each page keeps its own DOM element (command center, modules, …).
//   • Exactly one page is visible at a time.
//   • They share a single seat: { left, top, width, height } in viewport coords.
//   • openNodeGraphUnifiedWindowPage is the only page switcher:
//       1. capture seat from the currently visible page (once)
//       2. force-hide every other page
//       3. open the target page’s content (no independent positioning)
//       4. apply the seat once
//   • Nav re-clicks on the already-active page only pulse attention — no re-seat
//     (re-seating is what made the window crawl a few pixels every click).
//
// Chrome SSOT (do not invent per-page title bars or nav CSS):
//   • .scene-context-heading = move | title | close
//   • .node-unified-window-nav-host immediately under the heading
//   • JS tags the page root with .node-unified-window
//   • Shell does not scroll. Body under the nav is the only scroller.
//
// Screen Shader is intentionally NOT in this set.

const nodeGraphUnifiedWindowPages = Object.freeze({
  commandCenter: Object.freeze({
    key: "commandCenter",
    elementId: "nodeSceneContextMenu",
    workspaceKey: "commandCenter",
    label: "Command Center",
    icon: "🚀",
    showInNav: true,
  }),
  visibilityMenu: Object.freeze({
    key: "visibilityMenu",
    elementId: "nodeVisibilityMenu",
    workspaceKey: "visibilityMenu",
    label: "Visibility",
    icon: "👁️",
    showInNav: true,
  }),
  moduleBrowser: Object.freeze({
    key: "moduleBrowser",
    elementId: "nodeModuleShopView",
    workspaceKey: "moduleBrowser",
    label: "Modules",
    icon: "🎛️",
    showInNav: true,
  }),
  moduleActions: Object.freeze({
    key: "moduleActions",
    elementId: "nodeModuleActionsWindow",
    workspaceKey: "moduleActions",
    label: "Module Settings",
    icon: "⚙",
    showInNav: true,
  }),
  uiSettings: Object.freeze({
    key: "uiSettings",
    elementId: "nodeUserUiSettingsPanel",
    workspaceKey: "uiSettings",
    label: "UI Settings",
    icon: "🧩",
    showInNav: true,
  }),
  traceDisplaySettings: Object.freeze({
    key: "traceDisplaySettings",
    elementId: "nodeTraceDisplaySettingsPopover",
    workspaceKey: "traceDisplaySettings",
    label: "Display Settings",
    icon: "📺",
    showInNav: true,
  }),
  metaparameters: Object.freeze({
    key: "metaparameters",
    elementId: "nodeParameterMetadataPopover",
    workspaceKey: "metaparameters",
    label: "Parameter Settings",
    icon: "🎚️",
    showInNav: true,
  }),
  patchDefaults: Object.freeze({
    key: "patchDefaults",
    elementId: "nodePatchDefaultsPanel",
    workspaceKey: "patchDefaults",
    label: "Ready",
    icon: "🧹",
    showInNav: true,
  }),
  hotkeys: Object.freeze({
    key: "hotkeys",
    elementId: "nodeHotkeysPage",
    workspaceKey: "hotkeys",
    label: "Hotkeys",
    icon: "⌨️",
    showInNav: true,
  }),
  emoji: Object.freeze({
    key: "emoji",
    elementId: "nodeEmojiPage",
    workspaceKey: "emoji",
    label: "Emojis",
    icon: "🕯️",
    showInNav: true,
  }),
});

// Module / Display / Parameter settings sit after Modules in the shared
// header nav (Command Center floating chrome).
const nodeGraphUnifiedWindowPageOrder = Object.freeze([
  "commandCenter",
  "moduleBrowser",
  "moduleActions",
  "traceDisplaySettings",
  "metaparameters",
  "patchDefaults",
  "uiSettings",
  "visibilityMenu",
  "hotkeys",
  "emoji",
]);

function nodeGraphUnifiedWindowPageConfig(page = "") {
  return nodeGraphUnifiedWindowPages[String(page || "").trim()] || null;
}

// Shrink floor for every Command Center page. Match the main page
// (nodeSceneContextWindowDefaultSize). CSS --node-unified-window-min-*
// is written from this object — do not invent per-page mins.
const nodeGraphUnifiedWindowMinSize = Object.freeze({
  minWidth: 24,
  minHeight: 120,
});

function nodeGraphUnifiedWindowMinBox() {
  return nodeGraphUnifiedWindowMinSize;
}

function nodeGraphUnifiedWindowSizeLooksReal(size = {}) {
  const width = Math.round(Number(size.width));
  const height = Math.round(Number(size.height));
  return width >= nodeGraphUnifiedWindowMinSize.minWidth
    && height >= nodeGraphUnifiedWindowMinSize.minHeight;
}

function applyNodeGraphUnifiedWindowMinBoxToElement(element) {
  if (!element?.style) {
    return nodeGraphUnifiedWindowMinSize;
  }
  const { minWidth, minHeight } = nodeGraphUnifiedWindowMinSize;
  element.style.minWidth = `${minWidth}px`;
  element.style.minHeight = `${minHeight}px`;
  return nodeGraphUnifiedWindowMinSize;
}

function applyNodeGraphUnifiedWindowShellSize(element, size = {}) {
  if (!element) {
    return null;
  }
  const mins = nodeGraphUnifiedWindowMinSize;
  const rect = element.getBoundingClientRect?.();
  const merged = {
    width: Number(size.width) || Number(rect?.width) || mins.minWidth,
    height: Number(size.height) || Number(rect?.height) || mins.minHeight,
  };
  const normalized = typeof normalizeNodeGraphFloatingWindowSize === "function"
    ? normalizeNodeGraphFloatingWindowSize(
      merged,
      {
        minWidth: mins.minWidth,
        minHeight: mins.minHeight,
        width: merged.width,
        height: merged.height,
      },
      { element },
    )
    : {
      width: Math.max(mins.minWidth, Math.round(merged.width)),
      height: Math.max(mins.minHeight, Math.round(merged.height)),
    };
  applyNodeGraphUnifiedWindowMinBoxToElement(element);
  if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
    syncNodeGraphFloatingWindowInlineBox(element, normalized);
  } else {
    if (Number.isFinite(normalized.width)) {
      element.style.width = `${normalized.width}px`;
    }
    if (Number.isFinite(normalized.height)) {
      element.style.height = `${normalized.height}px`;
    }
  }
  return {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
}

function applyNodeGraphUnifiedWindowMinSizeCssVars() {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (!root) {
    return;
  }
  root.style.setProperty("--node-unified-window-min-width", `${nodeGraphUnifiedWindowMinSize.minWidth}px`);
  root.style.setProperty("--node-unified-window-min-height", `${nodeGraphUnifiedWindowMinSize.minHeight}px`);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyNodeGraphUnifiedWindowMinSizeCssVars, { once: true });
  } else {
    applyNodeGraphUnifiedWindowMinSizeCssVars();
  }
}

function nodeGraphWorkspaceKeyIsUnifiedPage(key = "") {
  return Boolean(nodeGraphUnifiedWindowPageConfig(String(key || "").trim()));
}

/** Apply the one shared seat. Never clamp — clamping is what crawls the window. */
function applyNodeGraphUnifiedSeatToElement(element) {
  if (!element) {
    return false;
  }
  const pos = nodeGraphMvp?.unifiedWindowPosition;
  if (!pos || !Number.isFinite(Number(pos.left)) || !Number.isFinite(Number(pos.top))) {
    return false;
  }
  return applyNodeGraphUnifiedWindowPosition(element, pos);
}

function nodeGraphUnifiedWindowElement(page = "") {
  const config = nodeGraphUnifiedWindowPageConfig(page);
  return config ? document.getElementById(config.elementId) : null;
}

function nodeGraphUnifiedWindowVisiblePage() {
  for (const key of nodeGraphUnifiedWindowPageOrder) {
    const element = nodeGraphUnifiedWindowElement(key);
    if (element && !element.hidden) {
      return key;
    }
  }
  return "";
}

function nodeGraphUnifiedWindowActivePage() {
  const tracked = String(nodeGraphMvp?.unifiedWindowPage || "").trim();
  if (tracked && nodeGraphUnifiedWindowPageConfig(tracked)) {
    const element = nodeGraphUnifiedWindowElement(tracked);
    if (element && !element.hidden) {
      return tracked;
    }
  }
  return nodeGraphUnifiedWindowVisiblePage();
}

// ─── Seat (position + size) ─────────────────────────────────────────────────
//
// Stored as viewport coordinates matching setNodeGraphFloatingWindowViewportPosition.
// Capture prefers the CSS left/top we last wrote (converted back to viewport) so
// we never round-trip getBoundingClientRect → CSS offset → rect and drift 1px
// per nav click.

function nodeGraphUnifiedWindowSeatFromElement(element) {
  if (!element || element.hidden) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 2) || !(rect.height > 2)) {
    return null;
  }

  // Prefer the values we wrote into style (stable). Fall back to rect.
  const styleLeft = Number.parseFloat(element.style.left);
  const styleTop = Number.parseFloat(element.style.top);
  let left;
  let top;
  if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
    if (typeof nodeGraphFloatingWindowViewportPositionFromCss === "function") {
      const viewport = nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop);
      left = viewport.left;
      top = viewport.top;
    } else {
      left = styleLeft;
      top = styleTop;
    }
  } else {
    left = rect.left;
    top = rect.top;
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function storeNodeGraphUnifiedWindowSeat(seat) {
  if (!seat) {
    return null;
  }
  const left = Math.round(Number(seat.left));
  const top = Math.round(Number(seat.top));
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }
  nodeGraphMvp.unifiedWindowPosition = { left, top };
  const width = Math.round(Number(seat.width));
  const height = Math.round(Number(seat.height));
  if (nodeGraphUnifiedWindowSizeLooksReal({ width, height })) {
    nodeGraphMvp.unifiedWindowSize = { width, height };
  }
  return {
    left,
    top,
    width: nodeGraphMvp.unifiedWindowSize?.width,
    height: nodeGraphMvp.unifiedWindowSize?.height,
  };
}

/** Capture seat from the first visible unified page (optionally skipping one). */
function captureNodeGraphUnifiedWindowSeat(exceptPage = "") {
  const skip = String(exceptPage || "").trim();
  for (const key of nodeGraphUnifiedWindowPageOrder) {
    if (key === skip) {
      continue;
    }
    const seat = nodeGraphUnifiedWindowSeatFromElement(nodeGraphUnifiedWindowElement(key));
    if (seat) {
      return storeNodeGraphUnifiedWindowSeat(seat);
    }
  }
  // Fall back to last remembered seat.
  const pos = nodeGraphMvp.unifiedWindowPosition;
  const size = nodeGraphMvp.unifiedWindowSize;
  if (pos && Number.isFinite(Number(pos.left)) && Number.isFinite(Number(pos.top))) {
    return {
      left: Math.round(Number(pos.left)),
      top: Math.round(Number(pos.top)),
      width: size?.width,
      height: size?.height,
    };
  }
  return null;
}

// Back-compat aliases used by older call sites.
function nodeGraphUnifiedWindowElementPosition(element) {
  return nodeGraphUnifiedWindowSeatFromElement(element);
}

function captureNodeGraphUnifiedWindowPosition(exceptPage = "") {
  const seat = captureNodeGraphUnifiedWindowSeat(exceptPage);
  return seat ? { left: seat.left, top: seat.top } : nodeGraphMvp.unifiedWindowPosition || null;
}

/**
 * Pin a page element to the shared seat. No clamping — the seat already came
 * from a window the user placed; clamping here is what made nav crawl.
 */
function applyNodeGraphUnifiedWindowPosition(element, position = null) {
  if (!element) {
    return false;
  }
  const source = position || nodeGraphMvp.unifiedWindowPosition;
  if (!source || !Number.isFinite(Number(source.left)) || !Number.isFinite(Number(source.top))) {
    return false;
  }
  const left = Math.round(Number(source.left));
  const top = Math.round(Number(source.top));
  element.style.position = "fixed";
  element.style.margin = "0";
  element.style.right = "auto";
  element.style.bottom = "auto";
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(element, left, top);
  } else {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }
  if (typeof markNodeGraphFloatingWindowSurface === "function") {
    markNodeGraphFloatingWindowSurface(element);
  }
  return true;
}

function applyNodeGraphUnifiedWindowSize(element, pageKey = "", size = null) {
  if (!element) {
    return false;
  }
  const source = size || nodeGraphMvp.unifiedWindowSize;
  if (!source) {
    return false;
  }
  let width = Math.round(Number(source.width));
  let height = Math.round(Number(source.height));
  const { minWidth, minHeight } = nodeGraphUnifiedWindowMinSize;
  if (!nodeGraphUnifiedWindowSizeLooksReal({ width, height })) {
    return false;
  }
  // Cap by available view from this element's origin (not a fixed pixel max).
  if (typeof nodeGraphFloatingWindowAvailableBox === "function") {
    const available = nodeGraphFloatingWindowAvailableBox({}, { element });
    width = Math.max(minWidth, Math.min(width, available.maxWidth));
    height = Math.max(minHeight, Math.min(height, available.maxHeight));
  } else {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    width = Math.max(minWidth, Math.min(width, viewportWidth - 2));
    height = Math.max(minHeight, Math.min(height, viewportHeight - 2));
  }
  const box = { width, height };

  // Keep page-specific CSS vars / persistence in sync with the shared box.
  const key = String(pageKey || "").trim();
  if (key === "commandCenter" && typeof applyNodeSceneContextWindowSize === "function") {
    applyNodeSceneContextWindowSize(box);
  } else if (key === "moduleBrowser" && typeof applyNodeGraphModuleShopWindowSize === "function") {
    applyNodeGraphModuleShopWindowSize(box);
  } else if (key === "moduleActions" && typeof applyNodeModuleActionsWindowSize === "function") {
    applyNodeModuleActionsWindowSize(box);
  } else if (key === "metaparameters" && typeof applyNodeMetadataPopoverSize === "function") {
    applyNodeMetadataPopoverSize(box);
  } else if (key === "traceDisplaySettings" && typeof applyNodeGraphTraceDisplaySettingsWindowSize === "function") {
    applyNodeGraphTraceDisplaySettingsWindowSize(box);
  } else if (key === "patchDefaults" && typeof applyNodeGraphPatchDefaultsWindowSize === "function") {
    applyNodeGraphPatchDefaultsWindowSize(box);
  } else if (key === "visibilityMenu" && typeof applyNodeGraphVisibilityMenuSize === "function") {
    applyNodeGraphVisibilityMenuSize(box, element);
  } else if (key === "hotkeys" && typeof applyNodeGraphHotkeysPageSize === "function") {
    applyNodeGraphHotkeysPageSize(box, element);
  } else if (key === "emoji" && typeof applyNodeGraphEmojiPageSize === "function") {
    applyNodeGraphEmojiPageSize(box, element);
  } else if (key === "uiSettings" && typeof applyNodeUserUiSettingsWindowSize === "function") {
    applyNodeUserUiSettingsWindowSize(box, element);
  }

  // Inline box wins over per-page default CSS so the seat never reflows.
  applyNodeGraphUnifiedWindowMinBoxToElement(element);
  element.style.boxSizing = "border-box";
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.maxWidth = "none";
  element.style.maxHeight = "none";

  nodeGraphMvp.unifiedWindowSize = box;
  return true;
}

function seatNodeGraphUnifiedWindow(element, pageKey = "", seat = null) {
  if (!element) {
    return false;
  }
  const position = seat
    ? { left: seat.left, top: seat.top }
    : nodeGraphMvp.unifiedWindowPosition;
  const size = (seat && nodeGraphUnifiedWindowSizeLooksReal(seat))
    ? { width: seat.width, height: seat.height }
    : nodeGraphMvp.unifiedWindowSize;
  applyNodeGraphUnifiedWindowPosition(element, position);
  applyNodeGraphUnifiedWindowSize(element, pageKey, size);
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(element);
  }
  return true;
}

/** Remember size after the user resizes any unified page. */
function rememberNodeGraphUnifiedWindowSizeFromElement(element) {
  const seat = nodeGraphUnifiedWindowSeatFromElement(element);
  if (!seat) {
    return null;
  }
  storeNodeGraphUnifiedWindowSeat(seat);
  return nodeGraphMvp.unifiedWindowSize;
}

// ─── Show / hide ────────────────────────────────────────────────────────────

/**
 * Force-hide one page. Visibility is always set on the element; page-specific
 * close helpers run for cleanup (workspace state, drag state) but cannot leave
 * the surface visible.
 */
function closeNodeGraphUnifiedWindowPage(page = "", options = {}) {
  const key = String(page || "").trim();
  const config = nodeGraphUnifiedWindowPageConfig(key);
  if (!config) {
    return false;
  }
  const quiet = options.quiet === true;
  const element = document.getElementById(config.elementId);

  if (element && !element.hidden) {
    const seat = nodeGraphUnifiedWindowSeatFromElement(element);
    if (seat) {
      storeNodeGraphUnifiedWindowSeat(seat);
    }
  }

  const wasSwitching = Boolean(nodeGraphMvp._unifiedWindowSwitching);
  nodeGraphMvp._unifiedWindowSwitching = true;
  try {
    switch (key) {
      case "commandCenter":
        if (typeof closeNodeSceneContextMenu === "function") {
          closeNodeSceneContextMenu({ explicit: true });
        }
        break;
      case "moduleBrowser":
        if (typeof closeNodeGraphModuleShop === "function") {
          closeNodeGraphModuleShop();
        }
        break;
      case "moduleActions":
        if (typeof closeNodeModuleActionsWindow === "function") {
          closeNodeModuleActionsWindow();
        }
        break;
      case "uiSettings":
        if (typeof setNodeUserUiSettingsVisible === "function") {
          setNodeUserUiSettingsVisible(false);
        }
        break;
      case "metaparameters":
        if (typeof finishCloseNodeMetadataPopover === "function") {
          finishCloseNodeMetadataPopover();
        } else if (typeof closeNodeMetadataPopover === "function") {
          closeNodeMetadataPopover();
        }
        break;
      case "traceDisplaySettings":
        if (typeof closeNodeGraphTraceDisplaySettings === "function") {
          closeNodeGraphTraceDisplaySettings();
        }
        break;
      case "patchDefaults":
        if (typeof setNodeGraphPatchDefaultsVisible === "function") {
          setNodeGraphPatchDefaultsVisible(false);
        }
        break;
      case "visibilityMenu":
        if (typeof setNodeGraphVisibilityMenuOpen === "function") {
          setNodeGraphVisibilityMenuOpen(false);
        }
        break;
      case "hotkeys":
        if (typeof setNodeGraphHotkeysPageOpen === "function") {
          setNodeGraphHotkeysPageOpen(false);
        }
        break;
      case "emoji":
        if (typeof setNodeGraphEmojiPageOpen === "function") {
          setNodeGraphEmojiPageOpen(false);
        }
        break;
      default:
        break;
    }
  } finally {
    // Absolute: this surface must not remain visible.
    if (element) {
      element.hidden = true;
    }
    nodeGraphMvp._unifiedWindowSwitching = wasSwitching;
  }

  if (!quiet && nodeGraphMvp.unifiedWindowPage === key) {
    nodeGraphMvp.unifiedWindowPage = "";
  }
  if (!quiet && !nodeGraphMvp._unifiedWindowSwitching && !nodeGraphUnifiedWindowVisiblePage()) {
    nodeGraphMvp.unifiedWindowPage = "";
    nodeGraphMvp.unifiedWindowPresentation = "closed";
    if (typeof restoreNodeGraphUnifiedWindowFromDock === "function") {
      restoreNodeGraphUnifiedWindowFromDock();
    }
  }
  return true;
}

/** Hide every unified page except keepPage. */
function closeOtherNodeGraphUnifiedWindowPages(keepPage = "") {
  const keep = String(keepPage || "").trim();
  // Capture seat from whoever is visible before we hide them.
  captureNodeGraphUnifiedWindowSeat(keep);
  for (const key of nodeGraphUnifiedWindowPageOrder) {
    if (key === keep) {
      continue;
    }
    closeNodeGraphUnifiedWindowPage(key, { quiet: true });
  }
}

/** After open: guarantee only keepPage is showing (catches reopen races). */
function assertOnlyNodeGraphUnifiedWindowPageVisible(keepPage = "") {
  const keep = String(keepPage || "").trim();
  for (const key of nodeGraphUnifiedWindowPageOrder) {
    if (key === keep) {
      continue;
    }
    const element = nodeGraphUnifiedWindowElement(key);
    if (element && !element.hidden) {
      element.hidden = true;
    }
  }
}

function restoreNodeGraphUnifiedWindowAfterWorkspaceStates() {
  let page = String(nodeGraphMvp?.unifiedWindowPage || "").trim();
  if (!nodeGraphUnifiedWindowPageConfig(page)) {
    page = "";
    const states = nodeGraphMvp?.workspaceWindowStates || {};
    for (const key of nodeGraphUnifiedWindowPageOrder) {
      if (states[key]?.open) {
        page = key;
        break;
      }
    }
  }
  if (!page) {
    return;
  }
  if (!nodeGraphMvp.unifiedWindowPosition) {
    const states = nodeGraphMvp?.workspaceWindowStates || {};
    const fallback = states.commandCenter?.position || states[page]?.position;
    if (fallback && Number.isFinite(Number(fallback.left)) && Number.isFinite(Number(fallback.top))) {
      nodeGraphMvp.unifiedWindowPosition = {
        left: Math.round(Number(fallback.left)),
        top: Math.round(Number(fallback.top)),
      };
    }
  }
  if (String(nodeGraphMvp.unifiedWindowPresentation || "closed") === "closed") {
    nodeGraphMvp.unifiedWindowPresentation = "open";
  }
  if (typeof openNodeGraphUnifiedWindowPage === "function") {
    openNodeGraphUnifiedWindowPage(page, { force: true });
  }
}

function markNodeGraphUnifiedWindowPage(page = "") {
  const key = String(page || "").trim();
  if (!nodeGraphUnifiedWindowPageConfig(key)) {
    return "";
  }
  nodeGraphMvp.unifiedWindowPage = key;
  if (key === "moduleActions" || key === "metaparameters" || key === "traceDisplaySettings") {
    nodeGraphMvp.sharedInspectorActive = key;
  }
  if (!nodeGraphMvp.unifiedWindowPresentation || nodeGraphMvp.unifiedWindowPresentation === "closed") {
    nodeGraphMvp.unifiedWindowPresentation = "open";
  }
  syncNodeGraphUnifiedWindowNavBars();
  return key;
}

function focusNodeGraphUnifiedWindowPage(page = "") {
  const key = String(page || "").trim();
  const element = nodeGraphUnifiedWindowElement(key);
  if (!element || element.hidden) {
    return false;
  }
  markNodeGraphUnifiedWindowPage(key);
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(element);
  }
  if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
    pulseNodeGraphFloatingWindowAttention(element);
  }
  return true;
}

// ─── Open (the one switcher) ────────────────────────────────────────────────

/**
 * Open a unified page. Closes siblings, hands off the shared seat, seats once.
 * Re-opening the already-active page only pulses — never re-seats (no drift).
 */
function announceNodeGraphUnifiedWindowPage(page = "") {
  const key = String(page || "").trim();
  const config = nodeGraphUnifiedWindowPageConfig(key);
  const label = String(config?.label || "command center page").trim();
  if (typeof noteNodeGraphCommandCenterPage === "function") {
    noteNodeGraphCommandCenterPage(label);
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(label);
  }
}

function openNodeGraphUnifiedWindowPage(page = "", options = {}) {
  const key = String(page || "").trim();
  const config = nodeGraphUnifiedWindowPageConfig(key);
  if (!config) {
    return false;
  }

  const previous = String(nodeGraphMvp?.unifiedWindowPage || "").trim();

  // Same page already open → attention only. Re-applying the seat is what
  // nudged the window a few pixels on every nav click.
  if (!options.force && focusNodeGraphUnifiedWindowPage(key)) {
    if (previous !== key) {
      announceNodeGraphUnifiedWindowPage(key);
    }
    return true;
  }

  // Resolve seat before anything is hidden.
  const explicitPos = options.position
    && Number.isFinite(Number(options.position.left))
    && Number.isFinite(Number(options.position.top))
    ? {
      left: Math.round(Number(options.position.left)),
      top: Math.round(Number(options.position.top)),
      width: options.position.width,
      height: options.position.height,
    }
    : null;

  const captured = captureNodeGraphUnifiedWindowSeat(key);
  const seat = storeNodeGraphUnifiedWindowSeat(
    explicitPos
    || captured
    || (Number.isFinite(Number(options.x)) && Number.isFinite(Number(options.y))
      ? { left: Number(options.x), top: Number(options.y) }
      : null)
    || nodeGraphMvp.unifiedWindowPosition,
  );

  nodeGraphMvp._unifiedWindowSwitching = true;
  nodeGraphMvp._unifiedWindowPendingPosition = seat
    ? { left: seat.left, top: seat.top }
    : null;

  try {
    // 1. Hide everyone else first (force).
    closeOtherNodeGraphUnifiedWindowPages(key);

    // 2. Open target content. Page openers must not invent a second seat when
    //    _unifiedWindowSwitching is set — they prepare DOM and unhide only.
    switch (key) {
      case "commandCenter": {
        const x = Number.isFinite(Number(seat?.left))
          ? Number(seat.left)
          : (Number(options.x) || window.innerWidth / 2);
        const y = Number.isFinite(Number(seat?.top))
          ? Number(seat.top)
          : (Number(options.y) || window.innerHeight / 2);
        if (typeof openNodeGraphCommandCenter === "function") {
          openNodeGraphCommandCenter(x, y);
        }
        break;
      }
      case "moduleBrowser":
        if (typeof openNodeGraphModuleShop === "function") {
          openNodeGraphModuleShop(
            options.point ?? nodeGraphMvp.sceneContextPoint ?? null,
            seat
              ? { x: seat.left, y: seat.top }
              : (options.windowPoint || null),
          );
        }
        break;
      case "moduleActions":
        if (typeof openNodeGraphModuleActionsFromContextWindow === "function") {
          openNodeGraphModuleActionsFromContextWindow();
        } else if (typeof showNodeModuleActionsWindow === "function") {
          showNodeModuleActionsWindow();
        }
        break;
      case "uiSettings":
        if (typeof setNodeUserUiSettingsVisible === "function") {
          setNodeUserUiSettingsVisible(true);
        }
        break;
      case "metaparameters":
        if (typeof openNodeGraphMetaparametersPage === "function") {
          openNodeGraphMetaparametersPage(options);
        } else if (typeof openNodeGraphMetaparametersFromContextWindow === "function") {
          openNodeGraphMetaparametersFromContextWindow();
        } else if (typeof openBlankNodeMetadataPopover === "function") {
          openBlankNodeMetadataPopover(options.event || {});
        }
        break;
      case "traceDisplaySettings": {
        // Selected display face(s) → open settings (multi-select aware).
        // Otherwise blank page: "Right-click on a display".
        const fromActions = typeof nodeGraphModuleActionTargetNodeId === "function"
          ? nodeGraphModuleActionTargetNodeId()
          : "";
        const fromSelection = typeof nodeGraphTraceDisplaySettingsPrimaryFromSelection === "function"
          ? nodeGraphTraceDisplaySettingsPrimaryFromSelection()
          : (typeof nodeGraphSingleSelectedNodeId === "function"
            ? nodeGraphSingleSelectedNodeId()
            : "");
        const nodeId = String(
          options.nodeId
          || fromActions
          || fromSelection
          || nodeGraphMvp.sceneContextTargetNode
          || nodeGraphMvp.lastModuleActionTargetNode
          || "",
        ).trim();
        const node = nodeId && typeof nodeGraphPatchNode === "function"
          ? nodeGraphPatchNode(nodeId)
          : null;
        const canOpen = node
          && typeof nodeGraphNodeCanOpenDisplaySettings === "function"
          && nodeGraphNodeCanOpenDisplaySettings(node);
        if (canOpen && typeof openNodeGraphTraceDisplaySettings === "function") {
          openNodeGraphTraceDisplaySettings(nodeId, options.event || {});
        } else if (typeof openBlankNodeGraphTraceDisplaySettings === "function") {
          openBlankNodeGraphTraceDisplaySettings(options.event || {});
        }
        break;
      }
      case "patchDefaults":
        if (typeof setNodeGraphPatchDefaultsVisible === "function") {
          setNodeGraphPatchDefaultsVisible(true);
        }
        break;
      case "visibilityMenu":
        if (typeof setNodeGraphVisibilityMenuOpen === "function") {
          setNodeGraphVisibilityMenuOpen(true);
        }
        break;
      case "hotkeys":
        if (typeof setNodeGraphHotkeysPageOpen === "function") {
          setNodeGraphHotkeysPageOpen(true);
        }
        break;
      case "emoji":
        if (typeof setNodeGraphEmojiPageOpen === "function") {
          setNodeGraphEmojiPageOpen(true);
        }
        break;
      default:
        break;
    }
  } finally {
    nodeGraphMvp._unifiedWindowSwitching = false;
    nodeGraphMvp._unifiedWindowPendingPosition = null;
  }

  // 3. Seat once. 4. Re-assert only this page is visible.
  const element = nodeGraphUnifiedWindowElement(key);
  const presentation = String(nodeGraphMvp.unifiedWindowPresentation || "");
  const embed = presentation === "embedLeft" || presentation === "embedRight";
  if (element) {
    element.hidden = false;
    if (!embed && seat) {
      seatNodeGraphUnifiedWindow(element, key, seat);
    } else if (!embed && typeof raiseNodeGraphFloatingWindow === "function") {
      raiseNodeGraphFloatingWindow(element);
    }
  }
  assertOnlyNodeGraphUnifiedWindowPageVisible(key);
  markNodeGraphUnifiedWindowPage(key);
  if (typeof applyNodeGraphUnifiedWindowPresentation === "function") {
    applyNodeGraphUnifiedWindowPresentation();
  }
  if (previous !== key) {
    announceNodeGraphUnifiedWindowPage(key);
  }
  return Boolean(element && !element.hidden);
}

/**
 * Called by individual open* paths (right-click, toolbar, hotkeys) so they
 * still displace siblings when they do not go through openNodeGraphUnifiedWindowPage.
 */
function noteNodeGraphUnifiedWindowOpened(page = "", element = null) {
  const key = String(page || "").trim();
  if (!nodeGraphUnifiedWindowPageConfig(key)) {
    return;
  }

  // Unified switcher already closed siblings and will seat after return.
  // Page-change message is announced by openNodeGraphUnifiedWindowPage.
  if (nodeGraphMvp._unifiedWindowSwitching) {
    markNodeGraphUnifiedWindowPage(key);
    return;
  }

  const previous = String(nodeGraphMvp?.unifiedWindowPage || "").trim();

  // Independent open (toolbar / hotkey / right-click that didn't use the switcher).
  // Capture the live page first. Never adopt a click-spawned rect as the seat —
  // that is what yanked Command Center when right-clicking a parameter.
  const captured = captureNodeGraphUnifiedWindowSeat(key);
  closeOtherNodeGraphUnifiedWindowPages(key);
  const existing = captured
    || (nodeGraphMvp.unifiedWindowPosition
      && Number.isFinite(Number(nodeGraphMvp.unifiedWindowPosition.left))
      && Number.isFinite(Number(nodeGraphMvp.unifiedWindowPosition.top))
      ? {
        left: Math.round(Number(nodeGraphMvp.unifiedWindowPosition.left)),
        top: Math.round(Number(nodeGraphMvp.unifiedWindowPosition.top)),
        width: nodeGraphMvp.unifiedWindowSize?.width,
        height: nodeGraphMvp.unifiedWindowSize?.height,
      }
      : null);
  if (element && !element.hidden) {
    if (existing) {
      seatNodeGraphUnifiedWindow(element, key, existing);
    } else {
      const seat = nodeGraphUnifiedWindowSeatFromElement(element);
      if (seat) {
        storeNodeGraphUnifiedWindowSeat(seat);
      }
    }
  }
  assertOnlyNodeGraphUnifiedWindowPageVisible(key);
  markNodeGraphUnifiedWindowPage(key);
  if (typeof applyNodeGraphUnifiedWindowPresentation === "function") {
    applyNodeGraphUnifiedWindowPresentation();
  }
  if (previous !== key) {
    announceNodeGraphUnifiedWindowPage(key);
  }
}

// ─── Command Center presentation (C) ────────────────────────────────────────
// closed → open → embed left → embed right → float → closed

const nodeGraphCommandCenterPresentationOrder = Object.freeze([
  "open",
  "embedLeft",
  "embedRight",
  "float",
  "closed",
]);

function nodeGraphUnifiedWindowIsShowing() {
  return Boolean(nodeGraphUnifiedWindowActivePage());
}

function nodeGraphCommandCenterIsOpen() {
  return nodeGraphUnifiedWindowIsShowing();
}

function restoreNodeGraphUnifiedWindowFromDock() {
  const dock = document.getElementById("nodeCommandCenterDock");
  const home = document.getElementById("nodeWiringPanel");
  home?.classList.remove("command-center-embed-left", "command-center-embed-right");
  if (!dock || !home) {
    return;
  }
  const mainRow = document.getElementById("nodeGraphMainRow");
  for (const child of [...dock.children]) {
    if (child.id === "nodeCommandCenterDockSplit" || child.classList.contains("node-command-center-dock-split")) {
      continue;
    }
    home.insertBefore(child, mainRow || dock);
    child.classList.remove("is-embedded-dock");
    nodeGraphCommandCenterClearDockInlineStyle(child);
    if (typeof setNodeGraphFloatingWindowLocked === "function") {
      setNodeGraphFloatingWindowLocked(child, false, { persist: false });
    }
  }
  dock.hidden = true;
}

function nodeGraphCommandCenterClearDockInlineStyle(element) {
  if (!element?.style) {
    return;
  }
  element.style.position = "";
  element.style.left = "";
  element.style.top = "";
  element.style.right = "";
  element.style.bottom = "";
  element.style.width = "";
  element.style.height = "";
  element.style.maxWidth = "";
  element.style.maxHeight = "";
}

function nodeGraphCommandCenterIsDocked() {
  const mode = String(nodeGraphMvp?.unifiedWindowPresentation || "");
  if (mode === "embedLeft" || mode === "embedRight") {
    return true;
  }
  const dock = document.getElementById("nodeCommandCenterDock");
  if (!dock || dock.hidden) {
    return false;
  }
  return Boolean(dock.querySelector(".node-unified-window, .node-scene-context-menu, .node-module-shop-view"));
}

function nodeGraphCommandCenterDockWidthLimits() {
  const minWidth = typeof nodeGraphUnifiedWindowMinSize !== "undefined"
    ? nodeGraphUnifiedWindowMinSize.minWidth
    : 24;
  const row = document.getElementById("nodeGraphMainRow");
  let maxWidth = Math.max(minWidth, Math.round(row?.clientWidth || window.innerWidth || 800) - minWidth);
  if (typeof nodeGraphFloatingWindowAvailableBox === "function") {
    const available = nodeGraphFloatingWindowAvailableBox();
    maxWidth = Math.max(minWidth, Math.round(Number(available.maxWidth) || maxWidth));
  }
  return { min: minWidth, max: maxWidth };
}

function applyNodeGraphCommandCenterDockWidth(widthPx) {
  const dock = document.getElementById("nodeCommandCenterDock");
  const limits = nodeGraphCommandCenterDockWidthLimits();
  const raw = Number(widthPx);
  const fallback = Number(nodeGraphMvp?.unifiedWindowSize?.width);
  const next = Number.isFinite(raw)
    ? Math.max(limits.min, Math.min(limits.max, Math.round(raw)))
    : Math.round(Math.min(limits.max, Number.isFinite(fallback) ? fallback : 320));
  if (nodeGraphMvp) {
    nodeGraphMvp.commandCenterDockWidth = next;
    const prevH = Number(nodeGraphMvp.unifiedWindowSize?.height);
    nodeGraphMvp.unifiedWindowSize = {
      width: next,
      height: Number.isFinite(prevH) && prevH > 0
        ? Math.round(prevH)
        : (typeof nodeGraphUnifiedWindowMinSize !== "undefined"
          ? nodeGraphUnifiedWindowMinSize.minHeight
          : 120),
    };
  }
  dock?.style.setProperty("--node-command-center-dock-width", `${next}px`);
  return next;
}

function beginNodeGraphCommandCenterDockResize(event) {
  if (event.button > 0 || !nodeGraphCommandCenterIsDocked()) {
    return false;
  }
  const dock = document.getElementById("nodeCommandCenterDock");
  const handle = event.currentTarget;
  if (!dock || !handle || typeof watchNodeGraphSectionResizeDrag !== "function") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const side = String(nodeGraphMvp?.unifiedWindowPresentation || "") === "embedLeft" ? "left" : "right";
  const startX = event.clientX;
  const startWidth = dock.getBoundingClientRect().width;
  document.body.classList.add("is-resizing-command-center-dock");
  watchNodeGraphSectionResizeDrag(event, {
    handle,
    onMove: (point) => {
      const dx = point.x - startX;
      applyNodeGraphCommandCenterDockWidth(side === "right" ? startWidth - dx : startWidth + dx);
    },
    onEnd: () => {
      document.body.classList.remove("is-resizing-command-center-dock");
      if (typeof notifyNodeGraphChromeLayoutChanged === "function") {
        notifyNodeGraphChromeLayoutChanged();
      }
    },
  });
  return true;
}

function bindNodeGraphCommandCenterDockSplit() {
  const handle = document.getElementById("nodeCommandCenterDockSplit");
  if (!handle || handle.dataset.dockSplitBound === "true") {
    return;
  }
  handle.dataset.dockSplitBound = "true";
  handle.addEventListener("pointerdown", beginNodeGraphCommandCenterDockResize);
}

function undockNodeGraphCommandCenterInPlace() {
  if (!nodeGraphCommandCenterIsDocked()) {
    return false;
  }
  const dock = document.getElementById("nodeCommandCenterDock");
  const element = dock?.querySelector(".node-unified-window, .node-scene-context-menu, .node-module-shop-view")
    || nodeGraphUnifiedWindowElement(nodeGraphUnifiedWindowActivePage() || "commandCenter")
    || document.getElementById("nodeSceneContextMenu");
  if (!element) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  setNodeGraphCommandCenterPresentation("float", {
    inPlace: true,
    position: { left: rect.left, top: rect.top },
    size: { width: rect.width, height: rect.height },
  });
  if (typeof setNodeGraphFloatingWindowLocked === "function") {
    setNodeGraphFloatingWindowLocked(element, false, { persist: false });
  }
  return true;
}

function applyNodeGraphUnifiedWindowPresentation(options = {}) {
  const mode = String(nodeGraphMvp.unifiedWindowPresentation || "closed");
  const panel = document.getElementById("nodeWiringPanel");
  const dock = document.getElementById("nodeCommandCenterDock");
  const pageKey = nodeGraphUnifiedWindowActivePage()
    || String(nodeGraphMvp.unifiedWindowPage || "").trim()
    || "commandCenter";
  const element = nodeGraphUnifiedWindowElement(pageKey);
  const embed = mode === "embedLeft" || mode === "embedRight";
  restoreNodeGraphUnifiedWindowFromDock();
  panel?.classList.toggle("command-center-embed-left", mode === "embedLeft");
  panel?.classList.toggle("command-center-embed-right", mode === "embedRight");
  if (embed && dock && element) {
    dock.hidden = false;
    dock.append(element);
    element.hidden = false;
    element.classList.add("is-embedded-dock");
    markNodeGraphUnifiedWindowChrome(element);
    element.style.position = "relative";
    element.style.left = "0";
    element.style.top = "0";
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.maxWidth = "none";
    element.style.maxHeight = "none";
    if (typeof setNodeGraphFloatingWindowLocked === "function") {
      setNodeGraphFloatingWindowLocked(element, true, { persist: false });
    }
    if (typeof applyNodeGraphCommandCenterDockWidth === "function") {
      applyNodeGraphCommandCenterDockWidth(
        nodeGraphMvp.unifiedWindowSize?.width ?? nodeGraphMvp.commandCenterDockWidth,
      );
    }
    bindNodeGraphCommandCenterDockSplit();
    if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
      syncNodeGraphUnifiedWindowNavBars();
    }
    return;
  }
  if ((mode === "open" || mode === "float") && element && !element.hidden) {
    if (options.inPlace && options.position) {
      element.hidden = false;
      if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
        setNodeGraphFloatingWindowViewportPosition(element, options.position.left, options.position.top);
      } else {
        element.style.position = "fixed";
        element.style.left = `${Math.round(options.position.left)}px`;
        element.style.top = `${Math.round(options.position.top)}px`;
      }
      if (options.size?.width) {
        element.style.width = `${Math.round(options.size.width)}px`;
      }
      if (options.size?.height) {
        element.style.height = `${Math.round(options.size.height)}px`;
      }
    } else {
      seatNodeGraphUnifiedWindow(element, pageKey);
    }
    if (typeof setNodeGraphFloatingWindowLocked === "function") {
      setNodeGraphFloatingWindowLocked(element, false, { persist: false });
    }
    if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
      syncNodeGraphUnifiedWindowNavBars();
    }
  }
}

function setNodeGraphCommandCenterPresentation(mode, options = {}) {
  const next = String(mode || "closed").trim();
  nodeGraphMvp.unifiedWindowPresentation = next;
  if (next === "closed") {
    const page = nodeGraphUnifiedWindowActivePage()
      || String(nodeGraphMvp.unifiedWindowPage || "").trim()
      || "commandCenter";
    restoreNodeGraphUnifiedWindowFromDock();
    if (typeof closeNodeGraphUnifiedWindowPage === "function") {
      closeNodeGraphUnifiedWindowPage(page, { quiet: true });
    }
    nodeGraphMvp.unifiedWindowPage = "";
    nodeGraphMvp.unifiedWindowPresentation = "closed";
    return;
  }
  if (!nodeGraphUnifiedWindowIsShowing()) {
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("commandCenter", options);
    } else if (typeof openNodeGraphCommandCenter === "function") {
      openNodeGraphCommandCenter(options.x, options.y);
    }
  }
  applyNodeGraphUnifiedWindowPresentation(options);
}

function cycleNodeGraphCommandCenterPresentation(options = {}) {
  if (!nodeGraphUnifiedWindowIsShowing()) {
    setNodeGraphCommandCenterPresentation("open", options);
    return "open";
  }
  const current = String(nodeGraphMvp.unifiedWindowPresentation || "open");
  const index = nodeGraphCommandCenterPresentationOrder.indexOf(current);
  const next = nodeGraphCommandCenterPresentationOrder[
    (index < 0 ? 0 : index + 1) % nodeGraphCommandCenterPresentationOrder.length
  ];
  setNodeGraphCommandCenterPresentation(next, options);
  return next;
}

// ─── Blank inspector: pick a module from the patch ──────────────────────────

function nodeGraphInspectorPatchModules(kind = "") {
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  const key = String(kind || "").trim();
  return nodes
    .filter((node) => {
      if (!node?.id) {
        return false;
      }
      if (key === "display") {
        return typeof nodeGraphNodeCanOpenDisplaySettings === "function"
          && nodeGraphNodeCanOpenDisplaySettings(node);
      }
      if (key === "parameters") {
        const definition = typeof nodeGraphModuleDefinition === "function"
          ? nodeGraphModuleDefinition(node.type)
          : (typeof nodeGraphModuleDefinitions === "object" ? nodeGraphModuleDefinitions[node.type] : null);
        return (definition?.parameters || []).length > 0;
      }
      return true;
    })
    .slice()
    .sort((left, right) => {
      const titleOf = (node) => String(
        typeof nodeGraphPatchNodeTitle === "function"
          ? nodeGraphPatchNodeTitle(node)
          : (node.alias || node.type || node.id),
      );
      return titleOf(left).localeCompare(titleOf(right), undefined, { sensitivity: "base" });
    });
}

function fillNodeGraphUnifiedInspectorModuleList(host, {
  kind = "",
  hint = "Choose a module",
  emptyHint = "No modules in this patch.",
  onPick = null,
} = {}) {
  if (!host) {
    return;
  }
  host.replaceChildren();
  host.classList.add("has-module-list");
  const modules = nodeGraphInspectorPatchModules(kind);
  const caption = document.createElement("div");
  caption.className = "node-unified-inspector-empty-hint";
  caption.textContent = modules.length ? hint : emptyHint;
  host.append(caption);
  if (!modules.length) {
    return;
  }
  const list = document.createElement("div");
  list.className = "node-unified-inspector-module-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", hint);
  for (const node of modules) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-unified-inspector-module-item";
    button.dataset.node = node.id;
    const title = typeof nodeGraphPatchNodeTitle === "function"
      ? nodeGraphPatchNodeTitle(node)
      : (node.alias || nodeGraphNodeLabels?.[node.type] || node.type);
    const typeName = nodeGraphNodeLabels?.[node.type] || node.type;
    button.setAttribute("aria-label", title);
    const name = document.createElement("span");
    name.className = "node-unified-inspector-module-name";
    name.textContent = title;
    button.append(name);
    if (typeName && typeName !== title) {
      const type = document.createElement("span");
      type.className = "node-unified-inspector-module-type";
      type.textContent = typeName;
      button.append(type);
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onPick === "function") {
        onPick(node, event);
      }
    });
    list.append(button);
  }
  host.append(list);
}

function nodeGraphSelectInspectorModule(nodeId) {
  const id = String(nodeId || "").trim();
  if (!id) {
    return;
  }
  if (typeof setNodeGraphSelection === "function") {
    setNodeGraphSelection({ type: "node", id });
  }
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.sceneContextTargetNode = id;
    nodeGraphMvp.lastModuleActionTargetNode = id;
  }
}

// ─── Nav chrome ─────────────────────────────────────────────────────────────

function handleNodeGraphUnifiedWindowNavClick(event) {
  const button = event.currentTarget;
  const page = String(button?.dataset?.unifiedPage || "").trim();
  if (!page) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  openNodeGraphUnifiedWindowPage(page);
}

function buildNodeGraphUnifiedWindowNav(activePage = "") {
  const nav = document.createElement("div");
  nav.className = "node-unified-window-nav";
  nav.setAttribute("role", "toolbar");
  nav.setAttribute("aria-label", "Floating window pages");

  for (const key of nodeGraphUnifiedWindowPageOrder) {
    const config = nodeGraphUnifiedWindowPages[key];
    if (!config?.showInNav) {
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-unified-window-nav-button";
    button.dataset.unifiedPage = key;
    button.setAttribute("aria-label", config.label);
    button.title = config.label;
    if (key === activePage) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    button.textContent = config.icon;
    button.addEventListener("click", handleNodeGraphUnifiedWindowNavClick);
    nav.append(button);
  }
  const speaker = document.createElement("button");
  speaker.type = "button";
  speaker.className = "node-unified-window-nav-button node-unified-window-speaker-mark-button";
  speaker.textContent = "🔈";
  speaker.title = "Show speaker marks on modules and categories";
  speaker.setAttribute("aria-label", "Show speaker marks on modules and categories");
  const speakerOn = Boolean(nodeGraphMvp?.shopSpeakerMarks);
  speaker.setAttribute("aria-pressed", speakerOn ? "true" : "false");
  speaker.classList.toggle("is-active", speakerOn);
  speaker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
      nodeGraphMvp.shopSpeakerMarks = !nodeGraphMvp.shopSpeakerMarks;
    }
    if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
      syncNodeGraphUnifiedWindowNavBars();
    }
  });
  nav.append(speaker);
  if (!nav.children.length) {
    return null;
  }
  return nav;
}

function markNodeGraphUnifiedWindowChrome(element) {
  if (element?.classList) {
    element.classList.add("node-unified-window");
  }
}

function ensureNodeGraphUnifiedWindowNavHost(element, options = {}) {
  if (!element) {
    return null;
  }
  markNodeGraphUnifiedWindowChrome(element);
  let host = element.querySelector(":scope > .node-unified-window-nav-host, :scope > .node-module-shop-column > .node-unified-window-nav-host");
  if (host) {
    // Keep host immediately under the title chrome so empty states / body
    // content never sit above the emoji toolbar.
    const heading = element.querySelector(":scope > .scene-context-heading");
    if (heading && host.previousElementSibling !== heading && heading.parentElement === host.parentElement) {
      heading.after(host);
    }
    return host;
  }
  host = document.createElement("div");
  host.className = "node-unified-window-nav-host";
  if (options.insertBefore) {
    const anchor = typeof options.insertBefore === "string"
      ? element.querySelector(options.insertBefore)
      : options.insertBefore;
    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(host, anchor);
      return host;
    }
  }
  if (options.prependTo) {
    const parent = typeof options.prependTo === "string"
      ? element.querySelector(options.prependTo)
      : options.prependTo;
    if (parent) {
      parent.prepend(host);
      return host;
    }
  }
  const heading = element.querySelector(":scope > .scene-context-heading");
  if (heading) {
    // Prefer after heading, but skip past any empty-state that was inserted early.
    heading.after(host);
  } else {
    element.prepend(host);
  }
  return host;
}

function syncNodeGraphUnifiedWindowNavBars() {
  const active = nodeGraphUnifiedWindowActivePage();
  const mounts = [
    {
      elementId: "nodeSceneContextMenu",
      page: "commandCenter",
      prepare(element) {
        const existing = element.querySelector("#nodeCommandCenterUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeModuleShopView",
      page: "moduleBrowser",
      prepare(element) {
        const heading = element.querySelector(":scope > .scene-context-heading");
        const existing = element.querySelector("#nodeModuleShopUnifiedNavHost, :scope > .node-unified-window-nav-host");
        element.querySelectorAll(".node-module-shop-column > .node-unified-window-nav-host").forEach((orphan) => {
          if (orphan !== existing) {
            orphan.remove();
          }
        });
        if (existing) {
          if (heading && existing.previousElementSibling !== heading) {
            heading.after(existing);
          }
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeModuleActionsWindow",
      page: "moduleActions",
      prepare(element) {
        const existing = element.querySelector("#nodeModuleActionsUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeParameterMetadataPopover",
      page: "metaparameters",
      prepare(element) {
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeTraceDisplaySettingsPopover",
      page: "traceDisplaySettings",
      prepare(element) {
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeUserUiSettingsPanel",
      page: "uiSettings",
      prepare(element) {
        const existing = element.querySelector("#nodeUserUiSettingsUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodePatchDefaultsPanel",
      page: "patchDefaults",
      prepare(element) {
        const existing = element.querySelector("#nodePatchDefaultsUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeVisibilityMenu",
      page: "visibilityMenu",
      prepare(element) {
        const existing = element.querySelector("#nodeVisibilityUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeHotkeysPage",
      page: "hotkeys",
      prepare(element) {
        const existing = element.querySelector("#nodeHotkeysUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
    {
      elementId: "nodeEmojiPage",
      page: "emoji",
      prepare(element) {
        const existing = element.querySelector("#nodeEmojiUnifiedNavHost, :scope > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
  ];
  for (const mount of mounts) {
    const element = document.getElementById(mount.elementId);
    if (!element) {
      continue;
    }
    markNodeGraphUnifiedWindowChrome(element);
    const host = mount.prepare(element);
    if (!host) {
      continue;
    }
    const pageIsOpen = !element.hidden;
    host.replaceChildren();
    if (!pageIsOpen) {
      host.hidden = true;
      continue;
    }
    const nav = buildNodeGraphUnifiedWindowNav(active || mount.page);
    if (!nav) {
      host.hidden = true;
      continue;
    }
    host.hidden = false;
    host.append(nav);
    // If an empty-state was placed above the nav (race with blank open), move it under.
    const empty = element.querySelector(":scope > .node-unified-inspector-empty");
    if (empty && empty.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING) {
      host.after(empty);
    }
  }
}

/**
 * Right-click on a parameter control (slider row / readout / range input)
 * should open Parameter Settings in the unified window — not Module Settings.
 */
function openNodeGraphParameterSettingsFromContextEvent(event, nodeElement = null) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest?.(
    ".node-module-scope-window, .node-led-face, .node-number-readout-face, .node-ray-bouncer-face, .node-phosphor-waveform-display, .node-xy-pad, .node-xy-pad-canvas",
  )) {
    return false;
  }
  const readout = target.closest?.(".node-slider-readout");
  if (readout && typeof openNodeMetadataPopover === "function") {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    const node = nodeElement || readout.closest?.(".dsp-node");
    const nodeId = String(node?.dataset?.node || "").trim();
    if (nodeId) {
      nodeGraphMvp.sceneContextTargetNode = nodeId;
      nodeGraphMvp.lastModuleActionTargetNode = nodeId;
    }
    openNodeMetadataPopover(event, readout);
    return true;
  }
  const rangeInput = target.closest?.('input[type="range"], input.node-param-slider, .node-slider-control');
  const paramLabel = target.closest?.("label");
  const slider = rangeInput
    || paramLabel?.querySelector?.('input[type="range"]')
    || (target.matches?.('input[type="range"]') ? target : null);
  if (!slider || !slider.closest?.(".dsp-node")) {
    return false;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  const node = nodeElement || slider.closest?.(".dsp-node");
  const nodeId = String(node?.dataset?.node || "").trim();
  if (nodeId) {
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  }
  let linkedReadout = null;
  if (slider.id) {
    linkedReadout = document.querySelector(`.node-slider-readout[data-slider-target="${CSS.escape(slider.id)}"]`);
  }
  if (!linkedReadout && node) {
    linkedReadout = firstNodeModuleSliderReadout?.(node) || node.querySelector?.(".node-slider-readout");
  }
  if (linkedReadout && typeof openNodeMetadataPopover === "function") {
    openNodeMetadataPopover(event, linkedReadout);
    return true;
  }
  if (typeof openBlankNodeMetadataPopover === "function") {
    openBlankNodeMetadataPopover(event);
    return true;
  }
  return false;
}

function bindNodeGraphUnifiedWindowBootstrap() {
  if (document.documentElement.dataset.unifiedWindowNavBound === "true") {
    return;
  }
  document.documentElement.dataset.unifiedWindowNavBound = "true";
  const observer = new MutationObserver(() => {
    if (nodeGraphMvp?._unifiedWindowSwitching) {
      return;
    }
    window.requestAnimationFrame(() => syncNodeGraphUnifiedWindowNavBars());
  });
  for (const key of nodeGraphUnifiedWindowPageOrder) {
    const element = nodeGraphUnifiedWindowElement(key);
    if (element) {
      observer.observe(element, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
  syncNodeGraphUnifiedWindowNavBars();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNodeGraphUnifiedWindowBootstrap, { once: true });
  } else {
    bindNodeGraphUnifiedWindowBootstrap();
  }
}
