// Offline/render-time dispatch handler for xyPad, self-registering into
// nodeGraphLiveModuleEvaluators (see node-graph-live-frame-evaluator.js).
// X/Y/Gate come from the module's own parameters (driven by the pad UI);
// Spike shares the nodeId-keyed impulse pulse map with impulseButton.

function nodeGraphXyPadEvaluatorQuantize(value, quantize, phase) {
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  const divisions = q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
  if (divisions <= 1) {
    return Math.max(0, Math.min(1, value));
  }
  const step = 1 / divisions;
  const offset = Math.max(0, Math.min(1, Number(phase) || 0)) * step;
  return Math.max(0, Math.min(1, Math.round((value - offset) / step) * step + offset));
}

nodeGraphLiveModuleEvaluators.xyPad = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const states = runtime.impulseButtonStates instanceof Map ? runtime.impulseButtonStates : new Map();
  runtime.impulseButtonStates = states;
  const state = states.get(nodeId) || { amplitude: 1, pulseSamples: 0 };
  states.set(nodeId, state);
  const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
  state.pulseSamples = Math.max(0, pulseSamples - 1);
  // X In / Y In are CV offsets: added to the pad position, clamped inside
  // the quantizer, so external signals can sweep or wobble the pad point.
  return {
    X: nodeGraphXyPadEvaluatorQuantize(read("x", 0.5) + mixInput(nodeId, "X In"), read("xQuantize", 0), read("xPhase", 0)),
    Y: nodeGraphXyPadEvaluatorQuantize(read("y", 0.5) + mixInput(nodeId, "Y In"), read("yQuantize", 0), read("yPhase", 0)),
    Gate: read("gate", 0) > 0.5 ? 1 : 0,
    Spike: pulseSamples > 0 ? 1 : 0,
  };
};
