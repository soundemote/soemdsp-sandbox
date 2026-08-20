// Display Settings field edit / drag / steppers / toggles.
// Peeled from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after settings-form-io.js, before settings-apply.js.

function nodeGraphTraceDisplayNumberDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function setNodeGraphTraceDisplayZoomEditActive(active) {
  nodeGraphMvp.traceDisplayZoomEditActive = Boolean(active);
}


function nodeGraphTraceDisplayFieldFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.("[data-trace-display-field]") || null;
}

function setNodeGraphTraceDisplayFieldEditing(input, editing) {
  if (!input) {
    return;
  }
  input.readOnly = !editing;
  input.classList.toggle("trace-display-field-editing", Boolean(editing));
  if (editing) {
    input.focus();
    input.select?.();
  }
}

function nodeGraphTraceDisplayEditingField() {
  const root = nodeGraphTraceDisplaySettingsRoot();
  return root?.querySelector?.("[data-trace-display-field].trace-display-field-editing")
    || root?.querySelector?.("[data-trace-display-field]:not([readonly])")
    || null;
}

function beginNodeGraphTraceDisplayFieldEdit(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input) {
    return;
  }
  // Commit any other field still in edit mode.
  const prev = nodeGraphTraceDisplayEditingField();
  if (prev && prev !== input && !prev.readOnly) {
    commitNodeGraphTraceDisplayFieldEdit(prev);
  }
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  setNodeGraphTraceDisplayFieldEditing(input, true);
  event.preventDefault();
  event.stopPropagation();
}

/** Commit typed value and leave edit mode (Enter / focus leave / click outside). */
function commitNodeGraphTraceDisplayFieldEdit(input) {
  if (!input || input.readOnly) {
    return;
  }
  setNodeGraphTraceDisplayFieldEditing(input, false);
  if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
    markNodeGraphTraceDisplaySettingsDirty(input.dataset?.traceDisplayField || input.getAttribute("data-trace-display-field"));
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  input.value = formatNodeGraphTraceDisplaySetting(
    nodeGraphDisplaySettingsFormValue(
      normalizeNodeGraphDisplaySettingsForFormType(nodeGraphTraceDisplayCurrentSettingsForFormType()),
      input.dataset.traceDisplayField,
    ),
  );
}

function finishNodeGraphTraceDisplayFieldEdit(event) {
  // focusout bubbles (blur does not) — use event.target as the field that lost focus.
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || input.readOnly) {
    return;
  }
  // Still focused within the same field (e.g. internal) — skip.
  const next = event.relatedTarget;
  if (next instanceof Node && input.contains(next)) {
    return;
  }
  commitNodeGraphTraceDisplayFieldEdit(input);
}

function handleNodeGraphTraceDisplayFieldEditKeydown(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || input.readOnly) {
    return;
  }
  if (event.key === "Enter") {
    // Commit immediately — do not rely on blur (parent blur listeners never see it).
    event.preventDefault();
    event.stopPropagation();
    commitNodeGraphTraceDisplayFieldEdit(input);
    input.blur();
  } else if (event.key === "Escape") {
    if (input.dataset.traceDisplayField === "zoomSeconds") {
      setNodeGraphTraceDisplayZoomEditActive(false);
    }
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
    setNodeGraphTraceDisplayFieldEditing(input, false);
    input.blur();
    event.preventDefault();
    event.stopPropagation();
  } else {
    event.stopPropagation();
  }
}

/** Click / pointer outside an editing field commits it (including outside the window). */
function handleNodeGraphTraceDisplayFieldEditPointerDown(event) {
  const editing = nodeGraphTraceDisplayEditingField();
  if (!editing || editing.readOnly) {
    return;
  }
  const target = event.target;
  if (target instanceof Node && (editing === target || editing.contains(target))) {
    return;
  }
  // Allow steppers for this field without fighting the click.
  if (
    target instanceof Element
    && target.closest?.(`[data-trace-display-step-target="${editing.dataset.traceDisplayField}"]`)
  ) {
    commitNodeGraphTraceDisplayFieldEdit(editing);
    return;
  }
  commitNodeGraphTraceDisplayFieldEdit(editing);
  // Don't steal the click from other UI — just end text edit.
}

function preventNodeGraphTraceDisplayReadonlyFieldTextInteraction(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  if (event.type === "focusin") {
    input.blur();
    return;
  }
  event.preventDefault();
}

/**
 * App-wide 0…1 unit stepper drag (gradient Pos, etc.).
 * Must run in CAPTURE on the display-settings popover: text-input protection
 * stopPropagations before the event reaches the <input>, so per-input listeners never fire.
 */
function nodeGraphUnitStepperDragInputFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const input = target.closest?.("input[data-unit-stepper-drag], input[data-sge-pos]");
  if (!(input instanceof HTMLInputElement) || input.disabled || !input.readOnly) {
    return null;
  }
  return input;
}

function beginNodeGraphUnitStepperDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  if (nodeGraphMvp?.traceDisplayFieldDragging || nodeGraphMvp?.unitStepperDragging) {
    return;
  }
  const input = nodeGraphUnitStepperDragInputFromTarget(event.target);
  if (!input) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const min = Number(input.dataset.unitMin);
  const max = Number(input.dataset.unitMax);
  const startValue = Number(input.value);
  nodeGraphMvp.unitStepperDragging = {
    input,
    pointerId: event.pointerId ?? null,
    startValue: Number.isFinite(startValue) ? startValue : 0,
    startX: event.clientX,
    startY: event.clientY,
    multiplier: typeof nodeGraphNumericDragMultiplier === "function"
      ? nodeGraphNumericDragMultiplier(event)
      : 1,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 1,
  };
  input.classList.add("value-dragging");
  try {
    input.setPointerCapture?.(event.pointerId);
  } catch {
    // ignore
  }
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphUnitStepper(event) {
  const drag = nodeGraphMvp?.unitStepperDragging;
  if (
    !drag
    || (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const mult = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  if (mult !== drag.multiplier) {
    const live = Number(drag.input.value);
    drag.startValue = Number.isFinite(live) ? live : drag.startValue;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.multiplier = mult;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  const unitPx = typeof nodeGraphTraceDisplayUnitDragPixels === "number"
    ? nodeGraphTraceDisplayUnitDragPixels
    : 220;
  let next = drag.startValue + (axes.combined / unitPx) * drag.multiplier;
  next = Math.max(drag.min, Math.min(drag.max, next));
  if (!Number.isFinite(next)) {
    next = drag.startValue;
  }
  const formatted = typeof formatNodeGraphTraceDisplaySetting === "function"
    ? formatNodeGraphTraceDisplaySetting(next)
    : String(Number(next.toFixed(4)));
  if (drag.input.value !== formatted) {
    drag.input.value = formatted;
    // Gradient editor (and other hosts) listen for this to apply clamped domain rules.
    drag.input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphUnitStepperDrag(event) {
  const drag = nodeGraphMvp?.unitStepperDragging;
  if (
    !drag
    || (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  drag.input.dispatchEvent(new Event("change", { bubbles: true }));
  nodeGraphMvp.unitStepperDragging = null;
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphTraceDisplayFieldDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  // Unit steppers (gradient Pos, …) share this capture path.
  if (nodeGraphUnitStepperDragInputFromTarget(event.target)) {
    beginNodeGraphUnitStepperDrag(event);
    return;
  }
  // Music Player Time Window / Scroll Line / Trace — same capture path as
  // other Display Settings number fields (per-input binds die on remount).
  if (
    event.target?.closest?.("input[data-phosphor-number-drag]")
    && typeof nodeGraphPhosphorWaveformBeginNumberDrag === "function"
  ) {
    nodeGraphPhosphorWaveformBeginNumberDrag(event);
    return;
  }
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  const key = input.dataset.traceDisplayField;
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  const startValue = Number(input.value);
  const unitDrag = typeof nodeGraphTraceDisplayUnitDragField === "function"
    && nodeGraphTraceDisplayUnitDragField(key);
  const integerPixelDrag = typeof nodeGraphTraceDisplayIntegerPixelDragField === "function"
    && nodeGraphTraceDisplayIntegerPixelDragField(key);
  nodeGraphMvp.traceDisplayFieldDragging = {
    input,
    key,
    pointerId: event.pointerId ?? null,
    startValue: Number.isFinite(startValue) ? startValue : 0,
    startX: event.clientX,
    startY: event.clientY,
    // Live-updated on move; re-anchor when Shift/Ctrl/Alt scale changes (RS-MET).
    multiplier: nodeGraphTraceDisplayNumberDragMultiplier(event),
    // Unit 0…1 fields: fixed gain (px → value). Others: stepper quantum × /8.
    unitDrag,
    integerPixelDrag,
    quantum: unitDrag
      ? 1
      : nodeGraphTraceDisplayStepperQuantum(input, startValue),
  };
  input.classList.add("value-dragging");
  input.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphTraceDisplayField(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  // Re-anchor when fine/coarse modifiers change mid-drag so releasing Shift
  // does not jump as if the whole drag used the new scale.
  const currentMult = nodeGraphTraceDisplayNumberDragMultiplier(event);
  if (currentMult !== drag.multiplier) {
    const live = Number(drag.input.value);
    drag.startValue = Number.isFinite(live) ? live : drag.startValue;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.multiplier = currentMult;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  const startValue = Number.isFinite(drag.startValue)
    ? drag.startValue
    : nodeGraphDisplaySettingsDefaultValue(drag.key);
  // Bright / Ghost Bright / Residual: same linear sensitivity (~220 px = full 0…1).
  const unitPx = typeof nodeGraphTraceDisplayUnitDragPixels === "number"
    ? nodeGraphTraceDisplayUnitDragPixels
    : 220;
  // Stamp Size (dot1/secondary): control-space drag with dedicated gain (exp map).
  const sizeDrag = typeof nodeGraphTraceDisplaySizeControlField === "function"
    && nodeGraphTraceDisplaySizeControlField(drag.key)
    && !drag.unitDrag;
  const blurDrag = typeof nodeGraphTraceDisplayInstantTraceBlurField === "function"
    && nodeGraphTraceDisplayInstantTraceBlurField(drag.key)
    && !drag.unitDrag;
  const sizePx = typeof nodeGraphTraceDisplaySizeDragPixels === "number"
    ? nodeGraphTraceDisplaySizeDragPixels
    : 520;
  const blurPx = typeof nodeGraphTraceDisplayBlurDragPixels === "number"
    ? nodeGraphTraceDisplayBlurDragPixels
    : 640;
  const controlDelta = drag.unitDrag
    ? (axes.combined / unitPx) * drag.multiplier
    : drag.integerPixelDrag
      ? axes.combined * drag.quantum * drag.multiplier
      : sizeDrag
        ? (axes.combined / sizePx) * drag.multiplier
        : blurDrag
          ? (axes.combined / blurPx) * drag.multiplier
          : (axes.combined / 8) * drag.quantum * drag.multiplier;
  let rawValue = adjustNodeGraphTraceDisplaySettingByControlDelta(drag.key, startValue, controlDelta);
  // Unit fields: hard clamp before format (never wrap / never NaN→1).
  // Most are 0…1; shadow offset X/Y are bipolar −1…1.
  if (drag.unitDrag) {
    const n = Number(rawValue);
    const range = typeof nodeGraphTraceDisplayUnitDragRange === "function"
      ? nodeGraphTraceDisplayUnitDragRange(drag.key)
      : { min: 0, max: 1 };
    const lo = Number.isFinite(range?.min) ? range.min : 0;
    const hi = Number.isFinite(range?.max) ? range.max : 1;
    rawValue = Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : startValue;
  }
  const nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(drag.key, rawValue);
  drag.input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
    markNodeGraphTraceDisplaySettingsDirty(drag.key);
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "debounce", record: false });
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphTraceDisplayFieldDrag(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  const root = nodeGraphSettingsTextRootFromTarget(drag.input);
  if (root) {
    root.dataset.settingsTextPointerActive = "false";
    root.dataset.settingsTextPointerId = "";
    root.dataset.settingsTextPointerMoved = "false";
    root.dataset.settingsTextSuppressClick = "true";
    window.setTimeout(() => {
      if (root.dataset.settingsTextSuppressClick === "true") {
        root.dataset.settingsTextSuppressClick = "false";
      }
    }, 180);
  }
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  if (drag.key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
    markNodeGraphTraceDisplaySettingsDirty(drag.key);
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  nodeGraphMvp.traceDisplayFieldDragging = null;
  event.preventDefault();
  event.stopPropagation();
}

function stepNodeGraphTraceDisplaySetting(event) {
  if (nodeGraphSettingsTextGestureShouldIgnoreClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-trace-display-step-target]");
  if (!button) {
    return;
  }
  const key = button.dataset.traceDisplayStepTarget;
  const root = nodeGraphTraceDisplaySettingsRoot();
  const input = root?.querySelector?.(`[data-trace-display-field="${key}"]`)
    || button.closest("label")?.querySelector?.(`[data-trace-display-field="${key}"]`);
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const direction = Number(button.dataset.traceDisplayStepDirection) < 0 ? -1 : 1;
  const current = Number(input.value);
  const baseValue = Number.isFinite(current) ? current : nodeGraphDisplaySettingsDefaultValue(key);
  let nextValue;
  // Spectrogram: FFT steps the size table.
  if (
    key === "fftSize" &&
    nodeGraphTraceDisplaySettingsFormType() === "spectrogramBurn" &&
    typeof nodeGraphSpectrogramStepFftSize === "function"
  ) {
    nextValue = nodeGraphSpectrogramStepFftSize(baseValue, direction);
  } else if (key === "historySeconds" || key === "zoomSeconds") {
    // Exponential control-space steps (fine near short history, coarser at long).
    const quantum = nodeGraphTraceDisplayStepperQuantum(input, baseValue, direction);
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
      key,
      adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
    );
  } else if (
    typeof nodeGraphTraceDisplayInstantTraceBlurField === "function"
    && nodeGraphTraceDisplayInstantTraceBlurField(key)
  ) {
    const quantum = nodeGraphTraceDisplayStepperQuantum(input, baseValue, direction);
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
      key,
      adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
    );
  } else {
    // Magnitude −/+ with down-from-boundary refinement (1→0.9, not 1→0).
    // Pass direction so decade edges use the next finer quantum when decreasing.
    const quantum = nodeGraphTraceDisplayStepperQuantum(input, baseValue, direction);
    let stepped = baseValue + direction * quantum;
    // Snap large whole-unit steps onto the quantum grid (270+100 → 370, not float dust).
    // Skip snap for sub-unit quanta (0.1) so 1−0.1 stays 0.9.
    if (quantum >= 1 - 1e-12) {
      stepped = Math.round(stepped / quantum) * quantum;
    } else {
      // Keep one decimal clean for 0.1 steps (float dust).
      stepped = Math.round(stepped * 10) / 10;
    }
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(key, stepped);
  }
  input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
    markNodeGraphTraceDisplaySettingsDirty(key);
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

/**
 * Display Settings toggles:
 *   - App latch buttons (packing row Full Dot Economy / Dots only)
 *   - Legacy checkbox labels
 *   - Clear action (wipe phosphor residual)
 */
function toggleNodeGraphTraceDisplaySettingRow(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  // —— App latch button (Full Dot Economy / Dots only) ——
  const latch = event.target.closest?.("[data-latch-button][data-trace-display-toggle]");
  if (latch && !latch.disabled) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    if (typeof AppLatchButton !== "undefined") {
      AppLatchButton.toggle(latch);
    } else {
      const next = latch.getAttribute("aria-pressed") !== "true";
      latch.setAttribute("aria-pressed", next ? "true" : "false");
      latch.dataset.latchOn = next ? "1" : "0";
      latch.classList.toggle("is-on", next);
      latch.classList.toggle("is-off", !next);
    }
    latch.dataset.traceDisplayToggleOwned = "1";
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty(
        latch.getAttribute("data-trace-display-toggle") || latch.dataset?.traceDisplayToggle,
      );
    }
    applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
    window.setTimeout(() => {
      delete latch.dataset.traceDisplayToggleOwned;
    }, 0);
    return;
  }
  // —— Clear phosphor residual (action, not a setting) ——
  // Multi-select Display Settings: wipe every active target that shares this panel.
  const clearBtn = event.target.closest?.(
    "[data-trace-display-action='clearPhosphor'], [data-latch-action='clearPhosphor']",
  );
  if (clearBtn && !clearBtn.disabled) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    if (typeof clearNodeGraphDisplaySettingsPhosphor === "function") {
      // Resolve multi-select at click time (ActiveTargetIds + selection re-resolve).
      clearNodeGraphDisplaySettingsPhosphor(null, { scheduleDraw: true });
    }
    return;
  }
  // —— Legacy checkbox labels ——
  const toggleRow = event.target.closest(
    "label.metadata-checkbox-label, label[data-trace-display-control-row], .metadata-section-title",
  );
  const input = toggleRow?.querySelector?.("input[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  // Direct hits on the checkbox (if pointer-events restored) use change handler.
  if (event.target === input || event.target?.closest?.("input[data-trace-display-toggle]")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
  input.checked = !input.checked;
  // Guard against a late native click/change undoing the apply this gesture.
  input.dataset.traceDisplayToggleOwned = "1";
  if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
    markNodeGraphTraceDisplaySettingsDirty(
      input.getAttribute("data-trace-display-toggle") || input.dataset?.traceDisplayToggle,
    );
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  window.setTimeout(() => {
    delete input.dataset.traceDisplayToggleOwned;
  }, 0);
}

function suppressNodeGraphTraceDisplaySettingRowClick(event) {
  // Latch buttons handle their own click; don't suppress so focus works.
  if (event.target.closest?.("[data-latch-button]")) {
    // Still prevent double-activate from label-like wrapping (none expected).
    const latch = event.target.closest("[data-latch-button]");
    if (latch?.dataset?.traceDisplayToggleOwned === "1") {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  const toggleRow = event.target.closest(
    "label.metadata-checkbox-label, label[data-trace-display-control-row], .metadata-section-title",
  );
  const input = toggleRow?.querySelector?.("input[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}
