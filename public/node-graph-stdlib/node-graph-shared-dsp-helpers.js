// Node Graph Standard Library -- small multi-module DSP primitives.
//
// Each helper below is shared by exactly 2-11 modules (noted per
// function) -- too widely used to live in any one module's folder,
// too small individually to warrant its own file.

function createNodeGraphTriggerDividerState() {
  return {
    count: 0,
    lastReset: 0,
    lastTrigger: 0,
    remainingSamples: 0,
  };
}

function nodeGraphTriggerDividerSample(state, trigger, reset, params, sampleRate, runtime = null, nodeId = "") {
  const safeTrigger = nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "trigger divider trigger");
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "trigger divider reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "trigger divider threshold");
  const division = Math.max(1, Math.min(64, Math.round(nodeGraphSafeFilterNumber(params.division, runtime, nodeId, null, "trigger divider division"))));
  const pulseTime = Math.max(0, nodeGraphSafeFilterNumber(params.pulseTime, runtime, nodeId, null, "trigger divider pulse"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "trigger divider level");
  if (state.lastReset <= threshold && safeReset > threshold) {
    state.count = 0;
    state.remainingSamples = 0;
  }
  if (state.lastTrigger <= threshold && safeTrigger > threshold) {
    state.count = (state.count + 1) % division;
    if (state.count === 0) {
      state.remainingSamples = Math.max(1, Math.round(pulseTime * Math.max(1, sampleRate)));
    }
  }
  state.lastTrigger = safeTrigger;
  state.lastReset = safeReset;
  const output = state.remainingSamples > 0 ? level : 0;
  state.remainingSamples = Math.max(0, state.remainingSamples - 1);
  return nodeGraphSafeFilterNumber(output, runtime, nodeId, null, "trigger divider output");
}

function createNodeGraphOscResetState() {
  return {
    lastReset: 0,
  };
}

function nodeGraphIsPolyBlepOscillatorType(type) {
  return nodeGraphModuleIsRealtimeOscillatorType(type);
}

function nodeGraphDelayInterpolateLinear(buffer, where) {
  const length = buffer.length;
  if (!length) {
    return 0;
  }
  const before = Math.floor(where) % length;
  const after = (before + 1) % length;
  const mix = where - Math.floor(where);
  return buffer[before] * (1 - mix) + buffer[after] * mix;
}

function createNodeGraphNoiseGeneratorChannelState() {
  return { brown: 0, gaussianSpare: null, pink: [0, 0, 0, 0, 0, 0, 0], seed: 0, seedKey: "" };
}

function nodeGraphOnePoleLowpassSample(state, input, frequency, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "lowpass input");
  const frequencyValue = Math.max(0, nodeGraphSafeFilterNumber(frequency, runtime, nodeId, state, "lowpass frequency"));
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  state.outputBuffer = nodeGraphSafeFilterNumber(
    b0 * safeInput + a1 * state.outputBuffer,
    runtime,
    nodeId,
    state,
    "lowpass output",
  );
  return state.outputBuffer;
}

function createNodeGraphStereoFilterState(createFn) {
  return { left: createFn(), mono: createFn(), right: createFn() };
}

function nodeGraphLadderFilterStageCount(stages) {
  const value = Math.round(Number(stages));
  return Number.isFinite(value) ? clampNodeSliderValue(value, 1, 4) : 4;
}

function nodeGraphFlowerChildFilterCurveShape(v, tension) {
  const denom = 2 * tension * v - tension - 1;
  if (denom === 0) return v;
  return (tension * v - v) / denom;
}

function createNodeGraphGraphLfoState() {
  return {
    lastReset: 0,
    resetFrame: 0,
  };
}

function nodeGraphMarkRuntimeBadNumber(runtime, nodeId, source = "dsp") {
  if (!runtime) {
    return;
  }
  runtime.badNumberCount = (runtime.badNumberCount || 0) + 1;
  runtime.lastBadNumber = { nodeId, source };
  if (typeof nodeGraphRecordBadValueEvent === "function") {
    nodeGraphRecordBadValueEvent({
      engine: runtime.engine || "runtime",
      nodeId,
      reason: source.split(" ").pop() || "bad",
      source,
    });
  }
}
