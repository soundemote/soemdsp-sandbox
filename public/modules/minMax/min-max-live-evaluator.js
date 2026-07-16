// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphMinMaxSample(values, connectedMask, runtime = null, nodeId = "") {
  let have = false;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 4; i++) {
    if (!(connectedMask & (1 << i))) continue;
    const v = nodeGraphSafeFilterNumber(values[i], runtime, nodeId, null, "min/max input");
    if (!have) {
      lo = v;
      hi = v;
      have = true;
    } else {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return {
    Max: nodeGraphSafeFilterNumber(have ? hi : 0, runtime, nodeId, null, "min/max max"),
    Min: nodeGraphSafeFilterNumber(have ? lo : 0, runtime, nodeId, null, "min/max min"),
  };
}

// Registers the offline/render-time dispatch handler for minMax into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Follows the same extraction pattern as comparator's live evaluator.
nodeGraphLiveModuleEvaluators.minMax = ({ runtime, node, nodeId, mixInput, hasInput }) => {
  const ports = ["In 1", "In 2", "In 3", "In 4"];
  const values = ports.map((port) => mixInput(nodeId, port));
  let connectedMask = 0;
  ports.forEach((port, i) => {
    if (hasInput(nodeId, port)) connectedMask |= (1 << i);
  });
  return nodeGraphMinMaxSample(values, connectedMask, runtime, nodeId);
};
