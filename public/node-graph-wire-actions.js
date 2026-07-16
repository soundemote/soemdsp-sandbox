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
  const nextWireData = {
    ...(nodeGraphWireTypePatchValue(effectiveOptions.wireType)
      ? { wireType: nodeGraphWireTypePatchValue(effectiveOptions.wireType) }
      : {}),
    ...(effectiveOptions.tracePoints?.length
      ? { tracePoints: normalizeNodeGraphTracePoints(effectiveOptions.tracePoints) }
      : {}),
  };
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

function nodeGraphEquivalentStereoPortName(port) {
  const key = String(port || "").trim().toLowerCase();
  if (key === "x" || key === "left") {
    return "left-x";
  }
  if (key === "y" || key === "right") {
    return "right-y";
  }
  return "";
}

function nodeGraphStereoPairSiblingPort(port) {
  const key = String(port || "").trim().toLowerCase();
  if (key === "x") {
    return "Y";
  }
  if (key === "y") {
    return "X";
  }
  if (key === "left") {
    return "Right";
  }
  if (key === "right") {
    return "Left";
  }
  return "";
}

function nodeGraphAutoPairPortConnections(patch, sourceNode, sourcePort, destinationNode, destinationPort, wireData = {}) {
  if (
    !patch ||
    nodeGraphEquivalentStereoPortName(sourcePort) !== "left-x" ||
    nodeGraphEquivalentStereoPortName(destinationPort) !== "left-x"
  ) {
    return 0;
  }
  const sourcePorts = nodeGraphPatchNodeOutputPorts(sourceNode);
  const destinationPorts = nodeGraphPatchNodeInputPorts(destinationNode);
  const nextSourcePort = nodeGraphStereoPairSiblingPort(sourcePort);
  const nextDestinationPort = nodeGraphStereoPairSiblingPort(destinationPort);
  if (!sourcePorts.includes(nextSourcePort) || !destinationPorts.includes(nextDestinationPort)) {
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
  const nextWireData = {
    ...(nodeGraphWireTypePatchValue(effectiveOptions.wireType)
      ? { wireType: nodeGraphWireTypePatchValue(effectiveOptions.wireType) }
      : {}),
    ...(effectiveOptions.tracePoints?.length
      ? { tracePoints: normalizeNodeGraphTracePoints(effectiveOptions.tracePoints) }
      : {}),
  };
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
  const nextWireData = {
    ...(nodeGraphWireTypePatchValue(effectiveOptions.wireType)
      ? { wireType: nodeGraphWireTypePatchValue(effectiveOptions.wireType) }
      : {}),
    ...(effectiveOptions.tracePoints?.length
      ? { tracePoints: normalizeNodeGraphTracePoints(effectiveOptions.tracePoints) }
      : {}),
  };
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
