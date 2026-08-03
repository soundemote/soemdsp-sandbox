// Knob (knob): Bias/Out = In + offset. Shared with pluginSlider via control-bus helpers.
nodeGraphLiveModuleEvaluators.knob = ({
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
  return nodeGraphDspBiasFromIn(offset, mixInput?.(nodeId, "In"));
};
