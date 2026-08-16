// Output + Plugin Output share stereo bus sum.
nodeGraphLiveModuleEvaluators.output = ({ nodeId, mixInput }) => {
  const mix = nodeGraphDspStereoMix(
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
  );
  return typeof nodeGraphDspSandboxIoTrio === "function"
    ? nodeGraphDspSandboxIoTrio(mix)
    : { Left: mix.Left, Mono: mix.Out, Out: mix.Out, Right: mix.Right };
};
