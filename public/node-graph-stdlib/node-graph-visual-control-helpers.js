// Node Graph Standard Library -- visual control smoothing/intensity.
//
// Shared by the visual/LED-style display modules: rgbaHsla,
// sandboxVisuals, screenSpaceShader, bloomGlow, chromaColor.

function nodeGraphVisualControlIntensity(value, runtime, nodeId, source = "visual control") {
  const safeValue = nodeGraphSafeFilterNumber(value, runtime, nodeId, null, source);
  return clampNodeSliderValue(Math.abs(safeValue), 0, 1);
}

function nodeGraphVisualControlSigned(value, runtime, nodeId, source = "visual control") {
  const safeValue = nodeGraphSafeFilterNumber(value, runtime, nodeId, null, source);
  return clampNodeSliderValue(safeValue, -1, 1);
}

function createNodeGraphVisualControlState() {
  return {
    controls: {
      blue: 0,
      chromaAlpha: 0,
      chromaDrift: 0,
      chromaHue: 0,
      chromaLightness: 0,
      chromaSaturation: 0,
      chromaSpread: 0,
      green: 0,
      red: 0,
      scopePaused: 0,
      scopeTracesOff: 0,
      screenDim: 0,
      screenShake: 0,
      visualBloom: 0,
      visualBrightness: 0,
      visualGlow: 0,
      x: 0,
      y: 0,
    },
    states: new Map([
      ["blue", 0],
      ["chromaAlpha", 0],
      ["chromaDrift", 0],
      ["chromaHue", 0],
      ["chromaLightness", 0],
      ["chromaSaturation", 0],
      ["chromaSpread", 0],
      ["green", 0],
      ["red", 0],
      ["scopePaused", 0],
      ["scopeTracesOff", 0],
      ["screenDim", 0],
      ["screenShake", 0],
      ["visualBloom", 0],
      ["visualBrightness", 0],
      ["visualGlow", 0],
      ["x", 0],
      ["y", 0],
    ]),
  };
}

function resetNodeGraphRuntimeVisualControls(runtime) {
  if (!runtime) {
    return;
  }
  const visualState = createNodeGraphVisualControlState();
  runtime.visualControls = visualState.controls;
  runtime.visualControlStates = visualState.states;
}

function nodeGraphSmoothVisualControl(runtime, key, target, sampleRate, seconds = 0.045, min = 0, max = 1) {
  if (!runtime.visualControls) {
    runtime.visualControls = createNodeGraphVisualControlState().controls;
  }
  if (!runtime.visualControlStates) {
    runtime.visualControlStates = new Map();
  }
  const safeTarget = clampNodeSliderValue(Number(target) || 0, min, max);
  const previous = Number(runtime.visualControlStates.get(key));
  const current = Number.isFinite(previous) ? previous : 0;
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const time = Math.max(0, Number(seconds) || 0);
  const coefficient = time <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, time * rate));
  const next = current + (safeTarget - current) * coefficient;
  const planck = typeof nodeGraphPlanck === "function"
    ? nodeGraphPlanck()
    : (typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7);
  const cleaned = Math.abs(next) < planck ? 0 : clampNodeSliderValue(next, min, max);
  runtime.visualControlStates.set(key, cleaned);
  runtime.visualControls[key] = cleaned;
  return cleaned;
}
