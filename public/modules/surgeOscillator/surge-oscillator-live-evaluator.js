// Registers the offline/render-time dispatch handler for surgeOscillator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.surgeOscillator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.surgeOscillatorStates.get(nodeId) || createNodeGraphSurgeOscillatorState();
  runtime.surgeOscillatorStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const baseFrequency = Math.max(0, read("frequency", 100));
  const pitchInput = clampNodeSliderValue(nodeGraphSafeFilterNumber(
    mixInput(nodeId, "0.1V/Oct"),
    runtime,
    nodeId,
    0,
    "hard sync oscillator 0.1v input",
  ), -10, 10);
  const frequencyHz = (typeof nodeGraphPitchedFrequency === "function" ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, 0) : Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1))));
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(frequencyHz, fHz)
    : frequencyHz;
  return nodeGraphSurgeOscillatorSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    syncIn: mixInput(nodeId, "Sync"),
    hasExternalSync: hasInput(nodeId, "Sync"),
    syncFrequencyHz: read("syncFrequency", 50),
    waveform: read("waveform", 0),
    level: read("level", 1),
  });
};
