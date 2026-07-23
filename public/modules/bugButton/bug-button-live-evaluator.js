// Offline/render-time Bug Button interaction source. UI events update this
// node-id-keyed state through setNodeGraphBugButtonInteraction().
nodeGraphLiveModuleEvaluators.bugButton = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const states = runtime.bugButtonStates instanceof Map ? runtime.bugButtonStates : new Map();
  runtime.bugButtonStates = states;
  const state = states.get(nodeId) || {
    down: 0,
    downPulseSamples: 0,
    hover: 0,
    upPulseSamples: 0,
    x: 0,
    y: 0,
  };
  states.set(nodeId, state);
  const downPulseSamples = Math.max(0, Number(state.downPulseSamples) || 0);
  const upPulseSamples = Math.max(0, Number(state.upPulseSamples) || 0);
  state.downPulseSamples = Math.max(0, downPulseSamples - 1);
  state.upPulseSamples = Math.max(0, upPulseSamples - 1);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return {
    "Mouse Down": downPulseSamples > 0 ? 1 : 0,
    "Mouse Up": upPulseSamples > 0 ? 1 : 0,
    "Dn/Up": state.down ? 1 : 0,
    "Mouse Hover": state.hover ? 1 : 0,
    X: Math.max(-1, Math.min(1, Number(state.x) || 0)),
    Y: Math.max(-1, Math.min(1, Number(state.y) || 0)),
    __VisualSize: Math.max(0, Math.min(2, read("size", 1) + mixInput(nodeId, "Size"))),
    __VisualX: Math.max(-1, Math.min(1, read("xPosition", 0) + mixInput(nodeId, "X"))),
    __VisualY: Math.max(-1, Math.min(1, read("yPosition", 0) + mixInput(nodeId, "Y"))),
    __VisualOpacity: Math.max(0, Math.min(1, read("opacity", 1) + mixInput(nodeId, "Opacity"))),
  };
};
