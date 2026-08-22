// Reuses the same in-app debug console channel as the graph-drag tracing
// (see node-graph-graph-utils.js) so slider-drag diagnostics show up in the
// same debug panel. No-ops harmlessly if SE/dev mode isn't present.
function nodeGraphSliderDebugTrace(msg, data) {
  if (typeof nodeGraphGraphDebugTrace === "function") {
    nodeGraphGraphDebugTrace(msg, data);
  }
}

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
  const graphPhaseChanged = (
    key === "phase" &&
    nodeGraphModuleIsGraphType(patchNode.type) &&
    typeof nodeGraphGraphWithPhaseCursor === "function"
  );
  const graphFaceChanged = (
    (
      key === "tension"
      || key === "smoothingMode"
      || key === "steps"
      || key === "segmentShape"
      || key === "curveOffset"
    ) &&
    nodeGraphModuleIsGraphType(patchNode.type)
  );
  if (graphPhaseChanged) {
    patchNode.graph = nodeGraphGraphWithPhaseCursor(patchNode);
    syncNodeGraphGraphDisplaysForNode(node, patchNode);
  }
  if (graphFaceChanged) {
    syncNodeGraphGraphDisplaysForNode(node, patchNode);
  }
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
  // Prefer explicit domain value (typed entry may exceed HTML range min/max).
  const rawDomain = options.domainValue != null
    ? Number(options.domainValue)
    : (Number.isFinite(Number(slider?.dataset?.domainValue))
      ? Number(slider.dataset.domainValue)
      : nodeGraphReadNodeNumber(node, key));
  patchNode.params = {
    ...(patchNode.params || {}),
    [key]: normalizeNodeGraphPatchParameter(
      patchNode.type,
      key,
      rawDomain,
      patchNode.paramMeta[key],
    ),
  };
  // Pitch Quantizer: preset Scale slider writes the face keyboard mask so
  // audio + keyboard stay in sync. Custom (choice 6) leaves scaleMask alone.
  if (patchNode.type === "pitchQuantizer" && key === "scale") {
    const choice = Math.round(Number(patchNode.params.scale) || 0);
    if (
      choice >= 0
      && choice <= 5
      && typeof nodeGraphPitchQuantizerMaskFromChoice === "function"
    ) {
      const mask = nodeGraphPitchQuantizerMaskFromChoice(choice);
      patchNode.params.scaleMask = normalizeNodeGraphPatchParameter(
        patchNode.type,
        "scaleMask",
        mask,
        patchNode.paramMeta?.scaleMask,
      );
      if (typeof syncNodeGraphPitchQuantizerFace === "function") {
        syncNodeGraphPitchQuantizerFace(node);
      }
    }
  }
  // Value-only writes (mid-frame drag coalesce): domain is already on the
  // patch; skip graph-face / history / transport side effects until a full sync.
  if (options.skipGraphFace) {
    if (options.interaction === "drag") {
      nodeGraphMvp.patchDirtyState = "edited";
      nodeGraphMvp._needsHeaderSync = true;
    }
    return;
  }
  const graphPhaseChanged = (
    key === "phase" &&
    nodeGraphModuleIsGraphType(patchNode.type) &&
    typeof nodeGraphGraphWithPhaseCursor === "function"
  );
  if (graphPhaseChanged) {
    patchNode.graph = nodeGraphGraphWithPhaseCursor(patchNode);
    syncNodeGraphGraphDisplaysForNode(node, patchNode);
  }
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
    // Graph face depends on tension/smoothing/steps -- keep the SVG in sync
    // while dragging even when the rest of the deferred UI is skipped.
    if (
      nodeGraphModuleIsGraphType(patchNode.type) &&
      (
        key === "tension"
        || key === "smoothingMode"
        || key === "steps"
        || key === "segmentShape"
        || key === "curveOffset"
      ) &&
      typeof syncNodeGraphGraphDisplaysForNode === "function"
    ) {
      syncNodeGraphGraphDisplaysForNode(node, patchNode);
    }
    // Filter curve faces track cutoff live mid-drag via the readout flush
    // (and parameter-visual sync). Do not schedule a full multi-face redraw
    // here on every pointer sample — that was thrashing layout.
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
  if (
    !graphPhaseChanged &&
    nodeGraphModuleIsGraphType(patchNode.type) &&
    typeof syncNodeGraphGraphDisplaysForNode === "function"
  ) {
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

  // Domain may leave slider min/max; HTML range thumb stays in-range for display.
  const domain = normalizeNodeSliderValue(slider, value);
  slider.dataset.domainValue = String(domain);
  const thumb = typeof nodeSliderThumbDisplayValue === "function"
    ? nodeSliderThumbDisplayValue(slider, domain)
    : domain;
  slider.value = String(thumb);
  syncNodeSliderReadout(slider);
  syncNodeGraphPatchParameterFromSlider(slider, {
    domainValue: domain,
    record: true,
    status: "parameter changed",
  });
  syncNodeGraphParameterVisualsForNodeElement(slider.closest?.(".dsp-node"));
  if (nodeGraphMvp.metadataEditorTarget === slider.id) {
    fillNodeMetadataPopover(slider);
  }
  markNodeGraphRenderPending();
  scheduleNodeGraphLiveParameterSync();
}

// Refresh parameter-driven module visuals (bug button glyph, XY pad grid/puck,
// and any future solid-module custom UI) for one node's DOM element. This is
// the single shared contract: any custom-UI body that reflects parameter values
// sets data-parameter-visual="true" and a syncFromParameters() method, and
// every parameter-change path (typed readout edit, slider drag flush, patch
// re-render) funnels through here so the visuals never lag behind the sliders.
function syncNodeGraphParameterVisualsForNodeElement(nodeElement) {
  if (!nodeElement) {
    return;
  }
  for (const visual of nodeElement.querySelectorAll("[data-parameter-visual]")) {
    visual.syncFromParameters?.();
  }
}

let nodeSliderDragAutosaveTimer = 0;

function scheduleNodeGraphModuleScopeDrawIfNeeded() {
  if (typeof paintNodeGraphRasterRgbFacesNow === "function") {
    try {
      paintNodeGraphRasterRgbFacesNow(window.devicePixelRatio || 1);
    } catch (_error) {
      // Invert / grade must update even when the live scope loop is idle.
    }
  }
  if (typeof scheduleNodeGraphRasterRgbPump === "function") {
    scheduleNodeGraphRasterRgbPump();
  }
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
  const domainRaw = Number(slider?.dataset?.domainValue);
  syncNodeGraphPatchParameterFromSlider(slider, {
    domainValue: Number.isFinite(domainRaw) ? domainRaw : undefined,
    record: true,
    status,
  });
  markNodeGraphRenderPending();
  scheduleNodeGraphLiveParameterSync();
  scheduleNodeGraphModuleScopeDrawIfNeeded();
}

function setNodeSliderValue(slider, value, options = {}) {
  const isDrag = options.interaction === "drag";
  const domain = normalizeNodeSliderValue(slider, value);
  slider.dataset.domainValue = String(domain);
  // Drag values stay in track; typed/non-drag may exceed min/max for the thumb.
  const thumb = isDrag || typeof nodeSliderThumbDisplayValue !== "function"
    ? domain
    : nodeSliderThumbDisplayValue(slider, domain);
  slider.value = String(thumb);
  // Frame-gate painted readout work during drag. The patch + live engine must
  // still see every domain write: flushNodeSliderReadoutUpdates only paints the
  // thumb/readout — it does NOT write the patch. Skipping patch here made
  // mid-frame moves vanish from audio and snap the value on the next touch.
  const alreadyPending = isDrag && nodeGraphMvp?._pendingReadoutUpdates?.has(slider);
  if (isDrag) {
    scheduleNodeSliderReadoutUpdate(slider, domain);
  } else {
    syncNodeSliderReadout(slider);
  }
  // Tension/smoothing/steps on graph modules must refresh the face every
  // pointer move (not once per rAF), otherwise the curve / step grid only
  // jumps on mouse-up / next-frame flush.
  const graphCurveLiveParam = isDrag && (
    slider?.dataset?.param === "tension" ||
    slider?.dataset?.param === "smoothingMode" ||
    slider?.dataset?.param === "steps" ||
    slider?.dataset?.param === "segmentShape" ||
    slider?.dataset?.param === "curveOffset"
  );
  // Always write domain into the patch (live sync reads from patch, rAF-coalesced).
  syncNodeGraphPatchParameterFromSlider(slider, {
    domainValue: domain,
    interaction: options.interaction,
    deferAutosave: isDrag,
    // Drag defers heavy UI; non-drag keeps the full sync path.
    deferUi: isDrag,
    // Mid-frame drag: still write domain, skip graph-face side effects.
    // Graph curve params need every sample for live face animation.
    skipGraphFace: alreadyPending && !graphCurveLiveParam,
  });
  if (!alreadyPending || graphCurveLiveParam) {
    scheduleNodeGraphModuleScopeDrawIfNeeded();
  }
  if (isDrag) {
    scheduleNodeSliderDragAutosave();
  } else {
    syncNodeGraphFilterCurveDisplays();
    syncNodeGraphGhostSliders();
    markNodeGraphRenderPending();
  }
  // Always schedule (coalesced) so the pending live flush sees the latest patch.
  scheduleNodeGraphLiveParameterSync();
  // Module levels ↔ bottom toolbar 🔊 mirrors.
  const nodeType = slider.closest?.(".dsp-node")?.dataset?.nodeType;
  const param = slider?.dataset?.param;
  if (
    !nodeGraphMvp?._outputVolumeMirrorLock
    && param === "volume"
    && nodeType === "output"
    && typeof syncNodeGraphLiveOutputVolumeFromOutputModule === "function"
  ) {
    syncNodeGraphLiveOutputVolumeFromOutputModule();
  }
  if (
    !nodeGraphMvp?._inputVolumeMirrorLock
    && (param === "amplitude" || param === "level")
    && nodeType === "audioInput"
    && typeof syncNodeGraphLiveInputVolumeFromInputModule === "function"
  ) {
    syncNodeGraphLiveInputVolumeFromInputModule();
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
  const current = Number(slider.value);
  if (Number.isFinite(current) && Math.round(current) === Math.round(value)) {
    return false;
  }
  setNodeSliderValue(slider, value, options);
  return true;
}

// Pointer Lock ("hide mouse while dragging") was removed app-wide -- the
// browser's own "press Esc to show your cursor" permission chrome could
// swallow the mouseup/steal focus mid-drag, which was breaking slider
// dragging outright. Dragging now always uses the plain absolute-position
// path below (see dragNodeSlider), with screen-edge wraparound
// (wrapNodeSliderDragAtScreenEdge) standing in for "infinite drag".
function clearNodeSliderDragCursorState() {
  document.body.classList.remove("node-slider-dragging");
}

// Safety net: nodeGraphMvp.sliderDragging is a single global re-entrancy
// flag (see the early-return at the top of beginNodeSliderDrag) that is
// ONLY ever cleared by endNodeSliderDrag, which only runs from a
// pointerup/pointercancel/mouseup event. If one of those events is ever
// missed -- e.g. the OS/browser steals the mouseup while showing its
// pointer-lock permission/notification chrome, or the window loses focus
// mid-drag for any other reason -- this flag stays stuck true forever,
// which silently disables dragging on EVERY slider in the app, not just
// the one that was mid-drag. Force-clearing on blur/tab-hide turns that
// unrecoverable, session-wide failure into, at worst, one cancelled drag.
function forceEndNodeSliderDrag(reason) {
  const drag = nodeGraphMvp.sliderDragging;
  if (!drag) {
    return;
  }
  nodeGraphSliderDebugTrace("slider drag force-ended", { reason, sliderId: drag.slider?.id || null });
  endNodeSliderDrag({ pointerId: drag.pointerId ?? undefined });
}
if (typeof window !== "undefined") {
  window.addEventListener("blur", () => forceEndNodeSliderDrag("window blur"));
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      forceEndNodeSliderDrag("tab hidden");
    }
  });
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

// ── Plain <input type="range"/"number"> modifier parity ──────────────────
//
// Module sliders are a custom widget (a .node-slider-readout surface driving a
// hidden input, see beginNodeSliderDrag above) -- none of that machinery can
// be pointed at a bare native input. What CAN be shared is the modifier
// vocabulary, so native inputs elsewhere in the app (waveform display options,
// etc.) behave the way the module sliders taught the user to expect:
//
//   ctrl/cmd + click   reset to default
//   shift              coarse   (10x step)
//   ctrl/cmd           fine     (0.1x step)
//   shift + ctrl/cmd   coarse and fine combined, i.e. 1x
//
// The step maths is nodeSliderKeyboardStep -- literally the same function the
// module sliders use for arrow keys -- so the two can never drift apart.
// Drag-with-modifiers is deliberately NOT reimplemented here: the browser owns
// pointer tracking for a native range, and shadowing it would mean rebuilding
// the whole drag path for a cosmetic gain. Wheel and arrow keys cover the same
// ground on these controls.
function bindNodeGraphNativeSliderModifiers(input, defaultValue) {
  if (!input || input.dataset.nativeSliderModifiersBound === "true") {
    return;
  }
  input.dataset.nativeSliderModifiersBound = "true";
  const fallback = Number(defaultValue);
  if (Number.isFinite(fallback)) {
    input.dataset.default = String(fallback);
  }
  // nodeSliderKeyboardStep reads dataset.step, not the attribute.
  const declaredStep = Number(input.step);
  if (Number.isFinite(declaredStep) && declaredStep > 0) {
    input.dataset.step = String(declaredStep);
  }
  if (input.type === "range") {
    // A range input SNAPS any assigned value onto its step grid, which would
    // silently swallow every fine (ctrl) nudge -- 200 + 0.1 on a step="1" hue
    // slider lands straight back on 200. The nominal step now lives in
    // dataset.step (read above), so the attribute can go fully continuous.
    input.step = "any";
  }

  const clamp = (value) => {
    const min = Number(input.min);
    const max = Number(input.max);
    let next = value;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    return next;
  };
  // Both events: "input" drives the live-preview handlers (hue, brightness),
  // "change" drives the commit-on-change handlers (time window, line width).
  const emit = (value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const nudge = (event, direction) => {
    const step = nodeSliderKeyboardStep(input, event);
    const current = Number(input.value);
    if (!Number.isFinite(current) || !Number.isFinite(step)) {
      return;
    }
    // Round to the step grid so repeated fine nudges do not accumulate float
    // dust into values like 0.30000000000000004.
    const next = clamp(current + step * direction);
    emit(Number(next.toFixed(6)));
  };

  input.addEventListener("pointerdown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
      return;
    }
    if (!Number.isFinite(Number(input.dataset.default))) {
      return;
    }
    emit(clamp(Number(input.dataset.default)));
    // Stop the native range from also jumping to wherever the pointer landed.
    event.preventDefault();
    event.stopPropagation();
  });

  input.addEventListener("wheel", (event) => {
    // No hover/focus guard needed: a wheel event is only delivered to the
    // element under the pointer in the first place.
    const delta = event.deltaY || event.deltaX;
    if (!delta) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    nudge(event, delta < 0 ? 1 : -1);
  }, { passive: false });

  input.addEventListener("keydown", (event) => {
    const direction = event.key === "ArrowUp" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowDown" || event.key === "ArrowLeft"
        ? -1
        : 0;
    if (!direction) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    nudge(event, direction);
  });
}

/** Circular hit for a knob dial (not the rectangular parent plate). */
function nodeGraphCircularKnobHitElement(host) {
  if (!host) {
    return null;
  }
  if (host.classList.contains("has-image")) {
    return host.querySelector(".node-knob-face-layer:not(.is-empty)") || host;
  }
  return host.querySelector(
    ".node-macro-knob-dial i, .node-macro-knob-arc, .node-macro-knob-dial",
  ) || host;
}

function nodeGraphPointInCircularKnob(host, clientX, clientY) {
  const el = nodeGraphCircularKnobHitElement(host);
  if (!el) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  if (!(rx > 0) || !(ry > 0)) {
    return false;
  }
  const dx = clientX - (rect.left + rx);
  const dy = clientY - (rect.top + ry);
  const r = Math.min(rx, ry);
  return (dx * dx) + (dy * dy) <= (r * r);
}

/** True if `el` is a surface that drives a range slider via data-slider-target. */
function nodeSliderIsDragSurface(el) {
  return Boolean(
    el?.classList?.contains("node-slider-readout")
    || el?.classList?.contains("node-knob-face")
    || el?.classList?.contains("node-plugin-slider-face"),
  );
}

/**
 * Resolve the drag surface for a pointer/keyboard event.
 * Knob face mirrors Bias `.node-slider-readout` (same modifiers + path).
 */
function nodeSliderDragSurfaceFromEvent(event) {
  if (nodeSliderIsDragSurface(event?.currentTarget)) {
    return event.currentTarget;
  }
  return event?.target?.closest?.(".node-slider-readout, .node-knob-face, .node-plugin-slider-face") || null;
}

/** Type-in edit for a surface (face → linked Bias readout so we never replace the face DOM). */
function beginNodeSliderSurfaceEdit(surface) {
  if (!surface || typeof beginNodeSliderReadoutEdit !== "function") {
    return;
  }
  if (
    surface.classList.contains("node-knob-face")
    || surface.classList.contains("node-plugin-slider-face")
  ) {
    const sliderId = String(surface.dataset.sliderTarget || "").trim();
    if (!sliderId) {
      return;
    }
    const linked = document.querySelector(
      `.node-slider-readout[data-slider-target="${CSS.escape(sliderId)}"]`,
    );
    if (linked) {
      beginNodeSliderReadoutEdit(linked);
    }
    return;
  }
  beginNodeSliderReadoutEdit(surface);
}

function stepNodeSliderFromKeyboard(event) {
  const surface = nodeSliderDragSurfaceFromEvent(event);
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
  const current = nodeSliderDomainForTravel(slider);
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

function nodeSliderDomainForTravel(slider) {
  const fromDomain = Number(slider?.dataset?.domainValue);
  if (Number.isFinite(fromDomain)) {
    return fromDomain;
  }
  const fromValue = Number(slider?.value);
  return Number.isFinite(fromValue) ? fromValue : 0;
}

function reanchorNodeSliderDragAtPointer(drag, event) {
  // Re-anchor from domain (not the clamped HTML thumb) so relative drag stays
  // continuous for values outside min/max.
  drag.startTravel = nodeSliderTravelFromValue(drag.slider, nodeSliderDomainForTravel(drag.slider));
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
    // If sliderDragging is already set, EVERY slider ignores pointerdown
    // until it clears -- if the drag that set it never reaches
    // endNodeSliderDrag (e.g. its pointerup/mouseup got swallowed
    // somewhere), this single stuck flag silently breaks dragging on every
    // slider in the app, not just the one being dragged. Tracing this
    // specific branch is what would surface that: if this fires repeatedly
    // for different sliders in a row, sliderDragging is stuck.
    nodeGraphSliderDebugTrace("slider pointerdown ignored, drag already active", {
      button: event.button,
      hasSliderDragging: Boolean(nodeGraphMvp.sliderDragging),
    });
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

  const surface = nodeSliderDragSurfaceFromEvent(event);
  if (!surface) {
    return;
  }
  if (
    surface.classList.contains("node-knob-face")
    && !nodeGraphPointInCircularKnob(surface, event.clientX, event.clientY)
  ) {
    return;
  }

  // Double-click -> type-in edit, detected MANUALLY from pointerdown timing
  // instead of relying on the native "dblclick" event -- pointerdown always
  // fires, so this path can't be suppressed. The old `event.detail > 1`
  // early-return is folded in here: either signal routes to the editor
  // instead of a second drag. Face surfaces edit the linked Bias readout.
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
  // Knob / button faces: double-click must not open type-in or Module Settings.
  // Type a value on the numeric readout instead.
  const skipTypeIn = surface.classList.contains("node-knob-face")
    || surface.classList.contains("node-plugin-slider-face")
    || surface.classList.contains("node-plugin-toggle-button")
    || surface.closest?.(".node-plugin-button-shell, .node-bug-button-face, .node-plugin-toggle-button");
  if (isDoubleClick && skipTypeIn) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (isDoubleClick) {
    nodeGraphMvp.sliderLastPointerDown = null;
    event.preventDefault();
    event.stopPropagation();
    beginNodeSliderSurfaceEdit(surface);
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
  // Start relative drag from domainValue so a stale/clamped HTML thumb cannot
  // jump the parameter when the pointer first moves.
  let startTravel = nodeSliderTravelFromValue(slider, nodeSliderDomainForTravel(slider));
  if (jumpToPointerOnClick) {
    if (setNodeSliderValueAtPointer(slider, surface, event, { interaction: "drag" })) {
      startTravel = nodeSliderTravelFromValue(slider, nodeSliderDomainForTravel(slider));
    }
  } else if (!resetToDefaultOnClick && nodeSliderShouldDisplayChoices(slider) && nodeSliderShouldDivideChoicesVisibly(slider)) {
    setNodeChoiceSliderFromPointer(slider, surface, event.clientX, { interaction: "drag" });
    startTravel = nodeSliderTravelFromValue(slider, nodeSliderDomainForTravel(slider));
  }
  nodeGraphMvp.sliderDragging = {
    moved: false,
    pointerId: event.pointerId ?? null,
    pointerMode,
    resetToDefaultOnClick,
    slider,
    surface,
    startTravel,
    startX: event.clientX,
    startY: event.clientY,
    fineScale: nodeSliderFineTuneScale(event),
    visualScale: nodeSliderElementVisualScale(surface),
    width: lane.travelWidth,
  };
  surface.classList.add("value-dragging");
  document.body.classList.add("node-slider-dragging");
  nodeGraphWireInteractions?.clearHover?.();
  if (event.pointerId !== undefined) {
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
  // (and the same event re-dispatched by a second document listener).
  if (event.type === "mousemove" && typeof drag.pointerId === "number") {
    return;
  }
  if (drag._lastMoveEvent === event) {
    return;
  }
  drag._lastMoveEvent = event;

  if (
    typeof nodeGraphPointerDragExceededMoveThreshold === "function"
      ? nodeGraphPointerDragExceededMoveThreshold(drag.startX, drag.startY, event.clientX, event.clientY, 1)
      : (Math.abs(event.clientX - drag.startX) > 1 || Math.abs(drag.startY - event.clientY) > 1)
  ) {
    drag.moved = true;
  }

  // ALT+click: jump slider to pointer position.
  if (event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey))) {
    if (setNodeSliderValueAtPointer(drag.slider, drag.surface, event, { interaction: "drag" })) {
      reanchorNodeSliderDragAtPointer(drag, event);
    }
    event.preventDefault();
    return;
  }

  // Fine/coarse scale from modifier keys — live per-event.
  // Re-anchor travel AND pointer origin when scale changes so releasing Shift
  // mid-drag does not apply the whole path at the new scale (RS-MET style).
  const currentFineScale = nodeSliderFineTuneScale(event);
  if (currentFineScale !== drag.fineScale) {
    reanchorNodeSliderDragAtPointer(drag, event);
    drag.fineScale = currentFineScale;
    event.preventDefault();
    return;
  }

  // Wrap pointer at screen edges to approximate infinite drag.
  wrapNodeSliderDragAtScreenEdge(drag, event);

  const visualTravelWidth = Math.max(1, drag.width * (Number(drag.visualScale) || 1));
  // App-wide diagonal policy: right + up increase (see nodeGraphPointerDragTravelDelta).
  const travelDelta = typeof nodeGraphPointerDragTravelDelta === "function"
    ? nodeGraphPointerDragTravelDelta(drag.startX, drag.startY, event.clientX, event.clientY, visualTravelWidth, drag.fineScale)
    : (((event.clientX - drag.startX) + (drag.startY - event.clientY)) / visualTravelWidth) * drag.fineScale;
  const nextTravel = drag.startTravel + travelDelta;
  setNodeSliderValue(
    drag.slider,
    quantizeNodeSliderDragValue(
      drag.slider,
      nodeSliderValueFromRelativeTravel(drag.slider, nextTravel),
    ),
    { interaction: "drag" },
  );
  // Re-anchor at travel boundaries to prevent value stagnation.
  if (nextTravel <= 0 || nextTravel >= 1) {
    reanchorNodeSliderDragAtPointer(drag, event);
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

  drag.surface.classList.remove("value-dragging");
  clearNodeSliderDragCursorState();
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
  nodeGraphSliderDebugTrace("slider drag ended", { sliderId: drag.slider?.id || null, moved: drag.moved });
  nodeGraphMvp.sliderDragging = null;
}

// ── Deferred readout display (decouples value from display, C++ ParameterPrototype pattern) ──
// Moving the slider calls scheduleNodeSliderReadoutUpdate() which queues the display update.
// The queue owns its animation frame so it also works without a visible scope.

function scheduleNodeSliderReadoutUpdate(slider, normalized) {
  if (!nodeGraphMvp._pendingReadoutUpdates) {
    nodeGraphMvp._pendingReadoutUpdates = new Map();
  }
  nodeGraphMvp._pendingReadoutUpdates.set(slider, normalized);
  if (!nodeGraphMvp._pendingReadoutFrame) {
    nodeGraphMvp._pendingReadoutFrame = window.requestAnimationFrame(() => {
      nodeGraphMvp._pendingReadoutFrame = 0;
      flushNodeSliderReadoutUpdates();
    });
  }
}

function flushNodeSliderReadoutUpdates() {
  const pending = nodeGraphMvp?._pendingReadoutUpdates;
  if (!pending?.size) return;
  const touchedNodes = new Set();
  for (const [slider, normalized] of pending) {
    slider.value = String(normalized);
    syncNodeSliderReadout(slider);
    const nodeElement = slider.closest?.(".dsp-node");
    if (nodeElement) {
      touchedNodes.add(nodeElement);
    }
  }
  pending.clear();
  // Keep parameter-driven visuals (bug button glyph, XY pad grid/puck, filter
  // curves, etc.) tracking the slider live during a drag. Slider drags don't
  // dispatch "input" events and the deferred-UI path skips visual sync, so
  // without this the visual only catches up on mouse-up / re-render.
  for (const nodeElement of touchedNodes) {
    syncNodeGraphParameterVisualsForNodeElement(nodeElement);
  }
  // Metaparameter→metaparameter ghosts: source/dest values are live on the
  // inputs, but drag uses deferUi and skips the full sync path — refresh
  // ghosts once per frame here so the ghost handle tracks while dragging.
  if (typeof syncNodeGraphGhostSliders === "function") {
    syncNodeGraphGhostSliders();
  }
  // Any param change can feed a filter curve (own cutoff or a modulator source
  // that ghosts into another node's cutoff) — coalesce one redraw for all faces.
  if (typeof scheduleNodeGraphFilterCurveDraw === "function") {
    scheduleNodeGraphFilterCurveDraw();
  }
  if (nodeGraphMvp._needsHeaderSync && typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    nodeGraphMvp._needsHeaderSync = false;
    syncNodeGraphCurrentSavedPatchHeader();
  }
}
