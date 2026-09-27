// Named wireless Portal In / Portal Out. Title (alias) is the bus name.
// Jack I/O labels use that same title. Jack/wire color follows the cable into Portal In;
// Portal Out mirrors matched In for title and color. Each owner is its own universe
// (root vs each Metamodule).

function nodeGraphIsNamedPortalInType(type) {
  return String(type || "") === "namedPortalIn";
}

function nodeGraphIsNamedPortalOutType(type) {
  return String(type || "") === "namedPortalOut";
}

function nodeGraphIsNamedPortalType(type) {
  return nodeGraphIsNamedPortalInType(type) || nodeGraphIsNamedPortalOutType(type);
}

function nodeGraphNamedPortalBusKey(node) {
  const raw = typeof normalizeNodeGraphPatchNodeAlias === "function"
    ? normalizeNodeGraphPatchNodeAlias(node?.alias)
    : String(node?.alias || "").trim();
  return String(raw || "").trim().toLowerCase();
}

function nodeGraphNamedPortalUniverse(node) {
  return String(node?.ownerMetamoduleId || "").trim();
}

function nodeGraphNamedPortalNodeFromPatch(nodeId, patch = null) {
  const id = String(nodeId || "");
  if (!id) return null;
  if (patch && Array.isArray(patch.nodes)) {
    return patch.nodes.find((node) => node && String(node.id) === id) || null;
  }
  if (typeof nodeGraphPatchNode === "function") {
    return nodeGraphPatchNode(id);
  }
  const live = typeof nodeGraphMvp === "object" ? nodeGraphMvp?.patch : null;
  if (live && Array.isArray(live.nodes)) {
    return live.nodes.find((node) => node && String(node.id) === id) || null;
  }
  return null;
}

/** Direct cable source that paints a Portal In (or the In behind a Portal Out). */
function nodeGraphNamedPortalColorSource(nodeId, patch = null) {
  const live = patch || (typeof nodeGraphMvp === "object" ? nodeGraphMvp?.patch : null);
  const node = nodeGraphNamedPortalNodeFromPatch(nodeId, live);
  if (!node || !nodeGraphIsNamedPortalType(node.type)) {
    return null;
  }
  const connections = Array.isArray(live?.connections) ? live.connections : [];
  const incomingSource = (portalInId) => {
    for (let i = 0; i < connections.length; i += 1) {
      const c = connections[i];
      if (!c || String(c.destinationNode || "") !== String(portalInId)) continue;
      const src = String(c.sourceNode || "");
      const port = String(c.sourcePort || "");
      if (!src || !port) continue;
      return { nodeId: src, port, io: "output" };
    }
    return null;
  };
  if (nodeGraphIsNamedPortalInType(node.type)) {
    return incomingSource(node.id);
  }
  const key = nodeGraphNamedPortalBusKey(node);
  const universe = nodeGraphNamedPortalUniverse(node);
  if (!key) return null;
  const nodes = Array.isArray(live?.nodes) ? live.nodes : [];
  for (let i = 0; i < nodes.length; i += 1) {
    const other = nodes[i];
    if (
      !other
      || other.bypassed
      || !nodeGraphIsNamedPortalInType(other.type)
      || nodeGraphNamedPortalUniverse(other) !== universe
      || nodeGraphNamedPortalBusKey(other) !== key
    ) {
      continue;
    }
    const src = incomingSource(other.id);
    if (src) return src;
  }
  return null;
}

/**
 * Rename every named portal on the same bus (universe + prior key) to nextAlias.
 * Returns changed node ids.
 */
function nodeGraphNamedPortalSyncBusAlias(patch, fromNodeId, nextAlias) {
  if (!patch || !Array.isArray(patch.nodes)) return [];
  const from = nodeGraphNamedPortalNodeFromPatch(fromNodeId, patch);
  if (!from || !nodeGraphIsNamedPortalType(from.type)) return [];
  const oldKey = nodeGraphNamedPortalBusKey(from);
  const universe = nodeGraphNamedPortalUniverse(from);
  const next = typeof normalizeNodeGraphPatchNodeAlias === "function"
    ? normalizeNodeGraphPatchNodeAlias(nextAlias)
    : String(nextAlias || "").trim();
  if (!next || !oldKey) return [];
  const changed = [];
  for (let i = 0; i < patch.nodes.length; i += 1) {
    const node = patch.nodes[i];
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (nodeGraphNamedPortalUniverse(node) !== universe) continue;
    if (nodeGraphNamedPortalBusKey(node) !== oldKey) continue;
    if (String(node.alias || "") === next) continue;
    node.alias = next;
    changed.push(String(node.id));
  }
  return changed;
}

/**
 * @deprecated Title is user-driven (module alias); wiring no longer renames the bus
 * from the source outlet. Kept as no-op shim for any stale callers.
 */
function nodeGraphNamedPortalSyncAliasFromSource(_patch, _portalInId, _sourceNodeId, _sourcePort) {
  return [];
}

/** @deprecated Destination-inlet naming was never used. No-op shim. */
function nodeGraphNamedPortalSyncAliasFromDestination(_patch, _portalOutId, _destNodeId, _destPort) {
  return [];
}

/** Re-apply jack chrome + header title after wire edits (wireEdit skips full DOM). */
function nodeGraphNamedPortalRefreshModules(nodeIds) {
  const ids = [...new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 1) {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(ids[i]) : null;
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (typeof applyNodeGraphModuleElementFromPatch === "function") {
      applyNodeGraphModuleElementFromPatch(node);
    }
  }
}

/** All named portal ids that may need chrome refresh after a wire change. */
function nodeGraphNamedPortalIdsTouchedByWire(patch, sourceNode, destinationNode) {
  const live = patch || (typeof nodeGraphMvp === "object" ? nodeGraphMvp?.patch : null);
  const ids = new Set();
  const consider = (nodeId) => {
    const node = nodeGraphNamedPortalNodeFromPatch(nodeId, live);
    if (!node || !nodeGraphIsNamedPortalType(node.type)) return;
    const key = nodeGraphNamedPortalBusKey(node);
    const universe = nodeGraphNamedPortalUniverse(node);
    const nodes = Array.isArray(live?.nodes) ? live.nodes : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const other = nodes[i];
      if (!other || !nodeGraphIsNamedPortalType(other.type)) continue;
      if (nodeGraphNamedPortalUniverse(other) !== universe) continue;
      if (key && nodeGraphNamedPortalBusKey(other) === key) {
        ids.add(String(other.id));
      } else if (String(other.id) === String(node.id)) {
        ids.add(String(other.id));
      }
    }
  };
  consider(sourceNode);
  consider(destinationNode);
  return [...ids];
}

function nodeGraphNamedPortalPairs(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const ins = [];
  const outs = [];
  for (const node of list) {
    if (!node || node.bypassed) {
      continue;
    }
    const key = nodeGraphNamedPortalBusKey(node);
    if (!key) {
      continue;
    }
    const universe = nodeGraphNamedPortalUniverse(node);
    if (nodeGraphIsNamedPortalInType(node.type)) {
      ins.push({ node, key, universe });
    } else if (nodeGraphIsNamedPortalOutType(node.type)) {
      outs.push({ node, key, universe });
    }
  }
  const pairs = [];
  for (const inn of ins) {
    for (const out of outs) {
      if (
        inn.key === out.key
        && inn.universe === out.universe
        && inn.node.id !== out.node.id
      ) {
        pairs.push({
          sourceId: inn.node.id,
          destId: out.node.id,
          key: inn.key,
          universe: inn.universe,
        });
      }
    }
  }
  return pairs;
}

function nodeGraphNamedPortalWouldFeedback(patch, extraConnections = []) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const adj = new Map();
  const addEdge = (src, dst) => {
    const s = String(src || "");
    const d = String(dst || "");
    if (!s || !d || s === d) {
      return;
    }
    const list = adj.get(s) || [];
    list.push(d);
    adj.set(s, list);
  };
  for (const connection of [...(patch?.connections || []), ...extraConnections]) {
    addEdge(connection.sourceNode, connection.destinationNode);
  }
  for (const pair of nodeGraphNamedPortalPairs(nodes)) {
    addEdge(pair.sourceId, pair.destId);
  }
  for (const node of nodes) {
    if (!nodeGraphIsNamedPortalOutType(node.type)) {
      continue;
    }
    const key = nodeGraphNamedPortalBusKey(node);
    const universe = nodeGraphNamedPortalUniverse(node);
    if (!key) {
      continue;
    }
    const seen = new Set();
    const stack = [String(node.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const hit = byId.get(id);
      if (
        hit
        && nodeGraphIsNamedPortalInType(hit.type)
        && nodeGraphNamedPortalUniverse(hit) === universe
        && nodeGraphNamedPortalBusKey(hit) === key
      ) {
        return true;
      }
      const next = adj.get(id) || [];
      for (let i = 0; i < next.length; i += 1) {
        stack.push(next[i]);
      }
    }
  }
  return false;
}

// Portals are not DSP nodes. Expand them into the cables you would have drawn.
function nodeGraphSpliceNamedPortalCables(nodes, connections, modulations) {
  const list = nodes instanceof Map
    ? [...nodes.values()]
    : (Array.isArray(nodes) ? nodes : []);
  const byId = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    if (node && node.id != null) byId.set(String(node.id), node);
  }
  const busOf = (node) => {
    if (!node) return "";
    const type = String(node.type || "");
    if (type !== "namedPortalIn" && type !== "namedPortalOut") return "";
    const title = String(node.alias || node.portalTitle || "").trim().toLowerCase();
    if (!title) return "";
    return `${String(node.ownerMetamoduleId || "")}\0${title}`;
  };
  const sources = [];
  const sinks = [];
  const kept = [];
  const conns = Array.isArray(connections) ? connections : [];
  for (let i = 0; i < conns.length; i += 1) {
    const c = conns[i];
    if (!c) continue;
    const dst = byId.get(String(c.destinationNode || ""));
    const src = byId.get(String(c.sourceNode || ""));
    const dstBus = busOf(dst);
    const srcBus = busOf(src);
    if (dst && String(dst.type) === "namedPortalIn" && dstBus) {
      sources.push({
        bus: dstBus,
        sourceNode: c.sourceNode,
        sourcePort: c.sourcePort,
      });
      continue;
    }
    if (src && String(src.type) === "namedPortalOut" && srcBus) {
      sinks.push({
        bus: srcBus,
        destinationNode: c.destinationNode,
        destinationPort: c.destinationPort,
      });
      continue;
    }
    if (dstBus || srcBus) continue;
    kept.push(c);
  }
  const keptMods = [];
  const modSinks = [];
  const mods = Array.isArray(modulations) ? modulations : [];
  for (let i = 0; i < mods.length; i += 1) {
    const m = mods[i];
    if (!m) continue;
    const src = byId.get(String(m.sourceNode || ""));
    const srcBus = busOf(src);
    if (src && String(src.type) === "namedPortalOut" && srcBus) {
      modSinks.push({
        bus: srcBus,
        destinationNode: m.destinationNode,
        destinationParam: m.destinationParam,
      });
      continue;
    }
    keptMods.push(m);
  }
  for (let s = 0; s < sources.length; s += 1) {
    for (let k = 0; k < sinks.length; k += 1) {
      if (sources[s].bus !== sinks[k].bus) continue;
      kept.push({
        sourceNode: sources[s].sourceNode,
        sourcePort: sources[s].sourcePort,
        destinationNode: sinks[k].destinationNode,
        destinationPort: sinks[k].destinationPort,
      });
    }
    for (let k = 0; k < modSinks.length; k += 1) {
      if (sources[s].bus !== modSinks[k].bus) continue;
      keptMods.push({
        sourceNode: sources[s].sourceNode,
        sourcePort: sources[s].sourcePort,
        destinationNode: modSinks[k].destinationNode,
        destinationParam: modSinks[k].destinationParam,
      });
    }
  }
  return { connections: kept, modulations: keptMods };
}

function nodeGraphArmPortalFeedbackBreak() {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.portalFeedbackBurst = true;
  }
  if (typeof triggerNodeGraphWireBreakEvent === "function") {
    triggerNodeGraphWireBreakEvent("portal-feedback");
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("Portal feedback is not allowed — cable broke.");
  }
}

function nodeGraphEvaluateNamedPortalIn(nodeId, mixInput) {
  const x = typeof mixInput === "function" ? mixInput(nodeId, "In") : 0;
  const n = Number(x);
  return { Out: Number.isFinite(n) ? n : 0 };
}

function nodeGraphEvaluateNamedPortalOut(node, nodes, mixInput) {
  const key = nodeGraphNamedPortalBusKey(node);
  const universe = nodeGraphNamedPortalUniverse(node);
  if (!key) {
    return { Out: 0 };
  }
  let sum = 0;
  const list = Array.isArray(nodes) ? nodes : [];
  for (const other of list) {
    if (
      !other
      || other.bypassed
      || !nodeGraphIsNamedPortalInType(other.type)
      || nodeGraphNamedPortalUniverse(other) !== universe
      || nodeGraphNamedPortalBusKey(other) !== key
    ) {
      continue;
    }
    const x = typeof mixInput === "function" ? mixInput(other.id, "In") : 0;
    const n = Number(x);
    if (Number.isFinite(n)) {
      sum += n;
    }
  }
  return { Out: sum };
}
