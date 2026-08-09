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

function beginNodeGraphTraceDisplayFieldDrag(event) {
  if (event.button > 0 || event.detail > 1) {
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
  nodeGraphMvp.traceDisplayFieldDragging = {
    input,
    key,
    pointerId: event.pointerId ?? null,
    startValue: Number(input.value),
    startX: event.clientX,
    startY: event.clientY,
    multiplier: nodeGraphTraceDisplayNumberDragMultiplier(event),
    quantum: nodeGraphTraceDisplayStepperQuantum(input),
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
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  const startValue = Number.isFinite(drag.startValue)
    ? drag.startValue
    : nodeGraphDisplaySettingsDefaultValue(drag.key);
  const controlDelta = (axes.combined / 8) * drag.quantum * drag.multiplier;
  const rawValue = adjustNodeGraphTraceDisplaySettingByControlDelta(drag.key, startValue, controlDelta);
  const nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(drag.key, rawValue);
  drag.input.value = formatNodeGraphTraceDisplaySetting(nextValue);
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
    const quantum = nodeGraphTraceDisplayStepperQuantum(input, baseValue);
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
      key,
      adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
    );
  } else {
    // Magnitude-based −/+ (same as Parameter Settings): e.g. Span 270° → ±100°.
    const quantum = nodeGraphTraceDisplayStepperQuantum(input, baseValue);
    let stepped = baseValue + direction * quantum;
    // Snap large whole-unit steps onto the quantum grid (270+100 → 370, not float dust).
    if (quantum >= 1 - 1e-12) {
      stepped = Math.round(stepped / quantum) * quantum;
    }
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(key, stepped);
  }
  input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function toggleNodeGraphTraceDisplaySettingRow(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  input.checked = !input.checked;
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function suppressNodeGraphTraceDisplaySettingRowClick(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}
