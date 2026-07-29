// Offline/render-time xyPad evaluator — same shared-smoother contract as worklet.

function nodeGraphXyPadEvaluatorQuantize(value, quantize) {
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  const divisions = q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
  const v = Number(value);
  const unit = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  if (divisions <= 1) {
    return unit;
  }
  const step = 1 / divisions;
  return Math.max(0, Math.min(1, Math.round(unit / step) * step));
}

function nodeGraphXyPadUnitToBipolar(unit) {
  const u = Number(unit);
  return Number.isFinite(u) ? u * 2 - 1 : 0;
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

  let unitX = read("x", read("xPhase", 0.5));
  let unitY = read("y", read("yPhase", 0.5));
  const mode = Math.max(0, Math.min(2, Math.round(Number(read("quantizeInput", 0)) || 0)));
  if (mode === 1) {
    unitX = nodeGraphXyPadEvaluatorQuantize(unitX, read("xQuantize", 0));
    unitY = nodeGraphXyPadEvaluatorQuantize(unitY, read("yQuantize", 0));
  } else {
    unitX = Math.max(0, Math.min(1, Number(unitX) || 0.5));
    unitY = Math.max(0, Math.min(1, Number(unitY) || 0.5));
  }

  return {
    X: nodeGraphXyPadUnitToBipolar(unitX) + (Number(mixInput(nodeId, "X")) || 0),
    Y: nodeGraphXyPadUnitToBipolar(unitY) + (Number(mixInput(nodeId, "Y")) || 0),
    Gate: read("gate", 0) > 0.5 ? 1 : 0,
    Spike: pulseSamples > 0 ? (Number(state.amplitude) || 1) : 0,
  };
};
