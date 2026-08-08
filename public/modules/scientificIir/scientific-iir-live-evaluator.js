// Offline/render dispatch for classical scientific IIR modules + dedicated bandpass.
// Shared math: scientific-iir-math.js. Bandpass reuses EQ ZDF SVF Bandpass Peak.

function nodeGraphScientificIirLiveEval(kind, typeKey, defaults) {
  return ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
    const mapName = `${typeKey}States`;
    if (!runtime[mapName]) runtime[mapName] = new Map();
    const state = runtime[mapName].get(nodeId) || createNodeGraphStereoScientificIirState();
    runtime[mapName].set(nodeId, state);
    const mode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", defaults.mode ?? 0, frame, frames, frameValues);
    const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", defaults.frequency ?? 1000, frame, frames, frameValues);
    const order = readNodeGraphLiveEffectiveParam(runtime, node, "order", defaults.order ?? 4, frame, frames, frameValues);
    const bandwidth = readNodeGraphLiveEffectiveParam(runtime, node, "bandwidth", defaults.bandwidth ?? 1, frame, frames, frameValues);
    const ripple = readNodeGraphLiveEffectiveParam(runtime, node, "ripple", defaults.ripple ?? 1, frame, frames, frameValues);
    const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
    const mono = mixInput(nodeId);
    const run = (ch, x) => nodeGraphScientificIirSample(ch, x, kind, mode, frequency, order, bandwidth, ripple, rate);
    return {
      Out: run(state.mono, mono),
      Left: run(state.left, mixInput(nodeId, "Left") + mono),
      Right: run(state.right, mixInput(nodeId, "Right") + mono),
    };
  };
}

nodeGraphLiveModuleEvaluators.butterworth = nodeGraphScientificIirLiveEval(0, "butterworth", {});
nodeGraphLiveModuleEvaluators.linkwitzRiley = nodeGraphScientificIirLiveEval(1, "linkwitzRiley", {});
nodeGraphLiveModuleEvaluators.bessel = nodeGraphScientificIirLiveEval(2, "bessel", {});
nodeGraphLiveModuleEvaluators.chebyshev = nodeGraphScientificIirLiveEval(3, "chebyshev", { ripple: 1 });
nodeGraphLiveModuleEvaluators.elliptic = nodeGraphScientificIirLiveEval(4, "elliptic", { ripple: 1 });

// Dedicated true resonant 2nd-order bandpass — EQ SVF Peak + 0.1V/Oct + f pitch CV.
nodeGraphLiveModuleEvaluators.bandpass = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
  hasInput,
}) => {
  if (!runtime.bandpassStates) runtime.bandpassStates = new Map();
  const state = runtime.bandpassStates.get(nodeId)
    || (typeof createNodeGraphStereoEqFilterState === "function"
      ? createNodeGraphStereoEqFilterState()
      : { left: createNodeGraphEqFilterState(), mono: createNodeGraphEqFilterState(), right: createNodeGraphEqFilterState() });
  runtime.bandpassStates.set(nodeId, state);
  const baseFreq = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues);
  const q = readNodeGraphLiveEffectiveParam(runtime, node, "q", 1, frame, frames, frameValues);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const frequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? Math.max(0, nodeGraphParamResolveOscPitchHz({
      baseHz: baseFreq,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    }))
    : Math.max(0, baseFreq);
  const mono = mixInput(nodeId);
  const run = (ch, x) => nodeGraphEqFilterSample(ch, x, 4, frequency, q, 0, rate);
  return {
    Out: run(state.mono, mono),
    Left: run(state.left, mixInput(nodeId, "Left") + mono),
    Right: run(state.right, mixInput(nodeId, "Right") + mono),
  };
};

// Dedicated allpass — EQ SVF Allpass (mode 6) + same pitch CV as Bandpass.
nodeGraphLiveModuleEvaluators.allpass = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
  hasInput,
}) => {
  if (!runtime.allpassStates) runtime.allpassStates = new Map();
  const state = runtime.allpassStates.get(nodeId)
    || (typeof createNodeGraphStereoEqFilterState === "function"
      ? createNodeGraphStereoEqFilterState()
      : { left: createNodeGraphEqFilterState(), mono: createNodeGraphEqFilterState(), right: createNodeGraphEqFilterState() });
  runtime.allpassStates.set(nodeId, state);
  const baseFreq = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues);
  const q = readNodeGraphLiveEffectiveParam(runtime, node, "q", 0.707, frame, frames, frameValues);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const frequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? Math.max(0, nodeGraphParamResolveOscPitchHz({
      baseHz: baseFreq,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    }))
    : Math.max(0, baseFreq);
  const mono = mixInput(nodeId);
  // mode 6 = Allpass
  const run = (ch, x) => nodeGraphEqFilterSample(ch, x, 6, frequency, q, 0, rate);
  return {
    Out: run(state.mono, mono),
    Left: run(state.left, mixInput(nodeId, "Left") + mono),
    Right: run(state.right, mixInput(nodeId, "Right") + mono),
  };
};

// Under construction: Formant filter — dry passthrough placeholder
nodeGraphLiveModuleEvaluators.formantFilter = ({ nodeId, mixInput }) => {
  const mono = mixInput(nodeId);
  return { Out: mono, Left: mixInput(nodeId, "Left") + mono, Right: mixInput(nodeId, "Right") + mono };
};

// Under construction: Binary Clock — zero outputs placeholder
nodeGraphLiveModuleEvaluators.binaryClock = () => ({
  Out: 0,
  Bit0: 0,
  Bit1: 0,
  Bit2: 0,
  Bit3: 0,
  Gate: 0,
});

// Under construction: Theremin — silent placeholder (Controller shelf)
nodeGraphLiveModuleEvaluators.theremin = () => ({
  Out: 0,
  Pitch: 0,
  Volume: 0,
});
