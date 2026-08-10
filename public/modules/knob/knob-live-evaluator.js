// Knob (knob): Bias/Out = In + offset. Range from Max + Polarity (uni/bi).
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
  const rangeMax = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "rangeMax",
    1,
    frame,
    frames,
    frameValues,
  );
  const polarity = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "polarity",
    0,
    frame,
    frames,
    frameValues,
  );
  const range = typeof nodeGraphDspKnobBiasRange === "function"
    ? nodeGraphDspKnobBiasRange(rangeMax, polarity)
    : { min: 0, max: 1 };
  return nodeGraphDspBiasFromIn(offset, mixInput?.(nodeId, "In"), range.min, range.max);
};
