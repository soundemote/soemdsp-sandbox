// Scope monitor endpoints / toggles / fingerprints (Phase D).
// Load after scopes.js. Extract-only.

function nodeGraphMonitorEndpointKey(endpoint) {
  return `${endpoint?.node || ""}.${endpoint?.io || ""}.${endpoint?.port || endpoint?.param || ""}`;
}

function nodeGraphMonitorEndpointFromElement(element) {
  if (!element) {
    return null;
  }
  if (element.classList?.contains("node-io-row")) {
    return {
      io: String(element.dataset.io || ""),
      node: String(element.dataset.node || ""),
      port: String(element.dataset.port || ""),
    };
  }
  if (element.classList?.contains("modulation-input")) {
    return {
      io: "modulation",
      node: String(element.dataset.node || ""),
      port: String(element.dataset.param || element.dataset.port || ""),
    };
  }
  if (element.classList?.contains("node-port")) {
    return {
      io: String(element.dataset.io || ""),
      node: String(element.dataset.node || ""),
      port: String(element.dataset.port || ""),
    };
  }
  return null;
}

function nodeGraphMonitorEndpointIsValid(endpoint, nodes = []) {
  const node = nodes.find((candidate) => candidate.id === endpoint?.node);
  const definition = nodeGraphModuleDefinitions[node?.type];
  if (!node || !definition || !endpoint?.port) {
    return false;
  }
  if (endpoint.io === "modulation") {
    return (definition.parameters || []).some((parameter) => parameter.key === endpoint.port);
  }
  if (endpoint.io === "input") {
    return nodeGraphPatchNodeInputPorts(node).includes(nodeGraphCanonicalInputPort(node.type, endpoint.port));
  }
  if (endpoint.io === "output") {
    return nodeGraphPatchNodeOutputPorts(node).includes(nodeGraphCanonicalOutputPort(node.type, endpoint.port));
  }
  return false;
}

function normalizeNodeGraphPatchMonitors(monitors = [], patch = nodeGraphMvp?.patch) {
  const nodes = Array.isArray(patch?.nodes) ? patch.nodes : [];
  const normalized = [];
  const seen = new Set();
  for (const monitor of Array.isArray(monitors) ? monitors : []) {
    const endpoint = {
      io: String(monitor?.io || ""),
      node: String(monitor?.node || ""),
      port: String(monitor?.port || monitor?.param || ""),
    };
    if (!nodeGraphMonitorEndpointIsValid(endpoint, nodes)) {
      continue;
    }
    const key = nodeGraphMonitorEndpointKey(endpoint);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(endpoint);
  }
  return normalized;
}

function nodeGraphMonitorPortSelector(endpoint) {
  if (endpoint?.io === "modulation") {
    return nodeGraphModulationPortSelector(endpoint.node, endpoint.port);
  }
  return nodeGraphPortSelector(endpoint.node, endpoint.port, endpoint.io);
}

function syncNodeGraphMonitorIndicators(patch = nodeGraphMvp?.patch) {
  const workspace = nodeGraphZoomSurface?.();
  if (!workspace || !patch) {
    return;
  }
  const monitors = normalizeNodeGraphPatchMonitors(patch.monitors, patch);
  nodeGraphModuleScopeState.monitors = monitors;
  for (const port of workspace.querySelectorAll(".node-port, .node-param-port")) {
    port.classList.remove("monitored-port");
    port.removeAttribute("data-monitor-state");
  }
  for (const monitor of monitors) {
    const element = workspace.querySelector(nodeGraphMonitorPortSelector(monitor));
    element?.classList.add("monitored-port");
    element?.setAttribute("data-monitor-state", "active");
  }
  scheduleNodeGraphModuleScopeDraw();
}

function toggleNodeGraphMonitorForPort(port) {
  const endpoint = nodeGraphMonitorEndpointFromElement(port);
  if (!endpoint || !nodeGraphMonitorEndpointIsValid(endpoint, nodeGraphMvp.patch.nodes)) {
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const monitors = normalizeNodeGraphPatchMonitors(patch.monitors, patch);
  const key = nodeGraphMonitorEndpointKey(endpoint);
  const nextMonitors = monitors.filter((monitor) => nodeGraphMonitorEndpointKey(monitor) !== key);
  const enabled = nextMonitors.length === monitors.length;
  if (enabled) {
    nextMonitors.push(endpoint);
  }
  patch.monitors = nextMonitors;
  commitNodeGraphPatch(patch, {
    status: enabled ? "monitor added" : "monitor removed",
  });
  return true;
}

function toggleNodeGraphMonitorFromPortEvent(event) {
  if (event.button !== 0 || !event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (toggleNodeGraphMonitorForPort(event.currentTarget)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
}

// beginNodeGraphRenderedScopeCapture → node-graph-module-scope-capture.js
function nodeGraphRenderedScopeMonitorValue(
  monitor,
  runtime,
  frameValues,
  frame,
  frames,
) {
  if (monitor.io === "output") {
    return readNodeGraphRuntimePortOutput(
      runtime,
      frameValues,
      monitor.node,
      monitor.port,
      frame,
      frames,
    );
  }
  if (monitor.io === "input") {
    return (runtime.inputConnections?.get(`${monitor.node}.${monitor.port}`) || [])
      .reduce((sum, connection) => sum + readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      ), 0);
  }
  if (monitor.io === "modulation") {
    return (runtime.modulationConnections?.get(nodeGraphParameterKey(monitor.node, monitor.port)) || [])
      .reduce((sum, modulation) => sum + clampNodeSliderValue(readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        modulation.sourceNode,
        modulation.sourcePort,
        frame,
        frames,
      ), 0, 1), 0);
  }
  return 0;
}

// captureNodeGraphRenderedScopeFrame → node-graph-module-scope-capture.js
// finishNodeGraphRenderedScopeCapture → node-graph-module-scope-capture.js
function nodeGraphLiveModuleScopeFrameCapacity(options = {}) {
  const sampleRate = Math.max(1, Number(nodeGraphModuleScopeState.sampleRate) || Number(nodeGraphMvp?.sampleRate) || 44100);
  const fps = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
    ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp?.moduleScopeFramesPerSecond ?? 60)
    : 60;
  const visualFrameWindow = fps > 0 ? Math.ceil(sampleRate / Math.max(1, fps)) : 0;
  const traceHistoryWindow = Math.ceil(sampleRate * nodeGraphTraceDisplayMaxZoomSeconds);
  return Math.max(
    32,
    Math.floor(Number(options.frames) || 0),
    nodeGraphModuleScopeState.liveFrameCapacity,
    traceHistoryWindow,
    visualFrameWindow,
  );
}

function nodeGraphLiveModuleScopeFingerprint(plan = {}) {
  const ids = Array.isArray(plan.order) && plan.order.length
    ? plan.order
    : (Array.isArray(plan.nodes) ? plan.nodes.map((node) => node.id) : []);
  return ids.map((id) => String(id || "")).filter(Boolean).sort().join("|");
}

// beginNodeGraphLiveModuleScopeCapture → node-graph-module-scope-capture.js
function updateNodeGraphLiveModuleScopeFingerprint(patchFingerprint = nodeGraphPatchFingerprint()) {
  if (nodeGraphModuleScopeState.mode !== "live") {
    return;
  }
  const fingerprint = String(patchFingerprint || "");
  if (!fingerprint || nodeGraphModuleScopeState.patchFingerprint === fingerprint) {
    return;
  }
  nodeGraphModuleScopeState.patchFingerprint = fingerprint;
}

