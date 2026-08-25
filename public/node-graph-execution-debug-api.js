function nodeGraphExecutionParameterSnapshot(plan) {
  const parametersByNode = {};
  const nodesById = new Map((plan.nodes || []).map((node) => [node.id, node]));
  for (const nodeId of plan.order || []) {
    const patchNode = nodesById.get(nodeId);
    const type = patchNode?.type || nodeGraphNodeType(nodeId);
    const definition = nodeGraphModuleDefinitions[type];
    const parameters = {};
    for (const parameter of definition?.parameters || []) {
      const metadata = nodeGraphReadPatchParameterMetadata(patchNode || nodeId, parameter.key);
      const value = nodeGraphReadPatchParameterValue(patchNode || nodeId, parameter.key);
      parameters[parameter.key] = {
        display: nodeGraphPatchChoiceLabel(metadata, value) ??
          formatNodeSliderCompactNumber(value),
        value,
      };
    }
    if (Object.keys(parameters).length) {
      parametersByNode[nodeId] = parameters;
    }
  }
  return parametersByNode;
}

function nodeGraphLastRenderDebug() {
  const rendered = nodeGraphMvp.rendered;
  if (!rendered) {
    return null;
  }
  const currentPatchFingerprint = nodeGraphPatchFingerprint();
  return {
    connectionCount: Number(rendered.connectionCount) || 0,
    clipCount: Number(rendered.clipCount) || 0,
    currentPatchFingerprint,
    durationSeconds: Number(rendered.durationSeconds) || 0,
    feedbackConnectionCount: Number(rendered.feedbackConnectionCount) || 0,
    feedbackModulationCount: Number(rendered.feedbackModulationCount) || 0,
    frames: Number(rendered.frames) || 0,
    matchesCurrentPatch: rendered.patchFingerprint === currentPatchFingerprint,
    modulationCount: Number(rendered.modulationCount) || 0,
    nodeCount: Number(rendered.nodeCount) || 0,
    patchFingerprint: rendered.patchFingerprint || "",
    peak: Number(rendered.peak) || 0,
    rms: Number(rendered.rms) || 0,
    sampleRate: Number(rendered.sampleRate) || nodeGraphMvp.sampleRate,
    stateReadCount: Number(rendered.stateReadCount) || 0,
  };
}

function nodeGraphRuntimeBoundaryDebug(plan) {
  return {
    authoringOnly: ["info", "grid", "visual", "bypassedNodes", "node gx/gy"],
    compiledRuntime: ["order", "active signal wires", "active modulation wires", "parameters", "wire read modes"],
    compilerFiltered: {
      bypassedNodes: [...(plan.bypassedNodes || [])],
      inactiveNodes: [...(plan.inactiveNodes || [])],
      inactiveWireReads: nodeGraphInactiveWireReads(plan),
    },
    invariant: "DSP nodes do not know patch authoring or display fields",
    visual: normalizeNodeGraphPatchVisual(nodeGraphMvp.patch.visual),
  };
}

function nodeGraphSoemdspObjectConcept(type) {
  switch (type) {
    case "osc":
      return "caller-owned Open Sound Control bridge (under construction)";
    case "polyBlep":
      return "caller-owned oscillator DSP object";
    case "spiral":
      return "caller-owned JerobeamSpiral DSP object";
    case "lorenzAttractor":
      return "caller-owned LorenzAttractor DSP object";
    case "gain":
      return "caller-owned gain DSP object";
    case "bias":
      return "caller-owned bias DSP object";
    case "output":
      return "caller-owned output/audio sink";
    default:
      return "unsupported caller-owned DSP object";
  }
}

function nodeGraphSoemdspRuntimeMapping(plan) {
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  const feedbackSets = nodeGraphFeedbackIdentitySets(plan);
  const nodesById = new Map((plan.nodes || []).map((node) => [node.id, node]));
  const signalBindings = nodeGraphActiveSignalConnections(plan).map((connection) => ({
    destinationInput: `${connection.destinationNode}.${connection.destinationPort}`,
    readMode: feedbackSets.signal.has(nodeGraphSignalWireIdentity(connection))
      ? "stored output state read"
      : "same-pass buffer read",
    sourceOutput: `${connection.sourceNode}.${connection.sourcePort}`,
  }));
  const modulationBindings = nodeGraphActiveModulations(plan).map((modulation) => ({
    destinationParameter: `${modulation.destinationNode}.${modulation.destinationParam}`,
    readMode: feedbackSets.modulation.has(nodeGraphModulationWireIdentity(modulation))
      ? "stored output state read"
      : "same-pass buffer read",
    sourceOutput: `${modulation.sourceNode}.${modulation.sourcePort}`,
  }));

  return {
    bindingRole: "Binding syncs parameter/control memory; DSP objects do not know Circuit",
    circuitRole: "Circuit/patch describes nodes, parameters, and raw connections; it does not own concrete DSP objects",
    compilerRole: "Compiler filters authoring state and emits order, active wires, parameter bindings, and state-read edges",
    dspObjectRole: "Caller owns concrete DSP objects and invokes them in compiled order",
    mappedNodes: (plan.order || []).map((nodeId) => {
      const node = nodesById.get(nodeId);
      return {
        id: nodeId,
        objectConcept: nodeGraphSoemdspObjectConcept(node?.type),
        type: node?.type || "unknown",
      };
    }),
    nonRuntimePatchFields: ["info", "grid", "visual", "bypassedNodes", "node gx/gy", "paramMeta display hints"],
    parameterBindings: nodeGraphExecutionParameterSnapshot(plan),
    runtimeNodeIds: [...activeNodeIds],
    signalBindings,
    modulationBindings,
    stateReadEdges: {
      modulations: plan.feedbackModulations.map((modulation) =>
        `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
      ),
      signals: plan.feedbackConnections.map((connection) =>
        `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
      ),
    },
    status: plan.valid ? "mapping proof ready" : "mapping blocked by invalid patch",
  };
}

function nodeGraphSoemdspRuntimeSketch(plan) {
  const mapping = nodeGraphSoemdspRuntimeMapping(plan);
  const objectLines = mapping.mappedNodes.map((node) =>
    `// ${node.id}: ${node.objectConcept}`,
  );
  const signalLines = mapping.signalBindings.map((binding) =>
    `// signal ${binding.sourceOutput} -> ${binding.destinationInput} (${binding.readMode})`,
  );
  const modulationLines = mapping.modulationBindings.map((binding) =>
    `// mod ${binding.sourceOutput} -> ${binding.destinationParameter} (${binding.readMode})`,
  );
  return [
    "// soemdsp browser proof -> caller-owned C++ runtime sketch",
    "// Circuit/patch describes source data; it does not own these DSP objects.",
    ...objectLines,
    "Binding::apply(circuit, externalParameterMemory);",
    ...signalLines,
    ...modulationLines,
    "for (std::size_t frame = 0; frame < blockSize; ++frame) {",
    "  // read same-pass values when available; otherwise read stored node output",
    `  for (NodeId node : { ${plan.order.map((nodeId) => `\"${nodeId}\"`).join(", ")} }) {`,
    "    processCallerOwnedDspObject(node, externalParameterMemory, storedOutputs);",
    "  }",
    "}",
  ].join("\n");
}

function serializeNodeGraphExecutionPlanDebug(plan) {
  const samePassDependencies = {};
  for (const [nodeId, dependencies] of plan.orderDependencies.entries()) {
    if (dependencies.size) {
      samePassDependencies[nodeId] = [...dependencies];
    }
  }

  const signalInputs = {};
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  for (const [key, connections] of plan.inputConnections.entries()) {
    const activeConnections = connections.filter((connection) =>
      nodeGraphSignalConnectionIsActive(connection, activeNodeIds),
    );
    if (activeConnections.length) {
      signalInputs[key] = activeConnections.map((connection) =>
        `${connection.sourceNode}.${connection.sourcePort}`,
      );
    }
  }

  const modulationInputs = {};
  for (const [key, modulations] of plan.modulationConnections.entries()) {
    const activeModulations = modulations.filter((modulation) =>
      nodeGraphModulationIsActive(modulation, activeNodeIds),
    );
    if (activeModulations.length) {
      modulationInputs[key] = activeModulations.map((modulation) =>
        `${modulation.sourceNode}.${modulation.sourcePort}`,
      );
    }
  }

  return JSON.stringify(
    {
      activeNodeCount: plan.reachableNodes?.length || 0,
      activeWireCount: nodeGraphActiveWireCount(plan),
      bypassedNodes: plan.bypassedNodes || [],
      currentPatchFingerprint: nodeGraphPatchFingerprint(),
      executionModel: "single-pass stored-output",
      feedbackModulations: plan.feedbackModulations.map((modulation) =>
        `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
      ),
      feedbackSignals: plan.feedbackConnections.map((connection) =>
        `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
      ),
      inactiveNodes: plan.inactiveNodes || [],
      inactiveWireReads: nodeGraphInactiveWireReads(plan),
      issues: plan.issues,
      lastRender: nodeGraphLastRenderDebug(),
      modulationInputs,
      order: plan.valid ? plan.order : [],
      outputNode: plan.outputNode,
      patchNodeCount: plan.nodes?.length || 0,
      patchWireCount: nodeGraphPatchWireCount(plan),
      parameters: nodeGraphExecutionParameterSnapshot(plan),
      partialOrder: plan.valid ? [] : plan.order,
      runtimeBoundary: nodeGraphRuntimeBoundaryDebug(plan),
      schedulerPolicy: "same-pass acyclic edges; patch-node-order cycle-closing edges read stored outputs",
      samePassDependencies,
      signalInputs,
      soemdspMapping: nodeGraphSoemdspRuntimeMapping(plan),
      soemdspRuntimeSketch: nodeGraphSoemdspRuntimeSketch(plan),
      sourceNodes: plan.sourceNodes,
      speakerOutputActive: Boolean(plan.speakerOutputActive),
      stateReadCount: nodeGraphStateReadCount(plan),
      storedOutputInitialValue: 0,
      valid: plan.valid,
      visualSinks: plan.visualSinks || [],
      wireReads: nodeGraphExecutionWireReads(plan),
    },
    null,
    2,
  );
}

function serializeNodeGraphExecutionPlanApiDebug(plan) {
  return {
    activeNodeCount: plan.reachableNodes?.length || 0,
    activeWireCount: nodeGraphActiveWireCount(plan),
    bypassedNodes: [...(plan.bypassedNodes || [])],
    currentPatchFingerprint: nodeGraphPatchFingerprint(),
    feedbackModulations: plan.feedbackModulations.map((modulation) =>
      `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
    ),
    feedbackSignals: plan.feedbackConnections.map((connection) =>
      `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
    ),
    inactiveNodes: plan.inactiveNodes || [],
    issues: [...plan.issues],
    lastRender: nodeGraphLastRenderDebug(),
    order: [...plan.order],
    patchNodeCount: plan.nodes?.length || 0,
    patchWireCount: nodeGraphPatchWireCount(plan),
    runtimeBoundary: nodeGraphRuntimeBoundaryDebug(plan),
    samePassDependencies: [...plan.orderDependencies.entries()].reduce(
      (dependencies, [node, sources]) => ({
        ...dependencies,
        [node]: [...sources],
      }),
      {},
    ),
    schedulerPolicy: "same-pass acyclic edges; patch-node-order cycle-closing edges read stored outputs",
    soemdspMapping: nodeGraphSoemdspRuntimeMapping(plan),
    soemdspRuntimeSketch: nodeGraphSoemdspRuntimeSketch(plan),
    speakerOutputActive: Boolean(plan.speakerOutputActive),
    stateReadCount: nodeGraphStateReadCount(plan),
    valid: plan.valid,
    visualSinkCount: (plan.visualSinks || []).length,
    visualSinks: plan.visualSinks || [],
    wireReads: nodeGraphExecutionWireReads(plan),
  };
}

function installNodeGraphDebugApi() {
  window.soemdspSandboxDebug = Object.freeze({
    compileExecutionPlan(patch = nodeGraphMvp.patch) {
      return serializeNodeGraphExecutionPlanApiDebug(compileValidatedNodeGraphExecutionPlan(patch));
    },
    currentPatchFingerprint() {
      return nodeGraphPatchFingerprint();
    },
    lastRender() {
      return nodeGraphLastRenderDebug();
    },
    live() {
      return nodeGraphLiveDebug();
    },
    async startMockInput(options = {}) {
      return startNodeGraphMockInput(options);
    },
    stopMockInput() {
      stopNodeGraphMockInput();
      return nodeGraphLiveDebug();
    },
    soemdspMapping(patch = nodeGraphMvp.patch) {
      return nodeGraphSoemdspRuntimeMapping(compileValidatedNodeGraphExecutionPlan(patch));
    },
    soemdspRuntimeSketch(patch = nodeGraphMvp.patch) {
      return nodeGraphSoemdspRuntimeSketch(compileValidatedNodeGraphExecutionPlan(patch));
    },
  });
}

async function startNodeGraphMockInputDebug(options = {}) {
  document.documentElement.dataset.soemdspMockInput = "starting";
  document.documentElement.dataset.soemdspMockInputError = "";
  try {
    await startNodeGraphMockInput(options);
    await new Promise((resolve) => setTimeout(resolve, 250));
    document.documentElement.dataset.soemdspMockInput = "running";
    document.documentElement.dataset.soemdspMockInputMeter =
      document.getElementById("nodeLiveInputMeter")?.textContent || "";
  } catch (error) {
    document.documentElement.dataset.soemdspMockInput = "error";
    document.documentElement.dataset.soemdspMockInputError = error?.message || String(error);
  }
}

function stopNodeGraphMockInputDebug() {
  stopNodeGraphMockInput();
  document.documentElement.dataset.soemdspMockInput = "stopped";
  document.documentElement.dataset.soemdspMockInputMeter =
    document.getElementById("nodeLiveInputMeter")?.textContent || "";
}
