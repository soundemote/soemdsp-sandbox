nodeGraphLiveModuleEvaluators.portalInlet = ({ runtime, node, frame }) => {
  const stereo = typeof nodeGraphDspExternalStereoFrame === "function"
    ? nodeGraphDspExternalStereoFrame(runtime.externalInput, frame, 1)
    : { Left: 0, Right: 0, Out: 0 };
  const channel = typeof nodeGraphPortalChannelFromNode === "function"
    ? nodeGraphPortalChannelFromNode(node)
    : 0;
  const sample = typeof nodeGraphPortalPickChannel === "function"
    ? nodeGraphPortalPickChannel(stereo, channel)
    : (channel === 1 ? stereo.Right : stereo.Left);
  return { Out: sample };
};

nodeGraphLiveModuleEvaluators.portalOutlet = ({ nodeId, mixInput }) => ({
  In: mixInput(nodeId, "In"),
});
