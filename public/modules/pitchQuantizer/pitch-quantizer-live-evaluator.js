// Offline/render-time pitch quantizer — uses face scaleMask when Scale jack
// is empty; Scale jack overrides when connected.

nodeGraphLiveModuleEvaluators.pitchQuantizer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput }) => {
  const state = runtime.pitchQuantizerStates.get(nodeId) || createNodeGraphPitchQuantizerState();
  runtime.pitchQuantizerStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const hasScale = hasInput(nodeId, "Scale");
  const scaleMask = hasScale
    ? undefined
    : (
      node?.params?.scaleMask != null
        ? node.params.scaleMask
        : (typeof nodeGraphPitchQuantizerMaskForNode === "function"
          ? nodeGraphPitchQuantizerMaskForNode(node)
          : undefined)
    );
  return {
    "0.1V/Oct": nodeGraphPitchQuantizerSample(state, {
      hasScaleInput: hasScale,
      pitch: mixInput(nodeId, "0.1V/Oct"),
      scaleChoice: read("scale", 1),
      scaleInput: mixInput(nodeId, "Scale"),
      scaleMask,
    }),
  };
};
