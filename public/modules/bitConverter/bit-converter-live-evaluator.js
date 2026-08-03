// Bit Converter — offline/render. Pure math: bit-converter-math.js.

nodeGraphLiveModuleEvaluators.bitConverter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const bits = readNodeGraphLiveEffectiveParam(runtime, node, "bits", 53, frame, frames, frameValues);
  return nodeGraphBitConverterSample(
    bits,
    mixInput(nodeId, "Full Scale"),
    mixInput(nodeId, "Unipolar"),
    mixInput(nodeId, "Bipolar"),
  );
};
