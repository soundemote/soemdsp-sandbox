// Registers the offline/render-time dispatch handler for bradley2a into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.bradley2a = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.bradley2AStates.get(nodeId) || createNodeGraphBradley2AState();
  runtime.bradley2AStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphBradley2ASample(
    state,
    {
      carrierFreq: read("carrierFreq", 1004),
      freqOffset: read("freqOffset", 0),
      jitterDepth: read("jitterDepth", 0),
      jitterRate: read("jitterRate", 60),
      ampDepth: read("ampDepth", 0),
      ampRate: read("ampRate", 40),
      interfLevel: read("interfLevel", 0),
      interfFreq: read("interfFreq", 2600),
      harm2: read("harm2", 0),
      harm3: read("harm3", 0),
      hitRate: read("hitRate", 1),
      hitDuration: read("hitDuration", 0.005),
      hitGain: read("hitGain", 1),
      hitPhase: read("hitPhase", 0),
      impulseLevel: read("impulseLevel", 0),
      level: read("amplitude", 1),
    },
    sampleRate,
  );
};
