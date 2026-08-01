function nodeGraphPatchTimingValue(key) {
  return normalizeNodeGraphPatchTiming(nodeGraphMvp?.patch?.timing)[key];
}

function nodeGraphPatchAudioValue(key) {
  return normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio)[key];
}

const nodeGraphTapTempoState = {
  lastTapMs: 0,
  intervals: [],
};

function syncNodeGraphHeaderTimingWidgets() {
  const timing = normalizeNodeGraphPatchTiming(nodeGraphMvp?.patch?.timing);
  const audio = normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio);
  for (const input of document.querySelectorAll(".node-header-timing-input")) {
    const timingKey = input.dataset.timingField;
    const audioKey = input.dataset.audioField;
    if (timingKey && Object.hasOwn(timing, timingKey)) {
      input.value = String(timing[timingKey]);
    } else if (audioKey && Object.hasOwn(audio, audioKey)) {
      input.value = String(audio[audioKey]);
    }
  }
}

// Keeps every transport node's own "BPM" parameter mirrored to the patch-wide
// tempo -- transport nodes have no independent tempo of their own, the param
// exists so the node can display/edit the same global value in place. Mutates
// the given patch object in place; caller is expected to pass a clone that's
// about to be committed (matches updateNodeGraphPatchTimingFromHeader's own
// clone-then-commit shape).
function syncNodeGraphTransportBpmParams(patch, timing) {
  const tempoBpm = normalizeNodeGraphPatchTiming(timing).tempoBpm;
  for (const node of patch?.nodes || []) {
    if (node.type !== "transport") {
      continue;
    }
    node.params = {
      ...(node.params || {}),
      bpm: normalizeNodeGraphPatchParameter(node.type, "bpm", tempoBpm, node.paramMeta?.bpm),
    };
  }
}

function updateNodeGraphPatchTimingFromHeader(input) {
  const key = input?.dataset?.timingField;
  if (!key) {
    return;
  }
  const current = normalizeNodeGraphPatchTiming(nodeGraphMvp.patch.timing);
  const next = normalizeNodeGraphPatchTiming({
    ...current,
    [key]: input.value,
  });
  if (
    current.tempoBpm === next.tempoBpm &&
    current.timeSignatureNumerator === next.timeSignatureNumerator &&
    current.timeSignatureDenominator === next.timeSignatureDenominator
  ) {
    input.value = String(next[key]);
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.timing = next;
  syncNodeGraphTransportBpmParams(patch, next);
  commitNodeGraphPatch(patch, {
    markPending: false,
    status: "timing synced",
  });
}

function updateNodeGraphPatchAudioFromHeader(input) {
  const key = input?.dataset?.audioField;
  if (!key) {
    return;
  }
  const current = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const next = normalizeNodeGraphPatchAudio({
    ...current,
    [key]: input.value,
  });
  if (current[key] === next[key]) {
    input.value = String(next[key]);
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.audio = next;
  commitNodeGraphPatch(patch, {
    markPending: false,
    status: "pitch reference synced",
  });
}

function commitNodeGraphHeaderNumberInput(input) {
  if (!input) {
    return;
  }
  if (input.dataset.timingField) {
    updateNodeGraphPatchTimingFromHeader(input);
  } else if (input.dataset.audioField) {
    updateNodeGraphPatchAudioFromHeader(input);
  } else if (input.dataset.globalScopeInput) {
    setNodeGraphScopeNumberInputValue(input, input.value);
  }
  input.readOnly = true;
}

function bindNodeGraphHeaderTimingWidgets(root = document) {
  for (const input of root.querySelectorAll(".node-header-timing-input")) {
    if (input.dataset.timingBound === "true") {
      continue;
    }
    input.dataset.timingBound = "true";
    if (input.dataset.globalScopeNumberDrag === "true") {
      input.readOnly = true;
    }
    input.addEventListener("change", () => commitNodeGraphHeaderNumberInput(input));
    input.addEventListener("blur", () => commitNodeGraphHeaderNumberInput(input));
    if (input.dataset.timingField || input.dataset.audioField) {
      input.addEventListener("dblclick", beginNodeGraphScopeNumberEdit);
    }
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        commitNodeGraphHeaderNumberInput(input);
        input.blur();
      }
      event.stopPropagation();
    });
    input.addEventListener("pointerdown", (event) => {
      if ((input.dataset.timingField || input.dataset.audioField) && input.readOnly) {
        event.preventDefault();
      }
      event.stopPropagation();
    });
  }
  for (const field of root.querySelectorAll(".node-header-timing-field[data-header-number-drag='true']")) {
    if (field.dataset.headerNumberDragBound === "true") {
      continue;
    }
    field.dataset.headerNumberDragBound = "true";
    field.addEventListener("dblclick", beginNodeGraphScopeNumberEdit, true);
    field.addEventListener("pointerdown", beginNodeGraphScopeNumberDrag, true);
  }
}

function createNodeGraphHeaderTimingInput(key, label, options = {}) {
  const field = document.createElement("label");
  field.className = "node-header-timing-field";
  field.dataset.headerNumberDrag = "true";
  if (options.row) {
    field.dataset.timingRow = options.row;
  }
  field.setAttribute("aria-label", label);

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = label;
  field.append(caption);

  const input = document.createElement("input");
  input.className = "node-header-timing-input";
  input.dataset.timingField = key;
  input.dataset.globalScopeNumberDrag = "true";
  input.inputMode = "numeric";
  input.min = String(options.min ?? 1);
  input.max = String(options.max ?? 32);
  input.step = String(options.step ?? 1);
  input.type = "number";
  input.readOnly = true;
  input.value = String(nodeGraphPatchTimingValue(key));
  field.append(input);

  return field;
}

function createNodeGraphHeaderAudioInput(key, label, options = {}) {
  const field = document.createElement("label");
  field.className = "node-header-timing-field";
  field.dataset.headerNumberDrag = "true";
  field.setAttribute("aria-label", options.ariaLabel || label);
  if (options.tooltipKey) {
    field.dataset.tooltipKey = options.tooltipKey;
  }

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = label;
  field.append(caption);

  const input = document.createElement("input");
  input.className = "node-header-timing-input";
  input.dataset.audioField = key;
  input.dataset.globalScopeNumberDrag = "true";
  input.inputMode = "decimal";
  input.min = String(options.min ?? 0.01);
  input.max = String(options.max ?? 20000);
  // "any", not a numeric step. Pitch reference frequency is continuous --
  // normalizeNodeGraphPatchAudio only clamps it to 0.01..20000. With a step
  // of 1 and a min of 0.01 the browser considers the valid values to be
  // 0.01, 1.01, 2.01 ... so typing 100 (the default!) failed validation and
  // popped the useless native "Please enter a valid value" bubble. The
  // spinner is hidden anyway, so step had no other purpose here.
  input.step = String(options.step ?? "any");
  input.type = "number";
  input.readOnly = true;
  input.value = String(nodeGraphPatchAudioValue(key));
  if (options.tooltipKey) {
    input.dataset.tooltipKey = options.tooltipKey;
  }
  field.append(input);

  return field;
}

function createNodeGraphTapTempoButton() {
  const button = document.createElement("button");
  button.className = "node-header-tap-tempo-button";
  button.type = "button";
  button.textContent = "Tap";
  button.title = "Tap tempo";
  button.setAttribute("aria-label", "Tap tempo for patch BPM");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleNodeGraphTapTempo();
  });
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  button.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
  return button;
}

function createNodeGraphHeaderSpeedPlaceholder() {
  const field = document.createElement("label");
  field.className = "node-header-timing-field node-header-scope-field node-header-speed-placeholder node-under-construction-control";
  field.setAttribute("aria-label", "Speed control under construction");
  field.dataset.tooltipKey = "timing.speedUnderConstruction";

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = "Speed";
  field.append(caption);

  const input = document.createElement("input");
  input.className = "node-header-timing-input";
  input.inputMode = "decimal";
  input.max = "16";
  input.min = "0";
  input.readOnly = true;
  input.step = "0.1";
  input.type = "number";
  input.value = "1.0";
  // Tagged so renderNodeGraphSpeedReadout can keep it in step with the
  // engine's speed multiplier (0 while paused). Still read-only/under
  // construction as an *input* -- it only reports, it does not set speed.
  input.dataset.speedReadout = "true";
  input.setAttribute("aria-label", "Speed placeholder, under construction");
  input.dataset.tooltipKey = "timing.speedUnderConstruction";
  input.addEventListener("keydown", (event) => event.stopPropagation());
  input.addEventListener("pointerdown", (event) => event.stopPropagation());

  field.append(input);
  return field;
}

// Full-scale ceiling (Hz) for the universal oscillator `f` input: 0..speedLimit.
function createNodeGraphHeaderSpeedLimitField() {
  const field = document.createElement("label");
  field.className = "node-header-timing-field node-header-scope-field";
  field.setAttribute("aria-label", "Speed limit for oscillator f input in Hertz");
  field.dataset.headerNumberDrag = "true";
  field.title = "Max Hz for the universal oscillator f input (linear 0…limit).";

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = "Speed Limit";
  field.append(caption);

  const input = document.createElement("input");
  input.className = "node-header-timing-input";
  input.dataset.speedLimit = "true";
  input.inputMode = "decimal";
  input.min = "1";
  input.max = "192000";
  input.step = "any";
  input.type = "number";
  input.value = String(
    typeof nodeGraphLiveSpeedLimitHz === "function"
      ? nodeGraphLiveSpeedLimitHz()
      : (nodeGraphMvp?.live?.speedLimit ?? 20000),
  );
  input.setAttribute("aria-label", "Speed limit Hertz for f input");
  input.addEventListener("keydown", (event) => event.stopPropagation());
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  const commit = () => {
    if (typeof setNodeGraphLiveSpeedLimit === "function") {
      setNodeGraphLiveSpeedLimit(input.value);
    }
    input.value = String(
      typeof nodeGraphLiveSpeedLimitHz === "function"
        ? nodeGraphLiveSpeedLimitHz()
        : 20000,
    );
  };
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  field.append(input);
  return field;
}

function createNodeGraphHeaderScopeInput(id, label, value, options = {}) {
  const field = document.createElement("label");
  field.className = "node-header-timing-field node-header-scope-field";
  if (options.underConstruction) {
    field.classList.add("node-under-construction-control");
    field.dataset.tooltipKey = options.tooltipKey || "timing.underConstruction";
    field.title = options.title || `${label} is under construction.`;
  }
  if (options.row) {
    field.dataset.timingRow = options.row;
  }
  if (!options.underConstruction) {
    field.dataset.headerNumberDrag = "true";
  }
  field.setAttribute("aria-label", options.ariaLabel || label);

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = label;
  field.append(caption);

  const input = document.createElement("input");
  input.id = id;
  input.className = "node-header-timing-input";
  if (!options.underConstruction) {
    input.dataset.globalScopeInput = options.scopeInput || "";
    input.dataset.globalScopeNumberDrag = "true";
  }
  input.inputMode = options.inputMode || "decimal";
  input.min = String(options.min ?? 0);
  input.max = String(options.max ?? 1);
  input.step = String(options.step ?? 0.01);
  input.readOnly = true;
  input.type = "number";
  input.value = String(value);
  if (options.underConstruction) {
    input.tabIndex = -1;
    input.setAttribute("aria-label", `${label} placeholder, under construction`);
    input.dataset.tooltipKey = options.tooltipKey || "timing.underConstruction";
  }
  input.addEventListener("keydown", (event) => event.stopPropagation());
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  field.append(input);

  return field;
}

function resetNodeGraphTapTempo(nowMs = 0) {
  nodeGraphTapTempoState.lastTapMs = nowMs;
  nodeGraphTapTempoState.intervals = [];
}

function handleNodeGraphTapTempo() {
  const nowMs = performance.now();
  if (!nodeGraphTapTempoState.lastTapMs || nowMs - nodeGraphTapTempoState.lastTapMs > 2500) {
    resetNodeGraphTapTempo(nowMs);
    return;
  }

  const intervalMs = nowMs - nodeGraphTapTempoState.lastTapMs;
  nodeGraphTapTempoState.lastTapMs = nowMs;
  nodeGraphTapTempoState.intervals.push(intervalMs);
  if (nodeGraphTapTempoState.intervals.length > 4) {
    nodeGraphTapTempoState.intervals.shift();
  }
  const averageIntervalMs = nodeGraphTapTempoState.intervals.reduce((total, value) => total + value, 0)
    / nodeGraphTapTempoState.intervals.length;
  const tempoBpm = Math.max(1, Math.min(320, Math.round(60000 / averageIntervalMs)));
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.timing = normalizeNodeGraphPatchTiming({
    ...patch.timing,
    tempoBpm,
  });
  syncNodeGraphTransportBpmParams(patch, patch.timing);
  commitNodeGraphPatch(patch, {
    markPending: false,
    status: "tap tempo synced",
  });
}

function createNodeGraphHeaderRenderRangeInput(className, label, defaultValue, options = {}) {
  const field = document.createElement("label");
  field.className = "node-header-timing-field node-header-render-range-field";
  field.setAttribute("aria-label", options.ariaLabel || label);
  if (options.tooltip) field.title = options.tooltip;

  const caption = document.createElement("span");
  caption.className = "node-header-timing-caption";
  caption.textContent = label;
  field.append(caption);

  const input = document.createElement("input");
  input.className = `node-header-timing-input ${className}`;
  input.inputMode = "decimal";
  input.min = String(options.min ?? 0);
  input.max = String(options.max ?? 3600);
  // Same reasoning as the audio input above: render start/end are arbitrary
  // seconds (min 0.05 on End, so a 0.05 step grid would reject 1.33), and
  // these became double-click-to-type fields, so a step mismatch here would
  // be user-visible too.
  input.step = "any";
  input.type = "number";
  input.value = formatNodeSliderCompactNumber(defaultValue);
  input.setAttribute("aria-label", options.ariaLabel || label);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { input.blur(); }
    event.stopPropagation();
  });
  input.addEventListener("change", handleNodeGraphRenderRangeInput);
  input.addEventListener("blur", handleNodeGraphRenderRangeInput);
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  field.append(input);

  return field;
}

function createNodeGraphHeaderTimingWidgets() {
  const group = document.createElement("div");
  group.className = "node-header-timing-widgets";
  group.setAttribute("aria-label", "Patch timing");

  group.append(
    createNodeGraphTapTempoButton(),
    createNodeGraphHeaderTimingInput("tempoBpm", "BPM", { max: 320 }),
    createNodeGraphHeaderTimingInput("timeSignatureNumerator", "Beats"),
    createNodeGraphHeaderTimingInput("timeSignatureDenominator", "Unit"),
    createNodeGraphHeaderScopeInput(
      "nodeMasterScopeFps",
      "FPS",
      normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60),
      {
        ariaLabel: "Display frames per second",
        inputMode: "numeric",
        max: 240,
        min: 0,
        scopeInput: "framesPerSecond",
        step: 1,
      },
    ),
    createNodeGraphHeaderSpeedPlaceholder(),
    createNodeGraphHeaderSpeedLimitField(),
    createNodeGraphHeaderRenderRangeInput("node-header-render-start-input", "Start", nodeGraphMvp.renderStartSeconds ?? 0, { ariaLabel: "Render start time in seconds", min: 0, max: 3599, tooltip: "Sets the Render Sample start point (seconds)" }),
    createNodeGraphHeaderRenderRangeInput("node-header-render-end-input", "End", nodeGraphMvp.renderEndSeconds ?? (nodeGraphMvp.seconds ?? 2), { ariaLabel: "Render end time in seconds", min: 0.05, max: 3600, tooltip: "Sets the Render Sample end point (seconds)" }),
  );
  return group;
}

function createNodeGraphCommandCenterTimingWidgets() {
  const group = document.createElement("div");
  group.className = "node-header-timing-widgets node-command-center-timing-widgets";
  group.setAttribute("aria-label", "Command Center patch timing");

  const tempoRow = document.createElement("div");
  tempoRow.className = "node-command-center-timing-row node-command-center-timing-row-tempo";
  tempoRow.append(
    createNodeGraphHeaderTimingInput("tempoBpm", "BPM", { max: 320 }),
    createNodeGraphHeaderTimingInput("timeSignatureNumerator", "Beats"),
    createNodeGraphHeaderTimingInput("timeSignatureDenominator", "Unit"),
  );

  const pitchRow = document.createElement("div");
  pitchRow.className = "node-command-center-timing-row node-command-center-timing-row-pitch";
  pitchRow.append(
    createNodeGraphHeaderAudioInput("pitchReferenceHz", "Freq Ref", {
      ariaLabel: "Pitch Reference Frequency in Hz (0.1V/Oct reference)",
      tooltipKey: "timing.pitchReferenceHz",
      min: 0.01,
      max: 20000,
    }),
  );

  group.append(tempoRow, pitchRow);
  return group;
}

function renderNodeGraphCommandCenterTimingControls() {
  const host = document.getElementById("nodeSceneTimingControls");
  if (!host) {
    return;
  }
  if (!host.querySelector(".node-command-center-timing-widgets")) {
    host.replaceChildren(createNodeGraphCommandCenterTimingWidgets());
  }
  bindNodeGraphHeaderTimingWidgets(host);
}

function renderNodeGraphPatchTimingControls() {
  renderNodeGraphCommandCenterTimingControls();
  const host = document.getElementById("nodePatchTimingControls");
  if (!host) {
    syncNodeGraphHeaderTimingWidgets();
    return;
  }
  if (!host.querySelector(".node-header-timing-widgets")) {
    host.replaceChildren(createNodeGraphHeaderTimingWidgets());
  }
  bindNodeGraphHeaderTimingWidgets(host);
  syncNodeGraphHeaderTimingWidgets();
  syncNodeGraphRenderRangeToUI();
  moveNodeGraphRenderRangeToDurationControl();
}

function moveNodeGraphRenderRangeToDurationControl() {
  const dur = document.getElementById("nodeRenderDurationControl") || document.querySelector(".node-render-duration-control");
  if (!dur) return;
  // Move Start/End inputs from header toolbar into the Render Sample row
  for (const cls of [".node-header-render-start-input", ".node-header-render-end-input"]) {
    const input = document.querySelector(cls);
    const field = input?.closest(".node-header-render-range-field");
    if (field && field.parentElement !== dur) {
      dur.appendChild(field);
    }
  }
  // These fields can be (re)created after the one-shot load-time binding in
  // node-graph-render-settings.js has already run, so re-run it here -- it is
  // idempotent (guarded by field.dataset.dblClickBound) and this is the only
  // point every render-range field is guaranteed to exist and be mounted.
  if (typeof bindNodeGraphRenderRangeDoubleClick === "function") {
    bindNodeGraphRenderRangeDoubleClick();
  }
}

function createNodeGraphModuleHeader(type, node, definition) {
  const header = document.createElement("div");
  header.className = "dsp-node-header";
  const titleRow = document.createElement("div");
  titleRow.className = "node-header-title-row";
  nodeGraphApplyTooltip(titleRow, "module.titleMove", {}, { title: false });
  const titleText = document.createElement("input");
  titleText.type = "text";
  titleText.className = "node-header-title node-header-title-input";
  titleText.dataset.node = node;
  titleText.spellcheck = false;
  // Always the module type name (not user alias). Alias lives under Command
  // Center Module Settings and drives Value Slider face label / wire names.
  titleText.value = typeof nodeGraphModuleChromeTitle === "function"
    ? nodeGraphModuleChromeTitle({ id: node, type })
    : (nodeGraphNodeLabels?.[type] || type);
  titleText.readOnly = true;
  titleText.tabIndex = -1;
  titleText.setAttribute("aria-readonly", "true");
  titleText.title = "Module type name (edit ALIAS under Module Settings)";
  // Single/double click on the title behave exactly like clicking anywhere
  // else in the header row (select/drag the module, or open the module
  // settings menu on double-click). Title is not an alias editor.
  titleText.addEventListener("pointerdown", (event) => event.preventDefault());
  titleRow.append(titleText);
  header.append(titleRow);

  const actionRow = document.createElement("div");
  actionRow.className = "node-header-actions";
  // Without its own tooltip, hovering the gaps between these buttons fell
  // through closest() all the way to the whole-node ".dsp-node" fallback
  // (module.drag) -- a third, differently-worded "drag to move" tooltip
  // sandwiched between the title row's own module.titleMove and the
  // display canvas's tooltip. Give it the same key as the title row so
  // the whole header reads as one consistent zone; the buttons inside
  // still show their own specific tooltips since closest() matches them
  // first.
  nodeGraphApplyTooltip(actionRow, "module.titleMove", {}, { title: false });
  const handle = document.createElement("button");
  handle.className = "node-drag-handle";
  handle.type = "button";
  handle.setAttribute("aria-label", `Move ${nodeGraphNodeLabels[type]} module`);
  nodeGraphApplyTooltip(handle, "module.move", {}, { title: false });
  handle.innerHTML = "&#x2725;";
  actionRow.append(handle);
  const displayButton = document.createElement("button");
  displayButton.className = "node-display-settings-button";
  displayButton.type = "button";
  displayButton.dataset.node = node;
  displayButton.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} display settings`);
  displayButton.setAttribute("aria-pressed", "true");
  nodeGraphApplyTooltip(displayButton, "module.displaySettings", {}, { title: false });
  displayButton.textContent = "\u{1F4FA}";
  actionRow.append(displayButton);
  const metaparameterButton = document.createElement("button");
  metaparameterButton.className = "node-metaparameter-button";
  metaparameterButton.type = "button";
  metaparameterButton.dataset.node = node;
  metaparameterButton.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} metaparameters`);
  metaparameterButton.setAttribute("aria-pressed", "true");
  nodeGraphApplyTooltip(metaparameterButton, "module.metaparameters", {}, { title: false });
  metaparameterButton.textContent = "\u{1F39B}\uFE0F";
  actionRow.append(metaparameterButton);
  const actionButton = document.createElement("button");
  actionButton.className = "node-action-button";
  actionButton.type = "button";
  actionButton.dataset.node = node;
  actionButton.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} module settings`);
  nodeGraphApplyTooltip(actionButton, "module.actionsTitle", {}, { title: false });
  actionButton.textContent = "\u2699\uFE0F";
  actionRow.append(actionButton);
  const orderBadge = document.createElement("span");
  orderBadge.className = "node-execution-order-badge";
  orderBadge.dataset.executionState = "inactive";
  orderBadge.textContent = "--";
  orderBadge.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} execution order inactive`);
  nodeGraphApplyTooltip(orderBadge, "module.executionTitleInactive", {}, { title: false });
  actionRow.append(orderBadge);
  if (definition.output) {
    const bypassButton = document.createElement("button");
    bypassButton.className = "node-bypass-button";
    bypassButton.type = "button";
    bypassButton.dataset.node = node;
    bypassButton.textContent = nodeGraphBypassGlyph(false);
    bypassButton.setAttribute("aria-label", "Toggle live OUTPUT from Output module");
    bypassButton.setAttribute("aria-pressed", "true");
    nodeGraphApplyTooltip(bypassButton, "module.outputToggle", {}, { title: false });
    actionRow.append(bypassButton);
  }
  if (!definition.output && !definition.layoutOnly) {
    const bypassButton = document.createElement("button");
    bypassButton.className = "node-bypass-button";
    bypassButton.type = "button";
    bypassButton.dataset.node = node;
    bypassButton.textContent = nodeGraphBypassGlyph(false);
    bypassButton.setAttribute("aria-label", `Bypass ${nodeGraphNodeLabels[type]} module`);
    bypassButton.setAttribute("aria-pressed", "false");
    nodeGraphApplyTooltip(bypassButton, "module.bypass", {}, { title: false });
    actionRow.append(bypassButton);
  }
  header.append(actionRow);

  return header;
}
