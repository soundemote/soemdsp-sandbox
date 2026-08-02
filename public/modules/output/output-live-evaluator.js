// Output + Plugin Output share stereo bus sum.
nodeGraphLiveModuleEvaluators.output = ({ nodeId, mixInput }) =>
  nodeGraphDspStereoMix(
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
  );
