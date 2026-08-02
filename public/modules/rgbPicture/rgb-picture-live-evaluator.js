// In → Out passthrough.
nodeGraphLiveModuleEvaluators.rgbPicture = ({ runtime, nodeId, mixInput }) => {
  const value = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "In"),
    runtime,
    nodeId,
    null,
    "rgb picture input",
  );
  return { Out: value };
};
