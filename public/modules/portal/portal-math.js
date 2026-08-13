const NODE_GRAPH_PORTAL_CHANNEL_MAX = 31;

function nodeGraphPortalClampChannel(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(NODE_GRAPH_PORTAL_CHANNEL_MAX, n));
}

function nodeGraphPortalChannelFromNode(node) {
  return nodeGraphPortalClampChannel(node?.params?.channel ?? node?.portal?.channel ?? 0);
}

function nodeGraphPortalPickChannel(stereo, channel) {
  const ch = nodeGraphPortalClampChannel(channel);
  if (!stereo || typeof stereo !== "object") {
    return 0;
  }
  if (ch === 1) {
    return Number(stereo.Right) || 0;
  }
  if (ch === 2) {
    return Number(stereo.Out) || ((Number(stereo.Left) || 0) + (Number(stereo.Right) || 0)) * 0.5;
  }
  if (ch === 0) {
    return Number(stereo.Left) || 0;
  }
  return 0;
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
    const sample = Number(mixInput(node.id, "In")) || 0;
    const ch = nodeGraphPortalChannelFromNode(node);
    if (ch === 1) {
      nextR += sample;
    } else if (ch === 2) {
      nextL += sample;
      nextR += sample;
    } else if (ch === 0) {
      nextL += sample;
    }
  }
  return { left: nextL, right: nextR };
}
