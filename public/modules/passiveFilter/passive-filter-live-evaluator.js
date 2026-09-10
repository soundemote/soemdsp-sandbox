// Offline/render-time dispatch for passiveFilter. Math: passive-filter-math.js.

function nodeGraphPassiveSweepHz(hz, semitones) {
  if (typeof nodeGraphSweepFrequencyHz === "function") {
    return nodeGraphSweepFrequencyHz(hz, semitones);
  }
  const f = Number(hz);
  if (!Number.isFinite(f) || f <= 0) {
    return 0;
  }
  const st = Number(semitones);
  if (!Number.isFinite(st) || st === 0) {
    return f;
  }
  const out = f * (2 ** (st / 12));
  return Number.isFinite(out) && out > 0 ? out : 0;
}

function nodeGraphPassiveFilterResolveCutoffs(runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput) {
  const mode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues);
  const sweep = readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 0, frame, frames, frameValues);
  let low = readNodeGraphLiveEffectiveParam(runtime, node, "lowFrequency", 200, frame, frames, frameValues);
  let high = readNodeGraphLiveEffectiveParam(runtime, node, "highFrequency", 1000, frame, frames, frameValues);
  const pitchRatio = typeof nodeGraphPatchPitchOffsetRatio === "function"
    ? nodeGraphPatchPitchOffsetRatio()
    : 1;
  const freqJack = typeof nodeGraphResolveAbsHzJack === "function"
    ? nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId)
    : null;
  let centerFrequency;
  if (freqJack != null) {
    const n = Number(freqJack);
    centerFrequency = (Number.isFinite(n) ? n : 0) * pitchRatio;
  } else if (typeof hasInput === "function" && hasInput(nodeId, "0.1V/Oct")) {
    const lo = Math.max(0, Number(low) || 0);
    const hi = Math.max(0, Number(high) || 0);
    const safeMode = Math.round(Number(mode)) || 0;
    let base;
    if (safeMode === 0) base = hi > 0 ? hi : 1000;
    else if (safeMode === 2) base = lo > 0 ? lo : 200;
    else base = lo > 0 && hi > 0 ? Math.sqrt(lo * hi) : (hi > 0 ? hi : (lo > 0 ? lo : 1000));
    centerFrequency = typeof nodeGraphFrequencyHzFromKnobOrF === "function"
      ? nodeGraphFrequencyHzFromKnobOrF(base, hasInput, mixInput, nodeId)
      : base * pitchRatio;
  } else if (pitchRatio !== 1) {
    const lo = Math.max(0, Number(low) || 0);
    const hi = Math.max(0, Number(high) || 0);
    const safeMode = Math.round(Number(mode)) || 0;
    if (safeMode === 0 && hi > 0) centerFrequency = hi * pitchRatio;
    else if (safeMode === 2 && lo > 0) centerFrequency = lo * pitchRatio;
    else if (lo > 0 && hi > 0) centerFrequency = Math.sqrt(lo * hi) * pitchRatio;
    else if (hi > 0) centerFrequency = hi * pitchRatio;
    else if (lo > 0) centerFrequency = lo * pitchRatio;
  }
  if (typeof nodeGraphPassiveFilterApplyCenter === "function" && Number.isFinite(centerFrequency)) {
    const centered = nodeGraphPassiveFilterApplyCenter(mode, low, high, centerFrequency);
    low = centered.lowFrequency;
    high = centered.highFrequency;
  }
  return {
    mode,
    lowFrequency: nodeGraphPassiveSweepHz(low, sweep),
    highFrequency: nodeGraphPassiveSweepHz(high, sweep),
  };
}

nodeGraphLiveModuleEvaluators.passiveFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  const state = runtime.passiveFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphPassiveFilterState);
  runtime.passiveFilterStates.set(nodeId, state);
  const cuts = nodeGraphPassiveFilterResolveCutoffs(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  );
  const passiveMode = cuts.mode;
  const passiveLowFrequency = cuts.lowFrequency;
  const passiveHighFrequency = cuts.highFrequency;
  const passiveSlope = readNodeGraphLiveEffectiveParam(runtime, node, "slope", 0, frame, frames, frameValues);
  const passiveStagger = readNodeGraphLiveEffectiveParam(runtime, node, "stagger", 1, frame, frames, frameValues);
  const passiveGainComp = readNodeGraphLiveEffectiveParam(runtime, node, "gainCompensation", 1, frame, frames, frameValues);
  const passiveMono = mixInput(nodeId);
  const passiveCoeff = typeof nodeGraphPassiveFilterPrepare === "function"
    ? nodeGraphPassiveFilterPrepare(
      state,
      passiveMode,
      passiveLowFrequency,
      passiveHighFrequency,
      passiveSlope,
      passiveStagger,
      passiveGainComp,
    )
    : null;
  if (passiveCoeff && typeof nodeGraphPassiveFilterProcess === "function") {
    return {
      Out: nodeGraphPassiveFilterProcess(state.mono, passiveMono, passiveCoeff, sampleRate, runtime, `${nodeId}:mono`),
      Left: nodeGraphPassiveFilterProcess(state.left, mixInput(nodeId, "Left") + passiveMono, passiveCoeff, sampleRate, runtime, `${nodeId}:left`),
      Right: nodeGraphPassiveFilterProcess(state.right, mixInput(nodeId, "Right") + passiveMono, passiveCoeff, sampleRate, runtime, `${nodeId}:right`),
    };
  }
  return {
    Out: nodeGraphPassiveFilterSample(state.mono, passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:mono`, passiveSlope, passiveStagger, passiveGainComp),
    Left: nodeGraphPassiveFilterSample(state.left, mixInput(nodeId, "Left") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:left`, passiveSlope, passiveStagger, passiveGainComp),
    Right: nodeGraphPassiveFilterSample(state.right, mixInput(nodeId, "Right") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, sampleRate, runtime, `${nodeId}:right`, passiveSlope, passiveStagger, passiveGainComp),
  };
};
