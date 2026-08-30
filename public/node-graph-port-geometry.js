function nodeGraphCanonicalPortForNode(node, port, io) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const type = patchNode?.type || (typeof node === "string" ? nodeGraphPatchNodeType(node) : "");
  if (io === "input") {
    return nodeGraphCanonicalInputPort(type, port);
  }
  if (io === "output") {
    return nodeGraphCanonicalOutputPort(type, port);
  }
  return String(port || "").trim();
}

function nodeGraphPortSelector(node, port, io) {
  const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io);
  return `.node-port.${io}[data-node="${CSS.escape(node)}"][data-port="${CSS.escape(canonicalPort)}"]`;
}

function nodeGraphModulationPortSelector(node, parameter) {
  return `.node-param-port.modulation-input[data-node="${CSS.escape(node)}"][data-param="${CSS.escape(parameter)}"]`;
}

function nodeGraphGraphInputPortSelector(node, graphInput) {
  return `.node-param-port.graph-input[data-node="${CSS.escape(node)}"][data-graph-input="${CSS.escape(graphInput)}"]`;
}

function nodeGraphNodeIoHidden(node) {
  return Boolean(nodeGraphNodeElement(node)?.classList.contains("io-hidden"));
}

function nodeGraphIoProxyPortSelector(node, io) {
  return `.node-io-proxy-port.${io}[data-node="${CSS.escape(node)}"][data-io-proxy="${CSS.escape(io)}"]`;
}

function nodeGraphPortElementForWireEndpoint(node, port, io) {
  const surface = nodeGraphZoomSurface();
  if (!surface) {
    return null;
  }
  // Always resolve the real jack element. Hide In/Out collapses the section
  // for real (no proxy strip); wire geometry then uses edge fallbacks.
  const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io);
  return surface.querySelector(nodeGraphPortSelector(node, canonicalPort, io));
}

/**
 * True when the module's signal IO chrome is collapsed (Hide In/Out).
 * Param/modulation jacks are separate (slider rows).
 */
function nodeGraphNodeSignalIoCollapsed(nodeId) {
  return Boolean(
    typeof nodeGraphNodeIoHidden === "function"
      ? nodeGraphNodeIoHidden(nodeId)
      : nodeGraphNodeElement(nodeId)?.classList.contains("io-hidden"),
  );
}

/**
 * Synthetic jack center on the module perimeter when Hide In/Out collapses
 * the real port DOM. Inputs stack on the left edge; outputs on the right.
 * Used for wire *dots* only — cable paths are suppressed when either end
 * is collapsed (same idea as hidden connected sliders).
 */
function nodeGraphIoHiddenPortFallbackCenter(nodeId, port, io) {
  if (io !== "input" && io !== "output") {
    return null;
  }
  const nodeEl = typeof nodeGraphNodeElement === "function"
    ? nodeGraphNodeElement(nodeId)
    : null;
  if (!nodeEl) {
    return null;
  }
  const rect = nodeEl.getBoundingClientRect();
  if (!(rect.width > 0.5) || !(rect.height > 0.5)) {
    return null;
  }
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  let ports = [];
  if (io === "output" && typeof nodeGraphPatchNodeOutputPorts === "function") {
    ports = nodeGraphPatchNodeOutputPorts(patchNode) || [];
  } else if (io === "input" && typeof nodeGraphPatchNodeInputPorts === "function") {
    ports = nodeGraphPatchNodeInputPorts(patchNode) || [];
  }
  const canonical = typeof nodeGraphCanonicalPortForNode === "function"
    ? nodeGraphCanonicalPortForNode(nodeId, port, io)
    : String(port || "").trim();
  let index = ports.indexOf(canonical);
  if (index < 0) {
    index = 0;
  }
  const n = Math.max(1, ports.length || 1);
  const yClient = rect.top + (rect.height * (index + 0.5)) / n;
  const xClient = io === "output" ? rect.right : rect.left;
  if (typeof nodeGraphClientToZoomSurfacePoint !== "function") {
    return { x: xClient, y: yClient };
  }
  return nodeGraphClientToZoomSurfacePoint(xClient, yClient);
}

/** Layout jack is on-screen (not display:none / zero box). */
function nodeGraphPortHasLayoutJack(nodeId, port, io) {
  const el = nodeGraphPortElementForWireEndpoint(nodeId, port, io);
  if (el?.classList?.contains("node-io-proxy-port")) {
    return false;
  }
  return nodeGraphPortElementIsLayoutVisible(el);
}

/**
 * True when a jack has non-zero layout (not display:none / collapsed).
 * Hidden slider rows (sliders-hidden) zero out param ports — wire endpoints
 * would otherwise resolve near (0,0) and stretch cables to infinity.
 */
function nodeGraphPortElementIsLayoutVisible(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(element)
  ) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0.5 && rect.height > 0.5;
}

function markNodeGraphPortConnected(node, port, io) {
  nodeGraphPortElementForWireEndpoint(node, port, io)?.classList.add("connected-port");
}

function markNodeGraphModulationPortConnected(node, parameter) {
  nodeGraphZoomSurface()
    ?.querySelector(nodeGraphModulationPortSelector(node, parameter))
    ?.classList.add("connected-port");
}

function markNodeGraphGraphInputPortConnected(node, graphInput) {
  nodeGraphZoomSurface()
    ?.querySelector(nodeGraphGraphInputPortSelector(node, graphInput))
    ?.classList.add("connected-port");
}

/**
 * One-frame cache for jack centers during a full wire redraw. Each connection
 * otherwise redoes querySelector + getBoundingClientRect (+ getComputedStyle
 * for patch-point CSS) — O(wires × ports) layout thrash that made every pan
 * settle / full wire pass feel proportional to module count.
 */
function nodeGraphPortCenterCacheBegin() {
  if (typeof nodeGraphMvp !== "object" || !nodeGraphMvp) {
    return;
  }
  nodeGraphMvp._portCenterFrameCache = new Map();
  // Surface client rect shared for client→surface conversion this frame.
  const surface = typeof nodeGraphZoomSurface === "function" ? nodeGraphZoomSurface() : null;
  nodeGraphMvp._portCenterSurfaceRect = surface?.getBoundingClientRect?.() || null;
  nodeGraphMvp._portCenterSurfaceScale = typeof nodeGraphZoomSurfaceClientScale === "function"
    ? nodeGraphZoomSurfaceClientScale(surface)
    : { x: 1, y: 1 };
}

function nodeGraphPortCenterCacheEnd() {
  if (typeof nodeGraphMvp !== "object" || !nodeGraphMvp) {
    return;
  }
  nodeGraphMvp._portCenterFrameCache = null;
  nodeGraphMvp._portCenterSurfaceRect = null;
  nodeGraphMvp._portCenterSurfaceScale = null;
}

function nodeGraphPortCenter(node, port, io) {
  const cache = typeof nodeGraphMvp === "object" ? nodeGraphMvp?._portCenterFrameCache : null;
  const cacheKey = cache ? `${node}\0${port}\0${io}` : "";
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  const element = nodeGraphPortElementForWireEndpoint(node, port, io);
  const laidOut = nodeGraphElementCenter(element, io);
  if (laidOut) {
    cache?.set(cacheKey, laidOut);
    return laidOut;
  }
  // Hide In/Out: section gone — edge anchor for wire dots only.
  if (
    (io === "input" || io === "output")
    && nodeGraphNodeSignalIoCollapsed(node)
  ) {
    const fallback = nodeGraphIoHiddenPortFallbackCenter(node, port, io);
    cache?.set(cacheKey, fallback);
    return fallback;
  }
  cache?.set(cacheKey, null);
  return null;
}

function nodeGraphModulationPortCenter(node, parameter) {
  const surface = nodeGraphZoomSurface();
  const element = surface?.querySelector(nodeGraphModulationPortSelector(node, parameter));
  return nodeGraphElementCenter(element, "modulation");
}

function nodeGraphGraphInputPortCenter(node, graphInput) {
  const surface = nodeGraphZoomSurface();
  const element = surface?.querySelector(nodeGraphGraphInputPortSelector(node, graphInput));
  return nodeGraphElementCenter(element, "graph");
}

/**
 * Zoom-surface center of a jack, or null when the element is missing / not laid out
 * (e.g. parameter row hidden via sliders-hidden).
 */
function nodeGraphElementCenter(element, io = null) {
  if (!element || !nodeGraphPortElementIsLayoutVisible(element)) {
    return null;
  }
  const anchor = nodeGraphElementPatchPointClientCenter(element, io);
  // Prefer frame-cached surface transform (wire redraw batch).
  const surfaceRect = typeof nodeGraphMvp === "object" ? nodeGraphMvp?._portCenterSurfaceRect : null;
  const scale = typeof nodeGraphMvp === "object" ? nodeGraphMvp?._portCenterSurfaceScale : null;
  if (surfaceRect && scale) {
    return {
      x: (anchor.x - surfaceRect.left) / Math.max(0.0001, scale.x),
      y: (anchor.y - surfaceRect.top) / Math.max(0.0001, scale.y),
    };
  }
  return nodeGraphClientToZoomSurfacePoint(anchor.x, anchor.y);
}

function nodeGraphElementPatchPointClientCenter(element, io = null) {
  if (!element) {
    return { x: 0, y: 0 };
  }
  if (
    typeof nodeGraphElementInSkippedContentVisibility === "function"
    && nodeGraphElementInSkippedContentVisibility(element)
  ) {
    return { x: 0, y: 0 };
  }
  const rect = element.getBoundingClientRect();
  if (element.classList?.contains("node-param-port")) {
    return nodeGraphParameterPatchPointClientCenter(element, rect, io);
  }
  return nodeGraphCssPatchPointClientCenter(element, rect, io);
}

function nodeGraphCssPatchPointClientCenter(element, rect, io = null) {
  const style = getComputedStyle(element);
  const cssX = style.getPropertyValue("--node-patch-point-x").trim();
  const percentMatch = cssX.match(/^(-?\d+(?:\.\d+)?)%$/);
  const pixelMatch = cssX.match(/^(-?\d+(?:\.\d+)?)px$/);
  const fallbackRatio = io === "output"
    ? 1
    : io === "input" || io === "modulation" || io === "graph"
      ? 0
      : 0.5;
  const xRatio = percentMatch
    ? Number(percentMatch[1]) / 100
    : fallbackRatio;
  return {
    x: pixelMatch
      ? rect.left + Number(pixelMatch[1])
      : rect.left + rect.width * Math.max(0, Math.min(1, Number.isFinite(xRatio) ? xRatio : 0.5)),
    y: rect.top + rect.height * 0.5,
  };
}

function nodeGraphParameterPatchPointClientCenter(element, rect, io = null) {
  const side = nodeGraphParameterPatchPointSide(element, io);
  const x = side === "right"
    ? rect.right
    : side === "left"
      ? rect.left
      : rect.left + rect.width * 0.5;
  return {
    x,
    y: rect.top + rect.height * 0.5,
  };
}

function nodeGraphParameterPatchPointSide(element, io = null) {
  if (element.classList.contains("parameter-output") || io === "output") {
    return "right";
  }
  if (
    element.classList.contains("modulation-input") ||
    element.classList.contains("graph-input") ||
    io === "modulation" ||
    io === "graph"
  ) {
    return "left";
  }
  return null;
}

function nodeGraphCssColor(property, fallback) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const value = workspace
    ? getComputedStyle(workspace).getPropertyValue(property).trim()
    : "";
  return value || fallback;
}

const NODE_GRAPH_FREQUENCY_VALUE_GLYPH = "\u0192"; // ƒ

/**
 * Hz-as-a-number jacks (Pitch Detector Frequency, MIDI ƒ…).
 * Not oscillator Frequency sliders, not 0.1V/Oct pitch CV.
 */
function nodeGraphPortIsFrequencyValue(port) {
  const key = String(port || "").trim();
  if (!key) {
    return false;
  }
  if (
    key === "Frequency"
    || key === "Freq"
    || key === "f"
    || key === "F"
    || key === NODE_GRAPH_FREQUENCY_VALUE_GLYPH
  ) {
    return true;
  }
  if (/^d?f\d+$/i.test(key)) {
    return true;
  }
  if (key.charAt(0) === NODE_GRAPH_FREQUENCY_VALUE_GLYPH && /^\d+$/.test(key.slice(1))) {
    return true;
  }
  return false;
}

function nodeGraphFrequencyValuePortDisplayLabel(port) {
  const key = String(port || "").trim();
  const numbered = key.match(/^d?f(\d+)$/i)
    || (key.charAt(0) === NODE_GRAPH_FREQUENCY_VALUE_GLYPH ? key.slice(1).match(/^(\d+)$/) : null);
  if (numbered) {
    return `${NODE_GRAPH_FREQUENCY_VALUE_GLYPH}${numbered[1]}`;
  }
  if (
    key === "Frequency"
    || key === "Freq"
    || key === "f"
    || key === "F"
    || key === NODE_GRAPH_FREQUENCY_VALUE_GLYPH
  ) {
    return NODE_GRAPH_FREQUENCY_VALUE_GLYPH;
  }
  return key;
}

// App-wide policy: white wire == digital cable.
//   • bitmasks (Scale, Held Keys, …)
//   • ƒ real-value jacks (Hz reports: Frequency, Df1/Df2, ƒ1/ƒ2) on inlets and outlets
//   • anything listed in digitalInputs / digitalOutputs
// 0.1V/Oct pitch CV stays analog (not white) — it is a smoothly-varying voltage.
function nodeGraphPortIsDigitalSignal(typeOrNode, port, io = null) {
  if (port === "Scale" || nodeGraphPortIsFrequencyValue(port)) {
    return true;
  }
  const type = typeof typeOrNode === "string" && nodeGraphModuleDefinitions[typeOrNode]
    ? typeOrNode
    : nodeGraphPatchNodeType(typeOrNode);
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition) {
    return false;
  }
  if (io !== "output" && definition.digitalInputs?.includes(port)) {
    return true;
  }
  if (io !== "input" && definition.digitalOutputs?.includes(port)) {
    return true;
  }
  return false;
}

/**
 * Yellow Graph chunk ports (CMYK Y; product name still “Magenta Graph”).
 * Data-plane once-per-quantum payload (e.g. harmonic {phase,ratio,amp}),
 * not audio-rate samples. Listed in dataInputs / dataOutputs as "Graph",
 * or graphChunkInputs/Outputs.
 */
function nodeGraphPortIsGraphChunkSignal(typeOrNode, port, io = null) {
  const type = typeof typeOrNode === "string" && nodeGraphModuleDefinitions[typeOrNode]
    ? typeOrNode
    : nodeGraphPatchNodeType(typeOrNode);
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition || !port) {
    return false;
  }
  const name = String(port || "").trim();
  if (name === "Graph") {
    if (io !== "output" && Array.isArray(definition.dataInputs) && definition.dataInputs.includes(name)) {
      return true;
    }
    if (io !== "input" && Array.isArray(definition.dataOutputs) && definition.dataOutputs.includes(name)) {
      return true;
    }
  }
  if (io !== "output" && Array.isArray(definition.graphChunkInputs) && definition.graphChunkInputs.includes(name)) {
    return true;
  }
  if (io !== "input" && Array.isArray(definition.graphChunkOutputs) && definition.graphChunkOutputs.includes(name)) {
    return true;
  }
  return false;
}

/**
 * Cyan Parameter / block-rate ZOH ports (CMYK C — not turquoise).
 * One value per quantum; module holds it for the block.
 * Listed in blockRateInputs / blockRateOutputs.
 * Parameter smoothers may still emit sample packs into Controls; these jacks
 * do not.
 */
function nodeGraphPortIsBlockRateSignal(typeOrNode, port, io = null) {
  const type = typeof typeOrNode === "string" && nodeGraphModuleDefinitions[typeOrNode]
    ? typeOrNode
    : nodeGraphPatchNodeType(typeOrNode);
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition || !port) {
    return false;
  }
  const name = String(port || "").trim();
  if (io !== "output" && Array.isArray(definition.blockRateInputs) && definition.blockRateInputs.includes(name)) {
    return true;
  }
  if (io !== "input" && Array.isArray(definition.blockRateOutputs) && definition.blockRateOutputs.includes(name)) {
    return true;
  }
  return false;
}

/** Additive CMYK Parameter chrome (mod jacks → cyan). */
function nodeGraphModuleUsesCmykParameterChrome(type) {
  const key = String(type || "");
  return key === "additiveGenerator"
    || key === "additiveLinearFilter"
    || key === "additiveAnalogFilter"
    || key === "additiveGrowl"
    || key === "additiveNoisyFreq"
    || key === "additiveNoisyPhase"
    || key === "additiveNoisyPan"
    || key === "additiveNoisyAmp"
    || key === "additiveOut";
}

function nodeGraphPortWireColor(node, port, io) {
  const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io);
  const type = nodeGraphPatchNodeType(node);
  // Digital signal ports get a solid white wire instead of the usual role
  // color -- see the .node-io-row[data-digital-signal] CSS for the matching
  // port tap color, and nodeGraphPortIsDigitalSignal for what qualifies.
  if (nodeGraphPortIsDigitalSignal(type, canonicalPort, io)) {
    return "#ffffff";
  }
  // CMYK Y — Graph chunk cables (was hardcoded magenta).
  if (typeof nodeGraphPortIsGraphChunkSignal === "function"
    && nodeGraphPortIsGraphChunkSignal(type, canonicalPort, io)
    && typeof nodeGraphJackChannelCssColor === "function") {
    const chunk = nodeGraphJackChannelCssColor("yellow");
    if (chunk) {
      return chunk;
    }
  }
  // CMYK C — block-rate Parameter ports (listed blockRateInputs/Outputs).
  if (typeof nodeGraphPortIsBlockRateSignal === "function"
    && nodeGraphPortIsBlockRateSignal(type, canonicalPort, io)
    && typeof nodeGraphJackChannelCssColor === "function") {
    const zoh = nodeGraphJackChannelCssColor("cyan");
    if (zoh) {
      return zoh;
    }
  }
  // UIDEV "wires follow port colors": RGB / stereo / chaos / quad jacks
  // paint that end of the cable. Dual-color gradient still matches both ends.
  if (typeof nodeGraphJackWireColor === "function") {
    const follow = nodeGraphJackWireColor(type, canonicalPort, io);
    if (follow) {
      return follow;
    }
  }
  if (io === "input") {
    return nodeGraphCssColor("--node-input-fill", "#e2a86d");
  }
  // Additive series: parameter-row mod jacks + their cables are CMYK cyan.
  if (io === "modulation") {
    if (nodeGraphModuleUsesCmykParameterChrome(type) && typeof nodeGraphJackChannelCssColor === "function") {
      return nodeGraphJackChannelCssColor("cyan") || "#00e5ff";
    }
    return nodeGraphCssColor("--node-mod-input-fill", "#b184ff");
  }
  if (io === "graph") {
    return nodeGraphCssColor("--node-mod-input-fill", "#b184ff");
  }
  if (nodeGraphParameterOutputPort(nodeGraphPatchNode(node) || nodeGraphPatchNodeType(node), canonicalPort)) {
    if (nodeGraphModuleUsesCmykParameterChrome(type) && typeof nodeGraphJackChannelCssColor === "function") {
      return nodeGraphJackChannelCssColor("cyan") || "#00e5ff";
    }
    return nodeGraphCssColor("--node-param-output-fill", "#b184ff");
  }
  return nodeGraphCssColor("--node-output-fill", "#e2a86d");
}
