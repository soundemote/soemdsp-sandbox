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
  // Visibility is a standalone floating window (own seat / size) — not a
  // unified page. Opening it must never re-seat Command Center / Modules.
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
});

// Module / Display / Parameter settings sit after Modules in the shared
// header nav (Command Center floating chrome).
const nodeGraphUnifiedWindowPageOrder = Object.freeze([
  "commandCenter",
  "moduleBrowser",
  "moduleActions",
  "traceDisplaySettings",
  "metaparameters",
  "uiSettings",
]);

function nodeGraphUnifiedWindowPageConfig(page = "") {
  return nodeGraphUnifiedWindowPages[String(page || "").trim()] || null;
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
  if (width > 40 && height > 40) {
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
  if (!(width > 40) || !(height > 40)) {
    return false;
  }
  // Cap by available view from this element's origin (not a fixed pixel max).
  if (typeof nodeGraphFloatingWindowAvailableBox === "function") {
    const available = nodeGraphFloatingWindowAvailableBox({}, { element });
    width = Math.max(96, Math.min(width, available.maxWidth));
    height = Math.max(120, Math.min(height, available.maxHeight));
  } else {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    width = Math.max(96, Math.min(width, viewportWidth - 2));
    height = Math.max(120, Math.min(height, viewportHeight - 2));
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
  }

  // Inline box wins over per-page default CSS so the seat never reflows.
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
  const size = (seat && seat.width > 40 && seat.height > 40)
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

function markNodeGraphUnifiedWindowPage(page = "") {
  const key = String(page || "").trim();
  if (!nodeGraphUnifiedWindowPageConfig(key)) {
    return "";
  }
  nodeGraphMvp.unifiedWindowPage = key;
  if (key === "moduleActions" || key === "metaparameters" || key === "traceDisplaySettings") {
    nodeGraphMvp.sharedInspectorActive = key;
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
function openNodeGraphUnifiedWindowPage(page = "", options = {}) {
  const key = String(page || "").trim();
  // Visibility is a standalone floating window with its own saved seat/size.
  // Never fold it into the shared Command Center / Modules geometry.
  if (key === "visibilityMenu") {
    if (typeof setNodeGraphVisibilityMenuOpen === "function") {
      setNodeGraphVisibilityMenuOpen(true);
      return true;
    }
    return false;
  }
  const config = nodeGraphUnifiedWindowPageConfig(key);
  if (!config) {
    return false;
  }

  // Same page already open → attention only. Re-applying the seat is what
  // nudged the window a few pixels on every nav click.
  if (!options.force && focusNodeGraphUnifiedWindowPage(key)) {
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
        // Always blank from nav — only right-click on a slider fills the form.
        if (typeof openBlankNodeMetadataPopover === "function") {
          openBlankNodeMetadataPopover(options.event || {});
        } else if (typeof openNodeGraphMetaparametersFromContextWindow === "function") {
          openNodeGraphMetaparametersFromContextWindow();
        }
        break;
      case "traceDisplaySettings": {
        // Selected display face(s) → open settings (multi-select aware).
        // Otherwise blank page: "Right-click on a display".
        const fromSelection = typeof nodeGraphTraceDisplaySettingsPrimaryFromSelection === "function"
          ? nodeGraphTraceDisplaySettingsPrimaryFromSelection()
          : (typeof nodeGraphSingleSelectedNodeId === "function"
            ? nodeGraphSingleSelectedNodeId()
            : "");
        const nodeId = String(
          options.nodeId
          || fromSelection
          || nodeGraphMvp.sceneContextTargetNode
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
      default:
        break;
    }
  } finally {
    nodeGraphMvp._unifiedWindowSwitching = false;
    nodeGraphMvp._unifiedWindowPendingPosition = null;
  }

  // 3. Seat once. 4. Re-assert only this page is visible.
  const element = nodeGraphUnifiedWindowElement(key);
  if (element) {
    element.hidden = false;
    if (seat) {
      seatNodeGraphUnifiedWindow(element, key, seat);
    } else if (typeof raiseNodeGraphFloatingWindow === "function") {
      raiseNodeGraphFloatingWindow(element);
    }
  }
  assertOnlyNodeGraphUnifiedWindowPageVisible(key);
  markNodeGraphUnifiedWindowPage(key);
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
  if (nodeGraphMvp._unifiedWindowSwitching) {
    markNodeGraphUnifiedWindowPage(key);
    return;
  }

  // Independent open (toolbar / hotkey / right-click that didn't use the switcher).
  captureNodeGraphUnifiedWindowSeat(key);
  closeOtherNodeGraphUnifiedWindowPages(key);
  if (element && !element.hidden) {
    const seat = nodeGraphUnifiedWindowSeatFromElement(element);
    if (seat) {
      storeNodeGraphUnifiedWindowSeat(seat);
    }
  }
  assertOnlyNodeGraphUnifiedWindowPageVisible(key);
  markNodeGraphUnifiedWindowPage(key);
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
  if (!nav.children.length) {
    return null;
  }
  return nav;
}

function ensureNodeGraphUnifiedWindowNavHost(element, options = {}) {
  if (!element) {
    return null;
  }
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
        const existing = element.querySelector("#nodeModuleShopUnifiedNavHost, .node-module-shop-column > .node-unified-window-nav-host");
        if (existing) {
          return existing;
        }
        const controls = element.querySelector(".node-module-shop-controls");
        if (controls) {
          return ensureNodeGraphUnifiedWindowNavHost(element, { insertBefore: controls });
        }
        return ensureNodeGraphUnifiedWindowNavHost(element, {
          prependTo: element.querySelector(".node-module-shop-column") || element,
        });
      },
    },
    {
      elementId: "nodeModuleActionsWindow",
      page: "moduleActions",
      prepare(element) {
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
        return ensureNodeGraphUnifiedWindowNavHost(element);
      },
    },
  ];
  for (const mount of mounts) {
    const element = document.getElementById(mount.elementId);
    if (!element) {
      continue;
    }
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
    if (nodeId && typeof setNodeGraphSelection === "function") {
      setNodeGraphSelection({ type: "node", id: nodeId });
    }
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
  if (nodeId && typeof setNodeGraphSelection === "function") {
    setNodeGraphSelection({ type: "node", id: nodeId });
  }
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
