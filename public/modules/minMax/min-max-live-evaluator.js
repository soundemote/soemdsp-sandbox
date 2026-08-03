// Min/Max — offline/render. Pure core: min-max-math.js.

nodeGraphLiveModuleEvaluators.minMax = ({ runtime, nodeId, mixInput, hasInput }) => {
  const ports = ["In 1", "In 2", "In 3", "In 4"];
  const values = ports.map((port) =>
    nodeGraphSafeFilterNumber(mixInput(nodeId, port), runtime, nodeId, null, "min/max input"),
  );
  let connectedMask = 0;
  ports.forEach((port, i) => {
    if (hasInput(nodeId, port)) connectedMask |= (1 << i);
  });
  const out = nodeGraphMinMaxCore(values, connectedMask);
  return {
    Max: nodeGraphSafeFilterNumber(out.Max, runtime, nodeId, null, "min/max max"),
    Min: nodeGraphSafeFilterNumber(out.Min, runtime, nodeId, null, "min/max min"),
  };
};
