const nodeGraphWireTypes = Object.freeze({
  cable: "cable",
  trace: "trace",
});

function normalizeNodeGraphWireType(value) {
  return Object.values(nodeGraphWireTypes).includes(value)
    ? value
    : nodeGraphWireTypes.cable;
}

function nodeGraphWireTypePatchValue(value) {
  const wireType = normalizeNodeGraphWireType(value);
  return wireType === nodeGraphWireTypes.cable ? undefined : wireType;
}

/** Manual pixel-wire flag (right-click wire panel). Off by default; never auto. */
function normalizeNodeGraphWirePixel(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

/** Persist only when true (omit from patch when false). */
function nodeGraphWirePixelPatchValue(value) {
  return normalizeNodeGraphWirePixel(value) ? true : undefined;
}

/** Shared optional fields for connections / modulations / graph wires. */
function nodeGraphWireOptionalPatchFields(wireOrOptions = {}) {
  const fields = {};
  const wireType = nodeGraphWireTypePatchValue(wireOrOptions.wireType);
  if (wireType) {
    fields.wireType = wireType;
  }
  if (nodeGraphWirePixelPatchValue(wireOrOptions.pixelWire ?? wireOrOptions.pixel)) {
    fields.pixelWire = true;
  }
  const tracePoints = typeof normalizeNodeGraphTracePoints === "function"
    ? normalizeNodeGraphTracePoints(wireOrOptions.tracePoints)
    : [];
  if (tracePoints.length) {
    fields.tracePoints = tracePoints;
  }
  return fields;
}

function setSelectedNodeGraphWirePixel(enabled) {
  const selection = nodeGraphMvp.selected;
  const selectedWire = nodeGraphWireFromSelection(selection);
  if (!selectedWire) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const collection = selectedWire.kind === "graph"
    ? patch.graphConnections
    : selectedWire.kind === "modulation"
      ? patch.modulations
      : patch.connections;
  const wire = collection[selectedWire.index];
  if (!wire) {
    return false;
  }

  const next = Boolean(enabled);
  if (next) {
    wire.pixelWire = true;
  } else {
    delete wire.pixelWire;
  }
  commitNodeGraphPatch(patch, {
    status: next ? "wire set to pixel" : "wire set to vector",
    wireEdit: true,
  });
  setNodeGraphSelection(selection);
  configureNodeSceneContextMenu("wire");
  return true;
}

function nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options = {}) {
  if (sourceNode !== destinationNode || options.wireType || options.tracePoints?.length) {
    return options;
  }
  return {
    ...options,
    wireType: nodeGraphWireTypes.trace,
  };
}

function setSelectedNodeGraphWireType(wireType) {
  const selection = nodeGraphMvp.selected;
  const selectedWire = nodeGraphWireFromSelection(selection);
  if (!selectedWire) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const collection = selectedWire.kind === "graph"
    ? patch.graphConnections
    : selectedWire.kind === "modulation"
      ? patch.modulations
      : patch.connections;
  const wire = collection[selectedWire.index];
  if (!wire) {
    return false;
  }

  const nextType = normalizeNodeGraphWireType(wireType);
  if (nextType === nodeGraphWireTypes.cable) {
    delete wire.wireType;
    delete wire.tracePoints;
  } else {
    wire.wireType = nextType;
  }
  commitNodeGraphPatch(patch, { status: `wire set to ${nextType}`, wireEdit: true });
  setNodeGraphSelection(selection);
  configureNodeSceneContextMenu("wire");
  return true;
}

function disconnectNodeGraphConnection(index, kind = "signal") {
  disconnectNodeGraphConnections([{ kind, index }]);
}

/**
 * Remove one or more wires in a single patch commit.
 * @param {Array<{ kind?: string, index: number }>} entries
 * @param {{ status?: string }} [options]
 * @returns {number} how many wires were removed
 */
function disconnectNodeGraphConnections(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 0;
  }
  const signal = new Set();
  const modulation = new Set();
  const graph = new Set();
  for (const entry of entries) {
    const index = Number(entry?.index);
    if (!Number.isInteger(index) || index < 0) {
      continue;
    }
    const kind = entry.kind || "signal";
    if (kind === "graph") {
      graph.add(index);
    } else if (kind === "modulation") {
      modulation.add(index);
    } else {
      signal.add(index);
    }
  }
  if (!signal.size && !modulation.size && !graph.size) {
    return 0;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let removed = 0;
  if (signal.size) {
    const before = patch.connections.length;
    patch.connections = patch.connections.filter((_connection, connectionIndex) => !signal.has(connectionIndex));
    removed += before - patch.connections.length;
  }
  if (modulation.size) {
    const before = patch.modulations.length;
    patch.modulations = patch.modulations.filter((_modulation, modulationIndex) => !modulation.has(modulationIndex));
    removed += before - patch.modulations.length;
  }
  if (graph.size) {
    const before = patch.graphConnections.length;
    patch.graphConnections = patch.graphConnections.filter((_connection, connectionIndex) => !graph.has(connectionIndex));
    removed += before - patch.graphConnections.length;
  }
  if (!removed) {
    return 0;
  }

  // Selection indices for the removed kinds are no longer valid — clear wire selection.
  const selection = nodeGraphMvp.selected;
  if (selection?.type === "wire" || selection?.type === "wires") {
    setNodeGraphSelection(null);
  }

  const status = options.status
    || (removed === 1 ? "wire disconnected" : `${removed} wires disconnected`);
  commitNodeGraphPatch(patch, { status, wireEdit: true });
  if (typeof triggerNodeGraphWireDisconnectEvent === "function") {
    if (signal.size) {
      triggerNodeGraphWireDisconnectEvent("signal");
    }
    if (modulation.size) {
      triggerNodeGraphWireDisconnectEvent("modulation");
    }
    if (graph.size) {
      triggerNodeGraphWireDisconnectEvent("graph");
    }
  }
  return removed;
}

function connectNodeGraphGraphInput(sourceNode, sourcePort, destinationNode, destinationGraphInput, options = {}) {
  if (
    !nodeGraphMvp.activeNodes.has(sourceNode) ||
    !nodeGraphMvp.activeNodes.has(destinationNode)
  ) {
    return false;
  }

  const source = nodeGraphPatchNode(sourceNode);
  const destination = nodeGraphPatchNode(destinationNode);
  const canonicalSourcePort = nodeGraphCanonicalOutputPort(source?.type, sourcePort);
  if (
    !nodeGraphModuleIsGraphType(source?.type) ||
    canonicalSourcePort !== "Out" ||
    !nodeGraphModuleGraphInputs(destination?.type).includes(destinationGraphInput)
  ) {
    return false;
  }

  const duplicateIndex = nodeGraphMvp.patch.graphConnections.findIndex(
    (connection) =>
      connection.sourceNode === sourceNode &&
      connection.sourcePort === canonicalSourcePort &&
      connection.destinationNode === destinationNode &&
      connection.destinationGraphInput === destinationGraphInput,
  );
  if (duplicateIndex >= 0 && !options.replaceDuplicate) {
    return false;
  }

  const effectiveOptions = nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const nextWireData = nodeGraphWireOptionalPatchFields(effectiveOptions);
  if (duplicateIndex >= 0) {
    patch.graphConnections[duplicateIndex] = {
      ...patch.graphConnections[duplicateIndex],
      ...nextWireData,
    };
    commitNodeGraphPatch(patch, { status: "graph wire traced", wireEdit: true });
    return true;
  }
  patch.graphConnections.push({
    destinationGraphInput,
    destinationNode,
    sourceNode,
    sourcePort: canonicalSourcePort,
    ...nextWireData,
  });
  commitNodeGraphPatch(patch, { status: "graph connected", wireEdit: true });
  if (typeof triggerNodeGraphWireConnectEvent === "function") {
    triggerNodeGraphWireConnectEvent("graph");
  }
  return true;
}

/**
 * Double-connection (auto-pair) port groups.
 * Connecting one side of a pair also connects the sibling when both modules
 * expose matching ports. Same role (0=L/X, 1=R/Y) + same group → auto-pair.
 *
 * All stereo L/R-style names share stereo-xy-lr so Wet L→Left also wires
 * Wet R→Right (and Dry L/R, X/Y, Left Out/Right Out, legacy Mix/Dry names).
 * Sibling lists are preferred names on the *same* module (own pair first).
 *
 * Groups:
 *   stereo-xy-lr  — X/Left/Wet L/Dry L/…  ↔  Y/Right/Wet R/Dry R/…
 *   ab            — A  ↔  B
 *   rgb           — R/Red ↔ G/Green ↔ B/Blue (see nodeGraphAutoPairRgbConnections)
 */
function nodeGraphPortPairMeta(port) {
  const original = String(port || "").trim();
  const key = original.toLowerCase();
  if (!key) {
    return null;
  }
  // role 0 = left/X side; role 1 = right/Y side. siblings = opposite-side names
  // preferred on the same module (first existing wins). Exact module port case.
  const table = {
    x: { group: "stereo-xy-lr", role: 0, siblings: ["Y", "Right", "R", "Wet R", "Dry R", "Mix R", "Right Out", "Bi Y", "Uni Y"] },
    left: { group: "stereo-xy-lr", role: 0, siblings: ["Right", "R", "Y", "Wet R", "Dry R", "Mix R", "Right Out", "Bi Y", "Uni Y"] },
    y: { group: "stereo-xy-lr", role: 1, siblings: ["X", "Left", "L", "Wet L", "Dry L", "Mix L", "Left Out", "Bi X", "Uni X"] },
    right: { group: "stereo-xy-lr", role: 1, siblings: ["Left", "L", "X", "Wet L", "Dry L", "Mix L", "Left Out", "Bi X", "Uni X"] },
    // RoundShape uni/bi quadrature pairs
    "bi x": { group: "stereo-xy-lr", role: 0, siblings: ["Bi Y", "Y", "Right", "R", "Uni Y"] },
    "bi y": { group: "stereo-xy-lr", role: 1, siblings: ["Bi X", "X", "Left", "L", "Uni X"] },
    "uni x": { group: "stereo-xy-lr", role: 0, siblings: ["Uni Y", "Y", "Right", "R", "Bi Y"] },
    "uni y": { group: "stereo-xy-lr", role: 1, siblings: ["Uni X", "X", "Left", "L", "Bi X"] },
    a: { group: "ab", role: 0, siblings: ["B"] },
    b: { group: "ab", role: 1, siblings: ["A"] },
    // Space FX dry pair (SoEm / Sabrina) — own pair first, then generic stereo
    "dry l": { group: "stereo-xy-lr", role: 0, siblings: ["Dry R", "Right Dry", "Right", "R", "Y", "Wet R", "Mix R"] },
    "dry r": { group: "stereo-xy-lr", role: 1, siblings: ["Dry L", "Left Dry", "Left", "L", "X", "Wet L", "Mix L"] },
    "left dry": { group: "stereo-xy-lr", role: 0, siblings: ["Right Dry", "Dry R", "Right", "R", "Y"] },
    "right dry": { group: "stereo-xy-lr", role: 1, siblings: ["Left Dry", "Dry L", "Left", "L", "X"] },
    // Space FX wet pair
    "wet l": { group: "stereo-xy-lr", role: 0, siblings: ["Wet R", "Right Wet", "Right Mix", "Mix R", "Right", "R", "Y", "Dry R"] },
    "wet r": { group: "stereo-xy-lr", role: 1, siblings: ["Wet L", "Left Wet", "Left Mix", "Mix L", "Left", "L", "X", "Dry L"] },
    "left wet": { group: "stereo-xy-lr", role: 0, siblings: ["Right Wet", "Wet R", "Right Mix", "Mix R", "Right", "Y"] },
    "right wet": { group: "stereo-xy-lr", role: 1, siblings: ["Left Wet", "Wet L", "Left Mix", "Mix L", "Left", "X"] },
    // Reverb / delay wet-mixed outs ("Mix L" / "Mix R")
    "mix l": { group: "stereo-xy-lr", role: 0, siblings: ["Mix R", "Right Mix", "Wet R", "Right Wet", "Right", "R", "Y"] },
    "mix r": { group: "stereo-xy-lr", role: 1, siblings: ["Mix L", "Left Mix", "Wet L", "Left Wet", "Left", "L", "X"] },
    // Legacy "Mix" word order
    "left mix": { group: "stereo-xy-lr", role: 0, siblings: ["Right Mix", "Mix R", "Wet R", "Right Wet", "Right", "Y"] },
    "right mix": { group: "stereo-xy-lr", role: 1, siblings: ["Left Mix", "Mix L", "Wet L", "Left Wet", "Left", "X"] },
    "left out": { group: "stereo-xy-lr", role: 0, siblings: ["Right Out", "Right", "R", "Y", "Wet R", "Dry R", "Mix R"] },
    "right out": { group: "stereo-xy-lr", role: 1, siblings: ["Left Out", "Left", "L", "X", "Wet L", "Dry L", "Mix L"] },
    // Crossover legacy Low/High L·R (spaced) — maps to LFL/LFR/HFL/HFR on module
    "low l": { group: "stereo-xy-lr", role: 0, siblings: ["Low R", "LFR", "R", "Right"] },
    "low r": { group: "stereo-xy-lr", role: 1, siblings: ["Low L", "LFL", "L", "Left"] },
    "high l": { group: "stereo-xy-lr", role: 0, siblings: ["High R", "HFR", "R", "Right"] },
    "high r": { group: "stereo-xy-lr", role: 1, siblings: ["High L", "HFL", "L", "Left"] },
    // Crossover low/high frequency outs — true pair first, then generic Left/Right
    lfl: { group: "stereo-xy-lr", role: 0, siblings: ["LFR", "Low R", "R", "Right"] },
    lfr: { group: "stereo-xy-lr", role: 1, siblings: ["LFL", "Low L", "L", "Left"] },
    hfl: { group: "stereo-xy-lr", role: 0, siblings: ["HFR", "High R", "R", "Right"] },
    hfr: { group: "stereo-xy-lr", role: 1, siblings: ["HFL", "High L", "L", "Left"] },
    // 3-way mid: ML / MR
    ml: { group: "stereo-xy-lr", role: 0, siblings: ["MR", "Mid R", "R1", "R", "Right"] },
    mr: { group: "stereo-xy-lr", role: 1, siblings: ["ML", "Mid L", "L1", "L", "Left"] },
    // Short stereo tags (module In L/R) — only exact single-letter L/R, not L2/HFL.
    l: { group: "stereo-xy-lr", role: 0, siblings: ["R", "Right", "Y", "Mix R", "Dry R", "Wet R"] },
    r: { group: "stereo-xy-lr", role: 1, siblings: ["L", "Left", "X", "Mix L", "Dry L", "Wet L"] },
  };
  if (table[key]) {
    return table[key];
  }

  // Crossover mid-bands: L1/R1 … L4/R4 (and higher). True pair first so L2→Left
  // also wires R2→Right (not a different band's R).
  const lNum = key.match(/^l(\d+)$/);
  if (lNum) {
    const n = lNum[1];
    return {
      group: "stereo-xy-lr",
      role: 0,
      siblings: [`R${n}`, `R ${n}`, `${n} R`, `${n} Right`, "Right", "R"],
    };
  }
  const rNum = key.match(/^r(\d+)$/);
  if (rNum) {
    const n = rNum[1];
    return {
      group: "stereo-xy-lr",
      role: 1,
      siblings: [`L${n}`, `L ${n}`, `${n} L`, `${n} Left`, "Left", "L"],
    };
  }

  // Trailing " L" / " R" / " Left" / " Right" on band/bus names.
  // Preserve original case of the base (e.g. "Low L" → sibling "Low R", not "low R").
  const spacedLeft = original.match(/^(.*?)(?:[ ]L|[ ]Left)$/i);
  if (spacedLeft) {
    const base = spacedLeft[1].trim();
    if (base) {
      return {
        group: "stereo-xy-lr",
        role: 0,
        siblings: [`${base} R`, `${base} Right`, "R", "Right", "Mix R", "Dry R", "Wet R"],
      };
    }
  }
  const spacedRight = original.match(/^(.*?)(?:[ ]R|[ ]Right)$/i);
  if (spacedRight) {
    const base = spacedRight[1].trim();
    if (base) {
      return {
        group: "stereo-xy-lr",
        role: 1,
        siblings: [`${base} L`, `${base} Left`, "L", "Left", "Mix L", "Dry L", "Wet L"],
      };
    }
  }

  return null;
}

/** @deprecated use nodeGraphPortPairMeta — kept for any external callers */
function nodeGraphEquivalentStereoPortName(port) {
  const meta = nodeGraphPortPairMeta(port);
  if (!meta || meta.group !== "stereo-xy-lr") {
    return "";
  }
  return meta.role === 0 ? "left-x" : "right-y";
}

/**
 * Natural stereo partner for crossover-style names (LFL↔LFR, HFL↔HFR, L2↔R2, …).
 * Used before generic Left/Right fallbacks so band outs pair correctly.
 */
function nodeGraphPortPairNaturalSiblingName(port) {
  const original = String(port || "").trim();
  if (!original) {
    return "";
  }
  const low = original.toLowerCase();
  if (low === "lfl") return "LFR";
  if (low === "lfr") return "LFL";
  if (low === "hfl") return "HFR";
  if (low === "hfr") return "HFL";
  if (low === "ml") return "MR";
  if (low === "mr") return "ML";
  const lNum = low.match(/^l(\d+)$/);
  if (lNum) {
    return `R${lNum[1]}`;
  }
  const rNum = low.match(/^r(\d+)$/);
  if (rNum) {
    return `L${rNum[1]}`;
  }
  return "";
}

/** First sibling name that exists on the given port list (case-insensitive). */
function nodeGraphPortPairSiblingOnModule(port, availablePorts = []) {
  const meta = nodeGraphPortPairMeta(port);
  if (!meta) {
    return "";
  }
  const ports = Array.isArray(availablePorts) ? availablePorts : [];
  // Map lower-case → original spelling so we wire the real port id.
  const byLower = new Map();
  for (const p of ports) {
    const name = String(p || "").trim();
    if (name && !byLower.has(name.toLowerCase())) {
      byLower.set(name.toLowerCase(), name);
    }
  }
  // Prefer the natural band pair (HFL↔HFR, L2↔R2) before generic L/R.
  const natural = nodeGraphPortPairNaturalSiblingName(port);
  if (natural) {
    const hit = byLower.get(natural.toLowerCase());
    if (hit) {
      return hit;
    }
  }
  for (const candidate of meta.siblings) {
    const hit = byLower.get(String(candidate || "").toLowerCase());
    if (hit) {
      return hit;
    }
  }
  return "";
}

/** @deprecated use nodeGraphPortPairSiblingOnModule */
function nodeGraphStereoPairSiblingPort(port) {
  const meta = nodeGraphPortPairMeta(port);
  return meta?.siblings?.[0] || "";
}

/**
 * When connecting one side of a dual port pair, also wire the sibling if both
 * modules have it. Works for either side (Left or Right / X or Y / A or B).
 */
/**
 * Signal I/O port names for auto-pair (definition outputs / inputs only —
 * exclude param keys that nodeGraphModuleOutputPorts may append).
 */
function nodeGraphAutoPairAvailablePorts(nodeId, side = "output") {
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  const type = patchNode?.type;
  const definition = typeof nodeGraphModuleDefinition === "function"
    ? nodeGraphModuleDefinition(type)
    : (typeof nodeGraphModuleDefinitions !== "undefined" ? nodeGraphModuleDefinitions[type] : null);
  if (side === "input") {
    if (typeof nodeGraphPatchNodeInputPorts === "function") {
      return nodeGraphPatchNodeInputPorts(nodeId) || [];
    }
    return definition?.inputs || [];
  }
  // Prefer pure signal outs (not param keys) so L2 pairs with R2, not a param named R.
  if (Array.isArray(definition?.outputs) && definition.outputs.length) {
    return definition.outputs.map((p) => String(p || "").trim()).filter(Boolean);
  }
  if (typeof nodeGraphPatchNodeOutputPorts === "function") {
    return nodeGraphPatchNodeOutputPorts(nodeId) || [];
  }
  return [];
}

const NODE_GRAPH_RGB_COLOR_PORT_NAMES = Object.freeze({
  red: Object.freeze(["R", "Red"]),
  green: Object.freeze(["G", "Green"]),
  blue: Object.freeze(["B", "Blue"]),
});

/** Color of an R/G/B or Red/Green/Blue jack. Never treats Right as red. */
function nodeGraphRgbNamedColor(port) {
  const key = String(port || "").trim();
  if (key === "R" || key === "Red" || key === "red") {
    return "red";
  }
  if (key === "G" || key === "Green" || key === "green") {
    return "green";
  }
  if (key === "B" || key === "Blue" || key === "blue") {
    return "blue";
  }
  return "";
}

function nodeGraphRgbChromeColor(type, port) {
  if (typeof nodeGraphOutletChannelKind !== "function") {
    return "";
  }
  const channel = nodeGraphOutletChannelKind(type, port, "output");
  if (channel === "left") {
    return "red";
  }
  if (channel === "mono") {
    return "green";
  }
  if (channel === "right") {
    return "blue";
  }
  return "";
}

function nodeGraphRgbSourcePortColor(type, port) {
  return nodeGraphRgbNamedColor(port) || nodeGraphRgbChromeColor(type, port);
}

function nodeGraphRgbPickNamedPort(availablePorts, color) {
  const names = NODE_GRAPH_RGB_COLOR_PORT_NAMES[color];
  if (!names) {
    return "";
  }
  const byLower = new Map();
  for (const p of availablePorts || []) {
    const name = String(p || "").trim();
    if (name && !byLower.has(name.toLowerCase())) {
      byLower.set(name.toLowerCase(), name);
    }
  }
  for (const candidate of names) {
    const hit = byLower.get(candidate.toLowerCase());
    if (!hit) {
      continue;
    }
    if (candidate.length === 1 && hit.length !== 1) {
      continue;
    }
    return hit;
  }
  return "";
}

/** Dest RGB input map when the module has all three color inlets. */
function nodeGraphRgbColorInputMap(availablePorts = []) {
  const map = {
    red: nodeGraphRgbPickNamedPort(availablePorts, "red"),
    green: nodeGraphRgbPickNamedPort(availablePorts, "green"),
    blue: nodeGraphRgbPickNamedPort(availablePorts, "blue"),
  };
  return map.red && map.green && map.blue ? map : null;
}

function nodeGraphRgbSourcePortForColor(type, availablePorts, color) {
  const named = nodeGraphRgbPickNamedPort(availablePorts, color);
  if (named) {
    return named;
  }
  const hits = [];
  for (const port of availablePorts || []) {
    if (nodeGraphRgbChromeColor(type, port) === color) {
      hits.push(port);
    }
  }
  if (!hits.length) {
    return "";
  }
  const axis = hits.find((port) => {
    const token = String(port || "").trim().toLowerCase().split(/[\s/_-]+/).filter(Boolean).pop();
    return token === "x" || token === "y" || token === "z";
  });
  return axis || hits[0];
}

function nodeGraphAutoPairHasConnection(patch, sourceNode, sourcePort, destinationNode, destinationPort) {
  return (patch?.connections || []).some(
    (connection) =>
      connection.sourceNode === sourceNode &&
      connection.sourcePort === sourcePort &&
      connection.destinationNode === destinationNode &&
      connection.destinationPort === destinationPort,
  );
}

function nodeGraphAutoPairPushConnection(patch, sourceNode, sourcePort, destinationNode, destinationPort, wireData = {}) {
  if (
    !sourcePort
    || !destinationPort
    || nodeGraphAutoPairHasConnection(patch, sourceNode, sourcePort, destinationNode, destinationPort)
  ) {
    return 0;
  }
  patch.connections.push({
    sourceNode,
    sourcePort,
    destinationNode,
    destinationPort,
    ...wireData,
  });
  return 1;
}

/**
 * RGB multi-connect: red→red on a module with RGB inlets also wires
 * green→green and blue→blue. Source color is the named R/G/B jack, or
 * outlet chrome (Left/X red, Mono/Z green, Right/Y blue).
 */
function nodeGraphAutoPairRgbConnections(patch, sourceNode, sourcePort, destinationNode, destinationPort, wireData = {}) {
  if (!patch) {
    return 0;
  }
  const destinationPorts = nodeGraphAutoPairAvailablePorts(destinationNode, "input");
  const destMap = nodeGraphRgbColorInputMap(destinationPorts);
  if (!destMap) {
    return 0;
  }
  const destColor = nodeGraphRgbNamedColor(destinationPort);
  if (!destColor || !Object.values(destMap).includes(destinationPort)) {
    return 0;
  }
  const source = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(sourceNode) : null;
  const sourceType = source?.type;
  const srcColor = nodeGraphRgbSourcePortColor(sourceType, sourcePort);
  if (!srcColor || srcColor !== destColor) {
    return 0;
  }
  const sourcePorts = nodeGraphAutoPairAvailablePorts(sourceNode, "output");
  let added = 0;
  for (const color of ["red", "green", "blue"]) {
    if (color === destColor) {
      continue;
    }
    const nextSourcePort = nodeGraphRgbSourcePortForColor(sourceType, sourcePorts, color);
    const nextDestinationPort = destMap[color];
    if (!nextSourcePort || !nextDestinationPort) {
      continue;
    }
    if (nextSourcePort === sourcePort || nextDestinationPort === destinationPort) {
      continue;
    }
    added += nodeGraphAutoPairPushConnection(
      patch,
      sourceNode,
      nextSourcePort,
      destinationNode,
      nextDestinationPort,
      wireData,
    );
  }
  return added;
}

function nodeGraphAutoPairPortConnections(patch, sourceNode, sourcePort, destinationNode, destinationPort, wireData = {}) {
  if (!patch) {
    return 0;
  }
  // RGB color jacks are not stereo Right/Left — handled by the RGB trio rule.
  if (nodeGraphRgbNamedColor(sourcePort) || nodeGraphRgbNamedColor(destinationPort)) {
    return 0;
  }
  const srcMeta = nodeGraphPortPairMeta(sourcePort);
  const dstMeta = nodeGraphPortPairMeta(destinationPort);
  // Same pair group and same role (both L-side or both R-side).
  if (!srcMeta || !dstMeta || srcMeta.group !== dstMeta.group || srcMeta.role !== dstMeta.role) {
    return 0;
  }
  const sourcePorts = nodeGraphAutoPairAvailablePorts(sourceNode, "output");
  const destinationPorts = nodeGraphAutoPairAvailablePorts(destinationNode, "input");
  const nextSourcePort = nodeGraphPortPairSiblingOnModule(sourcePort, sourcePorts);
  const nextDestinationPort = nodeGraphPortPairSiblingOnModule(destinationPort, destinationPorts);
  if (!nextSourcePort || !nextDestinationPort) {
    return 0;
  }
  // Never auto-pair a port to itself (e.g. broken L matching L).
  if (nextSourcePort === sourcePort || nextDestinationPort === destinationPort) {
    return 0;
  }
  const duplicate = patch.connections.some(
    (connection) =>
      connection.sourceNode === sourceNode &&
      connection.sourcePort === nextSourcePort &&
      connection.destinationNode === destinationNode &&
      connection.destinationPort === nextDestinationPort,
  );
  if (duplicate) {
    return 0;
  }
  patch.connections.push({
    sourceNode,
    sourcePort: nextSourcePort,
    destinationNode,
    destinationPort: nextDestinationPort,
    ...wireData,
  });
  return 1;
}

function connectNodeGraphPorts(sourceNode, sourcePort, destinationNode, destinationPort, options = {}) {
  if (
    !nodeGraphInputKey(destinationNode, destinationPort) ||
    !nodeGraphMvp.activeNodes.has(sourceNode) ||
    !nodeGraphMvp.activeNodes.has(destinationNode)
  ) {
    return false;
  }

  const duplicateIndex = nodeGraphMvp.patch.connections.findIndex(
    (connection) =>
      connection.sourceNode === sourceNode &&
      connection.sourcePort === sourcePort &&
      connection.destinationNode === destinationNode &&
      connection.destinationPort === destinationPort,
  );
  if (duplicateIndex >= 0 && !options.replaceDuplicate) {
    return false;
  }

  const effectiveOptions = nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const nextWireData = nodeGraphWireOptionalPatchFields(effectiveOptions);
  if (duplicateIndex >= 0) {
    patch.connections[duplicateIndex] = {
      ...patch.connections[duplicateIndex],
      ...nextWireData,
    };
    commitNodeGraphPatch(patch, { status: "wire traced", wireEdit: true });
    return true;
  }
  patch.connections.push({
    sourceNode,
    sourcePort,
    destinationNode,
    destinationPort,
    ...nextWireData,
  });
  let autoConnected = 0;
  if (options.autoPair !== false) {
    autoConnected += nodeGraphAutoPairRgbConnections(
      patch,
      sourceNode,
      sourcePort,
      destinationNode,
      destinationPort,
      nextWireData,
    );
    autoConnected += nodeGraphAutoPairPortConnections(
      patch,
      sourceNode,
      sourcePort,
      destinationNode,
      destinationPort,
      nextWireData,
    );
  }
  commitNodeGraphPatch(patch, { status: autoConnected ? `wire connected +${autoConnected}` : "wire connected", wireEdit: true });
  if (typeof triggerNodeGraphWireConnectEvent === "function") {
    triggerNodeGraphWireConnectEvent("signal");
  }
  return true;
}

function connectNodeGraphModulation(sourceNode, sourcePort, destinationNode, destinationParam, options = {}) {
  if (
    !nodeGraphMvp.activeNodes.has(sourceNode) ||
    !nodeGraphMvp.activeNodes.has(destinationNode)
  ) {
    return false;
  }

  const duplicateIndex = nodeGraphMvp.patch.modulations.findIndex(
    (modulation) =>
      modulation.sourceNode === sourceNode &&
      modulation.sourcePort === sourcePort &&
      modulation.destinationNode === destinationNode &&
      modulation.destinationParam === destinationParam,
  );
  if (duplicateIndex >= 0 && !options.replaceDuplicate) {
    return false;
  }

  const effectiveOptions = nodeGraphConnectionOptionsWithSelfTrace(sourceNode, destinationNode, options);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const nextWireData = nodeGraphWireOptionalPatchFields(effectiveOptions);
  if (duplicateIndex >= 0) {
    patch.modulations[duplicateIndex] = {
      ...patch.modulations[duplicateIndex],
      ...nextWireData,
    };
    commitNodeGraphPatch(patch, { status: "modulation traced", wireEdit: true });
    return true;
  }
  patch.modulations.push({
    sourceNode,
    sourcePort,
    destinationNode,
    destinationParam,
    ...nextWireData,
  });
  commitNodeGraphPatch(patch, { status: "modulation connected", wireEdit: true });
  if (typeof triggerNodeGraphWireConnectEvent === "function") {
    triggerNodeGraphWireConnectEvent("modulation");
  }
  return true;
}

function burstNodeGraphZap(point) {
  const surface = nodeGraphZoomSurface();
  if (!surface || !point) {
    return;
  }
  const colors = [
    ["#7fc7d9", "rgba(127, 199, 217, 0.7)"],
    ["#e2a86d", "rgba(226, 168, 109, 0.72)"],
    ["#ff6b6b", "rgba(255, 107, 107, 0.72)"],
  ];
  for (let index = 0; index < 8; index += 1) {
    const [color, glow] = colors[index % colors.length];
    const particle = document.createElement("span");
    particle.className = "node-zap-particle";
    particle.textContent = "\u2301";
    particle.style.left = `${point.x}px`;
    particle.style.top = `${point.y}px`;
    particle.style.setProperty("--zap-color", color);
    particle.style.setProperty("--zap-glow", glow);
    particle.style.setProperty("--zap-x", `${(index % 4 - 1.5) * 30}px`);
    particle.style.setProperty("--zap-y", `${-30 - Math.floor(index / 4) * 24}px`);
    particle.style.setProperty("--zap-rotate", `${index * 43 - 96}deg`);
    particle.style.setProperty("--zap-scale", `${1 + (index % 5) * 0.24}`);
    particle.style.animationDelay = `${index * 14}ms`;
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
    surface.append(particle);
  }
}
