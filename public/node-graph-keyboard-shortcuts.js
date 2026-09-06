function nodeGraphEventTargetIsEditable(target) {
  return target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * True when keyboard shortcuts must yield to typing (text/search fields).
 * Range / checkbox / button inputs do not count — Shift+arrows still resize.
 */
function nodeGraphEventTargetIsTextEditable(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest?.("[contenteditable='true']")) {
    return true;
  }
  if (typeof nodeGraphTextBoxIsTypingElement === "function" && nodeGraphTextBoxIsTypingElement(target)) {
    return true;
  }
  if (target.closest?.(".node-text-box-input, #nodeSceneTextBoxTextInput, #nodeSceneAliasInput, #nodeSceneKnobTextInput, [data-knob-face-label]")) {
    return true;
  }
  const field = target.closest?.("textarea, select, input");
  if (!field) {
    return false;
  }
  if (field.tagName === "TEXTAREA" || field.tagName === "SELECT") {
    return true;
  }
  if (field.tagName !== "INPUT") {
    return false;
  }
  if (field.readOnly || field.disabled) {
    return false;
  }
  const type = String(field.type || "text").toLowerCase();
  return [
    "text",
    "search",
    "email",
    "url",
    "password",
    "tel",
    "number",
  ].includes(type);
}

/**
 * Blur a focused text field when the user clicks the modular area / modules /
 * sliders / etc. Module drag and slider handlers call preventDefault on
 * pointerdown, which otherwise leaves Search modules focused and steals
 * Shift+arrow (and every other bare-key shortcut).
 */
function nodeGraphBlurActiveTextEditableIfOutside(eventTarget) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !nodeGraphEventTargetIsTextEditable(active)) {
    return false;
  }
  if (eventTarget instanceof Node) {
    if (active === eventTarget || active.contains(eventTarget)) {
      return false;
    }
    const label = eventTarget instanceof Element ? eventTarget.closest("label") : null;
    if (label && (label.contains(active) || label.control === active)) {
      return false;
    }
    // Moving into another *writable* text field — let the browser handle focus.
    // Read-only header titles (rename locked) must not block blur of an active
    // alias/title editor when the user clicks another module.
    if (nodeGraphEventTargetIsTextEditable(eventTarget)) {
      return false;
    }
  }
  try {
    active.blur();
  } catch {
    // ignore
  }
  return true;
}

function nudgeSelectedNodeGraphModulesOnGrid(axis, direction) {
  const selectedNodeIds = new Set([...nodeGraphSelectedNodeIds()].filter((id) =>
    nodeGraphMvp.activeNodes.has(id),
  ));
  if (!selectedNodeIds.size) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let movedCount = 0;
  for (const patchNode of patch.nodes) {
    if (!selectedNodeIds.has(patchNode.id)) {
      continue;
    }
    const gridKey = axis === "x" ? "gx" : "gy";
    const gridValue = Number(patchNode[gridKey]);
    patchNode[gridKey] = (Number.isFinite(gridValue) ? gridValue : 0) + direction;
    movedCount += 1;
  }
  if (!movedCount) {
    return false;
  }

  commitNodeGraphPatch(patch, {
    layoutEdit: true,
    status: movedCount === 1 ? "module moved" : "modules moved",
  });
  return true;
}

function nodeGraphCanvasScriptSourceWithGridUnits(source, widthGu, heightGu) {
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits("canvas", widthGu);
  const nextHeightGu = normalizeNodeGraphModuleHeightUnits("canvas", heightGu);
  const gridLine = `canvas.grid(${nextWidthGu}, ${nextHeightGu});`;
  const baseSource = String(source || nodeGraphCanvasScriptDefaultSource || "").trim();
  const gridPattern = /(^|\n)\s*canvas\.grid\s*\(\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)\s*;?/i;
  if (gridPattern.test(baseSource)) {
    return baseSource.replace(gridPattern, (match, prefix) => `${prefix}${gridLine}`);
  }
  return `${gridLine}\n${baseSource}`;
}

function resizeNodeGraphCanvasModuleOnGrid(patchNode, delta) {
  if (nodeGraphModuleSizingCapabilities(patchNode?.type).moduleHeight !== "canvasScript") {
    return false;
  }
  const canvasScript = normalizeNodeGraphCanvasScript(patchNode.canvasScript);
  const currentWidthGu = nodeGraphPatchNodeGridWidthUnits(patchNode);
  const currentHeightGu = nodeGraphPatchNodeGridHeightUnits(patchNode);
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits("canvas", currentWidthGu + delta);
  if (nextWidthGu === currentWidthGu) {
    return false;
  }
  const source = nodeGraphCanvasScriptSourceWithGridUnits(canvasScript.source, nextWidthGu, currentHeightGu);
  patchNode.canvasScript = normalizeNodeGraphCanvasScript({ ...canvasScript, source });
  delete patchNode.widthGu;
  delete patchNode.heightGu;
  return true;
}

function resizeNodeGraphHeightAdjustableModuleOnGrid(patchNode, delta) {
  const capabilities = nodeGraphModuleSizingCapabilities(patchNode?.type);
  if (capabilities.moduleHeight === "canvasScript") {
    return false;
  }
  if (
    capabilities.moduleHeight === "textBox"
    || capabilities.moduleHeight === "custom"
    || capabilities.displayHeight
  ) {
    return nodeGraphApplyModuleHeightDelta(patchNode, delta);
  }
  return false;
}

function resizeNodeGraphWidthAdjustableModuleOnGrid(patchNode, delta) {
  const capabilities = nodeGraphModuleSizingCapabilities(patchNode?.type);
  if (!capabilities.width) {
    return false;
  }
  if (capabilities.moduleHeight === "canvasScript") {
    return resizeNodeGraphCanvasModuleOnGrid(patchNode, delta);
  }
  const currentWidthGu = nodeGraphPatchNodeGridWidthUnits(patchNode);
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits(patchNode.type, currentWidthGu + delta);
  if (nextWidthGu === currentWidthGu) {
    return false;
  }
  if (nextWidthGu === nodeGraphDefaultModuleGridWidthUnits(patchNode.type)) {
    delete patchNode.widthGu;
  } else {
    patchNode.widthGu = nextWidthGu;
  }
  return true;
}

function resizeSelectedNodeGraphModulesOnGrid(axis, delta) {
  const selectedNodeIds = new Set([...nodeGraphSelectedNodeIds()].filter((id) =>
    nodeGraphMvp.activeNodes.has(id),
  ));
  if (!selectedNodeIds.size) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const patchNode of patch.nodes) {
    if (!selectedNodeIds.has(patchNode.id)) {
      continue;
    }

    if (axis === "height") {
      if (resizeNodeGraphHeightAdjustableModuleOnGrid(patchNode, delta)) {
        changedCount += 1;
      }
      continue;
    }

    if (axis === "width") {
      if (resizeNodeGraphWidthAdjustableModuleOnGrid(patchNode, delta)) {
        changedCount += 1;
      }
      continue;
    }

    continue;
  }

  if (!changedCount) {
    return false;
  }
  const ids = [...selectedNodeIds];
  const status = axis === "height" ? "module height changed" : "module width changed";
  // Chrome path: update size CSS on the live module. A full applyNodeGraphPatchToDom
  // remounts every face/scope and drops the app below 1 fps on key repeat.
  const commitOpts = typeof nodeGraphChromeCommitOptions === "function"
    ? nodeGraphChromeCommitOptions(ids, { status })
    : {
      chromeEdit: true,
      chromeNodeIds: ids,
      deferUiPanels: true,
      markPending: false,
      skipLivePlan: true,
      status,
    };
  commitNodeGraphPatch(patch, commitOpts);
  return true;
}

function handleNodeGraphKeydown(event) {
  if (event.key === "Escape" && typeof nodeGraphScreenSoloIsActive === "function" && nodeGraphScreenSoloIsActive()) {
    event.preventDefault();
    event.stopPropagation();
    endNodeGraphScreenSolo();
    return;
  }
  // Title + area Text Box share this gate. Check before window-nudge / H-V-M.
  if (
    !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && typeof nodeGraphTextBoxIsTyping === "function"
    && nodeGraphTextBoxIsTyping(event)
  ) {
    return;
  }
  if (handleNodeGraphFloatingWindowKeyboardNudge(event)) {
    return;
  }
  if (event.key === "Escape" && nodeGraphWireInteractions?.cancelPortConnectionMode?.()) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape" && document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view")) {
    setNodeGraphViewMode("modular");
    return;
  }
  // While typing in a text/search field (module search, name boxes, code
  // editor), bare-key shortcuts must not fire -- e.g. Space stolen for
  // transport, or single-letter view hotkeys while typing. Range/checkbox
  // focus does not block shortcuts. Modifier combos (Ctrl+Z, etc.) still work.
  if (nodeGraphEventTargetIsTextEditable(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return;
  }
  // Space toggles simulation play/pause when not typing.
  // Text inputs are excluded above so module search and name fields can take spaces.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === "Space") {
    event.preventDefault();
    event.stopPropagation();
    // If Input/Output (or another toolbar toggle) still has focus after a click,
    // blur it so Space cannot also synthesize a button click / toggle-off.
    const active = document.activeElement;
    if (
      active
      && active !== document.body
      && typeof active.blur === "function"
      && (
        active.id === "nodeLiveInputButton"
        || active.id === "nodeLiveOutputButton"
        || active.classList?.contains("node-live-toggle")
        || active.closest?.(".node-live-toggle-palette")
      )
    ) {
      active.blur();
    }
    // Space is play/pause, not the dedicated Play button (play never pauses).
    if (typeof nodeGraphTransportHandleAction === "function") {
      nodeGraphTransportHandleAction("playpause");
    } else if (nodeGraphMvp?.live?.node) {
      const isPaused = (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
      const nextSpeed = isPaused ? 1 : 0;
      if (typeof setNodeGraphLiveSpeed === "function") {
        setNodeGraphLiveSpeed(nextSpeed);
      }
    } else if (typeof setNodeGraphLiveOutputEnabled === "function") {
      setNodeGraphLiveOutputEnabled(true);
    } else if (typeof toggleNodeGraphLiveOutput === "function") {
      toggleNodeGraphLiveOutput();
    }
    return;
  }
  // Ctrl/Cmd+S → native save dialog for the current patch (remembers last
  // File System Access folder when available). Code Screen owns Ctrl+S when
  // focus is inside it (draft apply / metadata).
  if (
    (event.ctrlKey || event.metaKey)
    && !event.shiftKey
    && !event.altKey
    && event.key.toLowerCase() === "s"
  ) {
    if (event.target?.closest?.("#nodeCodeScreenView, .node-code-screen-view")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof saveNodeGraphPatchWithNativeDialog === "function") {
      void saveNodeGraphPatchWithNativeDialog();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undoNodeGraphPatch();
    return;
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
  ) {
    event.preventDefault();
    redoNodeGraphPatch();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    alignNodeGraphViewToGrid();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    if (nodeGraphEventTargetIsTextEditable(event.target)) {
      return;
    }
    event.preventDefault();
    selectAllNodeGraphModules();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (copySelectedNodeGraphModule()) {
      event.preventDefault();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    if (duplicateFocusedNodeGraphGraphNode()) {
      event.preventDefault();
    }
    return;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("moduleBrowser");
    } else if (typeof openNodeGraphModuleShop === "function") {
      openNodeGraphModuleShop(null);
    }
    // Already-open unified pages only pulse and never reach the shop opener,
    // so Shift+A must always land the caret in search after the window is up.
    if (typeof resetNodeGraphModuleShopSearch === "function") {
      resetNodeGraphModuleShopSearch();
    }
    if (typeof renderNodeGraphModuleStoreCatalog === "function") {
      renderNodeGraphModuleStoreCatalog();
    }
    if (typeof focusNodeGraphModuleShopSearch === "function") {
      focusNodeGraphModuleShopSearch();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    if (typeof cycleNodeGraphCommandCenterPresentation === "function") {
      cycleNodeGraphCommandCenterPresentation();
    } else if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("commandCenter");
    } else if (typeof openNodeGraphCommandCenter === "function") {
      openNodeGraphCommandCenter();
    }
    return;
  }
  // ? (Shift+/ on US) → open Command Center.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "?") {
    event.preventDefault();
    if (typeof openNodeGraphUnifiedWindowPage === "function") {
      openNodeGraphUnifiedWindowPage("commandCenter");
    } else if (typeof openNodeGraphCommandCenter === "function") {
      openNodeGraphCommandCenter();
    }
    return;
  }
  // V → view cycle: hide top bar → also hide bottom bar → show both.
  // Phone / condensed modular frame is click/touch only (no M hotkey).
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "v") {
    event.preventDefault();
    if (typeof toggleNodeGraphAppChromeBarsVisibility === "function") {
      toggleNodeGraphAppChromeBarsVisibility();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    if (typeof toggleNodeGraphConstraintGuideVisibility === "function") {
      toggleNodeGraphConstraintGuideVisibility();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (typeof toggleNodeGraphStandaloneMidiKeyboard === "function") {
      toggleNodeGraphStandaloneMidiKeyboard();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    if (typeof toggleNodeGraphSelectedScreensFullscreen === "function") {
      toggleNodeGraphSelectedScreensFullscreen();
    }
    return;
  }
  // T → docked tooltips on/off.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    if (typeof toggleNodeGraphTooltipWindow === "function") {
      toggleNodeGraphTooltipWindow();
    }
    return;
  }
  // Z → center view on selection (else all modules) at current zoom. Ctrl+Z stays Undo.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (typeof nodeGraphCenterViewOnModules === "function") {
      nodeGraphCenterViewOnModules({ preferSelection: true });
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "a") {
    if (addFocusedNodeGraphGraphNode()) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "[") {
    if (selectFocusedNodeGraphGraphNodeOffset(-1)) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "]") {
    if (selectFocusedNodeGraphGraphNodeOffset(1)) {
      event.preventDefault();
    }
    return;
  }
  if (nudgeFocusedNodeGraphGraphNode(event)) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const shiftArrowSizeActions = {
      ArrowLeft: ["width", -1],
      ArrowRight: ["width", 1],
      ArrowDown: ["height", 1],
      ArrowUp: ["height", -1],
    };
    const action = shiftArrowSizeActions[event.key];
    if (action) {
      if (resizeSelectedNodeGraphModulesOnGrid(action[0], action[1])) {
        event.preventDefault();
      }
      return;
    }
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const arrowMoveActions = {
      ArrowDown: ["y", 1],
      ArrowLeft: ["x", -1],
      ArrowRight: ["x", 1],
      ArrowUp: ["y", -1],
    };
    const action = arrowMoveActions[event.key];
    if (action) {
      if (nudgeSelectedNodeGraphModulesOnGrid(action[0], action[1])) {
        event.preventDefault();
      }
      return;
    }
  }
  // Delete only -- Backspace is not a module-delete hotkey (it steals typing
  // focus and was never an approved shortcut).
  if (event.key !== "Delete") {
    return;
  }
  // Don't delete modules while the user is typing in a text field.
  if (nodeGraphEventTargetIsTextEditable(event.target)) {
    return;
  }

  if (removeFocusedNodeGraphGraphNode()) {
    event.preventDefault();
    return;
  }
  if (nodeGraphSelectionCanDelete()) {
    event.preventDefault();
    deleteSelectedNodeGraphItem();
  }
}

/**
 * Tab shows the app-wide focus ring (`body.keyboard-nav`); any pointer down
 * clears it so the ring does not stick after you go back to the mouse.
 * Escape also clears the cue (and blurs non-text focus targets).
 */
function installNodeGraphKeyboardNavFocusCue() {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  if (!body || body.dataset.keyboardNavFocusBound === "true") {
    return;
  }
  body.dataset.keyboardNavFocusBound = "true";
  const enable = () => body.classList.add("keyboard-nav");
  const disable = () => body.classList.remove("keyboard-nav");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      enable();
      return;
    }
    if (event.key !== "Escape" || !body.classList.contains("keyboard-nav")) {
      return;
    }
    disable();
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === body || active === document.documentElement) {
      return;
    }
    if (typeof nodeGraphEventTargetIsTextEditable === "function" && nodeGraphEventTargetIsTextEditable(active)) {
      return;
    }
    try {
      active.blur();
    } catch {
      // ignore
    }
  }, true);
  document.addEventListener("pointerdown", disable, true);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installNodeGraphKeyboardNavFocusCue, { once: true });
  } else {
    installNodeGraphKeyboardNavFocusCue();
  }
}
