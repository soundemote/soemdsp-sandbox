// Registers the offline/render-time dispatch handler for gainBias into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
//
// Gain and Bias in one module: scale first, then offset (out = in * amount +
// offset). That order is what makes the pair useful -- offsetting after the
// scale means the Offset control is the final resting centre of the signal
// regardless of Amplitude, which is how you fit a signal into a range. The
// Left/Right handling mirrors the Gain and Bias modules exactly: the mono
// input sums into each side before the scale.
//
// Keep this body in step with the gainBias branch in
// node-live-audio-worklet-core.js -- sibling execution lanes must produce
// identical output for identical input.
nodeGraphLiveModuleEvaluators.gainBias = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const gainAmount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 1, frame, frames, frameValues);
  const biasOffset = readNodeGraphLiveEffectiveParam(runtime, node, "offset", 0, frame, frames, frameValues);
  const mono = mixInput(nodeId);
  return {
    Out: mono * gainAmount + biasOffset,
    Left: (mixInput(nodeId, "Left") + mono) * gainAmount + biasOffset,
    Right: (mixInput(nodeId, "Right") + mono) * gainAmount + biasOffset,
  };
};
