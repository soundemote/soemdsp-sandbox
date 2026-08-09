function nodeGraphTraceModuleRect(nodeId) {
  const surface = nodeGraphZoomSurface();
  const node = nodeGraphNodeElement(nodeId);
  if (!surface || !node) {
    return null;
  }
  const nodeRect = node.getBoundingClientRect();
  const titleRowRect = node.querySelector(".node-header-title-row")?.getBoundingClientRect();
  const topLeft = nodeGraphClientToZoomSurfacePoint(nodeRect.left, nodeRect.top, surface);
  const bottomRight = nodeGraphClientToZoomSurfacePoint(nodeRect.right, nodeRect.bottom, surface);
  const titleBottom = titleRowRect
    ? nodeGraphClientToZoomSurfacePoint(titleRowRect.left, titleRowRect.bottom, surface).y
    : topLeft.y;
  return {
    bottom: bottomRight.y,
    left: topLeft.x,
    right: bottomRight.x,
    titleBottom,
    top: topLeft.y,
  };
}

function nodeGraphSelfTraceModuleRect(nodeId) {
  return nodeGraphTraceModuleRect(nodeId);
}

function nodeGraphSelfTracePoints(wire, from, to) {
  const sourceNode = wire?.sourceNode;
  const destinationNode = wire?.destinationNode;
  if (!sourceNode || sourceNode !== destinationNode) {
    return [];
  }
  const rect = nodeGraphSelfTraceModuleRect(sourceNode);
  if (!rect) {
    return [];
  }
  const distance = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * 0.75;
  const centerX = (rect.left + rect.right) * 0.5;
  const fromDirection = from.x < centerX ? -1 : 1;
  const toDirection = to.x < centerX ? -1 : 1;
  const outX = from.x + fromDirection * distance;
  const destinationSideX = to.x + toDirection * distance;
  const aboveY = Math.max(0.5, rect.top - distance);
  const belowTitleY = Math.max(to.y, rect.titleBottom + 0.5);
  return [
    { x: outX, y: from.y },
    { x: outX, y: aboveY },
    { x: destinationSideX, y: aboveY },
    { x: destinationSideX, y: belowTitleY },
  ];
}

function nodeGraphBackwardTracePoints(wire, from, to) {
  const sourceNode = wire?.sourceNode;
  const destinationNode = wire?.destinationNode;
  if (!sourceNode || !destinationNode || sourceNode === destinationNode || to.x >= from.x) {
    return [];
  }
  const sourceRect = nodeGraphTraceModuleRect(sourceNode);
  const destinationRect = nodeGraphTraceModuleRect(destinationNode);
  if (!sourceRect || !destinationRect) {
    return [];
  }
  const distance = Math.max(nodeGraphGridWidth(), nodeGraphGridHeight()) * 0.75;
  const aboveY = Math.max(0.5, Math.min(sourceRect.top, destinationRect.top) - distance);
  const sourceSideX = Math.max(from.x + distance, sourceRect.right + distance);
  const destinationSideX = Math.min(to.x - distance, destinationRect.left - distance);
  return [
    { x: sourceSideX, y: from.y },
    { x: sourceSideX, y: aboveY },
    { x: destinationSideX, y: aboveY },
    { x: destinationSideX, y: to.y },
  ];
}

function nodeGraphManualTracePathOptions(wire, from, to) {
  const wireType = normalizeNodeGraphWireType(wire?.wireType);
  if (wireType !== nodeGraphWireTypes.trace) {
    return { wireType };
  }
  const manualTracePoints = normalizeNodeGraphTracePoints(wire?.tracePoints);
  const selfTracePoints = manualTracePoints.length ? [] : nodeGraphSelfTracePoints(wire, from, to);
  const tracePoints = manualTracePoints.length
    ? manualTracePoints
    : selfTracePoints.length
      ? selfTracePoints
      : nodeGraphBackwardTracePoints(wire, from, to);
  return {
    pathData: nodeGraphTracePathFromPoints(from, tracePoints, to),
    tracePoints,
    wireType,
  };
}

function nodeGraphWireEndpointsAreRenderable(wire) {
  const surface = nodeGraphZoomSurface();
  const portElementIsRenderable = (element) => {
    if (!element) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  return Boolean(
    surface &&
    nodeGraphMvp.activeNodes.has(wire.sourceNode) &&
    nodeGraphMvp.activeNodes.has(wire.destinationNode) &&
    nodeGraphPatchNodeIsVisible(wire.sourceNode) &&
    nodeGraphPatchNodeIsVisible(wire.destinationNode) &&
    portElementIsRenderable(nodeGraphPortElementForWireEndpoint(wire.sourceNode, wire.sourcePort, "output")),
  );
}

function nodeGraphSignalWireDestinationIsRenderable(wire) {
  return Boolean(
    nodeGraphWireEndpointsAreRenderable(wire) &&
    nodeGraphPortElementForWireEndpoint(wire.destinationNode, wire.destinationPort, "input"),
  );
}

function nodeGraphModulationWireDestinationIsRenderable(wire) {
  const surface = nodeGraphZoomSurface();
  return Boolean(
    nodeGraphWireEndpointsAreRenderable(wire) &&
    surface?.querySelector(nodeGraphModulationPortSelector(wire.destinationNode, wire.destinationParam)),
  );
}

function nodeGraphGraphWireDestinationIsRenderable(wire) {
  const surface = nodeGraphZoomSurface();
  return Boolean(
    nodeGraphWireEndpointsAreRenderable(wire) &&
    surface?.querySelector(nodeGraphGraphInputPortSelector(wire.destinationNode, wire.destinationGraphInput)),
  );
}

function nodeGraphWireInteractionMode(wire, identity, feedbackSet, activeWirePredicate, activeNodeIds, plan) {
  if (nodeGraphWireTouchesBypassed(wire, plan)) {
    return "bypassed";
  }
  if (!activeWirePredicate(wire, activeNodeIds)) {
    return "inactive";
  }
  return feedbackSet.has(identity) ? "state-read" : "same-pass";
}

function nodeGraphWirePathClass(...classes) {
  return classes.filter(Boolean).join(" ");
}

function markNodeGraphWireEndpointsConnected(wire, destinationIo = "input") {
  nodeGraphNodeElement(wire.sourceNode)?.classList.add("connected");
  nodeGraphNodeElement(wire.destinationNode)?.classList.add("connected");
  markNodeGraphPortConnected(wire.sourceNode, wire.sourcePort, "output");
  if (destinationIo === "graph") {
    markNodeGraphGraphInputPortConnected(wire.destinationNode, wire.destinationGraphInput);
    return;
  }
  if (destinationIo === "modulation") {
    markNodeGraphModulationPortConnected(wire.destinationNode, wire.destinationParam);
    return;
  }
  markNodeGraphPortConnected(wire.destinationNode, wire.destinationPort, "input");
}

function nodeGraphDrawSignalWire(svg, connection, index, context) {
  if (!nodeGraphSignalWireDestinationIsRenderable(connection)) {
    return;
  }
  const from = nodeGraphPortCenter(connection.sourceNode, connection.sourcePort, "output");
  const to = nodeGraphPortCenter(connection.destinationNode, connection.destinationPort, "input");
  const isInactive = !nodeGraphSignalConnectionIsActive(connection, context.activeNodeIds);
  const mode = nodeGraphWireInteractionMode(
    connection,
    nodeGraphSignalWireIdentity(connection),
    context.feedbackSets.signal,
    nodeGraphSignalConnectionIsActive,
    context.activeNodeIds,
    context.plan,
  );
  const fromCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(from, "from") || from;
  const toCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(to, "to") || to;
  nodeGraphWireHelpers.drawPath(svg, {
    alias: `${nodeGraphLabel(connection.sourceNode, connection.sourcePort)} -> ${nodeGraphLabel(
      connection.destinationNode,
      connection.destinationPort,
    )}`,
    from,
    gradientId: `node-wire-gradient-${index}`,
    index,
    kind: "signal",
    mode,
    pathClass: nodeGraphWirePathClass(
      "node-wire-path",
      mode === "state-read" ? "state-read" : "",
      isInactive ? "inactive-wire" : "",
      connection.pixelWire ? "pixel-wire" : "",
    ),
    skipHitPath: Boolean(context.skipHitPath),
    to,
    wireType: connection.wireType,
    pixelWire: Boolean(connection.pixelWire),
    wireColors: [
      nodeGraphPortWireColor(connection.sourceNode, connection.sourcePort, "output"),
      nodeGraphPortWireColor(connection.destinationNode, connection.destinationPort, "input"),
    ],
    // Trace polylines end on contact centers (same as cable path ends).
    ...nodeGraphManualTracePathOptions(connection, fromCap, toCap),
  });
  if (!context.skipHitPath) {
    markNodeGraphWireEndpointsConnected(connection);
  }
}

function nodeGraphDrawModulationWire(svg, modulation, index, context) {
  if (!nodeGraphModulationWireDestinationIsRenderable(modulation)) {
    return;
  }
  const from = nodeGraphPortCenter(modulation.sourceNode, modulation.sourcePort, "output");
  const to = nodeGraphModulationPortCenter(
    modulation.destinationNode,
    modulation.destinationParam,
  );
  const isInactive = !nodeGraphModulationIsActive(modulation, context.activeNodeIds);
  const mode = nodeGraphWireInteractionMode(
    modulation,
    nodeGraphModulationWireIdentity(modulation),
    context.feedbackSets.modulation,
    nodeGraphModulationIsActive,
    context.activeNodeIds,
    context.plan,
  );
  const fromCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(from, "from") || from;
  const toCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(to, "to") || to;
  nodeGraphWireHelpers.drawPath(svg, {
    alias: `${nodeGraphLabel(modulation.sourceNode, modulation.sourcePort)} -> ${nodeGraphNodeDisplayName(
      modulation.destinationNode,
    )}.${modulation.destinationParam} mod`,
    from,
    gradientClass: "node-modulation-wire-gradient-stop",
    gradientId: `node-modulation-wire-gradient-${index}`,
    index,
    kind: "modulation",
    mode,
    pathClass: nodeGraphWirePathClass(
      "node-wire-path",
      "node-modulation-wire-path",
      isInactive ? "inactive-wire" : "",
      modulation.pixelWire ? "pixel-wire" : "",
    ),
    skipHitPath: Boolean(context.skipHitPath),
    to,
    wireType: modulation.wireType,
    pixelWire: Boolean(modulation.pixelWire),
    wireColors: [
      nodeGraphPortWireColor(modulation.sourceNode, modulation.sourcePort, "output"),
      nodeGraphPortWireColor(modulation.destinationNode, modulation.destinationParam, "modulation"),
    ],
    ...nodeGraphManualTracePathOptions(modulation, fromCap, toCap),
  });
  if (!context.skipHitPath) {
    markNodeGraphWireEndpointsConnected(modulation, "modulation");
  }
}

function nodeGraphDrawGraphWire(svg, connection, index, context) {
  if (!nodeGraphGraphWireDestinationIsRenderable(connection)) {
    return;
  }
  const from = nodeGraphPortCenter(connection.sourceNode, connection.sourcePort, "output");
  const to = nodeGraphGraphInputPortCenter(
    connection.destinationNode,
    connection.destinationGraphInput,
  );
  const isInactive = !nodeGraphGraphConnectionIsActive(connection, context.activeNodeIds);
  const mode = nodeGraphWireInteractionMode(
    connection,
    nodeGraphGraphWireIdentity(connection),
    context.feedbackSets.graph,
    nodeGraphGraphConnectionIsActive,
    context.activeNodeIds,
    context.plan,
  );
  const fromCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(from, "from") || from;
  const toCap = nodeGraphWireHelpers.wireEndpointCapCenter?.(to, "to") || to;
  nodeGraphWireHelpers.drawPath(svg, {
    alias: `${nodeGraphLabel(connection.sourceNode, connection.sourcePort)} -> ${nodeGraphNodeDisplayName(
      connection.destinationNode,
    )}.${connection.destinationGraphInput} graph`,
    from,
    gradientClass: "node-modulation-wire-gradient-stop",
    gradientId: `node-graph-wire-gradient-${index}`,
    index,
    kind: "graph",
    mode,
    pathClass: nodeGraphWirePathClass(
      "node-wire-path",
      "node-modulation-wire-path",
      isInactive ? "inactive-wire" : "",
      connection.pixelWire ? "pixel-wire" : "",
    ),
    skipHitPath: Boolean(context.skipHitPath),
    to,
    wireType: connection.wireType,
    pixelWire: Boolean(connection.pixelWire),
    wireColors: [
      nodeGraphPortWireColor(connection.sourceNode, connection.sourcePort, "output"),
      nodeGraphPortWireColor(connection.destinationNode, connection.destinationGraphInput, "graph"),
    ],
    ...nodeGraphManualTracePathOptions(connection, fromCap, toCap),
  });
  if (!context.skipHitPath) {
    markNodeGraphWireEndpointsConnected(connection, "graph");
  }
}

function nodeGraphDrawTemporaryWire(svg, options) {
  const { className, endpoint, from, gradientId, to, tracePoints = null } = options;
  const fromColor = nodeGraphPortWireColor(endpoint.node, endpoint.port, endpoint.io);
  const stroke = nodeGraphWireHelpers.createGradient(
    svg,
    gradientId,
    from,
    to,
    "node-wire-gradient-stop",
    [
      fromColor,
      "rgba(243, 241, 236, 0.44)",
    ],
  );
  // Cap under stroke (same paint-order rule as permanent wires).
  if (typeof nodeGraphWireHelpers.drawEndpointCap === "function") {
    const role = endpoint?.io === "input" || endpoint?.io === "modulation" || endpoint?.io === "graph"
      ? "to"
      : "from";
    nodeGraphWireHelpers.drawEndpointCap(svg, from, role, stroke, "temp", {
      endColor: fromColor,
      gradientId,
    });
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", className);
  path.setAttribute("stroke", stroke);
  path.style.stroke = stroke;
  if (tracePoints) {
    path.dataset.tracePoints = nodeGraphTraceWaypointAttribute(tracePoints);
    path.setAttribute("d", nodeGraphTracePathFromPoints(from, tracePoints, to));
  } else {
    path.setAttribute("d", nodeGraphWireHelpers.path(from, to));
  }
  // Visual on endpoint layer after the disc so AA doesn't fringe the join.
  const capSvg = document.getElementById("nodeWireEndpointSvg") || svg;
  capSvg.append(path);
}

function nodeGraphResetConnectedWireClasses(workspace) {
  for (const node of workspace.querySelectorAll(".dsp-node")) {
    node.classList.remove("connected");
  }
  for (const port of workspace.querySelectorAll(".node-port, .node-param-port")) {
    port.classList.remove("connected-port");
  }
}

function drawNodeGraphWires(options = {}) {
  const workspace = nodeGraphZoomSurface();
  const svg = document.getElementById("nodeWireSvg");
  if (!workspace || !svg) {
    return;
  }
  const lite = Boolean(options.lite);
  const skipScopes = options.skipScopes === true || lite;
  const skipSelection = options.skipSelection === true || lite;
  // Heatmap is cheap CSS; still update so glow tracks pan/zoom.
  if (options.skipHeatmap !== true && typeof updateNodeGraphGridHeatmap === "function") {
    updateNodeGraphGridHeatmap();
  }
  // Lite (gesture) path reuses a plan cache; full draws always recompile so
  // wire/feedback state stays correct after patch edits of the same size.
  let plan = null;
  if (lite && typeof nodeGraphViewportCompileWirePlan === "function") {
    plan = nodeGraphViewportCompileWirePlan();
  } else {
    if (typeof invalidateNodeGraphViewportWirePlanCache === "function") {
      invalidateNodeGraphViewportWirePlanCache();
    }
    plan = typeof compileNodeGraphExecutionPlan === "function"
      ? compileNodeGraphExecutionPlan()
      : null;
  }
  if (!plan) {
    return;
  }
  const feedbackSets = nodeGraphFeedbackIdentitySets(plan);
  const activeNodeIds = nodeGraphActiveNodeIds(plan);

  const graphRect = nodeGraphGraphRect();
  const viewBox = `0 0 ${graphRect.width} ${graphRect.height}`;
  svg.setAttribute("viewBox", viewBox);
  svg.replaceChildren();
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  svg.append(defs);
  // Contact disks live above modules (separate SVG) so full circles show mid-jack.
  const capSvg = document.getElementById("nodeWireEndpointSvg");
  if (capSvg) {
    capSvg.setAttribute("viewBox", viewBox);
    capSvg.replaceChildren();
  }

  if (!lite) {
    nodeGraphResetConnectedWireClasses(workspace);
  }

  const context = { activeNodeIds, feedbackSets, plan, skipHitPath: lite };
  for (const [index, connection] of nodeGraphMvp.connections.entries()) {
    nodeGraphDrawSignalWire(svg, connection, index, context);
  }

  for (const [index, modulation] of nodeGraphMvp.modulations.entries()) {
    nodeGraphDrawModulationWire(svg, modulation, index, context);
  }

  for (const [index, graphConnection] of nodeGraphMvp.graphConnections.entries()) {
    nodeGraphDrawGraphWire(svg, graphConnection, index, context);
  }

  if (!lite && typeof syncNodeGraphMonitorIndicators === "function") {
    syncNodeGraphMonitorIndicators();
  }

  if (nodeGraphMvp.portConnectionMode) {
    const mode = nodeGraphMvp.portConnectionMode;
    if (mode.cursorPoint) {
      let ghostIndex = 0;
      for (const { endpoint, from } of mode.selected.values()) {
        nodeGraphDrawTemporaryWire(svg, {
          className: "node-wire-path temp",
          endpoint,
          from,
          gradientId: `node-wire-gradient-ghost-${ghostIndex}`,
          to: mode.cursorPoint,
        });
        ghostIndex += 1;
      }
    }
  }

  if (nodeGraphMvp.wireDragging?.active) {
    const { endpoint, from, cursorPoint } = nodeGraphMvp.wireDragging;
    nodeGraphDrawTemporaryWire(svg, {
      className: "node-wire-path temp",
      endpoint,
      from,
      gradientId: "node-wire-gradient-drag",
      to: cursorPoint,
    });
  }

  if (!skipSelection && typeof renderNodeGraphSelection === "function") {
    renderNodeGraphSelection();
  }
  if (!skipScopes && typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function scheduleNodeGraphWireRedrawAfterLayout() {
  if (nodeGraphMvp.wireRedrawFrame) {
    return;
  }
  nodeGraphMvp.wireRedrawFrame = window.requestAnimationFrame(() => {
    nodeGraphMvp.wireRedrawFrame = window.requestAnimationFrame(() => {
      nodeGraphMvp.wireRedrawFrame = 0;
      drawNodeGraphWires();
    });
  });
}

/**
 * Chrome that sits above the modular workspace (embedded tips, resource
 * meters, etc.) changes #nodeGraphWorkspace's box. Wire SVG viewBox is derived
 * from that box; without a redraw paths stretch against fixed --node-x/y ports
 * and look broken/offset. Call after any chrome that reflows the workspace.
 */
function notifyNodeGraphChromeLayoutChanged() {
  ensureNodeGraphWorkspaceWireLayoutObserver();
  scheduleNodeGraphWireRedrawAfterLayout();
}

let nodeGraphWorkspaceWireLayoutObserver = null;
let nodeGraphWorkspaceWireLayoutLastBox = "";

function ensureNodeGraphWorkspaceWireLayoutObserver() {
  if (nodeGraphWorkspaceWireLayoutObserver || typeof ResizeObserver !== "function") {
    if (nodeGraphWorkspaceWireLayoutObserver) {
      const workspace = document.getElementById("nodeGraphWorkspace");
      if (workspace) {
        try {
          nodeGraphWorkspaceWireLayoutObserver.observe(workspace);
        } catch (_error) {
          // already observing
        }
      }
    }
    return;
  }
  nodeGraphWorkspaceWireLayoutObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const box = entry?.contentRect
        ? `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`
        : "";
      if (box && box !== nodeGraphWorkspaceWireLayoutLastBox) {
        nodeGraphWorkspaceWireLayoutLastBox = box;
        changed = true;
      }
    }
    if (changed) {
      scheduleNodeGraphWireRedrawAfterLayout();
    }
  });
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (workspace) {
    try {
      const rect = workspace.getBoundingClientRect();
      nodeGraphWorkspaceWireLayoutLastBox = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      nodeGraphWorkspaceWireLayoutObserver.observe(workspace);
    } catch (_error) {
      // ignore
    }
  }
}

function renderNodeGraphConnectionList() {
  const plan = compileNodeGraphExecutionPlan();
  const validation = {
    issues: plan.issues,
    scheduleText: nodeGraphScheduleText(
      plan.order,
      plan.issues,
      plan.feedbackConnections,
      plan.feedbackModulations,
    ),
    sourceNodes: plan.sourceNodes,
    valid: plan.valid,
  };
  const list = document.getElementById("nodeConnectionList");
  const status = document.getElementById("nodeGraphStatus");
  const source = document.getElementById("nodeGraphSource");
  const validationPill = document.getElementById("nodeGraphValidation");
  const feedbackSets = nodeGraphFeedbackIdentitySets(plan);
  const activeNodeIds = nodeGraphActiveNodeIds(plan);

  list.replaceChildren();
  let renderedWireCount = 0;
  for (const [index, connection] of nodeGraphMvp.connections.entries()) {
    if (
      !nodeGraphMvp.activeNodes.has(connection.sourceNode) ||
      !nodeGraphMvp.activeNodes.has(connection.destinationNode)
    ) {
      continue;
    }

    const item = document.createElement("li");
    item.dataset.connectionRowIndex = String(index);
    item.dataset.connectionRowKind = "signal";
    item.classList.toggle(
      "selected",
      sameNodeGraphSelection(nodeGraphMvp.selected, { type: "wire", kind: "signal", index }),
    );
    item.addEventListener("click", () => setNodeGraphSelection({ type: "wire", kind: "signal", index }));
    const label = document.createElement("span");
    const isFeedback = feedbackSets.signal.has(nodeGraphSignalWireIdentity(connection));
    const isInactive = !nodeGraphSignalConnectionIsActive(connection, activeNodeIds);
    const isBypassed = nodeGraphWireTouchesBypassed(connection, plan);
    label.textContent = `${nodeGraphLabel(connection.sourceNode, connection.sourcePort)} -> ${nodeGraphLabel(
      connection.destinationNode,
      connection.destinationPort,
    )}${isFeedback ? " (state read)" : ""}${isBypassed ? " (bypassed)" : isInactive ? " (inactive)" : ""}`;
    item.classList.toggle("state-read", isFeedback);
    item.classList.toggle("inactive-wire", isInactive);
    const button = document.createElement("button");
    button.className = "disconnect-wire-button";
    button.type = "button";
    button.textContent = "Disconnect";
    button.dataset.connectionIndex = String(index);
    button.dataset.connectionKind = "signal";
    button.setAttribute("aria-label", `Disconnect ${label.textContent}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      disconnectNodeGraphConnection(index, "signal");
    });
    item.append(label, button);
    list.append(item);
    renderedWireCount += 1;
  }

  for (const [index, modulation] of nodeGraphMvp.modulations.entries()) {
    if (
      !nodeGraphMvp.activeNodes.has(modulation.sourceNode) ||
      !nodeGraphMvp.activeNodes.has(modulation.destinationNode)
    ) {
      continue;
    }

    const item = document.createElement("li");
    item.dataset.connectionRowIndex = String(index);
    item.dataset.connectionRowKind = "modulation";
    item.classList.toggle(
      "selected",
      sameNodeGraphSelection(nodeGraphMvp.selected, { type: "wire", kind: "modulation", index }),
    );
    item.addEventListener("click", () => setNodeGraphSelection({ type: "wire", kind: "modulation", index }));
    const label = document.createElement("span");
    const isFeedback = feedbackSets.modulation.has(nodeGraphModulationWireIdentity(modulation));
    const isInactive = !nodeGraphModulationIsActive(modulation, activeNodeIds);
    const isBypassed = nodeGraphWireTouchesBypassed(modulation, plan);
    label.textContent = `${nodeGraphLabel(modulation.sourceNode, modulation.sourcePort)} -> ${nodeGraphNodeDisplayName(
      modulation.destinationNode,
    )}.${modulation.destinationParam} mod${isFeedback ? " (state read)" : ""}${isBypassed ? " (bypassed)" : isInactive ? " (inactive)" : ""}`;
    item.classList.toggle("state-read", isFeedback);
    item.classList.toggle("inactive-wire", isInactive);
    const button = document.createElement("button");
    button.className = "disconnect-wire-button";
    button.type = "button";
    button.textContent = "Disconnect";
    button.dataset.connectionIndex = String(index);
    button.dataset.connectionKind = "modulation";
    button.setAttribute("aria-label", `Disconnect ${label.textContent}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      disconnectNodeGraphConnection(index, "modulation");
    });
    item.append(label, button);
    list.append(item);
    renderedWireCount += 1;
  }

  for (const [index, graphConnection] of nodeGraphMvp.graphConnections.entries()) {
    if (
      !nodeGraphMvp.activeNodes.has(graphConnection.sourceNode) ||
      !nodeGraphMvp.activeNodes.has(graphConnection.destinationNode)
    ) {
      continue;
    }

    const item = document.createElement("li");
    item.dataset.connectionRowIndex = String(index);
    item.dataset.connectionRowKind = "graph";
    item.classList.toggle(
      "selected",
      sameNodeGraphSelection(nodeGraphMvp.selected, { type: "wire", kind: "graph", index }),
    );
    item.addEventListener("click", () => setNodeGraphSelection({ type: "wire", kind: "graph", index }));
    const label = document.createElement("span");
    const isFeedback = feedbackSets.graph.has(nodeGraphGraphWireIdentity(graphConnection));
    const isInactive = !nodeGraphGraphConnectionIsActive(graphConnection, activeNodeIds);
    const isBypassed = nodeGraphWireTouchesBypassed(graphConnection, plan);
    label.textContent = `${nodeGraphLabel(graphConnection.sourceNode, graphConnection.sourcePort)} -> ${nodeGraphNodeDisplayName(
      graphConnection.destinationNode,
    )}.${graphConnection.destinationGraphInput} graph${isFeedback ? " (state read)" : ""}${isBypassed ? " (bypassed)" : isInactive ? " (inactive)" : ""}`;
    item.classList.toggle("state-read", isFeedback);
    item.classList.toggle("inactive-wire", isInactive);
    const button = document.createElement("button");
    button.className = "disconnect-wire-button";
    button.type = "button";
    button.textContent = "Disconnect";
    button.dataset.connectionIndex = String(index);
    button.dataset.connectionKind = "graph";
    button.setAttribute("aria-label", `Disconnect ${label.textContent}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      disconnectNodeGraphConnection(index, "graph");
    });
    item.append(label, button);
    list.append(item);
    renderedWireCount += 1;
  }

  if (!renderedWireCount) {
    const item = document.createElement("li");
    item.className = "warn-row";
    item.textContent = "No wires connected";
    list.append(item);
  }

  status.textContent = validation.valid ? "Graph Valid" : "Graph Incomplete";
  status.className = `pill ${validation.valid ? "good" : "warn"}`;
  source.textContent = validation.scheduleText;
  validationPill.textContent = validation.valid
    ? "valid"
    : validation.issues.join(", ");
  validationPill.className = `pill ${validation.valid ? "good" : "warn"}`;

  const renderButton = document.getElementById("nodeRenderButton");
  renderButton.disabled = !validation.valid;
  renderButton.title = validation.valid
    ? "Render current patch sample"
    : `Render blocked: ${validation.issues.join(", ")}`;
  renderNodeGraphExecutionPlanDebug(plan);
  drawNodeGraphWires();
}
