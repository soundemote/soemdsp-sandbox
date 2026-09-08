// Dual Ladder Filter — offline/render. Pure math: active-filter-math.js.

nodeGraphLiveModuleEvaluators.activeFilter = ({
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
  if (!runtime.activeFilterStates) {
    runtime.activeFilterStates = new Map();
  }
  const state = runtime.activeFilterStates.get(nodeId)
    || (typeof createNodeGraphStereoActiveFilterState === "function"
      ? createNodeGraphStereoActiveFilterState()
      : createNodeGraphStereoFilterState(createNodeGraphActiveFilterState));
  runtime.activeFilterStates.set(nodeId, state);
  const freqJack = typeof nodeGraphResolveAbsHzJack === "function"
    ? nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId)
    : null;
  const freqWired = freqJack != null;
  const lowFrequency = readNodeGraphLiveEffectiveParam(runtime, node, "lowFrequency", 200, frame, frames, frameValues);
  const highFrequency = readNodeGraphLiveEffectiveParam(runtime, node, "highFrequency", 1000, frame, frames, frameValues);
  const pitchRatio = typeof nodeGraphPatchPitchOffsetRatio === "function"
    ? nodeGraphPatchPitchOffsetRatio()
    : 1;
  let centerFrequency;
  if (freqWired) {
    const n = Number(freqJack);
    centerFrequency = (Number.isFinite(n) ? n : 0) * pitchRatio;
  } else if (typeof hasInput === "function" && hasInput(nodeId, "0.1V/Oct")) {
    // Pitch the geometric mean of Low/High Cut (matches WASM process_active_filter).
    const lo = Math.max(0, Number(lowFrequency) || 0);
    const hi = Math.max(0, Number(highFrequency) || 0);
    const base = lo > 0 && hi > 0 ? Math.sqrt(lo * hi) : (hi > 0 ? hi : (lo > 0 ? lo : 1000));
    centerFrequency = typeof nodeGraphFrequencyHzFromKnobOrF === "function"
      ? nodeGraphFrequencyHzFromKnobOrF(base, hasInput, mixInput, nodeId)
      : base * pitchRatio;
  } else if (pitchRatio !== 1) {
    // No ƒ / 0.1V: transpose both cuts via center (geo mean × patch Pitch).
    const lo = Math.max(0, Number(lowFrequency) || 0);
    const hi = Math.max(0, Number(highFrequency) || 0);
    if (lo > 0 && hi > 0) centerFrequency = Math.sqrt(lo * hi) * pitchRatio;
    else if (hi > 0) centerFrequency = hi * pitchRatio;
    else if (lo > 0) centerFrequency = lo * pitchRatio;
  }
  const params = {
    feedbackCircuit: readNodeGraphLiveEffectiveParam(runtime, node, "feedbackCircuit", 3, frame, frames, frameValues),
    centerFrequency,
    gainCompensation: readNodeGraphLiveEffectiveParam(runtime, node, "gainCompensation", 1, frame, frames, frameValues),
    highFrequency,
    hpSlope: readNodeGraphLiveEffectiveParam(runtime, node, "hpSlope", 0, frame, frames, frameValues),
    lowFrequency,
    lpSlope: readNodeGraphLiveEffectiveParam(runtime, node, "lpSlope", 4, frame, frames, frameValues),
    // Legacy patches may still carry mode — resolve migrates to slopes.
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 3, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
    sweep: readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 0, frame, frames, frameValues),
  };
  const mono = mixInput(nodeId);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const run = (ch, x, tag) => {
    const y = nodeGraphActiveFilterProcess(ch, x, params, rate);
    return typeof nodeGraphSafeFilterNumber === "function"
      ? nodeGraphSafeFilterNumber(y, runtime, nodeId, ch, tag)
      : y;
  };
  return {
    Out: run(state.mono, mono, "dual ladder mono"),
    Left: run(state.left, mixInput(nodeId, "Left") + mono, "dual ladder left"),
    Right: run(state.right, mixInput(nodeId, "Right") + mono, "dual ladder right"),
  };
};
