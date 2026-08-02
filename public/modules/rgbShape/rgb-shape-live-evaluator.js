// In → Out passthrough (visual face reads params + optional In level offline).
nodeGraphLiveModuleEvaluators.rgbShape = ({ runtime, nodeId, mixInput }) => {
  const value = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "In"),
    runtime,
    nodeId,
    null,
    "rgb shape input",
  );
  return { Out: value };
};
