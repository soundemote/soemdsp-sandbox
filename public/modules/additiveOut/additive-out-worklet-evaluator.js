// Worklet: Additive Out — Graph IN → audio Out. Silence if unwired.

NodeLiveAudioProcessor.prototype.additiveOutWorkletEvaluate = function additiveOutWorkletEvaluate(
  node, nodeId, frame, frames, frameValues, mixInput, safeRate
) {
  this.ensureAdditiveGraphBus();
  const graph = this.additiveGraphReadWired(nodeId, "Graph");
  if (!graph || !graph.ratio || !graph.harmonics) {
    frameValues.Mono = 0;
    return { Mono: 0 };
  }

  let state = this.additiveOutStates.get(String(nodeId));
  if (!state) {
    state = { phaseAcc: null, lastReset: 0, heldGraph: null, heldFreq: 100, heldPhase: 0, heldAmp: 0.35 };
    this.additiveOutStates.set(String(nodeId), state);
  }

  // ZOH capture on first frame of the quantum.
  if (frame === 0) {
    state.heldGraph = graph;
    const p = node?.parameters || {};
    const referenceVoltage = 48 / 120;
    let frequencyHz = Number(p.frequency) || 100;
    const hasPitch = this.inputConnections?.has?.(this.inputKey(nodeId, "0.1V/Oct"));
    if (hasPitch) {
      const pitchCv = Number(mixInput(nodeId, "0.1V/Oct")) || 0;
      frequencyHz = typeof this.pitchedFrequency === "function"
        ? this.pitchedFrequency(frequencyHz, pitchCv, referenceVoltage)
        : frequencyHz * Math.pow(2, (pitchCv - referenceVoltage) / 0.1);
    }
    const hasF = this.inputConnections?.has?.(this.inputKey(nodeId, "f"));
    if (hasF) {
      const fAbs = Number(mixInput(nodeId, "f"));
      if (Number.isFinite(fAbs)) frequencyHz = fAbs;
    }
    state.heldFreq = frequencyHz;
    state.heldPhase = Number(p.phase) || 0;
    state.heldAmp = Number(p.amplitude);
    if (!(state.heldAmp === state.heldAmp)) state.heldAmp = 0.35;
    this.additiveGraphPublish.set(String(nodeId), {
      ...graph,
      frequencyHz: state.heldFreq,
      masterPhase: state.heldPhase,
      masterAmp: state.heldAmp,
    });
  }

  const hasReset = this.inputConnections?.has?.(this.inputKey(nodeId, "Reset"));
  if (hasReset) {
    const rv = Number(mixInput(nodeId, "Reset")) || 0;
    if (state.lastReset <= 0 && rv > 0) state.phaseAcc = null;
    state.lastReset = rv;
  }

  const g = state.heldGraph || graph;
  let freq = state.heldFreq;
  // Pitch / ƒ stay sample-accurate when live.
  const livePitch = this.inputConnections?.has?.(this.inputKey(nodeId, "0.1V/Oct"));
  const liveF = this.inputConnections?.has?.(this.inputKey(nodeId, "f"));
  if (liveF) {
    const fAbs = Number(mixInput(nodeId, "f"));
    if (Number.isFinite(fAbs)) freq = fAbs;
  } else if (livePitch) {
    const referenceVoltage = 48 / 120;
    const base = Number(node?.parameters?.frequency) || 100;
    const pitchCv = Number(mixInput(nodeId, "0.1V/Oct")) || 0;
    freq = typeof this.pitchedFrequency === "function"
      ? this.pitchedFrequency(base, pitchCv, referenceVoltage)
      : base * Math.pow(2, (pitchCv - referenceVoltage) / 0.1);
  }

  const summed = additiveGraphSumSample(
    g,
    state.phaseAcc,
    freq,
    state.heldPhase,
    state.heldAmp,
    safeRate || this.engineSampleRate || sampleRate
  );
  state.phaseAcc = summed.phaseAcc;

  const hasInc = this.inputConnections?.has?.(this.inputKey(nodeId, "Increment"));
  if (hasInc && state.phaseAcc) {
    const inc = Number(mixInput(nodeId, "Increment")) || 0;
    for (let i = 0; i < state.phaseAcc.length; i += 1) {
      state.phaseAcc[i] = additiveGraphWrap01(state.phaseAcc[i] + inc);
    }
  }

  frameValues.Mono = summed.y;
  return { Mono: summed.y };
};
