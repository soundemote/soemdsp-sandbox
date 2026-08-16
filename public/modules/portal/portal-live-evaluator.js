nodeGraphLiveModuleEvaluators.portalInlet = ({ runtime, nodeId, frame, mixInput }) => {
  const live = typeof nodeGraphDspExternalStereoFrame === "function"
    ? nodeGraphDspExternalStereoFrame(runtime.externalInput, frame, 1)
    : { Left: 0, Right: 0, Out: 0 };
  if (typeof nodeGraphDspSandboxIoFrame === "function") {
    return nodeGraphDspSandboxIoFrame(
      live,
      mixInput(nodeId, "Mono"),
      mixInput(nodeId, "Left"),
      mixInput(nodeId, "Right"),
    );
  }
  const wired = typeof nodeGraphPortalMixTrio === "function"
    ? nodeGraphPortalMixTrio(mixInput, nodeId)
    : { Left: 0, Right: 0, Out: 0 };
  return {
    Left: (Number(live.Left) || 0) + (Number(wired.Left) || 0),
    Mono: (Number(live.Out) || 0) + (Number(wired.Out) || 0),
    Out: (Number(live.Out) || 0) + (Number(wired.Out) || 0),
    Right: (Number(live.Right) || 0) + (Number(wired.Right) || 0),
  };
};

nodeGraphLiveModuleEvaluators.portalOutlet = ({ nodeId, mixInput }) => {
  const mix = typeof nodeGraphPortalMixTrio === "function"
    ? nodeGraphPortalMixTrio(mixInput, nodeId)
    : { Left: mixInput(nodeId, "Left"), Right: mixInput(nodeId, "Right"), Out: mixInput(nodeId, "Mono") };
  return typeof nodeGraphPortalTrioOut === "function"
    ? nodeGraphPortalTrioOut(mix)
    : { Left: mix.Left, Mono: mix.Out, Out: mix.Out, Right: mix.Right };
};
