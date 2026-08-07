// Scope offline analyzer / buffer helpers (Phase D).
// Load after scopes.js. Extract-only.

function renderNodeGraphModuleScopeAnalyzer(slot, buffer = null) {
  const analyzer = slot?.scopeElement?.querySelector?.(".node-module-scope-analyzer");
  if (!analyzer) {
    return;
  }
  analyzer.classList.toggle("gain-scope-analyzer", slot?.type === "gain");
  const metrics = buffer?.nodeGraphScopeAnalyzer;
  if (!metrics) {
    analyzer.hidden = true;
    analyzer.textContent = "";
    return;
  }
  analyzer.hidden = false;
  const rows = [
    ["gain", metrics.gainDb],
    metrics.inputRmsDb === undefined ? null : ["in", metrics.inputRmsDb],
    ["pk", metrics.peakDb],
    ["rms", metrics.rmsDb],
  ].filter(Boolean);
  analyzer.replaceChildren(
    ...rows.map(([label, value]) => {
      const item = document.createElement("span");
      item.dataset.scopeMetric = label;
      item.textContent = `${label} ${nodeGraphModuleScopeFormatDb(value)}`;
      return item;
    }),
  );
}

function nodeGraphModuleScopeOfflineSourceFrequency(nodeId, nodeMap = nodeGraphModuleScopeNodeMap(), visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) {
    return 0;
  }
  visited.add(nodeId);
  const node = nodeMap.get(nodeId);
  if (!node) {
    return 0;
  }
  if (nodeGraphModuleScopeIsOscillatorType(node.type)) {
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          { nodeMap },
          connection.sourceNode,
          0,
          0,
          connection.sourcePort,
          1,
        ), 0),
      -1,
      1,
    );
    return Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
  }
  if (node.type === "clock") {
    return Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
  }
  if (node.type === "gain" || node.type === "bias" || node.type === "gainBias" || node.type === "mix" || node.type === "gainBiasMix") {
    return Math.max(
      0,
      ...nodeGraphModuleScopeConnectionsTo(node.id, "In")
        .map((connection) => nodeGraphModuleScopeOfflineSourceFrequency(connection.sourceNode, nodeMap, visited)),
    );
  }
  return 0;
}

function nodeGraphModuleScopeOfflineSignalSample(context, nodeId, localTime, sampleIndex, port = "Out", depth = 0) {
  if (!context || !nodeId || depth > 16) {
    return 0;
  }
  const node = context.nodeMap.get(nodeId);
  if (!node) {
    return 0;
  }
  if (nodeGraphModuleScopeIsOscillatorType(node.type)) {
    const waveformByPort = {
      Saw: 0,
      Ramp: 1,
      Square: 2,
      Tri: 3,
      Sine: 4,
    };
    const waveform = Object.hasOwn(waveformByPort, port)
      ? waveformByPort[port]
      : nodeGraphModuleScopeNodeParam(node, "waveform", 0);
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          context,
          connection.sourceNode,
          localTime,
          sampleIndex,
          connection.sourcePort,
          depth + 1,
        ), 0),
      -1,
      1,
    );
    const frequency = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
    const phase = wrapNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "phase", 0), 0, 1);
    const level = nodeGraphModuleScopeNodeParam(node, "level", 0.5);
    const phasor = nodeGraphModuleScopeOscillatorPhasor(
      { nodeId: node.id },
      frequency,
      1,
      nodeGraphModuleScopeModelFrameTime({ nodeId: node.id }),
    );
    const displayFrame = Number(context.zeroFrequencyDisplayFrame);
    const displayFrames = Math.max(1, Number(context.zeroFrequencyDisplayFrames) || 1);
    const displayCycles = Math.max(0.125, Number(context.zeroFrequencyDisplayCycles) || 1);
    const zeroFrequencyDisplayPhase = Number.isFinite(displayFrame)
      ? (displayFrame / Math.max(1, displayFrames - 1)) * displayCycles
      : 0;
    const scopeStartTime = Number(context.scopeStartTime);
    const elapsedTime = Math.max(
      0,
      localTime - (Number.isFinite(scopeStartTime) ? scopeStartTime : localTime),
    );
    const signalPhase = (Number(phasor.signal) || 0) +
      (frequency > 0 ? elapsedTime * frequency : zeroFrequencyDisplayPhase);
    return nodeGraphModuleScopeOfflineOscillatorSample(waveform, phase + signalPhase) * level;
  }
  if (nodeGraphModuleScopeIsAdditiveType(node.type)) {
    const baseFrequency = Math.max(0, nodeGraphModuleScopeNodeParam(node, "frequency", 0));
    const pitchInput = clampNodeSliderValue(
      nodeGraphModuleScopeConnectionsTo(node.id, "0.1V/Oct")
        .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
          context,
          connection.sourceNode,
          localTime,
          sampleIndex,
          connection.sourcePort,
          depth + 1,
        ), 0),
      -1,
      1,
    );
    const frequency = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
    const phase = wrapNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "phase", 0), 0, 1);
    const phasor = nodeGraphModuleScopeOscillatorPhasor(
      { nodeId: node.id },
      frequency,
      1,
      nodeGraphModuleScopeModelFrameTime({ nodeId: node.id }),
    );
    const scopeStartTime = Number(context.scopeStartTime);
    const elapsedTime = Math.max(
      0,
      localTime - (Number.isFinite(scopeStartTime) ? scopeStartTime : localTime),
    );
    const signalPhase = (Number(phasor.signal) || 0) + elapsedTime * frequency;
    return nodeGraphAdditiveOscillatorSample(
      null,
      node.id,
      (phase + signalPhase) * Math.PI * 2,
      {
        frequency,
        harmonics: nodeGraphModuleScopeNodeParam(node, "harmonics", 32),
        level: nodeGraphModuleScopeNodeParam(node, "level", 0.35),
        modA: nodeGraphModuleScopeNodeParam(node, "modA", 0.5),
        waveform: nodeGraphModuleScopeNodeParam(node, "waveform", 1),
      },
      Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100,
    );
  }
  if (node.type === "clock") {
    const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
    const duty = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "duty", 0.5), 0, 1);
    const level = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "level", 1), 0, 1);
    const sampleRate = Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100;
    const phase = nodeGraphModuleScopeClockPhaseAt(context, node.id, rate, localTime);
    if (port === "Analog Out") {
      return nodeGraphModuleScopeClockAnalogMonitorSample(phase, level);
    }
    if (port === "Pulse") {
      return rate > 0 && phase < Math.min(1, rate / Math.max(1, sampleRate)) ? level : 0;
    }
    return duty > 0 && level > 0 && phase < duty ? level : 0;
  }
  const input = nodeGraphModuleScopeConnectionsTo(node.id, "In")
    .reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
      context,
      connection.sourceNode,
      localTime,
      sampleIndex,
      connection.sourcePort,
      depth + 1,
    ), 0);
  if (node.type === "gain" || node.type === "gainBias") {
    return input * nodeGraphModuleScopeNodeParam(node, "amount", 1) +
      nodeGraphModuleScopeNodeParam(node, "offset", 0);
  }
  if (node.type === "bias") {
    return input + nodeGraphModuleScopeNodeParam(node, "offset", 0);
  }
  return 0;
}

// Matches LFO/basic_oscillator waveform indices:
// 0 Saw, 1 Ramp, 2 Square, 3 Triangle, 4 Sine, 5 Noise.
function nodeGraphModuleScopeOfflineOscillatorSample(waveform, phaseCycle) {
  const cycle = wrapNodeSliderValue(phaseCycle, 0, 1);
  switch (Math.round(Number(waveform) || 0)) {
    case 1: // Ramp
      return -1 + cycle * 2;
    case 2: // Square
      return cycle < 0.5 ? 1 : -1;
    case 3: // Triangle
      return 1 - 4 * Math.abs(cycle - 0.5);
    case 4: // Sine
      return Math.sin(cycle * Math.PI * 2);
    case 5: // Noise (deterministic-ish hash of phase for offline scope)
      return Math.tanh(
        Math.sin((cycle * 17.13 + 0.17) * Math.PI * 2) * 0.62 +
        Math.sin((cycle * 37.71 + 0.41) * Math.PI * 2) * 0.38 +
        Math.sin((cycle * 73.19 + 0.73) * Math.PI * 2) * 0.24,
      );
    case 0: // Saw
    default:
      return 1 - cycle * 2;
  }
}

function nodeGraphModuleScopeClockPhasor(slot, rate, modelTime = nodeGraphModuleScopeModelFrameTime(slot)) {
  const nodeId = String(slot?.nodeId || "");
  const now = Math.max(0, Number(modelTime) || 0);
  const safeRate = Math.max(0, Number(rate) || 0);
  let phasor = nodeGraphModuleScopeState.clockPhasors.get(nodeId);
  if (!phasor) {
    const phase = wrapNodeSliderValue(now * safeRate, 0, 1);
    phasor = {
      lastTime: now,
      phase,
      previousPhase: phase,
      previousTime: now,
      rate: safeRate,
      renderTime: -1,
      turns: 0,
    };
    nodeGraphModuleScopeState.clockPhasors.set(nodeId, phasor);
  }
  if (phasor.renderTime === now) {
    phasor.rate = safeRate;
    return phasor;
  }

  const lastTime = Math.max(0, Number(phasor.lastTime) || now);
  const advanceRate = Math.max(0, Number(phasor.rate) || 0);
  if (now < lastTime) {
    const phase = wrapNodeSliderValue((Number(phasor.phase) || 0) - advanceRate * (lastTime - now), 0, 1);
    return {
      ...phasor,
      phase,
      previousPhase: phase,
      previousTime: now,
      rate: safeRate,
      turns: 0,
    };
  }
  const dt = clampNodeSliderValue(now - lastTime, 0, 0.25);
  const previousPhase = Number(phasor.phase) || 0;
  if (dt > 0 && advanceRate > 0) {
    phasor.phase = wrapNodeSliderValue(previousPhase + advanceRate * dt, 0, 1);
  }
  phasor.previousPhase = previousPhase;
  phasor.previousTime = lastTime;
  phasor.rate = safeRate;
  phasor.lastTime = now;
  phasor.renderTime = now;
  phasor.turns = Math.max(0, advanceRate * dt);
  return phasor;
}

function nodeGraphModuleScopeClockPhaseAt(context, nodeId, rate, localTime) {
  const safeRate = Math.max(0, Number(rate) || 0);
  const safeTime = Math.max(0, Number(localTime) || 0);
  if (!context.clockPhaseAnchors) {
    context.clockPhaseAnchors = new Map();
  }
  const key = String(nodeId || "");
  let anchor = context.clockPhaseAnchors.get(key);
  if (!anchor) {
    const scopeStartTime = Number(context.scopeStartTime);
    const anchorTime = Number.isFinite(scopeStartTime) ? Math.max(0, scopeStartTime) : safeTime;
    const phasor = nodeGraphModuleScopeClockPhasor({ nodeId: key }, safeRate, anchorTime);
    anchor = {
      phase: Number(phasor.phase) || 0,
      rate: safeRate,
      time: anchorTime,
    };
    context.clockPhaseAnchors.set(key, anchor);
  }
  return wrapNodeSliderValue(
    (Number(anchor.phase) || 0) + Math.max(0, safeTime - (Number(anchor.time) || safeTime)) * safeRate,
    0,
    1,
  );
}

function nodeGraphModuleScopeOscillatorPhasor(slot, frequency, cycles, modelTime = nodeGraphModuleScopeModelFrameTime(slot)) {
  const nodeId = String(slot?.nodeId || "");
  const now = Math.max(0, Number(modelTime) || 0);
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const safeCycles = Math.max(1e-6, Number(cycles) || 1);
  let phasor = nodeGraphModuleScopeState.oscillatorPhasors.get(nodeId);
  if (!phasor) {
    phasor = {
      frequency: safeFrequency,
      lastTime: now,
      previousSweep: 0,
      renderTime: -1,
      signal: 0,
      sweep: 0,
      sweepDelta: 0,
    };
    nodeGraphModuleScopeState.oscillatorPhasors.set(nodeId, phasor);
  }
  if (phasor.renderTime === now) {
    phasor.frequency = safeFrequency;
    return phasor;
  }

  const dt = clampNodeSliderValue(now - (Number(phasor.lastTime) || now), 0, 0.25);
  const previousSweep = Number(phasor.sweep) || 0;
  phasor.previousSweep = previousSweep;
  phasor.sweepDelta = 0;
  const advanceFrequency = Math.max(0, Number(phasor.frequency) || 0);
  if (dt > 0 && advanceFrequency > 0) {
    const cycleDelta = advanceFrequency * dt;
    const sweepDelta = cycleDelta / safeCycles;
    phasor.signal = wrapNodeSliderValue((Number(phasor.signal) || 0) + cycleDelta, 0, 1);
    phasor.sweep = wrapNodeSliderValue(previousSweep + sweepDelta, 0, 1);
    phasor.sweepDelta = sweepDelta;
  }
  phasor.frequency = safeFrequency;
  phasor.lastTime = now;
  phasor.renderTime = now;
  return phasor;
}

// nodeGraphModuleScopeCapturedCurrentLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedCurrentPositiveLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFrameLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFramePositiveLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedFrameBipolarLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedGateLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedPulseLightTarget → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedBufferForSlot → node-graph-module-scope-capture.js
// secondary* is read only when a "trace"-schema node is Output's stereo
// display (drawNodeGraphTraceDisplayCanvasItem) -- Output shares this same
// formType with plain single-value Trace nodes (both declare
// displayType/renderer "trace"), so the field exists here for all of them,
// but a non-Output trace node's draw path never reads it.
// nodeGraphTraceDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// 1D Burn Dot = heart-monitor phosphor: pen takes sweepSeconds to cross left→right.
// Y = sample. Optional rising-edge Reset snaps to the left. Tune seconds to match
// the period you care about (easier UX than Hz).
// nodeGraphLineBurnSettingsDefaults → node-graph-module-scope-defaults.js
// nodeGraphTraceDisplayRenderPointBudgetDefault → node-graph-module-scope-defaults.js
function nodeGraphTraceDisplayRenderPointBudget() {
  return typeof normalizeNodeGraphModuleScopePointBudget === "function"
    ? normalizeNodeGraphModuleScopePointBudget(nodeGraphMvp?.moduleScopePointBudget ?? nodeGraphTraceDisplayRenderPointBudgetDefault)
    : nodeGraphTraceDisplayRenderPointBudgetDefault;
}

// nodeGraphZeroDBurnSettingsDefaults → node-graph-module-scope-defaults.js
// nodeGraphValueOscilloscopeSettingsDefaults → node-graph-module-scope-defaults.js
// numberReadout: independent schema. Residual is previous-digit ghosts only.
// "trail" UI = how long the last number's residual remains (0 = off, 1 = long).
// Digit color shares 2D phosphor: multi-stop gradient as energy→color LUT.
// Bright is 0…1 energy (1 = full gradient tip / full deposit — not a 0…2 overdrive).
// background = LCD back plate color (separate widget; not gradient floor).
// Unlit plate = ghostColor only (pick dim/bright there — no ghost-amount slider).
// nodeGraphNumberReadoutSettingsDefaults → node-graph-module-scope-defaults.js
/** Knob face display settings (readout precision only). */
// nodeGraphKnobFaceDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// Spectrogram display settings (not module params).
// Regular fixed STFT (RX-style). Display owns: History, FFT size, Window,
// Overlap, Freq Scale, Smooth, gradient. Dual-written to params for worklet.
// nodeGraphSpectrogramFftSizes → node-graph-module-scope-defaults.js
// nodeGraphSpectrogramSettingsDefaults → node-graph-module-scope-defaults.js
/** Snap FFT size to the allowed table (accepts legacy choice index 0…3). */
// nodeGraphSpectrogramSnapFftSize → node-graph-module-scope-normalize.js
/** Step FFT size along the table. */
// nodeGraphSpectrogramStepFftSize → node-graph-module-scope-normalize.js
/** FFT size for a spectrogram node from display settings / dual-write / defaults. */
// nodeGraphSpectrogramFftSizeFromNode → node-graph-module-scope-normalize.js
/**
 * Shared gradient stop normalize — delegates to NodeGraphGradientSelector
 * (single stop model / channels / defaults). Local parse only if the selector
 * script is not loaded yet.
 */
// normalizeNodeGraphSharedGradientStops → node-graph-module-scope-normalize.js
// normalizeNodeGraphSpectrogramGradientStops → node-graph-module-scope-normalize.js
/** Classic CRT phosphor ramp from peak hex (+ floor). */
// nodeGraphPhosphorDefaultGradientStops → node-graph-module-scope-normalize.js
/**
 * Resolve gradientStops for any phosphor display settings object.
 * Migrates legacy single color + background into a multi-stop ramp when needed.
 */
// nodeGraphPhosphorGradientStopsFromSettings → node-graph-module-scope-normalize.js
/**
 * Apply shared multi-stop gradient as the energy→color LUT on a phosphor face.
 * Prefer this over setLutFromPeak for all retained burn scopes.
 */
// nodeGraphPhosphorApplyGradientLut → node-graph-module-scope-normalize.js
/**
 * Form types that use the gradient selector for color.
 * Authority: NodeGraphGradientSelector.displayProfiles (single registry).
 */
// nodeGraphDisplaySettingsFormTypeUsesGradient → node-graph-module-scope-normalize.js
// normalizeNodeGraphSpectrogramSettings → node-graph-module-scope-normalize.js
/** Push analysis settings into params for the worklet. */
// syncNodeGraphSpectrogramDisplaySettingsToParams → node-graph-module-scope-normalize.js
// nodeGraphScope2dSettingsDefaults → node-graph-module-scope-defaults.js
// XY Pad = built-in phosphor of Out X/Y + cheap UI overlay (puck/grid).
// No "scale" — that would zoom the beam relative to unit Phase/puck and
// desync the control surface from the trail. Beam size is stamp size only;
// puck has its own size.
// nodeGraphXyPadDisplaySettingsDefaults → node-graph-module-scope-defaults.js
// normalizeNodeGraphXyPadDisplaySettings → node-graph-module-scope-normalize.js
// nodeGraphXyPadDisplaySettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dTraceSettingsDefaults → node-graph-module-scope-defaults.js
// normalizeNodeGraphTraceDisplayColor → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplayNumber → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplayZoomSeconds → node-graph-module-scope-normalize.js
/** Clamp sweep duration: 0.01 s … 10 s (same ceiling as Trace history). */
// nodeGraphTraceDisplayClampSweepSeconds → node-graph-module-scope-normalize.js
/**
 * Resolve seconds-per-pass. Migrates legacy sweepHz (crossings/sec) and
 * older zoomSeconds/windowSeconds fields that already meant duration.
 */
// normalizeNodeGraphLineBurnSweepSeconds → node-graph-module-scope-normalize.js
// normalizeNodeGraphLineBurnSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphZeroDBurnSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphTraceDisplaySettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphValueOscilloscopeSettings → node-graph-module-scope-normalize.js
/**
 * Sample multi-stop gradient at energy t ∈ [0,1] → canvas RGB bytes.
 * Same energy→color model as the phosphor LUT (underlying light amount × color ramp).
 */
// nodeGraphSampleGradientStopsRgb → node-graph-module-scope-normalize.js
// normalizeNodeGraphNumberReadoutSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphKnobFaceDisplaySettings → node-graph-module-scope-normalize.js
// nodeGraphKnobFaceDisplaySettingsForNode → node-graph-module-scope-normalize.js
// normalizeNodeGraphScope2dSettings → node-graph-module-scope-normalize.js
// normalizeNodeGraphScope2dTraceSettings → node-graph-module-scope-normalize.js
// nodeGraphZeroDBurnSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphLineBurnSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphNumberReadoutSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphScope2dTraceSettingsForNode → node-graph-module-scope-normalize.js
// nodeGraphGlobalTraceSettings → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsEditingGlobal → node-graph-module-scope-normalize.js
// nodeGraphTraceDisplaySettingsEditingTraceDefaults → node-graph-module-scope-normalize.js
const nodeGraphDisplayModeRenderers = Object.freeze(["trace", "clock", "dot", "value", "lineBurn", "hypersawBurn", "oscilloscopeBankBurn", "videoscopeBurn", "spectrogramBurn", "transportBpm", "scope2d", "scope2dTrace", "phosphorLight", "numberReadout", "xyPad", "customDisplay", "spectrum", "ledLamp", "selfPaintFace", "matrixFace", "matrixWaterfallFace", "matrixDisplayFace", "knobFace", "pluginSliderFace", "toggleButtonFace", "momentaryButtonFace", "rgbShapeFace", "rgbPictureFace", "rgbFractalFace", "evolveFieldFace", "fbmFieldFace", "speedColorInertiaFace", "macroControlsFace"]);
const nodeGraphDisplayModeSignalKinds = Object.freeze(["scalar", "xy", "buffer"]);

// nodeGraphDisplayModeSettingsSchemaForRenderer → node-graph-module-scope-display-mode.js
// normalizeNodeGraphDisplaySignal → node-graph-module-scope-display-mode.js
// nodeGraphModuleOutputPortsForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultScalarDisplayPort → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultXyDisplaySource → node-graph-module-scope-display-mode.js
function nodeGraphModuleDisplaySignalsForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displaySignals;
  const signals = Array.isArray(declared)
    ? declared.map(normalizeNodeGraphDisplaySignal).filter(Boolean)
    : nodeGraphModuleOutputPortsForType(type).map((port, index) => normalizeNodeGraphDisplaySignal({ key: port, label: port, kind: "scalar" }, index)).filter(Boolean);
  const xy = nodeGraphModuleDefaultXyDisplaySource(type);
  if (xy && !signals.some((signal) => signal.key === "X/Y")) {
    signals.push({ key: "X/Y", kind: "xy", label: "X/Y" });
  }
  return signals;
}

// normalizeNodeGraphDisplayMode → node-graph-module-scope-display-mode.js
// nodeGraphModuleImplicitDisplayModeSource → node-graph-module-scope-display-mode.js
// nodeGraphModuleImplicitDisplayModeForType → node-graph-module-scope-display-mode.js
function nodeGraphModuleWithSpectrumCompanionMode(modes) {
  if (!Array.isArray(modes) || !modes.length || modes.some((mode) => mode.renderer === "spectrum")) {
    return modes;
  }
  const traceMode = modes.find((mode) => mode.renderer === "trace");
  if (!traceMode) {
    return modes;
  }
  return [
    ...modes,
    {
      key: `${traceMode.key}Spectrum`,
      label: `${traceMode.label} (Spectrum)`,
      renderer: "spectrum",
      settingsSchema: "trace",
      source: { ...traceMode.source },
    },
  ];
}

// nodeGraphModuleDisplayModesForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleDefaultDisplayModeKeyForType → node-graph-module-scope-display-mode.js
// nodeGraphModuleSelectedDisplayMode → node-graph-module-scope-display-mode.js
// nodeGraphModuleDisplayRendererForNode → node-graph-module-scope-display-mode.js
// nodeGraphModuleDisplaySettingsSchemaForNode → node-graph-module-scope-display-mode.js
function nodeGraphModuleDisplayRendererForSlot(slot) {
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  return node
    ? nodeGraphModuleDisplayRendererForNode(node)
    : nodeGraphModuleDisplayTypeForType(slot?.type);
}

// nodeGraphModuleDisplaySettingsSchemaForSlot → node-graph-module-scope-display-mode.js
function nodeGraphModuleDeclaredDisplayTypeForType(type) {
  const declared = nodeGraphModuleDefinitions?.[type]?.displayType;
  if (nodeGraphDisplayModeRenderers.includes(declared)) {
    return declared;
  }
  if (nodeGraphModuleDefinitions?.[type]) {
    return "trace";
  }
  return "legacy";
}

function nodeGraphModuleDisplayTypeForType(type) {
  return nodeGraphModuleDisplayModesForType(type)[0]?.renderer || nodeGraphModuleDeclaredDisplayTypeForType(type);
}

function nodeGraphModuleDisplayTypeForSlot(slot) {
  return nodeGraphModuleDisplayRendererForSlot(slot);
}

function nodeGraphModuleScopeSlotUsesWiredInputs(slot) {
  return ["traceDisplay", "dotOscilloscope", "valueOscilloscope", "lineBurnOscilloscope", "scope2d", "scope2dTrace", "phosphorLight", "visualOscilloscope", "numberReadout"].includes(slot?.type);
}

function nodeGraphModuleDisplaySourceForSlot(slot) {
  return nodeGraphModuleSelectedDisplayMode(nodeGraphModuleScopeNodeForSlot(slot))?.source || null;
}

function nodeGraphWirelessVideoCatalogNode(node) {
  if (!node?.id || !nodeGraphModuleDefinitions?.[node.type]) {
    return null;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  const signals = nodeGraphModuleDisplaySignalsForType(node.type);
  if (!modes.length && !signals.length) {
    return null;
  }
  const selectedMode = nodeGraphModuleSelectedDisplayMode(node);
  return {
    id: String(node.id),
    modes: modes.map((mode) => ({
      key: mode.key,
      kind: mode.kind,
      label: mode.label,
      renderer: mode.renderer,
      schema: mode.settingsSchema,
      settingsSchema: mode.settingsSchema,
      source: mode.source && typeof mode.source === "object" ? { ...mode.source } : {},
    })),
    selectedModeKey: selectedMode?.key || "",
    signals: signals.map((signal) => ({
      key: signal.key,
      kind: signal.kind,
      label: signal.label,
      port: signal.port,
    })),
    title: typeof nodeGraphPatchNodeTitle === "function"
      ? nodeGraphPatchNodeTitle(node)
      : nodeGraphNodeLabels?.[node.type] || String(node.type || ""),
    type: String(node.type || ""),
  };
}

function nodeGraphWirelessVideoCatalog(options = {}) {
  const includeHidden = Boolean(options.includeHidden);
  const nodes = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes : [];
  return nodes
    .filter((node) => includeHidden || !normalizeNodeGraphPatchNodeUi(node.ui, node.type).oscilloscopeHidden)
    .map((node) => nodeGraphWirelessVideoCatalogNode(node))
    .filter(Boolean);
}

function nodeGraphCanvasVideoApi() {
  return Object.freeze({
    list(options = {}) {
      return nodeGraphWirelessVideoCatalog(options).map((entry) => ({
        ...entry,
        modes: entry.modes.map((mode) => ({
          ...mode,
          source: mode.source && typeof mode.source === "object" ? { ...mode.source } : {},
        })),
        signals: entry.signals.map((signal) => ({ ...signal })),
      }));
    },
  });
}

if (typeof window !== "undefined") {
  window.nodeGraphCanvasVideoApi = nodeGraphCanvasVideoApi;
  window.nodeGraphWirelessVideoCatalog = nodeGraphWirelessVideoCatalog;
}

// nodeGraphModuleDisplayTypeHasLocalSettings → node-graph-module-scope-display-mode.js
// nodeGraphNodeHasLocalDisplaySettings → node-graph-module-scope-display-mode.js
// nodeGraphNodeCanOpenDisplaySettings → node-graph-module-scope-display-mode.js
// nodeGraphTraceDisplaySettingsForSlot → node-graph-module-scope-display-mode.js
function prepareNodeGraphTraceDisplayBuffer(buffer, settings = nodeGraphTraceDisplaySettingsDefaults) {
  if (!buffer?.length) {
    return buffer;
  }
  const traceSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  buffer.nodeGraphScopeDrawFullWindow = true;
  buffer.nodeGraphScopeDrawProgress = 1;
  buffer.nodeGraphScopeDrawStartProgress = 0;
  buffer.nodeGraphScopeDrawWrap = false;
  buffer.nodeGraphScopeHoldPoint = false;
  buffer.nodeGraphScopeSkipDiscontinuities = traceSettings.skipDiscontinuities;
  buffer.nodeGraphScopeTracePadding = 0;
  buffer.nodeGraphScopeMinPointSpacingPx = 0.5;
  buffer.nodeGraphScopeVisualPointLimit = nodeGraphTraceDisplayRenderPointBudget();
  buffer.nodeGraphScopeUseFullWindow = true;
  return buffer;
}

// nodeGraphModuleScopeClockCapturedLightTarget → node-graph-module-scope-capture.js
function nodeGraphModuleScopeClockAnalogMonitorSample(phase, level) {
  const p = clampNodeSliderValue(Number(phase) || 0, 0, 1);
  const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
  const release = Math.pow(Math.max(0, 1 - p), 1.85);
  const snapEnvelope = attack * release;
  const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
  const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
  const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
  const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
  return (body + sheen) * snapEnvelope * level;
}

function nodeGraphModuleScopeClockMonitorTargetAtPhase(slot, node, phase, duty, level) {
  const port = nodeGraphModuleScopeShaderOutputPortForSlot(slot) || "Digital Out";
  const safePhase = clampNodeSliderValue(Number(phase) || 0, 0, 1);
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (port === "Analog Out") {
    return clampNodeSliderValue(Math.abs(nodeGraphModuleScopeClockAnalogMonitorSample(safePhase, safeLevel)), 0, 1);
  }
  if (port === "Pulse") {
    const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
    const frameWindow = Math.max(1 / 120, Number(nodeGraphModuleScopeState.animationDeltaSeconds) || (1 / 60));
    return rate > 0 && safePhase < Math.min(1, rate * frameWindow) ? safeLevel : 0;
  }
  return duty > 0 && safeLevel > 0 && safePhase < duty ? safeLevel : 0;
}

function nodeGraphModuleScopeClockGateFrameBrightness(previousPhase, turns, duty, level) {
  const safeDuty = clampNodeSliderValue(Number(duty) || 0, 0, 1);
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (safeDuty <= 0 || safeLevel <= 0) {
    return 0;
  }
  if (safeDuty >= 1) {
    return safeLevel;
  }
  const start = wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const span = Math.max(0, Number(turns) || 0);
  if (span <= 0) {
    return start < safeDuty ? safeLevel : 0;
  }
  let remaining = span;
  let phase = start;
  let onDuration = 0;
  let guard = 0;
  while (remaining > 1e-9 && guard < 8) {
    guard += 1;
    if (phase <= 1e-9 && remaining >= 1) {
      const fullCycles = Math.floor(remaining);
      onDuration += fullCycles * safeDuty;
      remaining -= fullCycles;
      continue;
    }
    const segmentDuration = Math.min(remaining, 1 - phase);
    const segmentEnd = phase + segmentDuration;
    onDuration += Math.max(0, Math.min(segmentEnd, safeDuty) - Math.max(phase, 0));
    remaining -= segmentDuration;
    phase = 0;
  }
  return clampNodeSliderValue((onDuration / span) * safeLevel, 0, 1);
}

function nodeGraphModuleScopeClockPulseFrameBrightness(previousPhase, turns, rate, level) {
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  const safeRate = Math.max(0, Number(rate) || 0);
  const span = Math.max(0, Number(turns) || 0);
  if (safeLevel <= 0 || safeRate <= 0 || span <= 0) {
    return 0;
  }
  const start = wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const pulseCount = Math.max(0, Math.floor(start + span));
  if (pulseCount <= 0) {
    return 0;
  }
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const frameSeconds = span / safeRate;
  const pulseSeconds = pulseCount / sampleRate;
  return clampNodeSliderValue((pulseSeconds / Math.max(1 / sampleRate, frameSeconds)) * safeLevel, 0, 1);
}

function nodeGraphModuleScopeClockAnalogFrameBrightness(previousPhase, turns, level) {
  const safeLevel = clampNodeSliderValue(Number(level) || 0, 0, 1);
  if (safeLevel <= 0) {
    return 0;
  }
  const span = Math.max(0, Number(turns) || 0);
  if (span <= 0) {
    return clampNodeSliderValue(Math.abs(
      nodeGraphModuleScopeClockAnalogMonitorSample(previousPhase, safeLevel),
    ), 0, 1);
  }
  const cycleSpan = span >= 1 ? 1 : span;
  const startPhase = span >= 1 ? 0 : wrapNodeSliderValue(Number(previousPhase) || 0, 0, 1);
  const samples = Math.max(4, Math.min(128, Math.ceil(cycleSpan * 96) + 4));
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = samples <= 1 ? 0 : index / (samples - 1);
    const phase = wrapNodeSliderValue(startPhase + cycleSpan * t, 0, 1);
    sum += Math.abs(nodeGraphModuleScopeClockAnalogMonitorSample(phase, safeLevel));
  }
  return clampNodeSliderValue(sum / samples, 0, 1);
}

function nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level) {
  const port = nodeGraphModuleScopeShaderOutputPortForSlot(slot) || "Digital Out";
  const previousPhase = Number(phasor?.previousPhase);
  const fallbackPhase = Number(phasor?.phase) || 0;
  const frameStartPhase = Number.isFinite(previousPhase) ? previousPhase : fallbackPhase;
  const turns = Math.max(0, Number(phasor?.turns) || 0);
  if (turns <= 0) {
    return nodeGraphModuleScopeClockMonitorTargetAtPhase(slot, node, fallbackPhase, duty, level);
  }
  if (port === "Analog Out") {
    return nodeGraphModuleScopeClockAnalogFrameBrightness(frameStartPhase, turns, level);
  }
  if (port === "Pulse") {
    return nodeGraphModuleScopeClockPulseFrameBrightness(frameStartPhase, turns, nodeGraphModuleScopeNodeParam(node, "rate", 0), level);
  }
  return nodeGraphModuleScopeClockGateFrameBrightness(frameStartPhase, turns, duty, level);
}

function nodeGraphModuleScopeOfflineClockBlinkBuffer(slot, capturedBuffer = null) {
  if (slot?.type !== "clock") {
    return null;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node) {
    return null;
  }
  const rate = Math.max(0, nodeGraphModuleScopeNodeParam(node, "rate", 0));
  const duty = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "duty", 0.5), 0, 1);
  const level = clampNodeSliderValue(nodeGraphModuleScopeNodeParam(node, "level", 1), 0, 1);
  const phasor = nodeGraphModuleScopeClockPhasor(
    slot,
    rate,
    nodeGraphModuleScopeModelFrameTime(slot),
  );
  const modelTarget = nodeGraphModuleScopeClockMonitorTarget(slot, node, phasor, duty, level);
  const capturedTarget = nodeGraphModuleScopeClockCapturedLightTarget(slot, capturedBuffer);
  return {
    length: 1,
    nodeGraphScopeFrameBrightness: true,
    nodeGraphScopeEventFrameTurns: Math.max(0, Number(phasor.turns) || 0),
    nodeGraphScopeLightDisplay: true,
    nodeGraphScopeLightInstant: true,
    nodeGraphScopeLightReleaseSeconds: 0.006,
    nodeGraphScopeLightShape: nodeGraphModuleScopeSetting(slot.nodeId).blinkLightShape,
    nodeGraphScopeLightTarget: capturedTarget ?? (Number.isFinite(modelTarget) ? modelTarget : 0),
  };
}

function nodeGraphModuleScopeDotOscilloscopeLightBuffer(capturedBuffer = null) {
  if (!capturedBuffer?.length) {
    return null;
  }
  capturedBuffer.nodeGraphScopeFrameBrightness = true;
  capturedBuffer.nodeGraphScopeLightTarget =
    nodeGraphModuleScopeCapturedFramePositiveLightTarget(capturedBuffer) ??
    nodeGraphModuleScopeCapturedCurrentPositiveLightTarget(capturedBuffer) ??
    0;
  capturedBuffer.nodeGraphScopeBipolarLightTarget =
    nodeGraphModuleScopeCapturedFrameBipolarLightTarget(capturedBuffer) ??
    nodeGraphModuleScopeCapturedCurrentLightTarget(capturedBuffer) ??
    0;
  return capturedBuffer;
}

// transport's BPM readout (displayType "transportBpm") is model-driven, not
// buffer-driven -- it reads nodeGraphPatchTimingValue("tempoBpm") directly
// and has no real audio-rate signal behind it at all ("bpm" isn't a wired
// output port). Without this, nodeGraphModuleScopeDisplayBuffer() had no
// branch for it, so it fell through to the generic else-clause and depended
// entirely on an incidental buffers.get(nodeId) entry (populated by whatever
// happened to be captured from the node's real audio output) just to pass
// the "!buffer" gate in nodeGraphModuleScopeScreenItems. Any unrelated
// parameter change that disturbed that incidental capture (nothing to do
// with tempo) made the buffer momentarily missing -- and a missing buffer
// there means the slot gets explicitly cleared and skipped for the frame,
// with nothing to force a redraw afterward since the display's own cache
// key (the BPM digits) hadn't changed. Same fix shape as clock's
// nodeGraphModuleScopeOfflineClockBlinkBuffer above: always return a stable,
// non-null sentinel so this slot can never be buffer-starved by something
// that has nothing to do with what it actually displays.
function nodeGraphModuleScopeTransportBpmBuffer(slot) {
  if (slot?.type !== "transport") {
    return null;
  }
  return { length: 1 };
}

function nodeGraphModuleScopeOfflineGainAnalyzerBuffer(slot) {
  if (slot?.type !== "gain") {
    return null;
  }
  const node = nodeGraphModuleScopeNodeForSlot(slot);
  if (!node || !nodeGraphModuleScopeConnectionsTo(node.id, "In").length) {
    return null;
  }
  const settings = nodeGraphModuleScopeEffectiveSettingForSlot(slot);
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const nodeMap = nodeGraphModuleScopeNodeMap();
  const sourceFrequency = nodeGraphModuleScopeOfflineSourceFrequency(node.id, nodeMap);
  const cycles = nodeGraphModuleScopeEffectiveCycles(settings) || nodeGraphModuleScopeDefaultSettings.cycles;
  const windowSeconds = sourceFrequency > 0
    ? cycles / sourceFrequency
    : Math.max(0.005, (settings.timeMs || nodeGraphModuleScopeDefaultSettings.timeMs) / 1000);
  const time = nodeGraphModuleScopeModelFrameTime(slot);
  const startTime = time;
  const frames = 2048;
  const buffer = new Float32Array(frames);
  const inputBuffer = new Float32Array(frames);
  const context = {
    nodeMap,
    scopeStartTime: startTime,
    zeroFrequencyDisplayCycles: sourceFrequency > 0 ? 0 : cycles,
    zeroFrequencyDisplayFrames: frames,
  };
  const amount = nodeGraphModuleScopeNodeParam(node, "amount", 1);
  const inputConnections = nodeGraphModuleScopeConnectionsTo(node.id, "In");
  for (let index = 0; index < frames; index += 1) {
    const progress = index / Math.max(1, frames - 1);
    const localTime = startTime + progress * windowSeconds;
    const sampleIndex = Math.floor(localTime * sampleRate);
    context.zeroFrequencyDisplayFrame = sourceFrequency > 0 ? null : index;
    inputBuffer[index] = inputConnections.reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
      context,
      connection.sourceNode,
      localTime,
      sampleIndex,
      connection.sourcePort,
      1,
    ), 0);
    buffer[index] = inputBuffer[index];
  }
  const inputStats = nodeGraphModuleScopeBufferStats(inputBuffer);
  buffer.nodeGraphScopeDrawProgress = 1;
  buffer.nodeGraphScopeAnalyzer = {
    gainDb: nodeGraphModuleScopeLinearToDb(amount),
    inputPeakDb: inputStats.peakDb,
    inputRmsDb: inputStats.rmsDb,
    ...nodeGraphModuleScopeBufferStats(buffer),
  };
  buffer.nodeGraphScopePeriodSamples = sourceFrequency > 0 ? frames / cycles : 0;
  buffer.nodeGraphScopeCurrentSamplePosition = 0;
  buffer.nodeGraphScopeSourceFrequency = sourceFrequency;
  buffer.nodeGraphScopeSyncBuffer = buffer;
  return buffer;
}

// nodeGraphModuleScopeXyTraceFrameCount → node-graph-module-scope-capture.js
// nodeGraphModuleScopeCapturedXyTraceFrameCount → node-graph-module-scope-capture.js
function nodeGraphModuleScopeOutputInputConnections(nodeId) {
  return {
    Mono: nodeGraphModuleScopeConnectionsTo(nodeId, "Mono"),
    Left: nodeGraphModuleScopeConnectionsTo(nodeId, "Left"),
    Right: nodeGraphModuleScopeConnectionsTo(nodeId, "Right"),
  };
}

function nodeGraphModuleScopeOutputConnectionList(inputConnections) {
  return [
    ...(inputConnections?.Mono || []),
    ...(inputConnections?.Left || []),
    ...(inputConnections?.Right || []),
  ];
}

function nodeGraphModuleScopeOfflineConnectionsSourceFrequency(connections, nodeMap) {
  return Math.max(
    0,
    ...(connections || [])
      .map((connection) => nodeGraphModuleScopeOfflineSourceFrequency(connection.sourceNode, nodeMap)),
  );
}

function nodeGraphModuleScopeOfflineConnectionSum(context, connections, localTime, sampleIndex) {
  return (connections || []).reduce((sum, connection) => sum + nodeGraphModuleScopeOfflineSignalSample(
    context,
    connection.sourceNode,
    localTime,
    sampleIndex,
    connection.sourcePort,
    1,
  ), 0);
}

// Spectrum helpers → node-graph-module-scope-spectrum.js
/** Form types that use the mono energy phosphor stack (Stamp + residual). */
