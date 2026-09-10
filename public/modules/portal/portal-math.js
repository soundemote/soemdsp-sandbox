// Portal I/O — lane-aware Mono / Left / Right. Missing jacks are not mixed.

function nodeGraphPortalLaneSpecOrTrio(type) {
  return typeof nodeGraphPortalLaneSpecFromType === "function"
    ? nodeGraphPortalLaneSpecFromType(type)
    : { hasMono: true, hasLeft: true, hasRight: true, ports: ["Mono", "Left", "Right"] };
}

function nodeGraphPortalReadWired(mixInput, nodeId, spec) {
  const m = spec.hasMono ? nodeGraphFiniteNumber(mixInput(nodeId, "Mono")) : 0;
  const l = spec.hasLeft ? nodeGraphFiniteNumber(mixInput(nodeId, "Left")) : 0;
  const r = spec.hasRight ? nodeGraphFiniteNumber(mixInput(nodeId, "Right")) : 0;
  return { m, l, r };
}

function nodeGraphPortalMixLanes(mixInput, nodeId, spec) {
  const { m, l, r } = nodeGraphPortalReadWired(mixInput, nodeId, spec);
  const left = (spec.hasMono ? m : 0) + (spec.hasLeft ? l : 0);
  const right = (spec.hasMono ? m : 0) + (spec.hasRight ? r : 0);
  let out = 0;
  if (spec.hasMono && spec.hasLeft && spec.hasRight) {
    out = m + (l + r) * 0.5;
  } else if (spec.hasLeft && spec.hasRight) {
    out = (left + right) * 0.5;
  } else if (spec.hasMono) {
    out = m;
  } else if (spec.hasLeft) {
    out = left;
  } else {
    out = right;
  }
  return { Left: left, Right: right, Out: out };
}

function nodeGraphPortalPublishLanes(mix, spec) {
  const left = nodeGraphFiniteNumber(mix?.Left);
  const right = nodeGraphFiniteNumber(mix?.Right);
  const mid = nodeGraphFiniteNumber(mix?.Out, (left + right)) * 0.5;
  const value = {};
  if (spec.hasMono) {
    value.Mono = mid;
    value.Out = mid;
  }
  if (spec.hasLeft) {
    value.Left = left;
  }
  if (spec.hasRight) {
    value.Right = right;
  }
  return value;
}

function nodeGraphPortalMixTrio(mixInput, nodeId, type) {
  const spec = nodeGraphPortalLaneSpecOrTrio(type);
  return nodeGraphPortalMixLanes(mixInput, nodeId, spec);
}

function nodeGraphPortalTrioOut(mix, type) {
  const spec = nodeGraphPortalLaneSpecOrTrio(type);
  return nodeGraphPortalPublishLanes(mix, spec);
}

function nodeGraphEvaluatePortalInlet(externalInput, type, nodeId, mixInput, frame) {
  const spec = nodeGraphPortalLaneSpecOrTrio(type);
  const live = typeof nodeGraphDspExternalStereoFrame === "function"
    ? nodeGraphDspExternalStereoFrame(externalInput, frame, 1)
    : { Left: 0, Right: 0, Out: 0 };
  const wired = nodeGraphPortalMixLanes(mixInput, nodeId, spec);
  const liveL = spec.hasLeft || spec.hasMono ? nodeGraphFiniteNumber(live.Left) : 0;
  const liveR = spec.hasRight || spec.hasMono ? nodeGraphFiniteNumber(live.Right) : 0;
  const liveM = spec.hasMono ? nodeGraphFiniteNumber(live.Out) : 0;
  return nodeGraphPortalPublishLanes({
    Left: liveL + wired.Left,
    Right: liveR + wired.Right,
    Out: liveM + wired.Out,
  }, spec);
}

function nodeGraphEvaluatePortalOutlet(type, nodeId, mixInput) {
  const spec = nodeGraphPortalLaneSpecOrTrio(type);
  return nodeGraphPortalPublishLanes(nodeGraphPortalMixLanes(mixInput, nodeId, spec), spec);
}

function nodeGraphPortalMixOutlets(nodes, mixInput, left, right) {
  let nextL = nodeGraphFiniteNumber(left);
  let nextR = nodeGraphFiniteNumber(right);
  if (!nodes) {
    return { left: nextL, right: nextR };
  }
  const list = typeof nodes.values === "function" ? nodes.values() : nodes;
  for (const node of list) {
    if (!node || node.bypassed) {
      continue;
    }
    const isOutlet = typeof nodeGraphPortalIsOutletType === "function"
      ? nodeGraphPortalIsOutletType(node.type)
      : node.type === "portalOutlet";
    if (!isOutlet) {
      continue;
    }
    const mix = nodeGraphPortalMixLanes(mixInput, node.id, nodeGraphPortalLaneSpecOrTrio(node.type));
    nextL += nodeGraphFiniteNumber(mix.Left);
    nextR += nodeGraphFiniteNumber(mix.Right);
  }
  return { left: nextL, right: nextR };
}
