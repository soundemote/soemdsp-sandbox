function syncNodeGraphPatchMetadataFromSlider(slider, options = {}) {
  const node = slider?.closest(".dsp-node")?.dataset.node;
  const key = slider?.dataset.param;
  if (!node || !key) {
    return;
  }
  const patchNode = nodeGraphMvp.patch.nodes.find((candidate) => candidate.id === node);
  if (!patchNode) {
    return;
  }
  patchNode.paramMeta = {
    ...(patchNode.paramMeta || {}),
    [key]: normalizeNodeGraphPatchParameterMetadata(
      patchNode.type,
      key,
      nodeSliderMetadata(slider),
    ),
  };
  patchNode.params = {
    ...(patchNode.params || {}),
    [key]: normalizeNodeGraphPatchParameter(
      patchNode.type,
      key,
      nodeGraphReadNodeNumber(node, key),
      patchNode.paramMeta[key],
    ),
  };
  syncNodeGraphScriptView(options.status || "metadata synced", true);
  renderNodeGraphExecutionPlanDebug();
  syncNodeGraphFilterCurveDisplays();
  scheduleNodeGraphLiveParameterSync();
  if (typeof setNodeGraphPatchDirtyState === "function") {
    setNodeGraphPatchDirtyState("edited");
  } else if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    nodeGraphMvp.patchDirtyState = "edited";
    saveNodeGraphWorkingPatchToUserSettings();
  }
  if (options.record) {
    recordNodeGraphHistory();
  } else {
    renderNodeGraphHistoryControls();
  }
}

function syncNodeGraphPatchParameterFromSlider(slider, options = {}) {
  const node = slider?.closest(".dsp-node")?.dataset.node;
  const key = slider?.dataset.param;
  if (!node || !key) {
    return;
  }
  const patchNode = nodeGraphMvp.patch.nodes.find((candidate) => candidate.id === node);
  if (!patchNode) {
    return;
  }
  patchNode.paramMeta = {
    ...(patchNode.paramMeta || {}),
    [key]: normalizeNodeGraphPatchParameterMetadata(
      patchNode.type,
      key,
      patchNode.paramMeta?.[key] || nodeSliderMetadata(slider),
    ),
  };
  patchNode.params = {
    ...(patchNode.params || {}),
    [key]: normalizeNodeGraphPatchParameter(
      patchNode.type,
      key,
      nodeGraphReadNodeNumber(node, key),
      patchNode.paramMeta[key],
    ),
  };
  if (
    nodeGraphModuleIsGraphType(patchNode.type) &&
    typeof nodeGraphGraphEndpointYLockEnabledForNode === "function" &&
    typeof nodeGraphGraphWithLockedEndpointY === "function" &&
    nodeGraphGraphEndpointYLockEnabledForNode(patchNode)
  ) {
    patchNode.graph = nodeGraphGraphWithLockedEndpointY(patchNode.graph);
  }
  // Defer header/brand updates until rAF to avoid dirtying layout mid-pointer-event
  if (options.interaction === "drag") {
    nodeGraphMvp.patchDirtyState = "edited";
    nodeGraphMvp._needsHeaderSync = true;
  } else if (options.deferAutosave) {
    nodeGraphMvp.patchDirtyState = "edited";
    if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      syncNodeGraphCurrentSavedPatchHeader();
    }
  } else if (typeof setNodeGraphPatchDirtyState === "function") {
    setNodeGraphPatchDirtyState("edited");
  } else if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    nodeGraphMvp.patchDirtyState = "edited";
    saveNodeGraphWorkingPatchToUserSettings();
  }
  if (options.deferUi) {
    return;
  }
  // transport's "BPM" param mirrors the patch-wide tempo, not an independent
  // per-node value -- committing it here writes patch.timing.tempoBpm too
  // (via the same clone-then-commit path the header's own BPM field uses) so
  // the change reaches the worklet's this.timing and every other transport
  // node's own BPM slider, instead of only updating this one node's params.
  if (patchNode.type === "transport" && key === "bpm") {
    const nextPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    nextPatch.timing = normalizeNodeGraphPatchTiming({
      ...nextPatch.timing,
      tempoBpm: patchNode.params.bpm,
    });
    syncNodeGraphTransportBpmParams(nextPatch, nextPatch.timing);
    commitNodeGraphPatch(nextPatch, {
      markPending: false,
      status: "bpm synced",
    });
    return;
  }
  syncNodeGraphScriptView(options.status || "parameter synced", true);
  renderNodeGraphExecutionPlanDebug();
  syncNodeGraphGhostSliders();
  syncNodeGraphFilterCurveDisplays();
  if (nodeGraphModuleIsGraphType(patchNode.type) && typeof syncNodeGraphGraphDisplaysForNode === "function") {
    syncNodeGraphGraphDisplaysForNode(node, patchNode);
  }
  if (options.record) {
    recordNodeGraphHistory();
  } else {
    renderNodeGraphHistoryControls();
  }
}

function updateNodeSliderCurrentValue(slider, rawValue) {
  if (!slider) {
    return;
  }

  const normalizedValue = String(rawValue).trim();
  const choiceIndex = nodeSliderChoiceIndexFromText(slider, normalizedValue);
  const value = choiceIndex ?? parseNodeSliderMathExpression(normalizedValue);
  if (!Number.isFinite(value)) {
    syncNodeSliderReadout(slider);
    return;
  }

  const unboundedMin = slider.dataset.unboundedMin === "true";
  const unboundedMax = slider.dataset.unboundedMax === "true";
  const min = Number(slider.min);
  const max = Number(slider.max);
  if ((unboundedMin && Number.isFinite(min) && value < min) || (unboundedMax && Number.isFinite(max) && value > max)) {
    slider.dataset.unboundedValue = String(value);
    slider.value = String(normalizeNodeSliderValue(slider, value));
  } else {
    delete slider.dataset.unboundedValue;
    slider.value = String(normalizeNodeSliderValue(slider, value));
  }
  syncNodeSliderReadout(slider);
  syncNodeGraphPatchParameterFromSlider(slider, {
    record: true,
    status: "parameter changed",
  });
  if (nodeGraphMvp.metadataEditorTarget === slider.id) {
    fillNodeMetadataPopover(slider);
  }
  markNodeGraphRenderPending();
  scheduleNodeGraphLiveParameterSync();
}

let nodeSliderDragAutosaveTimer = 0;

function scheduleNodeGraphModuleScopeDrawIfNeeded() {
  // Fast-path: if a draw rAF is already pending, the loop is self-sustaining.
  if (nodeGraphModuleScopeState?.drawFrame) return;
  if (
    typeof scheduleNodeGraphModuleScopeDraw === "function" &&
    (typeof nodeGraphModuleScopeHasDrawableSlots !== "function" || nodeGraphModuleScopeHasDrawableSlots()) &&
    (typeof nodeGraphModuleScopeTracesOff !== "function" || !nodeGraphModuleScopeTracesOff())
  ) {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function clearNodeSliderDragAutosaveTimer() {
  if (nodeSliderDragAutosaveTimer) {
    window.clearTimeout(nodeSliderDragAutosaveTimer);
    nodeSliderDragAutosaveTimer = 0;
  }
}

function scheduleNodeSliderDragAutosave() {
  if (nodeSliderDragAutosaveTimer) {
    return;
  }
  nodeSliderDragAutosaveTimer = window.setTimeout(() => {
    nodeSliderDragAutosaveTimer = 0;
    if (nodeGraphMvp.sliderDragging && typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings();
      scheduleNodeSliderDragAutosave();
    }
  }, 400);
}

function commitNodeSliderDragValue(slider, status = "parameter changed") {
  clearNodeSliderDragAutosaveTimer();
  syncNodeGraphPatchParameterFromSlider(slider, {
    record: true,
    status,
  });
  markNodeGraphRenderPending();
  scheduleNodeGraphLiveParameterSync();
  scheduleNodeGraphModuleScopeDrawIfNeeded();
}

function setNodeSliderValue(slider, value, options = {}) {
  const isDrag = options.interaction === "drag";
  const number = Number(value);
  const min = Number(slider.min);
  const max = Number(slider.max);
  const unboundedMin = slider.dataset.unboundedMin === "true";
  const unboundedMax = slider.dataset.unboundedMax === "true";
  if (
    Number.isFinite(number) &&
    ((unboundedMin && Number.isFinite(min) && number < min) ||
      (unboundedMax && Number.isFinite(max) && number > max))
  ) {
    slider.dataset.unboundedValue = String(number);
  } else {
    delete slider.dataset.unboundedValue;
  }
  const normalized = normalizeNodeSliderValue(slider, value);
  // Frame-gate during drags: if already pending rAF update, skip redundant patch work.
  // The flush will apply the latest value — object-spreads mid-frame are wasted.
  const alreadyPending = isDrag && nodeGraphMvp?._pendingReadoutUpdates?.has(slider);
  if (isDrag) {
    scheduleNodeSliderReadoutUpdate(slider, normalized);
  } else {
    slider.value = String(normalized);
    syncNodeSliderReadout(slider);
  }
  if (!alreadyPending) {
    syncNodeGraphPatchParameterFromSlider(slider, {
      interaction: options.interaction,
      deferAutosave: isDrag,
      deferUi: true,
    });
    scheduleNodeGraphModuleScopeDrawIfNeeded();
  }
  if (isDrag) {
    scheduleNodeSliderDragAutosave();
  } else {
    syncNodeGraphFilterCurveDisplays();
    syncNodeGraphGhostSliders();
    markNodeGraphRenderPending();
  }
  if (!alreadyPending) {
    scheduleNodeGraphLiveParameterSync();
  }
}

function nodeSliderSegmentValueFromPointer(slider, surface, clientX) {
  const choices = parseNodeMetadataChoices(slider.dataset.choices);
  if (!choices.length) {
    return null;
  }
  const rect = surface.getBoundingClientRect();
  const width = Math.max(1, nodeSliderElementLayoutWidth(surface));
  const scale = nodeSliderElementVisualScale(surface);
  const progress = clampNodeSliderValue(((clientX - rect.left) / scale) / width, 0, 0.999999);
  const index = Math.min(choices.length - 1, Math.floor(progress * choices.length));
  return Number(slider.min) + index;
}

function setNodeChoiceSliderFromPointer(slider, surface, clientX, options = {}) {
  const value = nodeSliderSegmentValueFromPointer(slider, surface, clientX);
  if (!Number.isFinite(value)) {
    return false;
  }
  const current = Number(slider.dataset.unboundedValue ?? slider.value);
  if (Number.isFinite(current) && Math.round(current) === Math.round(value)) {
    return false;
  }
  setNodeSliderValue(slider, value, options);
  return true;
}

function updateNodeSliderDotCursor(event) {
  if (!event) {
    return;
  }
  document.body.style.setProperty("--node-slider-cursor-x", `${event.clientX}px`);
  document.body.style.setProperty("--node-slider-cursor-y", `${event.clientY}px`);
}

function syncNodeSliderHiddenMouseClass() {
  document.body.classList.toggle(
    "node-hide-mouse-while-dragging",
    Boolean(nodeGraphMvp.sliderDragging) && nodeGraphMvp.hideMouseWhileDragging !== false,
  );
}

function clearNodeSliderDotCursor() {
  document.body.classList.remove("node-hide-mouse-while-dragging");
  document.body.classList.remove("node-slider-dragging");
  document.body.style.removeProperty("--node-slider-cursor-x");
  document.body.style.removeProperty("--node-slider-cursor-y");
}

// ── Pointer Lock: infinite drag with the cursor held in place ──────────────
// While a slider is dragged we lock the pointer so it never hits a screen edge;
// movementX/Y drives the value and the OS cursor is hidden (the app's dot, set
// at drag start, stays put). Falls back to absolute-position dragging if lock
// is unavailable or the user has hide-mouse turned off.
function requestNodeSliderPointerLock(surface) {
  if (!surface || typeof surface.requestPointerLock !== "function") {
    return;
  }
  try {
    const result = surface.requestPointerLock({ unadjustedMovement: true });
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        try { surface.requestPointerLock(); } catch (_) {}
      });
    }
  } catch (_) {
    try { surface.requestPointerLock(); } catch (__) {}
  }
}

function handleNodeSliderPointerLockChange() {
  const drag = nodeGraphMvp.sliderDragging;
  if (!drag) {
    return;
  }
  const wasLocked = Boolean(drag.pointerLocked);
  drag.pointerLocked = document.pointerLockElement === drag.surface;
  if (!wasLocked && drag.pointerLocked) {
    // Lock just engaged: anchor here so we don't snap back to the pre-lock value.
    drag.startTravel = nodeSliderTravelFromValue(drag.slider, Number(drag.slider.value));
    drag.lockAccumX = 0;
    drag.lockAccumY = 0;
  } else if (wasLocked && !drag.pointerLocked) {
    // Lock lost (e.g. Esc): re-anchor to the visible cursor on the next move.
    drag.reanchorPending = true;
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerlockchange", handleNodeSliderPointerLockChange);
}

function nodeSliderValueFromPointer(slider, surface, clientX) {
  return nodeSliderValueFromPointerTravel(slider, nodeSliderTravelFromPointer(slider, surface, clientX));
}

function nodeSliderFineTuneScale(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function nodeSliderKeyboardStep(slider, event) {
  const choices = parseNodeMetadataChoices(slider?.dataset?.choices || "");
  if (
    nodeSliderShouldDisplayChoices(slider) &&
    nodeSliderShouldDivideChoicesVisibly(slider) &&
    choices.length > 0
  ) {
    return 1;
  }
  const declaredStep = Number(slider?.dataset?.step);
  if (Number.isFinite(declaredStep) && declaredStep > 0) {
    return declaredStep * (event.shiftKey ? 10 : 1) * (event.ctrlKey || event.metaKey ? 0.1 : 1);
  }
  const min = Number(slider?.min);
  const max = Number(slider?.max);
  const range = Number.isFinite(max - min) && max > min ? max - min : 1;
  return range * (event.shiftKey ? 0.1 : 0.01) * (event.ctrlKey || event.metaKey ? 0.1 : 1);
}

function stepNodeSliderFromKeyboard(event) {
  const surface = event.currentTarget?.classList?.contains("node-slider-readout")
    ? event.currentTarget
    : event.target?.closest?.(".node-slider-readout");
  const slider = document.getElementById(surface?.dataset?.sliderTarget || "");
  if (!surface || !slider) {
    return false;
  }

  const keySteps = {
    ArrowDown: -1,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: 1,
    PageDown: -10,
    PageUp: 10,
  };
  const min = Number(slider.min);
  const max = Number(slider.max);
  const current = Number(slider.value);
  let nextValue = current;
  if (event.key === "Home") {
    nextValue = min;
  } else if (event.key === "End") {
    nextValue = max;
  } else if (Object.hasOwn(keySteps, event.key)) {
    nextValue = current + keySteps[event.key] * nodeSliderKeyboardStep(slider, event);
  } else {
    return false;
  }

  setNodeSliderValue(slider, quantizeNodeSliderDragValue(slider, nextValue));
  syncNodeGraphPatchParameterFromSlider(slider, {
    record: true,
    status: "parameter changed",
  });
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function reanchorNodeSliderDragAtPointer(drag, event) {
  drag.startTravel = nodeSliderTravelFromValue(drag.slider, Number(drag.slider.value));
  drag.startX = event.clientX;
  drag.startY = event.clientY;
}

const NODE_SLIDER_WRAP_MARGIN = 30;
function wrapNodeSliderDragAtScreenEdge(drag, event) {
  const x = event.clientX;
  const y = event.clientY;
  const { innerWidth: w, innerHeight: h } = window;
  if (x > NODE_SLIDER_WRAP_MARGIN && x < w - NODE_SLIDER_WRAP_MARGIN &&
      y > NODE_SLIDER_WRAP_MARGIN && y < h - NODE_SLIDER_WRAP_MARGIN) {
    return;
  }
  reanchorNodeSliderDragAtPointer(drag, event);
}

function nodeSliderValueAtPointer(slider, surface, event) {
  if (!slider || !surface || !event) {
    return NaN;
  }
  return nodeSliderShouldDisplayChoices(slider) && nodeSliderShouldDivideChoicesVisibly(slider)
    ? nodeSliderSegmentValueFromPointer(slider, surface, event.clientX)
    : nodeSliderValueFromPointer(slider, surface, event.clientX);
}

function setNodeSliderValueAtPointer(slider, surface, event, options = {}) {
  const value = nodeSliderValueAtPointer(slider, surface, event);
  if (!Number.isFinite(value)) {
    return false;
  }
  setNodeSliderValue(slider, quantizeNodeSliderDragValue(slider, value), options);
  return true;
}

function beginNodeSliderDrag(event) {
  if (nodeGraphMvp.sliderDragging || event.button > 0) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (typeof nodeGraphSettingsTextControlFromTarget === "function" && nodeGraphSettingsTextControlFromTarget(event.target)) {
    return;
  }

  const surface = event.currentTarget?.classList?.contains("node-slider-readout")
    ? event.currentTarget
    : event.target?.closest?.(".node-slider-readout");
  if (!surface) {
    return;
  }

  // Double-click -> type-in edit, detected MANUALLY from pointerdown timing
  // instead of relying on the native "dblclick" event. The first click of a
  // double-click starts a drag that engages Pointer Lock (see
  // requestNodeSliderPointerLock below); the lock enter/exit around that
  // click makes Chrome swallow the native dblclick, which is how
  // double-click-to-type silently broke when pointer-lock dragging landed.
  // pointerdown always fires, so this path can't be suppressed. The old
  // `event.detail > 1` early-return is folded in here: either signal routes
  // to the editor instead of a second drag.
  const lastDown = nodeGraphMvp.sliderLastPointerDown;
  const now = performance.now();
  const isDoubleClick =
    event.detail > 1 ||
    (lastDown &&
      lastDown.surface === surface &&
      now - lastDown.time < 400 &&
      Math.abs(event.clientX - lastDown.x) < 6 &&
      Math.abs(event.clientY - lastDown.y) < 6);
  nodeGraphMvp.sliderLastPointerDown = { surface, time: now, x: event.clientX, y: event.clientY };
  if (isDoubleClick) {
    nodeGraphMvp.sliderLastPointerDown = null;
    event.preventDefault();
    event.stopPropagation();
    if (typeof beginNodeSliderReadoutEdit === "function") {
      beginNodeSliderReadoutEdit(surface);
    }
    return;
  }
  const slider = document.getElementById(surface.dataset.sliderTarget);
  if (!slider) {
    return;
  }

  const lane = nodeSliderVisualLane(surface, slider);
  const resetToDefaultOnClick = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  const jumpToPointerOnClick = event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey));
  const pointerMode = "relative";
  let startTravel = nodeSliderTravelFromValue(slider, Number(slider.value));
  if (jumpToPointerOnClick) {
    if (setNodeSliderValueAtPointer(slider, surface, event, { interaction: "drag" })) {
      startTravel = nodeSliderTravelFromValue(slider, Number(slider.value));
    }
  } else if (!resetToDefaultOnClick && nodeSliderShouldDisplayChoices(slider) && nodeSliderShouldDivideChoicesVisibly(slider)) {
    setNodeChoiceSliderFromPointer(slider, surface, event.clientX, { interaction: "drag" });
    startTravel = nodeSliderTravelFromValue(slider, Number(slider.value));
  }
  const surfaceRect = surface.getBoundingClientRect();
  nodeGraphMvp.sliderDragging = {
    moved: false,
    pointerId: event.pointerId ?? null,
    pointerMode,
    resetToDefaultOnClick,
    slider,
    surface,
    surfaceRect,
    startTravel,
    startX: event.clientX,
    startY: event.clientY,
    fineScale: nodeSliderFineTuneScale(event),
    visualScale: nodeSliderElementVisualScale(surface),
    width: lane.travelWidth,
    lockAccumX: 0,
    lockAccumY: 0,
    pointerLocked: false,
    wantsPointerLock: nodeGraphMvp.hideMouseWhileDragging !== false && !jumpToPointerOnClick,
  };
  surface.classList.add("value-dragging");
  document.body.classList.add("node-slider-dragging");
  syncNodeSliderHiddenMouseClass();
  nodeGraphWireInteractions?.clearHover?.();
  updateNodeSliderDotCursor(event);
  if (nodeGraphMvp.sliderDragging.wantsPointerLock) {
    // Pointer lock captures the pointer globally — setPointerCapture would throw
    // InvalidStateError alongside it, so use one or the other.
    requestNodeSliderPointerLock(surface);
  } else if (event.pointerId !== undefined) {
    try { surface.setPointerCapture(event.pointerId); } catch (_) {}
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeSlider(event) {
  const drag = nodeGraphMvp.sliderDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }

  // Pointer events already cover the mouse; ignore the duplicate mousemove
  // (and the same event re-dispatched by a second document listener) so
  // pointer-lock movement deltas are never double-counted.
  if (event.type === "mousemove" && typeof drag.pointerId === "number") {
    return;
  }
  if (drag._lastMoveEvent === event) {
    return;
  }
  drag._lastMoveEvent = event;

  const locked = Boolean(drag.pointerLocked) && document.pointerLockElement === drag.surface;

  // Lock just lost (e.g. Esc): re-anchor to the visible cursor so the
  // absolute-move fallback does not jump.
  if (!locked && drag.reanchorPending) {
    reanchorNodeSliderDragAtPointer(drag, event);
    drag.reanchorPending = false;
  }

  let horizontalDelta;
  let verticalDelta;
  if (locked) {
    // Infinite drag: accumulate raw pointer movement. The OS cursor stays put
    // and the dot (set at drag start) stays in place.
    drag.lockAccumX = (drag.lockAccumX || 0) + (event.movementX || 0);
    drag.lockAccumY = (drag.lockAccumY || 0) + (event.movementY || 0);
    horizontalDelta = drag.lockAccumX;
    verticalDelta = -drag.lockAccumY;
  } else {
    horizontalDelta = event.clientX - drag.startX;
    verticalDelta = drag.startY - event.clientY;
  }
  if (Math.abs(horizontalDelta) > 1 || Math.abs(verticalDelta) > 1) {
    drag.moved = true;
  }

  // ALT+click: jump slider to pointer position (needs an absolute cursor, so
  // only when not pointer-locked).
  if (!locked && event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey))) {
    if (setNodeSliderValueAtPointer(drag.slider, drag.surface, event, { interaction: "drag" })) {
      reanchorNodeSliderDragAtPointer(drag, event);
    }
    updateNodeSliderDotCursor(event);
    event.preventDefault();
    return;
  }

  // Fine/coarse scale from modifier keys — live per-event.
  // Re-anchor startTravel when scale changes to prevent value jump (10x delta).
  const currentFineScale = nodeSliderFineTuneScale(event);
  if (currentFineScale !== drag.fineScale) {
    drag.startTravel = nodeSliderTravelFromValue(drag.slider, Number(drag.slider.value));
    drag.fineScale = currentFineScale;
    if (locked) {
      drag.lockAccumX = 0;
      drag.lockAccumY = 0;
      horizontalDelta = 0;
      verticalDelta = 0;
    }
  }

  // Wrap pointer at screen edges for infinite drag when not pointer-locked.
  if (!locked) {
    wrapNodeSliderDragAtScreenEdge(drag, event);
  }

  const visualTravelWidth = Math.max(1, drag.width * (Number(drag.visualScale) || 1));
  const travelDelta = ((horizontalDelta + verticalDelta) / visualTravelWidth) * drag.fineScale;
  const nextTravel = drag.startTravel + travelDelta;
  setNodeSliderValue(
    drag.slider,
    quantizeNodeSliderDragValue(
      drag.slider,
      nodeSliderValueFromRelativeTravel(drag.slider, nextTravel),
    ),
    { interaction: "drag" },
  );
  // Re-anchor at travel boundaries to prevent value stagnation. In locked mode
  // reset the accumulator too, so reversing direction responds immediately
  // instead of first unwinding a huge accumulated delta (dead zone).
  if (nextTravel <= 0 || nextTravel >= 1) {
    if (locked) {
      drag.startTravel = nodeSliderTravelFromValue(drag.slider, Number(drag.slider.value));
      drag.lockAccumX = 0;
      drag.lockAccumY = 0;
    } else {
      reanchorNodeSliderDragAtPointer(drag, event);
    }
  }
  if (!locked) {
    updateNodeSliderDotCursor(event);
  }
  event.preventDefault();
}

function endNodeSliderDrag(event) {
  const drag = nodeGraphMvp.sliderDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }

  if (drag.wantsPointerLock && document.pointerLockElement) {
    try { document.exitPointerLock?.(); } catch (_) {}
  }
  drag.surface.classList.remove("value-dragging");
  clearNodeSliderDotCursor();
  if (event.pointerId !== undefined && drag.surface.hasPointerCapture?.(event.pointerId)) {
    drag.surface.releasePointerCapture(event.pointerId);
  }
  if (drag.resetToDefaultOnClick && !drag.moved) {
    setNodeSliderValue(drag.slider, Number(drag.slider.dataset.default), { interaction: "drag" });
  }
  commitNodeSliderDragValue(
    drag.slider,
    drag.resetToDefaultOnClick && !drag.moved ? "parameter reset to default" : "parameter changed",
  );
  nodeGraphMvp.sliderDragging = null;
}

// ── Deferred readout display (decouples value from display, C++ ParameterPrototype pattern) ──
// Moving the slider calls scheduleNodeSliderReadoutUpdate() which queues the display update.
// The display is flushed in the scope draw rAF AFTER all layout reads, avoiding forced reflow.

function scheduleNodeSliderReadoutUpdate(slider, normalized) {
  if (!nodeGraphMvp._pendingReadoutUpdates) {
    nodeGraphMvp._pendingReadoutUpdates = new Map();
  }
  nodeGraphMvp._pendingReadoutUpdates.set(slider, normalized);
}

function flushNodeSliderReadoutUpdates() {
  const pending = nodeGraphMvp?._pendingReadoutUpdates;
  if (!pending?.size) return;
  for (const [slider, normalized] of pending) {
    slider.value = String(normalized);
    syncNodeSliderReadout(slider);
  }
  pending.clear();
  if (nodeGraphMvp._needsHeaderSync && typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    nodeGraphMvp._needsHeaderSync = false;
    syncNodeGraphCurrentSavedPatchHeader();
  }
}
