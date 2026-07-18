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
  if ((io === "input" || io === "output") && nodeGraphNodeIoHidden(node)) {
    const proxyPort = surface.querySelector(nodeGraphIoProxyPortSelector(node, io));
    if (proxyPort) {
      return proxyPort;
    }
  }
  const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io);
  return surface.querySelector(nodeGraphPortSelector(node, canonicalPort, io));
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

function nodeGraphPortCenter(node, port, io) {
  const element = nodeGraphPortElementForWireEndpoint(node, port, io);
  return nodeGraphElementCenter(element, io);
}

function nodeGraphModulationPortCenter(node, parameter) {
  const surface = nodeGraphZoomSurface();
  const element = surface.querySelector(nodeGraphModulationPortSelector(node, parameter));
  return nodeGraphElementCenter(element, "modulation");
}

function nodeGraphGraphInputPortCenter(node, graphInput) {
  const surface = nodeGraphZoomSurface();
  const element = surface.querySelector(nodeGraphGraphInputPortSelector(node, graphInput));
  return nodeGraphElementCenter(element, "graph");
}

function nodeGraphElementCenter(element, io = null) {
  if (!element) {
    return { x: 0, y: 0 };
  }
  const anchor = nodeGraphElementPatchPointClientCenter(element, io);
  return nodeGraphClientToZoomSurfacePoint(anchor.x, anchor.y);
}

function nodeGraphElementPatchPointClientCenter(element, io = null) {
  if (!element) {
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

// App-wide policy: white wire == bit-based signal. A continuous CV like
// 0.1V/Oct pitch (or anything else that's just a smoothly-varying float,
// no matter how huge its usable range) does NOT get white -- only ports
// that actually pack their value as a bitmask do, either via this
// sandbox's one universal bitmask-signal name (Scale, a quantizer's
// 12-bit scale-degree mask, see pitch-quantizer-worklet-evaluator.js's
// `& 0xFFF`) on any node, or via the node's own module definition
// explicitly listing it in digitalInputs/digitalOutputs -- see e.g.
// comparator's "In" and transport's pulse/trigger outputs, or
// keyboardController's "Held Keys" bitmask, in node-graph-module-definitions.js.
function nodeGraphPortIsDigitalSignal(typeOrNode, port, io = null) {
  if (port === "Scale") {
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

function nodeGraphPortWireColor(node, port, io) {
  const canonicalPort = nodeGraphCanonicalPortForNode(node, port, io);
  // Digital signal ports get a solid white wire instead of the usual role
  // color -- see the .node-io-row[data-digital-signal] CSS for the matching
  // port tap color, and nodeGraphPortIsDigitalSignal for what qualifies.
  if (nodeGraphPortIsDigitalSignal(nodeGraphPatchNodeType(node), canonicalPort, io)) {
    return "#ffffff";
  }
  if (io === "input") {
    return nodeGraphCssColor("--node-input-fill", "#7fc7d9");
  }
  if (io === "modulation") {
    return nodeGraphCssColor("--node-mod-input-fill", "#b184ff");
  }
  if (io === "graph") {
    return nodeGraphCssColor("--node-mod-input-fill", "#b184ff");
  }
  if (nodeGraphParameterOutputPort(nodeGraphPatchNode(node) || nodeGraphPatchNodeType(node), canonicalPort)) {
    return nodeGraphCssColor("--node-param-output-fill", "#66e0a3");
  }
  return nodeGraphCssColor("--node-output-fill", "#e2a86d");
}
