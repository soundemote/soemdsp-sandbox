// Random Clock — pure math (main thread + worklet JS path).

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

function nodeGraphRandomClockStableSeed(seedKey) {
  if (typeof nodeGraphStableSeed === "function") {
    return nodeGraphStableSeed(seedKey) | 0;
  }
  let h = 2166136261;
  const s = String(seedKey || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nodeGraphRandomClockNextUnit(state, nodeId, seed) {
  const seedKey = `${nodeId}:${Math.round(Number(seed) || 0)}`;
  if (state.seedKey !== seedKey) {
    state.seedKey = seedKey;
    state.randomState = nodeGraphRandomClockStableSeed(seedKey);
    state.intervalSamples = 0;
    state.phaseSamples = 0;
    state.remainingTriggerSamples = 0;
  }
  state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function nodeGraphRandomClockChooseIntervalSamples(state, params, sampleRate, nodeId) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const minSeconds = Math.max(0, Number(params?.minSeconds) || 0);
  const maxSeconds = Math.max(0, Number(params?.maxSeconds) || 0);
  const low = Math.min(minSeconds, maxSeconds);
  const high = Math.max(minSeconds, maxSeconds);
  const random = nodeGraphRandomClockNextUnit(state, nodeId, params?.seed);
  return Math.max(1, Math.round((low + (high - low) * random) * rate));
}

/**
 * @returns {{ Gate: number, Trigger: number }}
 */
function nodeGraphRandomClockCore(state, reset, params, sampleRate, nodeId) {
  const safeReset = Number(reset) || 0;
  const threshold = Number(params?.threshold) || 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const duty = Math.max(0, Math.min(1, Number(params?.duty) || 0));
  const triggerTime = Math.max(0, Number(params?.triggerTime) || 0);
  const level = Number(params?.level) || 0;
  const resetEdge = state.lastReset <= threshold && safeReset > threshold;

  if (resetEdge || state.intervalSamples <= 0) {
    state.intervalSamples = nodeGraphRandomClockChooseIntervalSamples(state, params, rate, nodeId);
    state.phaseSamples = 0;
    state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
  } else if (state.phaseSamples >= state.intervalSamples) {
    state.intervalSamples = nodeGraphRandomClockChooseIntervalSamples(state, params, rate, nodeId);
    state.phaseSamples = 0;
    state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
  }

  const gateSamples = Math.round(state.intervalSamples * duty);
  const trigger = state.remainingTriggerSamples > 0 ? level : 0;
  const gate = state.phaseSamples < gateSamples ? level : 0;
  state.remainingTriggerSamples = Math.max(0, state.remainingTriggerSamples - 1);
  state.phaseSamples += 1;
  state.lastReset = safeReset;
  return { Gate: gate, Trigger: trigger };
}
