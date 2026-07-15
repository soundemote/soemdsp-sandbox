// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphImpulseButtonState() {
  return {
    amplitude: 1,
    pulseSamples: 0,
  };
}


// Registers the offline/render-time dispatch handler for impulseButton into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.impulseButton = ({ runtime, nodeId }) => {
  const states = runtime.impulseButtonStates instanceof Map ? runtime.impulseButtonStates : new Map();
  runtime.impulseButtonStates = states;
  const state = states.get(nodeId) || createNodeGraphImpulseButtonState();
  states.set(nodeId, state);
  const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
  const amplitude = Math.max(0, Math.min(1, Number(state.amplitude ?? 1)));
  state.pulseSamples = Math.max(0, pulseSamples - 1);
  return { Pulse: pulseSamples > 0 ? amplitude : 0 };
};
