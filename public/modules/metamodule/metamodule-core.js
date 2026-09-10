// Metamodule — group shell + optional polyphony (Playmode Off = group only).
// Children stay in patch.nodes with ownerMetamoduleId; Root view hides them.

const NODE_GRAPH_METAMODULE_TYPE = "metamodule";
const NODE_GRAPH_METAMODULE_PLAYMODES = Object.freeze([
  "Off",
  "Mono",
  "Legato Ties",
  "Legato Always",
  "Poly",
]);

function nodeGraphIsMetamoduleType(type) {
  return String(type || "").trim() === NODE_GRAPH_METAMODULE_TYPE;
}

function nodeGraphIsMetamoduleBoundaryType(type) {
  const t = String(type || "").trim();
  return t === "metamoduleIn" || t === "metamoduleOut";
}

function nodeGraphMetamoduleViewStack() {
  if (!Array.isArray(nodeGraphMvp.metamoduleViewStack)) {
    nodeGraphMvp.metamoduleViewStack = [];
  }
  return nodeGraphMvp.metamoduleViewStack;
}

function nodeGraphMetamoduleViewId() {
  const stack = nodeGraphMetamoduleViewStack();
  return stack.length ? String(stack[stack.length - 1] || "") : "";
}

function nodeGraphMetamoduleIsRootView() {
  return !nodeGraphMetamoduleViewId();
}

/** Nodes visible in the current view (Root vs inside a metamodule). */
function nodeGraphMetamoduleNodeVisibleInCurrentView(node) {
  if (!node || typeof node !== "object") return false;
  const viewId = nodeGraphMetamoduleViewId();
  const owner = String(node.ownerMetamoduleId || "");
  const isBoundary = nodeGraphIsMetamoduleBoundaryType(node.type);
  if (!viewId) {
    // Root: never show Meta In/Out thrus (they live inside a metamodule).
    if (isBoundary) return false;
    // Hide owned children; show metamodule shells + unowned graph modules.
    return !owner;
  }
  // Inside metamodule: show only that meta's children / boundary thrus.
  return owner === viewId;
}

/**
 * Drop Meta In/Out that are not owned and not listed on any metamodule.boundary
 * (invisible on Root but still in the audio graph — leftover from failed groups).
 * Mutates patch.nodes / connections. Returns removed count.
 */
function nodeGraphMetamodulePruneOrphanPortals(patch = nodeGraphMvp?.patch) {
  if (!patch || !Array.isArray(patch.nodes)) return 0;
  const referenced = new Set();
  for (const meta of patch.nodes) {
    if (!nodeGraphIsMetamoduleType(meta?.type)) continue;
    const payload = nodeGraphEnsureMetamodulePayload(meta);
    for (const entry of payload.boundary || []) {
      if (entry?.id) referenced.add(String(entry.id));
    }
  }
  const removeIds = new Set();
  for (const node of patch.nodes) {
    if (!nodeGraphIsMetamoduleBoundaryType(node?.type)) continue;
    const id = String(node.id || "");
    const owner = String(node.ownerMetamoduleId || "").trim();
    if (owner || referenced.has(id)) continue;
    removeIds.add(id);
  }
  if (!removeIds.size) return 0;
  const touches = (nodeId) => removeIds.has(String(nodeId || ""));
  patch.nodes = patch.nodes.filter((n) => !removeIds.has(String(n?.id || "")));
  if (Array.isArray(patch.connections)) {
    patch.connections = patch.connections.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode) && !touches(c.targetNode)
    );
  }
  if (Array.isArray(patch.modulations)) {
    patch.modulations = patch.modulations.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode)
    );
  }
  if (Array.isArray(patch.graphConnections)) {
    patch.graphConnections = patch.graphConnections.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode)
    );
  }
  if (nodeGraphMvp?.activeNodes instanceof Set) {
    for (const id of removeIds) nodeGraphMvp.activeNodes.delete(id);
  }
  return removeIds.size;
}

/** Scan owned Meta Outs; flip any that feed child inlets (shell should be inputs). */
function nodeGraphMetamoduleRepairMiswiredOutlets(patch = nodeGraphMvp?.patch) {
  if (!patch || !Array.isArray(patch.nodes)) return 0;
  let flipped = 0;
  for (const node of [...patch.nodes]) {
    if (node?.type !== "metamoduleOut") continue;
    if (nodeGraphMetamoduleFlipMiswiredOutletToInlet(node.id, patch)) {
      flipped += 1;
    }
  }
  return flipped;
}

/**
 * Re-apply ownership from metamodule.boundary / displays (fixes older patches).
 * Never steals a node already owned by another metamodule — strips the duplicate
 * listing from this meta instead (copy-shell bugs used to fight over children).
 */
function nodeGraphRepairMetamoduleOwnership(patch = nodeGraphMvp?.patch) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const findNode = (id) => {
    const want = String(id || "");
    if (!want) return null;
    if (typeof nodeGraphPatchNode === "function" && patch === nodeGraphMvp?.patch) {
      return nodeGraphPatchNode(want);
    }
    return nodes.find((n) => n?.id === want) || null;
  };
  let fixed = 0;
  for (const meta of nodes) {
    if (!nodeGraphIsMetamoduleType(meta?.type)) continue;
    const payload = nodeGraphEnsureMetamodulePayload(meta);
    const metaId = String(meta.id || "");
    const nextDisplays = [];
    for (const entry of payload.displays || []) {
      const childId = entry?.childId;
      const child = findNode(childId);
      if (!child) {
        fixed += 1;
        continue;
      }
      const owner = String(child.ownerMetamoduleId || "").trim();
      if (!owner) {
        child.ownerMetamoduleId = metaId;
        fixed += 1;
        nextDisplays.push(entry);
      } else if (owner === metaId) {
        nextDisplays.push(entry);
      } else {
        // Owned by another meta — do not steal; drop this meta's listing.
        fixed += 1;
      }
    }
    payload.displays = nextDisplays;

    const nextBoundary = [];
    for (const entry of payload.boundary || []) {
      if (!entry?.id) {
        fixed += 1;
        continue;
      }
      const portal = findNode(entry.id);
      if (!portal) {
        fixed += 1;
        continue;
      }
      const owner = String(portal.ownerMetamoduleId || "").trim();
      if (!owner) {
        portal.ownerMetamoduleId = metaId;
        fixed += 1;
        nextBoundary.push(entry);
      } else if (owner === metaId) {
        nextBoundary.push(entry);
      } else {
        fixed += 1;
      }
    }
    payload.boundary = nextBoundary;
  }
  return fixed;
}

/**
 * Enter/exit must update element.hidden on already-mounted modules.
 * Also clear viewport-asleep on newly shown modules — hidden nodes get culled
 * (display:none via .viewport-asleep), and without a wake the top view looks
 * empty until the user pans/zooms (which runs scheduleNodeGraphViewportCullRefresh).
 */
function nodeGraphSyncMetamoduleVisibilityToDom() {
  const container = document.getElementById("nodeGraphNodes");
  if (!container) return false;
  let changed = false;
  const newlyShown = [];
  for (const element of container.querySelectorAll(".dsp-node")) {
    const id = String(element.dataset.node || "");
    const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
    if (!patchNode) continue;
    const shouldShow = typeof nodeGraphModuleShouldBeVisible === "function"
      ? nodeGraphModuleShouldBeVisible(patchNode)
      : true;
    const wasHidden = Boolean(element.hidden);
    if (wasHidden === shouldShow) {
      element.hidden = !shouldShow;
      changed = true;
    }
    if (shouldShow) {
      newlyShown.push(element);
      // Sync position/size chrome so ports exist for wire hit-testing.
      if (typeof syncNodeGraphModuleChromeElement === "function") {
        syncNodeGraphModuleChromeElement(element, patchNode);
      }
    }
  }
  // Wake cull-slept modules that just became visible (zoom used to do this).
  for (const element of newlyShown) {
    if (typeof nodeGraphViewportCullApply === "function") {
      nodeGraphViewportCullApply(element, true);
    } else {
      element.classList.remove("viewport-asleep");
    }
  }
  if (typeof scheduleNodeGraphViewportCullRefresh === "function") {
    scheduleNodeGraphViewportCullRefresh();
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (workspace && Array.isArray(nodeGraphMvp?.patch?.nodes)) {
    const visibleCount = nodeGraphMvp.patch.nodes.filter((node) => (
      typeof nodeGraphModuleShouldBeVisible === "function"
        ? nodeGraphModuleShouldBeVisible(node)
        : true
    )).length;
    workspace.classList.toggle("empty-patch", visibleCount === 0);
  }
  // Wires need a layout frame after unhide + cull wake (ports were 0×0 while asleep).
  const redrawWires = () => {
    if (typeof drawNodeGraphWires === "function") {
      drawNodeGraphWires();
    } else if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
      scheduleNodeGraphWireRedrawAfterLayout();
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(redrawWires);
    });
  } else {
    redrawWires();
  }
  if (typeof nodeGraphMetamoduleRefreshAllMirrors === "function") {
    nodeGraphMetamoduleRefreshAllMirrors();
  }
  return changed;
}

function nodeGraphRefreshMetamoduleViewDom() {
  // Dedicated visibility sync — do NOT use skipExistingSync (skips hidden updates).
  nodeGraphSyncMetamoduleVisibilityToDom();
}

function nodeGraphEnsureMetamodulePayload(node) {
  if (!node || typeof node !== "object") return null;
  if (!node.metamodule || typeof node.metamodule !== "object") {
    node.metamodule = {
      boundary: [],
      displays: [],
      paramVisibility: {},
    };
  }
  if (!Array.isArray(node.metamodule.boundary)) node.metamodule.boundary = [];
  if (!Array.isArray(node.metamodule.displays)) node.metamodule.displays = [];
  if (!node.metamodule.paramVisibility || typeof node.metamodule.paramVisibility !== "object") {
    node.metamodule.paramVisibility = {};
  }
  return node.metamodule;
}

/** Deep-clone metamodule payload so history/copy never share boundary arrays. */
function cloneNodeGraphMetamodulePayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const boundary = Array.isArray(source.boundary)
    ? source.boundary.map((entry) => (entry && typeof entry === "object" ? { ...entry } : entry))
    : [];
  const displays = Array.isArray(source.displays)
    ? source.displays.map((entry) => (entry && typeof entry === "object" ? { ...entry } : entry))
    : [];
  const paramVisibility = source.paramVisibility && typeof source.paramVisibility === "object"
    ? { ...source.paramVisibility }
    : {};
  return { boundary, displays, paramVisibility };
}

function nodeGraphNextMetamoduleId(patch = nodeGraphMvp?.patch) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  let max = 0;
  for (const node of nodes) {
    const m = /^metamodule-(\d+)$/.exec(String(node?.id || ""));
    if (m) max = Math.max(max, nodeGraphFiniteNumber(m[1]));
  }
  return `metamodule-${max + 1}`;
}

function nodeGraphSelectionCanGroupIntoMetamodule(selection = nodeGraphMvp?.selected) {
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    return false;
  }
  const ids = typeof nodeGraphSelectedNodeIds === "function"
    ? [...nodeGraphSelectedNodeIds(selection)]
    : [];
  if (ids.length < 1) return false;
  // Must be on Root view (no groups-in-groups).
  if (!nodeGraphMetamoduleIsRootView()) return false;
  for (const id of ids) {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
    if (!node) return false;
    if (nodeGraphIsMetamoduleType(node.type)) return false;
    if (nodeGraphIsMetamoduleBoundaryType(node.type)) return false;
    if (node.ownerMetamoduleId) return false;
    if (typeof nodeGraphNodeCanBeDeleted === "function" && !nodeGraphNodeCanBeDeleted(node)) {
      // Allow grouping undeleteable singletons? No — keep out of groups for v1.
      if (node.type === "output" || node.type === "audioInput") return false;
    }
  }
  return true;
}

/**
 * Wires that cross the selection boundary.
 * Returns { inbound: [...], outbound: [...] } with connection refs + direction.
 */
function nodeGraphMetamoduleCrossingConnections(selectedIds, patch = nodeGraphMvp?.patch) {
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const inbound = [];
  const outbound = [];
  const lists = [
    { kind: "signal", list: Array.isArray(patch?.connections) ? patch.connections : [] },
    { kind: "graph", list: Array.isArray(patch?.graphConnections) ? patch.graphConnections : [] },
    { kind: "modulation", list: Array.isArray(patch?.modulations) ? patch.modulations : [] },
  ];
  for (const { kind, list } of lists) {
    for (let index = 0; index < list.length; index += 1) {
      const c = list[index];
      if (!c) continue;
      const src = String(c.sourceNode || "");
      const dst = String(c.destinationNode || c.targetNode || "");
      const srcIn = idSet.has(src);
      const dstIn = idSet.has(dst);
      if (srcIn === dstIn) continue;
      let destinationPort = "";
      if (kind === "modulation") {
        destinationPort = String(c.destinationParam || "");
      } else if (kind === "graph") {
        destinationPort = String(c.destinationGraphInput || "");
      } else {
        destinationPort = String(c.destinationPort || c.targetPort || "");
      }
      const entry = {
        kind,
        index,
        connection: c,
        sourceNode: src,
        sourcePort: String(c.sourcePort || ""),
        destinationNode: dst,
        destinationPort,
      };
      if (!srcIn && dstIn) inbound.push(entry);
      else outbound.push(entry);
    }
  }
  return { inbound, outbound };
}

function nodeGraphNextMetamoduleBoundaryId(kind, patch = nodeGraphMvp?.patch) {
  const prefix = kind === "out" ? "metamoduleOut" : "metamoduleIn";
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const node of nodes) {
    const m = re.exec(String(node?.id || ""));
    if (m) max = Math.max(max, nodeGraphFiniteNumber(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

function nodeGraphMetamoduleBoundaryAlias(portName, direction) {
  const raw = String(portName || "").trim();
  let lane = raw || (direction === "out" ? "Out" : "In");
  const lower = lane.toLowerCase();
  if (lower === "l" || lower === "left") lane = "Left";
  else if (lower === "r" || lower === "right") lane = "Right";
  else if (lower === "m" || lower === "mono") lane = "Mono";
  // Hypersaw-style L/R outs: title the portal with the lane name.
  if (lane === "Left" || lane === "Right" || lane === "Mono") return lane;
  return direction === "out" ? `Out ${lane}` : `In ${lane}`;
}

/** Short unique jack name on the Metamodule shell for a boundary portal. */
function nodeGraphMetamoduleAllocateShellPortName(entry, portalNode, usedNames, options = {}) {
  const used = usedNames instanceof Set ? usedNames : new Set(usedNames || []);
  const preferred = String(options.preferred || "").trim();
  let name = preferred || String(entry?.shellPort || "").trim();
  if (!name) {
    const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(portalNode?.alias)
      : String(portalNode?.alias || "").trim();
    name = alias || String(entry?.portLabel || "").trim() || "Port";
    if (name.startsWith("In ")) name = name.slice(3).trim();
    if (name.startsWith("Out ")) name = name.slice(4).trim();
  }
  if (!name) name = "Port";
  // Poly / Amplitude are reserved shell inlets (not boundary jack names).
  if (entry?.direction !== "out" && name === "Poly") name = "In Poly";
  if (entry?.direction !== "out" && (name === "Amplitude" || name === "Amp")) {
    name = "In Amplitude";
  }
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${name} ${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Child signal port attached to a Meta In/Out on the inside of the boundary.
 * Meta In: portal Out → child.port. Meta Out: child.port → portal In.
 */
function nodeGraphMetamoduleConnectedChildPort(portalNode, patch = nodeGraphMvp?.patch) {
  if (!portalNode?.id || !nodeGraphIsMetamoduleBoundaryType(portalNode.type)) return "";
  const portalId = String(portalNode.id);
  const connections = Array.isArray(patch?.connections) ? patch.connections : [];
  if (portalNode.type === "metamoduleIn") {
    for (const c of connections) {
      if (!c) continue;
      if (String(c.sourceNode || "") !== portalId) continue;
      if (String(c.sourcePort || "") !== "Out") continue;
      const dst = String(c.destinationNode || c.targetNode || "");
      if (!dst || dst === portalId) continue;
      const dstNode = typeof nodeGraphPatchNode === "function"
        ? (patch === nodeGraphMvp?.patch
          ? nodeGraphPatchNode(dst)
          : (patch?.nodes || []).find((n) => n?.id === dst))
        : null;
      if (nodeGraphIsMetamoduleBoundaryType(dstNode?.type)) continue;
      return String(c.destinationPort || c.targetPort || "").trim();
    }
  } else if (portalNode.type === "metamoduleOut") {
    for (const c of connections) {
      if (!c) continue;
      if (String(c.destinationNode || c.targetNode || "") !== portalId) continue;
      if (String(c.destinationPort || c.targetPort || "") !== "In") continue;
      const src = String(c.sourceNode || "");
      if (!src || src === portalId) continue;
      const srcNode = typeof nodeGraphPatchNode === "function"
        ? (patch === nodeGraphMvp?.patch
          ? nodeGraphPatchNode(src)
          : (patch?.nodes || []).find((n) => n?.id === src))
        : null;
      if (nodeGraphIsMetamoduleBoundaryType(srcNode?.type)) continue;
      return String(c.sourcePort || "").trim();
    }
  }
  return "";
}

/** Desired shell jack base name: alias → connected child port → In/Out. */
function nodeGraphMetamoduleDesiredShellPortBase(entry, portalNode, patch = nodeGraphMvp?.patch) {
  const direction = entry?.direction === "out"
    || entry?.type === "metamoduleOut"
    || portalNode?.type === "metamoduleOut"
    ? "out"
    : "in";
  const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
    ? normalizeNodeGraphPatchNodeAlias(portalNode?.alias)
    : String(portalNode?.alias || "").trim();
  if (alias) {
    let name = alias;
    if (name.startsWith("In ")) name = name.slice(3).trim();
    if (name.startsWith("Out ")) name = name.slice(4).trim();
    return name || (direction === "out" ? "Out" : "In");
  }
  const childPort = nodeGraphMetamoduleConnectedChildPort(portalNode, patch);
  if (childPort) {
    const labeled = nodeGraphMetamoduleBoundaryAlias(childPort, direction);
    let name = labeled;
    if (name.startsWith("In ")) name = name.slice(3).trim();
    if (name.startsWith("Out ")) name = name.slice(4).trim();
    return name || childPort;
  }
  return direction === "out" ? "Out" : "In";
}

/**
 * Recompute boundary[].shellPort from alias / connected child ports.
 * Returns true when any shellPort string changed.
 */
function nodeGraphMetamoduleSyncBoundaryShellPorts(metaId, patch = nodeGraphMvp?.patch) {
  const id = String(metaId || "").trim();
  if (!id || !patch) return false;
  const meta = typeof nodeGraphPatchNode === "function"
    ? (patch === nodeGraphMvp?.patch
      ? nodeGraphPatchNode(id)
      : (patch?.nodes || []).find((n) => n?.id === id))
    : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return false;
  const payload = nodeGraphEnsureMetamodulePayload(meta);
  if (!Array.isArray(payload.boundary)) payload.boundary = [];
  const used = new Set(["Poly", "Amplitude"]);
  let changed = false;
  for (const entry of payload.boundary) {
    if (!entry?.id || entry.deferred) continue;
    const portal = typeof nodeGraphPatchNode === "function"
      ? (patch === nodeGraphMvp?.patch
        ? nodeGraphPatchNode(entry.id)
        : (patch?.nodes || []).find((n) => n?.id === entry.id))
      : null;
    if (!portal) continue;
    const preferred = nodeGraphMetamoduleDesiredShellPortBase(entry, portal, patch);
    entry.portLabel = preferred;
    const prev = String(entry.shellPort || "");
    entry.shellPort = "";
    const next = nodeGraphMetamoduleAllocateShellPortName(entry, portal, used, { preferred });
    entry.shellPort = next;
    if (prev !== next) changed = true;
    // Keep TitleBarAndPorts title in sync when user has not set a custom alias.
    const alias = typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(portal.alias)
      : String(portal.alias || "").trim();
    if (!alias && next) {
      portal.alias = next;
    }
  }
  return changed;
}

/** Rebuild Metamodule shell DOM so Root jacks match boundary shellPorts. */
function nodeGraphMetamoduleRemountShell(metaId) {
  const id = String(metaId || "").trim();
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return false;
  if (typeof applyNodeGraphModuleElementFromPatch === "function") {
    applyNodeGraphModuleElementFromPatch(meta);
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  } else if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
  return true;
}

/** Sync names + remount shell (Root face jacks). */
function nodeGraphMetamoduleRefreshShellFromBoundary(metaId, patch = nodeGraphMvp?.patch) {
  const id = String(metaId || "").trim();
  if (!id) return false;
  nodeGraphMetamoduleSyncBoundaryShellPorts(id, patch);
  return nodeGraphMetamoduleRemountShell(id);
}

/**
 * Remove a Meta In/Out from the patch + parent boundary (shop delete inside meta).
 * Mutates patch. Returns owner metamodule id or "".
 */
function nodeGraphMetamoduleRemoveBoundaryPortalInPlace(portalId, patch = nodeGraphMvp?.patch) {
  const id = String(portalId || "").trim();
  if (!id || !patch || !Array.isArray(patch.nodes)) return "";
  const portal = patch.nodes.find((n) => n?.id === id);
  if (!nodeGraphIsMetamoduleBoundaryType(portal?.type)) return "";
  const ownerId = String(portal.ownerMetamoduleId || "").trim();
  const touches = (nodeId) => String(nodeId || "") === id;
  if (Array.isArray(patch.connections)) {
    patch.connections = patch.connections.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode) && !touches(c.targetNode)
    );
  }
  if (Array.isArray(patch.modulations)) {
    patch.modulations = patch.modulations.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode)
    );
  }
  if (Array.isArray(patch.graphConnections)) {
    patch.graphConnections = patch.graphConnections.filter((c) =>
      c && !touches(c.sourceNode) && !touches(c.destinationNode)
    );
  }
  patch.nodes = patch.nodes.filter((n) => String(n?.id || "") !== id);
  if (Array.isArray(patch.bypassedNodes)) {
    patch.bypassedNodes = patch.bypassedNodes.filter((nodeId) => String(nodeId) !== id);
  }
  if (nodeGraphMvp?.activeNodes instanceof Set) {
    nodeGraphMvp.activeNodes.delete(id);
  }
  if (ownerId) {
    const meta = patch.nodes.find((n) => n?.id === ownerId);
    if (nodeGraphIsMetamoduleType(meta?.type)) {
      const payload = nodeGraphEnsureMetamodulePayload(meta);
      payload.boundary = (payload.boundary || []).filter((entry) =>
        !(entry && String(entry.id) === id)
      );
    }
  }
  return ownerId;
}

/**
 * Dynamic Root-facing jacks on the Metamodule shell (from boundary portals).
 * Poly stays first; Meta In portals → inputs; Meta Out portals → outputs.
 * Read-only: does not allocate/rename shellPort (use SyncBoundaryShellPorts).
 */
function nodeGraphMetamoduleShellPorts(metaNode) {
  const inputs = ["Poly", "Amplitude"];
  const outputs = [];
  if (!nodeGraphIsMetamoduleType(metaNode?.type)) {
    return { inputs, outputs };
  }
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  let missing = false;
  for (const entry of payload.boundary || []) {
    if (!entry?.id || entry.deferred) continue;
    if (!String(entry.shellPort || "").trim()) {
      missing = true;
      break;
    }
  }
  if (missing && typeof nodeGraphMetamoduleSyncBoundaryShellPorts === "function") {
    nodeGraphMetamoduleSyncBoundaryShellPorts(metaNode.id);
  }
  for (const entry of payload.boundary || []) {
    if (!entry?.id || entry.deferred) continue;
    const portal = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(entry.id)
      : null;
    const shellPort = String(entry.shellPort || "").trim();
    if (!shellPort) continue;
    const isOut = entry.direction === "out"
      || entry.type === "metamoduleOut"
      || portal?.type === "metamoduleOut";
    if (isOut) outputs.push(shellPort);
    else inputs.push(shellPort);
  }
  return { inputs, outputs };
}

function nodeGraphMetamoduleBoundaryEntryForShellPort(metaNode, shellPort, direction) {
  const want = String(shellPort || "").trim();
  if (!want || !nodeGraphIsMetamoduleType(metaNode?.type)) return null;
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  const wantOut = direction === "out" || direction === "output";
  let sawEmpty = false;
  for (const entry of payload.boundary || []) {
    if (!entry?.id || entry.deferred) continue;
    if (!String(entry.shellPort || "").trim()) sawEmpty = true;
  }
  if (sawEmpty && typeof nodeGraphMetamoduleSyncBoundaryShellPorts === "function") {
    nodeGraphMetamoduleSyncBoundaryShellPorts(metaNode.id);
  }
  for (const entry of payload.boundary || []) {
    if (!entry?.id || entry.deferred) continue;
    const portal = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(entry.id)
      : null;
    const name = String(entry.shellPort || "").trim();
    if (!name || name !== want) continue;
    const isOut = entry.direction === "out"
      || entry.type === "metamoduleOut"
      || portal?.type === "metamoduleOut";
    if (Boolean(isOut) === wantOut) return entry;
  }
  return null;
}

/**
 * On Root, outside↔portal wires visually terminate on the parent shell jack.
 * Returns { nodeId, port, io } or null when no remap applies.
 */
function nodeGraphMetamoduleWireVisualEndpoint(nodeId, port, io) {
  if (typeof nodeGraphMetamoduleIsRootView === "function" && !nodeGraphMetamoduleIsRootView()) {
    return null;
  }
  const id = String(nodeId || "");
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!nodeGraphIsMetamoduleBoundaryType(node?.type)) return null;
  const metaId = String(node.ownerMetamoduleId || "").trim();
  if (!metaId) return null;
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(metaId) : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return null;
  // Parent shell must be an active Root module (avoid recursion through visibility).
  if (nodeGraphMvp?.activeNodes instanceof Set && !nodeGraphMvp.activeNodes.has(metaId)) {
    return null;
  }
  if (String(meta.ownerMetamoduleId || "").trim()) return null;

  const payload = nodeGraphEnsureMetamodulePayload(meta);
  let entry = (payload.boundary || []).find((b) => b && String(b.id) === id);
  if (entry && !String(entry.shellPort || "").trim()
    && typeof nodeGraphMetamoduleSyncBoundaryShellPorts === "function") {
    nodeGraphMetamoduleSyncBoundaryShellPorts(metaId);
    entry = (payload.boundary || []).find((b) => b && String(b.id) === id);
  }
  const shellPort = String(entry?.shellPort || "").trim();
  if (!shellPort) return null;

  const canonicalPort = String(port || "").trim();
  // Outside → Meta In: dest is portal In → shell input.
  if (node.type === "metamoduleIn" && io === "input" && (canonicalPort === "In" || !canonicalPort)) {
    return { nodeId: metaId, port: shellPort, io: "input" };
  }
  // Meta Out → Outside: source is portal Out → shell output.
  if (node.type === "metamoduleOut" && io === "output" && (canonicalPort === "Out" || !canonicalPort)) {
    return { nodeId: metaId, port: shellPort, io: "output" };
  }
  return null;
}

/** True when a hidden boundary portal may still anchor Root wires via its shell. */
function nodeGraphMetamodulePortalIsWireProxyVisible(nodeId) {
  const proxy = nodeGraphMetamoduleWireVisualEndpoint(nodeId, "In", "input")
    || nodeGraphMetamoduleWireVisualEndpoint(nodeId, "Out", "output");
  return Boolean(proxy);
}

/**
 * On Root, modulations stored on an owned child (after mx_* connect rewrite)
 * visually terminate on the parent shell's exposed mx_* jack.
 * Returns { nodeId, param } or null when no remap applies.
 */
function nodeGraphMetamoduleExposedModulationWireVisualEndpoint(nodeId, paramKey) {
  if (typeof nodeGraphMetamoduleIsRootView === "function" && !nodeGraphMetamoduleIsRootView()) {
    return null;
  }
  const id = String(nodeId || "").trim();
  const key = String(paramKey || "").trim();
  if (!id || !key) return null;
  // Already a shell mx_* key — no remap.
  if (key.startsWith("mx_")) return null;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!node) return null;
  const metaId = String(node.ownerMetamoduleId || "").trim();
  if (!metaId) return null;
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(metaId) : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return null;
  if (nodeGraphMvp?.activeNodes instanceof Set && !nodeGraphMvp.activeNodes.has(metaId)) {
    return null;
  }
  // Nested metamodule shells are not Root-visible proxies.
  if (String(meta.ownerMetamoduleId || "").trim()) return null;
  if (typeof nodeGraphMetamoduleIsParamExposed !== "function"
    || !nodeGraphMetamoduleIsParamExposed(meta, id, key)) {
    return null;
  }
  const synthKey = typeof nodeGraphMetamoduleExposeParamKey === "function"
    ? nodeGraphMetamoduleExposeParamKey(id, key)
    : "";
  if (!synthKey) return null;
  return { nodeId: metaId, param: synthKey };
}

/** True when a Root-hidden owned child can anchor mod cables via an exposed shell jack. */
function nodeGraphMetamoduleExposedChildIsWireProxyVisible(nodeId) {
  if (typeof nodeGraphMetamoduleIsRootView === "function" && !nodeGraphMetamoduleIsRootView()) {
    return false;
  }
  const id = String(nodeId || "").trim();
  if (!id) return false;
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  const metaId = String(node?.ownerMetamoduleId || "").trim();
  if (!metaId || !nodeGraphIsMetamoduleType?.(nodeGraphPatchNode?.(metaId)?.type)) {
    return false;
  }
  if (typeof nodeGraphMetamoduleListExposedParamEntries !== "function") {
    return false;
  }
  const meta = nodeGraphPatchNode(metaId);
  return nodeGraphMetamoduleListExposedParamEntries(meta).some(
    (entry) => String(entry?.childId || "") === id,
  );
}

/**
 * If a Meta Out's Out is wired into an owned child's inlet, that portal is being
 * used as an inlet — flip it to Meta In and update boundary so the shell shows
 * a left-side jack (e.g. white ƒ inlet instead of white ƒ outlet).
 * Mutates patch. Returns owner meta id when flipped, else "".
 */
function nodeGraphMetamoduleFlipMiswiredOutletToInlet(portalId, patch = nodeGraphMvp?.patch) {
  const id = String(portalId || "").trim();
  if (!id || !patch || !Array.isArray(patch.nodes)) return "";
  const portal = patch.nodes.find((n) => n?.id === id);
  if (!portal || portal.type !== "metamoduleOut") return "";
  const ownerId = String(portal.ownerMetamoduleId || "").trim();
  if (!ownerId) return "";
  const conns = Array.isArray(patch.connections) ? patch.connections : [];
  const feedsChildInlet = conns.some((c) => {
    if (!c || String(c.sourceNode || "") !== id || String(c.sourcePort || "") !== "Out") {
      return false;
    }
    const dstId = String(c.destinationNode || c.targetNode || "");
    const dst = patch.nodes.find((n) => n?.id === dstId);
    if (!dst || nodeGraphIsMetamoduleBoundaryType(dst.type) || nodeGraphIsMetamoduleType(dst.type)) {
      return false;
    }
    return String(dst.ownerMetamoduleId || "") === ownerId;
  });
  if (!feedsChildInlet) return "";

  portal.type = "metamoduleIn";
  const meta = patch.nodes.find((n) => n?.id === ownerId);
  if (nodeGraphIsMetamoduleType(meta?.type)) {
    const payload = nodeGraphEnsureMetamodulePayload(meta);
    for (const entry of payload.boundary || []) {
      if (entry && String(entry.id) === id) {
        entry.type = "metamoduleIn";
        entry.direction = "in";
      }
    }
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("Meta Out was feeding a child inlet — converted to Meta In (shell inlet).");
  }
  return ownerId;
}

/**
 * Stamp ownership for a node placed while inside a Metamodule view.
 * Meta In/Out also get a boundary + shellPort on the parent shell.
 * Returns true when ownership was applied.
 */
function nodeGraphMetamoduleClaimPlacedNode(node, patch = nodeGraphMvp?.patch) {
  if (!node || typeof node !== "object") return false;
  const viewId = typeof nodeGraphMetamoduleViewId === "function"
    ? nodeGraphMetamoduleViewId()
    : "";
  if (!viewId) return false;
  const meta = typeof nodeGraphPatchNode === "function"
    ? (patch === nodeGraphMvp?.patch
      ? nodeGraphPatchNode(viewId)
      : (patch?.nodes || []).find((n) => n?.id === viewId))
    : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return false;

  node.ownerMetamoduleId = viewId;

  if (!nodeGraphIsMetamoduleBoundaryType(node.type)) {
    return true;
  }

  const payload = nodeGraphEnsureMetamodulePayload(meta);
  if (!Array.isArray(payload.boundary)) payload.boundary = [];
  if (payload.boundary.some((entry) => entry && String(entry.id) === String(node.id))) {
    return true;
  }

  const direction = node.type === "metamoduleOut" ? "out" : "in";
  const used = new Set(["Poly", "Amplitude"]);
  for (const entry of payload.boundary) {
    if (entry?.shellPort) used.add(String(entry.shellPort));
  }
  const portLabel = direction === "out" ? "Out" : "In";
  const record = {
    id: String(node.id),
    type: String(node.type),
    direction,
    portLabel,
    key: `shop:${node.id}`,
    shellPort: "",
  };
  record.shellPort = nodeGraphMetamoduleAllocateShellPortName(record, node, used);
  // Prefer alias matching shell jack name for TitleBarAndPorts title.
  if (!String(node.alias || "").trim()) {
    node.alias = record.shellPort;
  }
  payload.boundary.push(record);
  return true;
}

/**
 * Rewrite a shell-jack connection to the flat portal wire used by DSP.
 * Poly stays on the shell (voice bus stub); boundary jacks map to Meta In/Out.
 */
function nodeGraphMetamoduleRewriteShellConnection(sourceNode, sourcePort, destinationNode, destinationPort) {
  let src = String(sourceNode || "");
  let srcPort = String(sourcePort || "");
  let dst = String(destinationNode || "");
  let dstPort = String(destinationPort || "");

  const dstNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(dst) : null;
  if (
    nodeGraphIsMetamoduleType(dstNode?.type)
    && dstPort
    && dstPort !== "Poly"
    && dstPort !== "Amplitude"
  ) {
    const entry = nodeGraphMetamoduleBoundaryEntryForShellPort(dstNode, dstPort, "in");
    if (entry?.id) {
      dst = entry.id;
      dstPort = "In";
    }
  }

  const srcNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(src) : null;
  if (
    nodeGraphIsMetamoduleType(srcNode?.type)
    && srcPort
    && srcPort !== "Poly"
    && srcPort !== "Amplitude"
  ) {
    const entry = nodeGraphMetamoduleBoundaryEntryForShellPort(srcNode, srcPort, "out");
    if (entry?.id) {
      src = entry.id;
      srcPort = "Out";
    }
  }

  return {
    sourceNode: src,
    sourcePort: srcPort,
    destinationNode: dst,
    destinationPort: dstPort,
  };
}

/**
 * Insert unity thru portals for crossing signal wires and rewire through them.
 * Modulation / graph crossings are recorded but left wired (no thru param jack).
 */
function nodeGraphMetamodulePortalizeCrossing(metaNode, crossing, children, patch) {
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  const metaId = String(metaNode.id || "");
  const bounds = nodeGraphMetamoduleBoundsOfNodes(children);
  let minGx = bounds.gx;
  let maxGx = bounds.gx;
  let minGy = bounds.gy;
  for (const child of children) {
    const gx = Number(child?.gx);
    const gy = Number(child?.gy);
    if (Number.isFinite(gx)) {
      minGx = Math.min(minGx, gx);
      maxGx = Math.max(maxGx, gx);
    }
    if (Number.isFinite(gy)) minGy = Math.min(minGy, gy);
  }

  const inletByKey = new Map();
  const outletByKey = new Map();
  const portalFed = new Set();
  const boundary = [];
  const usedShellPorts = new Set(["Poly", "Amplitude"]);
  let inSlot = 0;
  let outSlot = 0;

  const ensurePortal = (direction, key, portLabel) => {
    const map = direction === "out" ? outletByKey : inletByKey;
    if (map.has(key)) return map.get(key);
    const type = direction === "out" ? "metamoduleOut" : "metamoduleIn";
    const id = nodeGraphNextMetamoduleBoundaryId(direction === "out" ? "out" : "in", patch);
    const gy = minGy + (direction === "out" ? outSlot : inSlot);
    if (direction === "out") outSlot += 1;
    else inSlot += 1;
    const alias = nodeGraphMetamoduleBoundaryAlias(portLabel, direction);
    const node = typeof createNodeGraphPatchNode === "function"
      ? createNodeGraphPatchNode(type, {
        id,
        gx: direction === "out" ? maxGx + 3 : minGx - 3,
        gy,
        alias,
      })
      : {
        id,
        type,
        gx: direction === "out" ? maxGx + 3 : minGx - 3,
        gy,
        alias,
        params: {},
        paramMeta: {},
      };
    node.ownerMetamoduleId = metaId;
    patch.nodes.push(node);
    if (nodeGraphMvp?.activeNodes instanceof Set) {
      nodeGraphMvp.activeNodes.add(id);
    }
    const record = {
      id,
      type,
      direction,
      portLabel: String(portLabel || ""),
      key,
      shellPort: "",
    };
    record.shellPort = nodeGraphMetamoduleAllocateShellPortName(record, node, usedShellPorts);
    map.set(key, record);
    boundary.push(record);
    return record;
  };

  for (const entry of crossing.inbound || []) {
    if (entry.kind !== "signal") {
      boundary.push({
        direction: "in",
        kind: entry.kind,
        deferred: true,
        sourceNode: entry.sourceNode,
        sourcePort: entry.sourcePort,
        destinationNode: entry.destinationNode,
        destinationPort: entry.destinationPort,
      });
      continue;
    }
    const key = `in:${entry.destinationNode}|${entry.destinationPort}`;
    const portal = ensurePortal("in", key, entry.destinationPort);
    const c = entry.connection;
    if (!c) continue;
    // Outside → portal In; portal Out → original child port.
    c.destinationNode = portal.id;
    c.destinationPort = "In";
    if (c.targetNode) c.targetNode = portal.id;
    if (c.targetPort) c.targetPort = "In";
    if (!Array.isArray(patch.connections)) patch.connections = [];
    const already = patch.connections.some((w) =>
      w
      && w.sourceNode === portal.id
      && w.sourcePort === "Out"
      && w.destinationNode === entry.destinationNode
      && w.destinationPort === entry.destinationPort
    );
    if (!already) {
      patch.connections.push({
        sourceNode: portal.id,
        sourcePort: "Out",
        destinationNode: entry.destinationNode,
        destinationPort: entry.destinationPort,
      });
    }
  }

  for (const entry of crossing.outbound || []) {
    if (entry.kind !== "signal") {
      boundary.push({
        direction: "out",
        kind: entry.kind,
        deferred: true,
        sourceNode: entry.sourceNode,
        sourcePort: entry.sourcePort,
        destinationNode: entry.destinationNode,
        destinationPort: entry.destinationPort,
      });
      continue;
    }
    const key = `out:${entry.sourceNode}|${entry.sourcePort}`;
    const portal = ensurePortal("out", key, entry.sourcePort);
    const c = entry.connection;
    if (!c) continue;
    const outsideNode = entry.destinationNode;
    const outsidePort = entry.destinationPort;
    if (!Array.isArray(patch.connections)) patch.connections = [];
    if (!portalFed.has(portal.id)) {
      // Child → portal In (reuse this wire).
      c.destinationNode = portal.id;
      c.destinationPort = "In";
      if (c.targetNode) c.targetNode = portal.id;
      if (c.targetPort) c.targetPort = "In";
      portalFed.add(portal.id);
      patch.connections.push({
        sourceNode: portal.id,
        sourcePort: "Out",
        destinationNode: outsideNode,
        destinationPort: outsidePort,
      });
    } else {
      // Same child port → another outside: retarget this wire as portal Out → outside.
      c.sourceNode = portal.id;
      c.sourcePort = "Out";
    }
  }

  payload.boundary = boundary;
  delete payload.pendingBoundary;
  return boundary;
}

function nodeGraphMetamoduleBoundsOfNodes(nodes) {
  let minGx = Infinity;
  let minGy = Infinity;
  let maxGx = -Infinity;
  let maxGy = -Infinity;
  for (const node of nodes) {
    const gx = Number(node?.gx);
    const gy = Number(node?.gy);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    minGx = Math.min(minGx, gx);
    minGy = Math.min(minGy, gy);
    maxGx = Math.max(maxGx, gx);
    maxGy = Math.max(maxGy, gy);
  }
  if (!Number.isFinite(minGx)) {
    return { gx: 0, gy: 0 };
  }
  return {
    gx: Math.round((minGx + maxGx) / 2),
    gy: Math.round((minGy + maxGy) / 2),
  };
}

/**
 * Group current multi-selection into a Metamodule shell.
 * Claims children, portalizes crossing signal wires, enters inner view.
 */
function groupNodeGraphSelectionIntoMetamodule() {
  if (!nodeGraphSelectionCanGroupIntoMetamodule()) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Select one or more root modules to group.");
    }
    return null;
  }
  const patch = nodeGraphMvp?.patch;
  if (!patch || !Array.isArray(patch.nodes)) return null;

  const selectedIds = typeof nodeGraphSelectedNodeIdsInOrder === "function"
    ? nodeGraphSelectedNodeIdsInOrder()
    : [...nodeGraphSelectedNodeIds()];
  const children = selectedIds
    .map((id) => (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null))
    .filter(Boolean);
  if (!children.length) return null;

  const bounds = nodeGraphMetamoduleBoundsOfNodes(children);
  const metaId = nodeGraphNextMetamoduleId(patch);
  const idSet = new Set(selectedIds);
  const crossing = nodeGraphMetamoduleCrossingConnections(idSet, patch);

  const metaNode = typeof createNodeGraphPatchNode === "function"
    ? createNodeGraphPatchNode(NODE_GRAPH_METAMODULE_TYPE, {
      id: metaId,
      gx: bounds.gx,
      gy: bounds.gy,
      alias: "Metamodule",
      params: {
        voices: 4,
        playmode: 0, // Off
      },
    })
    : {
      id: metaId,
      type: NODE_GRAPH_METAMODULE_TYPE,
      gx: bounds.gx,
      gy: bounds.gy,
      alias: "Metamodule",
      params: { voices: 4, playmode: 0 },
      paramMeta: {},
    };

  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  payload.displays = children.map((child, order) => ({
    childId: child.id,
    enabled: false,
    order,
  }));
  payload.boundary = [];

  // Claim children.
  for (const child of children) {
    child.ownerMetamoduleId = metaId;
  }

  patch.nodes.push(metaNode);
  if (nodeGraphMvp.activeNodes instanceof Set) {
    nodeGraphMvp.activeNodes.add(metaId);
  }

  nodeGraphMetamodulePortalizeCrossing(metaNode, crossing, children, patch);

  // Stay on Root — user enters with a double-click on the Metamodule face.
  nodeGraphMvp.metamoduleViewStack = [];
  if (typeof updateNodeGraphMetamoduleBreadcrumb === "function") {
    updateNodeGraphMetamoduleBreadcrumb();
  }

  // MUST rebuild DOM: visibility-only sync leaves new shell/portals unmounted
  // (Hypersaw hides via owner, meta exists in patch but stays invisible until
  // something else calls applyNodeGraphPatchToDom — e.g. dragging a module).
  if (typeof commitNodeGraphPatch === "function") {
    commitNodeGraphPatch(patch, {
      status: "group into metamodule",
      topologyEdit: true,
    });
  } else if (typeof applyNodeGraphPatchToDom === "function") {
    applyNodeGraphPatchToDom();
    if (typeof noteNodeGraphHeavyHistoryAction === "function") {
      noteNodeGraphHeavyHistoryAction("group");
    }
  }

  if (typeof selectNodeGraphItem === "function") {
    selectNodeGraphItem({ type: "node", id: metaId });
  } else {
    nodeGraphMvp.selected = { type: "node", id: metaId };
  }

  // Visibility + cull wake after mount (children hidden, shell shown).
  nodeGraphSyncMetamoduleVisibilityToDom();

  const portalCount = (payload.boundary || []).filter((b) => b && b.id).length;
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      portalCount
        ? `Grouped ${children.length} into Metamodule (${portalCount} portals). Double-click to enter.`
        : `Grouped ${children.length} into Metamodule. Double-click to enter.`,
    );
  }
  return metaNode;
}

/**
 * Reverse portalize for one metamoduleIn/Out: stitch Outside↔Child, drop portal wires.
 * Mutates patch.connections in place. Returns true if any stitch was made.
 */
function nodeGraphMetamoduleStitchPortalOut(portalId, patch) {
  if (!portalId || !patch) return false;
  if (!Array.isArray(patch.connections)) patch.connections = [];
  const connections = patch.connections;
  const inbound = [];
  const outbound = [];
  for (const c of connections) {
    if (!c) continue;
    const dst = String(c.destinationNode || c.targetNode || "");
    const dstPort = String(c.destinationPort || c.targetPort || "");
    const src = String(c.sourceNode || "");
    const srcPort = String(c.sourcePort || "");
    if (dst === portalId && dstPort === "In") inbound.push(c);
    if (src === portalId && srcPort === "Out") outbound.push(c);
  }
  let stitched = false;
  for (const inWire of inbound) {
    for (const outWire of outbound) {
      const sourceNode = String(inWire.sourceNode || "");
      const sourcePort = String(inWire.sourcePort || "");
      const destinationNode = String(outWire.destinationNode || outWire.targetNode || "");
      const destinationPort = String(outWire.destinationPort || outWire.targetPort || "");
      if (!sourceNode || !destinationNode) continue;
      // Skip leftover portal↔portal edges.
      if (sourceNode === portalId || destinationNode === portalId) continue;
      const exists = connections.some((w) =>
        w
        && String(w.sourceNode || "") === sourceNode
        && String(w.sourcePort || "") === sourcePort
        && String(w.destinationNode || w.targetNode || "") === destinationNode
        && String(w.destinationPort || w.targetPort || "") === destinationPort
      );
      if (!exists) {
        connections.push({
          sourceNode,
          sourcePort,
          destinationNode,
          destinationPort,
        });
        stitched = true;
      }
    }
  }
  return stitched;
}

/**
 * Ungroup one Metamodule in place: clear child ownership, stitch portals out,
 * remove Meta In/Out + shell. Mutates `patch`. Returns removed node ids.
 */
function ungroupNodeGraphMetamoduleInPlace(metaId, patch = nodeGraphMvp?.patch) {
  const id = String(metaId || "");
  if (!id || !patch || !Array.isArray(patch.nodes)) return [];
  const meta = typeof nodeGraphPatchNode === "function"
    ? (patch === nodeGraphMvp?.patch ? nodeGraphPatchNode(id) : patch.nodes.find((n) => n?.id === id))
    : patch.nodes.find((n) => n?.id === id);
  if (!nodeGraphIsMetamoduleType(meta?.type)) return [];

  const payload = nodeGraphEnsureMetamodulePayload(meta);
  const portalIds = new Set();
  for (const entry of payload.boundary || []) {
    if (entry?.id) portalIds.add(String(entry.id));
  }
  for (const node of patch.nodes) {
    if (String(node?.ownerMetamoduleId || "") !== id) continue;
    if (nodeGraphIsMetamoduleBoundaryType(node?.type)) {
      portalIds.add(String(node.id));
    }
  }

  for (const portalId of portalIds) {
    nodeGraphMetamoduleStitchPortalOut(portalId, patch);
  }

  const removeIds = new Set([id, ...portalIds]);
  const touchesRemoved = (nodeId) => removeIds.has(String(nodeId || ""));

  if (Array.isArray(patch.connections)) {
    patch.connections = patch.connections.filter((c) =>
      c
      && !touchesRemoved(c.sourceNode)
      && !touchesRemoved(c.destinationNode)
      && !touchesRemoved(c.targetNode)
    );
  }
  if (Array.isArray(patch.modulations)) {
    patch.modulations = patch.modulations.filter((c) =>
      c
      && !touchesRemoved(c.sourceNode)
      && !touchesRemoved(c.destinationNode)
    );
  }
  if (Array.isArray(patch.graphConnections)) {
    patch.graphConnections = patch.graphConnections.filter((c) =>
      c
      && !touchesRemoved(c.sourceNode)
      && !touchesRemoved(c.destinationNode)
    );
  }

  // Free children (and any leftover owned nodes) back to Root.
  for (const node of patch.nodes) {
    if (String(node?.ownerMetamoduleId || "") === id) {
      delete node.ownerMetamoduleId;
    }
  }

  patch.nodes = patch.nodes.filter((node) => !removeIds.has(String(node?.id || "")));
  if (Array.isArray(patch.bypassedNodes)) {
    patch.bypassedNodes = patch.bypassedNodes.filter((nodeId) => !removeIds.has(String(nodeId)));
  }
  if (nodeGraphMvp?.activeNodes instanceof Set) {
    for (const removedId of removeIds) {
      nodeGraphMvp.activeNodes.delete(removedId);
    }
  }

  // Leave inner view if we just dissolved the open metamodule.
  const stack = nodeGraphMetamoduleViewStack();
  if (stack.includes(id)) {
    nodeGraphMvp.metamoduleViewStack = stack.filter((entry) => entry !== id);
    if (typeof updateNodeGraphMetamoduleBreadcrumb === "function") {
      updateNodeGraphMetamoduleBreadcrumb();
    }
  }

  return [...removeIds];
}

/**
 * Delete Metamodule shell → ungroup (preserve children). Called from delete path.
 * Returns true if at least one metamodule was ungrouped.
 */
function ungroupNodeGraphMetamodulesInPatch(metaIds, patch) {
  const ids = [...(metaIds || [])].map(String).filter(Boolean);
  if (!ids.length || !patch) return false;
  let any = false;
  for (const metaId of ids) {
    const removed = ungroupNodeGraphMetamoduleInPlace(metaId, patch);
    if (removed.length) any = true;
  }
  return any;
}

function enterNodeGraphMetamoduleView(metamoduleId) {
  const id = String(metamoduleId || "");
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!nodeGraphIsMetamoduleType(node?.type)) return false;
  nodeGraphRepairMetamoduleOwnership();
  // One level only.
  nodeGraphMvp.metamoduleViewStack = [id];
  updateNodeGraphMetamoduleBreadcrumb();
  nodeGraphRefreshMetamoduleViewDom();
  if (typeof setNodeInteractionHelp === "function") {
    const title = (typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(node?.alias)
      : String(node?.alias || "").trim())
      || "Metamodule";
    setNodeInteractionHelp(`Inside ${title}. Click Root in the breadcrumb to leave.`);
  }
  return true;
}

function exitNodeGraphMetamoduleViewToRoot() {
  const leavingId = nodeGraphMetamoduleViewId();
  nodeGraphMvp.metamoduleViewStack = [];
  updateNodeGraphMetamoduleBreadcrumb();
  // Rebuild shell jacks from boundary (visibility sync alone does not remount ports).
  if (leavingId && typeof nodeGraphMetamoduleRefreshShellFromBoundary === "function") {
    nodeGraphMetamoduleRefreshShellFromBoundary(leavingId);
  }
  nodeGraphRefreshMetamoduleViewDom();
  // Resume additive display mirrors on the shell (children are hidden again).
  if (typeof nodeGraphMetamoduleRefreshAllMirrors === "function") {
    nodeGraphMetamoduleRefreshAllMirrors();
  }
}

function updateNodeGraphMetamoduleBreadcrumb() {
  const readout = document.getElementById("nodeBuildNumberReadout");
  if (!readout) return;
  const versionEl = readout.querySelector("[data-sandbox-version]");
  const buildEl = readout.querySelector("[data-build-number-value]");
  const tokenEl = readout.querySelector("[data-build-token-value]");
  const viewId = nodeGraphMetamoduleViewId();
  if (!viewId) {
    // Restore version lines if we stashed them.
    if (readout.dataset.metaBreadcrumb === "1") {
      if (versionEl && readout.dataset.stashVersion) {
        versionEl.textContent = readout.dataset.stashVersion;
      }
      if (buildEl && readout.dataset.stashBuild) {
        buildEl.textContent = readout.dataset.stashBuild;
      }
      if (tokenEl && readout.dataset.stashToken != null) {
        tokenEl.textContent = readout.dataset.stashToken;
      }
      delete readout.dataset.metaBreadcrumb;
      readout.classList.remove("node-build-number-readout-breadcrumb");
      readout.removeAttribute("role");
      readout.onclick = null;
      readout.style.cursor = "";
    }
    return;
  }
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(viewId) : null;
  const title = (typeof normalizeNodeGraphPatchNodeAlias === "function"
    ? normalizeNodeGraphPatchNodeAlias(meta?.alias)
    : String(meta?.alias || "").trim())
    || "Metamodule";
  if (!readout.dataset.metaBreadcrumb) {
    readout.dataset.stashVersion = versionEl?.textContent || "";
    readout.dataset.stashBuild = buildEl?.textContent || "";
    readout.dataset.stashToken = tokenEl?.textContent || "";
    readout.dataset.metaBreadcrumb = "1";
  }
  if (versionEl) versionEl.textContent = "Root";
  if (buildEl) buildEl.textContent = "›";
  if (tokenEl) tokenEl.textContent = title;
  readout.classList.add("node-build-number-readout-breadcrumb");
  readout.style.cursor = "pointer";
  readout.title = "Click Root to leave Metamodule";
  readout.onclick = (event) => {
    const t = event.target;
    if (t && (t.matches?.("[data-sandbox-version]") || t.closest?.("[data-sandbox-version]"))) {
      exitNodeGraphMetamoduleViewToRoot();
    }
  };
}

// --- Exposed child parameters on the Metamodule shell ("Show metaparameter") ---

function nodeGraphMetamoduleExposeVisibilityKey(childId, paramKey) {
  return `${String(childId || "").trim()}|${String(paramKey || "").trim()}`;
}

function nodeGraphMetamoduleSanitizeExposeToken(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "_");
}

/** Stable synthetic param key on the shell: mx_<childId>__<paramKey> */
function nodeGraphMetamoduleExposeParamKey(childId, paramKey) {
  const child = nodeGraphMetamoduleSanitizeExposeToken(childId);
  const key = nodeGraphMetamoduleSanitizeExposeToken(paramKey);
  if (!child || !key) return "";
  return `mx_${child}__${key}`;
}

function nodeGraphMetamoduleParseExposeParamKey(synthKey) {
  const raw = String(synthKey || "").trim();
  const m = /^mx_(.+)__(.+)$/.exec(raw);
  if (!m) return null;
  return { childId: m[1].replace(/_/g, (ch, i, s) => ch), paramKey: m[2], synthKey: raw, childToken: m[1], paramToken: m[2] };
}

/**
 * Parse may lose hyphens in child ids (sanitized to _). Resolve by matching
 * owned children whose sanitized id equals the token.
 */
function nodeGraphMetamoduleResolveExposeTarget(metaNode, synthKey, patch = nodeGraphMvp?.patch) {
  const parsed = nodeGraphMetamoduleParseExposeParamKey(synthKey);
  if (!parsed || !metaNode) return null;
  const metaId = String(metaNode.id || "");
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const child = nodes.find((n) => {
    if (!n || String(n.ownerMetamoduleId || "") !== metaId) return false;
    return nodeGraphMetamoduleSanitizeExposeToken(n.id) === parsed.childToken;
  });
  if (!child) return null;
  // Static defs only (avoid recursing into metamodule expose expansion).
  const defs = nodeGraphModuleDefinitions[child.type]?.parameters || [];
  let paramKey = parsed.paramToken;
  const hit = defs.find((p) => nodeGraphMetamoduleSanitizeExposeToken(p.key) === parsed.paramToken);
  if (hit) paramKey = hit.key;
  return { childId: child.id, paramKey, child, synthKey: parsed.synthKey };
}

function nodeGraphMetamoduleIsParamExposed(metaNode, childId, paramKey) {
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  if (!payload) return false;
  const key = nodeGraphMetamoduleExposeVisibilityKey(childId, paramKey);
  return payload.paramVisibility[key] === true;
}

function nodeGraphMetamoduleSetParamExposed(metaNode, childId, paramKey, exposed) {
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  if (!payload) return false;
  const key = nodeGraphMetamoduleExposeVisibilityKey(childId, paramKey);
  if (exposed) payload.paramVisibility[key] = true;
  else delete payload.paramVisibility[key];
  return true;
}

function nodeGraphMetamoduleListExposedParamEntries(metaNode, patch = nodeGraphMvp?.patch) {
  const payload = nodeGraphEnsureMetamodulePayload(metaNode);
  if (!payload) return [];
  const metaId = String(metaNode?.id || "");
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const out = [];
  for (const [visKey, on] of Object.entries(payload.paramVisibility || {})) {
    if (on !== true) continue;
    const split = String(visKey).split("|");
    if (split.length < 2) continue;
    const childId = split[0];
    const paramKey = split.slice(1).join("|");
    const child = nodes.find((n) => n?.id === childId && String(n.ownerMetamoduleId || "") === metaId);
    if (!child) continue;
    out.push({ childId, paramKey, child, synthKey: nodeGraphMetamoduleExposeParamKey(childId, paramKey) });
  }
  return out;
}

/** Synthetic parameter defs appended to the Metamodule shell list. */
function nodeGraphMetamoduleExposedParameterDefinitions(metaNode, patch = nodeGraphMvp?.patch) {
  const entries = nodeGraphMetamoduleListExposedParamEntries(metaNode, patch);
  const defs = [];
  for (const entry of entries) {
    // Static module defs only — never call PatchNodeParameterDefinitions here
    // (that expands metamodule exposes and would recurse).
    const baseDefs = nodeGraphModuleDefinitions[entry.child?.type]?.parameters || [];
    const src = baseDefs.find((p) => p.key === entry.paramKey);
    if (!src) continue;
    const childAlias = typeof normalizeNodeGraphPatchNodeAlias === "function"
      ? normalizeNodeGraphPatchNodeAlias(entry.child.alias)
      : String(entry.child.alias || "").trim();
    const paramAlias = typeof normalizeNodeGraphPatchMetadataAlias === "function"
      ? normalizeNodeGraphPatchMetadataAlias(entry.child.paramMeta?.[entry.paramKey]?.alias)
      : "";
    const label = paramAlias
      || (childAlias ? `${childAlias} ${src.label || entry.paramKey}` : (src.label || entry.paramKey));
    defs.push({
      ...src,
      key: entry.synthKey,
      label,
      defaultLabel: src.label || entry.paramKey,
      metaExpose: { childId: entry.childId, paramKey: entry.paramKey },
      // Keep modulation jack unless child disabled it.
      modulation: src.modulation !== false,
    });
  }
  return defs;
}

function nodeGraphMetamoduleRemountShellParameters(metaId) {
  const id = String(metaId || "");
  const meta = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!nodeGraphIsMetamoduleType(meta?.type)) return false;
  nodeGraphMetamoduleSeedExposedParamsFromChildren(meta);
  // Expose rows can grow content past a stale stored heightGu — drop it so
  // MetamoduleLayout outer height follows content + 2px clearance.
  if (
    Number.isFinite(Number(meta.heightGu))
    && typeof nodeGraphModuleGridHeightUnitsForUi === "function"
  ) {
    const contentOuter = nodeGraphModuleGridHeightUnitsForUi(meta.type, meta.ui, meta);
    if (Number(meta.heightGu) < contentOuter) {
      delete meta.heightGu;
    }
  }
  if (typeof applyNodeGraphModuleElementFromPatch === "function") {
    applyNodeGraphModuleElementFromPatch(meta);
  }
  if (typeof scheduleNodeGraphWireRedrawAfterLayout === "function") {
    scheduleNodeGraphWireRedrawAfterLayout();
  }
  return true;
}

/** Write shell expose slider through to the owned child param. */
function nodeGraphMetamoduleSyncExposedParamFromShell(metaNode, synthKey, value, patch = nodeGraphMvp?.patch) {
  const target = nodeGraphMetamoduleResolveExposeTarget(metaNode, synthKey, patch);
  if (!target?.child) return false;
  const child = target.child;
  const meta = child.paramMeta?.[target.paramKey] || null;
  const next = typeof normalizeNodeGraphPatchParameter === "function"
    ? normalizeNodeGraphPatchParameter(child.type, target.paramKey, value, meta)
    : Number(value);
  if (next == null || !Number.isFinite(Number(next))) return false;
  child.params = { ...(child.params || {}), [target.paramKey]: next };
  if (metaNode) {
    metaNode.params = { ...(metaNode.params || {}), [synthKey]: next };
  }
  return true;
}

/**
 * Child param edited → update owning metamodule shell params + mounted slider DOM.
 */
function nodeGraphMetamoduleSyncShellFromChild(childNode, paramKey, patch = nodeGraphMvp?.patch) {
  const childId = String(childNode?.id || "");
  const key = String(paramKey || "").trim();
  const ownerId = String(childNode?.ownerMetamoduleId || "").trim();
  if (!childId || !key || !ownerId) return false;
  const meta = (patch?.nodes || []).find((n) => n?.id === ownerId);
  if (!nodeGraphIsMetamoduleType(meta?.type)) return false;
  if (!nodeGraphMetamoduleIsParamExposed(meta, childId, key)) return false;
  const synthKey = nodeGraphMetamoduleExposeParamKey(childId, key);
  if (!synthKey) return false;
  const raw = Number(childNode.params?.[key]);
  if (!Number.isFinite(raw)) return false;
  meta.params = { ...(meta.params || {}), [synthKey]: raw };
  const shellEl = typeof document !== "undefined"
    ? document.querySelector(`.dsp-node[data-node="${CSS.escape(ownerId)}"]`)
    : null;
  const input = shellEl?.querySelector?.(`input[data-param="${CSS.escape(synthKey)}"]`);
  if (input) {
    if (typeof applyNodeGraphInputUnboundedValue === "function") {
      applyNodeGraphInputUnboundedValue(input, raw);
    } else {
      input.dataset.domainValue = String(raw);
      input.value = String(raw);
    }
    if (typeof syncNodeSliderReadout === "function") {
      syncNodeSliderReadout(input);
    }
  }
  return true;
}

/** Seed all exposed shell params from children (load / remount / apply). */
function nodeGraphMetamoduleSeedExposedParamsFromChildren(metaNode, patch = nodeGraphMvp?.patch) {
  if (!nodeGraphIsMetamoduleType(metaNode?.type)) return 0;
  const entries = nodeGraphMetamoduleListExposedParamEntries(metaNode, patch);
  metaNode.params = { ...(metaNode.params || {}) };
  let n = 0;
  for (const entry of entries) {
    const v = Number(entry.child?.params?.[entry.paramKey]);
    if (!Number.isFinite(v)) continue;
    metaNode.params[entry.synthKey] = v;
    n += 1;
  }
  return n;
}
