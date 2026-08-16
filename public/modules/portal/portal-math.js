// Portal I/O — Sandbox 3-channel bus (Mono, Left, Right). No channel picker.

function nodeGraphPortalMixTrio(mixInput, nodeId) {
  if (typeof nodeGraphDspStereoMix === "function") {
    return nodeGraphDspStereoMix(
      mixInput(nodeId, "Mono"),
      mixInput(nodeId, "Left"),
      mixInput(nodeId, "Right"),
    );
  }
  const m = Number(mixInput(nodeId, "Mono")) || 0;
  const l = Number(mixInput(nodeId, "Left")) || 0;
  const r = Number(mixInput(nodeId, "Right")) || 0;
  return { Left: m + l, Right: m + r, Out: m + (l + r) * 0.5 };
}

function nodeGraphPortalTrioOut(mix) {
  if (typeof nodeGraphDspSandboxIoTrio === "function") {
    return nodeGraphDspSandboxIoTrio(mix);
  }
  const left = Number(mix?.Left) || 0;
  const right = Number(mix?.Right) || 0;
  const mono = Number(mix?.Out) || (left + right) * 0.5;
  return { Left: left, Mono: mono, Out: mono, Right: right };
}

function nodeGraphPortalMixOutlets(nodes, mixInput, left, right) {
  let nextL = Number(left) || 0;
  let nextR = Number(right) || 0;
  if (!nodes) {
    return { left: nextL, right: nextR };
  }
  const list = typeof nodes.values === "function" ? nodes.values() : nodes;
  for (const node of list) {
    if (!node || node.type !== "portalOutlet" || node.bypassed) {
      continue;
    }
    const mix = nodeGraphPortalMixTrio(mixInput, node.id);
    nextL += Number(mix.Left) || 0;
    nextR += Number(mix.Right) || 0;
  }
  return { left: nextL, right: nextR };
}
