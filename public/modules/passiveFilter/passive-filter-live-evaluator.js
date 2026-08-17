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

nodeGraphLiveModuleEvaluators.passiveFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.passiveFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphPassiveFilterState);
  runtime.passiveFilterStates.set(nodeId, state);
  const passiveMode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues);
  const passiveSweep = readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 0, frame, frames, frameValues);
  const passiveLowFrequency = nodeGraphPassiveSweepHz(
    readNodeGraphLiveEffectiveParam(runtime, node, "lowFrequency", 200, frame, frames, frameValues),
    passiveSweep,
  );
  const passiveHighFrequency = nodeGraphPassiveSweepHz(
    readNodeGraphLiveEffectiveParam(runtime, node, "highFrequency", 1000, frame, frames, frameValues),
    passiveSweep,
  );
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
