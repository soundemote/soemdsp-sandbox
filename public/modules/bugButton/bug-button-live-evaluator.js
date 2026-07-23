// Registers the offline/render-time dispatch handler for bugButton into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Identical mechanics to impulseButton's evaluator -- the pulse states map is
// nodeId-keyed, so both types share runtime.impulseButtonStates safely -- the
// only differences are the output port name (Spike) and the fixed amplitude.
nodeGraphLiveModuleEvaluators.bugButton = ({ runtime, nodeId }) => {
  const states = runtime.impulseButtonStates instanceof Map ? runtime.impulseButtonStates : new Map();
  runtime.impulseButtonStates = states;
  const state = states.get(nodeId) || { amplitude: 1, pulseSamples: 0 };
  states.set(nodeId, state);
  const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
  const amplitude = Math.max(0, Math.min(1, Number(state.amplitude ?? 1)));
  state.pulseSamples = Math.max(0, pulseSamples - 1);
  return { Spike: pulseSamples > 0 ? amplitude : 0 };
};
