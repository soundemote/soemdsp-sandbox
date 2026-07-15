// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphRandomClockNextUnit(state, nodeId, seed) {
  const seedKey = `${nodeId}:${Math.round(Number(seed) || 0)}`;
  if (state.seedKey !== seedKey) {
    state.seedKey = seedKey;
    state.randomState = nodeGraphStableSeed(seedKey);
    state.intervalSamples = 0;
    state.phaseSamples = 0;
    state.remainingTriggerSamples = 0;
  }
  state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}


function nodeGraphRandomClockChooseIntervalSamples(state, params, sampleRate, runtime, nodeId) {
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const minSeconds = Math.max(0, nodeGraphSafeFilterNumber(params.minSeconds, runtime, nodeId, null, "random clock min"));
  const maxSeconds = Math.max(0, nodeGraphSafeFilterNumber(params.maxSeconds, runtime, nodeId, null, "random clock max"));
  const low = Math.min(minSeconds, maxSeconds);
  const high = Math.max(minSeconds, maxSeconds);
  const random = nodeGraphRandomClockNextUnit(state, nodeId, params.seed);
  return Math.max(1, Math.round((low + (high - low) * random) * rate));
}


function createNodeGraphRandomClockState() {
  return {
    intervalSamples: 0,
    lastReset: 0,
    phaseSamples: 0,
    randomState: 0,
    remainingTriggerSamples: 0,
    seedKey: "",
  };
}

function nodeGraphRandomClockSample(state, reset, params, sampleRate, runtime = null, nodeId = "") {
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "random clock reset");
  const threshold = nodeGraphSafeFilterNumber(params.threshold, runtime, nodeId, null, "random clock reset threshold");
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const duty = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params.duty, runtime, nodeId, null, "random clock duty"),
    0,
    1,
  );
  const triggerTime = Math.max(0, nodeGraphSafeFilterNumber(params.triggerTime, runtime, nodeId, null, "random clock trigger"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "random clock level");
  const resetEdge = state.lastReset <= threshold && safeReset > threshold;

  if (resetEdge || state.intervalSamples <= 0) {
    state.intervalSamples = nodeGraphRandomClockChooseIntervalSamples(state, params, rate, runtime, nodeId);
    state.phaseSamples = 0;
    state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
  } else if (state.phaseSamples >= state.intervalSamples) {
    state.intervalSamples = nodeGraphRandomClockChooseIntervalSamples(state, params, rate, runtime, nodeId);
    state.phaseSamples = 0;
    state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
  }

  const gateSamples = Math.round(state.intervalSamples * duty);
  const trigger = state.remainingTriggerSamples > 0 ? level : 0;
  const gate = state.phaseSamples < gateSamples ? level : 0;
  state.remainingTriggerSamples = Math.max(0, state.remainingTriggerSamples - 1);
  state.phaseSamples += 1;
  state.lastReset = safeReset;
  return {
    Gate: nodeGraphSafeFilterNumber(gate, runtime, nodeId, null, "random clock gate"),
    Trigger: nodeGraphSafeFilterNumber(trigger, runtime, nodeId, null, "random clock trigger output"),
  };
}


// Registers the offline/render-time dispatch handler for randomClock into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.randomClock = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.randomClockStates.get(nodeId) || createNodeGraphRandomClockState();
  runtime.randomClockStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphRandomClockSample(
    state,
    mixInput(nodeId, "Reset"),
    {
      duty: read("duty", 0.5),
      level: read("level", 1),
      maxSeconds: read("maxSeconds", 1),
      minSeconds: read("minSeconds", 0.25),
      seed: read("seed", 1),
      threshold: read("threshold", 0),
      triggerTime: read("triggerTime", 0.01),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
