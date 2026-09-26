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
 *   setup      — setup param (purple square): automatable once/quantum, not realtime
 *   texture    — 📺 picture on the shared WebGL picture device (not audio)
 */
const NODE_GRAPH_PORT_TYPES = Object.freeze({
  audio: "audio",
  digital: "digital",
  noteMask: "noteMask",
  code: "code",
  data: "data",
  graphChunk: "graphChunk",
  blockRate: "blockRate",
  setup: "setup",
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

/**
 * Parameter marked setup: true — not realtime, once-per-quantum automatable.
 * Param-row MOD / slider-out use this type (purple square). Cyan stays Additive.
 */
function nodeGraphPortIsSetupParam(typeOrNode, port, io = null) {
  const type = typeof typeOrNode === "string" && typeof nodeGraphModuleDefinitions === "object"
    ? typeOrNode
    : (typeof nodeGraphPatchNodeType === "function" ? nodeGraphPatchNodeType(typeOrNode) : null);
  const definition = (typeof nodeGraphModuleDefinitions === "object" && type)
    ? nodeGraphModuleDefinitions[type]
    : null;
  const key = String(port || "").trim();
  if (!definition || !key || !Array.isArray(definition.parameters)) {
    return false;
  }
  for (let i = 0; i < definition.parameters.length; i += 1) {
    const parameter = definition.parameters[i];
    if (parameter && parameter.key === key) {
      return parameter.setup === true;
    }
  }
  return false;
}

function nodeGraphParameterIsSetup(parameter) {
  return Boolean(parameter && parameter.setup === true);
}

/**
 * Same type, plus:
 *   audio ↔ digital (white gates/triggers are still voltages; Knob can drive 2t D)
 *   audio/digital → setup (Knob/OSC sampled once per quantum)
 */
function nodeGraphPortTypesCompatible(typeA, typeB) {
  const a = nodeGraphNormalizePortType(typeA) || NODE_GRAPH_PORT_TYPES.audio;
  const b = nodeGraphNormalizePortType(typeB) || NODE_GRAPH_PORT_TYPES.audio;
  if (a === b) {
    return true;
  }
  const audio = NODE_GRAPH_PORT_TYPES.audio;
  const digital = NODE_GRAPH_PORT_TYPES.digital;
  if ((a === audio && b === digital) || (a === digital && b === audio)) {
    return true;
  }
  const setup = NODE_GRAPH_PORT_TYPES.setup;
  if (b === setup && (a === audio || a === digital)) {
    return true;
  }
  return false;
}

function nodeGraphEndpointPortType(endpoint) {
  if (!endpoint || !endpoint.port) {
    return NODE_GRAPH_PORT_TYPES.audio;
  }
  if (typeof nodeGraphPortIsSetupParam === "function"
    && nodeGraphPortIsSetupParam(endpoint.node, endpoint.port, endpoint.io)) {
    return NODE_GRAPH_PORT_TYPES.setup;
  }
  // Ordinary modulation destinations stay untyped (any analog/param-out may connect).
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
