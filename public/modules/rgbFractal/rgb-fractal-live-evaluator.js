// In → Out passthrough (visual field reads In as a soft breath on intensity).
nodeGraphLiveModuleEvaluators.rgbFractal = ({ runtime, nodeId, mixInput }) => {
  const value = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "In"),
    runtime,
    nodeId,
    null,
    "rgb fractal input",
  );
  return { Out: value };
};
