function nodeGraphPaintRgbaPortLabel(label) {
  if (!label) {
    return;
  }
  label.textContent = "📺";
  label.classList.add("node-io-label-rgba");
  label.setAttribute("aria-label", "TV");
  label.title = "TV (composite luma of graded RGB)";
}

function createNodeGraphPort(node, type, port, io) {
  const button = document.createElement("button");
  button.className = `node-port ${io}`;
  button.type = "button";
  button.dataset.node = node;
  button.dataset.port = port;
  button.dataset.io = io;
  button.dataset.alias = nodeGraphLabel(node, port);
  if (io === "output" || io === "input") {
    if (typeof nodeGraphApplyJackChrome === "function") {
      nodeGraphApplyJackChrome(button, type, port, io);
    } else if (typeof nodeGraphApplyOutletChannelMark === "function") {
      nodeGraphApplyOutletChannelMark(button, type, port);
    }
  }
  const portLabel = nodeGraphPatchNodePortDisplayLabel(node, type, port, io);
  const label = `${nodeGraphNodeLabels[type]} ${io} port ${portLabel}`;
  button.setAttribute("aria-label", label);
  const portTip = nodeGraphPortTooltipText(type, port, io);
  if (portTip) {
    button.dataset.interactionHelp = portTip;
  }
  return button;
}

/** LayoutB / LayoutC / Input / portal stay L/M/R. Never rename RGB R. */
function nodeGraphStereoJackDisplayLabel(value, type, port) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const portKey = String(port || "").trim().toLowerCase();
  if (
    (key === "r" || portKey === "r")
    && typeof nodeGraphModuleHasRgbColorPorts === "function"
    && nodeGraphModuleHasRgbColorPorts(type)
  ) {
    return raw;
  }
  const compact = (
    (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type))
    || (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type))
    || (typeof nodeGraphPortalKindFromType === "function" && Boolean(nodeGraphPortalKindFromType(type)))
  );
  if (compact) {
    if (key === "left" || key === "l") return "L";
    if (key === "mono" || key === "m") return "M";
    if (key === "right" || key === "r") return "R";
    return raw;
  }
  if (key === "l") return "Left";
  if (key === "m") return "Mono";
  if (key === "r") return "Right";
  return raw;
}

function nodeGraphPortTooltipText(type, port, io) {
  const def = nodeGraphModuleDefinitions[type];
  const map = io === "output" ? def?.outputTooltips : def?.inputTooltips;
  return String(map?.[port] || "").trim();
}

function nodeGraphPortDisplayLabel(type, port, io) {
  const labels = io === "output"
    ? nodeGraphModuleDefinitions[type]?.outputLabels
    : nodeGraphModuleDefinitions[type]?.inputLabels;
  const raw = labels?.[port] || port;
  const freq = typeof nodeGraphFrequencyValuePortDisplayLabel === "function"
    ? nodeGraphFrequencyValuePortDisplayLabel(raw)
    : raw;
  return nodeGraphStereoJackDisplayLabel(freq, type, port);
}

function nodeGraphPatchNodePortDisplayLabel(node, type, port, io) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const alias = normalizeNodeGraphPatchMetadataAlias(patchNode?.portMeta?.[io]?.[port]?.alias);
  if (alias) {
    return nodeGraphStereoJackDisplayLabel(alias, type, port);
  }
  return nodeGraphPortDisplayLabel(type, port, io);
}

/**
 * Apply a DOMAIN parameter value onto a slider input.
 * Clears legacy unbounded* dataset keys from older sessions, keeps
 * `dataset.domainValue` aligned with the stored patch value (readouts and
 * commit paths prefer domainValue over the HTML range thumb), and sets the
 * thumb to an in-range display value when domain exceeds min/max.
 */
function applyNodeGraphInputUnboundedValue(input, value) {
  if (!input?.dataset) {
    return;
  }
  delete input.dataset.unboundedValue;
  delete input.dataset.unboundedMax;
  delete input.dataset.unboundedMin;
  if (value === undefined || value === null || value === "") {
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return;
  }
  input.dataset.domainValue = String(n);
  if (typeof nodeSliderThumbDisplayValue === "function") {
    input.value = String(nodeSliderThumbDisplayValue(input, n));
  } else {
    input.value = String(n);
  }
}

function createNodeGraphIoColumn(node, type, ports, io) {
  if (!ports?.length) {
    return null;
  }

  const column = document.createElement("div");
  column.className = `node-io-column ${io}`;
  // Longest label (char count) drives min width for every row in this column so
  // inlet hitboxes match each other and outlet hitboxes match each other.
  let maxLabelChars = 1;
  for (const port of ports) {
    const row = document.createElement("div");
    row.className = `node-io-row ${io}`;
    row.dataset.node = node;
    row.dataset.port = port;
    row.dataset.io = io;
    row.dataset.alias = nodeGraphLabel(node, port);
    if (io === "output" || io === "input") {
      if (typeof nodeGraphApplyJackChrome === "function") {
        nodeGraphApplyJackChrome(row, type, port, io);
      } else if (typeof nodeGraphApplyOutletChannelMark === "function") {
        nodeGraphApplyOutletChannelMark(row, type, port);
      }
    }
    if (nodeGraphPortIsDigitalSignal(type, port, io)) {
      // White digital cable: Scale bitmasks, ƒ Hz-value jacks (in and out),
      // and anything listed in digitalInputs/digitalOutputs. 0.1V/Oct stays
      // analog. See nodeGraphPortIsDigitalSignal.
      row.dataset.digitalSignal = io;
    }
    const portLabel = nodeGraphPatchNodePortDisplayLabel(node, type, port, io);
    maxLabelChars = Math.max(maxLabelChars, String(portLabel || "").length);
    row.setAttribute(
      "aria-label",
      `${nodeGraphNodeLabels[type]} ${io} port ${portLabel} interaction area`,
    );
    const portTip = nodeGraphPortTooltipText(type, port, io);
    if (portTip) {
      row.dataset.interactionHelp = portTip;
    }
    const label = document.createElement("span");
    label.className = "node-io-label";
    label.dataset.portLabel = port;
    if (typeof nodeGraphPaintRgbaPortLabel === "function" && String(port) === "rgba") {
      nodeGraphPaintRgbaPortLabel(label);
    } else {
      label.textContent = portLabel;
    }
    if (io === "input") {
      row.append(createNodeGraphPort(node, type, port, io), label);
    } else {
      row.append(label, createNodeGraphPort(node, type, port, io));
    }
    column.append(row);
  }
  // CSS: .node-io-label min-width uses 1ch × this (monospace IO font).
  // LayoutA section tracks also read --node-io-{input|output}-label-ch.
  column.style.setProperty("--node-io-label-min-ch", String(maxLabelChars));
  column.dataset.maxLabelChars = String(maxLabelChars);
  return column;
}

function createNodeGraphIoProxyPort(node, io) {
  const port = document.createElement("span");
  port.className = `node-port ${io} node-io-proxy-port`;
  port.dataset.node = node;
  port.dataset.io = io;
  port.dataset.ioProxy = io;
  port.setAttribute("aria-hidden", "true");
  return port;
}

function createNodeGraphIoProxySection(node, inputPorts = [], outputPorts = []) {
  if (!inputPorts.length && !outputPorts.length) {
    return null;
  }
  const proxy = document.createElement("div");
  proxy.className = "node-io-proxy";
  proxy.dataset.node = node;
  if (inputPorts.length) {
    proxy.append(createNodeGraphIoProxyPort(node, "input"));
  } else {
    proxy.append(document.createElement("span"));
  }
  const spacer = document.createElement("span");
  spacer.className = "node-io-proxy-spacer";
  proxy.append(spacer);
  if (outputPorts.length) {
    proxy.append(createNodeGraphIoProxyPort(node, "output"));
  } else {
    proxy.append(document.createElement("span"));
  }
  return proxy;
}

// Tiny jack on the LEFT of a parameter slider row. This is NOT a module
// `inputs[]` port — it does not appear in the left IO column. Wires here are
// graph modulations into the parameter, applied inside
// readNodeGraphLiveEffectiveParam / readEffectiveParameter. For a full
// left-column CV jack, list the name in definition.inputs and mixInput() it
// in the evaluator (see dsfOscillator Phase/Amplitude).
function createNodeParameterModulationPort(node, type, parameter) {
  const button = document.createElement("button");
  button.className = "node-param-port modulation-input";
  button.type = "button";
  button.dataset.node = node;
  button.dataset.param = parameter.key;
  button.dataset.port = parameter.key;
  button.dataset.io = "modulation";
  button.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${parameter.key} mod`;
  const label = `${nodeGraphNodeLabels[type]} ${parameter.label} modulation input`;
  button.setAttribute("aria-label", label);
  return button;
}

function createNodeParameterOutputPort(node, type, parameter) {
  const button = document.createElement("button");
  button.className = "node-param-port parameter-output node-port output";
  button.type = "button";
  button.dataset.node = node;
  button.dataset.param = parameter.key;
  button.dataset.port = parameter.key;
  button.dataset.io = "output";
  button.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${parameter.key} slider`;
  const label = `${nodeGraphNodeLabels[type]} ${parameter.label} slider output`;
  button.setAttribute("aria-label", label);
  return button;
}

function syncNodeGraphModulePortLabels(element, patchNode) {
  if (!element || !patchNode) {
    return;
  }
  for (const row of element.querySelectorAll(".node-io-row")) {
    const io = row.dataset.io;
    const port = row.dataset.port;
    if (io !== "input" && io !== "output") {
      continue;
    }
    const portLabel = nodeGraphPatchNodePortDisplayLabel(patchNode, patchNode.type, port, io);
    const label = row.querySelector(".node-io-label");
    if (label) {
      if (typeof nodeGraphPaintRgbaPortLabel === "function" && String(port) === "rgba") {
        nodeGraphPaintRgbaPortLabel(label);
      } else {
        label.textContent = portLabel;
      }
    }
    row.setAttribute(
      "aria-label",
      `${nodeGraphNodeLabels[patchNode.type]} ${io} port ${portLabel} interaction area`,
    );
    const button = row.querySelector(".node-port");
    if (button) {
      button.setAttribute("aria-label", `${nodeGraphNodeLabels[patchNode.type]} ${io} port ${portLabel}`);
    }
  }
}

function createNodeGraphInputPort(node, type, graphInput) {
  const button = document.createElement("button");
  button.className = "node-param-port graph-input";
  button.type = "button";
  button.dataset.node = node;
  button.dataset.graphInput = graphInput;
  button.dataset.port = graphInput;
  button.dataset.io = "graph";
  button.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${graphInput}`;
  button.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} ${graphInput} graph input`);
  return button;
}

function createNodeGraphInputSection(node, type) {
  const graphInputs = nodeGraphModuleGraphInputs(type);
  if (!graphInputs.length) {
    return null;
  }
  const section = document.createElement("div");
  section.className = "dsp-node-graph-input-section";
  for (const graphInput of graphInputs) {
    const row = document.createElement("div");
    row.className = "node-graph-input-row";
    row.dataset.node = node;
    row.dataset.graphInput = graphInput;
    row.dataset.port = graphInput;
    row.dataset.io = "graph";
    row.dataset.alias = `${nodeGraphNodeDisplayName(node)}.${graphInput}`;
    row.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} ${graphInput} graph input interaction area`);
    const label = document.createElement("span");
    label.className = "node-graph-input-label";
    label.textContent = graphInput;
    row.append(createNodeGraphInputPort(node, type, graphInput), label);
    section.append(row);
  }
  return section;
}

function createNodeGraphAudioInputStatusFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-live-input-state-badge node-module-face";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(face, "face");
  }
  face.dataset.node = node;
  face.dataset.nodeType = type || "audioInput";
  face.dataset.micState = "off";
  face.textContent = "mic off";
  face.setAttribute("role", "status");
  face.setAttribute("aria-live", "polite");
  if (typeof syncNodeGraphInputModuleLiveState === "function") {
    queueMicrotask(() => {
      try {
        syncNodeGraphInputModuleLiveState();
      } catch (_error) {
        // Status text is best-effort until live input sync runs.
      }
    });
  }
  return face;
}

function createNodeGraphUnderConstructionFace(node, type) {
  const section = document.createElement("div");
  section.className = "node-module-under-construction node-module-face";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.dataset.node = node;
  section.dataset.nodeType = type;
  section.textContent = "Under construction";
  section.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} under construction`);
  return section;
}

function createNodeGraphModuleScopeSection(node, type) {
  const section = document.createElement("div");
  section.className = "node-module-scope-window node-module-face node-light-source";
  if (typeof tagNodeGraphModuleBand === "function") {
    tagNodeGraphModuleBand(section, "face");
  }
  section.dataset.node = node;
  section.dataset.nodeType = type;
  // Layer A app dimmer: all screen displays produce light (modular view shader punches here).
  section.dataset.lightSource = "screen";
  section.dataset.tooltipKey = "module.scopeWindow";
  section.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} scope`);
  if (typeof nodeGraphApplyTooltip === "function") {
    nodeGraphApplyTooltip(section, "module.scopeWindow");
  }
  applyNodeGraphResourceConstraintMarks(section, nodeGraphModuleResourceConstraintsForType(type));

  const surface = document.createElement("div");
  surface.className = "node-module-scope-window-surface";
  section.append(surface);

  const analyzer = document.createElement("div");
  analyzer.className = "node-module-scope-analyzer";
  analyzer.hidden = true;
  section.append(analyzer);
  return section;
}

// createNodeGraphLedFace moved to public/modules/led/led-ui.js.

// createNodeGraphKnobFace is defined in
// public/modules/knob/knob-face.js (loaded after this file).

/** @deprecated use createNodeGraphKnobFace */
function createNodeGraphSliderWidgetBody(node, type) {
  return typeof createNodeGraphKnobFace === "function"
    ? createNodeGraphKnobFace(node, type)
    : document.createElement("div");
}

// Step Grid's UI (createNodeGraphStepGridBody, toggleNodeGraphStepGridStep)
// lives in public/modules/stepGrid/step-grid-ui.js, alongside its DSP
// evaluator files, not here -- see that file for the fully-custom /
// chromeless UI pattern future 100%-custom modules should follow.

function createNodeGraphPatchCommandBody(node) {
  const body = document.createElement("div");
  body.className = "node-patch-command-body";
  body.dataset.node = node;
  const patchNode = nodeGraphPatchNode(node);
  const previous = patchNode?.type === "previousPatch";
  const label = document.createElement("strong");
  label.textContent = previous ? "PREVIOUS PATCH" : "NEXT PATCH";
  const status = document.createElement("span");
  status.textContent = "trigger input";
  body.append(label, status);
  return body;
}

function createNodeGraphSpeakerProtectionBody(node) {
  const body = document.createElement("div");
  body.className = "node-speaker-protection-body";
  body.dataset.node = node;

  const status = document.createElement("strong");
  status.dataset.speakerProtectionStatus = "true";

  const limit = document.createElement("span");
  limit.textContent = "limit 1.0";

  const peak = document.createElement("span");
  peak.dataset.speakerProtectionPeak = "true";

  body.append(status, limit, peak);
  renderNodeGraphSpeakerProtectionBody(body);
  return body;
}

function renderNodeGraphSpeakerProtectionBody(body) {
  const status = body?.querySelector?.("[data-speaker-protection-status]");
  const peak = body?.querySelector?.("[data-speaker-protection-peak]");
  const tripped = typeof nodeGraphEarProtectionIsHot === "function"
    ? nodeGraphEarProtectionIsHot()
    : (typeof nodeGraphEarProtectionIsTripped === "function" && nodeGraphEarProtectionIsTripped());
  body?.classList.toggle("tripped", tripped);
  if (status) {
    status.textContent = tripped ? "TRIPPED" : "ARMED";
  }
  if (peak) {
    const details = globalThis.nodeGraphEarProtectionDetails || {};
    const value = Number(details.protectionPeak);
    peak.textContent = Number.isFinite(value) && value > 0
      ? `peak ${value.toFixed(3)}`
      : "peak --";
  }
}

function refreshNodeGraphSpeakerProtectionBodies() {
  document.querySelectorAll(".node-speaker-protection-body").forEach((body) => {
    renderNodeGraphSpeakerProtectionBody(body);
  });
}

function createNodeGraphScreenSpaceShaderBody(node) {
  const patchNode = nodeGraphPatchNode(node);
  const script = normalizeNodeGraphScreenSpaceShader(patchNode?.screenSpaceShader);
  const body = document.createElement("div");
  body.className = "node-screen-space-shader-body";
  body.dataset.node = node;

  const editor = document.createElement("textarea");
  editor.className = "node-screen-space-shader-source";
  editor.dataset.screenSpaceShaderSource = "true";
  editor.spellcheck = false;
  editor.value = script.source;
  editor.setAttribute("aria-label", "Screen space shader script");

  const footer = document.createElement("div");
  footer.className = "node-screen-space-shader-footer";
  const status = document.createElement("span");
  status.dataset.screenSpaceShaderStatus = "true";
  status.textContent = `${script.inputs.length} inputs / ${script.visualInputs.length} controls`;
  const apply = document.createElement("button");
  apply.type = "button";
  apply.dataset.screenSpaceShaderApply = "true";
  apply.textContent = "Apply";
  footer.append(status, apply);
  body.append(editor, footer);
  return body;
}

function refreshNodeGraphScreenSpaceShaderBodyStatus(body) {
  const source = body?.querySelector?.("[data-screen-space-shader-source]")?.value || "";
  const status = body?.querySelector?.("[data-screen-space-shader-status]");
  if (!status) {
    return;
  }
  const script = normalizeNodeGraphScreenSpaceShader({ source });
  status.textContent = `${script.inputs.length} inputs / ${script.visualInputs.length} controls`;
}

// node is optional -- see the comment on createNodeGraphKeyboardControllerBody;
// same reuse pattern for the standalone performance dock.
// The knob bank IS the module display (no title/status chrome).
function createNodeGraphMacroControlsBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-macro-controls-panel node-macro-controls-module node-module-scope-window";
  if (node) {
    section.dataset.node = node;
  }
  section.dataset.macroControlsDisplay = "true";
  section.setAttribute("aria-label", "Macro controls");
  const row = document.createElement("div");
  row.className = "node-macro-controls-row";
  row.setAttribute("aria-label", "Macro knob row");
  for (let index = 0; index < 8; index += 1) {
    const knob = document.createElement("button");
    knob.className = "node-macro-knob";
    knob.type = "button";
    knob.dataset.macroIndex = String(index);
    knob.setAttribute("aria-label", `Macro ${index + 1}`);
    knob.setAttribute("aria-valuemin", "0");
    knob.setAttribute("aria-valuemax", "1");
    knob.setAttribute("aria-valuenow", "0");
    knob.setAttribute("role", "slider");
    const face = typeof nodeGraphMacroControlsFaceSettings === "function"
      ? nodeGraphMacroControlsFaceSettings()
      : null;
    // Shared layout: title above dial, value centered in the circle.
    const label = document.createElement("span");
    label.className = "node-macro-knob-label";
    label.dataset.macroKnobLabel = "true";
    label.textContent = face?.labels?.[index] || `M${index + 1}`;
    const dial = document.createElement("span");
    dial.className = "node-macro-knob-dial";
    dial.dataset.macroKnobDial = "true";
    const value = document.createElement("strong");
    value.className = "node-macro-knob-value";
    value.dataset.macroValue = String(index);
    value.textContent = "0.00";
    const indicator = document.createElement("i");
    indicator.className = "node-macro-knob-arc";
    indicator.dataset.macroKnobArc = "true";
    indicator.setAttribute("aria-hidden", "true");
    dial.append(value, indicator);
    knob.append(label, dial);
    knob.setAttribute("aria-label", label.textContent);
    row.append(knob);
  }
  section.append(row);
  if (typeof applyNodeGraphMacroControlsFaceSettings === "function") {
    // Defer so CSS vars apply after insert (dock + module).
    requestAnimationFrame(() => applyNodeGraphMacroControlsFaceSettings());
  }
  return section;
}

// node is optional -- see the comment on createNodeGraphKeyboardControllerBody;
// same reuse pattern for the standalone performance dock.
function nodeGraphPerformanceWheelSpecs() {
  return [
    { className: "pitch", key: "pitchWheel", label: "Pitch", max: "1", min: "-1" },
    { className: "mod", key: "modWheel", label: "Mod", max: "1", min: "0" },
  ];
}

function createNodeGraphPerformanceWheel(spec) {
  const wheel = document.createElement("div");
  wheel.className = `node-midi-keyboard-wheel ${spec.className}`;
  wheel.dataset.performanceWheel = spec.key;
  wheel.setAttribute("role", "slider");
  wheel.setAttribute("aria-label", `${spec.label} wheel`);
  wheel.setAttribute("aria-valuemin", spec.min);
  wheel.setAttribute("aria-valuemax", spec.max);
  wheel.setAttribute("aria-valuenow", "0");
  wheel.tabIndex = 0;
  const label = document.createElement("span");
  label.textContent = spec.label;
  const indicator = document.createElement("i");
  const value = document.createElement("strong");
  value.dataset.performanceWheelValue = spec.key;
  value.textContent = "0.000";
  wheel.append(label, indicator, value);
  return wheel;
}

function createNodeGraphControllerRow(kind, children = [], options = {}) {
  const row = document.createElement("div");
  row.className = "node-controller-row";
  row.dataset.controllerRow = String(kind || "");
  if (options.grow) {
    row.dataset.controllerGrow = "1";
  }
  if (options.split) {
    const split = document.createElement("div");
    split.className = "node-controller-row-split";
    split.append(...children);
    row.append(split);
  } else {
    row.append(...children);
  }
  return row;
}

function mountNodeGraphControllerRows(host) {
  if (!host) {
    return host;
  }
  host.classList.add("node-controller-rows");
  host.replaceChildren(
    createNodeGraphControllerRow("macros", [createNodeGraphMacroControlsBody()]),
    createNodeGraphControllerRow(
      "keyboard",
      [createNodeGraphPitchModWheelBody(), createNodeGraphKeyboardControllerBody()],
      { split: true },
    ),
  );
  return host;
}

function createNodeGraphPitchModWheelBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-performance-wheels-panel node-performance-wheels-module node-module-face";
  section.dataset.moduleBand = "face";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "Pitch and modulation wheels");
  const bank = document.createElement("div");
  bank.className = "node-midi-keyboard-wheel-bank";
  for (const spec of nodeGraphPerformanceWheelSpecs()) {
    bank.append(createNodeGraphPerformanceWheel(spec));
  }
  section.append(bank);
  return section;
}

function createNodeGraphMidiModeControl() {
  const modeLabel = document.createElement("label");
  modeLabel.className = "node-midi-keyboard-mode-control";
  const modeText = document.createElement("span");
  modeText.textContent = "Mode";
  const modeSelect = document.createElement("select");
  modeSelect.dataset.midiKeyboardModeSelect = "true";
  modeSelect.setAttribute("aria-label", "Keyboard mode");
  for (const [value, label] of [["press", "Press"], ["hold", "Hold"], ["toggle", "Toggle"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.append(option);
  }
  modeLabel.append(modeText, modeSelect);
  return modeLabel;
}

function createNodeGraphPlusMinusControl(spec) {
  const wrap = document.createElement("span");
  wrap.className = "node-midi-keyboard-octave-control";
  wrap.setAttribute("aria-label", spec.ariaLabel);
  const down = document.createElement("button");
  down.type = "button";
  down.dataset[spec.downKey] = "true";
  down.setAttribute("aria-label", spec.downAria);
  down.textContent = "-";
  const value = document.createElement("strong");
  value.dataset[spec.valueKey] = "true";
  value.textContent = spec.valueText || "0";
  const up = document.createElement("button");
  up.type = "button";
  up.dataset[spec.upKey] = "true";
  up.setAttribute("aria-label", spec.upAria);
  up.textContent = "+";
  wrap.append(down, value, up);
  return wrap;
}

function createNodeGraphMidiListenControls() {
  const host = document.createElement("div");
  host.className = "node-midi-listen";
  const inputRow = document.createElement("label");
  inputRow.className = "node-midi-listen-row";
  const inputLabel = document.createElement("span");
  inputLabel.textContent = "Input";
  const inputSelect = document.createElement("select");
  inputSelect.dataset.midiKeyboardMidiInput = "true";
  inputSelect.setAttribute("aria-label", "MIDI input");
  inputSelect.append(new Option("Off", ""));
  inputRow.append(inputLabel, inputSelect);
  const channelRow = document.createElement("label");
  channelRow.className = "node-midi-listen-row";
  const channelLabel = document.createElement("span");
  channelLabel.textContent = "Channel";
  const channel = createNodeGraphPlusMinusControl({
    ariaLabel: "MIDI listen channel",
    downKey: "midiListenChannelDown",
    valueKey: "midiListenChannelValue",
    upKey: "midiListenChannelUp",
    downAria: "MIDI channel down",
    upAria: "MIDI channel up",
    valueText: "0",
  });
  channelRow.append(channelLabel, channel);
  host.append(inputRow, channelRow);
  return host;
}

function createNodeGraphMidiModuleBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-midi-module node-module-interface-controls";
  section.dataset.moduleBand = "controls";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "MIDI");
  section.append(createNodeGraphMidiListenControls());
  return section;
}

// Standalone dock piano. The placed keyboardController module is the official
// MIDI module (createNodeGraphMidiModuleBody) — this body is only the dock.
function createNodeGraphKeyboardControllerBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-midi-keyboard-panel node-midi-keyboard-module";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "MIDI keyboard");
  const heading = document.createElement("div");
  heading.className = "node-midi-keyboard-heading";
  const controls = document.createElement("div");
  controls.className = "node-midi-keyboard-midi-controls";
  const modeLabel = createNodeGraphMidiModeControl();
  const octave = createNodeGraphPlusMinusControl({
    ariaLabel: "Keyboard octave transpose",
    downKey: "midiKeyboardOctaveDown",
    valueKey: "midiKeyboardOctaveValue",
    upKey: "midiKeyboardOctaveUp",
    downAria: "Transpose keyboard down one octave",
    upAria: "Transpose keyboard up one octave",
    valueText: "+0",
  });
  const keyCount = createNodeGraphPlusMinusControl({
    ariaLabel: "Number of keys",
    downKey: "midiKeyboardKeyCountDown",
    valueKey: "midiKeyboardKeyCountValue",
    upKey: "midiKeyboardKeyCountUp",
    downAria: "Show fewer keys",
    upAria: "Show more keys",
    valueText: "88",
  });
  const liveReadouts = document.createElement("span");
  liveReadouts.className = "node-midi-keyboard-live-readouts";
  liveReadouts.setAttribute("aria-live", "polite");
  for (const [key, labelText, valueText] of [
    ["frequency", "freq", "-"],
    ["pitch", "pitch", "-"],
    ["midi", "midi", "-"],
    ["x", "x", "0.000"],
    ["y", "y", "0.000"],
    ["velocity", "vel", "-"],
  ]) {
    const item = document.createElement("span");
    item.append(document.createTextNode(`${labelText} `));
    const value = document.createElement("strong");
    value.dataset.keyboardSignal = key;
    value.textContent = valueText;
    item.append(value);
    liveReadouts.append(item);
  }
  controls.append(modeLabel, octave, keyCount, liveReadouts);
  heading.append(controls);

  const performance = document.createElement("div");
  performance.className = "node-midi-keyboard-performance";
  const surface = document.createElement("div");
  surface.className = "node-midi-keyboard-surface";
  surface.setAttribute("aria-label", "MIDI keyboard");
  // Left empty -- populated by renderNodeGraphMidiKeyboardKeys (called
  // from bindNodeGraphKeyboardControllerModuleEvents right after mount)
  // from the current key count, since the key set is now user-configurable
  // rather than a fixed 2-octave layout.
  const whiteRow = document.createElement("div");
  whiteRow.className = "node-midi-keyboard-white-row";
  whiteRow.setAttribute("aria-hidden", "true");
  const blackRow = document.createElement("div");
  blackRow.className = "node-midi-keyboard-black-row";
  blackRow.setAttribute("aria-hidden", "true");
  surface.append(whiteRow, blackRow);
  performance.append(surface);

  const signalBar = document.createElement("div");
  signalBar.className = "node-midi-keyboard-signal-bar";
  signalBar.dataset.midiKeyboardSignalBar = "true";
  signalBar.setAttribute("aria-live", "polite");
  const signals = [
    ["gate", "gate", "0"],
    ["gatePulse", "1s gate", "0"],
    ["key", "key", "-"],
    ["quantized", "q", "-"],
    ["octave", "oct", "+0"],
    ["midi", "midi", "-"],
    ["double", "double", "-"],
    ["tenthVoltPerOctave", ".1v/oct", "-"],
    ["increment", "inc", "-"],
  ];
  for (const [key, labelText, valueText] of signals) {
    const item = document.createElement("span");
    item.append(document.createTextNode(`${labelText} `));
    const value = document.createElement("strong");
    value.dataset.keyboardSignal = key;
    value.textContent = valueText;
    item.append(value);
    if (key === "key") {
      item.append(document.createTextNode(" / 24"));
    }
    signalBar.append(item);
  }
  const bitmaskBar = document.createElement("div");
  bitmaskBar.className = "node-midi-keyboard-bitmask-row";
  bitmaskBar.dataset.midiKeyboardBitmaskRow = "true";
  bitmaskBar.setAttribute("aria-live", "polite");
  const bitmaskLabel = document.createElement("span");
  bitmaskLabel.textContent = "held ";
  const bitmaskValue = document.createElement("strong");
  bitmaskValue.dataset.midiKeyboardBitmaskValue = "true";
  bitmaskBar.append(bitmaskLabel, bitmaskValue);

  section.append(heading, performance, signalBar, bitmaskBar);
  return section;
}

function createNodeGraphParameter(node, type, parameter) {
  const row = document.createElement("div");
  row.className = "node-parameter-row";
  // Hidden params still exist in the DOM (face drag targets, pad state) but
  // must not consume vertical layout — otherwise solid modules (XY Pad)
  // under-count height vs real content and clip the face.
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null;
  const isVisible = typeof nodeGraphParameterEffectiveVisible === "function"
    ? nodeGraphParameterEffectiveVisible(parameter, patchNode?.paramMeta?.[parameter.key])
    : parameter?.hidden !== true;
  if (!isVisible) {
    row.hidden = true;
    row.classList.add("node-parameter-row-hidden");
  }
  row.dataset.param = parameter.key;
  // Jacks follow explicit parameterOutput / modulation flags, not visibility.
  // Hidden rows keep their jacks in the DOM so showing a param remounts nothing.
  const showModPort = parameter?.modulation !== false;
  const showParamOut = parameter?.parameterOutput !== false;
  if (showModPort) {
    row.append(createNodeParameterModulationPort(node, type, parameter));
  }

  const label = document.createElement("label");
  label.className = "node-parameter-control";
  label.dataset.paramLabel = parameter.label;
  label.dataset.defaultParamLabel = parameter.defaultLabel || parameter.label;
  label.setAttribute("aria-label", parameter.label);
  const input = document.createElement("input");
  const legacyIds = {
    "bias.offset": "nodeBiasAmount",
    "gain.amount": "nodeGainAmount",
    "noise.level": "nodeNoiseLevel",
    "osc.frequency": "nodeOscFrequency",
    "osc.level": "nodeOscLevel",
    "osc.phase": "nodeOscPhase",
    "osc.waveform": "nodeOscWaveform",
  };
  input.id = legacyIds[`${node}.${parameter.key}`] || `node-${node}-${parameter.key}`;
  input.dataset.param = parameter.key;
  input.type = "range";
  const metadata = nodeGraphParameterDefinitionMetadata(parameter);
  input.min = String(metadata?.min ?? parameter.min);
  input.max = String(metadata?.max ?? parameter.max);
  input.step = metadata?.step > 0 ? String(metadata.step) : "any";
  input.value = String(metadata?.def ?? parameter.defaultValue);
  input.dataset.step = metadata?.step > 0 ? String(metadata.step) : "any";
  input.dataset.mid = String(metadata?.mid ?? parameter.mid);
  input.dataset.default = String(metadata?.def ?? parameter.defaultValue);
  input.dataset.kind = metadata?.kind || "decimal";
  input.dataset.maxDigits = String(
    normalizeNodeGraphMetadataMaxDigits(metadata?.maxDigits, metadata?.kind),
  );
  input.dataset.unit = metadata?.unit ?? parameter.unit ?? "";
  input.dataset.tooltip = metadata?.tooltip ?? parameter.tooltip ?? "";
  input.displayTransform = typeof parameter.displayTransform === "function" ? parameter.displayTransform : null;
  input.dataset.choices = formatNodeMetadataChoices(metadata?.choices || parameter.choices || []);
  input.dataset.control = metadata?.control || "";
  input.dataset.displayChoices = metadata?.displayChoices ? "true" : "false";
  input.dataset.divideChoicesVisibly = metadata?.divideChoicesVisibly ? "true" : "false";
  input.dataset.linearSmoothing = metadata?.linearSmoothing ? "true" : "false";
  input.dataset.sliderCurve = normalizeNodeSliderCurve(metadata?.sliderCurve, metadata?.nonlinearSlider);
  input.dataset.curveAmount = String(normalizeNodeSliderCurveAmount(metadata?.curveAmount));
  input.dataset.nonlinearSlider = metadata?.nonlinearSlider ? "true" : "false";
  input.dataset.showSign = metadata?.showSign ? "true" : "false";
  input.dataset.removeTrailingZeros = metadata?.removeTrailingZeros ? "true" : "false";
  input.dataset.wraparound = metadata?.wraparound ? "true" : "false";
  input.dataset.visible = isVisible ? "true" : "false";
  // Domain hard-clamp policy (slider-values): only constraint / hardClamp clip.
  const constraintToken = nodeGraphResourceConstraintToken(
    parameter.constraint ?? metadata?.constraint,
  );
  if (constraintToken) {
    input.dataset.constraint = constraintToken;
  }
  if (metadata?.hardClamp || parameter.hardClamp) {
    input.dataset.hardClamp = "true";
  }
  input.dataset.domainValue = String(metadata?.def ?? parameter.defaultValue);
  applyNodeGraphInputUnboundedValue(input, input.value);
  input.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} ${parameter.label}`);
  label.append(input);
  row.append(label);
  if (showParamOut) {
    row.append(createNodeParameterOutputPort(node, type, parameter));
  }
  applyNodeGraphResourceConstraintMarks(
    row,
    parameter.constraint ?? metadata?.constraint,
  );
  return row;
}

function normalizeNodeGraphResourceConstraint(value) {
  return normalizeNodeGraphResourceConstraints(value)[0] || "";
}

/** Accept "gpu", "cpu ram", ["cpu","gpu"], or {cpu:true, ram:true}. */
function normalizeNodeGraphResourceConstraints(value) {
  let parts = [];
  if (Array.isArray(value)) {
    parts = value;
  } else if (value && typeof value === "object") {
    parts = ["cpu", "ram", "gpu"].filter((key) => value[key]);
  } else {
    parts = String(value || "").split(/[\s,|/]+/);
  }
  const seen = new Set();
  const out = [];
  for (const raw of parts) {
    const key = String(raw || "").trim().toLowerCase();
    if (!["cpu", "ram", "gpu"].includes(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(key);
  }
  return out;
}

function nodeGraphResourceConstraintToken(value) {
  return normalizeNodeGraphResourceConstraints(value).join(" ");
}

/**
 * Stroke + cpu/ram/gpu badges on a param row, scope face, or other widget.
 * Pass one, two, or all three; debug checkboxes show the matching marks.
 */
function applyNodeGraphResourceConstraintMarks(element, value) {
  if (!element) {
    return [];
  }
  const list = normalizeNodeGraphResourceConstraints(value);
  if (!list.length) {
    delete element.dataset.nodeConstraint;
    element.querySelector(":scope > .node-constraint-badges")?.remove();
    return [];
  }
  element.dataset.nodeConstraint = list.join(" ");
  let badges = element.querySelector(":scope > .node-constraint-badges");
  if (!badges) {
    badges = document.createElement("span");
    badges.className = "node-constraint-badges";
    badges.setAttribute("aria-hidden", "true");
    element.append(badges);
  }
  badges.replaceChildren(...list.map((key) => {
    const mark = document.createElement("span");
    mark.className = "node-constraint-badge";
    mark.dataset.constraintBadge = key;
    mark.textContent = key;
    return mark;
  }));
  return list;
}

/** Default CPU/RAM/GPU tags for live scope faces (override with def.resourceConstraints). */
function nodeGraphModuleResourceConstraintsForType(type) {
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[type]
    : null;
  if (def && def.resourceConstraints != null) {
    return normalizeNodeGraphResourceConstraints(def.resourceConstraints);
  }
  const display = String(def?.displayType || "");
  if (
    def?.visualSink
    || display === "trace"
    || display === "scope2d"
    || display === "scope2dTrace"
    || display === "lineBurn"
    || display === "dot"
    || display === "vectorDot"
    || display === "value"
    || display === "hypersawBurn"
    || display === "videoscopeBurn"
    || display === "oscilloscopeBankBurn"
    || display === "vectorRgbFace"
    || display === "gradientVectorscopeFace"
    || display === "traceXyz"
    || display === "phosphorLight"
    || display.endsWith("Burn")
  ) {
    return ["cpu", "ram", "gpu"];
  }
  return [];
}
