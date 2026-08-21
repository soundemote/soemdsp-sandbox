function nodeGraphInputKey(node, port) {
  return `${node}.${port}`;
}

function nodeGraphGraphInputKey(node, graphInput) {
  return `${node}.${graphInput}`;
}

function nodeGraphFindInputConnections(node, port) {
  return nodeGraphMvp.connections.filter(
    (connection) =>
      nodeGraphMvp.activeNodes.has(connection.sourceNode) &&
      nodeGraphMvp.activeNodes.has(connection.destinationNode) &&
      connection.destinationNode === node && connection.destinationPort === port,
  );
}

function nodeGraphBuildDependencyMap(patch = nodeGraphMvp.patch) {
  const issues = [];
  const nodeList = Array.isArray(patch.nodes) ? patch.nodes.map((node) => ({ ...node })) : [];
  const nodeMap = new Map(nodeList.map((node) => [node.id, node]));
  const bypassedNodes = nodeGraphRuntimeBypassedNodeIds(patch);
  const dependencies = new Map(nodeList.map((node) => [node.id, new Set()]));
  const inputConnections = new Map();
  const graphInputConnections = new Map();
  const modulationConnections = new Map();

  function addDependency(map, destinationNode, sourceNode) {
    if (!map.has(destinationNode)) {
      map.set(destinationNode, new Set());
    }
    map.get(destinationNode).add(sourceNode);
  }

  for (const node of nodeList) {
    if (!nodeGraphModuleDefinitions[node.type]) {
      issues.push(`unsupported source ${node.id}`);
    }
  }

  for (const connection of patch.connections || []) {
    const source = nodeMap.get(connection.sourceNode);
    const destination = nodeMap.get(connection.destinationNode);
    if (!source || !destination) {
      issues.push("connection references missing node");
      continue;
    }
    const sourceOutputs = nodeGraphPatchNodeOutputPorts(source);
    const sourcePort = nodeGraphCanonicalOutputPort(source.type, connection.sourcePort);
    const destinationPort = nodeGraphCanonicalInputPort(destination.type, connection.destinationPort);
    const destinationInputs = nodeGraphPatchNodeInputPorts(destination);
    if (!sourceOutputs.includes(sourcePort)) {
      issues.push(`connection source port invalid: ${connection.sourceNode}.${connection.sourcePort}`);
      continue;
    }
    if (!destinationInputs.includes(destinationPort)) {
      issues.push(`connection destination port invalid: ${connection.destinationNode}.${connection.destinationPort}`);
      continue;
    }
    // Signal wires still route through bypassed nodes (passthrough DSP at
    // evaluate time). Dropping them used to mute the entire downstream chain.
    const canonicalConnection = { ...connection, sourcePort, destinationPort };
    const key = nodeGraphInputKey(connection.destinationNode, destinationPort);
    const connections = inputConnections.get(key) || [];
    connections.push(canonicalConnection);
    inputConnections.set(key, connections);
    addDependency(dependencies, connection.destinationNode, connection.sourceNode);
  }

  for (const modulation of patch.modulations || []) {
    const source = nodeMap.get(modulation.sourceNode);
    const destination = nodeMap.get(modulation.destinationNode);
    if (!source || !destination) {
      issues.push("modulation references missing node");
      continue;
    }
    const sourceOutputs = nodeGraphPatchNodeOutputPorts(source);
    const sourcePort = nodeGraphCanonicalOutputPort(source.type, modulation.sourcePort);
    const destinationParameters = nodeGraphPatchNodeParameterDefinitions(destination);
    if (!sourceOutputs.includes(sourcePort)) {
      issues.push(`modulation source port invalid: ${modulation.sourceNode}.${modulation.sourcePort}`);
      continue;
    }
    if (!destinationParameters.some((parameter) => parameter.key === modulation.destinationParam)) {
      issues.push(`modulation destination parameter invalid: ${modulation.destinationNode}.${modulation.destinationParam}`);
      continue;
    }
    // Bypassed destinations do not run DSP — skip modulations into them.
    // Sources may still emit (silence or pass) so keep source-side mods.
    if (bypassedNodes.has(modulation.destinationNode)) {
      continue;
    }
    const key = nodeGraphParameterKey(modulation.destinationNode, modulation.destinationParam);
    const modulations = modulationConnections.get(key) || [];
    modulations.push({ ...modulation, sourcePort });
    modulationConnections.set(key, modulations);
    addDependency(dependencies, modulation.destinationNode, modulation.sourceNode);
  }

  for (const graphConnection of patch.graphConnections || []) {
    const source = nodeMap.get(graphConnection.sourceNode);
    const destination = nodeMap.get(graphConnection.destinationNode);
    if (!source || !destination) {
      issues.push("graph connection references missing node");
      continue;
    }
    const sourcePort = nodeGraphCanonicalOutputPort(source.type, graphConnection.sourcePort);
    if (!nodeGraphModuleIsGraphType(source.type) || sourcePort !== "Out") {
      issues.push(`graph connection source invalid: ${graphConnection.sourceNode}.${graphConnection.sourcePort}`);
      continue;
    }
    if (!nodeGraphModuleGraphInputs(destination.type).includes(graphConnection.destinationGraphInput)) {
      issues.push(`graph connection destination invalid: ${graphConnection.destinationNode}.${graphConnection.destinationGraphInput}`);
      continue;
    }
    // Graph wires also keep flowing through bypassed modules (passthrough).
    const key = nodeGraphGraphInputKey(graphConnection.destinationNode, graphConnection.destinationGraphInput);
    const connections = graphInputConnections.get(key) || [];
    connections.push({ ...graphConnection, sourcePort });
    graphInputConnections.set(key, connections);
    addDependency(dependencies, graphConnection.destinationNode, graphConnection.sourceNode);
  }

  return {
    bypassedNodes: [...bypassedNodes],
    connections: (patch.connections || []).map((connection) => {
      const source = nodeMap.get(connection.sourceNode);
      const destination = nodeMap.get(connection.destinationNode);
      const sourcePort = source
        ? nodeGraphCanonicalOutputPort(source.type, connection.sourcePort)
        : connection.sourcePort;
      const destinationPort = destination
        ? nodeGraphCanonicalInputPort(destination.type, connection.destinationPort)
        : connection.destinationPort;
      return { ...connection, sourcePort, destinationPort };
    }),
    dependencies,
    graphConnections: (patch.graphConnections || []).map((connection) => {
      const source = nodeMap.get(connection.sourceNode);
      const sourcePort = source
        ? nodeGraphCanonicalOutputPort(source.type, connection.sourcePort)
        : connection.sourcePort;
      return { ...connection, sourcePort };
    }),
    graphInputConnections,
    inputConnections,
    issues,
    modulationConnections,
    modulations: (patch.modulations || []).map((modulation) => {
      const source = nodeMap.get(modulation.sourceNode);
      const sourcePort = source
        ? nodeGraphCanonicalOutputPort(source.type, modulation.sourcePort)
        : modulation.sourcePort;
      return { ...modulation, sourcePort };
    }),
    nodeMap,
    nodes: nodeList,
  };
}

function nodeGraphTopologicalOrder(nodes, dependencies, reachableNodes) {
  const order = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(nodeId) {
    if (!reachableNodes.has(nodeId)) {
      return;
    }
    if (visiting.has(nodeId)) {
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);
    for (const dependency of dependencies.get(nodeId) || []) {
      visit(dependency);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    if (!order.includes(nodeId)) {
      order.push(nodeId);
    }
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return { order };
}

function nodeGraphDependencyPathExists(dependencies, startNode, targetNode) {
  if (startNode === targetNode) {
    return true;
  }
  const visited = new Set();

  function visit(nodeId) {
    if (nodeId === targetNode) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visited.add(nodeId);
    for (const dependency of dependencies.get(nodeId) || []) {
      if (visit(dependency)) {
        return true;
      }
    }
    return false;
  }

  return visit(startNode);
}

function nodeGraphNodeOrderIndexes(nodes) {
  return new Map(nodes.map((node, index) => [node.id, index]));
}

function nodeGraphCompareSchedulingEdges(a, b) {
  return Number(a.isBackward) - Number(b.isBackward) ||
    a.sourceOrder - b.sourceOrder ||
    a.destinationOrder - b.destinationOrder ||
    a.kindOrder - b.kindOrder ||
    a.index - b.index;
}

function nodeGraphSchedulingEdge(sourceNode, destinationNode, kind, index, payload, nodeOrder) {
  const sourceOrder = nodeOrder.get(sourceNode) ?? Number.MAX_SAFE_INTEGER;
  const destinationOrder = nodeOrder.get(destinationNode) ?? Number.MAX_SAFE_INTEGER;
  return {
    destinationNode,
    index,
    isBackward: sourceOrder >= destinationOrder,
    kind,
    kindOrder: kind === "signal" ? 0 : kind === "modulation" ? 1 : 2,
    payload: { ...payload },
    sourceNode,
    sourceOrder,
    destinationOrder,
  };
}

function nodeGraphBuildSchedulingDependencies(planGraph, reachableNodes) {
  const orderDependencies = new Map(planGraph.nodes.map((node) => [node.id, new Set()]));
  const feedbackConnections = [];
  const feedbackGraphConnections = [];
  const feedbackModulations = [];
  const nodeOrder = nodeGraphNodeOrderIndexes(planGraph.nodes);
  const schedulingEdges = [];
  const validSignalWires = new Set(
    [...planGraph.inputConnections.values()]
      .flat()
      .map(nodeGraphSignalWireIdentity),
  );
  const validModulationWires = new Set(
    [...planGraph.modulationConnections.values()]
      .flat()
      .map(nodeGraphModulationWireIdentity),
  );
  const validGraphWires = new Set(
    [...planGraph.graphInputConnections.values()]
      .flat()
      .map(nodeGraphGraphWireIdentity),
  );

  for (const [index, connection] of planGraph.connections.entries()) {
    if (
      !validSignalWires.has(nodeGraphSignalWireIdentity(connection)) ||
      !reachableNodes.has(connection.sourceNode) ||
      !reachableNodes.has(connection.destinationNode)
    ) {
      continue;
    }
    schedulingEdges.push(nodeGraphSchedulingEdge(
      connection.sourceNode,
      connection.destinationNode,
      "signal",
      index,
      connection,
      nodeOrder,
    ));
  }

  for (const [index, modulation] of planGraph.modulations.entries()) {
    if (
      !validModulationWires.has(nodeGraphModulationWireIdentity(modulation)) ||
      !reachableNodes.has(modulation.sourceNode) ||
      !reachableNodes.has(modulation.destinationNode)
    ) {
      continue;
    }
    schedulingEdges.push(nodeGraphSchedulingEdge(
      modulation.sourceNode,
      modulation.destinationNode,
      "modulation",
      index,
      modulation,
      nodeOrder,
    ));
  }

  for (const [index, graphConnection] of planGraph.graphConnections.entries()) {
    if (
      !validGraphWires.has(nodeGraphGraphWireIdentity(graphConnection)) ||
      !reachableNodes.has(graphConnection.sourceNode) ||
      !reachableNodes.has(graphConnection.destinationNode)
    ) {
      continue;
    }
    schedulingEdges.push(nodeGraphSchedulingEdge(
      graphConnection.sourceNode,
      graphConnection.destinationNode,
      "graph",
      index,
      graphConnection,
      nodeOrder,
    ));
  }

  for (const edge of schedulingEdges.sort(nodeGraphCompareSchedulingEdges)) {
    if (nodeGraphDependencyPathExists(orderDependencies, edge.sourceNode, edge.destinationNode)) {
      if (edge.kind === "signal") {
        feedbackConnections.push(edge.payload);
      } else if (edge.kind === "modulation") {
        feedbackModulations.push(edge.payload);
      } else {
        feedbackGraphConnections.push(edge.payload);
      }
    } else {
      orderDependencies.get(edge.destinationNode)?.add(edge.sourceNode);
    }
  }

  return { feedbackConnections, feedbackGraphConnections, feedbackModulations, orderDependencies };
}

function nodeGraphActiveVisualSinkExists(visualSinks = []) {
  return visualSinks.some((sink) =>
    sink.hasParameters || (sink.inputs || []).some((input) => input.connected),
  );
}

function nodeGraphVisualSinkActiveInPlan(node, options = {}) {
  if (!nodeGraphModuleDefinitions[node?.type]?.visualSink) {
    return false;
  }
  const bypassedNodes = options.bypassedNodes instanceof Set
    ? options.bypassedNodes
    : new Set(options.bypassedNodes || []);
  if (node?.id && bypassedNodes.has(node.id)) {
    return false;
  }
  return true;
}

/**
 * True when the worklet should capture/buffer visual samples for this sink.
 * Reachability for DSP still uses ActiveInPlan; capture is gated by face UI
 * so oscilloscopeHidden / global “displays off” stop audio-thread writes.
 */
function nodeGraphVisualSinkNeedsAudioCapture(node, options = {}) {
  if (!nodeGraphVisualSinkActiveInPlan(node, options)) {
    return false;
  }
  if (typeof nodeGraphPatchNodeDisplayVisibleInPlan === "function") {
    return nodeGraphPatchNodeDisplayVisibleInPlan(node, options);
  }
  return true;
}

function nodeGraphVisualSinkDisplayVisible(node, options = {}) {
  return nodeGraphVisualSinkNeedsAudioCapture(node, options);
}

function nodeGraphPatchNodeDisplayVisibleInPlan(node, options = {}) {
  const bypassedNodes = options.bypassedNodes instanceof Set
    ? options.bypassedNodes
    : new Set(options.bypassedNodes || []);
  if (node?.id && bypassedNodes.has(node.id)) {
    return false;
  }
  // DisplayVisibleForUi already applies the global "Show displays" flag for
  // hideable analyzer scopes, while keeping custom faces (Number Readout,
  // Knob, LED, …) always active so they still receive live buffers.
  if (typeof nodeGraphModuleDisplayVisibleForUi === "function") {
    return nodeGraphModuleDisplayVisibleForUi(node?.type, node?.ui);
  }
  if (nodeGraphMvp?.moduleOscilloscopesVisible === false) {
    return false;
  }
  const normalizedUi = node?.ui && typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(node.ui, node.type)
    : (node?.ui || {});
  return normalizedUi?.oscilloscopeHidden !== true;
}

function nodeGraphValidateRuntimeRoute(issues, options = {}) {
  const hasOutputNode = Boolean(options.hasOutputNode);
  const hasOutputSpeakerInput = Boolean(options.hasOutputSpeakerInput);
  const hasActiveVisualSink = Boolean(options.hasActiveVisualSink);
  if (!hasOutputNode && !hasActiveVisualSink) {
    issues.push("output node missing");
  }
  if (hasOutputNode && !hasOutputSpeakerInput && !hasActiveVisualSink) {
    issues.push("missing Output speaker input");
  }
}

function compileNodeGraphExecutionPlan(patch = nodeGraphMvp.patch) {
  const graph = nodeGraphBuildDependencyMap(patch);
  const issues = [...graph.issues];
  const outputNode = "output";
  const reachableNodes = new Set();
  const bypassedNodes = new Set(graph.bypassedNodes || []);
  const passthroughTypes = new Set(["asciiscope", "matrixDisplay", "matrixWaterfall", "activeFilter", "allpass", "badvalMonitor", "bandpass", "crossover2", "crossover3", "crossover4", "crossover5", "crossover6", "modeResonator", "combResonator", "waveguide", "phaser", "flanger", "chorus", "bode", "phaseDisperse", "stftBlur", "bessel", "bias", "u2b", "b2u", "inv", "butterworth", "chaoticPhaseLockingFilter", "chebyshev", "cookbookFilter", "elliptic", "eqFilter", "flowerChildFilter", "formantFilter", "besselThomson", "massSpringDamper", "gain", "mixStereo", "humanFilter", "inertialFilter", "ladderFilter", "linkwitzRiley", "papoulisFilter", "passiveFilter", "pll", "resonatorFilter", "reverbEffect", "sampleDelay", "sampleHold", "slewLimiter", "softClipper", "clipperLimiter", "airClipper", "speakerProtection", "speakerProtector2", "spectrogram", "speedColorInertia", "superloveFilter", "tb303Filter", "tiltFilter", "wallDelay", "yellowjacketFilter", "midSideEncode", "quadrature", "hilbert", "lookaheadLimiter"]);

  function markReachable(nodeId) {
    if (reachableNodes.has(nodeId) || !graph.nodeMap.has(nodeId)) {
      return;
    }
    reachableNodes.add(nodeId);
    for (const dependency of graph.dependencies.get(nodeId) || []) {
      markReachable(dependency);
    }
  }

  const hasOutputNode = graph.nodeMap.has(outputNode);
  if (hasOutputNode) {
    markReachable(outputNode);
  }
  // Plugin Output nodes are audio sinks; keep them reachable so upstream evaluates.
  for (const node of graph.nodes) {
    if (
      (node?.type === "pluginOutput"
        || node?.type === "portalOutlet"
        || (typeof nodeGraphPortalIsOutletType === "function" && nodeGraphPortalIsOutletType(node?.type)))
      && !bypassedNodes.has(node.id)
    ) {
      markReachable(node.id);
    }
  }
  // groupOutput nodes only need forced reachability when this compile IS a
  // moduleGroup's own inner sourcePatch -- which, by construction
  // (saveNodeGraphSelectionAsModuleGroup excludes type "output"), never has
  // a real "output" node, so !hasOutputNode is exactly that signal. Forcing
  // this unconditionally used to also run for the actual top-level patch,
  // where a Group Output sitting around mid-build (not yet part of any
  // built group, doing nothing real) would drag its whole upstream chain
  // into strict validation and could invalidate the ENTIRE patch compile --
  // muting all audio -- over an in-progress wire that has no bearing on
  // anything the speaker route actually depends on. Elsewhere in this
  // compiler, an unreached/dangling node is simply inert, never validated;
  // this restores that same invariant for groupOutput on the top-level patch.
  const groupOutputNodes = hasOutputNode
    ? []
    : graph.nodes.filter((node) => node.type === "groupOutput");
  for (const node of groupOutputNodes) {
    markReachable(node.id);
  }
  for (const node of graph.nodes) {
    if (nodeGraphVisualSinkActiveInPlan(node, { bypassedNodes })) {
      markReachable(node.id);
    }
    // Interactive LayoutB chromeless faces (bug button, XY pad, …) always
    // evaluate for their on-screen UI — not only when wired into the speaker
    // path. XY Pad needs this so Phase+CV still runs through smoothing and
    // phosphor even when Out X/Y are unconnected.
    if (
      !bypassedNodes.has(node.id) &&
      typeof nodeGraphChromelessModuleUsesSolidShell === "function" &&
      nodeGraphChromelessModuleUsesSolidShell(node.type)
    ) {
      markReachable(node.id);
    }
    if (
      nodeGraphModuleDefinitions[node.type]?.monitorSink &&
      (graph.inputConnections.get(nodeGraphInputKey(node.id, "In")) || []).length > 0
    ) {
      markReachable(node.id);
    }
  }
  const visualSinks = nodeGraphCompiledVisualSinks(graph, reachableNodes);
  const scopeCaptureNodeIds = nodeGraphCompiledScopeCaptureNodeIds(graph, reachableNodes);
  const hasActiveVisualSink = nodeGraphActiveVisualSinkExists(visualSinks);
  const hasOutputSpeakerInput = nodeGraphOutputInputPorts.some(
    (port) => (graph.inputConnections.get(nodeGraphInputKey(outputNode, port)) || []).length > 0,
  );
  if (!groupOutputNodes.length) {
    nodeGraphValidateRuntimeRoute(issues, {
      hasActiveVisualSink,
      hasOutputNode,
      hasOutputSpeakerInput,
    });
  }

  for (const nodeId of reachableNodes) {
    const type = graph.nodeMap.get(nodeId)?.type;
    if (passthroughTypes.has(type)) {
      const inputPorts = type === "reverbEffect" ? ["In", "Left", "Right"] : ["In"];
      const inputCount = inputPorts.reduce(
        (count, port) => count + (graph.inputConnections.get(nodeGraphInputKey(nodeId, port)) || []).length,
        0,
      );
      if (!inputCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} input`);
      }
    } else if (type === "expAdsr" || type === "attackDecay") {
      const gateCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Gate")) || []).length;
      if (!gateCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} gate`);
      }
    } else if (type === "linearEnvelope") {
      const gateCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Gate")) || []).length;
      if (!gateCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} gate`);
      }
    } else if (type === "pluckEnvelope") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "vactrolEnvelopeSeries" || type === "vactrolEnvelopeCustom") {
      const lightCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Light")) || []).length;
      if (!lightCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} light`);
      }
    } else if (type === "flowerChildEnvelopeFollower") {
      const inputCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "In")) || []).length;
      if (!inputCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} input`);
      }
    } else if (type === "delayedTrigger") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "triggerCounter") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "pulseExplosion") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "stepSequencer") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "triggerDivider") {
      const triggerCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Trigger")) || []).length;
      if (!triggerCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} trigger`);
      }
    } else if (type === "clockDivider") {
      const clockCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Clock")) || []).length;
      if (!clockCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} clock`);
      }
    } else if (type === "turingMachine") {
      const clockCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "Clock")) || []).length;
      if (!clockCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} clock`);
      }
    } else if (type === "comparator") {
      const signalCount = (graph.inputConnections.get(nodeGraphInputKey(nodeId, "In")) || []).length;
      if (!signalCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} signal`);
      }
    } else if (!nodeGraphModuleProducesOutputWithoutSignalInput(type)) {
      // Generic fallback for any module type not covered by one of the
      // specific branches above: check its own declared input ports
      // (nodeGraphModuleDefinitions[type].inputs) for a connection, the
      // same way the passthroughTypes branch above does for its
      // explicitly-registered members -- reaching this branch already
      // guarantees `inputs` is non-empty (nodeGraphModuleProducesOutputWithoutSignalInput
      // returns true, short-circuiting this branch, for any type with no
      // declared inputs).
      //
      // This used to unconditionally treat "not on a manually maintained
      // list" as fatal ("unsupported source"), which meant every new
      // simple effect module (Ping Pong Delay, then Wall Delay) silently
      // broke ONLY the realtime live-audio path the moment it shipped --
      // the offline/preview path doesn't run this check at all, so
      // nothing caught it until someone specifically tested live
      // playback. Checking the module's own declared ports instead of
      // rejecting-unless-registered means a future module with a plain
      // In-style port just works with no manual registration step, and
      // gets the same friendly "missing X input" message the registered
      // types get instead of a hard failure that blocks the whole patch.
      const inputPorts = nodeGraphModuleDefinitions[type]?.inputs || [];
      const inputCount = inputPorts.reduce(
        (count, port) => count + (graph.inputConnections.get(nodeGraphInputKey(nodeId, port)) || []).length,
        0,
      );
      if (!inputCount && nodeGraphNodeSignalOutputRequired(graph, nodeId)) {
        issues.push(`missing ${nodeGraphNodeDisplayName(nodeId)} input`);
      }
    }
  }

  const scheduling = nodeGraphBuildSchedulingDependencies(graph, reachableNodes);


  const topology = nodeGraphTopologicalOrder(graph.nodes, scheduling.orderDependencies, reachableNodes);
  const order = topology.order.filter((nodeId) => reachableNodes.has(nodeId));
  // B3: source seeding is data-driven via planRole (+ legacy fallback inside
  // nodeGraphModuleIsPlanSourceType until NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES retires).
  const sourceNodes = order.filter((nodeId) => {
    const type = graph.nodeMap.get(nodeId)?.type;
    if (typeof nodeGraphModuleIsPlanSourceType === "function") {
      return nodeGraphModuleIsPlanSourceType(type);
    }
    // Boot-order fallback if plan-roles.js failed to load.
    return nodeGraphModuleIsRealtimeOscillatorType(type);
  });
  const inactiveNodes = graph.nodes
    .filter((node) => !reachableNodes.has(node.id))
    .map((node) => node.id);

  const uniqueIssues = [...new Set(issues)];
  // "missing <node> input/gate/trigger/light/clock" flags a node whose
  // required input is unconnected -- a content warning, not a structural
  // break. The node still runs (reading silence/0 on that port), so it must
  // not block the live plan from applying: otherwise disconnecting a wire
  // that leaves a node like this (e.g. a reverb's only input) gets silently
  // rejected and the previous, still-connected live audio plan keeps
  // running instead, making the disconnect appear to do nothing.
  const softMissingInputIssue = /^missing .+ (input|gate|trigger|light|clock|signal)$/;
  const blockingIssues = uniqueIssues.filter((issue) => (
    issue !== "output node missing" &&
    issue !== "missing Output speaker input" &&
    !softMissingInputIssue.test(issue)
  ));

  return {
    connections: graph.connections,
    dependencies: graph.dependencies,
    bypassedNodes: graph.bypassedNodes,
    feedbackConnections: scheduling.feedbackConnections,
    feedbackGraphConnections: scheduling.feedbackGraphConnections,
    feedbackModulations: scheduling.feedbackModulations,
    graphConnections: graph.graphConnections,
    graphInputConnections: graph.graphInputConnections,
    inactiveNodes,
    inputConnections: graph.inputConnections,
    issues: uniqueIssues,
    modulationConnections: graph.modulationConnections,
    modulations: graph.modulations,
    nodeMap: graph.nodeMap,
    nodes: graph.nodes,
    orderDependencies: scheduling.orderDependencies,
    order,
    outputNode,
    reachableNodes: [...reachableNodes],
    speakerOutputActive: hasOutputNode && hasOutputSpeakerInput,
    scopeCaptureNodeIds,
    scopeCaptureRates: Object.fromEntries(
      (scopeCaptureNodeIds || []).map((nodeId) => [
        String(nodeId),
        nodeGraphScopeCaptureWriteHz(graph.nodeMap.get(nodeId)),
      ]),
    ),
    sourceNodes,
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    valid: blockingIssues.length === 0,
    visualSinks,
  };
}

function nodeGraphCompiledVisualSinks(graph, reachableNodes) {
  const bypassedNodes = new Set(graph.bypassedNodes || []);
  return graph.nodes
    .filter((node) =>
      reachableNodes.has(node.id) &&
      !bypassedNodes.has(node.id) &&
      // Only sinks whose face is currently shown — hidden scopes must not
      // allocate rings or run per-sample visual writes on the audio thread.
      nodeGraphVisualSinkNeedsAudioCapture(node, { bypassedNodes })
    )
    .map((node) => {
      const bufferedInputs = nodeGraphPatchNodeBufferedInputs(node);
      const bufferedSet = new Set(bufferedInputs);
      return {
        bufferSampleLimit: nodeGraphVisualSinkBufferSampleLimit(node),
        // Target visual write rate (Hz). Worklet hops engine samples to this.
        // ~12 kHz is enough for phosphor / scopes; full rate was starving audio.
        visualWriteHz: nodeGraphVisualSinkWriteHz(node),
        bufferedInputs,
        hasParameters: (nodeGraphModuleDefinitions[node.type]?.parameters || []).length > 0,
        inputs: nodeGraphPatchNodeVisualInputs(node).map((input) => ({
          ...input,
          buffered: bufferedSet.has(input.port),
          connected: (graph.inputConnections.get(nodeGraphInputKey(node.id, input.port)) || []).length > 0,
          connections: (graph.inputConnections.get(nodeGraphInputKey(node.id, input.port)) || [])
            .map((connection) => ({ ...connection })),
        })),
        nodeId: node.id,
        type: node.type,
      };
    });
}

function nodeGraphCompiledScopeCaptureNodeIds(graph, reachableNodes) {
  const bypassedNodes = new Set(graph.bypassedNodes || []);
  const modulationSources = new Set();
  for (const modulation of graph.modulations || []) {
    if (modulation?.sourceNode) {
      modulationSources.add(String(modulation.sourceNode));
    }
  }
  return graph.nodes
    .filter((node) =>
      reachableNodes.has(node.id) &&
      !bypassedNodes.has(node.id) &&
      node.type !== "output" &&
      node.type !== "pluginOutput" &&
      (
        // Graph editor playhead reads "__GraphPhase" from scope buffers -- always
        // capture graph modules even when they have no separate oscilloscope face.
        nodeGraphModuleIsGraphType(node.type) ||
        modulationSources.has(String(node.id)) ||
        (
          typeof nodeGraphChromelessModuleUsesSolidShell === "function"
          && nodeGraphChromelessModuleUsesSolidShell(node.type)
          && nodeGraphPatchNodeDisplayVisibleInPlan(node, { bypassedNodes })
        ) ||
        (
          nodeGraphModuleDisplayRendererForNode(node) !== "legacy" &&
          nodeGraphPatchNodeDisplayVisibleInPlan(node, { bypassedNodes })
        )
      )
    )
    .map((node) => node.id);
}

// History length is for display windows, not full 10s of engine-rate audio.
// CPU cost is write rate (decimated in worklet); capacity stays modest.
const nodeGraphVisualSinkHistorySeconds = 1;

const NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ = 12000;
const NODE_GRAPH_VISUAL_LATEST_WRITE_HZ = 120;

function nodeGraphVisualDisplayNeedsWaveformRing(node) {
  const displayType = String(
    nodeGraphModuleDefinitions[node?.type]?.displayType || node?.displayType || "",
  );
  return (
    displayType === "trace" ||
    displayType === "scope2d" ||
    displayType === "scope2dTrace" ||
    displayType === "lineBurn" ||
    displayType === "hypersawBurn" ||
    displayType === "videoscopeBurn" ||
    displayType === "oscilloscopeBankBurn" ||
    displayType === "spectrogramBurn" ||
    displayType === "phosphorWaveform" ||
    displayType === "phosphorLight" ||
    displayType === "customDisplay" ||
    displayType === "matrixFace" ||
    displayType === "matrixWaterfallFace" ||
    displayType === "matrixDisplayFace" ||
    displayType === "dot"
  );
}

/** Target samples/sec into visual rings (display quality, not audio fidelity). */
function nodeGraphVisualSinkWriteHz(node) {
  // LCD / LED / value plates only need the latest number. Instant Trace and
  // 2D phosphor still hop at ~12 kHz so paths stay dense.
  if (nodeGraphVisualDisplayNeedsWaveformRing(node)) {
    return NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ;
  }
  return NODE_GRAPH_VISUAL_LATEST_WRITE_HZ;
}

/** Generic module-output capture rate (LCD, RoundShape __Phase, slider ghosts). */
function nodeGraphScopeCaptureWriteHz(node) {
  if (nodeGraphVisualDisplayNeedsWaveformRing(node)) {
    return NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ;
  }
  return NODE_GRAPH_VISUAL_LATEST_WRITE_HZ;
}

function nodeGraphVisualSinkBufferSampleLimit(node) {
  const writeHz = Math.max(1, Math.round(Number(nodeGraphVisualSinkWriteHz(node)) || NODE_GRAPH_VISUAL_WAVEFORM_WRITE_HZ));
  // History faces keep ≥1s even when Simulation FPS is 1 (one paint/sec).
  const seconds = Math.max(1, Number(nodeGraphVisualSinkHistorySeconds) || 1);
  const historySamples = Math.ceil(writeHz * seconds);
  const fallback = Math.max(1, Math.round(Number(nodeGraphBufferedInputSampleLimit) || 65536));
  return Math.min(fallback, Math.max(4096, historySamples));
}

function nodeGraphNodeSignalOutputRequired(graph, nodeId) {
  const node = graph.nodeMap.get(nodeId);
  const signalOutputs = new Set(nodeGraphPatchNodeOutputPorts(node));
  if (!signalOutputs.size) {
    return false;
  }
  return [...graph.inputConnections.values()]
    .flat()
    .some((connection) =>
      connection.sourceNode === nodeId && signalOutputs.has(connection.sourcePort),
    );
}

function compileValidatedNodeGraphExecutionPlan(patch = nodeGraphMvp.patch) {
  return compileNodeGraphExecutionPlan(validateNodeGraphPatch(patch));
}

function nodeGraphValidate() {
  const plan = compileNodeGraphExecutionPlan();
  return {
    issues: plan.issues,
    order: plan.order,
    scheduleText: nodeGraphScheduleText(
      plan.order,
      plan.issues,
      plan.feedbackConnections,
      plan.feedbackModulations,
    ),
    sourceNode: plan.sourceNodes[0] || "",
    sourceNodes: plan.sourceNodes,
    speakerOutputActive: Boolean(plan.speakerOutputActive),
    valid: plan.valid,
    visualSinks: plan.visualSinks || [],
  };
}
