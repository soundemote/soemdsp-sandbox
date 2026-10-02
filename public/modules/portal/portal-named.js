// Named wireless Portal In / Portal Out. Title (alias) is the bus name only.
// Jack type/color/shape come from the cable plugged in (wirelessRole locks on
// first cable). Titles never pick a port kind. Portal Out re-publishes that
// kind. Jack I/O labels use effective Display (follows Title until overridden).

function nodeGraphIsNamedPortalInType(type) {
  return String(type || "") === "namedPortalIn";
}

function nodeGraphIsNamedPortalOutType(type) {
  return String(type || "") === "namedPortalOut";
}

function nodeGraphIsNamedPortalType(type) {
  return nodeGraphIsNamedPortalInType(type) || nodeGraphIsNamedPortalOutType(type);
}

function nodeGraphIsPortalIoCatalogType(type) {
  return String(type || "") === "portalIo";
}

/**
 * Portal Title / bus name: C++ identifier [A-Za-z_][A-Za-z0-9_]*.
 * Display stays free-form (comment / jack override). Empty stays empty.
 */
function normalizeNodeGraphNamedPortalAlias(value, fallback = "A") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const fb = fallback == null ? "A" : String(fallback);
  let s = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_");
  // Keep leading _; C++ allows _name. Drop trailing _ from punct collapse only.
  s = s.replace(/_+$/g, "");
  if (!s || /^_+$/.test(s)) {
    return fb;
  }
  if (/^[0-9]/.test(s)) {
    s = `_${s}`;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    return fb;
  }
  return s.slice(0, 64) || fb;
}

function nodeGraphNamedPortalBusKey(node) {
  const raw = typeof normalizeNodeGraphNamedPortalAlias === "function"
    ? normalizeNodeGraphNamedPortalAlias(node?.alias)
    : (typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(node?.alias)
      : String(node?.alias || "").trim());
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
 * Copy Display override onto every named portal on the same bus (universe + Title).
 * Empty clears the override on all peers (jack labels fall back to Title).
 * Returns changed node ids.
 */
function nodeGraphNamedPortalSyncBusDisplay(patch, fromNodeId, nextDisplay) {
  if (!patch || !Array.isArray(patch.nodes)) return [];
  const from = nodeGraphNamedPortalNodeFromPatch(fromNodeId, patch);
  if (!from || !nodeGraphIsNamedPortalType(from.type)) return [];
  const key = nodeGraphNamedPortalBusKey(from);
  const universe = nodeGraphNamedPortalUniverse(from);
  if (!key) return [];
  const display = typeof normalizeNodeGraphPatchNodeDisplay === "function"
    ? normalizeNodeGraphPatchNodeDisplay(nextDisplay)
    : String(nextDisplay ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  const changed = [];
  for (let i = 0; i < patch.nodes.length; i += 1) {
    const node = patch.nodes[i];
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (nodeGraphNamedPortalUniverse(node) !== universe) continue;
    if (nodeGraphNamedPortalBusKey(node) !== key) continue;
    const prev = typeof normalizeNodeGraphPatchNodeDisplay === "function"
      ? normalizeNodeGraphPatchNodeDisplay(node.display)
      : String(node.display ?? "").trim();
    if (display) {
      if (prev === display) continue;
      node.display = display;
    } else {
      if (!Object.hasOwn(node, "display") && !prev) continue;
      delete node.display;
    }
    changed.push(String(node.id));
  }
  return changed;
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
  const seedRole = from.wirelessRole;
  const next = typeof normalizeNodeGraphNamedPortalAlias === "function"
    ? normalizeNodeGraphNamedPortalAlias(nextAlias)
    : (typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(nextAlias)
      : String(nextAlias || "").trim());
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
  if (seedRole != null && seedRole !== "" && typeof nodeGraphNamedPortalSyncBusWirelessRole === "function") {
    nodeGraphNamedPortalSyncBusWirelessRole(patch, fromNodeId, seedRole);
  }
  return changed;
}

/**
 * Optional bus port kind (audio / noteMask / digital / …). Null = unlocked;
 * first compatible cable locks the whole bus (In + Out peers).
 */
function nodeGraphNamedPortalWirelessRole(node) {
  if (!node || !nodeGraphIsNamedPortalType(node.type)) {
    return null;
  }
  if (typeof nodeGraphNormalizePortType === "function") {
    return nodeGraphNormalizePortType(node.wirelessRole);
  }
  const raw = String(node.wirelessRole || "").trim();
  return raw || null;
}

/**
 * Write wirelessRole onto every named portal on the same bus (universe + key).
 * Pass null/empty to clear. Returns changed node ids.
 */
function nodeGraphNamedPortalSyncBusWirelessRole(patch, fromNodeId, nextRole) {
  if (!patch || !Array.isArray(patch.nodes)) return [];
  const from = nodeGraphNamedPortalNodeFromPatch(fromNodeId, patch);
  if (!from || !nodeGraphIsNamedPortalType(from.type)) return [];
  const key = nodeGraphNamedPortalBusKey(from);
  const universe = nodeGraphNamedPortalUniverse(from);
  if (!key) return [];
  const role = typeof nodeGraphNormalizePortType === "function"
    ? nodeGraphNormalizePortType(nextRole)
    : (String(nextRole || "").trim() || null);
  const changed = [];
  for (let i = 0; i < patch.nodes.length; i += 1) {
    const node = patch.nodes[i];
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (nodeGraphNamedPortalUniverse(node) !== universe) continue;
    if (nodeGraphNamedPortalBusKey(node) !== key) continue;
    const prev = nodeGraphNamedPortalWirelessRole(node);
    if (role) {
      if (prev === role && String(node.wirelessRole || "") === role) continue;
      node.wirelessRole = role;
    } else {
      if (node.wirelessRole == null || node.wirelessRole === "") continue;
      delete node.wirelessRole;
    }
    changed.push(String(node.id));
  }
  return changed;
}

/**
 * Lock bus role on first write. No-op when already locked (never overwrite).
 * Returns changed node ids.
 */
function nodeGraphNamedPortalLockWirelessRole(patch, portalNodeId, kind) {
  const role = typeof nodeGraphNormalizePortType === "function"
    ? nodeGraphNormalizePortType(kind)
    : (String(kind || "").trim() || null);
  if (!role) return [];
  const node = nodeGraphNamedPortalNodeFromPatch(portalNodeId, patch);
  if (!node || !nodeGraphIsNamedPortalType(node.type)) return [];
  if (nodeGraphNamedPortalWirelessRole(node)) return [];
  return nodeGraphNamedPortalSyncBusWirelessRole(patch, portalNodeId, role);
}

/**
 * Resolve the write kind for a cable endpoint (port type). Named portals use
 * their locked wirelessRole; unlocked portals yield null.
 */
function nodeGraphNamedPortalEndpointWriteKind(patch, nodeId, port, io) {
  const node = nodeGraphNamedPortalNodeFromPatch(nodeId, patch)
    || (Array.isArray(patch?.nodes)
      ? patch.nodes.find((n) => n && String(n.id) === String(nodeId || ""))
      : null);
  if (node && nodeGraphIsNamedPortalType(node.type)) {
    return nodeGraphNamedPortalWirelessRole(node);
  }
  if (typeof nodeGraphResolvePortType === "function") {
    const resolved = nodeGraphResolvePortType(node || nodeId, port, io);
    if (resolved == null || resolved === "") return null;
    return typeof nodeGraphNormalizePortType === "function"
      ? nodeGraphNormalizePortType(resolved)
      : resolved;
  }
  if (typeof nodeGraphPortIsNoteBus === "function" && nodeGraphPortIsNoteBus(port)) {
    return "noteMask";
  }
  return "audio";
}

/**
 * After a signal wire touches a named portal, lock the bus from the first
 * write kind (source into Portal In, or destination of Portal Out).
 * Returns changed portal node ids.
 */
function nodeGraphNamedPortalApplyConnectWirelessRole(patch, sourceNodeId, sourcePort, destNodeId, destPort) {
  if (!patch || !Array.isArray(patch.nodes)) return [];
  const changed = [];
  const dest = nodeGraphNamedPortalNodeFromPatch(destNodeId, patch)
    || patch.nodes.find((n) => n && String(n.id) === String(destNodeId || ""));
  const src = nodeGraphNamedPortalNodeFromPatch(sourceNodeId, patch)
    || patch.nodes.find((n) => n && String(n.id) === String(sourceNodeId || ""));
  if (dest && nodeGraphIsNamedPortalInType(dest.type)) {
    const kind = nodeGraphNamedPortalEndpointWriteKind(patch, sourceNodeId, sourcePort, "output");
    if (kind) {
      changed.push(...nodeGraphNamedPortalLockWirelessRole(patch, dest.id, kind));
    }
  }
  if (src && nodeGraphIsNamedPortalOutType(src.type)) {
    const kind = nodeGraphNamedPortalEndpointWriteKind(patch, destNodeId, destPort, "input");
    if (kind) {
      changed.push(...nodeGraphNamedPortalLockWirelessRole(patch, src.id, kind));
    }
  }
  return [...new Set(changed)];
}

/**
 * Drop wirelessRole when the bus has no cables (In sources or Out sinks).
 * Sticky while any bus edge remains.
 */
function nodeGraphNamedPortalReconcileBusWirelessRole(patch, portalNodeId) {
  if (!patch || !Array.isArray(patch.nodes)) return [];
  const seed = nodeGraphNamedPortalNodeFromPatch(portalNodeId, patch);
  if (!seed || !nodeGraphIsNamedPortalType(seed.type)) return [];
  const key = nodeGraphNamedPortalBusKey(seed);
  const universe = nodeGraphNamedPortalUniverse(seed);
  if (!key) return [];
  const peers = [];
  for (let i = 0; i < patch.nodes.length; i += 1) {
    const node = patch.nodes[i];
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (nodeGraphNamedPortalUniverse(node) !== universe) continue;
    if (nodeGraphNamedPortalBusKey(node) !== key) continue;
    peers.push(node);
  }
  const peerIds = new Set(peers.map((n) => String(n.id)));
  const connections = Array.isArray(patch.connections) ? patch.connections : [];
  let hasEdge = false;
  for (let i = 0; i < connections.length; i += 1) {
    const c = connections[i];
    if (!c) continue;
    if (peerIds.has(String(c.destinationNode || "")) || peerIds.has(String(c.sourceNode || ""))) {
      hasEdge = true;
      break;
    }
  }
  if (!hasEdge) {
    const mods = Array.isArray(patch.modulations) ? patch.modulations : [];
    for (let i = 0; i < mods.length; i += 1) {
      const m = mods[i];
      if (!m) continue;
      if (peerIds.has(String(m.sourceNode || ""))) {
        hasEdge = true;
        break;
      }
    }
  }
  if (hasEdge) return [];
  return nodeGraphNamedPortalSyncBusWirelessRole(patch, seed.id, null);
}

/**
 * Initial Portal In/Out bus title when splicing a wire: source module title + outlet label
 * (e.g. "Keyboard \u266f/\u266d"). One-shot for insert only — later connects do not rename.
 */
function nodeGraphNamedPortalAliasFromSourceOutlet(patch, sourceNodeId, sourcePort) {
  const src = nodeGraphNamedPortalNodeFromPatch(sourceNodeId, patch)
    || (Array.isArray(patch?.nodes)
      ? patch.nodes.find((node) => node && String(node.id) === String(sourceNodeId || ""))
      : null);
  const port = String(sourcePort || "").trim();
  const sanitize = (value, fallback = "") => {
    if (typeof normalizeNodeGraphNamedPortalAlias === "function") {
      // Pass fallback through (including "") so symbolic labels can wipe cleanly.
      return normalizeNodeGraphNamedPortalAlias(value, fallback);
    }
    if (typeof normalizeNodeGraphPatchNodeAlias === "function") {
      return normalizeNodeGraphPatchNodeAlias(value) || fallback;
    }
    return String(value || "").trim().slice(0, 64) || fallback;
  };
  let title = "";
  if (src) {
    if (typeof nodeGraphPatchNodeTitle === "function") {
      title = String(nodeGraphPatchNodeTitle(src) || "").trim();
    } else if (typeof normalizeNodeGraphPatchNodeAlias === "function") {
      title = String(normalizeNodeGraphPatchNodeAlias(src.alias) || "").trim();
    } else {
      title = String(src.alias || "").trim();
    }
    if (!title) {
      title = String(src.type || "").trim();
    }
  }
  let outlet = "";
  if (typeof nodeGraphPatchNodePortDisplayLabel === "function" && src) {
    outlet = String(nodeGraphPatchNodePortDisplayLabel(src, src.type, port, "output") || "").trim();
  } else {
    outlet = port;
  }
  // Prefer sanitized display label; if symbols wipe it (e.g. ♯/♭), keep the port id.
  let titleId = sanitize(title, "");
  let outletId = sanitize(outlet, "");
  if (!outletId) {
    outletId = sanitize(port, "");
  }
  if (!titleId && !outletId) {
    return "A";
  }
  if (titleId && outletId) {
    return sanitize(`${titleId}_${outletId}`, "A") || "A";
  }
  return titleId || outletId || "A";
}

/**
 * Grid points for a Portal In / Out pair along a wire (In toward source, Out toward dest).
 */
function nodeGraphNamedPortalInsertGridPoints(patch, sourceId, destinationId, slot) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const source = nodes.find((node) => node && node.id === sourceId);
  const destination = nodes.find((node) => node && node.id === destinationId);
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const sgx = num(source?.gx);
  const sgy = num(source?.gy);
  const dgx = num(destination?.gx);
  const dgy = num(destination?.gy);
  const off = Number(slot || 0);
  const inPoint = {
    gx: Math.round((sgx * 2 + dgx) / 3),
    gy: Math.round((sgy * 2 + dgy) / 3) + off,
  };
  const outPoint = {
    gx: Math.round((sgx + dgx * 2) / 3),
    gy: Math.round((sgy + dgy * 2) / 3) + off,
  };
  if (outPoint.gx === inPoint.gx && outPoint.gy === inPoint.gy) {
    outPoint.gx += 4;
  }
  return { in: inPoint, out: outPoint };
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

/** Re-apply jack chrome + header title after wire edits / Title rename. */
function nodeGraphNamedPortalRefreshModules(nodeIds) {
  const ids = [...new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 1) {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(ids[i]) : null;
    if (!node || !nodeGraphIsNamedPortalType(node.type)) continue;
    if (typeof applyNodeGraphModuleElementFromPatch === "function") {
      applyNodeGraphModuleElementFromPatch(node);
    }
    // Alias paint / wirelessRole change does not alter port signature, so the
    // module element is reused without recreating jacks — re-stamp chrome.
    const el = typeof nodeGraphNodeElement === "function"
      ? nodeGraphNodeElement(node.id)
      : (typeof document !== "undefined"
        ? document.querySelector(`.dsp-node[data-node="${CSS.escape(String(node.id))}"]`)
        : null);
    if (!el || typeof nodeGraphApplyJackChrome !== "function") continue;
    const ports = el.querySelectorAll(".node-port:not(.node-param-port), .node-io-row[data-port]");
    for (let p = 0; p < ports.length; p += 1) {
      const row = ports[p];
      const port = String(row.dataset?.port || "");
      const io = String(row.dataset?.io || (nodeGraphIsNamedPortalOutType(node.type) ? "output" : "input"));
      if (!port) continue;
      const target = row.classList?.contains("node-io-row")
        ? row
        : (row.closest?.(".node-io-row") || row);
      nodeGraphApplyJackChrome(target, node.type, port, io);
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
