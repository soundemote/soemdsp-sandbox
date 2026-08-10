function setNodeGraphScriptStatus(message, ok = true) {
  const status = document.getElementById("nodeScriptStatus");
  if (status) {
    status.textContent = message;
    status.className = `pill ${ok ? "good" : "warn"}`;
  }
  // View Script page removed — surface status on the interaction help strip.
  if (typeof setNodeInteractionHelp === "function" && message) {
    setNodeInteractionHelp(String(message));
  }
}

/** @deprecated View Script page removed; kept as a no-op status helper. */
function syncNodeGraphScriptView(message = "script synced", ok = true) {
  nodeGraphMvp.scriptDirty = false;
  setNodeGraphScriptStatus(message, ok);
}

function nodeGraphPatchScriptStatus(message = "script synced", ok = true) {
  if (!ok) {
    return { message, ok };
  }
  const plan = compileNodeGraphExecutionPlan();
  return plan.valid
    ? { message, ok: true }
    : { message: `${message}; schedule blocked`, ok: false };
}

function commitNodeGraphScript(text) {
  try {
    commitNodeGraphPatch(loadNodeGraphPatchFromScript(text), {
      status: "script synced",
    });
    nodeGraphMvp.scriptDirty = false;
    clearNodeGraphScriptBlockedActions();
    return true;
  } catch (error) {
    nodeGraphMvp.scriptDirty = true;
    setNodeGraphScriptStatus(error.message, false);
    return false;
  }
}

function clearNodeGraphScriptCommitTimer() {
  if (!nodeGraphMvp.scriptCommitTimer) {
    return;
  }
  window.clearTimeout(nodeGraphMvp.scriptCommitTimer);
  nodeGraphMvp.scriptCommitTimer = 0;
}

function scheduleNodeGraphScriptCommit(text) {
  clearNodeGraphScriptCommitTimer();
  nodeGraphMvp.scriptDirty = true;
  setNodeGraphScriptStatus("script editing", true);
  nodeGraphMvp.scriptCommitTimer = window.setTimeout(() => {
    nodeGraphMvp.scriptCommitTimer = 0;
    commitNodeGraphScript(text);
  }, nodeGraphMvp.scriptCommitDelayMs);
}

function flushNodeGraphScriptCommit() {
  if (!nodeGraphMvp.scriptCommitTimer) {
    return !nodeGraphMvp.scriptDirty;
  }
  clearNodeGraphScriptCommitTimer();
  // No live textarea editor — pending timer commits already ran or are cancelled.
  nodeGraphMvp.scriptDirty = false;
  return true;
}

function nodeGraphScriptReadyForGraphAction(action = "graph action") {
  if (flushNodeGraphScriptCommit()) {
    return true;
  }
  setNodeGraphScriptStatus(`Fix script before ${action}`, false);
  return false;
}

function markNodeGraphRenderScriptBlocked() {
  const renderStatus = document.getElementById("nodeGraphRenderStatus");
  renderStatus.textContent = "render blocked";
  renderStatus.className = "pill warn";
  clearNodeGraphRenderedAudioElement();
  labelPrimaryAudioTitle("Fix script before rendering", false);
}

function markNodeGraphLiveScriptBlocked() {
  const message = "fix script before live audio";
  setNodeGraphLiveEvidence("script-blocked", {
    message,
    patchFingerprint: nodeGraphPatchFingerprint(),
  });
  setNodeGraphLiveStatus("error", "warn");
  setNodeGraphLivePlanStatus("plan blocked", "warn");
  setNodeGraphLivePlanTitle(message);
  setNodeGraphLiveScheduleStatus(`schedule blocked: ${message}`, "warn");
  document.getElementById("nodeLiveStatus").title = message;
  renderNodeGraphLiveControls(false);
}

function clearNodeGraphRenderScriptBlock() {
  const renderStatus = document.getElementById("nodeGraphRenderStatus");
  if (renderStatus?.textContent === "render blocked") {
    markNodeGraphRenderPending();
  }
}

function clearNodeGraphLiveScriptBlock() {
  const liveStatus = document.getElementById("nodeLiveStatus");
  const livePlanStatus = document.getElementById("nodeLivePlanStatus");
  const liveScheduleStatus = document.getElementById("nodeLiveRouteStatus");
  if (
    liveStatus?.textContent === "error" &&
    livePlanStatus?.textContent === "plan blocked" &&
    liveScheduleStatus?.textContent === "schedule blocked: fix script before live audio"
  ) {
    setNodeGraphLiveStatus("stopped");
    setNodeGraphLiveEvidence("stopped");
    setNodeGraphLivePlanStatus();
    setNodeGraphLivePlanTitle();
    setNodeGraphLiveScheduleStatus("schedule stopped");
    clearNodeGraphLiveStatusTitle();
    renderNodeGraphLiveControls(false);
  }
}

function clearNodeGraphScriptBlockedActions() {
  clearNodeGraphRenderScriptBlock();
  clearNodeGraphLiveScriptBlock();
}
