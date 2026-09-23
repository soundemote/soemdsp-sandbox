// Named wireless Portal In / Portal Out. Title (alias) is the bus name.
// Gold mono. Each owner is its own universe (root vs each Metamodule).

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
