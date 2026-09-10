function setNodeGraphLiveEvidence(kind = "idle", details = {}) {
  const planEvidence = nodeGraphMvp.live.planEvidence || {};
  const patchFingerprint = String(details.patchFingerprint || "");
  const currentPatchFingerprint = nodeGraphPatchFingerprint();
  nodeGraphMvp.live.lastEvidence = {
    active: Boolean(nodeGraphMvp.live.node || nodeGraphMvp.live.context),
    connectionCount: nodeGraphFiniteNumber(details.connectionCount ?? planEvidence.connectionCount),
    currentPatchFingerprint,
    engine: nodeGraphMvp.live.usesWorklet ? "worklet" : nodeGraphMvp.live.runtime ? "fallback" : "idle",
    engineSampleRate: nodeGraphFiniteNumber(details.engineSampleRate ?? planEvidence.engineSampleRate),
    feedbackConnectionCount: nodeGraphFiniteNumber(details.feedbackConnectionCount ?? planEvidence.feedbackConnectionCount),
    feedbackModulationCount: nodeGraphFiniteNumber(details.feedbackModulationCount ?? planEvidence.feedbackModulationCount),
    feedbackModulations: [
      ...(details.feedbackModulations || planEvidence.feedbackModulations || []),
    ],
    feedbackSignals: [
      ...(details.feedbackSignals || planEvidence.feedbackSignals || []),
    ],
    kind,
    matchesCurrentPatch: patchFingerprint ? patchFingerprint === currentPatchFingerprint : false,
    message: String(details.message || ""),
    issues: Array.isArray(details.issues) ? details.issues.map((issue) => String(issue)) : [],
    stack: String(details.stack || ""),
    action: String(details.action || ""),
    modulationCount: nodeGraphFiniteNumber(details.modulationCount ?? planEvidence.modulationCount),
    nodeCount: nodeGraphFiniteNumber(details.nodeCount ?? planEvidence.nodeCount),
    oversamplingRatio: nodeGraphFiniteNumber(details.oversamplingRatio ?? planEvidence.oversamplingRatio, 1),
    parameterCount: nodeGraphFiniteNumber(details.parameterCount),
    patchFingerprint,
    planSerial: nodeGraphFiniteNumber(details.planSerial, nodeGraphFiniteNumber(nodeGraphMvp.live.planSerial, 0)),
    sampleRate: nodeGraphFiniteNumber(details.sampleRate ?? planEvidence.sampleRate),
    sessionId: nodeGraphMvp.live.sessionId,
    speakerOutputActive: Boolean(details.speakerOutputActive ?? planEvidence.speakerOutputActive),
    stateReadCount: nodeGraphFiniteNumber(details.stateReadCount ?? planEvidence.stateReadCount),
    visualControls: {
      ...(planEvidence.visualControls || {}),
      ...(details.visualControls || {}),
    },
    visualSinkCount: nodeGraphFiniteNumber(details.visualSinkCount ?? planEvidence.visualSinkCount),
    visualSinks: (details.visualSinks || planEvidence.visualSinks || []).map((sink) => ({
      ...sink,
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
  };
}

function nodeGraphBadValueMonitorEnabled() {
  return Boolean(nodeGraphMvp.badValueMonitor?.enabled);
}

function nodeGraphBadValueMonitorEvents() {
  return Array.isArray(nodeGraphMvp.badValueMonitor?.events)
    ? nodeGraphMvp.badValueMonitor.events
    : [];
}

function renderNodeGraphBadValueMonitorEvidence() {
  const monitor = nodeGraphMvp.badValueMonitor || { enabled: false, events: [] };
  const button = document.getElementById("nodeBadValueMonitorButton");
  const status = document.getElementById("nodeBadValueMonitorStatus");
  const list = document.getElementById("nodeBadValueMonitorEvidence");
  const events = nodeGraphBadValueMonitorEvents();
  if (button) {
    button.setAttribute("aria-pressed", String(Boolean(monitor.enabled)));
    button.textContent = monitor.enabled ? "BADVAL Armed" : "BADVAL Monitor";
  }
  if (status) {
    status.textContent = events.length
      ? `badval ${events.length}`
      : monitor.enabled
        ? "badval armed"
        : "badval off";
    status.className = `pill ${events.length ? "warn" : monitor.enabled ? "good" : ""}`.trim();
  }
  if (!list) {
    return;
  }
  list.replaceChildren();
  if (!monitor.enabled && !events.length) {
    const item = document.createElement("li");
    item.textContent = "monitor off";
    list.append(item);
    return;
  }
  if (!events.length) {
    const item = document.createElement("li");
    item.textContent = "armed; no bad values observed";
    list.append(item);
    return;
  }
  for (const event of events.slice(-8).reverse()) {
    const item = document.createElement("li");
    item.dataset.badValueReason = event.reason || "bad";
    item.textContent = [
      `#${event.serial}`,
      event.engine || "engine",
      event.nodeId ? `node ${event.nodeId}` : "",
      event.source || "dsp",
      event.reason || "bad",
      event.count > 1 ? `x${event.count}` : "",
    ].filter(Boolean).join(" / ");
    list.append(item);
  }
}

function setNodeGraphBadValueMonitorEnabled(enabled) {
  nodeGraphMvp.badValueMonitor = {
    enabled: Boolean(enabled),
    events: [],
    serial: 0,
  };
  renderNodeGraphBadValueMonitorEvidence();
}

function toggleNodeGraphBadValueMonitor() {
  setNodeGraphBadValueMonitorEnabled(!nodeGraphBadValueMonitorEnabled());
}

function nodeGraphRecordBadValueEvent(details = {}) {
  if (!nodeGraphBadValueMonitorEnabled() && !details.force) {
    return;
  }
  const monitor = nodeGraphMvp.badValueMonitor;
  // Ensure map exists even when the global panel was never armed.
  if (!monitor) {
    nodeGraphMvp.badValueMonitor = { enabled: false, events: [], serial: 0 };
  }
  const store = nodeGraphMvp.badValueMonitor;
  store.serial = (store.serial || 0) + 1;
  const nodeId = String(details.nodeId || "");
  const reason = String(details.reason || "bad");
  const count = Math.max(1, nodeGraphFiniteNumber(details.count, 1));
  store.events = [
    ...nodeGraphBadValueMonitorEvents(),
    {
      count,
      engine: String(details.engine || (nodeGraphMvp.live.usesWorklet ? "worklet" : "runtime")),
      nodeId,
      reason,
      serial: store.serial,
      source: String(details.source || "dsp"),
    },
  ].slice(-24);
  renderNodeGraphBadValueMonitorEvidence();
  // Module face: light the BADVAL Monitor panel when that node tripped.
  if (nodeId && typeof recordNodeGraphBadvalModuleHit === "function") {
    recordNodeGraphBadvalModuleHit(nodeId, reason, { count });
  }
}

function setNodeGraphLiveBlockedError(kind, error, options = {}) {
  const message = error?.message || "unknown issue";
  const issues = Array.isArray(error?.issues) && error.issues.length
    ? error.issues.map((issue) => String(issue))
    : [message];
  const action = options.preservePreviousPlan
    ? "previous live plan preserved"
    : "live plan stopped";
  const detail = [
    `${kind} blocked: ${message}`,
    action,
    ...issues.map((issue) => `- ${issue}`),
  ].filter(Boolean).join("\n");
  setNodeGraphLiveEvidence(`${kind}-blocked`, {
    action,
    issues,
    message,
    patchFingerprint: nodeGraphPatchFingerprint(),
    stack: String(error?.stack || ""),
  });
  setNodeGraphLivePlanStatus(nodeGraphLiveBlockedStatusText(kind, error), "warn");
  setNodeGraphLivePlanTitle(detail);
  setNodeGraphLiveInputMeter();
  setNodeGraphLiveMeter();
  if (options.schedule !== false) {
    const scheduleText = options.preservePreviousPlan
      ? `schedule blocked; previous plan preserved: ${message}`
      : `schedule blocked: ${message}`;
    setNodeGraphLiveScheduleStatus(scheduleText, "warn");
  }
  setNodeGraphLiveStatus("error", "warn");
  document.getElementById("nodeLiveStatus").title = detail;
  renderNodeGraphLiveControls(Boolean(nodeGraphMvp.live.node));
}
