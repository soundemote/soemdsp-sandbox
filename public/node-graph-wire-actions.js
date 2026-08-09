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
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let removed = false;
  if (kind === "graph") {
    removed = index >= 0 && index < patch.graphConnections.length;
    patch.graphConnections = patch.graphConnections.filter((_connection, connectionIndex) => connectionIndex !== index);
  } else if (kind === "modulation") {
    removed = index >= 0 && index < patch.modulations.length;
    patch.modulations = patch.modulations.filter((_modulation, modulationIndex) => modulationIndex !== index);
  } else {
    removed = index >= 0 && index < patch.connections.length;
    patch.connections = patch.connections.filter((_connection, connectionIndex) => connectionIndex !== index);
  }
  if (!removed) {
    return;
  }
  const selection = nodeGraphMvp.selected;
  if (sameNodeGraphSelection(selection, { type: "wire", kind, index })) {
    setNodeGraphSelection(null);
  } else if (selection?.type === "wire" && (selection.kind || "signal") === kind && selection.index > index) {
    setNodeGraphSelection({ ...selection, index: selection.index - 1 });
  } else if (selection?.type === "wires" && typeof nodeGraphSelectedWireEntries === "function") {
    // Drop removed wire; shift higher indices of the same kind down by one.
    const next = nodeGraphSelectedWireEntries(selection)
      .filter((e) => !(e.kind === kind && e.index === index))
      .map((e) => (
        e.kind === kind && e.index > index
          ? { kind: e.kind, index: e.index - 1 }
          : e
      ));
    if (typeof setNodeGraphWireSelection === "function") {
      setNodeGraphWireSelection(next);
    } else {
      setNodeGraphSelection(null);
    }
  }
  commitNodeGraphPatch(patch, { status: "wire disconnected", wireEdit: true });
  if (typeof triggerNodeGraphWireDisconnectEvent === "function") {
    triggerNodeGraphWireDisconnectEvent(kind);
  }
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
 */
function nodeGraphPortPairMeta(port) {
  const key = String(port || "").trim().toLowerCase();
  if (!key) {
    return null;
  }
  // role 0 = left/X side; role 1 = right/Y side. siblings = opposite-side names
  // preferred on the same module (first existing wins).
  const table = {
    x: { group: "stereo-xy-lr", role: 0, siblings: ["Y", "Right", "Wet R", "Dry R", "Right Out", "Bi Y", "Uni Y"] },
    left: { group: "stereo-xy-lr", role: 0, siblings: ["Right", "Y", "Wet R", "Dry R", "Right Out", "Bi Y", "Uni Y"] },
    y: { group: "stereo-xy-lr", role: 1, siblings: ["X", "Left", "Wet L", "Dry L", "Left Out", "Bi X", "Uni X"] },
    right: { group: "stereo-xy-lr", role: 1, siblings: ["Left", "X", "Wet L", "Dry L", "Left Out", "Bi X", "Uni X"] },
    // RoundShape uni/bi quadrature pairs
    "bi x": { group: "stereo-xy-lr", role: 0, siblings: ["Bi Y", "Y", "Right", "Uni Y"] },
    "bi y": { group: "stereo-xy-lr", role: 1, siblings: ["Bi X", "X", "Left", "Uni X"] },
    "uni x": { group: "stereo-xy-lr", role: 0, siblings: ["Uni Y", "Y", "Right", "Bi Y"] },
    "uni y": { group: "stereo-xy-lr", role: 1, siblings: ["Uni X", "X", "Left", "Bi X"] },
    a: { group: "ab", role: 0, siblings: ["B"] },
    b: { group: "ab", role: 1, siblings: ["A"] },
    // Space FX dry pair (SoEm / Sabrina) — own pair first, then generic stereo
    "dry l": { group: "stereo-xy-lr", role: 0, siblings: ["Dry R", "Right Dry", "Right", "Y", "Wet R"] },
    "dry r": { group: "stereo-xy-lr", role: 1, siblings: ["Dry L", "Left Dry", "Left", "X", "Wet L"] },
    "left dry": { group: "stereo-xy-lr", role: 0, siblings: ["Right Dry", "Dry R", "Right", "Y"] },
    "right dry": { group: "stereo-xy-lr", role: 1, siblings: ["Left Dry", "Dry L", "Left", "X"] },
    // Space FX wet pair
    "wet l": { group: "stereo-xy-lr", role: 0, siblings: ["Wet R", "Right Wet", "Right Mix", "Right", "Y", "Dry R"] },
    "wet r": { group: "stereo-xy-lr", role: 1, siblings: ["Wet L", "Left Wet", "Left Mix", "Left", "X", "Dry L"] },
    "left wet": { group: "stereo-xy-lr", role: 0, siblings: ["Right Wet", "Wet R", "Right Mix", "Right", "Y"] },
    "right wet": { group: "stereo-xy-lr", role: 1, siblings: ["Left Wet", "Wet L", "Left Mix", "Left", "X"] },
    // Legacy "Mix" = wet/mixed reverb outs
    "left mix": { group: "stereo-xy-lr", role: 0, siblings: ["Right Mix", "Wet R", "Right Wet", "Right", "Y"] },
    "right mix": { group: "stereo-xy-lr", role: 1, siblings: ["Left Mix", "Wet L", "Left Wet", "Left", "X"] },
    "left out": { group: "stereo-xy-lr", role: 0, siblings: ["Right Out", "Right", "Y", "Wet R", "Dry R"] },
    "right out": { group: "stereo-xy-lr", role: 1, siblings: ["Left Out", "Left", "X", "Wet L", "Dry L"] },
  };
  return table[key] || null;
}

/** @deprecated use nodeGraphPortPairMeta — kept for any external callers */
function nodeGraphEquivalentStereoPortName(port) {
  const meta = nodeGraphPortPairMeta(port);
  if (!meta || meta.group !== "stereo-xy-lr") {
    return "";
  }
  return meta.role === 0 ? "left-x" : "right-y";
}

/** First sibling name that exists on the given port list (exact match). */
function nodeGraphPortPairSiblingOnModule(port, availablePorts = []) {
  const meta = nodeGraphPortPairMeta(port);
  if (!meta) {
    return "";
  }
  const ports = Array.isArray(availablePorts) ? availablePorts : [];
  for (const candidate of meta.siblings) {
    if (ports.includes(candidate)) {
      return candidate;
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
function nodeGraphAutoPairPortConnections(patch, sourceNode, sourcePort, destinationNode, destinationPort, wireData = {}) {
  if (!patch) {
    return 0;
  }
  const srcMeta = nodeGraphPortPairMeta(sourcePort);
  const dstMeta = nodeGraphPortPairMeta(destinationPort);
  // Same pair group and same role (both L-side or both R-side).
  if (!srcMeta || !dstMeta || srcMeta.group !== dstMeta.group || srcMeta.role !== dstMeta.role) {
    return 0;
  }
  const sourcePorts = typeof nodeGraphPatchNodeOutputPorts === "function"
    ? nodeGraphPatchNodeOutputPorts(sourceNode)
    : [];
  const destinationPorts = typeof nodeGraphPatchNodeInputPorts === "function"
    ? nodeGraphPatchNodeInputPorts(destinationNode)
    : [];
  const nextSourcePort = nodeGraphPortPairSiblingOnModule(sourcePort, sourcePorts);
  const nextDestinationPort = nodeGraphPortPairSiblingOnModule(destinationPort, destinationPorts);
  if (!nextSourcePort || !nextDestinationPort) {
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
  const autoConnected = options.autoPair === false
    ? 0
    : nodeGraphAutoPairPortConnections(
      patch,
      sourceNode,
      sourcePort,
      destinationNode,
      destinationPort,
      nextWireData,
    );
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
