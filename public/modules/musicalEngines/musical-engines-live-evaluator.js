// Live/offline dispatch for musical experiment modules + spruced glue.

function nodeGraphMusicalReadScaleMask(runtime, node, frame, frames, frameValues, hasInput, mixInput, nodeId) {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : false;
  const scaleChoice = read("scale", 1);
  const preset = typeof nodeGraphPitchQuantizerMaskFromChoice === "function"
    ? nodeGraphPitchQuantizerMaskFromChoice(scaleChoice)
    : 2741;
  return {
    hasScaleInput: hasScale,
    scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
    scaleMask: preset,
    root: (() => {
      const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : false;
      if (hasRoot) return mixInput(nodeId, "Root");
      return 60 / 120;
    })(),
  };
}

nodeGraphLiveModuleEvaluators.degreeTuring = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput }) => {
  if (!runtime.degreeTuringStates) runtime.degreeTuringStates = new Map();
  const state = runtime.degreeTuringStates.get(nodeId) || createNodeGraphDegreeTuringState();
  runtime.degreeTuringStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const scale = nodeGraphMusicalReadScaleMask(runtime, node, frame, frames, frameValues, hasInput, mixInput, nodeId);
  return nodeGraphDegreeTuringSample(state, {
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    length: read("length", 8),
    probability: read("probability", 0.18),
    octaves: read("octaves", 1),
    level: read("level", 1),
    ...scale,
  });
};

nodeGraphLiveModuleEvaluators.gravityWalker = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput }) => {
  if (!runtime.gravityWalkerStates) runtime.gravityWalkerStates = new Map();
  const state = runtime.gravityWalkerStates.get(nodeId) || createNodeGraphGravityWalkerState();
  runtime.gravityWalkerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const scale = nodeGraphMusicalReadScaleMask(runtime, node, frame, frames, frameValues, hasInput, mixInput, nodeId);
  return nodeGraphGravityWalkerSample(state, {
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    leap: read("leap", 0.15),
    leapCv: mixInput(nodeId, "Leap"),
    gravity: read("gravity", 0.65),
    octaves: read("octaves", 1),
    level: read("level", 1),
    ...scale,
  });
};

nodeGraphLiveModuleEvaluators.degreePhrase = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput }) => {
  if (!runtime.degreePhraseStates) runtime.degreePhraseStates = new Map();
  const state = runtime.degreePhraseStates.get(nodeId) || createNodeGraphDegreePhraseState();
  runtime.degreePhraseStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const scale = nodeGraphMusicalReadScaleMask(runtime, node, frame, frames, frameValues, hasInput, mixInput, nodeId);
  return nodeGraphDegreePhraseSample(state, {
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    steps: read("steps", 8),
    mutate: read("mutate", 0.08),
    octaves: read("octaves", 1),
    level: read("level", 1),
    step1: read("step1", 0),
    step2: read("step2", 0.25),
    step3: read("step3", 0.5),
    step4: read("step4", 0.15),
    step5: read("step5", 0.75),
    step6: read("step6", 0.4),
    step7: read("step7", 0.6),
    step8: read("step8", 0),
    rest1: read("rest1", 0),
    rest2: read("rest2", 0),
    rest3: read("rest3", 0),
    rest4: read("rest4", 1),
    rest5: read("rest5", 0),
    rest6: read("rest6", 0),
    rest7: read("rest7", 1),
    rest8: read("rest8", 0),
    ...scale,
  });
};

nodeGraphLiveModuleEvaluators.noteGlide = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.noteGlideStates) runtime.noteGlideStates = new Map();
  const state = runtime.noteGlideStates.get(nodeId) || createNodeGraphNoteGlideState();
  runtime.noteGlideStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphNoteGlideSample(state, {
    pitch: mixInput(nodeId, "0.1V/Oct"),
    time: read("time", 0.05),
  }, sampleRate);
};

nodeGraphLiveModuleEvaluators.noteTranspose = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphNoteTransposeSample({
    pitch: mixInput(nodeId, "0.1V/Oct"),
    semitones: read("semitones", 0),
    octaves: read("octaves", 0),
  });
};

// Spruced existing modules — override their live evaluators with param-aware paths.
nodeGraphLiveModuleEvaluators.chordMemory = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.chordMemoryStates.get(nodeId) || createNodeGraphChordMemoryState();
  runtime.chordMemoryStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphChordMemorySample(state, {
    advance: mixInput(nodeId, "Advance"),
    clear: mixInput(nodeId, "Clear"),
    latch: mixInput(nodeId, "Latch"),
    pitch: mixInput(nodeId, "Pitch"),
    walk: read("walk", 1),
    leap: read("leap", 0.15),
    mutate: read("mutate", 0.2),
    octaves: read("octaves", 0),
  });
};

nodeGraphLiveModuleEvaluators.turingMachine = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput }) => {
  const state = runtime.turingMachineStates.get(nodeId) || createNodeGraphTuringMachineState();
  runtime.turingMachineStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : false;
  const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : false;
  return nodeGraphTuringMachineSample(state, {
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    length: read("length", 8),
    level: read("level", 1),
    probability: read("probability", 0.25),
    octaves: read("octaves", 1),
    hasScaleInput: hasScale,
    scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
    root: hasRoot ? mixInput(nodeId, "Root") : (60 / 120),
  });
};

nodeGraphLiveModuleEvaluators.chordSequencer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.chordSequencerStates.get(nodeId) || createNodeGraphChordSequencerState();
  runtime.chordSequencerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphChordSequencerSample(state, {
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    progression: read("progression", 0),
    direction: read("direction", 0),
    key: read("key", 0),
    level: read("level", 1),
  });
};
