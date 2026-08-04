// Registers the offline/render-time dispatch handler for nyquistShannon into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.nyquistShannon = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.nyquistShannonStates.get(nodeId) || createNodeGraphNyquistShannonState();
  runtime.nyquistShannonStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const nyquist = nodeGraphNyquistShannonSample({
    artifact: read("artifact", 0),
    enableToneModFreq: read("enableToneModFreq", 0),
    enableToneModNote: read("enableToneModNote", 0),
    enableToneModPitch: read("enableToneModPitch", 1),
    frequencyA: read("frequencyA", 440),
    frequencyB: read("frequencyB", 5),
    midiNoteRaw: read("midiNoteRaw", 48),
    phaseOffset: read("phaseOffset", 0),
    rate: read("rate", 20),
    reset: mixInput(nodeId, "Reset"),
    sampleDots: read("sampleDots", 0),
    sampleRate,
    state,
    subPhase: read("subPhase", 0),
    subPhaseRotationSpeed: read("subPhaseRotationSpeed", 0),
    tone: read("tone", 0),
    toneSmoothTime: read("toneSmoothTime", 0.01),
  });
  const nyquistLevel = read("amplitude", 1);
  return {
    X: nyquist.x * nyquistLevel,
    Y: nyquist.y * nyquistLevel,
  };
};
