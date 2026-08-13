// Random Clock — pure math (main thread + worklet JS path).

function createNodeGraphRandomClockState() {
  return {
    intervalSamples: 0,
    intervalUnit: 0,
    lastMaxSeconds: NaN,
    lastMinSeconds: NaN,
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
    state.intervalUnit = 0;
    state.lastMinSeconds = NaN;
    state.lastMaxSeconds = NaN;
    state.phaseSamples = 0;
    state.remainingTriggerSamples = 0;
  }
  state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function nodeGraphRandomClockIntervalFromUnit(unit, minSeconds, maxSeconds, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const low = Math.min(Math.max(0, Number(minSeconds) || 0), Math.max(0, Number(maxSeconds) || 0));
  const high = Math.max(Math.max(0, Number(minSeconds) || 0), Math.max(0, Number(maxSeconds) || 0));
  const t = Math.max(0, Math.min(1, Number(unit) || 0));
  return Math.max(1, Math.round((low + (high - low) * t) * rate));
}

function nodeGraphRandomClockChooseIntervalSamples(state, params, sampleRate, nodeId) {
  state.intervalUnit = nodeGraphRandomClockNextUnit(state, nodeId, params?.seed);
  return nodeGraphRandomClockIntervalFromUnit(
    state.intervalUnit,
    params?.minSeconds,
    params?.maxSeconds,
    sampleRate,
  );
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
  const minSeconds = Math.max(0, Number(params?.minSeconds) || 0);
  const maxSeconds = Math.max(0, Number(params?.maxSeconds) || 0);
  const rangeChanged = state.lastMinSeconds !== minSeconds || state.lastMaxSeconds !== maxSeconds;
  state.lastMinSeconds = minSeconds;
  state.lastMaxSeconds = maxSeconds;

  const beginCycle = () => {
    state.intervalSamples = nodeGraphRandomClockChooseIntervalSamples(state, params, rate, nodeId);
    state.phaseSamples = 0;
    state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
  };

  if (resetEdge || state.intervalSamples <= 0) {
    beginCycle();
  } else if (rangeChanged) {
    // Keep this cycle's random draw; remap it onto the new Min/Max so the
    // remaining wait updates immediately (do not wait for the old interval).
    state.intervalSamples = nodeGraphRandomClockIntervalFromUnit(
      state.intervalUnit,
      minSeconds,
      maxSeconds,
      rate,
    );
    if (state.phaseSamples >= state.intervalSamples) {
      beginCycle();
    }
  } else if (state.phaseSamples >= state.intervalSamples) {
    beginCycle();
  }

  const gateSamples = Math.round(state.intervalSamples * duty);
  const trigger = state.remainingTriggerSamples > 0 ? level : 0;
  const gate = state.phaseSamples < gateSamples ? level : 0;
  state.remainingTriggerSamples = Math.max(0, state.remainingTriggerSamples - 1);
  state.phaseSamples += 1;
  state.lastReset = safeReset;
  return { Gate: gate, Trigger: trigger };
}
