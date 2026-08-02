// Registers the offline/render-time dispatch handler for valueSlider into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
// Final Bias/Out = signal In + effective slider (offset). Unwired In = 0.
nodeGraphLiveModuleEvaluators.valueSlider = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const offset = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "offset",
    0,
    frame,
    frames,
    frameValues,
  );
  const input = Number(mixInput?.(nodeId, "In")) || 0;
  const value = input + offset;
  return { Bias: value, Out: value, offset };
};
