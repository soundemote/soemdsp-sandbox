// Offline/render dispatch for classical scientific IIR modules + dedicated bandpass.
// Shared math: scientific-iir-math.js. Bandpass reuses EQ ZDF SVF Bandpass Peak.

function nodeGraphScientificIirLiveEval(kind, typeKey, defaults) {
  return ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
    const mapName = `${typeKey}States`;
    if (!runtime[mapName]) runtime[mapName] = new Map();
    const state = runtime[mapName].get(nodeId) || createNodeGraphStereoScientificIirState();
    runtime[mapName].set(nodeId, state);
    const mode = readNodeGraphLiveEffectiveParam(runtime, node, "mode", defaults.mode ?? 0, frame, frames, frameValues);
    const knobHz = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", defaults.frequency ?? 1000, frame, frames, frameValues);
    const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
      ? mixInput(nodeId, "f")
      : knobHz;
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
  const hasAbsHz = typeof hasInput === "function" && hasInput(nodeId, "f");
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const frequency = hasAbsHz
    ? mixInput(nodeId, "f")
    : (typeof nodeGraphParamResolveOscPitchHz === "function"
      ? Math.max(0, nodeGraphParamResolveOscPitchHz({baseHz: baseFreq,
        hasPitchCv: hasPitch,
        pitchCv,
        referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    }))
      : Math.max(0, baseFreq));
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
  const hasAbsHz = typeof hasInput === "function" && hasInput(nodeId, "f");
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const frequency = hasAbsHz
    ? mixInput(nodeId, "f")
    : (typeof nodeGraphParamResolveOscPitchHz === "function"
      ? Math.max(0, nodeGraphParamResolveOscPitchHz({baseHz: baseFreq,
        hasPitchCv: hasPitch,
        pitchCv,
        referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    }))
      : Math.max(0, baseFreq));
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

// Under construction: OSC — silent placeholder (Controller shelf)
nodeGraphLiveModuleEvaluators.osc = () => ({
  Out: 0,
  X: 0,
  Y: 0,
  Gate: 0,
});

// Under construction: electro drum voices — silent placeholders (Drum shelf)
nodeGraphLiveModuleEvaluators.electroKick = () => ({ Out: 0 });
nodeGraphLiveModuleEvaluators.electroSnare = () => ({ Out: 0 });
nodeGraphLiveModuleEvaluators.electroHat = () => ({ Out: 0 });

// Under construction: multi-frame wavetable oscillators — silent placeholders (Oscillator shelf)
nodeGraphLiveModuleEvaluators.wavetable2d = () => ({ Out: 0 });
nodeGraphLiveModuleEvaluators.wavetable3d = () => ({ Out: 0 });

// Under construction: RGB pixel-grid experiments — silent placeholder
nodeGraphLiveModuleEvaluators.pixelGrid = () => ({});

// Under construction: Flex Grid — silent multi-out placeholder (Modulator)
nodeGraphLiveModuleEvaluators.flexGrid = () => ({ Out: 0, X: 0, Y: 0 });

// Under construction: Chaosfly — silent chaos placeholder
nodeGraphLiveModuleEvaluators.chaosfly = () => ({ Out: 0, X: 0, Y: 0, Z: 0 });

// Under construction: Drummer — silent Sequence placeholder
nodeGraphLiveModuleEvaluators.drummer = () => ({
  Out: 0,
  Kick: 0,
  Snare: 0,
  Hat: 0,
  Gate: 0,
});

// Under construction: Arp — silent Musical placeholder
nodeGraphLiveModuleEvaluators.arp = () => ({ Out: 0, Pitch: 0, Gate: 0 });

// Under construction: GM E.Piano (5) / Percussion (10) — silent Sample Player
nodeGraphLiveModuleEvaluators.ePiano = () => ({ Out: 0 });
nodeGraphLiveModuleEvaluators.percussion = () => ({ Out: 0 });
