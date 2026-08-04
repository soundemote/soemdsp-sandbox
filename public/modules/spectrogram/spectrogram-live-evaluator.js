// Spectrogram — offline/render: dry Thru passthrough (face uses visual buffer).

nodeGraphLiveModuleEvaluators.spectrogram = ({ runtime, nodeId, mixInput }) => {
  const raw = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "In"),
    runtime,
    nodeId,
    null,
    "spectrogram in",
  );
  return { Thru: raw };
};
