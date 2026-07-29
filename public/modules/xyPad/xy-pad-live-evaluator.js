// Offline/render-time xyPad evaluator.
// Same path as live outs / phosphor: bipolar(Phase)+CV → lattice (Papoulis dry offline).

nodeGraphLiveModuleEvaluators.xyPad = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const states = runtime.impulseButtonStates instanceof Map ? runtime.impulseButtonStates : new Map();
  runtime.impulseButtonStates = states;
  const state = states.get(nodeId) || { amplitude: 1, pulseSamples: 0 };
  states.set(nodeId, state);
  const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
  state.pulseSamples = Math.max(0, pulseSamples - 1);

  const rawMouseX = Number(read("x", read("xPhase", 0.5)));
  const rawMouseY = Number(read("y", read("yPhase", 0.5)));
  // Do not use `n || 0.5` — that maps legitimate edge 0 to center.
  const mouseX = Math.max(0, Math.min(1, Number.isFinite(rawMouseX) ? rawMouseX : 0.5));
  const mouseY = Math.max(0, Math.min(1, Number.isFinite(rawMouseY) ? rawMouseY : 0.5));
  const sigX = nodeGraphXyPadDspUnitToBipolar(mouseX) + (Number(mixInput(nodeId, "X")) || 0);
  const sigY = nodeGraphXyPadDspUnitToBipolar(mouseY) + (Number(mixInput(nodeId, "Y")) || 0);

  // Offline has no papoulis_filter.wasm — treat Papoulis as dry (lattice still applies).
  const cutoff = 0;
  const order = Math.max(0, Math.min(1, Math.round(Number(read("filterOrder", 0)) || 0)));
  const qX = read("xQuantize", 0);
  const qY = read("yQuantize", 0);

  return {
    X: nodeGraphXyPadDspProcessAxis(sigX, {
      cutoff,
      order,
      quantizeAmt: qX,
      filterSample: null,
    }),
    Y: nodeGraphXyPadDspProcessAxis(sigY, {
      cutoff,
      order,
      quantizeAmt: qY,
      filterSample: null,
    }),
    Gate: read("gate", 0) > 0.5 ? 1 : 0,
    Spike: pulseSamples > 0 ? (Number(state.amplitude) || 1) : 0,
  };
};
