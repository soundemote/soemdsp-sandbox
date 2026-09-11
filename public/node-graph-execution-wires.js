function nodeGraphFeedbackText(feedbackConnections = [], feedbackModulations = []) {
  const signal = feedbackConnections.map((connection) =>
    `${nodeGraphNodeDisplayName(connection.sourceNode)}.${connection.sourcePort} -> ` +
    `${nodeGraphNodeDisplayName(connection.destinationNode)}.${connection.destinationPort}`,
  );
  const modulation = feedbackModulations.map((modulation) =>
    `${nodeGraphNodeDisplayName(modulation.sourceNode)}.${modulation.sourcePort} -> ` +
    `${nodeGraphNodeDisplayName(modulation.destinationNode)}.${modulation.destinationParam} mod`,
  );
  return [...signal, ...modulation].join(", ");
}

function nodeGraphSignalWireIdentity(connection) {
  return [
    connection.sourceNode,
    connection.sourcePort,
    connection.destinationNode,
    connection.destinationPort,
  ].join(".");
}

function nodeGraphModulationWireIdentity(modulation) {
  return [
    modulation.sourceNode,
    modulation.sourcePort,
    modulation.destinationNode,
    modulation.destinationParam,
  ].join(".");
}

function nodeGraphGraphWireIdentity(connection) {
  return [
    connection.sourceNode,
    connection.sourcePort,
    connection.destinationNode,
    connection.destinationGraphInput,
  ].join(".");
}

function nodeGraphFeedbackIdentitySets(plan) {
  return {
    graph: new Set((plan.feedbackGraphConnections || []).map(nodeGraphGraphWireIdentity)),
    modulation: new Set(plan.feedbackModulations.map(nodeGraphModulationWireIdentity)),
    signal: new Set(plan.feedbackConnections.map(nodeGraphSignalWireIdentity)),
  };
}

function nodeGraphActiveNodeIds(plan) {
  return new Set(plan.reachableNodes || plan.order || []);
}

function nodeGraphPlanBypassedNodeIds(plan) {
  return new Set(plan.bypassedNodes || []);
}

function nodeGraphNodeDisplaysBypassed(nodeId, plan = null) {
  if (nodeId === "output") {
    return !nodeGraphMvp.live.outputEnabled;
  }
  const bypassedNodes = plan
    ? nodeGraphPlanBypassedNodeIds(plan)
    : nodeGraphBypassedNodeIds(nodeGraphMvp.patch);
  return bypassedNodes.has(nodeId);
}

function nodeGraphWireTouchesBypassed(wire, plan) {
  const bypassedNodeIds = nodeGraphPlanBypassedNodeIds(plan);
  return bypassedNodeIds.has(wire.sourceNode) || bypassedNodeIds.has(wire.destinationNode);
}

/** True when a node should count as "live" for cable paint (not dashed). */
function nodeGraphWireNodeCountsAsActive(nodeId, activeNodeIds) {
  const id = String(nodeId || "");
  if (!id) {
    return false;
  }
  if (activeNodeIds?.has?.(id)) {
    return true;
  }
  // Layout-only shells (Metamodule) are not in the audio reachability set but
  // still take real cables — treat as active for paint.
  const type = typeof nodeGraphPatchNodeType === "function"
    ? nodeGraphPatchNodeType(id)
    : "";
  const def = typeof nodeGraphModuleDefinitions === "object"
    ? nodeGraphModuleDefinitions[type]
    : null;
  if (def?.layoutOnly) {
    return Boolean(
      typeof nodeGraphMvp !== "undefined"
      && nodeGraphMvp?.activeNodes instanceof Set
      && nodeGraphMvp.activeNodes.has(id),
    );
  }
  return false;
}

function nodeGraphSignalConnectionIsActive(connection, activeNodeIds) {
  return nodeGraphWireNodeCountsAsActive(connection.sourceNode, activeNodeIds)
    && nodeGraphWireNodeCountsAsActive(connection.destinationNode, activeNodeIds);
}

function nodeGraphModulationIsActive(modulation, activeNodeIds) {
  return activeNodeIds.has(modulation.sourceNode) && activeNodeIds.has(modulation.destinationNode);
}

function nodeGraphGraphConnectionIsActive(connection, activeNodeIds) {
  return activeNodeIds.has(connection.sourceNode) && activeNodeIds.has(connection.destinationNode);
}

function nodeGraphActiveSignalConnections(plan) {
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  return (plan.connections || []).filter((connection) =>
    nodeGraphSignalConnectionIsActive(connection, activeNodeIds),
  );
}

function nodeGraphActiveModulations(plan) {
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  return (plan.modulations || []).filter((modulation) =>
    nodeGraphModulationIsActive(modulation, activeNodeIds),
  );
}

function nodeGraphActiveGraphConnections(plan) {
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  return (plan.graphConnections || []).filter((connection) =>
    nodeGraphGraphConnectionIsActive(connection, activeNodeIds),
  );
}

function nodeGraphInactiveWireReads(plan) {
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  return {
    modulations: (plan.modulations || [])
      .filter((modulation) => !nodeGraphModulationIsActive(modulation, activeNodeIds))
      .map((modulation) => ({
        destination: `${modulation.destinationNode}.${modulation.destinationParam}`,
        reason: nodeGraphWireTouchesBypassed(modulation, plan) ? "bypassed" : "inactive",
        source: `${modulation.sourceNode}.${modulation.sourcePort}`,
      })),
    signals: (plan.connections || [])
      .filter((connection) => !nodeGraphSignalConnectionIsActive(connection, activeNodeIds))
      .map((connection) => ({
        destination: `${connection.destinationNode}.${connection.destinationPort}`,
        reason: nodeGraphWireTouchesBypassed(connection, plan) ? "bypassed" : "inactive",
        source: `${connection.sourceNode}.${connection.sourcePort}`,
      })),
  };
}

function nodeGraphExecutionWireReads(plan) {
  const feedbackSets = nodeGraphFeedbackIdentitySets(plan);
  return {
    modulations: nodeGraphActiveModulations(plan).map((modulation) => ({
      destination: `${modulation.destinationNode}.${modulation.destinationParam}`,
      mode: feedbackSets.modulation.has(nodeGraphModulationWireIdentity(modulation))
        ? "state-read"
        : "same-pass",
      source: `${modulation.sourceNode}.${modulation.sourcePort}`,
    })),
    signals: nodeGraphActiveSignalConnections(plan).map((connection) => ({
      destination: `${connection.destinationNode}.${connection.destinationPort}`,
      mode: feedbackSets.signal.has(nodeGraphSignalWireIdentity(connection))
        ? "state-read"
        : "same-pass",
      source: `${connection.sourceNode}.${connection.sourcePort}`,
    })),
  };
}

function nodeGraphExecutionWireRows(plan) {
  const feedbackSets = nodeGraphFeedbackIdentitySets(plan);
  const activeNodeIds = nodeGraphActiveNodeIds(plan);
  return [
    ...(plan.connections || []).map((connection, index) => {
      const isActive = nodeGraphSignalConnectionIsActive(connection, activeNodeIds);
      const isBypassed = nodeGraphWireTouchesBypassed(connection, plan);
      const isFeedback = feedbackSets.signal.has(nodeGraphSignalWireIdentity(connection));
      return {
        destination: `${connection.destinationNode}.${connection.destinationPort}`,
        index,
        kind: "signal",
        mode: isBypassed ? "bypassed" : !isActive ? "inactive" : isFeedback ? "state-read" : "same-pass",
        source: `${connection.sourceNode}.${connection.sourcePort}`,
      };
    }),
    ...(plan.modulations || []).map((modulation, index) => {
      const isActive = nodeGraphModulationIsActive(modulation, activeNodeIds);
      const isBypassed = nodeGraphWireTouchesBypassed(modulation, plan);
      const isFeedback = feedbackSets.modulation.has(nodeGraphModulationWireIdentity(modulation));
      return {
        destination: `${modulation.destinationNode}.${modulation.destinationParam}`,
        index,
        kind: "modulation",
        mode: isBypassed ? "bypassed" : !isActive ? "inactive" : isFeedback ? "state-read" : "same-pass",
        source: `${modulation.sourceNode}.${modulation.sourcePort}`,
      };
    }),
  ];
}
