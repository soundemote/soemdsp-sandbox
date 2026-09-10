function nodeGraphLiveDebug() {
  return {
    evidence: nodeGraphMvp.live.lastEvidence,
    hasContext: Boolean(nodeGraphMvp.live.context),
    hasNode: Boolean(nodeGraphMvp.live.node),
    inputMeter: document.getElementById("nodeLiveInputMeter")?.textContent || "",
    meter: document.getElementById("nodeLiveMeter")?.textContent || "",
    outputEnabled: Boolean(nodeGraphMvp.live.outputEnabled),
    outputToggleSerial: nodeGraphMvp.live.outputToggleSerial,
    contextState: nodeGraphMvp.live.context?.state || "",
    planStatus: document.getElementById("nodeLivePlanStatus")?.textContent || "",
    routeStatus: document.getElementById("nodeLiveRouteStatus")?.textContent || "",
    status: document.getElementById("nodeLiveStatus")?.textContent || "",
  };
}

function nodeGraphLivePlanStatusText(plan, serial = nodeGraphMvp.live.planSerial) {
  const serialText = serial ? ` #${serial}` : "";
  const feedbackCount = nodeGraphStateReadCount(plan);
  const feedbackText = feedbackCount ? ` / ${nodeGraphStateReadText(feedbackCount)}` : "";
  const fingerprintText = plan.patchFingerprint ? ` / fp ${plan.patchFingerprint}` : "";
  const visualText = (plan.visualSinks || []).length ? ` / ${(plan.visualSinks || []).length} visual` : "";
  const routeText = plan.speakerOutputActive ? "" : visualText ? " / visual-only" : "";
  // Phase E: show slim vs combined (+ fetched KiB when available).
  let wasmText = "";
  try {
    const mode = typeof nodeGraphLiveGetNativeWasmLoadMode === "function"
      ? nodeGraphLiveGetNativeWasmLoadMode()
      : (typeof nodeGraphLiveNativeWasmLoadModeResolved !== "undefined"
        ? nodeGraphLiveNativeWasmLoadModeResolved
        : "");
    if (mode === "slim" || mode === "combined") {
      wasmText = ` / wasm ${mode}`;
      if (typeof nodeGraphLiveNativeWasmFetchReport === "function") {
        const rep = nodeGraphLiveNativeWasmFetchReport();
        if (rep && Number(rep.totalKiB) > 0) {
          wasmText += ` ${rep.totalKiB}KiB`;
        }
      }
    }
  } catch (_e) { /* ignore */ }
  return `plan${serialText} ${plan.nodes.length} nodes / ${plan.connections.length} wires / ${plan.modulations.length} mods${visualText}${routeText}${feedbackText}${fingerprintText}${wasmText}`;
}

function nodeGraphLiveBlockedStatusText(kind, error) {
  const issues = Array.isArray(error?.issues) && error.issues.length
    ? error.issues
    : [error?.message || "unknown issue"];
  return `${kind} blocked ${issues.length} ${issues.length === 1 ? "issue" : "issues"}`;
}

function nodeGraphLivePlanScheduleTitle(order = []) {
  return order.length
    ? `worklet order: ${order.join(" -> ")}`
    : "";
}

function nodeGraphLivePlanSentStatusText(serial = nodeGraphMvp.live.planSerial) {
  const serialText = serial ? ` #${serial}` : "";
  return `plan${serialText} sent`;
}

function nodeGraphLivePlanEvidenceDetails(plan, details = {}) {
  return {
    connectionCount: plan.connections.length,
    feedbackConnectionCount: plan.feedbackConnections.length,
    feedbackModulationCount: plan.feedbackModulations.length,
    feedbackModulations: plan.feedbackModulations.map((modulation) =>
      `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
    ),
    feedbackSignals: plan.feedbackConnections.map((connection) =>
      `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
    ),
    modulationCount: plan.modulations.length,
    nodeCount: plan.nodes.length,
    patchFingerprint: plan.patchFingerprint,
    speakerOutputActive: Boolean(plan.speakerOutputActive),
    stateReadCount: nodeGraphStateReadCount(plan),
    visualSinkCount: (plan.visualSinks || []).length,
    visualSinks: (plan.visualSinks || []).map((sink) => ({
      ...sink,
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
    ...details,
  };
}

function nodeGraphLiveParameterCount(nodes = []) {
  return (nodes || []).reduce(
    (total, node) => total + Object.keys(node.params || {}).length,
    0,
  );
}

function nodeGraphLiveParametersSentStatusText(nodes = [], serial = nodeGraphMvp.live.planSerial) {
  const serialText = serial ? ` #${serial}` : "";
  return `params${serialText} sent ${nodes.length} nodes / ${nodeGraphLiveParameterCount(nodes)} params`;
}

function nodeGraphLiveParametersAppliedStatusText(message) {
  const serial = nodeGraphFiniteNumber(message.planSerial);
  const serialText = serial ? ` #${serial}` : "";
  const fingerprintText = message.patchFingerprint ? ` / fp ${message.patchFingerprint}` : "";
  return `params${serialText} ${nodeGraphFiniteNumber(message.nodeCount)} nodes / ${nodeGraphFiniteNumber(message.parameterCount)} params${fingerprintText}`;
}

function nodeGraphLivePlanAppliedStatusText(message) {
  const serial = nodeGraphFiniteNumber(message.planSerial);
  const serialText = serial ? ` #${serial}` : "";
  const feedbackCount = (nodeGraphFiniteNumber(message.feedbackConnectionCount)) +
    (nodeGraphFiniteNumber(message.feedbackModulationCount));
  const feedbackText = feedbackCount ? ` / ${nodeGraphStateReadText(feedbackCount)}` : "";
  const oversamplingRatio = nodeGraphFiniteNumber(message.oversamplingRatio, 1);
  const oversamplingText = oversamplingRatio > 1
    ? ` / ${nodeGraphFormatOversamplingRatio(oversamplingRatio)} live`
    : "";
  const fingerprintText = message.patchFingerprint ? ` / fp ${message.patchFingerprint}` : "";
  const visualText = Number(message.visualSinkCount) ? ` / ${Number(message.visualSinkCount)} visual` : "";
  const routeText = message.speakerOutputActive ? "" : visualText ? " / visual-only" : "";
  return `plan${serialText} ${nodeGraphFiniteNumber(message.nodeCount)} nodes / ${nodeGraphFiniteNumber(message.connectionCount)} wires / ${nodeGraphFiniteNumber(message.modulationCount)} mods${visualText}${routeText}${feedbackText}${oversamplingText}${fingerprintText}`;
}
