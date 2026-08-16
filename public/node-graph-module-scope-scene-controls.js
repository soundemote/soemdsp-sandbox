// Scene scope number controls / drag edit (Phase D).
// Load after scopes.js. Extract-only.

function renderNodeGraphSceneScopeControls(nodeId = nodeGraphScopeControlTargetNodeId()) {
  const setting = nodeGraphModuleScopeEffectiveSettingForSlot({ nodeId });
  const targetNode = nodeGraphPatchNode(nodeId);
  const individualControls = document.getElementById("nodeIndividualScopeControls");
  if (individualControls) {
    individualControls.hidden = !targetNode;
  }
  const timeInput = document.getElementById("nodeSceneScopeTime");
  if (timeInput && document.activeElement !== timeInput) {
    timeInput.value = nodeGraphFormatScopeNumber(setting.cycles);
    timeInput.title = "Scope horizontal window in detected cycles.";
  }
  const scopeFields = document.querySelector("#nodeSceneScopeControls .scene-context-scope-fields");
  if (scopeFields) {
    const showOscillatorMode = nodeGraphModuleScopeIsOscillatorType(targetNode?.type);
    scopeFields.classList.toggle("three", showOscillatorMode);
    scopeFields.classList.toggle("two", !showOscillatorMode);
  }
  const syncButton = document.getElementById("nodeSceneScopeSync");
  if (syncButton) {
    const syncOn = typeof nodeGraphNodeDisplaySyncIsOn === "function"
      ? nodeGraphNodeDisplaySyncIsOn(targetNode)
      : Boolean(setting.sync);
    syncButton.textContent = syncOn ? "sync" : "free";
    syncButton.setAttribute("aria-pressed", String(syncOn));
    syncButton.title = "Auto-trigger sync — same control as Display Settings → Sync";
  }
  const oscillatorTraceModeButton = document.getElementById("nodeSceneScopeOscillatorTraceMode");
  if (oscillatorTraceModeButton) {
    const isFrequencyResetMode = setting.oscillatorTraceMode !== "window";
    oscillatorTraceModeButton.hidden = !nodeGraphModuleScopeIsOscillatorType(targetNode?.type);
    oscillatorTraceModeButton.textContent = isFrequencyResetMode ? "freq reset" : "window";
    oscillatorTraceModeButton.setAttribute("aria-pressed", String(isFrequencyResetMode));
    oscillatorTraceModeButton.title = "Oscillator scope redraw mode";
  }
  const blinkLightControls = document.getElementById("nodeSceneBlinkLightControls");
  if (blinkLightControls) {
    blinkLightControls.hidden = targetNode?.type !== "clock";
  }
  const blinkLightShape = document.getElementById("nodeSceneBlinkLightShape");
  if (blinkLightShape && document.activeElement !== blinkLightShape) {
    blinkLightShape.value = setting.blinkLightShape;
  }
}

function handleNodeGraphSceneScopeNumericInput(event) {
  const input = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  if (!nodeId) {
    return;
  }
  const value = Number(input.value.trim());
  if (!Number.isFinite(value)) {
    renderNodeGraphSceneScopeControls(nodeId);
    return;
  }
  if (input.dataset.scopeInput === "cycles") {
    updateNodeGraphModuleScopeSetting(nodeId, { cycles: value });
  }
}

function handleNodeGraphSceneScopeOptionInput(event) {
  const input = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  if (!nodeId) {
    return;
  }
  if (input.dataset.scopeInput === "blinkLightShape") {
    updateNodeGraphModuleScopeSetting(nodeId, {
      blinkLightShape: ["circle", "square", "diamond"].includes(input.value) ? input.value : "circle",
    });
  }
}

function handleNodeGraphSceneScopeNumericKeydown(event) {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}

function nodeGraphScopeNumberInputRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step);
  return {
    max: Number.isFinite(max) ? max : 1,
    min: Number.isFinite(min) ? min : 0,
    step: Number.isFinite(step) && step > 0 ? step : 0.01,
  };
}

function nodeGraphScopeNumberInputStepDecimals(input) {
  const stepText = String(input.step || "");
  const decimalPart = stepText.includes(".") ? stepText.split(".").pop() : "";
  return Math.min(6, decimalPart.length);
}

function nodeGraphScopeNumberInputSnapValue(input, value) {
  const { min, max, step } = nodeGraphScopeNumberInputRange(input);
  const decimals = nodeGraphScopeNumberInputStepDecimals(input);
  const clamped = clampNodeSliderValue(Number(value) || 0, min, max);
  const quantized = Math.round(clamped / step) * step;
  const snapped = clampNodeSliderValue(quantized, min, max);
  return Number(snapped.toFixed(decimals));
}

function setNodeGraphScopeNumberInputValue(input, value) {
  input.value = input.dataset.scopeInput === "cycles"
    ? nodeGraphFormatScopeNumber(clampNodeSliderValue(Number(value) || 0, nodeGraphModuleScopeMinCycles, 128))
    : nodeGraphScopeNumberInputSnapValue(input, value).toString();
  if (input.dataset.globalScopeInput === "framesPerSecond") {
    setNodeGraphModuleScopeFramesPerSecond(input.value);
  } else if (input.dataset.globalScopeInput === "pointBudget") {
    setNodeGraphModuleScopePointBudget(input.value);
  } else if (input.dataset.timingField) {
    updateNodeGraphPatchTimingFromHeader(input);
  } else if (input.dataset.audioField) {
    updateNodeGraphPatchAudioFromHeader(input);
  } else if (input.dataset.speedLimit === "true") {
    if (typeof setNodeGraphProjectSpeedLimitHz === "function") {
      setNodeGraphProjectSpeedLimitHz(input.value, { persist: true });
    } else if (typeof setNodeGraphLiveSpeedLimit === "function") {
      setNodeGraphLiveSpeedLimit(input.value);
    }
  } else if (input.dataset.globalScopeInput === "lineThickness") {
    setNodeGraphModuleScopeLineThickness(input.value);
  } else if (input.dataset.globalScopeInput === "dotCore1Size") {
    setNodeGraphModuleScopeDotCore1Size(input.value);
  } else if (input.dataset.globalScopeInput === "dotCore1Brightness") {
    setNodeGraphModuleScopeDotCore1Brightness(input.value);
  } else if (input.dataset.globalScopeInput === "discontinuitySkipSamples") {
    setNodeGraphModuleScopeDiscontinuitySkipSamples(input.value);
  } else {
    handleNodeGraphSceneScopeNumericInput({ currentTarget: input });
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function nodeGraphScopeNumberDragInputFromTarget(target) {
  if (target instanceof HTMLInputElement) {
    return target;
  }
  return target?.querySelector?.("input[data-global-scope-number-drag='true']") || null;
}

function nodeGraphSettingsTextControlFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.(
    "input[type='text'], input[type='number'], input[type='search'], input[inputmode], textarea",
  ) || null;
}

function nodeGraphSettingsTextRootFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.("#nodeGlobalScopeMenu, #nodeParameterMetadataPopover, #nodeTraceDisplaySettingsPopover");
}

function preventNodeGraphSettingsTextTransfer(event) {
  if (!nodeGraphSettingsTextControlFromTarget(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function beginNodeGraphSettingsTextPointer(event) {
  const input = nodeGraphSettingsTextControlFromTarget(event.target);
  const root = input ? nodeGraphSettingsTextRootFromTarget(input) : null;
  if (!input || !root) {
    return;
  }
  root.dataset.settingsTextPointerActive = "true";
  root.dataset.settingsTextPointerId = String(event.pointerId ?? "mouse");
  root.dataset.settingsTextPointerStartX = String(event.clientX ?? 0);
  root.dataset.settingsTextPointerStartY = String(event.clientY ?? 0);
  root.dataset.settingsTextPointerMoved = "false";
  root.dataset.settingsTextSuppressClick = "false";
  event.stopPropagation();
}

function moveNodeGraphSettingsTextPointer(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event.target);
  if (!root || root.dataset.settingsTextPointerActive !== "true") {
    return;
  }
  const activePointerId = root.dataset.settingsTextPointerId || "";
  const pointerId = String(event.pointerId ?? "mouse");
  if (activePointerId && activePointerId !== pointerId) {
    return;
  }
  const startX = Number(root.dataset.settingsTextPointerStartX) || 0;
  const startY = Number(root.dataset.settingsTextPointerStartY) || 0;
  if (Math.abs((event.clientX ?? 0) - startX) > 2 || Math.abs((event.clientY ?? 0) - startY) > 2) {
    root.dataset.settingsTextPointerMoved = "true";
  }
  event.stopPropagation();
}

function endNodeGraphSettingsTextPointer(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event.target);
  if (!root || root.dataset.settingsTextPointerActive !== "true") {
    return;
  }
  const activePointerId = root.dataset.settingsTextPointerId || "";
  const pointerId = String(event.pointerId ?? "mouse");
  if (activePointerId && activePointerId !== pointerId) {
    return;
  }
  const moved = root.dataset.settingsTextPointerMoved === "true";
  root.dataset.settingsTextPointerActive = "false";
  root.dataset.settingsTextPointerId = "";
  root.dataset.settingsTextPointerMoved = "false";
  root.dataset.settingsTextSuppressClick = moved ? "true" : "false";
  if (moved) {
    window.setTimeout(() => {
      if (root.dataset.settingsTextSuppressClick === "true") {
        root.dataset.settingsTextSuppressClick = "false";
      }
    }, 180);
  }
  event.stopPropagation();
}

function nodeGraphSettingsTextGestureShouldIgnoreClick(event) {
  const root = nodeGraphSettingsTextRootFromTarget(event?.target);
  return Boolean(root && root.dataset.settingsTextSuppressClick === "true");
}

function bindNodeGraphSettingsTextInputProtection(root) {
  if (!root || root.dataset.settingsTextInputProtectionBound === "true") {
    return;
  }
  root.dataset.settingsTextInputProtectionBound = "true";
  root.addEventListener("dragstart", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("dragover", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("drop", preventNodeGraphSettingsTextTransfer, true);
  root.addEventListener("pointerdown", beginNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointermove", moveNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointerup", endNodeGraphSettingsTextPointer, true);
  root.addEventListener("pointercancel", endNodeGraphSettingsTextPointer, true);
  for (const input of root.querySelectorAll("input[type='text'], input[type='number'], input[type='search'], input[inputmode], textarea")) {
    input.draggable = false;
  }
}

function bindNodeGraphModuleScopeWindowEvents(scopeElement) {
  if (!scopeElement || scopeElement.dataset.scopeWindowEventsBound === "true") {
    return;
  }
  scopeElement.dataset.scopeWindowEventsBound = "true";
  scopeElement.addEventListener("dblclick", beginNodeGraphModuleScopeWindowNumberEdit);
  scopeElement.addEventListener("contextmenu", beginNodeGraphModuleScopeWindowNumberEdit);
}

function beginNodeGraphModuleScopeWindowNumberEdit(event) {
  const scopeElement = event.currentTarget;
  const moduleElement = scopeElement?.closest?.(".dsp-node");
  const nodeId = moduleElement?.dataset?.node || scopeElement?.dataset?.node || "";
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (!nodeId || !nodeGraphPatchNode(nodeId) || !menu) {
    return;
  }
  if (typeof openNodeGraphTraceDisplaySettings === "function" && openNodeGraphTraceDisplaySettings(nodeId, event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  menu.hidden = true;
  event.preventDefault();
  event.stopPropagation();
}

function nodeGraphScopeNumberDragScale(input, event) {
  const { min, max, step } = nodeGraphScopeNumberInputRange(input);
  const multiplier = typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
  if (input.dataset.globalScopeInput === "framesPerSecond") {
    return (step / 10) * multiplier;
  }
  if (input.dataset.globalScopeInput === "pointBudget") {
    return 64 * multiplier;
  }
  if (input.dataset.timingField) {
    return (step / 10) * multiplier;
  }
  // Speed Limit spans 1…192k; full-range /160 is too coarse for fine Hz work.
  if (input.dataset.speedLimit === "true") {
    const base = Math.max(step, (max - min) / 480);
    return base * multiplier;
  }
  if (input.dataset.scopeInput === "cycles") {
    const baseCycles = Math.max(step / 8, (max - min) / 960);
    return baseCycles * multiplier;
  }
  const base = Math.max(step, (max - min) / 160);
  return base * multiplier;
}

function beginNodeGraphScopeNumberDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const input = nodeGraphScopeNumberDragInputFromTarget(event.currentTarget);
  if (!input) {
    return;
  }
  if (input.closest("#nodeGlobalScopeMenu, #nodeParameterMetadataPopover, #nodeTraceDisplaySettingsPopover")) {
    return;
  }
  nodeGraphMvp.scopeNumberDragging = {
    captureTarget: event.currentTarget,
    input,
    pointerId: event.pointerId ?? null,
    scale: nodeGraphScopeNumberDragScale(input, event),
    startValue: Number(input.value) || 0,
    startX: event.clientX,
    startY: event.clientY,
  };
  input.classList.add("value-dragging");
  input.closest(".node-header-timing-field")?.classList.add("value-dragging");
  input.readOnly = true;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphScopeNumber(event) {
  const drag = nodeGraphMvp.scopeNumberDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  // Re-anchor when Shift/Ctrl fine scale changes mid-drag (no jump).
  const currentScale = nodeGraphScopeNumberDragScale(drag.input, event);
  if (currentScale !== drag.scale) {
    drag.startValue = Number(drag.input.value) || drag.startValue;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.scale = currentScale;
    event.preventDefault();
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  setNodeGraphScopeNumberInputValue(
    drag.input,
    drag.startValue + axes.combined * drag.scale,
  );
  event.preventDefault();
}

function endNodeGraphScopeNumberDrag(event) {
  const drag = nodeGraphMvp.scopeNumberDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  const headerField = drag.input.closest(".node-header-timing-field");
  headerField?.classList.remove("value-dragging");
  drag.input.readOnly = Boolean(headerField);
  const captureTarget = drag.captureTarget || drag.input;
  if (event.pointerId !== undefined && captureTarget.hasPointerCapture?.(event.pointerId)) {
    captureTarget.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp.scopeNumberDragging = null;
  event.preventDefault();
}

function beginNodeGraphScopeNumberEdit(event) {
  const input = nodeGraphScopeNumberDragInputFromTarget(event.currentTarget);
  if (!input) {
    return;
  }
  input.readOnly = false;
  input.focus();
  input.select();
  event.preventDefault();
  event.stopPropagation();
}

function handleNodeGraphSceneScopeControlClick(event) {
  const button = event.currentTarget;
  const nodeId = nodeGraphScopeControlTargetNodeId();
  const setting = nodeGraphModuleScopeSetting(nodeId);
  if (button.dataset.scopeControl === "sync") {
    if (typeof nodeGraphToggleNodeDisplaySync === "function") {
      nodeGraphToggleNodeDisplaySync(nodeId);
    } else {
      updateNodeGraphModuleScopeSetting(nodeId, { sync: !setting.sync });
    }
  } else if (button.dataset.scopeControl === "oscillatorTraceMode") {
    updateNodeGraphModuleScopeSetting(nodeId, {
      oscillatorTraceMode: setting.oscillatorTraceMode === "window" ? "frequencyReset" : "window",
    });
  }
  event.preventDefault();
  event.stopPropagation();
}

