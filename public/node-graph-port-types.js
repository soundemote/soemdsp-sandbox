/**
 * Strict cable port types (SSOT).
 *
 * Jack lists stay inputs/outputs (+ dataInputs/dataOutputs for legacy data-plane
 * modules). Types are metadata — never a second jack list.
 *
 * Types:
 *   audio      — default analog CV / audio (round)
 *   digital    — gate/trigger/reset-style (white round)
 *   noteMask   — note bus (square, bus colors)
 *   code       — text/curve payloads (white square)
 *   data       — generic non-audio data plane
 *   graphChunk — Additive Yellow Graph chunks (yellow)
 *   blockRate  — Additive cyan Parameter / once-per-quantum (cyan)
 *   texture    — TV/RGBA video-style taps (📺) — reserved / not fully implemented
 */
const NODE_GRAPH_PORT_TYPES = Object.freeze({
  audio: "audio",
  digital: "digital",
  noteMask: "noteMask",
  code: "code",
  data: "data",
  graphChunk: "graphChunk",
  blockRate: "blockRate",
  texture: "texture",
});

function nodeGraphNormalizePortType(value) {
  const key = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(NODE_GRAPH_PORT_TYPES, key)
    ? NODE_GRAPH_PORT_TYPES[key]
    : null;
}

function nodeGraphModuleDefinitionForPortType(typeOrNode) {
  const type = typeof typeOrNode === "string" && typeof nodeGraphModuleDefinitions === "object"
    ? typeOrNode
    : (typeof nodeGraphPatchNodeType === "function" ? nodeGraphPatchNodeType(typeOrNode) : null);
  return (typeof nodeGraphModuleDefinitions === "object" && type)
    ? nodeGraphModuleDefinitions[type]
    : null;
}

function nodeGraphPortNameLooksTexture(port) {
  const name = String(port || "").trim();
  const low = name.toLowerCase();
  return name === "📺" || low === "rgba" || low === "texture" || low === "video" || low === "tv";
}

/**
 * Resolve the strict port type for a module jack.
 * Prefer definition.portTypes[port]; else legacy lists / heuristics.
 */
function nodeGraphResolvePortType(typeOrNode, port, io = null) {
  const name = String(port || "").trim();
  if (!name) {
    return NODE_GRAPH_PORT_TYPES.audio;
  }
  const definition = nodeGraphModuleDefinitionForPortType(typeOrNode);
  const explicit = definition?.portTypes && nodeGraphNormalizePortType(definition.portTypes[name]);
  if (explicit) {
    return explicit;
  }

  if (typeof nodeGraphPortIsCodeSignal === "function" && nodeGraphPortIsCodeSignal(typeOrNode, name, io)) {
    return NODE_GRAPH_PORT_TYPES.code;
  }
  if (typeof nodeGraphPortIsNoteBus === "function" && nodeGraphPortIsNoteBus(name)) {
    return NODE_GRAPH_PORT_TYPES.noteMask;
  }
  if (typeof nodeGraphPortIsGraphChunkSignal === "function" && nodeGraphPortIsGraphChunkSignal(typeOrNode, name, io)) {
    return NODE_GRAPH_PORT_TYPES.graphChunk;
  }
  if (typeof nodeGraphPortIsBlockRateSignal === "function" && nodeGraphPortIsBlockRateSignal(typeOrNode, name, io)) {
    return NODE_GRAPH_PORT_TYPES.blockRate;
  }
  if (nodeGraphPortNameLooksTexture(name)) {
    return NODE_GRAPH_PORT_TYPES.texture;
  }
  if (typeof nodeGraphPortIsDigitalSignal === "function" && nodeGraphPortIsDigitalSignal(typeOrNode, name, io)) {
    // Code/note already handled; remaining digital → digital
    return NODE_GRAPH_PORT_TYPES.digital;
  }
  if (typeof nodeGraphPortIsDataPlane === "function" && nodeGraphPortIsDataPlane(typeOrNode, name, io)) {
    return NODE_GRAPH_PORT_TYPES.data;
  }
  return NODE_GRAPH_PORT_TYPES.audio;
}

/** Same type only. Modulation / graph-face io are handled by the wire controller separately. */
function nodeGraphPortTypesCompatible(typeA, typeB) {
  const a = nodeGraphNormalizePortType(typeA) || NODE_GRAPH_PORT_TYPES.audio;
  const b = nodeGraphNormalizePortType(typeB) || NODE_GRAPH_PORT_TYPES.audio;
  return a === b;
}

function nodeGraphEndpointPortType(endpoint) {
  if (!endpoint || !endpoint.port) {
    return NODE_GRAPH_PORT_TYPES.audio;
  }
  // Modulation destinations are not typed jacks in this system.
  if (endpoint.io === "modulation") {
    return null;
  }
  const io = endpoint.io === "input" || endpoint.io === "graph" ? "input" : "output";
  return nodeGraphResolvePortType(endpoint.node, endpoint.port, io);
}

/**
 * True when two endpoints are a connect attempt that should fail + break-anim
 * because their strict port types differ.
 */
function nodeGraphWireEndpointsPortTypeMismatch(a, b) {
  if (!a || !b) {
    return false;
  }
  // Only check opposite signal directions (out↔in). Same-dir / mod handled elsewhere.
  const pair =
    (a.io === "output" && (b.io === "input" || b.io === "graph"))
    || (b.io === "output" && (a.io === "input" || a.io === "graph"));
  if (!pair) {
    return false;
  }
  const typeA = nodeGraphEndpointPortType(a);
  const typeB = nodeGraphEndpointPortType(b);
  if (typeA == null || typeB == null) {
    return false;
  }
  return !nodeGraphPortTypesCompatible(typeA, typeB);
}
