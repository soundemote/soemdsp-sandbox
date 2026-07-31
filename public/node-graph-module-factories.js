function createNodeGraphPort(node, type, port, io) {
  const button = document.createElement("button");
  button.className = `node-port ${io}`;
  button.type = "button";
  button.dataset.node = node;
  button.dataset.port = port;
  button.dataset.io = io;
  button.dataset.alias = nodeGraphLabel(node, port);
  const portLabel = nodeGraphPatchNodePortDisplayLabel(node, type, port, io);
  const label = `${nodeGraphNodeLabels[type]} ${io} port ${portLabel}`;
  button.setAttribute("aria-label", label);
  return button;
}

function nodeGraphPortDisplayLabel(type, port, io) {
  const labels = io === "output"
    ? nodeGraphModuleDefinitions[type]?.outputLabels
    : nodeGraphModuleDefinitions[type]?.inputLabels;
  return labels?.[port] || port;
}

function nodeGraphPatchNodePortDisplayLabel(node, type, port, io) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const alias = normalizeNodeGraphPatchMetadataAlias(patchNode?.portMeta?.[io]?.[port]?.alias);
  return alias || nodeGraphPortDisplayLabel(type, port, io);
}

function applyNodeGraphInputUnboundedValue(input, value) {
  const number = Number(value);
  const min = Number(input?.min);
  const max = Number(input?.max);
  const unboundedMin = input?.dataset?.unboundedMin === "true";
  const unboundedMax = input?.dataset?.unboundedMax === "true";
  if (
    Number.isFinite(number) &&
    ((unboundedMin && Number.isFinite(min) && number < min) ||
      (unboundedMax && Number.isFinite(max) && number > max))
  ) {
    input.dataset.unboundedValue = String(number);
  } else if (input) {
    delete input.dataset.unboundedValue;
  }
}

function createNodeGraphIoColumn(node, type, ports, io) {
  if (!ports?.length) {
    return null;
  }

  const column = document.createElement("div");
  column.className = `node-io-column ${io}`;
  for (const port of ports) {
    const row = document.createElement("div");
    row.className = `node-io-row ${io}`;
    row.dataset.node = node;
    row.dataset.port = port;
    row.dataset.io = io;
    row.dataset.alias = nodeGraphLabel(node, port);
    if (nodeGraphPortIsDigitalSignal(type, port, io)) {
      // 0.1V/Oct pitch CV and any Scale bitmask are this sandbox's "digital
      // signal" types, on any node; any port a module explicitly lists in
      // digitalInputs/digitalOutputs (unsmoothed gates, triggers, etc.) is
      // too -- give their wire and port taps solid white (colors only, no
      // shape/animation change) so they read as visually distinct from
      // free-form analog CV wires. See nodeGraphPortIsDigitalSignal.
      row.dataset.digitalSignal = io;
    }
    const portLabel = nodeGraphPatchNodePortDisplayLabel(node, type, port, io);
    row.setAttribute(
      "aria-label",
      `${nodeGraphNodeLabels[type]} ${io} port ${portLabel} interaction area`,
    );
    const label = document.createElement("span");
    label.className = "node-io-label";
    label.dataset.portLabel = port;
    label.textContent = portLabel;
    if (io === "input") {
      row.append(createNodeGraphPort(node, type, port, io), label);
    } else {
      row.append(label, createNodeGraphPort(node, type, port, io));
    }
    column.append(row);
  }
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
      label.textContent = portLabel;
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

function createNodeGraphModuleScopeSection(node, type) {
  const section = document.createElement("div");
  section.className = "node-module-scope-window node-light-source";
  section.dataset.node = node;
  section.dataset.nodeType = type;
  // Layer A app dimmer: all screen displays produce light (modular view shader punches here).
  section.dataset.lightSource = "screen";
  section.dataset.tooltipKey = "module.scopeWindow";
  section.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} scope`);
  if (typeof nodeGraphApplyTooltip === "function") {
    nodeGraphApplyTooltip(section, "module.scopeWindow");
  }

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

// createNodeGraphValueSliderFace is defined in
// public/modules/valueSlider/value-slider-face.js (loaded after this file).

/** @deprecated use createNodeGraphValueSliderFace */
function createNodeGraphSliderWidgetBody(node, type) {
  return typeof createNodeGraphValueSliderFace === "function"
    ? createNodeGraphValueSliderFace(node, type)
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
  const tripped = typeof nodeGraphEarProtectionIsTripped === "function" && nodeGraphEarProtectionIsTripped();
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
function createNodeGraphMacroControlsBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-macro-controls-panel node-macro-controls-module";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "Macro controls");
  const heading = document.createElement("div");
  heading.className = "node-macro-controls-heading";
  const title = document.createElement("div");
  const kicker = document.createElement("span");
  kicker.textContent = "Performance Surface";
  const strong = document.createElement("strong");
  strong.textContent = "Macro Controls";
  title.append(kicker, strong);
  const status = document.createElement("span");
  status.className = "pill";
  status.dataset.macroControlsStatus = "true";
  status.textContent = "8 macros ready";
  heading.append(title, status);
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
    const label = document.createElement("span");
    label.textContent = `M${index + 1}`;
    const indicator = document.createElement("i");
    const value = document.createElement("strong");
    value.dataset.macroValue = String(index);
    value.textContent = "0.00";
    knob.append(label, indicator, value);
    row.append(knob);
  }
  section.append(heading, row);
  return section;
}

// node is optional -- see the comment on createNodeGraphKeyboardControllerBody;
// same reuse pattern for the standalone performance dock.
function createNodeGraphPitchModWheelBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-performance-wheels-panel node-performance-wheels-module";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "Pitch and modulation wheels");
  const heading = document.createElement("div");
  heading.className = "node-performance-wheels-heading";
  const kicker = document.createElement("span");
  kicker.textContent = "Performance";
  const strong = document.createElement("strong");
  strong.textContent = "Pitch / Mod Wheels";
  heading.append(kicker, strong);
  const bank = document.createElement("div");
  bank.className = "node-midi-keyboard-wheel-bank";
  const specs = [
    { className: "pitch", key: "pitchWheel", label: "Pitch", max: "1", min: "-1" },
    { className: "mod", key: "modWheel", label: "Mod", max: "1", min: "0" },
  ];
  for (const spec of specs) {
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
    bank.append(wheel);
  }
  section.append(heading, bank);
  return section;
}

// node is optional -- the standalone MIDI keyboard dock (see
// initNodeGraphStandaloneMidiKeyboard) calls this with no node at all.
// Everything below is already generic/document-wide (renderNodeGraphMidiKeyboardSignal
// and bindNodeGraphKeyboardControllerModuleEvents both query
// ".node-midi-keyboard-module" across the whole document, not a specific
// node), so a standalone instance mirrors every keyboardController node's
// keyboard for free -- same shared nodeGraphMvp.midiKeyboardSignal, same
// "active" key highlighting on every rendered surface.
function createNodeGraphKeyboardControllerBody(node = null) {
  const section = document.createElement("section");
  section.className = "node-midi-keyboard-panel node-midi-keyboard-module";
  if (node) {
    section.dataset.node = node;
  }
  section.setAttribute("aria-label", "Mouse playable MIDI keyboard");
  const heading = document.createElement("div");
  heading.className = "node-midi-keyboard-heading";
  const title = document.createElement("div");
  title.className = "node-midi-keyboard-title";
  const titleKicker = document.createElement("span");
  titleKicker.textContent = "Instrument";
  const titleStrong = document.createElement("strong");
  titleStrong.textContent = "MIDI Keyboard";
  title.append(titleKicker, titleStrong);
  const controls = document.createElement("div");
  controls.className = "node-midi-keyboard-midi-controls";
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
  const octave = document.createElement("span");
  octave.className = "node-midi-keyboard-octave-control";
  octave.setAttribute("aria-label", "Keyboard octave transpose");
  const down = document.createElement("button");
  down.type = "button";
  down.dataset.midiKeyboardOctaveDown = "true";
  down.setAttribute("aria-label", "Transpose keyboard down one octave");
  down.textContent = "-";
  const octaveValue = document.createElement("strong");
  octaveValue.dataset.midiKeyboardOctaveValue = "true";
  octaveValue.textContent = "+0";
  const up = document.createElement("button");
  up.type = "button";
  up.dataset.midiKeyboardOctaveUp = "true";
  up.setAttribute("aria-label", "Transpose keyboard up one octave");
  up.textContent = "+";
  octave.append(down, octaveValue, up);
  const keyCount = document.createElement("span");
  keyCount.className = "node-midi-keyboard-octave-control";
  keyCount.setAttribute("aria-label", "Number of keys");
  const keyCountDown = document.createElement("button");
  keyCountDown.type = "button";
  keyCountDown.dataset.midiKeyboardKeyCountDown = "true";
  keyCountDown.setAttribute("aria-label", "Show fewer keys");
  keyCountDown.textContent = "-";
  const keyCountValue = document.createElement("strong");
  keyCountValue.dataset.midiKeyboardKeyCountValue = "true";
  keyCountValue.textContent = "25";
  const keyCountUp = document.createElement("button");
  keyCountUp.type = "button";
  keyCountUp.dataset.midiKeyboardKeyCountUp = "true";
  keyCountUp.setAttribute("aria-label", "Show more keys");
  keyCountUp.textContent = "+";
  keyCount.append(keyCountDown, keyCountValue, keyCountUp);
  const midiButton = document.createElement("button");
  midiButton.type = "button";
  midiButton.dataset.midiKeyboardMidiButton = "true";
  midiButton.textContent = "Enable MIDI";
  const midiSelect = document.createElement("select");
  midiSelect.dataset.midiKeyboardMidiInput = "true";
  midiSelect.setAttribute("aria-label", "MIDI keyboard input");
  midiSelect.disabled = true;
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "no midi input";
  midiSelect.append(emptyOption);
  controls.append(modeLabel, octave, keyCount, midiButton, midiSelect);
  heading.append(title, controls);

  const performance = document.createElement("div");
  performance.className = "node-midi-keyboard-performance";
  const surface = document.createElement("div");
  surface.className = "node-midi-keyboard-surface";
  surface.setAttribute("aria-label", "Two octave keyboard preview");
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
    ["frequency", "freq", "-"],
    ["pitch", "pitch", "-"],
    ["x", "x", "0.000"],
    ["y", "y", "0.000"],
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
  // Hidden params still exist in the DOM (pad UI / worklet read by id) but
  // must not consume vertical layout — otherwise solid modules (XY Pad)
  // under-count height vs real content and clip the face.
  if (parameter?.hidden === true) {
    row.hidden = true;
    row.classList.add("node-parameter-row-hidden");
  }
  row.dataset.param = parameter.key;
  const constraint = normalizeNodeGraphResourceConstraint(parameter.constraint);
  if (constraint) {
    row.dataset.nodeConstraint = constraint;
  }
  row.append(createNodeParameterModulationPort(node, type, parameter));

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
  input.dataset.unboundedMax = metadata?.unboundedMax ? "true" : "false";
  input.dataset.unboundedMin = metadata?.unboundedMin ? "true" : "false";
  input.dataset.wraparound = metadata?.wraparound ? "true" : "false";
  applyNodeGraphInputUnboundedValue(input, input.value);
  input.setAttribute("aria-label", `${nodeGraphNodeLabels[type]} ${parameter.label}`);
  label.append(input);
  row.append(label);
  row.append(createNodeParameterOutputPort(node, type, parameter));
  return row;
}

function normalizeNodeGraphResourceConstraint(value) {
  const constraint = String(value || "").trim().toLowerCase();
  return ["cpu", "ram", "gpu"].includes(constraint) ? constraint : "";
}
